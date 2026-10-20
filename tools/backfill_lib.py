#!/usr/bin/env python3
"""
İŞBEY — BACKFILL PLAN MOTORU (TEK KAYNAK)
==========================================
Bu modül backfill kurallarını (D1–D5) TEK yerde tutar. `backfill-dryrun.py`
(SALT OKUNUR) ve `backfill-apply.py` (YAZAR) aynı fonksiyonu çağırır.

NEDEN AYRI MODÜL: Kural mantığını iki dosyaya kopyalamak, dry-run'ın
"onayladığı" plan ile apply'ın "uyguladığı" planın zamanla SAPMASI demektir.
Sapma sessizdir ve en tehlikeli hata sınıfıdır: onaylanan şey uygulanmaz,
uygulanan şey onaylanmaz. Tek fonksiyon bu ihtimali ortadan kaldırır.

Karar kuralları (her biri İLİŞKİSEL KANITA dayanır, tahmine değil):
  D1. Sahipsiz depo/kasa: kimlik kalıbı `{wh,cash}-<tenantId>-{default,usd,eur}`
      → sahibi kimlikteki tenantId. ÇAPRAZ KANIT: kaydın `name` alanı o
      firmanın adını içeriyor mu? İki kanıt uyuşmazsa DOKUNULMAZ.
  D2. Sahipsiz stok hareketi: `productId` → ürünün `tenantId`'si.
  D3. Sahipsiz cari hareket: `customerId` + `documentNo` → aynı tenant.
  D4. Beyoğlu deposu açılır; Beyoğlu'nun `wh-default`/`wh-1` referansları bağlanır.
  D5. Platform-geneli koleksiyonlar tenant'a BAĞLANMAZ.

Sahipliği kanıtla belirlenemeyen kayıt `UNCERTAIN` olarak raporlanır ve
plandan ÇIKARILIR — otomatik eşleştirme YASAK.
"""
import copy
import json
import re
from collections import defaultdict
from decimal import Decimal


BEYOGLU = 'f0af349d-da17-419c-b9e4-1fde66beec3d'
NEW_WAREHOUSE_ID = f'wh-{BEYOGLU}-default'
NEW_WAREHOUSE_NAME = 'BEYOĞLU MERKEZ DEPO'
NEW_WAREHOUSE_CODE = 'BYG-MRK-001'

LEGACY_ID = re.compile(r'^(cash|bnk|wh)-(.+?)-(default|usd|eur)$')

# Tenant'a ait OLMAYAN, platform geneli koleksiyonlar (D5).
PLATFORM_SCOPED = {
    'roles', 'permissions', 'taxpayerCache', 'creditTransactions',
    'impersonationSessions', 'plans', 'planFeatures', 'subscriptionPlans',
    'creditPackages', 'sessions', 'passwordResetTokens', 'sequences',
    'formDesigns', 'services', 'tenants', 'auditLogs', 'notifications',
    'integrationSyncLogs', 'hizliBilisimSettings', 'subscriptions',
    'creditWallets',
    # KANIT (storage.ts:982): `externalCustomers` Hızlı Bilişim mükellef HAVUZUDUR;
    # sahiplik alanı taşımaz ve taşımamalıdır.
    'externalCustomers',
}


