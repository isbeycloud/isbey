#!/usr/bin/env python3
"""
İŞBEY — SAT-2026-000001 MALİ DÜZELTME (KAPILI, İDEMPOTENT, GERİ ALINABİLİR)
============================================================================
NE YAPAR
--------
Yürürlükteki bir SATIŞ faturasını DOĞRULANMIŞ bir cariye bağlar ve eksik cari
hareketini TAM OLARAK BİR KEZ oluşturur. Varsayılan davranış KURU KOŞUM'dur;
yazmak için ayrı onay bayrakları gerekir.

NE YAPMAZ
---------
· Belge GÖNDERMEZ, iptal etmez, yeniden göndermez (CLAUDE.md md.1).
· Cari KARTI oluşturmaz. Cari yoksa ya da eşleşme kesin değilse DURUR —
  "tahmini cari" üretmek yasak (iş emri md.2).
· Fatura tutarını, tarihini, kalemlerini, stok hareketini DEĞİŞTİRMEZ.
· `customerCode` alanına DOKUNMAZ. Hızlı Bilişim faturasında bu alan cari kodu
  değil ALICI VKN'sidir (`efatura.ts`); ezmek belgenin kimliğini siler ve aracı
  idempotentlikten çıkarır. Alıcı VKN'si `recipientTaxNumber` boşsa oraya
  yazılır (belge sorgusunun okuduğu alan), asla tahminle değil — GİB kanıtından.
· Defteri kendi kendine yeniden hesaplayıp "düzeltmiş gibi" yapmaz; koşan
  bakiyeleri `storage.recalculateBalances` semantiğiyle (createdAt sırası,
  borç−alacak) yeniden üretir ve bunu raporda AÇIKÇA söyler.

KAPILAR (biri bile düşerse YAZILMAZ)
------------------------------------
  K1. Belge bulunamadı / yürürlükte değil (iptal, silinmiş, DRAFT) → DUR.
  K2. Belge zaten bir cariye bağlı ve o cari TUTARLA tutuyorsa → DEĞİŞİKLİK
      YOK (idempotent). Başka bir cariye bağlıysa → DUR (sessizce taşınmaz).
  K3. Cari eşleşmesi KESİN değil: aday yok, birden fazla aday, ya da adayın
      VKN/TCKN'si belgenin alıcı VKN'siyle birebir tutmuyor → DUR.
  K4. GİB kanıtı yok / tutmuyor: `--gib-kanit` dosyası verilmemişse, dosyada
      `zarfGibIletildi=true` yoksa, ETTN / alıcı VKN / tutar faturayla
      eşleşmiyorsa → DUR. (`SENT` alanı TEK BAŞINA kanıt sayılmaz.)
  K5. Bu fatura için ZATEN cari hareketi varsa → yeni hareket YAZILMAZ.
      Tutar tutmuyorsa DUR (mükerrer riski; elle inceleme).
  K6. Fatura tutarı ile cari hareket tutarı arasında kuruş farkı varsa DUR.
  K7. `--expect-sha256` verilmediyse veya ölçülen özet uyuşmuyorsa → DUR.
  K8. `--confirm APPLY` verilmediyse → yalnız kuru koşum.
  K9. Aday carinin tipi CUSTOMER/BOTH değilse (ör. SUPPLIER kartı) ve
      `--allow-cari-tipi` ile AÇIKÇA onaylanmadıysa DUR. VKN eşleşmesi kimlik
      kanıtıdır; kart tipi yanlış etiketlenmiş olabilir — ama bu sessiz
      geçilecek bir ayrıntı değildir.

KULLANIM
--------
    # 1) GİB kanıtı (salt okunur, ağa çıkar, kontör tüketmez)
    npx tsx tools/hizli-belge-durum.ts <ETTN> --tarih YYYY-MM-DD \
        --json /tmp/gib-kanit.json

    # 2) Kuru koşum — hiçbir şey yazmaz, kapsamı ve bakiye farkını basar
    python3 tools/mali-duzeltme.py <db.json> \
        --fatura SAT-2026-000001 \
        --gib-kanit /tmp/gib-kanit.json

    # 3) Onaylı uygulama (özet operatör tarafından ÖLÇÜLÜP verilir)
    python3 tools/mali-duzeltme.py <db.json> \
        --fatura SAT-2026-000001 --gib-kanit /tmp/gib-kanit.json \
        --expect-sha256 <64-haneli-özet> --confirm APPLY

    # 4) Geri alma
    python3 tools/mali-duzeltme.py <db.json> rollback <duzeltme.json>

KANITLANMIŞ DAVRANIŞ (2026-10-20, /tmp kopyaları üzerinde — canlıya YAZILMADI)
--------------------------------------------------------------------------------
  · Test kopyası (VKN'si eşleşen CUSTOMER carisi eklenmiş): kuru koşum kapsamı
    ve +120,00 farkı bastı → apply (yedek sha doğrulandı) → cari-tutarlilik.py
    6/6 → İKİNCİ koşum "DEĞİŞİKLİK GEREKMİYOR" → rollback sonrası dosya
    auditLogs dışında BİREBİR aynı.
  · Canlı kopya (cari YOK): K3 ile DURUR, dosya sha değişmez.
  · Negatif: kanıt tutarı/VKN/zarf/BULUNAMADI, başka cariye bağlı, tutmayan
    hareket, iptal belge, SUPPLIER tipi (onaysız), sha uyuşmazlığı, iki aday
    cari → hepsinde exit 3 ve dosya DEĞİŞMEDİ.

ÇIKIŞ KODU: 0 = yazıldı veya değişiklik gerekmedi · 3 = kapı düştü, YAZILMADI
            · 4 = yedek/geri alma sorunu · 2 = kullanım hatası

DİKKAT: Sunucu DB dosyasını YALNIZ AÇILIŞTA okur. Dosya değiştirildikten
sonra süreç yeniden başlatılmadan yeni veri görünmez (restart.txt).
"""
import argparse
import datetime
import hashlib
import json
import os
import shutil
import sys
import tempfile
from decimal import Decimal

