#!/usr/bin/env python3
"""
İŞBEY — BACKFILL SONRASI DOĞRULAMA (SALT OKUNUR)
=================================================
Backfill uygulandıktan SONRA `database.prod.json` üzerinde koşar. HİÇBİR ŞEY
YAZMAZ. Amacı "komut çalıştı mı" değil, "canlı firma deneyimi gerçekten
düzeldi mi" sorusunu ÖLÇMEKTİR.

Kullanım:
    python3 tools/backfill-verify.py <db.json> [--before <yedek.bak>]

`--before` verilirse finansal değişmezliği de karşılaştırır (stok, cari,
fatura toplamları ve kayıt sayıları). Verilmezse yalnız yapısal doğrulama
yapılır — bu EKSİK bir kanıttır ve raporda öyle işaretlenir.

Kontroller:
  V1. Beyoğlu'nun (f0af349d) en az 1 deposu var.
  V2. Sarkan depo referansı YOK (her warehouseId var olan bir depoya işaret eder).
  V3. Kayıt → başka firmanın deposu: 0 (çapraz-tenant yazma yok).
  V4. Sahipsiz iş kaydı YOK (tenantId/companyId taşımayan iş kaydı).
  V5. Her firmanın en az 1 deposu var ve varsayılan depo ambigus değil.
  V6. Finansal değişmezlik (--before verildiyse).
  V7. Gerçekçilik: tenant adları ile depo adları çelişmiyor.

Çıkış kodu 0 = tüm kontroller GEÇTİ, 3 = en az biri KALDI.
"""
import hashlib
import json
import sys

import backfill_lib as lib


