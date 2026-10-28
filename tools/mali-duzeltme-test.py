#!/usr/bin/env python3
"""
İŞBEY — `mali-duzeltme.py` SÖZLEŞME TESTİ (2026-10-21)
=====================================================
NEDEN VAR
---------
Mali düzeltme aracı **gerçek para** yazıyor: bir satış faturasını cariye
bağlıyor ve deftere tek seferlik bir borç hareketi ekliyor. Bu araç için
"prova yaptım, çalıştı" yeterli değildir; her kapının AYRI AYRI düştüğünü
ve hiçbir düşük kapının dosyayı DEĞİŞTİRMEDİĞİNİ ölçmek gerekir.

Bu dosya, 2026-10-21'de prova sırasında bulunan bir kusurun regresyon
testidir ve aracın yazma sözleşmesini kilitler:

  K1   Yürürlükte olmayan (iptal/taslak) belgeye hareket YAZILMAZ.
  K3   VKN ile eşleşen cari yoksa cari UYDURULMAZ, dosya değişmez.
  K4   GİB kanıtı verilmezse ya da tutmazsa YAZILMAZ.
  K5   Aynı fatura için ikinci hareket yazılmaz (idempotent).
  K6   Yazma sonrası defter kapıları (C1–C5) geçer.
  K7   `--expect-sha256` uyuşmazsa YAZILMAZ.

  **R1 (regresyon)**: beklenen bakiye `cari.balance + tutar` diye
  hesaplanmamalı. `recalculate_cari` bakiyeyi HAREKETLERDEN sıfırdan üretir;
  `balance` alanını başlangıç değeri saymaz. Geçmiş hareketi olmayan ama
  `balance` alanı 0 OLMAYAN bir caride eski formül K6'yı düşürüyordu →
  düzeltme canlıda hiç uygulanamazdı. Bu test o carinin üzerinde koşar.

Ağa çıkmaz, canlıya dokunmaz: her senaryo geçici dizinde üretilir.

Çalıştırma: python3 tools/mali-duzeltme-test.py
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

BURASI = os.path.dirname(os.path.abspath(__file__))
ARAC = os.path.join(BURASI, 'mali-duzeltme.py')
CARİ_DENETİM = os.path.join(BURASI, 'cari-tutarlilik.py')

TENANT = 'f0af349d-da17-419c-b9e4-1fde66beec3d'
VKN = '15512014278'


def kanit_uret(yol, tutar=120.0, vkn=VKN, zarf=1300):
    """Sağlayıcı sorgusunun ürettiği kanıt dosyasının AYNISI biçiminde.

    ⚠️ `zarfGibIletildi` alanı ZORUNLU ve `True` olmalı: araç K4 kapısında
    bunu `is True` ile arıyor. İlk yazdığım test kurulumu bu alanı atladığı
    için "temiz defter" senaryosu K4'te düştü — test kırmızıydı ama sebep
    araç değil, KURULUMDU. Gerçek kanıt dosyası (2026-10-21 sağlayıcı
    sorgusu) bu alanı taşıyor; test ondan kopyalanmalı, elle uydurulmamalı.
    """
    kanit = {
        'sonuc': 'BULUNDU',
        'ettn': '7e03cd4b-03db-4d36-a389-642af1700927',
        'zarfKodu': zarf,
        'zarfGibIletildi': zarf == 1300,
        'zarfAciklama': 'BAŞARI İLE TAMAMLANDI',
        'isDurumu': 12,
        'isDurumuAciklama': 'Otomatik Onaylandı',
        'belgeNo': 'BTF2026000000144',
        'aliciVkn': vkn,
        'aliciUnvan': 'ABDULLAH KARADUMAN',
        'tutar': tutar,
        'paraBirimi': 'TRY',
        'iptalEdilebilir': False,
        'duzenlemeTarihi': '2026-09-25',
        'uc': 'GetDocumentList',
        'appType': 2,
        'ortam': 'econnect',
        'yazildi': '2026-10-21T07:33:32.042Z',
    }
    with open(yol, 'w', encoding='utf-8') as f:
        json.dump(kanit, f, ensure_ascii=False)
    return yol


def db_uret(*, cari_var=True, cari_balance=0.0, durum='APPROVED',
            vkn=VKN, hareket_var=False, customer_code=None):
    """Tek firmalı, tek faturalı asgari defter.

    `cari_balance`: R1 regresyonunun kurulumu. Cariye ait HAREKET yokken
    bakiye alanı 0'dan farklı olabiliyor mu? Olabiliyor — prova verisi elle
    üretiliyor ve `balance` alanı taşınıyor. Araç bu durumda da doğru
    beklenen değeri üretmeli.
    """
    invoices = [{
        'id': 'inv-hizli-1790332410564', 'tenantId': TENANT, 'companyId': TENANT,
        'invoiceNo': 'SAT-2026-000001', 'type': 'SALES', 'status': durum,
        'date': '2026-09-25', 'grandTotal': 120.0, 'subTotal': 100.0, 'totalVat': 20.0,
        'customerId': None, 'customerCode': customer_code or vkn,
        'customerTitle': 'ABDULLAH KARADUMAN - KAREN TEKNOLOJİ',
        'eInvoiceStatus': 'SENT', 'eInvoiceUUID': '7e03cd4b-03db-4d36-a389-642af1700927',
        'items': [{'productCode': 'PRD-1', 'quantity': 1, 'unitPrice': 100.0, 'vatRate': 20}],
        'createdAt': '2026-09-25T18:47:00.000Z', 'updatedAt': '2026-09-25T18:47:00.000Z',
    }]
    customers = []
    if cari_var:
        customers.append({
            'id': 'cust-karaduman', 'tenantId': TENANT, 'companyId': TENANT,
            'code': 'MUS-2026-000001', 'name': 'ABDULLAH KARADUMAN',
            'title': 'ABDULLAH KARADUMAN - KAREN TEKNOLOJİ', 'type': 'CUSTOMER',
            'taxNumber': vkn, 'balance': cari_balance,
            'totalDebit': 0.0, 'totalCredit': 0.0,
            'createdAt': '2026-10-20T00:00:00.000Z', 'updatedAt': '2026-10-20T00:00:00.000Z',
        })
    txs = []
    if hareket_var:
        txs.append({
            'id': 'ctx-duzeltme-inv-hizli-1790332410564', 'tenantId': TENANT,
            'customerId': 'cust-karaduman', 'documentNo': 'SAT-2026-000001',
            'documentType': 'SALES_INVOICE', 'debit': 120.0, 'credit': 0.0,
            'balance': 120.0, 'date': '2026-09-25',
            'createdAt': '2026-10-21T00:00:00.000Z',
        })
        if cari_var:
            customers[0]['totalDebit'] = 120.0
            customers[0]['balance'] = cari_balance if cari_balance else 120.0
    return {
        'tenants': [{'id': TENANT, 'name': 'Beyoğlu Teknoloji'}],
        'customers': customers,
        'currentTransactions': txs,
        'invoices': invoices,
        'products': [], 'stockMovements': [], 'auditLogs': [],
        'users': [], 'warehouses': [], 'cashRegisters': [], 'bankAccounts': [],
    }


def yaz(yol, db):
    with open(yol, 'w', encoding='utf-8') as f:
        json.dump(db, f, ensure_ascii=False)
    return yol


def sha(yol):
    import hashlib
    return hashlib.sha256(open(yol, 'rb').read()).hexdigest()


def kos(db_yolu, kanit_yolu, *ek):
    r = subprocess.run([sys.executable, ARAC, db_yolu, '--fatura', 'SAT-2026-000001',
                        '--gib-kanit', kanit_yolu, *ek],
                       capture_output=True, text=True)
    return r.returncode, r.stdout + r.stderr


sorunlar = []


def bekle(ad, kosul, detay=''):
    if kosul:
        print(f'PASS: {ad}')
    else:
        sorunlar.append(ad)
        print(f'FAIL: {ad}' + (f' — {detay}' if detay else ''))


def degismedi(yol, onceki):
    return sha(yol) == onceki


def main():
    with tempfile.TemporaryDirectory() as d:
        kanit = kanit_uret(os.path.join(d, 'kanit.json'))

        # ── K1: iptal edilmiş belge ──────────────────────────────────────
        yol = yaz(os.path.join(d, 'k1.json'), db_uret(durum='CANCELLED'))
        s0 = sha(yol)
        kod, cikti = kos(yol, kanit, '--expect-sha256', s0, '--confirm', 'APPLY')
        bekle('K1: iptal belgeye hareket YAZILMAZ', kod != 0 and 'K1' in cikti, cikti[-300:])
        bekle('K1b: dosya DEĞİŞMEDİ', degismedi(yol, s0))

        # ── K3: cari yok → uydurulmaz ────────────────────────────────────
        yol = yaz(os.path.join(d, 'k3.json'), db_uret(cari_var=False))
        s0 = sha(yol)
        kod, cikti = kos(yol, kanit, '--expect-sha256', s0, '--confirm', 'APPLY')
        bekle('K3: cari yoksa DURUR (tahmini cari yok)', kod != 0 and 'K3' in cikti, cikti[-300:])
        bekle('K3b: dosya DEĞİŞMEDİ', degismedi(yol, s0))
        bekle('K3c: cari UYDURULMADI',
              len(json.load(open(yol, encoding='utf-8'))['customers']) == 0)

        # ── K4: GİB kanıtı tutmuyor ──────────────────────────────────────
        yanlis = kanit_uret(os.path.join(d, 'kanit-yanlis.json'), tutar=999.0)
        yol = yaz(os.path.join(d, 'k4.json'), db_uret())
        s0 = sha(yol)
        kod, cikti = kos(yol, yanlis, '--expect-sha256', s0, '--confirm', 'APPLY')
        bekle('K4: tutarı tutmayan kanıtla YAZILMAZ', kod != 0 and 'K4' in cikti, cikti[-300:])
        bekle('K4b: dosya DEĞİŞMEDİ', degismedi(yol, s0))

        zarf_kotu = kanit_uret(os.path.join(d, 'kanit-zarf.json'), zarf=1301)
        kod, cikti = kos(yol, zarf_kotu, '--expect-sha256', s0, '--confirm', 'APPLY')
        bekle('K4c: zarf 1300 değilse YAZILMAZ', kod != 0 and 'K4' in cikti, cikti[-300:])

        # ── K7: sha uyuşmazlığı ──────────────────────────────────────────
        kod, cikti = kos(yol, kanit, '--expect-sha256', 'f' * 64, '--confirm', 'APPLY')
        bekle('K7: yanlış sha ile YAZILMAZ', kod != 0 and 'K7' in cikti, cikti[-300:])
        bekle('K7b: dosya DEĞİŞMEDİ', degismedi(yol, s0))

        # ── K8: onay yoksa kuru koşum ────────────────────────────────────
        kod, cikti = kos(yol, kanit, '--expect-sha256', s0)
        bekle('K8: APPLY verilmezse yalnız kuru koşum', kod != 0 and 'K8' in cikti, cikti[-300:])
        bekle('K8b: dosya DEĞİŞMEDİ', degismedi(yol, s0))

        # ── R1 REGRESYON: cari.balance ≠ 0 ama HAREKETİ YOK ──────────────
        # Eski formül `balance + 120 = 170` beklerdi; `recalculate_cari`
        # gerçekte `0 + 120 = 120` üretir → K6 düşer → düzeltme HİÇ
        # uygulanamaz. Doğru davranış: yazılır ve bakiye 120 olur.
        yol = yaz(os.path.join(d, 'r1.json'), db_uret(cari_balance=50.0))
        s0 = sha(yol)
        kod, cikti = kos(yol, kanit, '--expect-sha256', s0, '--confirm', 'APPLY')
        bekle('R1: geçmiş hareketi olmayan cari de düzeltilebilir',
              kod == 0, cikti[-500:])
        if kod == 0:
            db = json.load(open(yol, encoding='utf-8'))
            cari = db['customers'][0]
            bekle('R1b: bakiye hareketlerden üretildi (120), bayat alandan değil',
                  abs(float(cari.get('balance')) - 120.0) < 0.005, f"balance={cari.get('balance')}")

        # ── K5/K6: mutlu yol + idempotentlik + defter kapıları ───────────
        yol = yaz(os.path.join(d, 'ok.json'), db_uret())
        s0 = sha(yol)
        kod, cikti = kos(yol, kanit, '--expect-sha256', s0, '--confirm', 'APPLY')
        bekle('K6: temiz defterde düzeltme YAZILIR', kod == 0, cikti[-500:])
        s1 = sha(yol)
        bekle('K6b: dosya gerçekten değişti', s1 != s0)

        db = json.load(open(yol, encoding='utf-8'))
        hareketler = [t for t in db['currentTransactions']
                      if t.get('documentNo') == 'SAT-2026-000001']
        bekle('K6c: TEK hareket yazıldı', len(hareketler) == 1, f'{len(hareketler)} hareket')
        bekle('K6d: hareket borç 120 / alacak 0',
              hareketler and abs(float(hareketler[0]['debit']) - 120.0) < 0.005
              and float(hareketler[0]['credit']) == 0.0)
        bekle('K6e: fatura cariye bağlandı',
              db['invoices'][0].get('customerId') == 'cust-karaduman')
        bekle('K6f: alıcı VKN korundu',
              db['invoices'][0].get('customerCode') == VKN)
        bekle('K6g: denetim kaydı yazıldı',
              any('mali düzeltme' in (l.get('details') or '').lower()
                  or 'cari bağlantısı kuruldu' in (l.get('details') or '').lower()
                  for l in db.get('auditLogs', [])))

        # Defter denetçisi: yazma sonrası C1–C5 temiz olmalı.
        r = subprocess.run([sys.executable, CARİ_DENETİM, yol], capture_output=True, text=True)
        bekle('K6h: defter denetimi 6/6 GEÇTİ (C5 dahil)',
              r.returncode == 0 and '6/6' in r.stdout, (r.stdout + r.stderr)[-500:])

        # ── K5: ikinci koşum yazmaz ──────────────────────────────────────
        kod, cikti = kos(yol, kanit, '--expect-sha256', s1, '--confirm', 'APPLY')
        bekle('K5: ikinci koşum "değişiklik gerekmiyor" der',
              kod == 0 and 'DEĞİŞİKLİK GEREKMİYOR' in cikti, cikti[-300:])
        bekle('K5b: ikinci koşum dosyayı DEĞİŞTİRMEDİ', degismedi(yol, s1))
        db2 = json.load(open(yol, encoding='utf-8'))
        bekle('K5c: mükerrer hareket OLUŞMADI',
              len([t for t in db2['currentTransactions']
                   if t.get('documentNo') == 'SAT-2026-000001']) == 1)

        # ── Geri alma: iş verisi birebir ─────────────────────────────────
        # İz dosyası yazma sırasında üretildi; yolunu çıktıdan almak yerine
        # varsayılan konumu denemek kırılgan olurdu → ayrı koşumla üret.
        yol2 = yaz(os.path.join(d, 'rb.json'), db_uret())
        iz = os.path.join(d, 'iz.json')
        s0 = sha(yol2)
        kod, cikti = kos(yol2, kanit, '--expect-sha256', s0, '--confirm', 'APPLY',
                         '--iz-yolu', iz)
        if kod == 0 and os.path.exists(iz):
            r = subprocess.run([sys.executable, ARAC, yol2, 'rollback', iz],
                               capture_output=True, text=True)
            after = json.load(open(yol2, encoding='utf-8'))
            bekle('G1: geri alma çalışır', r.returncode == 0, (r.stdout + r.stderr)[-300:])
            bekle('G2: geri alma sonrası hareket kalmadı',
                  len([t for t in after['currentTransactions']
                       if t.get('documentNo') == 'SAT-2026-000001']) == 0)
            bekle('G3: geri alma sonrası fatura bağlantısı eski hâlinde',
                  after['invoices'][0].get('customerId') is None)

    print()
    if sorunlar:
        print(f'mali-duzeltme-test: {len(sorunlar)} FAIL')
        for s in sorunlar:
            print('  -', s)
        return 1
    print('mali-duzeltme-test: TÜMÜ PASS')
    return 0


if __name__ == '__main__':
    sys.exit(main())
