#!/usr/bin/env python3
"""
İŞBEY — CARİ / BELGE TUTARLILIK DENETİMİ (SALT OKUNUR)
======================================================
`database.prod.json` üzerinde koşar. **HİÇBİR ŞEY YAZMAZ.** Amacı "bakiye
kaç" değil, "defter kendi içinde tutarlı mı" sorusunu ÖLÇMEKTİR.

NEDEN: 2026-10-20'de SAT-2026-000005 (0 TL, borç 0, alacak 0) kaydının
−576 TL koşan bakiye taşıdığı görüldü. Bu, 576 TL'lik rapor farkını
açıklıyordu ama TEK BAŞINA "kayıt muhasebesel olarak doğru" demek değildi.
Bu betik o boşluğu kapatır: aynı kaydı defter kimliği, kümülatif bakiye
kuralı ve belge↔hareket eşleşmesi açısından ayrı ayrı sınar.

Kontroller:
  C1. Defter kimliği: cari.balance == Σborç − Σalacak
  C2. Koşan bakiye kuralı (storage.ts:1670-1684): her satırın bakiyesi,
      o cariye ait o ana kadarki kümülatif (borç − alacak) olmalı
  C3. Son satır bakiyesi == cari.balance
  C4. Σkoşan − Σcari == her carinin SON satırı HARİÇ bakiyeler toplamı
  C5. Yürürlükteki fatura ↔ cari hareket: tutarlar eşit VE hareket var
  C5b. İptal edilen faturada cari hareketi kalmamış
  C6. Sıfır tutarlı ama stok çıkışı doğuran belgeler  (UYARI, hata değil)
  C7. Satış fiyatı 0 olan ürünler                     (UYARI, hata değil)
  C8. Belgesi bulunamayan cari hareketleri            (UYARI)
  C9. Yürürlükte ama cariye bağlı olmayan fatura       (UYARI + kapı)

C1–C5b KAPI'dır (ihlal = defter bozuk). C6–C9 UYARI'dır: muhasebe hatası
değil, incelenmesi gereken iş kuralı/veri kalitesi konusudur; betiği
düşürmez. C9 ayrıca yüksek öncelikli uyarıdır.

BİLİNÇLİ GEÇİŞ: Bu veriyle ilerlemeye karar verilirse, her bulgu için
GEREKÇESİYLE birlikte açık onay verilir (sessizce geçilemez):

    python3 tools/cari-tutarlilik.py <db.json> \
        --kabul C9="backfill kapsami disinda, ayri is emri" [--kabul ...]

Onay verilen bulgular raporda "KABUL EDİLDİ + gerekçe" olarak basılır.

Kullanım:
    python3 tools/cari-tutarlilik.py <db.json>

Çıkış kodu: 0 = tüm KAPI'lar geçti, 3 = en az bir kapı kaldı.
"""
import json
import sys
from collections import defaultdict
from decimal import Decimal

import backfill_lib as lib

CENT = Decimal('0.01')


def d(v):
    """Güvenli Decimal — None/'' → 0. Float toplamı yapay fark üretmesin."""
    if v is None or v == '':
        return Decimal('0')
    return Decimal(str(v))


def q(v):
    return Decimal(v).quantize(CENT)


def kabul_et(args):
    """--kabul KOD="gerekçe" çiftlerini ayrıştırır.

    NEDEN: bir bulguyu sessizce yok saymak, kapıyı işlevsizleştirir. Onay
    GEREKÇESİYLE ve KAYITLI olmalı ki altı ay sonra "neden geçilmiş" sorusu
    cevaplanabilsin. Gerekçesiz onay reddedilir.
    """
    kabul = {}
    i = 0
    while i < len(args):
        a = args[i]
        if a == '--kabul':
            if i + 1 >= len(args):
                raise SystemExit('--kabul için KOD="gerekçe" gerekli')
            raw = args[i + 1]
            if '=' not in raw:
                raise SystemExit('biçim: --kabul KOD="gerekçe"')
            kod, gerekce = raw.split('=', 1)
            kod = kod.strip().upper()
            gerekce = gerekce.strip().strip('"').strip("'")
            if len(gerekce) < 10:
                raise SystemExit(f'{kod}: gerekçe çok kısa — neden geçildiği yazılmalı')
            kabul[kod] = gerekce
            i += 2
        else:
            i += 1
    return kabul