import backfill_lib as lib

CONFIRM_TOKEN = 'APPLY'
CENT = Decimal('0.01')
# Geç late gelen hareketin kimliği: belge kimliğinden TÜRETİLİR, zamandan
# değil. Aynı düzeltme iki kez koşarsa aynı kimlik üretilir ve ikinci yazım
# mükerrer satır oluşturamaz (idempotentliğin kimlik tarafı).
TX_ID_PREFIX = 'ctx-duzeltme-'


def d(v):
    """Güvenli Decimal — None/'' → 0. Para float ile toplanmaz."""
    if v is None or v == '':
        return Decimal('0')
    return Decimal(str(v))


def q(v):
    return Decimal(v).quantize(CENT)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def atomic_write_json(path, data):
    """Aynı dizinde geçici dosya + fsync + os.replace (yarıda kalma DB'yi bozmaz)."""
    directory = os.path.dirname(os.path.abspath(path)) or '.'
    fd, tmp = tempfile.mkstemp(prefix='.mali-duzeltme-', suffix='.tmp', dir=directory)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        try:
            st = os.stat(path)
            os.chmod(tmp, st.st_mode & 0o777)
        except OSError:
            pass
        os.replace(tmp, path)
        tmp = None
    finally:
        if tmp and os.path.exists(tmp):
            os.unlink(tmp)


# ──────────────────────────────────────────────────────────────────────────
# storage.recalculateBalances EŞLENİĞİ (server/db/storage.ts:1670-1684)
# ──────────────────────────────────────────────────────────────────────────
def recalculate_cari(state):
    """Cari bakiyelerini HAREKETLERDEN yeniden üretir — sunucuyla aynı kural.

    NEDEN BURADA: canlı süreç `runTransaction` sonunda bu hesabı çalıştırır.
    Dosyayı doğrudan düzenlediğimizde o adım atlanır; koşan bakiyeler ve
    `customers.balance` yeni hareketi GÖRMEZ. Defter kimliği (C1–C4) o zaman
    bozulur: cari hareketi olan ama bakiyesi güncellenmemiş bir cari kalır.

    Kural birebir kopyalanır (uydurma bir formül değil):
      · her cari için hareketler `createdAt`'e göre ARTAN sıralanır
      · satır bakiyesi = o ana kadarki (borç − alacak)
      · cari.balance    = toplam borç − toplam alacak
      · totalDebit/totalCredit = toplamlar
    """
    by_cust = {}
    for t in state.get('currentTransactions', []):
        by_cust.setdefault(t.get('customerId'), []).append(t)
    for cust in state.get('customers', []):
        rows = by_cust.get(cust.get('id'), [])
        rows.sort(key=lambda r: str(r.get('createdAt') or ''))
        deb = Decimal('0')
        cred = Decimal('0')
        for r in rows:
            deb += d(r.get('debit'))
            cred += d(r.get('credit'))
            r['balance'] = float(q(deb - cred))
        cust['totalDebit'] = float(q(deb))
        cust['totalCredit'] = float(q(cred))
        cust['balance'] = float(q(deb - cred))


def defter_kapilari(state):
    """`cari-tutarlilik.py` C1–C4 kapılarının AYNISI.

    NEDEN: düzeltme "hedef bakiye tuttu" diye başarılı sayılamaz. Defter
    kimliği (cari.balance = Σborç−Σalacak), koşan bakiye kuralı ve son satır
    kuralı da tutmalı. Bu kapılar YAZMADAN ÖNCE, kopya üzerinde koşar.
    """
    out = []
    by_cust = {}
    for t in state.get('currentTransactions', []):
        by_cust.setdefault(t.get('customerId'), []).append(t)
    for rows in by_cust.values():
        rows.sort(key=lambda r: str(r.get('createdAt') or ''))

    for c in state.get('customers', []):
        rows = by_cust.get(c.get('id'), [])
        net = q(sum((d(r.get('debit')) - d(r.get('credit'))) for r in rows))
        if net != q(d(c.get('balance'))):
            out.append(f'C1: {c.get("code")} cari {q(d(c.get("balance")))} ≠ defter {net}')
        if rows:
            if q(d(rows[-1].get('balance'))) != q(d(c.get('balance'))):
                out.append(f'C3: {c.get("code")} son satır {q(d(rows[-1].get("balance")))} '
                           f'≠ cari {q(d(c.get("balance")))}')
            deb = cred = Decimal('0')
            for r in rows:
                deb += d(r.get('debit'))
                cred += d(r.get('credit'))
                if q(deb - cred) != q(d(r.get('balance'))):
                    out.append(f'C2: {r.get("documentNo")} koşan bakiye '
                               f'{q(d(r.get("balance")))} ≠ {q(deb - cred)}')

    cari, kosan, fark, _ = lib.chain_balance_drift(state)
    fazla = Decimal('0')
    for rows in by_cust.values():
        for r in rows[:-1]:
            fazla += d(r.get('balance'))
    if q(kosan - cari) != q(fazla):
        out.append(f'C4: fark(Σkoşan−Σcari) {q(kosan - cari)} ≠ beklenen {q(fazla)}')
    return out


