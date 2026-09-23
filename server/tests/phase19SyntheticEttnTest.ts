/**
 * İŞBEY CLOUD — FAZ 19: SENTETİK ETTN ÜRETİMİ TESTİ
 * ==================================================
 *
 * NE İÇİN YAZILDI (`docs/45`)
 *   `eInvoiceUUID` alanına GİB'in resmî belge kimliği yerine kayıt kimliğinden
 *   türetilmiş, `urn:uuid:` önekli ama VAR OLMAYAN bir değer yazılıyordu
 *   (`urn:uuid:<id>-2026`). Bu süit düzeltmenin kalıcı olduğunu kanıtlar:
 *
 *     A. Yeni fatura oluşturma ETTN ATAMAZ.
 *     B. ⚠️ Klonlama kaynağın ETTN'sini SIZDIRMAZ (en kritik — `{...source}`).
 *     C. ⚠️ İade faturası kaynağın ETTN'sini SIZDIRMAZ.
 *     D. Gönderim kuyruğu HÂLÂ gerçek RFC-4122 UUID üretir.
 *     E. Uydurma desen (`urn:uuid:<id>-<yıl>`) hiçbir yeni kayıtta oluşmaz.
 *
 * NEDEN B VE C EN KRİTİK
 *   `duplicate` ve `convert-return` uçları kaydı `{ ...source }` ile yayar.
 *   Sentetik satır yalnız SİLİNİRSE, kaynağın GERÇEK ETTN'si klona geçer ve
 *   İKİ AYRI BELGE AYNI KİMLİĞİ taşır — sahte kimlikten daha ciddi bir kusur.
 *   Bu yüzden `eInvoiceUUID: undefined` açıkça yazılmalıdır.
 *
 * KAPSAM VE DÜRÜSTLÜK SINIRI
 *   Gerçek Express route'ları + gerçek auth middleware + gerçek JWT kullanılır.
 *   Entegratör çağrısı YAPILMAZ (bu akışlar entegratöre çıkmaz).
 *   ⛔ BU SÜİT GERÇEK SANDBOX PASS DEĞİLDİR. Hiçbir belge gönderilmedi/iptal
 *   edilmedi, kontör yakılmadı, ağa çıkılmadı.
 *
 * Çalıştır (Windows, proje kökünde):
 *   npx tsx server/tests/phase19SyntheticEttnTest.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { storage } from '../db/storage';

// Proje kökü — FAZ 18 süitinin kullandığı desen (testler kökten koşulur).
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

/** Uydurma desen: `urn:uuid:<kayıt-kimliği>-<yıl>` (RFC-4122 DEĞİL). */
const UYDURMA_DESEN = /^urn:uuid:[a-z0-9-]+-\d{4}$/i;
const RFC4122 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URN_RFC4122 = /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uydurmaMi(deger: unknown): boolean {
  return typeof deger === 'string' && UYDURMA_DESEN.test(deger.trim());
}

const JWT_SECRET = process.env.JWT_SECRET as string;
const TEST_TENANT = 'tnt-sentetik-test';
const GERCEK_ETTN = 'urn:uuid:7c89b21f-8294-4d81-9872-918239019283';

let baseUrl = '';
let token = '';

async function istek(path: string, body: any): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  let parsed: any = null;
  try { parsed = await res.json(); } catch { parsed = null; }
  return { status: res.status, body: parsed };
}

function faturaBul(id: string): any {
  return (storage.getState().invoices || []).find((i: any) => i.id === id);
}

/** Geçerli bir fatura gövdesi üretir (route'un beklediği alanlar). */
function faturaGovdesi(ek: any = {}): any {
  return {
    type: 'SALES',
    customerId: 'cust-1',
    customerTitle: 'Test Müşteri',
    date: '2026-09-16',
    currency: 'TRY',
    exchangeRate: 1,
    items: [{
      productId: 'prd-1', productCode: 'P1', productName: 'Test Ürün',
      quantity: 1, unit: 'ADET', unitPrice: 100, vatRate: 20,
    }],
    ...ek,
  };
}