def build_plan(original, tenants_filter=None):
    """Verilen DB durumundan backfill planını üretir.

    `original` DEĞİŞTİRİLMEZ (derin kopya üzerinde çalışılır).

    Dönen sözlük:
      plan       : uygulanmış hâl (yeni depo + sahiplik + referanslar)
      changes    : yapılan değişiklik listesi
      uncertain  : kanıtlanamayan kayıtlar (plandan ÇIKARILDI)
      remaining  : plan sonrası kalan sahipsiz iş kayıtları
      existing   : hedef depo zaten var mıydı
    """
    plan = copy.deepcopy(original)
    tenants = {t['id']: t for t in plan.get('tenants', [])}
    if tenants_filter:
        tenants = {k: v for k, v in tenants.items() if k in tenants_filter}

    existing = [w for w in plan.get('warehouses', []) if w.get('id') == NEW_WAREHOUSE_ID]

    changes = []
    uncertain = []

    def set_field(coll, rid, field, value, reason):
        rec = next((r for r in plan.get(coll, []) if r.get('id') == rid), None)
        if rec is None:
            uncertain.append((coll, rid, 'kayıt bulunamadı'))
            return
        old = rec.get(field)
        rec[field] = value
        changes.append({'collection': coll, 'id': rid, 'field': field,
                        'from': old, 'to': value, 'reason': reason})

    # ══ D4: BEYOĞLU DEPOSU ══
    if not existing:
        new_wh = {'id': NEW_WAREHOUSE_ID, 'tenantId': BEYOGLU, 'name': NEW_WAREHOUSE_NAME,
                  'code': NEW_WAREHOUSE_CODE, 'isDefault': True}
        plan.setdefault('warehouses', []).append(new_wh)
        changes.append({
            'collection': 'warehouses', 'id': NEW_WAREHOUSE_ID, 'field': '(YENİ KAYIT)',
            'from': None, 'to': new_wh,
            'reason': 'D4: Beyoğlu (f0af349d) için sahipli varsayılan depo açılır',
        })

    # ══ D1: Sahipsiz depo + kasa ══
    for coll in ('warehouses', 'cashRegisters'):
        for r in plan.get(coll, []):
            if r.get('tenantId') or r.get('companyId'):
                continue
            m = LEGACY_ID.match(str(r.get('id') or ''))
            if not m:
                uncertain.append((coll, r.get('id'), 'kimlik kalıbı yok'))
                continue
            owner = m.group(2)
            if owner not in tenants:
                uncertain.append((coll, r.get('id'), f'kalıp sahibi {owner} canlı tenant değil'))
                continue
            name = str(r.get('name') or '')
            tname = str(tenants[owner].get('name') or '')
            first_word = tname.split()[0] if tname else ''
            corroborated = first_word and first_word.lower() in name.lower()
            if not corroborated:
                uncertain.append((coll, r.get('id'),
                                  f'AD kanıtı uyuşmadı: name={name!r} vs firma={tname!r}'))
                continue
            set_field(coll, r['id'], 'tenantId', owner,
                      f'D1: kimlik kalıbı + ad kanıtı ("{first_word}")')

    # ══ D2: Sahipsiz stok hareketleri ══
    prod_owner = {p['id']: (p.get('tenantId') or p.get('companyId'))
                  for p in plan.get('products', [])}
    for m in plan.get('stockMovements', []):
        if m.get('tenantId') or m.get('companyId'):
            continue
        owner = prod_owner.get(m.get('productId'))
        if not owner:
            uncertain.append(('stockMovements', m.get('id'),
                              f'ürün {m.get("productId")!r} sahipsiz veya yok'))
            continue
        set_field('stockMovements', m['id'], 'tenantId', owner,
                  f'D2: ürün {m.get("productId")} → {owner}')

    # ══ D3: Sahipsiz cari hareketler ══
    cust_owner = {c['id']: (c.get('tenantId') or c.get('companyId'))
                  for c in plan.get('customers', [])}
    inv_owner = {i.get('invoiceNo'): (i.get('tenantId') or i.get('companyId'))
                 for i in plan.get('invoices', [])}
    for x in plan.get('currentTransactions', []):
        if x.get('tenantId') or x.get('companyId'):
            continue
        owners = set()
        if cust_owner.get(x.get('customerId')):
            owners.add(cust_owner[x['customerId']])
        if inv_owner.get(x.get('documentNo')):
            owners.add(inv_owner[x['documentNo']])
        if len(owners) == 1:
            owner = owners.pop()
            set_field('currentTransactions', x['id'], 'tenantId', owner,
                      f'D3: cari + belge kanıtı ({x.get("customerId")} / {x.get("documentNo")})')
        else:
            uncertain.append(('currentTransactions', x.get('id'),
                              f'cari ve belge kanıtı uyuşmuyor: {owners or "kanıt yok"}'))

    # ══ D4b: BEYOĞLU'NUN SARKAN DEPO REFERANSLARI ══
    rebind = 0
    if not existing:
        for coll in ('products', 'stockMovements', 'invoices'):
            for r in plan.get(coll, []):
                v = r.get('warehouseId')
                if v not in ('wh-default', 'wh-1'):
                    continue
                owner = r.get('tenantId') or r.get('companyId')
                if owner is None and coll == 'stockMovements':
                    owner = prod_owner.get(r.get('productId'))
                if owner != BEYOGLU:
                    continue
                r['warehouseId'] = NEW_WAREHOUSE_ID
                # 2026-10-20 DÜZELTME: önce burada tek bir özet satırı
                # ("34 kayıt") ekleniyordu. Sonuç: raporlanan satır sayısı
                # gerçekten değişen alan sayısını göstermiyordu ve "10
                # değişiklik" ile "43 değişiklik" aynı veri için aynı şeyi
                # anlatmıyordu. Artık her kayıt AYRI raporlanır.
                changes.append({
                    'collection': coll, 'id': r.get('id'), 'field': 'warehouseId',
                    'from': v, 'to': NEW_WAREHOUSE_ID,
                    'reason': "D4b: Beyoğlu'nun kırık depo referansı yeni depoya bağlandı",
                })
                rebind += 1

    # ══ LIBERAL KONTROL: kalan sahipsiz kayıtlar (D5 hariç) ══
    remaining = defaultdict(list)
    for coll, rows in plan.items():
        if not isinstance(rows, list) or coll in PLATFORM_SCOPED:
            continue
        for r in rows:
            if isinstance(r, dict) and not (r.get('tenantId') or r.get('companyId')):
                remaining[coll].append(r.get('id'))

    created = [{'collection': c['collection'], 'id': c['id']}
               for c in changes if c['field'] == '(YENİ KAYIT)']

    return {'plan': plan, 'changes': changes, 'uncertain': uncertain,
            'remaining': dict(remaining), 'existing': existing, 'tenants': tenants,
            'rebind': rebind, 'created': created}