# ──────────────────────────────────────────────────────────────────────────
# GİB KANITI
# ──────────────────────────────────────────────────────────────────────────
def gib_kaniti_dogrula(kanit, inv, hatalar):
    """Sağlayıcı sorgu çıktısını FATURAYLA karşılaştırır.

    Kural: kanıt dosyası yoksa ya da alanlardan biri tutmuyorsa düzeltme
    YAPILMAZ. `eInvoiceStatus='SENT'` yerel bir iddiadır; kanıt değildir.
    """
    if not kanit:
        hatalar.append('K4: GİB kanıtı yok (--gib-kanit verilmedi) — '
                       'yerel `SENT` alanı tek başına kabul kanıtı DEĞİLDİR')
        return None

    if kanit.get('sonuc') != 'BULUNDU':
        hatalar.append(f"K4: sağlayıcı sorgusu belgeyi BULMADI (sonuc={kanit.get('sonuc')!r}) — "
                       f"belge GİB'de kanıtlanmadan mali düzeltme yapılmaz")
        return None

    if kanit.get('zarfGibIletildi') is not True:
        hatalar.append(f"K4: zarf GİB'e iletilmedi (zarfKodu={kanit.get('zarfKodu')!r}, "
                       f"{kanit.get('zarfAciklama')!r})")
        return None

    ettn = str(kanit.get('ettn') or '').strip().lower()
    inv_ettn = str(inv.get('eInvoiceUUID') or '').strip().lower()
    if not ettn or ettn != inv_ettn:
        hatalar.append(f'K4: kanıt ETTN {ettn!r} ≠ fatura ETTN {inv_ettn!r}')
        return None

    vkn = ''.join(ch for ch in str(kanit.get('aliciVkn') or '') if ch.isdigit())
    fatura_vkn = ''.join(ch for ch in str(inv.get('customerCode') or '') if ch.isdigit())
    if not vkn or vkn != fatura_vkn:
        hatalar.append(f'K4: kanıt alıcı VKN {vkn!r} ≠ fatura customerCode {fatura_vkn!r}')
        return None

    tutar = q(d(kanit.get('tutar')))
    fatura_tutar = q(d(inv.get('grandTotal')))
    if tutar != fatura_tutar:
        hatalar.append(f'K4: kanıt tutarı {tutar} ≠ fatura tutarı {fatura_tutar}')
        return None

    return {
        'ettn': ettn,
        'zarfKodu': kanit.get('zarfKodu'),
        'zarfAciklama': kanit.get('zarfAciklama'),
        'isDurumu': kanit.get('isDurumu'),
        'isDurumuAciklama': kanit.get('isDurumuAciklama'),
        'belgeNo': kanit.get('belgeNo'),
        'aliciVkn': vkn,
        'tutar': str(tutar),
        'iptalEdilebilir': kanit.get('iptalEdilebilir'),
        'sorguZamani': kanit.get('yazildi'),
    }


# ──────────────────────────────────────────────────────────────────────────
# CARİ EŞLEŞTİRME
# ──────────────────────────────────────────────────────────────────────────
def cari_adaylari(db, inv, tenant_id, hedef):
    """VKN/TCKN'si BİREBİR eşleşen, AYNI firmaya ait cari adayları.

    NEDEN BU KADAR DAR: iş emri md.2 "belirsizlik varsa tahmini cari oluşturma
    veya eşleştirme" diyor. Bu yüzden:
      · yalnız `tenantId` (veya geçiş kaydı) ile SAHİPLİK doğrulanmış kayıtlar,
      · yalnız rakamları birebir eşleşen VKN/TCKN.
    Ad/ünvan eşleşmesi KULLANILMAZ: ünvan benzerliği kimlik kanıtı değildir.
    """
    adaylar = []
    for c in db.get('customers', []):
        if not lib_is_owned_by(c, tenant_id):
            continue
        for alan in ('taxNumber', 'nationalId'):
            deger = ''.join(ch for ch in str(c.get(alan) or '') if ch.isdigit())
            if deger and deger == hedef:
                adaylar.append(c)
                break
    return adaylar


def lib_is_owned_by(record, tenant_id):
    """`server/security/tenantOwnership.ts::isOwnedBy` eşleniği (TAM eşleşme).

    Geçiş (legacy) kimlikleri: `cash|bnk|wh-<tenant>-default|usd|eur`.
    Sahiplik alanı taşımayan kayıt varsayılan firmaya aittir.
    """
    if not record:
        return False
    acik = record.get('tenantId') or record.get('companyId')
    if acik:
        return acik == tenant_id
    rid = record.get('id') or ''
    for onek in ('cash-', 'bnk-', 'wh-'):
        if rid.startswith(onek):
            govde = rid[len(onek):]
            for sonek in ('-default', '-usd', '-eur'):
                if govde.endswith(sonek):
                    return govde[: -len(sonek)] == tenant_id
    return tenant_id == lib.BEYOGLU


def yururlukte(inv):
    return not inv.get('isDeleted') and inv.get('status') not in ('CANCELLED', 'DRAFT')


