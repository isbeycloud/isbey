/**
 * İŞBEY CLOUD — FAZ 19: GÖNDERİM İZİ VE MOCK DURUM AYRIMI TESTİ
 * ==============================================================
 *
 * NE İÇİN YAZILDI (`docs/46`)
 *   İki bağımsız kusur ölçümle bulundu:
 *
 *   A) `hizli-bilisim.ts` GİB durum senkronu, "gönderildi" kanıtı olarak
 *      `eInvoiceUUID.startsWith('urn:uuid:')` kullanıyordu. Bu önek KANIT DEĞİL,
 *      yalnız biçimdir. Ölçümde filtre TERS çalışıyordu: (a) uydurma
 *      `urn:uuid:<id>-<yıl>` değerini sorguya SOKUYOR, (b) gönderilmiş gerçek
 *      belgeleri sorgudan DÜŞÜRÜYORDU. Yeni ölçüt: elektronik belge kaydındaki
 *      GÖNDERİM İZİ — MOCK olmayan sağlayıcı + gönderilmiş durum.
 *
 *   B) `electronicDocumentQueue.ts` MOCK sağlayıcısında bile ERP faturasını
 *      'SENT' işaretliyordu. Timeline "GERÇEK gönderim yapılmadı" derken
 *      faturanın kendi alanı "gönderildi" diyordu; arayüz "GİB İletildi"
 *      gösteriyordu. Yeni davranış: MOCK'ta 'MOCK_SENT' — `isSent`
 *      eşlemelerinin DIŞINDA bir değer.
 *
 * KAPSAM VE DÜRÜSTLÜK SINIRI
 *   Gerçek Express route + gerçek JWT + gerçek auth middleware kullanılır.
 *   Entegratör çağrısı YAPILMAZ ve ağa çıkılmaz.
 *   ⛔ BU SÜİT GERÇEK SANDBOX PASS DEĞİLDİR. Hiçbir belge gönderilmedi/iptal
 *   edilmedi, kontör yakılmadı.
 *
 * Çalıştır (Windows, proje kökünde):
 *   npx tsx server/tests/phase19GonderimIziTest.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import fs from 'node:fs';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { storage } from '../db/storage';

// Testler proje kökünden koşulur; kaynak satır okumaları bu köke göre yapılır.
const PROJE_KOK = process.cwd();

// ─── Test Yardımcıları ────────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;

function pass(name: string): void { passCount++; console.log(`  ✅ PASS  ${name}`); }
function fail(name: string, detail?: string): void {
  failCount++; console.error(`  ❌ FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}
function kontrol(ad: string, kosul: boolean, detay?: string): void {
  kosul ? pass(ad) : fail(ad, detay);
}
function bolum(baslik: string): void {
  console.log(`\n${'─'.repeat(72)}\n📋 ${baslik}\n${'─'.repeat(72)}`);
}

const JWT_SECRET = process.env.JWT_SECRET as string;
const TEST_TENANT = 'tnt-gonderim-izi-test';
const UYDURMA_DESEN = /^urn:uuid:[a-z0-9-]+-\d{4}$/i;

let baseUrl = '';
let token = '';

async function istek(p: string, body: any): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${p}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  let parsed: any = null;
  try { parsed = await res.json(); } catch { parsed = null; }
  return { status: res.status, body: parsed };
}

/** Üretim kodundaki filtre ile BİREBİR aynı ölçüt (kopyala-uydur değil, hedef davranış). */
function filtreGonderimIzli(db: any): any[] {
  const GONDERILDI_DURUMLARI = ['SENT', 'DELIVERED', 'ACCEPTED'];
  const izli = new Set(
    (db.electronicDocuments || [])
      .filter((d: any) => d.documentType === 'INVOICE'
        && typeof d.providerId === 'string'
        && d.providerId.trim().toUpperCase() !== 'MOCK'
        && GONDERILDI_DURUMLARI.includes(String(d.status)))
      .map((d: any) => d.internalDocumentId)
  );
  return (db.invoices || []).filter((inv: any) =>
    inv.type === 'SALES'
    && typeof inv.eInvoiceUUID === 'string' && inv.eInvoiceUUID.trim().length > 0
    && izli.has(inv.id));
}

/** ESKİ (kusurlu) filtre — ayırt etme gücünü kanıtlamak için. */
function filtreEski(db: any): any[] {
  return (db.invoices || []).filter((inv: any) =>
    inv.type === 'SALES'
    && typeof inv.eInvoiceUUID === 'string'
    && inv.eInvoiceUUID.startsWith('urn:uuid:'));
}

