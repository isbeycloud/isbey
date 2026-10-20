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
  C10. Kapanmış kayda geç gelen cari hareketi           (UYARI — düzeltme izi)

C1–C5b KAPI'dır (ihlal = defter bozuk). C6–C10 UYARI'dır: muhasebe hatası
değil, incelenmesi gereken iş kuralı/veri kalitesi konusudur; betiği
düşürmez. C9 ayrıca yüksek öncelikli uyarıdır.

C10 NEDEN VAR (2026-10-20): `SAT-2026-000001` düzeltmesi, kapanmış bir
belgeye SONRADAN cari hareketi ekler. Bu meşru bir düzeltmedir ama defterde
"belge tarihi ≠ hareket createdAt" durumu doğurur; storage `recalculateBalances`
satırları `createdAt`'e göre sıraladığı için koşan bakiye geçmişe dönük
değişir. Bunu GÖRÜNÜR kılmak, sessizce kabul etmekten iyidir.

BİLİNÇLİ GEÇİŞ — KAYDA ÖZGÜ ve SÜRELİ (2026-10-20 sıkılaştırması):
Bu veriyle ilerlemeye karar verilirse, her bulgu GEREKÇESİ ve İNCELEME
TARİHİYLE açıkça onaylanır. Sessizce geçilemez; TOPTAN da geçilemez:

    python3 tools/cari-tutarlilik.py <db.json> \
        --kabul C5:SAT-2026-000001@<tenantId>="cari kaydi hic olusmamis; ayri is emri" \
        --gecerlilik 2026-11-03

Kurallar:
  * KAPI bulguları (C1, C2, C3, C5, C5b) YALNIZ kayıt adı verilerek onaylanır
    (`KOD:KİMLİK`). `--kabul C5="..."` REDDEDİLİR: aynı kapıdaki BAŞKA bir
    ihlali de sessizce geçirirdi.
  * Aynı belge numarası birden çok firmada varsa kimlik `BELGE@tenantId`
    yazılmalıdır; çıplak numara REDDEDİLİR (yanlış firmayı affetmesin).
  * KAPI onayı için `--gecerlilik YYYY-MM-DD` ZORUNLUDUR. Tarih geçince onay
    ölür ve kapı yeniden düşer — istisna süresiz hâle gelemez.
  * Onaylanan kayıt artık ihlal değilse raporda "KULLANILMADI" basılır; ölü
    istisna görünür kalır, sessizce yaşamaya devam etmez.

Onay verilen bulgular raporda "KABUL + gerekçe + inceleme tarihi" olarak basılır.

Kullanım:
    python3 tools/cari-tutarlilik.py <db.json>