# ──────────────────────────────────────────────────────────────────────────
# PLAN
# ──────────────────────────────────────────────────────────────────────────
def plan_olustur(db, fatura_no, kanit, allow_cari_tipi, hatalar, uyarilar):
    """Hiçbir şeyi DEĞİŞTİRMEZ; uygulanacak değişiklikleri ve kapıları üretir."""
    eslesen = [i for i in db.get('invoices', []) if i.get('invoiceNo') == fatura_no]
    if len(eslesen) != 1:
        hatalar.append(f'K1: {fatura_no} için {len(eslesen)} kayıt bulundu (1 beklenir)')
        return None
    inv = eslesen[0]

    if not inv.get('tenantId'):
        hatalar.append('K1: faturanın tenantId alanı yok — sahiplik kanıtlanamaz')
        return None
    tenant_id = inv['tenantId']
    if tenant_id not in {t.get('id') for t in db.get('tenants', [])}:
        hatalar.append(f'K1: faturanın firması ({tenant_id}) tenant listesinde yok')
        return None

    if not yururlukte(inv):
        hatalar.append(f"K1: belge yürürlükte değil (status={inv.get('status')!r}, "
                       f"isDeleted={inv.get('isDeleted')!r}) — iptal/taslak belgeye hareket yazılmaz")
        return None

    inv_tutar = q(d(inv.get('grandTotal')))
    if inv_tutar <= 0:
        hatalar.append(f'K1: fatura tutarı {inv_tutar} — sıfır/negatif tutara cari hareket yazılmaz')
        return None

    gib = gib_kaniti_dogrula(kanit, inv, hatalar)
    # Kanıt doğrulanamadıysa plan ÜRETİLMEZ. `gib` alanı olmayan bir plan,
    # aşağıdaki karşılaştırmalarda ve denetim kaydında çökmeye yol açıyordu;
    # daha önemlisi "kanıtsız plan" diye bir şey OLMAMALI (iş emri md.1).
    if not gib:
        return None

    # Alıcı VKN'si ÜÇ kaynaktan okunur ve üçü de AYNI olmak zorundadır:
    # `customerCode` (hızlı fatura ucunun yazdığı alan), `recipientTaxNumber`
    # (varsa) ve sağlayıcı kanıtındaki `aliciVkn`. Tek kaynağa güvenmek,
    # yanlış etiketlenmiş bir kayıtta sessizce yanlış cariye yazmaya yol açar.
    hedef_vkn = ''.join(ch for ch in str(inv.get('customerCode') or '') if ch.isdigit())
    rec_vkn = ''.join(ch for ch in str(inv.get('recipientTaxNumber') or '') if ch.isdigit())
    if not hedef_vkn:
        hatalar.append('K3: belgede alıcı VKN/TCKN (customerCode) yok — cari eşleştirmesi yapılamaz')
        return None
    if rec_vkn and rec_vkn != hedef_vkn:
        hatalar.append(f'K3: customerCode {hedef_vkn} ≠ recipientTaxNumber {rec_vkn} — '
                       f'belgenin alıcısı belirsiz, tahmin edilmez')
        return None
    if gib and gib.get('aliciVkn') != hedef_vkn:
        hatalar.append(f"K3: GİB kanıtı alıcısı {gib.get('aliciVkn')} ≠ belge alıcısı {hedef_vkn}")
        return None

    adaylar = cari_adaylari(db, inv, tenant_id, hedef_vkn)
    if len(adaylar) == 0:
        hatalar.append(f'K3: {hedef_vkn} VKN/TCKN ile eşleşen cari YOK '
                       f'(firma {tenant_id}) — tahmini cari OLUŞTURULMAZ')
        return None
    if len(adaylar) > 1:
        hatalar.append(f'K3: {hedef_vkn} için {len(adaylar)} aday cari var '
                       f'({", ".join(c.get("id","?") for c in adaylar)}) — tek kayıt seçilemez')
        return None

    cari = adaylar[0]
    # Tip uyumu İŞARETTİR, KAPI DEĞİLDİR (düzeltildi): VKN eşleşmesi kimlik
    # kanıtıdır; kartın tipi yanlış etiketlenmiş olabilir ve bu bir VERİ
    # KALİTESİ sorunudur. Yine de sessiz geçilmez — SUPPLIER kartına satış
    # yazmak, cari ekstresini okuyanı yanıltır. Açık onay bayrağı istenir.
    tip = cari.get('type')
    if tip not in ('CUSTOMER', 'BOTH') and not allow_cari_tipi:
        hatalar.append(f'K9: aday cari tipi {tip!r} (satış faturası için CUSTOMER/BOTH beklenir). '
                       f'Bu bilinçli bir tercihse --allow-cari-tipi ile AÇIKÇA onaylayın')

    # Mevcut bağ / mevcut hareket
    ctx_tum = db.get('currentTransactions', [])
    mevcut_hareket = [t for t in ctx_tum if t.get('documentNo') == fatura_no]
    bagli = inv.get('customerId')

    if bagli and bagli != cari.get('id'):
        hatalar.append(f'K2: fatura BAŞKA bir cariye bağlı ({bagli}) — sessizce taşınmaz')
        return None
    if mevcut_hareket:
        hareket_toplam = q(sum((d(t.get('debit')) + d(t.get('credit'))) for t in mevcut_hareket))
        # Başka bir cariye yazılmış hareket varsa bu ciddi bir tutarsızlıktır.
        yabanci = [t for t in mevcut_hareket if t.get('customerId') != cari.get('id')]
        if yabanci:
            hatalar.append(f'K5: {fatura_no} hareketi BAŞKA cariye yazılmış '
                           f'({", ".join(str(t.get("customerId")) for t in yabanci)}) — elle inceleme')
            return None
        if hareket_toplam == inv_tutar:
            return {
                'degisiklik_yok': True,
                'sebep': f'fatura zaten {cari.get("id")} carisine bağlı ve hareketi ({hareket_toplam}) tutuyor',
                'fatura': inv, 'cari': cari, 'gib': gib, 'hareketler': mevcut_hareket,
            }
        hatalar.append(f'K5: {fatura_no} için {len(mevcut_hareket)} hareket var, toplam '
                       f'{hareket_toplam} ≠ fatura {inv_tutar} — mükerrer riski, YAZILMAZ')
        return None

    # Yeni hareket — SATIŞ faturası → BORÇ artar (invoices.ts:441-462 ile aynı işaret)
    yeni_id = f'{TX_ID_PREFIX}{inv.get("id") or fatura_no}'
    if any(t.get('id') == yeni_id for t in ctx_tum):
        hatalar.append(f'K5: {yeni_id} kimliği ZATEN var ama belge bağlantısı yok — '
                       f'kimlik çakışması, elle inceleme')
        return None

    simdi = datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z')
    hareket = {
        'id': yeni_id,
        'tenantId': tenant_id,
        'companyId': tenant_id,
        'customerId': cari.get('id'),
        'customerCode': cari.get('code'),
        'customerTitle': cari.get('title'),
        'documentNo': inv.get('invoiceNo'),
        'documentType': 'SALES_INVOICE',
        'date': inv.get('date'),
        'maturityDate': inv.get('maturityDate') or inv.get('date'),
        'debit': float(inv_tutar),
        'credit': 0,
        'balance': 0,
        'description': f'{inv.get("invoiceNo")} nolu Satış Faturası (mali düzeltme — '
                       f'belge cariye bağlanmamıştı)',
        'relatedInvoiceId': inv.get('id'),
        'userId': 'mali-duzeltme',
        # createdAt BUGÜN: kaydın gerçekten ne zaman oluştuğunu taşır. Belge
        # tarihine geriye yazmak, geçmişte yapılmamış bir işlemi geçmişte
        # yapılmış gibi gösteren bir SAHTELİK olurdu.
        'createdAt': simdi,
    }

    return {
        'degisiklik_yok': False,
        'fatura': inv,
        'cari': cari,
        'gib': gib,
        'hareket': hareket,
        'eski_cari_bakiye': q(d(cari.get('balance'))),
        'beklenen_bakiye_farki': inv_tutar,
        'beklenen_yeni_bakiye': q(d(cari.get('balance')) + inv_tutar),
    }