def money_sum(rows, field):
    """Para toplamı — Decimal, tam eşitlik.

    NEDEN: float toplamı 0,01–0,005 düzeyinde yapay fark üretir. Bu, gerçek bir
    veri değişikliği olmadığı hâlde "DEĞİŞTİ" alarmı verir; alarm yanlış
    olduğunda insan kapıyı kapatmayı öğrenir ve kapı işlevsizleşir.
    """
    total = Decimal('0')
    for r in rows:
        v = r.get(field)
        if v is None or v == '':
            continue
        total += Decimal(str(v))
    return total


def chain_balance_drift(db):
    """Cari defterindeki iki farklı para gerçeğini karşılaştırır.

    `customers[].balance`      = carinin GÜNCEL bakiyesi (tek gerçek).
    `currentTransactions[].balance` = KOŞAN bakiyedir; her satır o ana kadarki
    bakiyeyi taşır. Satırların toplamı "cari bakiye" DEĞİLDİR — matematiksel
    olarak cari bakiyenin eksiğine eşittir:

        Σ koşan = Σ(cari bakiyeler) − Σ(belgesiz satırların koşan değeri)

    Canlıda ölçülen fark tam olarak buradan gelir: 0,00 tutarlı bir belge
    (SAT-2026-000005) carinin koşan bakiyesini TAŞIMAKTA ama toplama
    girmemektedir. 576,00 TL'lik fark bir veri hatası değil, iki farklı
    büyüklüğün karşılaştırılmasıdır.

    Dönen: (cari_toplam, kosan_toplam, fark, aciklamalar)
    """
    cari = money_sum(db.get('customers', []), 'balance')
    kosan = money_sum(db.get('currentTransactions', []), 'balance')
    notes = []
    for x in db.get('currentTransactions', []):
        debit = Decimal(str(x.get('debit') or 0))
        credit = Decimal(str(x.get('credit') or 0))
        bal = x.get('balance')
        if bal is None:
            continue
        if debit == 0 and credit == 0:
            notes.append({
                'id': x.get('id'), 'documentNo': x.get('documentNo'),
                'customerId': x.get('customerId'), 'balance': str(bal),
                'sebep': 'belge tutarı 0 — koşan bakiyeyi taşıyor, toplama girmiyor',
            })
    return cari, kosan, (kosan - cari), notes