Çıkış kodu: 0 = tüm KAPI'lar geçti, 3 = en az bir kapı kaldı.
"""
import datetime as dt
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
    """`--kabul KOD:KİMLİK="gerekçe"` ve `--gecerlilik YYYY-MM-DD` ayrıştırır.

    NEDEN KİMLİK ZORUNLU (2026-10-20): ilk sürüm `--kabul C5="..."` kabul
    ediyordu. Bu, C5 kapısındaki HER ihlali affederdi — yani bir kaydı
    kurtarmak için konan istisna, sonradan gelen BAŞKA bir mali tutarsızlığı
    da sessizce geçirirdi. İş emri "diğer mali tutarsızlıkları otomatik kabul
    etme" diyor; istisna KAYDA ÖZGÜ olmak zorunda.

    NEDEN SÜRELİ: süresiz istisna altı ay sonra "neden geçilmiş" sorusunu
    cevapsız bırakır. Tarih geçince onay ölür, kapı yeniden düşer.
    """
    kabul = {}
    gecerlilik = None
    i = 0
    while i < len(args):
        a = args[i]
        if a == '--kabul':
            if i + 1 >= len(args):
                raise SystemExit('--kabul için KOD:KİMLİK="gerekçe" gerekli')
            raw = args[i + 1]
            if '=' not in raw:
                raise SystemExit('biçim: --kabul KOD:KİMLİK="gerekçe"')
            anahtar, gerekce = raw.split('=', 1)
            anahtar = anahtar.strip()
            gerekce = gerekce.strip().strip('"').strip("'")
            if ':' not in anahtar:
                raise SystemExit(
                    f'--kabul {anahtar}: kimlik YOK. Yalnız kod vermek o kapıdaki '
                    f'BÜTÜN ihlalleri affeder — "KOD:KİMLİK" yazılmalı '
                    f'(örn. C5:SAT-2026-000001@<tenantId>).')
            kod = anahtar.split(':', 1)[0].upper()
            kalan = anahtar.split(':', 1)[1].strip()
            if not kalan:
                raise SystemExit(f'--kabul {anahtar}: kimlik boş')
            # JOKER YASAK: `C5:*` kimlik kuralını dolanmanın en bariz yoludur
            # — tek kelimeyle kapının TAMAMI affedilir. Kimlik gerçek bir
            # belge/firma adı olmalı.
            if kalan in ('*', 'ALL', 'HEPSI', 'TUMU'):
                raise SystemExit(
                    f'--kabul {anahtar}: joker kimlik kabul edilmez — istisna '
                    f'KAYDA ÖZGÜ olmalı (örn. C5:SAT-2026-000001@<tenantId>).')
            # KİMLİK BİÇİMİ: belge kimlikleri `BELGE@firma` biçimindedir. `@`
            # olmadan yazılan bir onay HİÇBİR kayda eşleşmez; sessizce
            # "KULLANILMADI" olur ve operatör kapıyı kapattığını sanır. C7
            # istisnadır (ürün kimliği ürün KODUDUR, belge değil).
            if kod != 'C7' and '@' not in kalan:
                raise SystemExit(
                    f'--kabul {anahtar}: belge kimliği "BELGE@firma" biçiminde '
                    f'olmalı (örn. C5:SAT-2026-000001@<tenantId>). Çıplak belge '
                    f'numarası hiçbir kayda eşleşmez.')
            if len(gerekce) < 10:
                raise SystemExit(f'{kod}: gerekçe çok kısa — neden geçildiği yazılmalı')
            kabul[f'{kod}:{kalan}'] = gerekce
            i += 2
        elif a == '--gecerlilik':
            if i + 1 >= len(args):
                raise SystemExit('--gecerlilik için YYYY-MM-DD gerekli')
            try:
                gecerlilik = dt.date.fromisoformat(args[i + 1].strip())
            except ValueError:
                raise SystemExit('--gecerlilik biçimi YYYY-MM-DD olmalı')
            i += 2
        else:
            i += 1
    if kabul and not gecerlilik:
        raise SystemExit(
            'Onay verildi ama --gecerlilik YYYY-MM-DD yok. Süresiz istisna kabul '
            'edilmez; istisnanın hangi tarihe kadar geçerli olduğu yazılmalı.')
    return kabul, gecerlilik


def main():
    argv = sys.argv[1:]
    if not argv:
        print(__doc__)
        return 2
    kabul, gecerlilik = kabul_et(argv)
    # Değer alan bayraklar: hem bayrağın kendisi hem DEĞERİ konumsal sayılmaz.
    positional = [a for j, a in enumerate(argv)
                  if a not in ('--kabul', '--gecerlilik')
                  and not (j > 0 and argv[j - 1] in ('--kabul', '--gecerlilik'))]
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

    # (kod, açıklama, geçti, detay, ihlal kimlikleri)
    # KİMLİK ŞART: onay kayda özgü verilir; kimlik listesi olmayan bir kapı
    # toptan affedilemez (bkz. kabul_et).
    gates = []
    # (kod, açıklama, detay, kimlik) — uyarılar da kayda özgü onaylanır.
    warns = []

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
                  + (f' · İHLAL: {c1_bad}' if c1_bad else ''),
                  [b[0] for b in c1_bad]))

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
                  + (f' · İHLAL: {c2_bad}' if c2_bad else ''),
                  [str(b[0]) for b in c2_bad]))

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
                  'tüm carilerde eşit' if not c3_bad else f'İHLAL: {c3_bad}',
                  [b[0] for b in c3_bad]))

    # ── C4: iki para gerçeği kimliği ──
    cari, kosan, fark, _ = lib.chain_balance_drift(db)
    fazla = Decimal('0')
    for rows in by_cust.values():
        for r in rows[:-1]:
            fazla += d(r.get('balance'))
    c4_ok = q(kosan - cari) == q(fazla)
    gates.append(('C4', 'fark(Σkoşan−Σcari) = son satır hariç bakiyeler',
                  c4_ok, f'fark={q(kosan - cari)} · beklenen={q(fazla)}',
                  [] if c4_ok else ['DEFTER']))

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

    # KİMLİK: `BELGE` tek başına yetmez — aynı numara iki firmada olabilir ve
    # çıplak numarayla verilen onay YANLIŞ firmayı affederdi. Bu yüzden ihlal
    # kimliği `BELGE@tenantId` olarak üretilir.
    # SAHİPLİK `tenantId` YOKSA `companyId`'ye düşer (canlıda 3 kayıt yalnız
    # `companyId` taşıyor — docs/86). İkisi de yoksa kimlik `TENANT-YOK` olur:
    # bu, kaydın sahipsiz olduğunu GİZLEMEZ, tersine görünür kılar.
    def sahiplik(kayit):
        return kayit.get('tenantId') or kayit.get('companyId') or 'TENANT-YOK'

    def kimlik(inv):
        return f"{inv.get('invoiceNo')}@{sahiplik(inv)}"

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
            c5_bad.append((kimlik(inv), f'{tutar} TL yürürlükte ama cari hareketi YOK'))
            continue
        hareket = q(sum((d(r.get('debit')) + d(r.get('credit'))) for r in rows))
        if tutar != hareket:
            c5_bad.append((kimlik(inv), f'fatura={tutar} hareket={hareket}'))
    gates.append(('C5', 'Yürürlükteki fatura tutarı = cari hareket tutarı', not c5_bad,
                  f'{aktif} yürürlükteki fatura denetlendi'
                  + (f' · İHLAL: {c5_bad}' if c5_bad else ' · hepsi tutarlı'),
                  [b[0] for b in c5_bad]))

    # ── C5b: iptal edilen faturada hareket KALMAMALI ──
    c5b_bad = []
    for inv in invoices:
        if not iptal_mi(inv):
            continue
        rows = ctx_by_doc.get(inv.get('invoiceNo'))
        if rows:
            c5b_bad.append((inv.get('invoiceNo'), f'{len(rows)} hareket kaldı'))
    gates.append(('C5b', 'İptal edilen faturada cari hareketi kalmamış',
                  not c5b_bad, 'temiz' if not c5b_bad else f'İHLAL: {c5b_bad}',
                  [b[0] for b in c5b_bad]))

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
                          f"· {inv.get('date')}", kimlik(inv)))

    # ── C7 (UYARI): satış fiyatı 0 ürün ──
    # Kimlik: ÜRÜN KODU (tek onayla tüm ürünler affedilmesin).
    sifir = [p for p in db.get('products', []) if q(d(p.get('salePrice'))) == 0]
    for p in sifir:
        warns.append(('C7', f"{p.get('code')} ürününün satış fiyatı 0 "
                            f"— bu ürünle kesilen satış faturası 0 TL çıkar",
                      f"ad={p.get('name')} · alış={p.get('purchasePrice')} "
                      f"· KDV={p.get('vatRate')} · firma={sahiplik(p)}",
                      str(p.get('code'))))

    # ── C8 (UYARI): belgesi olmayan cari hareket ──
    for t in txs:
        no = t.get('documentNo')
        if no and no not in inv_by_no:
            warns.append(('C8', f"{no} cari hareketi var, faturası YOK",
                          f"borç={t.get('debit')} alacak={t.get('credit')}",
                          f"{no}@{sahiplik(t)}"))

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
                      f'· defterde görünmüyor', kimlik(inv)))

    # ── C10 (UYARI): kapanmış belgeye SONRADAN eklenmiş hareket ──
    # Mali düzeltme aracı (`tools/mali-duzeltme.py`) geçmiş tarihli belgeye
    # bugünün `createdAt`'i ile hareket yazar. Bu bilinçli bir tercihtir
    # (kayıt tarihi gerçeği taşır, belge tarihi DEĞİŞTİRİLMEZ) ama koşan
    # bakiyeyi etkiler; operatör bunu bilerek onaylamalıdır.
    for t in txs:
        belge = inv_by_no.get(t.get('documentNo'))
        if not belge:
            continue
        belge_tarihi = str(belge.get('date') or '')
        kayit_tarihi = str(t.get('createdAt') or '')[:10]
        if belge_tarihi and kayit_tarihi and kayit_tarihi > belge_tarihi:
            warns.append(('C10', f"{t.get('documentNo')} hareketi belge tarihinden SONRA kaydedildi "
                                f"(belge {belge_tarihi} · kayıt {kayit_tarihi})",
                          f"borç={t.get('debit')} alacak={t.get('credit')} · koşan bakiye "
                          f"kayıt sırasına göre yeniden hesaplanır", kimlik(belge)))

    # ── RAPOR ──
    print('=' * 74)
    print('İŞBEY CARİ / BELGE TUTARLILIK DENETİMİ — SALT OKUNUR')
    print('=' * 74)
    print(f'dosya : {path}')
    print(f'cari={len(customers)} · hareket={len(txs)} · fatura={len(invoices)} '
          f'· stok hareketi={len(stock)} · ürün={len(products)}')
    print('─' * 74)
    # SÜRE KAPISI: tarihi geçmiş onay ölüdür. İstisna "ebediyen geçerli"
    # hâle gelemez; süre dolunca kapı yeniden düşer.
    if kabul:
        kalan = (gecerlilik - dt.date.today()).days
        print(f'  İSTİSNA GEÇERLİLİĞİ: {gecerlilik.isoformat()} '
              f'({kalan} gün kaldı)' if kalan >= 0
              else f'  İSTİSNA SÜRESİ DOLDU: {gecerlilik.isoformat()} '
                   f'({-kalan} gün geçti) — onaylar GEÇERSİZ')
    failed = 0
    kullanilan = set()
    for code, desc, ok, detay, kimlikler in gates:
        # Kayda özgü onay: yalnız bu kapının İHLAL KİMLİKLERİ affedilir.
        # Kimliği onaylanmamış bir ihlal varsa kapı YİNE düşer.
        gecerli_onay = {k: kabul[f'{code}:{k}'] for k in kimlikler
                        if f'{code}:{k}' in kabul and gecerlilik >= dt.date.today()}
        kalan_ihlal = [k for k in kimlikler if k not in gecerli_onay]
        if kimlikler:
            ok = not kalan_ihlal
        if ok:
            durum = 'GEÇTİ' if not gecerli_onay else 'KABUL'
        else:
            # Kısmi onay kapıyı AÇMAZ: onaysız ihlal kaldıysa kapı düşmüştür.
            durum = 'KALDI (kısmi kabul)' if gecerli_onay else 'KALDI'
        if not ok:
            failed += 1
        print(f'  [{durum}] {code} {desc}')
        print(f'          {detay}')
        for k in sorted(gecerli_onay):
            kullanilan.add(f'{code}:{k}')
            print(f'          ↳ KABUL (kayda özgü): {code}:{k}')
            print(f'            GEREKÇE: {gecerli_onay[k]}')
            print(f'            GEÇERLİLİK: {gecerlilik.isoformat()}')
        if kalan_ihlal and gecerli_onay:
            print(f'          ↳ ONAYSIZ İHLAL: {kalan_ihlal} — istisna bunları KAPSAMAZ')
    print('─' * 74)
    if warns:
        print(f'  UYARILAR ({len(warns)}) — muhasebe hatası DEĞİL, inceleme konusu:')
        for code, desc, detay, kim in warns:
            onayli = (f'{code}:{kim}' in kabul and gecerlilik and
                      gecerlilik >= dt.date.today())
            if onayli:
                kullanilan.add(f'{code}:{kim}')
            print(f'    ! {code}{" (KABUL)" if onayli else ""} {desc}')
            print(f'        {detay}')
            if onayli:
                print(f'        ↳ KABUL (kayda özgü): {code}:{kim}')
                print(f'          GEREKÇE: {kabul[f"{code}:{kim}"]}')
                print(f'          GEÇERLİLİK: {gecerlilik.isoformat()}')
    else:
        print('  UYARI yok.')
    # Ölü istisna görünür kalsın: bir kayıt düzeldiyse onayı sessizce
    # yaşamaya devam etmemeli.
    for anahtar, gerekce in kabul.items():
        if anahtar not in kullanilan:
            print(f'    · KULLANILMADI: {anahtar} — bu koşumda karşılığı yok '
                  f'(gerekçe: {gerekce})')
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