# ──────────────────────────────────────────────────────────────────────────
# UYGULA / GERİ AL
# ──────────────────────────────────────────────────────────────────────────
def uygula(db, plan):
    """Değişiklikleri AYNI kopya üzerinde uygular (transaction karşılığı).

    NEDEN KOPYA: canlı DB'ye doğrudan yazmak yerine tüm değişiklikler bellekte
    uygulanır, kapılar YENİDEN ölçülür, ancak geçerse diske yazılır. Yazma da
    atomiktir (os.replace). Yarım kalmış bir düzeltme mümkün değildir.

    ── `customerCode` NEDEN DEĞİŞTİRİLMEZ (2026-10-20 ölçülen hata) ──────────
    İlk sürüm burada `inv['customerCode'] = cari['code']` yazıyordu. Hızlı
    Bilişim faturasında bu alan CARİ KODU değil, ALICI VKN'sidir
    (`efatura.ts`: `customerCode: cust.IdentificationID`). Üzerine cari kodu
    yazmak:
      · belgenin alıcı kimliğini SİLER (belge sorgulama ve e-belge üretimi bu
        alandan beslenir),
      · aracı kendi kendine İDEMPOTENTLİKTEN ÇIKARIR: ikinci koşumda
        `customerCode` artık VKN olmadığı için K3/K4 kapıları düşer ve
        "değişiklik gerekmiyor" yerine "cari bulunamadı" der.
    Düzeltmenin kapsamı "belgeyi cariye bağla + eksik hareketi yaz"dır; belgenin
    kimlik alanlarını yeniden yazmak bu kapsamın DIŞINDADIR. Alıcı VKN'si
    `recipientTaxNumber` boşsa oraya AÇIKÇA yazılır (v1 belge sorgusu bu alanı
    okur; `customerId` bağlandıktan sonra zaten cari VKN'sinden çözülür).
    """
    inv = next(i for i in db['invoices'] if i.get('invoiceNo') == plan['fatura']['invoiceNo'])
    cari = next(c for c in db['customers'] if c.get('id') == plan['cari']['id'])
    alici_vkn = plan['gib']['aliciVkn'] if plan.get('gib') else ''

    inv['customerId'] = cari['id']
    if alici_vkn and not str(inv.get('recipientTaxNumber') or '').strip():
        inv['recipientTaxNumber'] = alici_vkn
    inv['updatedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z')

    db.setdefault('currentTransactions', []).append(plan['hareket'])
    recalculate_cari(db)

    db.setdefault('auditLogs', []).insert(0, {
        'id': f'log-mali-duzeltme-{inv.get("id")}',
        'tenantId': inv.get('tenantId'),
        'companyId': inv.get('tenantId'),
        'userId': 'mali-duzeltme',
        'username': 'mali-duzeltme',
        'action': 'UPDATE',
        'module': 'INVOICE',
        'documentNo': inv.get('invoiceNo'),
        'ipAddress': '127.0.0.1',
        'details': (
            f'{inv.get("invoiceNo")}: cari bağlantısı kuruldu ({cari.get("code")} / '
            f'{cari.get("title")}) ve eksik cari hareketi TEK SEFERLİK oluşturuldu '
            f'(borç {plan["beklenen_bakiye_farki"]} TL). '
            f'GİB kanıtı: ETTN {plan["gib"]["ettn"]}, zarf {plan["gib"]["zarfKodu"]} '
            f'({plan["gib"]["zarfAciklama"]}), iş durumu {plan["gib"]["isDurumu"]} '
            f'({plan["gib"]["isDurumuAciklama"]}). Belge gönderilmedi/iptal edilmedi.'
        ),
        'timestamp': datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z'),
    })
    return db


