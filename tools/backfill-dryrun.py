#!/usr/bin/env python3
"""
İŞBEY — DEPO/TENANT BACKFILL DRY-RUN (SALT OKUNUR)
==================================================
Canlı `database.prod.json` kopyası üzerinde çalışır. HİÇBİR ŞEY YAZMAZ;
yalnız planlanan değişikliği hesaplar ve doğrulama sorgularını koşturur.

Kullanım:
    python3 tools/backfill-dryrun.py <girdi.json> [<cikti-onizleme.json>]

Karar kuralları (her biri İLİŞKİSEL KANITA dayanır, tahmine değil):

  D1. Sahipsiz depo/kasa: kimlik kalıbı `{wh,cash}-<tenantId>-{default,usd,eur}`
      → sahibi kimlikteki tenantId. ÇAPRAZ KANIT: kaydın `name` alanı o
      firmanın adını içeriyor mu? İki kanıt uyuşmazsa DOKUNULMAZ.

  D2. Sahipsiz stok hareketi: `productId` → ürünün `tenantId`'si.
      ÇAPRAZ KANIT: `warehouseId` aynı firmaya çözülüyor mu?

  D3. Sahipsiz cari hareket: `customerId` → carinin `tenantId`'si.
      ÇAPRAZ KANIT: `documentNo` → aynı firmaya ait fatura mı?

  D4. Beyoğlu deposu: `f0af349d-…` için yeni depo açılır; Beyoğlu'nun TÜM
      `wh-default` / `wh-1` referansları bu depoya bağlanır.

  D5. Platform-geneli koleksiyonlar (roles, permissions, taxpayerCache,
      creditTransactions, impersonationSessions…) tenant'a BAĞLANMAZ.

Sahipliği TEK kanıtla belirlenemeyen kayıt `UNCERTAIN` olarak raporlanır ve
plandan ÇIKARILIR.
"""
import json
import re
import sys
import hashlib
import copy
from collections import defaultdict

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
    # sahiplik alanı taşımaz ve taşımamalıdır. "Sahipsiz" görünmesi veri kusuru
    # DEĞİL, tasarımdır — backfill kapsamı DIŞINDADIR.
    'externalCustomers',
}


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else None

    print('=' * 74)
    print('İŞBEY BACKFILL DRY-RUN — SALT OKUNUR (hiçbir şey yazılmaz)')
    print('=' * 74)
    print(f'girdi      : {src}')
    print(f'sha256     : {sha256(src)}')

    d = json.load(open(src, encoding='utf-8'))
    plan = copy.deepcopy(d)

    tenants = {t['id']: t for t in plan.get('tenants', [])}
    print(f'tenant     : {len(tenants)}')

    # ── Ön kontrol: hedef depo zaten var mı? ──
    existing = [w for w in plan.get('warehouses', []) if w['id'] == NEW_WAREHOUSE_ID]
    if existing:
        print(f'\n!! {NEW_WAREHOUSE_ID} ZATEN VAR — yeni depo açılmayacak.')
        print('   Mevcut kayıt:', json.dumps(existing[0], ensure_ascii=False))

    changes = []
    uncertain = []

    def set_field(coll, rid, field, value, reason):
        """Değişikliği `plan`'a UYGULAR ve kaydeder (dry-run çıktısı bu yüzden
        gerçek sonucu gösterir; doğrulama sorguları uygulanmış hâli ölçer)."""
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
            # ÇAPRAZ KANIT: ad alanı firma adını içeriyor mu?
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
    # Canlıda Beyoğlu'nun TÜM belgeleri DB'de VAR OLMAYAN `wh-default` / `wh-1`
    # kimliğine işaret ediyor. Depo açıldıktan sonra yalnız Beyoğlu'na ait
    # kayıtlar yeni depoya bağlanır. Başka firmanın sarkan referansı VARSA
    # DOKUNULMAZ (o firmanın kendi depo kararı ayrı iştir).
    if not existing:
        rebind = 0
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
                rebind += 1
        changes.append({
            'collection': '(products|stockMovements|invoices)', 'id': f'{rebind} kayıt',
            'field': 'warehouseId', 'from': 'wh-default / wh-1', 'to': NEW_WAREHOUSE_ID,
            'reason': f'D4b: Beyoğlu\'nun kırık depo referansları yeni depoya bağlandı',
        })

    # ══ LIBERAL KONTROL: kalan sahipsiz kayıtlar (D5 hariç) ══
    remaining = defaultdict(list)
    for coll, rows in plan.items():
        if not isinstance(rows, list) or coll in PLATFORM_SCOPED:
            continue
        for r in rows:
            if isinstance(r, dict) and not (r.get('tenantId') or r.get('companyId')):
                remaining[coll].append(r.get('id'))

    # ── RAPOR ──
    print('\n' + '─' * 74)
    print('PLANLANAN DEĞİŞİKLİKLER')
    print('─' * 74)
    if not changes:
        print('  (yok)')
    for c in changes:
        if c['field'] == '(YENİ KAYIT)':
            print(f"  + {c['collection']:20} {c['id']}")
            print(f"      {json.dumps(c['to'], ensure_ascii=False)}")
            print(f"      {c['reason']}")
        else:
            print(f"  ~ {c['collection']:20} {c['id']:44} {c['field']} = {c['to']}")
            print(f"      {c['reason']}")

    print('\n' + '─' * 74)
    print(f'BELİRSİZ KAYITLAR (plandan ÇIKARILDI) — {len(uncertain)}')
    print('─' * 74)
    for coll, rid, why in uncertain:
        print(f"  ? {coll:22} {rid!r}")
        print(f"      {why}")
    if not uncertain:
        print('  (yok)')

    print('\n' + '─' * 74)
    print('PLAN SONRASI KALAN SAHİPSİZ İŞ KAYITLARI')
    print('─' * 74)
    if not remaining:
        print('  TEMİZ — sahipsiz iş kaydı kalmadı.')
    for coll, ids in sorted(remaining.items()):
        print(f'  {coll:24} {len(ids)}')
        for i in ids[:10]:
            print(f'       - {i}')
        if len(ids) > 10:
            print(f'       ... +{len(ids)-10}')
    print('  (D5 platform-geneli koleksiyonlar hariç tutuldu)')

    # ── SANITY: stok/cari sayıları değişmemeli ──
    print('\n' + '─' * 74)
    print('DEĞİŞMEZLİK KONTROLÜ (backfill iş verisini DEĞİŞTİRMEMELİ)')
    print('─' * 74)
    for coll in ('products', 'invoices', 'stockMovements', 'currentTransactions',
                 'customers', 'cashRegisters', 'bankAccounts'):
        b, a = len(d.get(coll, [])), len(plan.get(coll, []))
        verdict = 'AYNI' if b == a else 'DEĞİŞTİ !!'
        print(f'  {coll:22} {b:>4} -> {a:<4} {verdict}')
    sb = sum(p.get('currentStock', 0) for p in d.get('products', []))
    sa = sum(p.get('currentStock', 0) for p in plan.get('products', []))
    print(f"  {'toplam stok':22} {sb:>8} -> {sa:<8} {'AYNI' if sb == sa else 'DEĞİŞTİ !!'}")
    print(f"  {'toplam bakiye':22} {sum(x.get('balance',0) for x in d.get('currentTransactions',[])):>8.2f}"
          f" -> {sum(x.get('balance',0) for x in plan.get('currentTransactions',[])):<8.2f}")

    # ── DOĞRULAMA SORGULARI ──
    print('\n' + '─' * 74)
    print('İŞLEM SONRASI DOĞRULAMA SORGULARI')
    print('─' * 74)
    wh_ids = {w['id'] for w in plan.get('warehouses', [])}
    # Beyoğlu depo görür mü?
    bey = [w for w in plan.get('warehouses', [])
           if w.get('tenantId') == BEYOGLU or w['id'] == NEW_WAREHOUSE_ID]
    print(f'  1. Beyoğlu depo sayısı            : {len(bey)}  (beklenen >=1)')
    dang = 0
    for coll in ('products', 'stockMovements', 'invoices'):
        for r in plan.get(coll, []):
            v = r.get('warehouseId')
            if v and v not in wh_ids:
                dang += 1
    print(f'  2. Sarkan warehouseId referansı   : {dang}  (beklenen 0)')
    orphan_biz = sum(len(v) for v in remaining.values())
    print(f'  3. Sahipsiz iş kaydı              : {orphan_biz}  (beklenen 0)')
    for tid in tenants:
        n = len([w for w in plan.get('warehouses', []) if w.get('tenantId') == tid])
        print(f'  4. Depo / {tenants[tid]["name"][:28]:30}: {n}')
    print(f'  5. tnt-isbey canlıda var mı?      : '
          f'{"VAR" if "tnt-isbey" in tenants else "YOK (beklenen)"}')

    if out:
        with open(out, 'w', encoding='utf-8') as f:
            json.dump(plan, f, ensure_ascii=False, indent=2)
        print(f'\nönizleme yazıldı: {out}')
        print(f'  sha256 = {sha256(out)}')

    print('\nNOT: Bu bir DRY-RUN çıktısıdır. Canlıya HİÇBİR ŞEY yazılmadı.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
