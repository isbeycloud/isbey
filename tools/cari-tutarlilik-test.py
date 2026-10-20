#!/usr/bin/env python3
"""
İŞBEY — `cari-tutarlilik.py` İSTİSNA KAPISI SÖZLEŞME TESTİ (2026-10-20)
======================================================================
Ölçülen risk: istisna mekanizması fazla GENİŞ olursa, bir kaydı kurtarmak
için verilen onay sonradan gelen BAŞKA bir mali tutarsızlığı da sessizce
geçirir. İş emri bunu açıkça yasaklıyor ("diğer mali tutarsızlıkları
otomatik kabul etme"). Bu dosya mekanizmanın dar kaldığını KANITLAR.

Ölçülen değişmezler:
  T1. Gerekçesiz / kısa gerekçeli onay REDDEDİLİR.
  T2. Kimliksiz onay (`--kabul C5="..."`) REDDEDİLİR — aksi hâlde kapıdaki
      bütün ihlaller affedilirdi.
  T3. `--gecerlilik` olmadan onay REDDEDİLİR (süresiz istisna yok).
  T4. Kayda özgü onay DOĞRU kaydı affeder (çıkış 0).
  T5. AYNI kapıdaki BAŞKA kayıt affedilmez (çıkış 3) — asıl kanıt budur.
  T6. Süresi geçmiş onay ölüdür (çıkış 3), raporda "SÜRESİ DOLDU" yazar.
  T7. Karşılığı kalmamış onay "KULLANILMADI" olarak görünür (sessiz yaşamaz).
  T8. Onay yalnız kendi kapısını affeder: C5 onayı C9 uyarısını affetmez.
  T9. Belge kimliği `@` biçiminde değilse REDDEDİLİR — sessizce hiçbir kayda
      eşleşmeyen (dolayısıyla kapıyı kapatmayan) onay yazılamaz.
  T10. C7 (ürün) kimliği `@` istemez; affetme ÜRÜN BAZINDA kalır (T10b).

Ağa çıkmaz, canlıya dokunmaz: veritabanı geçici dizinde üretilir.

Çalıştırma: python3 tools/cari-tutarlilik-test.py
"""
import json
import os
import subprocess
import sys
import tempfile

BURASI = os.path.dirname(os.path.abspath(__file__))
ARAC = os.path.join(BURASI, 'cari-tutarlilik.py')
GEREKCE = 'cari kaydi hic olusmamis; ayri is emri acildi'


def db_uret():
    """İki firmalı, ÜÇ ihlalli defter.

    A firması: SAT-A-1 (cari YOK) ve SAT-A-2 (cari YOK) → C5'te İKİ ihlal.
               Bu, "bir kaydı affet, diğeri kalsın" kanıtının kurulumudur.
    B firması: SAT-B-1 (cari YOK) → AYNI belge numarası başka firmada olsa
               bile tenant kimliğiyle ayrıldığını kanıtlar.
    """
    txs = [
        # Tek SAĞLAM hareket: C1–C4 kapıları temiz kalsın, test yalnız C5'i ölçsün.
        {'id': 'tx-1', 'tenantId': 'tA', 'customerId': 'cA', 'documentNo': 'ALI-A-1',
         'debit': 0, 'credit': 100, 'balance': -100, 'createdAt': '2026-01-01T10:00:00.000Z'},
    ]
    invoices = [
        {'id': 'i1', 'tenantId': 'tA', 'invoiceNo': 'SAT-A-1', 'type': 'SALES',
         'grandTotal': 120, 'customerId': '', 'status': 'APPROVED', 'date': '2026-01-02'},
        {'id': 'i2', 'tenantId': 'tA', 'invoiceNo': 'SAT-A-2', 'type': 'SALES',
         'grandTotal': 240, 'customerId': '', 'status': 'APPROVED', 'date': '2026-01-03'},
        {'id': 'i3', 'tenantId': 'tB', 'invoiceNo': 'SAT-A-1', 'type': 'SALES',
         'grandTotal': 60, 'customerId': '', 'status': 'APPROVED', 'date': '2026-01-04'},
    ]
    return {
        'tenants': [{'id': 'tA'}, {'id': 'tB'}],
        'customers': [{'id': 'cA', 'tenantId': 'tA', 'code': 'C1', 'title': 'A',
                       'balance': -100, 'totalDebit': 0, 'totalCredit': 100}],
        'currentTransactions': txs,
        'invoices': invoices,
        # İKİ üründe de salePrice 0 → İKİ C7 uyarısı. Tek uyarıyla "yalnız
        # onaylanan ürün affedilir" ölçülemez: affedilmeyen ürün hiç uyarı
        # üretmezse test, affetmenin çalıştığını değil uyarının yokluğunu
        # ölçmüş olur (2026-10-20'de tam bu hata yapıldı — T10b yanlış kurulum
        # yüzünden düştü, araç doğruydu). Ürün kimliği ÜRÜN KODUDUR (belge
        # değil): `@` biçim kuralının C7'yi yanlışlıkla kilitlemediğini de
        # bu çift uyarı ölçer.
        'products': [
            {'id': 'p1', 'tenantId': 'tA', 'code': 'URN-1', 'name': 'Numune',
             'salePrice': 0, 'purchasePrice': 0, 'vatRate': 20},
            {'id': 'p2', 'tenantId': 'tA', 'code': 'URN-2', 'name': 'Fiyatsiz',
             'salePrice': 0, 'purchasePrice': 60, 'vatRate': 20},
        ],
        'stockMovements': [],
    }