def dogrula_sonrasi(db, plan, hatalar):
    """Yazma ÖNCESİ son kapı: beklenen etki gerçekten oluştu mu?

    Toplamlar üzerinden değil KAYIT üzerinden ölçülür: toplam aynı kalırken
    iki kaydın yeri değişebilir (backfill'de öğrenilen ders).
    """
    inv = next(i for i in db['invoices'] if i.get('invoiceNo') == plan['fatura']['invoiceNo'])
    cari = next(c for c in db['customers'] if c.get('id') == plan['cari']['id'])
    beklenen = plan['beklenen_yeni_bakiye']
    gercek = q(d(cari.get('balance')))
    if gercek != beklenen:
        hatalar.append(f'K6: cari bakiye {gercek} ≠ beklenen {beklenen}')
    if inv.get('customerId') != cari.get('id'):
        hatalar.append('K6: fatura cari bağlantısı kurulmadı')
    # BELGE KİMLİĞİ KORUNUYOR MU? (2026-10-20'de bulunan hatanın regresyon kapısı)
    # Düzeltme `customerCode`'u ezmemeli: o alan alıcı VKN'sini taşır. Ezilirse
    # belge sorgulama/e-belge üretimi kimliği kaybeder ve araç idempotentliğini
    # yitirir. Kapı bunu yazmadan ÖNCE ölçer.
    if inv.get('customerCode') != plan['fatura'].get('customerCode'):
        hatalar.append(f"K6: customerCode DEĞİŞTİ ({plan['fatura'].get('customerCode')!r} → "
                       f"{inv.get('customerCode')!r}) — alıcı kimliği korunmalı")
    if plan.get('gib') and plan['gib'].get('aliciVkn'):
        rec = ''.join(ch for ch in str(inv.get('recipientTaxNumber') or '') if ch.isdigit())
        if rec and rec != plan['gib']['aliciVkn']:
            hatalar.append(f"K6: recipientTaxNumber {rec} ≠ alıcı VKN {plan['gib']['aliciVkn']}")
    hareketler = [t for t in db.get('currentTransactions', []) if t.get('documentNo') == inv.get('invoiceNo')]
    if len(hareketler) != 1:
        hatalar.append(f'K6: {inv.get("invoiceNo")} için {len(hareketler)} hareket var (1 olmalı)')
        return
    toplam = q(d(hareketler[0].get('debit')) + d(hareketler[0].get('credit')))
    if toplam != q(d(inv.get('grandTotal'))):
        hatalar.append(f'K6: hareket {toplam} ≠ fatura {q(d(inv.get("grandTotal")))}')
    if hareketler[0].get('tenantId') != inv.get('tenantId'):
        hatalar.append('K6: hareketin firması faturanın firmasıyla aynı değil')


def do_rollback(db_path, iz_path):
    db = json.load(open(db_path, encoding='utf-8'))
    iz = json.load(open(iz_path, encoding='utf-8'))
    inv_id = iz.get('fatura_id')
    tx_id = iz.get('hareket_id')

    inv = next((i for i in db.get('invoices', []) if i.get('id') == inv_id), None)
    if not inv:
        print(f'DUR: {inv_id} faturası dosyada yok.', file=sys.stderr)
        return 2

    # Önce hareketi kaldır, sonra bağlantıyı eski hâline döndür.
    once = len(db.get('currentTransactions', []))
    db['currentTransactions'] = [t for t in db.get('currentTransactions', []) if t.get('id') != tx_id]
    silinen = once - len(db['currentTransactions'])

    inv['customerId'] = iz.get('eski_customer_id')
    inv['customerCode'] = iz.get('eski_customer_code')
    # `recipientTaxNumber` yalnız düzeltme sırasında YAZILDIYSA geri alınır.
    # Alan zaten doluysa düzeltme ona DOKUNMADI; burada da dokunulmaz.
    if iz.get('alici_vkn_yazildi'):
        if iz.get('eski_recipient_tax_number') in (None, ''):
            inv.pop('recipientTaxNumber', None)
        else:
            inv['recipientTaxNumber'] = iz.get('eski_recipient_tax_number')
    inv['updatedAt'] = iz.get('eski_updated_at')
    recalculate_cari(db)

    # Denetim izi: geri alma da iz BIRAKIR (sessiz geri alma kabul edilmez).
    db.setdefault('auditLogs', []).insert(0, {
        'id': f'log-mali-duzeltme-rollback-{inv_id}',
        'tenantId': inv.get('tenantId'),
        'companyId': inv.get('tenantId'),
        'userId': 'mali-duzeltme',
        'username': 'mali-duzeltme',
        'action': 'UPDATE',
        'module': 'INVOICE',
        'documentNo': inv.get('invoiceNo'),
        'ipAddress': '127.0.0.1',
        'details': f'{inv.get("invoiceNo")}: mali düzeltme GERİ ALINDI '
                   f'({silinen} hareket silindi, cari bağlantısı eski hâline döndü).',
        'timestamp': datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z'),
    })

    atomic_write_json(db_path, db)
    print(f'GERİ ALINDI: {silinen} cari hareketi silindi; {inv.get("invoiceNo")} '
          f'cari bağlantısı {iz.get("eski_customer_id")!r} hâline döndü.')
    print('DİKKAT: Sunucu yeniden başlatılmadan değişiklik görünmez.')
    return 0