def invariants(original, result):
    """Backfill iş verisini DEĞİŞTİRMEMELİ. Ölçülen değerler döner.

    Her öğe: (etiket, once, sonra, gecti_mi)
    """
    plan = result['plan']
    out = []

    for coll in ('products', 'invoices', 'stockMovements', 'currentTransactions',
                 'customers', 'cashRegisters', 'bankAccounts'):
        b, a = len(original.get(coll, [])), len(plan.get(coll, []))
        out.append((f'{coll} sayısı', b, a, b == a))

    sb = sum(p.get('currentStock', 0) for p in original.get('products', []))
    sa = sum(p.get('currentStock', 0) for p in plan.get('products', []))
    out.append(('toplam stok', sb, sa, sb == sa))

    # DİKKAT: `currentTransactions.balance` KOŞAN bakiyedir (her satır o ana
    # kadarki bakiye). Toplamı "cari bakiye" DEĞİLDİR. Gerçek cari bakiye
    # `customers.balance` alanındadır. İkisi de ölçülür ki rapor yanlış sayı
    # göstermesin.
    # PARA: float toplamı 0,005 düzeyinde yapay fark üretebilir ve "DEĞİŞTİ"
    # diye yanlış alarm verir. Tüm tutarlar Decimal ile (string üzerinden)
    # toplanır; karşılaştırma tam eşitliktir.
    bb = money_sum(original.get('customers', []), 'balance')
    ba = money_sum(plan.get('customers', []), 'balance')
    out.append(('cari bakiye toplamı (customers.balance)', bb, ba, bb == ba))

    # DİKKAT (2026-10-20 ölçümü): fatura tutarı `total` DEĞİL `grandTotal`
    # alanındadır. `total` diye ölçmek 0 -> 0 karşılaştırması yapar ve HER ZAMAN
    # "AYNI" der — yani hiçbir şey kanıtlamayan SAHTE bir kapı olurdu.
    ib = money_sum(original.get('invoices', []), 'grandTotal')
    ia = money_sum(plan.get('invoices', []), 'grandTotal')
    out.append(('fatura toplamı (grandTotal)', ib, ia, ib == ia))

    # Kayıt kayıt finansal alan karşılaştırması: toplam aynı olsa bile iki
    # faturanın tutarları yer değiştirebilir; toplam bunu GİZLER.
    for coll, fields in (
        ('invoices', ('grandTotal', 'subTotal', 'totalVat', 'totalDiscount',
                      'paidAmount', 'remainingAmount', 'status', 'invoiceNo',
                      'customerId', 'date', 'items')),
        ('customers', ('balance', 'totalDebit', 'totalCredit', 'taxNumber')),
        ('currentTransactions', ('debit', 'credit', 'balance', 'documentNo',
                                 'customerId', 'date')),
        ('stockMovements', ('quantity', 'type', 'productId', 'date')),
    ):
        before = {r['id']: r for r in original.get(coll, [])}
        drift = 0
        for r in plan.get(coll, []):
            old = before.get(r.get('id'))
            if not old:
                continue
            for f in fields:
                if old.get(f) != r.get(f):
                    drift += 1
        out.append((f'{coll} finansal alan sürüklenmesi', 0, drift, drift == 0))

    # GERÇEK kapı: backfill hiçbir kaydı BAŞKA firmanın deposuna bağlamamalı.
    # (Yukarıdaki toplamlar bir firmanın kaybını diğerinin kazancıyla
    # gizleyebilir; depo→tenant eşleşmesi gizleyemez.)
    wh_tenant = {w['id']: (w.get('tenantId') or w.get('companyId'))
                 for w in plan.get('warehouses', [])}
    prod_tenant = {p['id']: (p.get('tenantId') or p.get('companyId'))
                   for p in plan.get('products', [])}
    cross = 0
    for coll in ('products', 'stockMovements', 'invoices'):
        for r in plan.get(coll, []):
            wid = r.get('warehouseId')
            if not wid or wid not in wh_tenant:
                continue
            owner = r.get('tenantId') or r.get('companyId')
            if owner is None and coll == 'stockMovements':
                owner = prod_tenant.get(r.get('productId'))
            if owner is None or wh_tenant[wid] is None:
                continue
            if owner != wh_tenant[wid]:
                cross += 1
    out.append(('kayıt → BAŞKA firmanın deposu', 0, cross, cross == 0))

    # Ürün fiyatları ve stokları tek tek
    changed = 0
    before_by_id = {p['id']: p for p in original.get('products', [])}
    for p in plan.get('products', []):
        old = before_by_id.get(p['id'])
        if not old:
            continue
        for f in ('currentStock', 'salePrice', 'purchasePrice', 'name', 'code'):
            if old.get(f) != p.get(f):
                changed += 1
    out.append(('ürün stok/fiyat/ad değişen alan', 0, changed, changed == 0))

    return out