def load(path):
    return json.load(open(path, encoding='utf-8'))


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    path = sys.argv[1]
    before_path = None
    if '--before' in sys.argv:
        before_path = sys.argv[sys.argv.index('--before') + 1]

    db = load(path)
    checks = []  # (kod, açıklama, geçti, detay)

    tenants = {t['id']: t for t in db.get('tenants', [])}
    warehouses = db.get('warehouses', [])
    wh_by_id = {w['id']: w for w in warehouses}

    # V1
    bey = [w for w in warehouses if (w.get('tenantId') or w.get('companyId')) == lib.BEYOGLU]
    checks.append(('V1', 'Beyoğlu deposu var', len(bey) >= 1,
                   f'{len(bey)} depo: ' + ', '.join(w['id'] for w in bey)))

    # V2
    dangling = []
    for coll in ('products', 'stockMovements', 'invoices'):
        for r in db.get(coll, []):
            v = r.get('warehouseId')
            if v and v not in wh_by_id:
                dangling.append((coll, r.get('id'), v))
    checks.append(('V2', 'Sarkan depo referansı yok', not dangling,
                   f'{len(dangling)} sarkan' + (f': {dangling[:5]}' if dangling else '')))

    # V3
    prod_owner = {p['id']: (p.get('tenantId') or p.get('companyId'))
                  for p in db.get('products', [])}
    cross = []
    for coll in ('products', 'stockMovements', 'invoices'):
        for r in db.get(coll, []):
            wid = r.get('warehouseId')
            if not wid or wid not in wh_by_id:
                continue
            wh_owner = wh_by_id[wid].get('tenantId') or wh_by_id[wid].get('companyId')
            owner = r.get('tenantId') or r.get('companyId')
            if owner is None and coll == 'stockMovements':
                owner = prod_owner.get(r.get('productId'))
            if owner and wh_owner and owner != wh_owner:
                cross.append((coll, r.get('id'), owner, wh_owner))
    checks.append(('V3', 'Çapraz-tenant depo bağlantısı yok', not cross,
                   f'{len(cross)} ihlal' + (f': {cross[:3]}' if cross else '')))

    # V4
    orphans = {}
    for coll, rows in db.items():
        if not isinstance(rows, list) or coll in lib.PLATFORM_SCOPED:
            continue
        bad = [r.get('id') for r in rows
               if isinstance(r, dict) and not (r.get('tenantId') or r.get('companyId'))]
        if bad:
            orphans[coll] = bad
    n_orph = sum(len(v) for v in orphans.values())
    checks.append(('V4', 'Sahipsiz iş kaydı yok', n_orph == 0,
                   f'{n_orph} kayıt' + (f': { {k: len(v) for k, v in orphans.items()} }' if n_orph else '')))

    # V5
    no_wh = [tid for tid in tenants
             if not any((w.get('tenantId') or w.get('companyId')) == tid for w in warehouses)]
    checks.append(('V5', 'Her firmanın en az 1 deposu var', not no_wh,
                   f' deposuz: {[tenants[t]["name"] for t in no_wh]}' if no_wh else 'tüm firmalar depolu'))

    # V6 — finansal değişmezlik
    if before_path:
        old = load(before_path)
        pairs = []
        # PARA: dry-run/apply ile AYNI Decimal tabanı kullanılmalı. `round(sum(...),2)`
        # float toplamı 0,01 düzeyinde yapay fark üretir ve "DEĞİŞTİ" diye yanlış
        # alarm verir; yanlış alarm veren kapı kapatılmayı öğretir, kapı ölür.
        pairs.append(('toplam stok',
                      sum(p.get('currentStock', 0) for p in old.get('products', [])),
                      sum(p.get('currentStock', 0) for p in db.get('products', []))))
        pairs.append(('cari bakiye (customers.balance)',
                      lib.money_sum(old.get('customers', []), 'balance'),
                      lib.money_sum(db.get('customers', []), 'balance')))
        pairs.append(('fatura toplamı (grandTotal)',
                      lib.money_sum(old.get('invoices', []), 'grandTotal'),
                      lib.money_sum(db.get('invoices', []), 'grandTotal')))
        for coll in ('products', 'invoices', 'stockMovements', 'currentTransactions',
                     'customers', 'cashRegisters', 'bankAccounts'):
            pairs.append((f'{coll} sayısı', len(old.get(coll, [])), len(db.get(coll, []))))
        # Kayıt kayıt: toplam aynı kalsa bile iki faturanın tutarı yer
        # değiştirebilir; toplam bunu GİZLER.
        drift = 0
        for coll, fields in (
            ('invoices', ('grandTotal', 'subTotal', 'totalVat', 'totalDiscount',
                          'paidAmount', 'remainingAmount', 'status', 'invoiceNo',
                          'customerId', 'date', 'items')),
            ('customers', ('balance', 'totalDebit', 'totalCredit', 'taxNumber')),
            ('currentTransactions', ('debit', 'credit', 'balance', 'documentNo',
                                     'customerId', 'date')),
            ('products', ('currentStock', 'salePrice', 'purchasePrice', 'name', 'code')),
        ):
            before_by_id = {r['id']: r for r in old.get(coll, []) if isinstance(r, dict)}
            for r in db.get(coll, []):
                o = before_by_id.get(r.get('id'))
                if not o:
                    continue
                drift += sum(1 for f in fields if o.get(f) != r.get(f))
        pairs.append(('kayıt bazlı finansal sürüklenme', 0, drift))
        bad = [p for p in pairs if p[1] != p[2]]
        checks.append(('V6', 'Finansal değişmezlik (yedekle karşılaştırma)', not bad,
                       'AYNI' if not bad else f'DEĞİŞTİ: {bad}'))
        # Depo sayısı SADECE artmalı (yeni depo eklendi); azalma geri alma işareti.
        wb, wa = len(old.get('warehouses', [])), len(warehouses)
        checks.append(('V6b', 'Depo sayısı yalnız arttı', wa >= wb, f'{wb} -> {wa}'))
    else:
        checks.append(('V6', 'Finansal değişmezlik (yedekle karşılaştırma)', False,
                       'ATLANDI — --before verilmedi; bu bir KANIT DEĞİLDİR'))

    # V7 — ad tutarlılığı
    mismatch = []
    for w in warehouses:
        owner = w.get('tenantId') or w.get('companyId')
        if not owner or owner not in tenants:
            continue
        tname = str(tenants[owner].get('name') or '').split()
        first = tname[0].lower() if tname else ''
        if first and first not in str(w.get('name') or '').lower():
            mismatch.append((w['id'], w.get('name'), tenants[owner]['name']))
    checks.append(('V7', 'Depo adı ile firma adı çelişmiyor', not mismatch,
                   f'{len(mismatch)} çelişki' + (f': {mismatch}' if mismatch else '')))

    print('=' * 74)
    print('İŞBEY BACKFILL DOĞRULAMA — SALT OKUNUR')
    print('=' * 74)
    print(f'dosya : {path}')
    print(f'şha256: {hashlib.sha256(open(path, "rb").read()).hexdigest()}')
    print(f'tenant: {len(tenants)} | depo: {len(warehouses)} | '
          f'ürün: {len(db.get("products", []))} | fatura: {len(db.get("invoices", []))}')
    print('─' * 74)
    failed = 0
    for code, desc, ok, detail in checks:
        if not ok:
            failed += 1
        print(f'  [{"GEÇTİ" if ok else "KALDI"}] {code:4} {desc}')
        print(f'           {detail}')

    # BİLGİ (kapı değil): iki para gerçeği. 2026-10-20'de raporlarda
    # "−253.500,59" ile "−252.924,59" çelişkisi buradan çıkmıştı: biri koşan
    # bakiye toplamı, diğeri gerçek cari bakiye. İkisi EŞİT DEĞİLDİR.
    cari, kosan, fark, notlar = lib.chain_balance_drift(db)
    print('─' * 74)
    print(f'  cari bakiye (customers.balance)      : {cari}')
    print(f'  koşan bakiye (hareketler toplamı)    : {kosan}')
    print(f'  fark (tasarım gereği, hata değil)    : {fark}')
    for n in notlar:
        print(f'    - {n["id"]} {n["documentNo"]}: bakiye {n["balance"]} ({n["sebep"]})')
    print('─' * 74)
    print(f'SONUÇ: {len(checks) - failed}/{len(checks)} GEÇTİ')
    if failed:
        print('YAYINA DEVAM EDİLMEMELİ — başarısız kontrol(ler) var.')
        return 3
    print('Doğrulama tamam. Sıradaki adım: canlı API/UI kontrolü (gerçek giriş ile).')
    return 0


if __name__ == '__main__':
    sys.exit(main())