# ──────────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument('db')
    ap.add_argument('command', nargs='?', default='apply', choices=['apply', 'rollback'])
    ap.add_argument('iz', nargs='?', default=None, help='rollback: düzeltme izi dosyası')
    ap.add_argument('--fatura', default=None)
    ap.add_argument('--gib-kanit', default=None)
    ap.add_argument('--allow-cari-tipi', action='store_true',
                    help='Aday cari CUSTOMER/BOTH değilse bunu AÇIKÇA onayla')
    ap.add_argument('--expect-sha256', default=None)
    ap.add_argument('--confirm', default=None)
    ap.add_argument('--iz-yolu', default=None, help='uygulamada yazılacak iz dosyası')
    args = ap.parse_args()

    if args.command == 'rollback':
        if not args.iz:
            print('rollback için <duzeltme.json> yolu gerekli.', file=sys.stderr)
            return 2
        return do_rollback(args.db, args.iz)

    if not args.fatura:
        print('--fatura zorunlu (ör. --fatura SAT-2026-000001)', file=sys.stderr)
        return 2
    if not os.path.exists(args.db):
        print(f'dosya yok: {args.db}', file=sys.stderr)
        return 2

    print('=' * 74)
    print('İŞBEY MALİ DÜZELTME — CARİ BAĞLANTISI + TEK SEFERLİK HAREKET')
    print('=' * 74)
    src_sha = sha256_file(args.db)
    print(f'dosya      : {args.db}')
    print(f'sha256     : {src_sha}')
    print(f'fatura     : {args.fatura}')
    print(f'GİB kanıtı : {args.gib_kanit or "(verilmedi — düzeltme YAPILAMAZ)"}')
    print(f'onay       : {"VERİLDİ (" + CONFIRM_TOKEN + ")" if args.confirm == CONFIRM_TOKEN else "YOK → SADECE KURU KOŞUM"}')

    kanit = None
    if args.gib_kanit:
        if not os.path.exists(args.gib_kanit):
            print(f'GİB kanıt dosyası yok: {args.gib_kanit}', file=sys.stderr)
            return 2
        kanit = json.load(open(args.gib_kanit, encoding='utf-8'))

    original = json.load(open(args.db, encoding='utf-8'))
    hatalar, uyarilar = [], []
    plan = plan_olustur(original, args.fatura, kanit, args.allow_cari_tipi, hatalar, uyarilar)

    # ── DEĞİŞİKLİK YOK (idempotent) ──
    if plan and plan.get('degisiklik_yok'):
        print('\n' + '─' * 74)
        print(f"DURUM: DEĞİŞİKLİK GEREKMİYOR — {plan['sebep']}")
        print('Dosya yazılmadı.')
        for u in uyarilar:
            print(f'  ! {u}')
        return 0

    # `plan` yalnızca TÜM kapılar geçtiğinde tamdır. Kanıt tutmadığında
    # `plan_olustur` None döner ve GİB bloğu yazdırılamaz — bu bir çökme değil,
    # beklenen akıştır: kapılar aşağıda tek tek raporlanır. (2026-10-20'de
    # negatif testte `gib=None` üzerinde çökme bulundu; hata mesajı kayboluyordu.)
    if plan and plan.get('gib'):
        inv, cari, gib = plan['fatura'], plan['cari'], plan['gib']
        inv_tutar = q(d(inv.get('grandTotal')))
        print('\n' + '─' * 74)
        print('KAPSAM (canlı mali kayıt değişikliği)')
        print('─' * 74)
        print(f'  fatura          : {inv.get("invoiceNo")} · {inv.get("date")} · '
              f'{inv_tutar} TL · {inv.get("customerTitle")}')
        print(f'  alıcı VKN       : {inv.get("customerCode")}')
        print(f'  mevcut customerId: {inv.get("customerId")!r} → YENİ: {cari.get("id")} '
              f'({cari.get("code")} · {cari.get("title")})')
        print(f'  cari tipi       : {cari.get("type")!r}')
        print(f'  YENİ hareket    : borç {inv_tutar} / alacak 0 · doc {inv.get("invoiceNo")} '
              f'· kimlik {plan["hareket"]["id"]}')
        print(f'  beklenen bakiye : {plan["eski_cari_bakiye"]} → {plan["beklenen_yeni_bakiye"]} '
              f'(fark +{plan["beklenen_bakiye_farki"]})')
        print(f'  DEĞİŞMEYEN      : tutar, tarih, kalemler, stok, e-Fatura durumu, ETTN')
        print('\nGİB KANITI (sağlayıcı sorgusu)')
        print(f'  ETTN            : {gib["ettn"]}')
        print(f'  zarf            : {gib["zarfKodu"]} · {gib["zarfAciklama"]}')
        print(f'  iş durumu       : {gib["isDurumu"]} · {gib["isDurumuAciklama"]}')
        print(f'  belge no        : {gib["belgeNo"]} · tutar {gib["tutar"]} · '
              f'iptal edilebilir: {gib["iptalEdilebilir"]}')
        print(f'  sorgu zamanı    : {gib["sorguZamani"]}')

    # ── KAPILAR ──
    print('\n' + '─' * 74)
    blocked = list(hatalar)
    if args.expect_sha256 is None:
        blocked.append('K7: --expect-sha256 verilmedi')
    elif args.expect_sha256.lower() != src_sha:
        blocked.append(f'K7: sha256 UYUŞMUYOR (beklenen {args.expect_sha256[:16]}…, ölçülen {src_sha[:16]}…)')
    if args.confirm != CONFIRM_TOKEN:
        blocked.append('K8: --confirm APPLY verilmedi')
    for b in blocked:
        print(f'  X  {b}')
    for u in uyarilar:
        print(f'  !  {u}')
    print('─' * 74)

    if blocked or not plan:
        print('\nYAZILMADI. Hiçbir şey değişmedi.')
        return 3

    # ── KOPYA ÜZERİNDE UYGULA + SON KAPI ──
    calisma = json.loads(json.dumps(original))
    calisma = uygula(calisma, plan)
    son_hatalar = []
    dogrula_sonrasi(calisma, plan, son_hatalar)
    son_hatalar.extend(defter_kapilari(calisma))
    # Defter kimliği (C1–C4) yazma ÖNCESİ ölçülür: yazdıktan sonra fark
    # etmek, bozuk defteri canlıya almış olmak demektir.
    cari_once, kosan_once = lib.money_sum(original.get('customers', []), 'balance'), \
        lib.money_sum(original.get('currentTransactions', []), 'balance')
    cari_sonra = lib.money_sum(calisma.get('customers', []), 'balance')
    kosan_sonra = lib.money_sum(calisma.get('currentTransactions', []), 'balance')
    if q(cari_sonra - cari_once) != q(plan['beklenen_bakiye_farki']):
        son_hatalar.append(f'K6: cari toplam farkı {q(cari_sonra - cari_once)} ≠ '
                           f'beklenen {plan["beklenen_bakiye_farki"]}')
    if q(kosan_sonra - kosan_once) != q(plan['beklenen_bakiye_farki']):
        son_hatalar.append(f'K6: koşan bakiye toplam farkı {q(kosan_sonra - kosan_once)} ≠ '
                           f'beklenen {plan["beklenen_bakiye_farki"]}')
    if son_hatalar:
        for h in son_hatalar:
            print(f'  X  {h}')
        print('\nYAZILMADI (son doğrulama düştü). Hiçbir şey değişmedi.')
        return 3

    # ── YEDEK + İZ ──
    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    backup = f'{args.db}.pre-mali-duzeltme-{stamp}.bak'
    shutil.copy2(args.db, backup)
    bak_sha = sha256_file(backup)
    if bak_sha != src_sha:
        print(f'DUR: yedek özeti kaynakla uyuşmuyor ({bak_sha} != {src_sha})', file=sys.stderr)
        return 4
    print(f'\nyedek      : {backup}')
    print(f'yedek sha  : {bak_sha}')

    iz_yolu = args.iz_yolu or f'{args.db}.mali-duzeltme-{stamp}.json'
    iz = {
        'zaman': stamp,
        'fatura_no': plan['fatura'].get('invoiceNo'),
        'fatura_id': plan['fatura'].get('id'),
        'eski_customer_id': plan['fatura'].get('customerId'),
        # `customerCode` ARTIK DEĞİŞTİRİLMİYOR (alıcı VKN'sini taşır); geri alma
        # izinde yine de tutulur ki eski bir iz dosyasıyla da çalışılabilsin.
        'eski_customer_code': plan['fatura'].get('customerCode'),
        'eski_recipient_tax_number': plan['fatura'].get('recipientTaxNumber'),
        'alici_vkn_yazildi': bool(
            plan.get('gib') and plan['gib'].get('aliciVkn')
            and not str(plan['fatura'].get('recipientTaxNumber') or '').strip()
        ),
        'eski_updated_at': plan['fatura'].get('updatedAt'),
        'yeni_customer_id': plan['cari'].get('id'),
        'hareket_id': plan['hareket']['id'],
        'hareket': plan['hareket'],
        'beklenen_bakiye_farki': str(plan['beklenen_bakiye_farki']),
        'eski_cari_bakiye': str(plan['eski_cari_bakiye']),
        'gib_kaniti': plan['gib'],
        'from_sha256': src_sha,
        'backup': backup,
    }
    with open(iz_yolu, 'w', encoding='utf-8') as f:
        json.dump(iz, f, ensure_ascii=False, indent=2)
    print(f'iz dosyası : {iz_yolu}')

    # ── YAZ ──
    atomic_write_json(args.db, calisma)
    new_sha = sha256_file(args.db)
    print(f'\nYAZILDI    : {args.db}')
    print(f'yeni sha   : {new_sha}')
    print(f'cari bakiye: {plan["eski_cari_bakiye"]} → {plan["beklenen_yeni_bakiye"]} '
          f'({plan["cari"].get("code")})')

    print('\n' + '─' * 74)
    print('GERİ ALMA')
    print('─' * 74)
    print(f'  Tam    : cp "{backup}" "{args.db}"')
    print(f'  Cerrahi: python3 tools/mali-duzeltme.py "{args.db}" rollback "{iz_yolu}"')
    print('  Her iki durumda da sunucu YENİDEN BAŞLATILMALIDIR (DB açılışta okunur).')
    print('\nSIRADAKİ ADIM: doğrulama (salt okunur) →')
    print(f'  python3 tools/cari-tutarlilik.py "{args.db}"')
    return 0


if __name__ == '__main__':
    sys.exit(main())