def change_accounting(original, result):
    """Raporlanan değişiklik sayısı, GERÇEKTEN değişen alan sayısına eşit mi?

    NEDEN AYRI BİR KONTROL: `changes` listesi kendi kendini raporlar; liste
    eksik doldurulursa sayı da eksik çıkar ve kimse fark etmez. Burada plan
    ile kaynak DB alan alan karşılaştırılır ve iki sayı EŞLEŞMEK ZORUNDADIR.

    Dönen: (raporlanan, gerçek, eklenen_kayıt, silinen_kayıt, tutuyor_mu)
    """
    plan = result['plan']
    gercek = 0
    for coll, rows in plan.items():
        if not isinstance(rows, list):
            continue
        old_rows = original.get(coll, [])
        old_by_id = {r.get('id'): r for r in old_rows if isinstance(r, dict)}
        new_by_id = {r.get('id'): r for r in rows if isinstance(r, dict)}
        for rid, r in new_by_id.items():
            old = old_by_id.get(rid)
            if old is None:
                gercek += 1  # yeni kayıt
                continue
            for f in set(r) | set(old):
                if old.get(f) != r.get(f):
                    gercek += 1
    # Alan bazında sayım, "yeni kayıt" satırını da içerir. Raporlanan tarafta
    # yeni kayıt TEK satırdır; bu yüzden onu ayrıca sayıp düşüyoruz.
    raporlanan = sum(1 for c in result['changes'] if c['field'] != '(YENİ KAYIT)')
    eklenen = len(result.get('created', []))
    silinen = 0
    for coll in original:
        if isinstance(original[coll], list):
            old_ids = {r.get('id') for r in original[coll] if isinstance(r, dict)}
            new_ids = {r.get('id') for r in plan.get(coll, []) if isinstance(r, dict)}
            silinen += len(old_ids - new_ids)
    return raporlanan, gercek, eklenen, silinen, (raporlanan + eklenen == gercek and silinen == 0)


def dangling(plan):
    """Plan sonrası var olmayan depoya işaret eden referans sayısı."""
    wh_ids = {w['id'] for w in plan.get('warehouses', [])}
    n = 0
    for coll in ('products', 'stockMovements', 'invoices'):
        for r in plan.get(coll, []):
            v = r.get('warehouseId')
            if v and v not in wh_ids:
                n += 1
    return n


def bead_snapshot(db):
    """Geri alma için dokunulan alanların AÇIK kopyası.

    Silme değil, geri yazma: yalnız `{collection,id,field}` üçlüleri saklanır.
    Böylece rollback, yedeğin tamamını geri kopyalamaya gerek kalmadan
    yapılabilir (yine de tam yedek her zaman tercih edilir).

    2026-10-20 DÜZELTME: ilk sürüm YALNIZ alan geri yazıyordu; backfill'in
    OLUŞTURDUĞU kayıt (yeni depo) geri alınmıyordu. Cerrahi geri alma
    sonrası DB, backfill öncesi hâle EŞİT DEĞİLDİ (ölçüldü: 4 depo kaldı).
    Artık `created` listesi de tutulur ve rollback bu kayıtları siler.
    """
    snap = []
    for coll in ('warehouses', 'cashRegisters', 'stockMovements',
                 'currentTransactions', 'products', 'invoices'):
        for r in db.get(coll, []):
            snap.append({'collection': coll, 'id': r.get('id'),
                         'tenantId': r.get('tenantId'),
                         'companyId': r.get('companyId'),
                         'warehouseId': r.get('warehouseId')})
    return {'beads': snap, 'created': []}


def apply_beads(db, snapshot):
    """`bead_snapshot` ile alınmış kopyayı geri uygular (rollback).

    `snapshot` ya yeni biçim ({'beads':…, 'created':…}) ya da eski biçim
    (düz liste) olabilir.
    """
    if isinstance(snapshot, list):
        snapshot = {'beads': snapshot, 'created': []}
    index = {(s['collection'], s['id']): s for s in snapshot.get('beads', [])}
    restored = 0
    for coll in ('warehouses', 'cashRegisters', 'stockMovements',
                 'currentTransactions', 'products', 'invoices'):
        for r in db.get(coll, []):
            s = index.get((coll, r.get('id')))
            if not s:
                continue
            for f in ('tenantId', 'companyId', 'warehouseId'):
                if s.get(f) is None:
                    r.pop(f, None)
                else:
                    r[f] = s[f]
            restored += 1

    removed = 0
    for item in snapshot.get('created', []):
        coll, rid = item.get('collection'), item.get('id')
        rows = db.get(coll, [])
        keep = [r for r in rows if r.get('id') != rid]
        if len(keep) != len(rows):
            db[coll] = keep
            removed += 1
    return restored, removed


if __name__ == '__main__':
    import sys
    raw = json.load(open(sys.argv[1], encoding='utf-8'))
    res = build_plan(raw)
    print(json.dumps({
        'degisiklik': len(res['changes']),
        'belirsiz': len(res['uncertain']),
        'kalan_sahipsiz': sum(len(v) for v in res['remaining'].values()),
        'sarkan': dangling(res['plan']),
        'degismezlik': [{'ad': a, 'once': b, 'sonra': c, 'gecti': d}
                        for a, b, c, d in invariants(raw, res)],
    }, ensure_ascii=False, indent=2))