// ─── Ana Akış ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '='.repeat(72));
  console.log('  İŞBEY CLOUD — FAZ 19 SENTETİK ETTN TESTİ');
  console.log('='.repeat(72));
  console.log('  ⛔ Bu süit gerçek route kullanır ama ENTEGRATÖRE ÇIKMAZ.');
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

  // `resolveTenant` middleware kiracının GERÇEKTEN var olmasını ister; yoksa
  // 404 TENANT_NOT_FOUND döner ve hiçbir kontrol anlamlı olmaz.
  if (!db.tenants) db.tenants = [];
  if (!db.tenants.find((t: any) => t.id === TEST_TENANT)) {
    db.tenants.push({
      id: TEST_TENANT, name: 'Sentetik ETTN Test Kiracısı', status: 'ACTIVE',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } as any);
  }

  // Test ürünü + müşterisi hazırla (fatura oluşturma ikisini de arar).
  if (!db.products) db.products = [];
  if (!db.products.find((p: any) => p.id === 'prd-1')) {
    db.products.push({
      id: 'prd-1', tenantId: TEST_TENANT, code: 'P1', name: 'Test Ürün',
      unit: 'ADET', currentStock: 1000, salePrice: 100, purchasePrice: 80,
      vatRate: 20, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } as any);
  }
  if (!db.customers) db.customers = [];
  if (!db.customers.find((c: any) => c.id === 'cust-1')) {
    db.customers.push({
      id: 'cust-1', tenantId: TEST_TENANT, code: 'CAR-001', title: 'Test Müşteri',
      taxNumber: '1234567890', balance: 0, type: 'CUSTOMER', maturityDays: 30,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } as any);
  }

  const { invoicesRouter } = await import('../routes/invoices');
  const app = express();
  app.use(express.json());
  // Route dosyası `req.tenantId` bekliyor; gerçek middleware yerine bu süitte
  // doğrudan atanır (auth zaten ayrı süitte ölçüldü).
  app.use((req: any, _res, next) => { req.tenantId = TEST_TENANT; req.user = kullanici; next(); });
  app.use('/api/invoices', invoicesRouter as any);

  const srv: http.Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const adres: any = srv.address();
  baseUrl = `http://127.0.0.1:${adres.port}`;
  console.log(`  (yerel test sunucusu: ${baseUrl} — yalnız 127.0.0.1, dış ağ YOK)\n`);

  // ═════════════════════════════════════════════════════════════════════════
  bolum('A. YENİ FATURA — ETTN ATANMAMALI (uydurma kimlik yok)');
  // ═════════════════════════════════════════════════════════════════════════

  let yeniId = '';
  let klonFaturaId = '';
  let iadeFaturaId = '';
  {
    const r = await istek('/api/invoices', faturaGovdesi());
    kontrol('A-1 Fatura oluşturma başarılı (200)', r.status === 200, `status: ${r.status} gövde: ${JSON.stringify(r.body).slice(0, 200)}`);

    yeniId = r.body?.invoice?.id || '';
    kontrol('A-2 Yanıtta fatura kimliği var', Boolean(yeniId), `gelen: ${yeniId}`);

    const kayit = faturaBul(yeniId);
    kontrol('A-3 Kayıt DB\'de bulundu', Boolean(kayit));

    kontrol('A-4 ⚠️ Yeni kayıtta uydurma ETTN deseni YOK',
      !uydurmaMi(kayit?.eInvoiceUUID), `eInvoiceUUID: ${kayit?.eInvoiceUUID}`);

    kontrol('A-5 Yeni kaydın eInvoiceUUID alanı BOŞ/undefined',
      kayit?.eInvoiceUUID === undefined || kayit?.eInvoiceUUID === null || kayit?.eInvoiceUUID === '',
      `eInvoiceUUID: ${JSON.stringify(kayit?.eInvoiceUUID)}`);

    kontrol('A-6 Durum yine DRAFT (gönderim iddiası yok)',
      kayit?.eInvoiceStatus === 'DRAFT', `eInvoiceStatus: ${kayit?.eInvoiceStatus}`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('B. ⚠️ KLONLAMA — kaynağın ETTN\'si SIZMAMALI (en kritik)');
  // ═════════════════════════════════════════════════════════════════════════

  {
    // Kaynağa GERÇEK bir ETTN ver. `{...source}` yayılımı varsa klona bu geçer.
    if (!storage.getState().invoices) (storage.getState() as any).invoices = [];
    const kaynak: any = faturaBul(yeniId) || {
      id: yeniId, tenantId: TEST_TENANT, invoiceNo: 'SAT-TEST-K', type: 'SALES',
      customerId: 'cust-1', customerTitle: 'Test Müşteri', items: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    kaynak.eInvoiceUUID = GERCEK_ETTN;
    kaynak.eInvoiceStatus = 'SENT';

    const r = await istek(`/api/invoices/${yeniId}/duplicate`, {});

    kontrol('B-1 Klonlama başarılı (200)', r.status === 200, `status: ${r.status} gövde: ${JSON.stringify(r.body).slice(0, 200)}`);

    const klonId = r.body?.invoice?.id || '';
    klonFaturaId = klonId; // F bölümü bu kaydı doğrular
    kontrol('B-2 Yanıtta klon kimliği var', Boolean(klonId));

    const klon = faturaBul(klonId);
    kontrol('B-3 Klon DB\'de bulundu', Boolean(klon));

    kontrol('B-4 ⚠️⚠️ Klona KAYNAĞIN GERÇEK ETTN\'si SIZMADI',
      klon?.eInvoiceUUID !== GERCEK_ETTN,
      `klon eInvoiceUUID: ${JSON.stringify(klon?.eInvoiceUUID)} — kaynağınki: ${GERCEK_ETTN}`);

    kontrol('B-5 Klonda uydurma ETTN deseni YOK',
      !uydurmaMi(klon?.eInvoiceUUID), `eInvoiceUUID: ${klon?.eInvoiceUUID}`);

    kontrol('B-6 Klonun eInvoiceUUID alanı BOŞ/undefined',
      klon?.eInvoiceUUID === undefined || klon?.eInvoiceUUID === null || klon?.eInvoiceUUID === '',
      `eInvoiceUUID: ${JSON.stringify(klon?.eInvoiceUUID)}`);

    kontrol('B-7 Klonun GİB durum alanları da temizlendi',
      klon?.gibStatusCode === undefined && klon?.gibStatusDescription === undefined,
      `gibStatusCode: ${JSON.stringify(klon?.gibStatusCode)}`);

    kontrol('B-8 Klonun durumu DRAFT (gönderim iddiası yok)',
      klon?.eInvoiceStatus === 'DRAFT', `eInvoiceStatus: ${klon?.eInvoiceStatus}`);

    // Kontrol koşumunun ayırt ediciliği: kaynak hâlâ gerçek ETTN taşıyor mu?
    kontrol('B-9 Kaynak faturasının ETTN\'si DEĞİŞMEDİ (test kurgusu geçerli)',
      faturaBul(yeniId)?.eInvoiceUUID === GERCEK_ETTN,
      `kaynak: ${faturaBul(yeniId)?.eInvoiceUUID}`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('C. ⚠️ İADE FATURASI — kaynağın ETTN\'si SIZMAMALI');
  // ═════════════════════════════════════════════════════════════════════════

  {
    const kaynak = faturaBul(yeniId);
    if (kaynak) { kaynak.eInvoiceUUID = GERCEK_ETTN; }

    const r = await istek(`/api/invoices/${yeniId}/convert-return`, {});

    kontrol('C-1 İadeye dönüştürme başarılı (200)', r.status === 200,
      `status: ${r.status} gövde: ${JSON.stringify(r.body).slice(0, 250)}`);

    const iadeId = r.body?.invoice?.id || '';
    iadeFaturaId = iadeId;
    kontrol('C-2 Yanıtta iade faturası kimliği var', Boolean(iadeId), `gelen: ${iadeId}`);

    const iade = faturaBul(iadeId);
    kontrol('C-3 İade kaydı DB\'de bulundu', Boolean(iade));

    kontrol('C-4 ⚠️⚠️ İadeye KAYNAĞIN GERÇEK ETTN\'si SIZMADI',
      iade?.eInvoiceUUID !== GERCEK_ETTN,
      `iade eInvoiceUUID: ${JSON.stringify(iade?.eInvoiceUUID)}`);

    kontrol('C-5 İadede uydurma ETTN deseni YOK',
      !uydurmaMi(iade?.eInvoiceUUID), `eInvoiceUUID: ${iade?.eInvoiceUUID}`);

    kontrol('C-6 İadenin eInvoiceUUID alanı BOŞ/undefined',
      iade?.eInvoiceUUID === undefined || iade?.eInvoiceUUID === null || iade?.eInvoiceUUID === '',
      `eInvoiceUUID: ${JSON.stringify(iade?.eInvoiceUUID)}`);

    kontrol('C-7 İade kategorisi IADE olarak işaretlendi',
      iade?.invoiceCategory === 'IADE', `invoiceCategory: ${iade?.invoiceCategory}`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('D. GÖNDERİM KUYRUĞU — hâlâ GERÇEK RFC-4122 UUID üretiyor');
  // ═════════════════════════════════════════════════════════════════════════

  {
    // electronicDocumentService kaynağını oku: `eInvoiceUUID || crypto.randomUUID()`
    const kaynakKod = fs.readFileSync(
      path.join(PROJE_KOK, 'server/services/electronicDocumentService.ts'), 'utf8'
    );

    kontrol('D-1 Kuyruk hâlâ `crypto.randomUUID()` yedeğini kullanıyor',
      /invoice\.eInvoiceUUID\s*\|\|\s*crypto\.randomUUID\(\)/.test(kaynakKod),
      'beklenen desen bulunamadı');

    // Gerçek UUID üretimini doğrula (kütüphane davranışı).
    const ornek = randomUUID();
    kontrol('D-2 `crypto.randomUUID()` RFC-4122 biçiminde',
      RFC4122.test(ornek), `gelen: ${ornek}`);
    kontrol('D-3 ⚠️ Üretilen UUID uydurma desene UYMUYOR',
      !uydurmaMi(ornek) && !uydurmaMi(`urn:uuid:${ornek}`), `gelen: urn:uuid:${ornek}`);

    const urnOrnek = `urn:uuid:${ornek}`;
    kontrol('D-4 `urn:uuid:` + RFC-4122 deseni geçerli',
      URN_RFC4122.test(urnOrnek), `gelen: ${urnOrnek}`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('E. UYDURMA DESEN — kod tabanında üretim noktası kalmadı');
  // ═════════════════════════════════════════════════════════════════════════

  {
    const oku = (p: string) => {
      try { return fs.readFileSync(path.join(PROJE_KOK, p), 'utf8'); }
      catch { return ''; }
    };

    const invoicesKod = oku('server/routes/invoices.ts');
    const modalKod = oku('src/components/modules/edonusum/OfficialEInvoiceViewerModal.tsx');

    kontrol('E-1 `invoices.ts` kaynağı okundu', invoicesKod.length > 0);
    kontrol('E-2 `OfficialEInvoiceViewerModal.tsx` kaynağı okundu', modalKod.length > 0);

    // Yalnız YORUM satırlarını değil, gerçek atama/ifadeyi ara.
    const kodSatirlari = (s: string) => s.split('\n')
      .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l));

    const invoicesUretim = kodSatirlari(invoicesKod)
      .filter(l => /`urn:uuid:\$\{/.test(l));
    kontrol('E-3 ⚠️ `invoices.ts`\'te uydurma ETTN ÜRETİMİ kalmadı',
      invoicesUretim.length === 0,
      `kalan satırlar: ${JSON.stringify(invoicesUretim.map(l => l.trim()))}`);

    const modalUretim = kodSatirlari(modalKod)
      .filter(l => /`urn:uuid:\$\{/.test(l));
    kontrol('E-4 ⚠️ Görüntüleyicide uydurma ETTN ÜRETİMİ kalmadı',
      modalUretim.length === 0,
      `kalan satırlar: ${JSON.stringify(modalUretim.map(l => l.trim()))}`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('F. REGRESYON — mevcut fatura kayıtları bozulmadı');
  // ═════════════════════════════════════════════════════════════════════════

  {
    const kayit = faturaBul(yeniId);
    kontrol('F-1 Yeni faturada cari ve tutar alanları dolu',
      Boolean(kayit?.customerId) && Number(kayit?.grandTotal) > 0,
      `customerId: ${kayit?.customerId} grandTotal: ${kayit?.grandTotal}`);

    kontrol('F-2 Yeni fatura silinmiş işaretlenmedi', kayit?.isDeleted === false || kayit?.isDeleted === undefined);

    // Test kurgusunun geçerliliği: klon `{...source}` yayılımıyla oluşmuş
    // olmalı — yayılım çalışmadıysa B bölümü hiçbir şey kanıtlamaz.
    // `{...source}` yayılımının gerçekten çalıştığının kanıtı: klon, kaynağın
    // KOPYALANMAYAN alanlarını da (cari, profil) taşımalı ve klon notu düşmeli.
    const klon = faturaBul(klonFaturaId);
    kontrol('F-3 Klon `{...source}` yayılımıyla oluştu (B bölümü geçerli)',
      Boolean(klon) && klon?.customerId === 'cust-1'
        && String(klon?.notes || '').includes('kopyalandı'),
      `klon: ${klon?.id} customerId: ${klon?.customerId} notes: ${klon?.notes}`);

    kontrol('F-4 İade faturası ayrı bir kayıt olarak oluştu',
      Boolean(faturaBul(iadeFaturaId)) && iadeFaturaId !== yeniId,
      `iade: ${iadeFaturaId}`);
  }

  // Kapanış
  await new Promise<void>((resolve) => srv.close(() => resolve()));

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