def kos(db_yolu, *ek):
    r = subprocess.run([sys.executable, ARAC, db_yolu, *ek],
                       capture_output=True, text=True)
    return r.returncode, r.stdout + r.stderr


sorunlar = []


def bekle(ad, kosul, detay=''):
    if kosul:
        print(f'PASS: {ad}')
    else:
        sorunlar.append(ad)
        print(f'FAIL: {ad}' + (f' — {detay}' if detay else ''))


def main():
    with tempfile.TemporaryDirectory() as d:
        yol = os.path.join(d, 'db.json')
        with open(yol, 'w', encoding='utf-8') as f:
            json.dump(db_uret(), f, ensure_ascii=False)

        # ── TABAN: istisnasız koşum kapıyı DÜŞÜRMELİ ──
        kod, cikti = kos(yol)
        bekle('T0: istisnasız C5 DÜŞER (taban çizgisi)', kod == 3, f'çıkış={kod}')
        bekle('T0b: ihlal kimliği BELGE@tenant yazılır',
              'SAT-A-1@tA' in cikti and 'SAT-A-1@tB' in cikti, cikti[-400:])

        # ── T1: gerekçe kuralları ──
        kod, cikti = kos(yol, '--kabul', 'C5:SAT-A-1@tA=kisa', '--gecerlilik', '2099-01-01')
        bekle('T1: kısa gerekçe REDDEDİLİR', kod != 0 and 'gerekçe çok kısa' in cikti, cikti[-200:])

        # ── T2: kimliksiz onay ──
        kod, cikti = kos(yol, '--kabul', f'C5={GEREKCE}', '--gecerlilik', '2099-01-01')
        bekle('T2: kimliksiz onay REDDEDİLİR', kod != 0 and 'kimlik YOK' in cikti, cikti[-300:])

        # ── T2b: JOKER onay da reddedilir ──
        # `C5:*` yazmak kimlik kuralını dolanmanın en bariz yoludur: tek
        # kelimeyle kapının tamamı affedilir. Bu, T2'nin kabul ettiği boşluğun
        # kılık değiştirmiş hâlidir; ayrıca ölçülür.
        kod, cikti = kos(yol, '--kabul', f'C5:*={GEREKCE}', '--gecerlilik', '2099-01-01')
        bekle('T2b: JOKER kimlik (*) REDDEDİLİR', kod != 0 and 'joker' in cikti.lower(),
              cikti[-300:])

        # ── T3: süresiz onay ──
        kod, cikti = kos(yol, '--kabul', f'C5:SAT-A-1@tA={GEREKCE}')
        bekle('T3: --gecerlilik olmadan onay REDDEDİLİR',
              kod != 0 and 'gecerlilik' in cikti, cikti[-300:])

        # ── T4/T5: kayda özgü onay — BİRİ geçer, DİĞERİ kalır ──
        kod, cikti = kos(yol, '--kabul', f'C5:SAT-A-1@tA={GEREKCE}',
                         '--gecerlilik', '2099-01-01')
        bekle('T5: aynı kapıdaki BAŞKA kayıt affedilmez (çıkış 3)', kod == 3, f'çıkış={kod}')
        bekle('T5b: onaylanan kayıt raporda KABUL görünür', 'KABUL (kayda özgü): C5:SAT-A-1@tA' in cikti,
              cikti[-600:])
        bekle('T5c: onaysız ihlal açıkça listelenir', 'ONAYSIZ İHLAL' in cikti, cikti[-600:])
        bekle('T5d: yabancı firmanın AYNI numaralı belgesi affedilmedi',
              'SAT-A-1@tB' in cikti)

        # ── T4: hepsi onaylanırsa kapı AÇILIR ──
        kod, cikti = kos(yol,
                         '--kabul', f'C5:SAT-A-1@tA={GEREKCE}',
                         '--kabul', f'C5:SAT-A-2@tA={GEREKCE}',
                         '--kabul', f'C5:SAT-A-1@tB={GEREKCE}',
                         '--kabul', f'C9:SAT-A-1@tA={GEREKCE}',
                         '--kabul', f'C9:SAT-A-2@tA={GEREKCE}',
                         '--kabul', f'C9:SAT-A-1@tB={GEREKCE}',
                         '--gecerlilik', '2099-01-01')
        bekle('T4: üç kayıt da onaylanınca kapı AÇILIR', kod == 0, f'çıkış={kod}\n{cikti[-800:]}')

        # ── T6: süresi geçmiş onay ölüdür ──
        kod, cikti = kos(yol, '--kabul', f'C5:SAT-A-1@tA={GEREKCE}',
                         '--gecerlilik', '2020-01-01')
        bekle('T6: süresi geçmiş onay GEÇERSİZ (çıkış 3)', kod == 3, f'çıkış={kod}')
        bekle('T6b: süre dolduğu raporda yazılır', 'SÜRESİ DOLDU' in cikti, cikti[-600:])

        # ── T7: karşılığı olmayan onay görünür kalır ──
        kod, cikti = kos(yol, '--kabul', f'C5:YOK-BELGE@tA={GEREKCE}',
                         '--gecerlilik', '2099-01-01')
        bekle('T7: karşılığı olmayan onay KULLANILMADI olarak basılır',
              'KULLANILMADI: C5:YOK-BELGE@tA' in cikti, cikti[-600:])

        # ── T8: onay yalnız kendi kapısını affeder ──
        kod, cikti = kos(yol, '--kabul', f'C5:SAT-A-1@tA={GEREKCE}',
                         '--gecerlilik', '2099-01-01')
        bekle('T8: C5 onayı C9 uyarısını AFFETMEZ (uyarı yine onaysız)',
              '! C9 SAT-A-1' in cikti and '! C9 (KABUL)' not in cikti, cikti[-800:])

        # ── T9: belge kimliği `@` biçiminde olmalı ──
        # `@` olmadan yazılan onay HİÇBİR kayda eşleşmez (sessizce
        # KULLANILMADI olur) — operatör kapıyı kapattığını sanır. Bu yüzden
        # biçim baştan reddedilir.
        kod, cikti = kos(yol, '--kabul', f'C5:SAT-A-1={GEREKCE}',
                         '--gecerlilik', '2099-01-01')
        bekle('T9: @ içermeyen belge kimliği REDDEDİLİR',
              kod != 0 and 'BELGE@firma' in cikti, cikti[-300:])

        # ── T10: C7 (ürün) kimliği @ istemez ──
        kod, cikti = kos(yol, '--kabul', f'C7:URN-1={GEREKCE}',
                         '--gecerlilik', '2099-01-01')
        bekle('T10: C7 ürün kimliği @ olmadan kabul edilir',
              kod == 3 and 'C7 (KABUL) URN-1' in cikti, cikti[-500:])

        # T10b: affetme ÜRÜN BAZINDA kalıyor mu? İki ürün de 0 TL olduğu için
        # iki C7 uyarısı var; yalnız onaylananın satırı (KABUL) taşmalı.
        # Satır satır ölçülür — alt dize araması "URN-1 (KABUL)" yazarken
        # URN-2'yi de affetmiş gibi görünmez.
        # Yalnız UYARI satırları ("! C7 …"); gerekçe satırı (↳ KABUL …) sayılmaz.
        c7_satirlari = [s for s in cikti.splitlines() if '! C7 ' in s]
        c7_urn1 = [s for s in c7_satirlari if 'URN-1' in s]
        c7_urn2 = [s for s in c7_satirlari if 'URN-2' in s]
        bekle('T10b: yalnız onaylanan ürün affedilir (URN-2 uyarısı sürer)',
              len(c7_urn1) == 1 and '(KABUL)' in c7_urn1[0]
              and len(c7_urn2) == 1 and '(KABUL)' not in c7_urn2[0],
              f'URN-1={c7_urn1} · URN-2={c7_urn2}')

    print()
    if sorunlar:
        print(f'cari-tutarlilik-test: {len(sorunlar)} FAIL — {sorunlar}')
        return 1
    print('cari-tutarlilik-test: TÜMÜ PASS')
    return 0


if __name__ == '__main__':
    sys.exit(main())