// ─── Ana Akış ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '='.repeat(72));
  console.log('  İŞBEY CLOUD — FAZ 19 GÖNDERİM İZİ / MOCK AYRIMI TESTİ');
  console.log('='.repeat(72));
  console.log('  ⛔ Gerçek route kullanılır ama ENTEGRATÖRE ÇIKMAZ.');
  console.log('  ⛔ GERÇEK SANDBOX PASS DEĞİLDİR. Kontör yakılmadı.');

  if (!JWT_SECRET) {
    console.error('❌ JWT_SECRET tanımlı değil (.env). Test koşulamaz.');
    process.exit(1);
  }

  const db: any = storage.getState();
  const kullanici = (db.users || [])[0];
  if (!kullanici) { console.error('❌ DB\'de kullanıcı yok.'); process.exit(1); }

  token = jwt.sign(
    { userId: kullanici.id, username: kullanici.username, role: 'SUPER_ADMIN', tenantId: TEST_TENANT },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  // ═════════════════════════════════════════════════════════════════════════
  bolum('A. KAYNAK KOD — eski önek filtresi KALMADI');
  // ═════════════════════════════════════════════════════════════════════════

  const oku = (p: string) => {
    try { return fs.readFileSync(path.join(PROJE_KOK, p), 'utf8'); }
    catch { return ''; }
  };
  /** Yorum satırlarını dışlar: açıklamada desen geçmesi kusur değildir. */
  const kodSatirlari = (s: string) => s.split('\n')
    .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l));

  const hbKod = oku('server/routes/hizli-bilisim.ts');
  {
    kontrol('A-1 `hizli-bilisim.ts` kaynağı okundu', hbKod.length > 0);

    const eskiFiltre = kodSatirlari(hbKod)
      .filter(l => /eInvoiceUUID\.startsWith\(\s*['"]urn:uuid:['"]\s*\)/.test(l));
    kontrol('A-2 ⚠️ `startsWith(\'urn:uuid:\')` filtresi KALMADI',
      eskiFiltre.length === 0,
      `kalan satırlar: ${JSON.stringify(eskiFiltre.map(l => l.trim()))}`);

    kontrol('A-3 Yeni filtre `electronicDocuments` gönderim izini kullanıyor',
      /gonderimIzli/.test(hbKod) && /electronicDocuments/.test(hbKod));

    const mockHaric = kodSatirlari(hbKod)
      .filter(l => /toUpperCase\(\)\s*!==\s*['"]MOCK['"]/.test(l));
    kontrol('A-4 Yeni filtre MOCK sağlayıcısını dışlıyor', mockHaric.length > 0,
      `beklenen MOCK dışlama satırı bulunamadı`);

    kontrol('A-5 Yeni filtre yalnız GÖNDERİLMİŞ durumları sayıyor',
      /GONDERILDI_DURUMLARI/.test(hbKod));
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('B. ⚠️ FİLTRE DAVRANIŞI — yeni filtre eski kusuru gerçekten kapatıyor mu?');
  // ═════════════════════════════════════════════════════════════════════════

  {
    // Sentetik ama gerçekçi bir kurgu: ayırt etme gücü burada kanıtlanır.
    const kurgu: any = {
      invoices: [
        // (1) Uydurma ETTN'li, gönderim izi YOK → ASLA sorgulanmamalı
        { id: 'f-uydurma', type: 'SALES', eInvoiceUUID: 'urn:uuid:f-uydurma-2026', eInvoiceStatus: 'DELIVERED' },
        // (2) Çıplak UUID'li, GERÇEK gönderim izli → SORGULANMALI (eski filtre bunu düşürüyordu)
        { id: 'f-ciplak-gercek', type: 'SALES', eInvoiceUUID: 'aa58f0cc-4128-46d9-aa2d-e81bd9f38b7e', eInvoiceStatus: 'SENT' },
        // (3) `urn:uuid:` önekli, gerçek gönderim izli → SORGULANMALI
        { id: 'f-urn-gercek', type: 'SALES', eInvoiceUUID: 'urn:uuid:7c89b21f-8294-4d81-9872-918239019283', eInvoiceStatus: 'SENT' },
        // (4) MOCK ile "gönderilmiş" → ASLA sorgulanmamalı
        { id: 'f-mock', type: 'SALES', eInvoiceUUID: 'bb58f0cc-4128-46d9-aa2d-e81bd9f38b7e', eInvoiceStatus: 'MOCK_SENT' },
        // (5) Gerçek sağlayıcı ama gönderim BAŞARISIZ (durum ERROR) → ASLA sorgulanmamalı
        { id: 'f-hatali', type: 'SALES', eInvoiceUUID: 'cc58f0cc-4128-46d9-aa2d-e81bd9f38b7e', eInvoiceStatus: 'ERROR' },
        // (6) ALIŞ faturası → kapsam dışı
        { id: 'f-alis', type: 'PURCHASE', eInvoiceUUID: 'urn:uuid:7c89b21f-8294-4d81-9872-918239019283', eInvoiceStatus: 'SENT' },
      ],
      electronicDocuments: [
        { documentType: 'INVOICE', internalDocumentId: 'f-ciplak-gercek', providerId: 'HIZLI_BILISIM', status: 'SENT' },
        { documentType: 'INVOICE', internalDocumentId: 'f-urn-gercek', providerId: 'HIZLI_BILISIM', status: 'SENT' },
        { documentType: 'INVOICE', internalDocumentId: 'f-mock', providerId: 'MOCK', status: 'SENT' },
        { documentType: 'INVOICE', internalDocumentId: 'f-hatali', providerId: 'HIZLI_BILISIM', status: 'ERROR' },
        { documentType: 'INVOICE', internalDocumentId: 'f-alis', providerId: 'HIZLI_BILISIM', status: 'SENT' },
        // Uydurma kaydın elektronik belge kaydı YOK — gönderim izi yok.
      ],
    };

    const yeni = filtreGonderimIzli(kurgu).map((i: any) => i.id).sort();
    const eski = filtreEski(kurgu).map((i: any) => i.id).sort();

    kontrol('B-1 Yeni filtre UYDURMA ETTN\'li kaydı sorguya SOKMUYOR',
      !yeni.includes('f-uydurma'), `sorgulananlar: ${JSON.stringify(yeni)}`);

    kontrol('B-2 ⚠️ Yeni filtre ÇIPLAK UUID\'li GERÇEK belgeyi sorguluyor',
      yeni.includes('f-ciplak-gercek'), `sorgulananlar: ${JSON.stringify(yeni)}`);

    kontrol('B-3 Yeni filtre `urn:uuid:` önekli GERÇEK belgeyi sorguluyor',
      yeni.includes('f-urn-gercek'));

    kontrol('B-4 Yeni filtre MOCK kaydını sorguya SOKMUYOR',
      !yeni.includes('f-mock'), `sorgulananlar: ${JSON.stringify(yeni)}`);

    kontrol('B-5 Yeni filtre BAŞARISIZ gönderimi sorguya SOKMUYOR',
      !yeni.includes('f-hatali'));

    kontrol('B-6 Yeni filtre ALIŞ faturasını kapsam dışı bırakıyor',
      !yeni.includes('f-alis'));

    kontrol('B-7 Yeni filtre tam olarak 2 kayıt seçti',
      yeni.length === 2, `seçilen: ${JSON.stringify(yeni)}`);

    // ── AYIRT ETME GÜCÜ: eski filtre aynı kurguda ne yapıyordu? ──
    kontrol('B-8 ⚠️⚠️ KONTROL KOŞUMU: eski filtre UYDURMA kaydı SEÇİYOR',
      eski.includes('f-uydurma'),
      `eski sorgulananlar: ${JSON.stringify(eski)} — ayırt etme gücü KANITLANMADI`);

    kontrol('B-9 ⚠️⚠️ KONTROL KOŞUMU: eski filtre ÇIPLAK UUID\'li GERÇEK belgeyi DÜŞÜRÜYOR',
      !eski.includes('f-ciplak-gercek'),
      `eski sorgulananlar: ${JSON.stringify(eski)} — ayırt etme gücü KANITLANMADI`);

    // Kurguda MOCK kaydı çıplak UUID taşır (gerçek verideki gibi). Eski filtre
    // bunu önek yokluğundan DÜŞÜRÜR — kusurun "yanlış dışlama" yönü.
    kontrol('B-10 ⚠️⚠️ KONTROL KOŞUMU: eski filtre MOCK kaydını DÜŞÜRÜYOR',
      !eski.includes('f-mock'),
      `eski sorgulananlar: ${JSON.stringify(eski)} — ayırt etme gücü KANITLANMADI`);

    // ⚠️ Ayrıca: MOCK kaydı `urn:uuid:` ÖNEKLİ olsaydı eski filtre onu SEÇERDİ.
    // Yani eski ölçüt MOCK'u dışlamıyor; yalnız önekin yokluğu dışarıda tutuyor.
    const mockUrnli = {
      invoices: [
        { id: 'f-mock-urn', type: 'SALES', eInvoiceUUID: 'urn:uuid:bb58f0cc-4128-46d9-aa2d-e81bd9f38b7e', eInvoiceStatus: 'MOCK_SENT' },
      ],
      electronicDocuments: [
        { documentType: 'INVOICE', internalDocumentId: 'f-mock-urn', providerId: 'MOCK', status: 'SENT' },
      ],
    };
    kontrol('B-10b ⚠️⚠️ Önekli MOCK kaydı eski filtrede SEÇİLİYOR (kanıt: ölçüt MOCK bilmiyor)',
      filtreEski(mockUrnli).length === 1 && filtreGonderimIzli(mockUrnli).length === 0,
      `eski: ${filtreEski(mockUrnli).length} | yeni: ${filtreGonderimIzli(mockUrnli).length}`);

    const ayni = JSON.stringify(yeni) === JSON.stringify(eski);
    kontrol('B-11 ⚠️⚠️ İki filtre AYNI sonucu vermiyor (düzeltme anlamlı)',
      !ayni, `yeni: ${JSON.stringify(yeni)} eski: ${JSON.stringify(eski)}`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('C. GERÇEK VERİ — canlı DB üzerinde filtre karşılaştırması');
  // ═════════════════════════════════════════════════════════════════════════

  {
    const canli: any = storage.getState();
    const yeni = filtreGonderimIzli(canli);
    const eski = filtreEski(canli);

    console.log(`     eski filtre → ${eski.length} kayıt: ${JSON.stringify(eski.map((i: any) => i.invoiceNo))}`);
    console.log(`     yeni filtre → ${yeni.length} kayıt: ${JSON.stringify(yeni.map((i: any) => i.invoiceNo))}`);

    // ⚠️ C-1 doğrudan canlı veride ölçülemez: veri temizlendi ve uydurma kayıt
    // kalmadı. Kanıt, temizlik ÖNCESİ alınan yedekte aranır — bu, kusurun
    // gerçekten var olduğunun ve düzeltmenin onu kapatığının kanıtıdır.
    const yedekler = fs.readdirSync(path.join(PROJE_KOK, 'data'))
      .filter(f => f.startsWith('database.yedek-') && f.endsWith('.json'))
      .sort();
    let yedekteEskiSecim = -1;
    let yedekAdi = '(yedek yok)';
    for (const y of yedekler) {
      try {
        const ydb = JSON.parse(fs.readFileSync(path.join(PROJE_KOK, 'data', y), 'utf8'));
        const sec = filtreEski(ydb);
        if (sec.some((i: any) => UYDURMA_DESEN.test(String(i.eInvoiceUUID)))) {
          yedekteEskiSecim = sec.length; yedekAdi = y;
        }
      } catch { /* bozuk yedeği atla */ }
    }
    kontrol('C-1 ⚠️ Yedekte: eski filtre uydurma ETTN\'li kaydı SEÇİYORDU (kusur gerçekti)',
      yedekteEskiSecim >= 1,
      `tarandı: ${yedekler.length} yedek, seçim bulunan: ${yedekAdi}`);
    if (yedekteEskiSecim >= 1) console.log(`     yedek: ${yedekAdi} → eski filtre ${yedekteEskiSecim} kayıt seçiyordu`);

    kontrol('C-1b ⚠️ Aynı filtre GÜNCEL veride hiçbir uydurma kaydı seçmiyor',
      eski.length === 0,
      `güncel eski-filtre seçimi: ${JSON.stringify(eski.map((i: any) => i.invoiceNo))}`);

    kontrol('C-2 ⚠️ Yeni filtre uydurma ETTN\'li kaydı SEÇMİYOR',
      !yeni.some((i: any) => UYDURMA_DESEN.test(String(i.eInvoiceUUID))),
      `yeni seçim: ${JSON.stringify(yeni.map((i: any) => i.eInvoiceUUID))}`);

    kontrol('C-3 Yeni filtrede seçilen her kaydın MOCK olmayan gönderim izi var',
      yeni.every((inv: any) => (canli.electronicDocuments || []).some((d: any) =>
        d.internalDocumentId === inv.id
        && String(d.providerId).toUpperCase() !== 'MOCK'
        && ['SENT', 'DELIVERED', 'ACCEPTED'].includes(String(d.status)))));
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('D. MOCK AYRIMI — kuyruk kaynağı ve arayüz eşlemeleri');
  // ═════════════════════════════════════════════════════════════════════════

  {
    const kuyrukKod = oku('server/services/electronicDocumentQueue.ts');
    kontrol('D-1 `electronicDocumentQueue.ts` kaynağı okundu', kuyrukKod.length > 0);

    const kosulluYazim = kodSatirlari(kuyrukKod)
      .filter(l => /syncErpDocumentStatus\(\s*doc\s*,\s*isTestProvider\s*\?/.test(l));
    kontrol('D-2 ⚠️ `syncErpDocumentStatus` MOCK ayrımı YAPIYOR',
      kosulluYazim.length === 1,
      `eşleşen satır: ${JSON.stringify(kosulluYazim.map(l => l.trim()))}`);

    const kosulsuzYazim = kodSatirlari(kuyrukKod)
      .filter(l => /syncErpDocumentStatus\(\s*doc\s*,\s*'SENT'\s*\)/.test(l));
    kontrol('D-3 ⚠️ Koşulsuz `syncErpDocumentStatus(doc, \'SENT\')` KALMADI',
      kosulsuzYazim.length === 0,
      `kalan satırlar: ${JSON.stringify(kosulsuzYazim.map(l => l.trim()))}`);

    kontrol('D-4 MOCK için `MOCK_SENT` yazılıyor',
      /isTestProvider\s*\?\s*'MOCK_SENT'\s*:\s*'SENT'/.test(kuyrukKod));

    // ── Arayüz: MOCK_SENT "gönderildi" SAYILMAMALI ──
    const modalKod = oku('src/components/modules/edonusum/OfficialEInvoiceViewerModal.tsx');
    const listeKod = oku('src/components/modules/satis/InvoiceListView.tsx');
    const rozetKod = oku('src/components/ui/StatusBadge.tsx');

    kontrol('D-5 `OfficialEInvoiceViewerModal.tsx` kaynağı okundu', modalKod.length > 0);
    kontrol('D-6 `InvoiceListView.tsx` kaynağı okundu', listeKod.length > 0);
    kontrol('D-7 `StatusBadge.tsx` kaynağı okundu', rozetKod.length > 0);

    // isSent eşitlik zinciri MOCK_SENT'i İÇERMEMELİ (içerseydi "GİB İletildi" olurdu).
    const isSentZincirleri = [
      ...kodSatirlari(modalKod), ...kodSatirlari(listeKod),
    ].filter(l => /const isSent\s*=/.test(l));

    kontrol('D-8 ⚠️ Hiçbir `isSent` zinciri `MOCK_SENT` İÇERMİYOR',
      isSentZincirleri.length > 0 && isSentZincirleri.every(l => !l.includes('MOCK_SENT')),
      `incelenen satırlar: ${JSON.stringify(isSentZincirleri.map(l => l.trim()))}`);

    kontrol('D-9 Görüntüleyici `MOCK_SENT` için AYRI etiket gösteriyor',
      /isMockSent/.test(modalKod) && /Gönderilmedi/.test(modalKod));

    kontrol('D-10 Fatura listesi `MOCK_SENT` için AYRI etiket gösteriyor',
      /isMockSent/.test(listeKod) && /Gönderilmedi/.test(listeKod));

    kontrol('D-11 `StatusBadge` `MOCK_SENT`\'i tanıyor (ham değer gösterilmiyor)',
      /case\s*'MOCK_SENT'/.test(rozetKod));

    // ── Tip ve karşılaştırma güvenliği ──
    const tipDosya = oku('server/db/schema.ts');
    kontrol('D-12 `MOCK_SENT` tip birliğini KIRMIYOR (`| string` var)',
      /eInvoiceStatus\?:\s*[^;]*\|\s*string\s*;/.test(tipDosya));

    // ── Durum karşılaştırmaları MOCK_SENT'i yanlışlıkla "gönderildi" saymamalı ──
    const tehlikeli = kodSatirlari(kuyrukKod).filter(l => /['"]SENT['"]/.test(l) && /MOCK_SENT/.test(l) && !/isTestProvider/.test(l));
    kontrol('D-13 `MOCK_SENT` tehlikeli bir `SENT` karşılaştırmasına girmedi',
      tehlikeli.length === 0, `kalan: ${JSON.stringify(tehlikeli.map(l => l.trim()))}`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('E. VERİ DURUMU — gönderim izi olmayan "gönderilmiş" kayıt kaldı mı?');
  // ═════════════════════════════════════════════════════════════════════════

  {
    const canli: any = storage.getState();
    const supheli = (canli.invoices || []).filter((inv: any) => {
      if (!['SENT', 'DELIVERED', 'ACCEPTED'].includes(String(inv.eInvoiceStatus))) return false;
      const iz = (canli.electronicDocuments || []).find((d: any) =>
        d.internalDocumentId === inv.id
        && String(d.providerId).toUpperCase() !== 'MOCK'
        && ['SENT', 'DELIVERED', 'ACCEPTED'].includes(String(d.status)));
      return !iz;
    });

    for (const s of supheli) {
      console.log(`     ⚠️ ${s.id} | ${s.invoiceNo} | ${s.eInvoiceStatus} | iz YOK`);
    }
    kontrol('E-1 ⚠️ Gönderim izi olmayan "gönderilmiş" fatura KALMADI',
      supheli.length === 0, `kalan: ${supheli.length}`);

    const mockKalan = (canli.invoices || []).filter((i: any) => i.eInvoiceStatus === 'SENT'
      && (canli.electronicDocuments || []).some((d: any) => d.internalDocumentId === i.id && String(d.providerId).toUpperCase() === 'MOCK'));
    kontrol('E-2 ⚠️ MOCK kaynaklı fatura hâlâ `SENT` görünmüyor',
      mockKalan.length === 0,
      `kalan: ${JSON.stringify(mockKalan.map((i: any) => `${i.id}(${i.eInvoiceStatus})`))}`);

    const uydurmaKalan = (canli.invoices || []).filter((i: any) => UYDURMA_DESEN.test(String(i.eInvoiceUUID || '')));
    kontrol('E-3 Uydurma ETTN deseni taşıyan kayıt kalmadı',
      uydurmaKalan.length === 0,
      `kalan: ${JSON.stringify(uydurmaKalan.map((i: any) => i.id))}`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('F. REGRESYON — mevcut uçlar bozulmadı');
  // ═════════════════════════════════════════════════════════════════════════

  {
    // `hizli-bilisim` router'ı gerçek middleware + gerçek JWT ile bağlanır.
    if (!db.tenants) db.tenants = [];
    if (!db.tenants.find((t: any) => t.id === TEST_TENANT)) {
      db.tenants.push({
        id: TEST_TENANT, name: 'Gönderim İzi Test Kiracısı', status: 'ACTIVE',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      } as any);
    }

    const { hizliBilisimRouter } = await import('../routes/hizli-bilisim');
    const app = express();
    app.use(express.json());
    app.use('/api/admin/hizli-bilisim', hizliBilisimRouter as any);

    const srv: http.Server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const adres: any = srv.address();
    baseUrl = `http://127.0.0.1:${adres.port}`;
    console.log(`     (yerel test sunucusu: ${baseUrl} — yalnız 127.0.0.1, dış ağ YOK)`);

    // Token yokken uç 400 dönmeli ve HİÇBİR belge durumu değişmemeli.
    const oncekiDurumlar = JSON.stringify((storage.getState().invoices || []).map((i: any) => `${i.id}:${i.eInvoiceStatus}`));
    const r = await istek('/api/admin/hizli-bilisim/sync-portal-invoices', {});
    const sonrakiDurumlar = JSON.stringify((storage.getState().invoices || []).map((i: any) => `${i.id}:${i.eInvoiceStatus}`));

    kontrol('F-1 Oturum yokken uç 400 döner (uydurma sonuç üretmez)',
      r.status === 400, `status: ${r.status} gövde: ${JSON.stringify(r.body).slice(0, 160)}`);

    kontrol('F-2 ⚠️ Oturum yokken HİÇBİR fatura durumu değişmedi',
      oncekiDurumlar === sonrakiDurumlar);

    kontrol('F-3 Uç, sorgulanabilir belge yokluğunu dürüstçe bildiriyor',
      typeof r.body?.message === 'string' && r.body.message.length > 0);

    await new Promise<void>((resolve) => srv.close(() => resolve()));
  }

  // Kapanış
  console.log('\n' + '='.repeat(72));
  console.log(`  SONUÇ: ${passCount} PASS / ${failCount} FAIL`);
  console.log('  ⛔ Entegratöre çıkılmadı — GERÇEK SANDBOX PASS DEĞİLDİR.');
  console.log('='.repeat(72) + '\n');

  process.exitCode = failCount === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error('\n❌ Test beklenmeyen hata ile durdu:', err);
  process.exit(1);
});