def main():
    argv = sys.argv[1:]
    if not argv:
        print(__doc__)
        return 2
    kabul = kabul_et(argv)
    positional = [a for j, a in enumerate(argv)
                  if a != '--kabul' and not (j > 0 and argv[j - 1] == '--kabul')]
    if not positional:
        print(__doc__)
        return 2
    path = positional[0]
    db = json.load(open(path, encoding='utf-8'))

    customers = db.get('customers', [])
    txs = db.get('currentTransactions', [])
    invoices = db.get('invoices', [])
    products = {p['id']: p for p in db.get('products', [])}
    stock = db.get('stockMovements', [])

    by_cust = defaultdict(list)
    for t in txs:
        by_cust[t.get('customerId')].append(t)
    for rows in by_cust.values():
        rows.sort(key=lambda r: str(r.get('createdAt') or ''))

    gates = []   # (kod, açıklama, geçti, detay)
    warns = []   # (kod, açıklama, detay)

    # ── C1: defter kimliği ──
    c1_bad = []
    for c in customers:
        rows = by_cust.get(c['id'], [])
        net = sum((d(r.get('debit')) - d(r.get('credit'))) for r in rows)
        beklenen = q(net)
        gercek = q(d(c.get('balance')))
        if beklenen != gercek:
            c1_bad.append((c['id'], str(gercek), str(beklenen)))
    gates.append(('C1', 'Defter kimliği: cari.balance = Σborç − Σalacak',
                  not c1_bad, f'{len(customers) - len(c1_bad)}/{len(customers)} cari tutarlı'
                  + (f' · İHLAL: {c1_bad}' if c1_bad else '')))

    # ── C2: koşan bakiye kuralı ──
    c2_bad = []
    for cid, rows in by_cust.items():
        deb = cred = Decimal('0')
        for r in rows:
            deb += d(r.get('debit'))
            cred += d(r.get('credit'))
            beklenen = q(deb - cred)
            gercek = q(d(r.get('balance')))
            if beklenen != gercek:
                c2_bad.append((r.get('documentNo'), str(gercek), str(beklenen)))
    gates.append(('C2', 'Koşan bakiye kuralı (storage.ts) her satırda tutuyor',
                  not c2_bad, f'{len(txs)} hareket tarandı'
                  + (f' · İHLAL: {c2_bad}' if c2_bad else '')))

    # ── C3: son satır == cari bakiye ──
    c3_bad = []
    for c in customers:
        rows = by_cust.get(c['id'], [])
        if not rows:
            if q(d(c.get('balance'))) != 0:
                c3_bad.append((c['id'], 'hareket yok ama bakiye ' + str(c.get('balance'))))
            continue
        son = q(d(rows[-1].get('balance')))
        if son != q(d(c.get('balance'))):
            c3_bad.append((c['id'], f'son={son} cari={q(d(c.get("balance")))}'))
    gates.append(('C3', 'Son satır bakiyesi = cari bakiye', not c3_bad,
                  'tüm carilerde eşit' if not c3_bad else f'İHLAL: {c3_bad}'))

    # ── C4: iki para gerçeği kimliği ──
    cari, kosan, fark, _ = lib.chain_balance_drift(db)
    fazla = Decimal('0')
    for rows in by_cust.values():
        for r in rows[:-1]:
            fazla += d(r.get('balance'))
    c4_ok = q(kosan - cari) == q(fazla)
    gates.append(('C4', 'fark(Σkoşan−Σcari) = son satır hariç bakiyeler',
                  c4_ok, f'fark={q(kosan - cari)} · beklenen={q(fazla)}'))

    # ── C5: belge ↔ hareket tutarı (YALNIZ YÜRÜRLÜKTEKİ faturalar) ──
    # DİKKAT (2026-10-20, ilk sürümün yanlış pozitifi): iptal edilen faturada
    # `POST /:id/delete` cari hareketi SİLER (invoices.ts:741). Yani iptal
    # belgede "hareket yok" DOĞRU davranıştır; ilk sürüm bunları da ihlal
    # sayıp 3 yanlış alarm verdi. Kapı yalnız yürürlükteki belgeleri denetler.
    inv_by_no = {i.get('invoiceNo'): i for i in invoices}
    ctx_by_doc = {}
    for t in txs:
        ctx_by_doc.setdefault(t.get('documentNo'), []).append(t)

    def iptal_mi(inv):
        return bool(inv.get('isDeleted')) or inv.get('status') == 'CANCELLED'

    c5_bad = []
    aktif = 0
    for inv in invoices:
        if iptal_mi(inv):
            continue
        aktif += 1
        no = inv.get('invoiceNo')
        rows = ctx_by_doc.get(no)
        tutar = q(d(inv.get('grandTotal')))
        if not rows:
            c5_bad.append((no, f'{tutar} TL yürürlükte ama cari hareketi YOK'))
            continue
        hareket = q(sum((d(r.get('debit')) + d(r.get('credit'))) for r in rows))
        if tutar != hareket:
            c5_bad.append((no, f'fatura={tutar} hareket={hareket}'))
    gates.append(('C5', 'Yürürlükteki fatura tutarı = cari hareket tutarı', not c5_bad,
                  f'{aktif} yürürlükteki fatura denetlendi'
                  + (f' · İHLAL: {c5_bad}' if c5_bad else ' · hepsi tutarlı')))

    # ── C5b: iptal edilen faturada hareket KALMAMALI ──
    c5b_bad = []
    for inv in invoices:
        if not iptal_mi(inv):
            continue
        rows = ctx_by_doc.get(inv.get('invoiceNo'))
        if rows:
            c5b_bad.append((inv.get('invoiceNo'), f'{len(rows)} hareket kaldı'))
    gates.append(('C5b', 'İptal edilen faturada cari hareketi kalmamış',
                  not c5b_bad, 'temiz' if not c5b_bad else f'İHLAL: {c5b_bad}'))

    # ── C6 (UYARI): 0 TL belge ama stok çıkışı ──
    sm_by_doc = defaultdict(list)
    for m in stock:
        sm_by_doc[m.get('documentNo')].append(m)
    for inv in invoices:
        if q(d(inv.get('grandTotal'))) != 0:
            continue
        rows = sm_by_doc.get(inv.get('invoiceNo'), [])
        qty = sum(d(m.get('quantity')) for m in rows)
        if rows:
            warns.append(('C6', f"{inv.get('invoiceNo')} 0 TL ama {len(rows)} stok hareketi "
                                f"({qty} adet) — mal çıkmış, bedel 0",
                          f"tip={inv.get('type')} · ödeme={inv.get('paymentStatus')} "
                          f"· {inv.get('date')}"))

    # ── C7 (UYARI): satış fiyatı 0 ürün ──
    sifir = [p for p in db.get('products', []) if q(d(p.get('salePrice'))) == 0]
    if sifir:
        warns.append(('C7', f'{len(sifir)}/{len(products)} ürünün satış fiyatı 0 '
                            f'— bu ürünlerle kesilen satış faturası 0 TL çıkar',
                      ', '.join(str(p.get('code')) for p in sifir[:8])
                      + (' …' if len(sifir) > 8 else '')))

    # ── C8 (UYARI): belgesi olmayan cari hareket ──
    for t in txs:
        no = t.get('documentNo')
        if no and no not in inv_by_no:
            warns.append(('C8', f"{no} cari hareketi var, faturası YOK",
                          f"borç={t.get('debit')} alacak={t.get('credit')}"))

    # ── C9 (UYARI): cariye BAĞLANMAMIŞ fatura ──
    # 2026-10-20'de bulundu: SAT-2026-000001 yürürlükte (APPROVED, e-Fatura
    # SENT, 120 TL) ama `customerId` BOŞ. İptal edilen 3 kardeşi de böyle.
    # Yürürlükteki cari hareketi olmadığı için defter toplamlarına hiç
    # girmiyor: 120 TL alacak canlıda HİÇBİR YERDE görünmüyor. Bu bir denge
    # hatası değil (cari hiç oluşmamış) ama tahsil edilebilir bir alacağın
    # kayıtsız kalması demek → muhasebe incelemesi gerekir, otomatik düzeltme
    # YAPILMAZ.
    baglanti_yok = [i for i in invoices
                    if not iptal_mi(i) and not i.get('customerId')]
    for inv in baglanti_yok:
        warns.append(('C9', f"{inv.get('invoiceNo')} yürürlükte ama cariye BAĞLI DEĞİL "
                            f"({q(d(inv.get('grandTotal')))} TL)",
                      f"customerId boş · kod={inv.get('customerCode')} "
                      f"· {inv.get('customerTitle')} · eF={inv.get('eInvoiceStatus')} "
                      f'· defterde görünmüyor'))

    # ── RAPOR ──
    print('=' * 74)
    print('İŞBEY CARİ / BELGE TUTARLILIK DENETİMİ — SALT OKUNUR')
    print('=' * 74)
    print(f'dosya : {path}')
    print(f'cari={len(customers)} · hareket={len(txs)} · fatura={len(invoices)} '
          f'· stok hareketi={len(stock)} · ürün={len(products)}')
    print('─' * 74)
    failed = 0
    for code, desc, ok, detay in gates:
        durum = 'GEÇTİ' if ok else ('KABUL' if code in kabul else 'KALDI')
        if not ok and code not in kabul:
            failed += 1
        print(f'  [{durum}] {code} {desc}')
        print(f'          {detay}')
        if not ok and code in kabul:
            print(f'          ↳ KABUL GEREKÇESİ: {kabul[code]}')
    print('─' * 74)
    if warns:
        print(f'  UYARILAR ({len(warns)}) — muhasebe hatası DEĞİL, inceleme konusu:')
        for code, desc, detay in warns:
            etiket = ' (KABUL)' if code in kabul else ''
            print(f'    ! {code}{etiket} {desc}')
            print(f'        {detay}')
            if code in kabul:
                print(f'        ↳ KABUL GEREKÇESİ: {kabul[code]}')
    else:
        print('  UYARI yok.')
    print('─' * 74)
    print(f'  cari bakiye (customers.balance)      : {q(cari)}')
    print(f'  koşan bakiye (hareketler toplamı)    : {q(kosan)}')
    print(f'  fark (tasarım gereği)                : {q(fark)}')
    print('─' * 74)
    print(f'SONUÇ: {len(gates) - failed}/{len(gates)} KAPI GEÇTİ'
          + (f' · {len(warns)} uyarı' if warns else ''))
    if failed:
        print('DEFTER TUTARSIZ — bu veriyle backfill/dağıtım YAPILMAMALI.')
        return 3
    print('Defter kendi içinde tutarlı. (Uyarılar iş kuralı incelemesi ister.)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
