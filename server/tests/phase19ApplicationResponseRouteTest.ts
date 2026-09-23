/**
 * İŞBEY CLOUD — FAZ 19: `/hizli/application-response` ROUTE TESTİ
 * ================================================================
 *
 * NE İÇİN YAZILDI (`docs/44` §1)
 *   Route, `Documents[].DocumentUUID` için kaydın GERÇEK `eInvoiceUUID` (ETTN)
 *   alanını çözümlemekle yükümlüdür. Önceden istemciden gelen ham değer doğrudan
 *   gövdeye yazılıyordu. Bu süit route'un kararını GERÇEK HTTP üzerinden ölçer:
 *     - İstemci `inv.id` gönderse bile gövdeye ETTN gider.
 *     - İstemci ETTN gönderirse de aynı sonuç.
 *     - ETTN yoksa **400** döner ve entegratöre HİÇ çağrı GİTMEZ.
 *     - Belge yoksa **400**.
 *     - `responseType` geçersizse **400**.
 *
 * KAPSAM VE DÜRÜSTLÜK SINIRI
 *   Entegratör çağrısı `HizliConnectService.sendApplicationResponse` düzeyinde
 *   **taklit edilir** (casus). Sunucu ve route GERÇEKTİR, auth middleware GERÇEKTİR.
 *   ⛔ BU SÜİT GERÇEK SANDBOX PASS DEĞİLDİR. Gerçek entegratör yanıtı görülmemiştir.
 *   ⛔ Belge gönderilmez, iptal edilmez, kontör yakılmaz. Ağa çıkılmaz.
 *
 * Çalıştır (Windows, proje kökünde):
 *   npx tsx server/tests/phase19ApplicationResponseRouteTest.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { storage } from '../db/storage';
import { HizliConnectService } from '../services/hizliConnectService';

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
const TEST_TENANT = 'tnt-isbey';
const TEST_ETTN = 'urn:uuid:7c89b21f-8294-4d81-9872-918239019283';
const TEST_INV_ID = 'inv-route-test-1';

// ─── Casus: entegratöre giden çağrıyı kaydeder, ağa ÇIKMAZ ───────────────────

const gonderilenler: any[] = [];
const gercekSendAppResponse = (HizliConnectService as any).sendApplicationResponse;

function casusuKur() {
  gonderilenler.length = 0;
  (HizliConnectService as any).sendApplicationResponse = async (payload: any, token: string, isTest: boolean) => {
    gonderilenler.push({ payload, token, isTest });
    return { success: true, isSeviyesi: 'basarili', message: 'OK', data: { IsSucceeded: true } };
  };
}
function casusuKaldir() { (HizliConnectService as any).sendApplicationResponse = gercekSendAppResponse; }

// ─── Test verisi ──────────────────────────────────────────────────────────────

function hazirlaFatura(opts: { ettn?: string | null } = {}) {
  const db = storage.getState();
  if (!db.invoices) db.invoices = [];
  db.invoices = db.invoices.filter((i: any) => i.id !== TEST_INV_ID);
  db.invoices.push({
    id: TEST_INV_ID,
    tenantId: TEST_TENANT,
    invoiceNo: 'EFT202600009988',
    date: '2026-08-27',
    type: 'PURCHASE',
    status: 'ACTIVE',
    isIncomingEInvoice: true,
    eInvoiceStatus: 'APPROVED',
    ...(opts.ettn === null ? {} : { eInvoiceUUID: opts.ettn ?? TEST_ETTN }),
    items: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);

  // Route'un kullandığı global hizliConfig token'ı dolu olsun.
  const hc = (HizliConnectService as any);
  if (hc && hc.tokenStore) hc.tokenStore.token = 'sahte-token-degeri';
  const dbAny: any = storage.getState();
  if (!dbAny.hizliConfig) dbAny.hizliConfig = {};
  return TEST_INV_ID;
}

// ─── HTTP yardımcıları ────────────────────────────────────────────────────────

let baseUrl = '';
let token = '';

async function post(path: string, body: any): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  let parsed: any = null;
  try { parsed = await res.json(); } catch { parsed = null; }
  return { status: res.status, body: parsed };
}

// ─── Ana Akış ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '='.repeat(72));
  console.log('  İŞBEY CLOUD — FAZ 19 ROUTE TESTİ (/hizli/application-response)');
  console.log('='.repeat(72));
  console.log('  ⛔ Entegratör çağrısı CASUS ile taklit edilir. GERÇEK SANDBOX PASS DEĞİLDİR.');
  console.log('  ⛔ Belge gönderilmedi, iptal edilmedi, kontör yakılmadı.');

  if (!JWT_SECRET) {
    console.error('❌ JWT_SECRET tanımlı değil (.env). Test koşulamaz.');
    process.exit(1);
  }

  // Kullanıcı: route'un bulacağı gerçek bir kullanıcı kullanılır.
  const db: any = storage.getState();
  const kullanici = (db.users || [])[0];
  if (!kullanici) { console.error('❌ DB\'de kullanıcı yok.'); process.exit(1); }

  token = jwt.sign(
    { userId: kullanici.id, username: kullanici.username, role: kullanici.role, tenantId: TEST_TENANT },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Gerçek route'u gerçek middleware ile bağla.
  const { default: efaturaRouter } = await import('../routes/efatura');
  const app = express();
  app.use(express.json());
  app.use('/api/efatura', efaturaRouter as any);

  const srv: http.Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const adres: any = srv.address();
  baseUrl = `http://127.0.0.1:${adres.port}`;
  console.log(`  (yerel test sunucusu: ${baseUrl} — yalnız 127.0.0.1, dış ağ YOK)\n`);

  casusuKur();

  // ═════════════════════════════════════════════════════════════════════════
  bolum('A. KİMLİK ÇÖZÜMLEMESİ — gövdeye ETTN gider, `inv.id` DEĞİL');
  // ═════════════════════════════════════════════════════════════════════════

  {
    const id = hazirlaFatura();
    casusuKur();

    // İstemci ESKİ davranışı taklit ediyor: iç kayıt kimliğini gönderiyor.
    const r = await post('/api/efatura/hizli/application-response', {
      uuid: id, responseType: 'KABUL', reason: 'test',
    });

    kontrol('A-1 İstek 200 döndü', r.status === 200, `status: ${r.status} gövde: ${JSON.stringify(r.body)}`);
    kontrol('A-2 Entegratöre çağrı gitti', gonderilenler.length === 1);
    kontrol('A-3 ⚠️ Gövdeye ETTN gitti (istemci `inv.id` göndermiş olsa bile)',
      gonderilenler[0]?.payload?.documentUuid === TEST_ETTN,
      `gelen: ${gonderilenler[0]?.payload?.documentUuid}`);
    kontrol('A-4 ⚠️ Gövdeye `inv.id` GİTMEDİ',
      gonderilenler[0]?.payload?.documentUuid !== id);
    kontrol('A-5 DocumentId doğru', gonderilenler[0]?.payload?.documentId === 'EFT202600009988');
    kontrol('A-6 DocumentDate doğru', gonderilenler[0]?.payload?.documentDate === '2026-08-27');
    kontrol('A-7 ResponseCode "KABUL"', gonderilenler[0]?.payload?.responseCode === 'KABUL');
  }

  {
    const id = hazirlaFatura();
    casusuKur();

    // İstemci YENİ davranışı: doğrudan ETTN gönderiyor.
    const r = await post('/api/efatura/hizli/application-response', {
      uuid: TEST_ETTN, responseType: 'KABUL',
    });

    kontrol('A-8 İstemci ETTN gönderdiğinde de 200', r.status === 200);
    kontrol('A-9 Gövdeye aynı ETTN gitti', gonderilenler[0]?.payload?.documentUuid === TEST_ETTN);
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('B. ⚠️ ETTN YOKSA — 400, entegratöre HİÇ çağrı GİTMEZ');
  // ═════════════════════════════════════════════════════════════════════════

  {
    const id = hazirlaFatura({ ettn: null });
    casusuKur();

    const r = await post('/api/efatura/hizli/application-response', {
      uuid: id, responseType: 'KABUL',
    });

    kontrol('B-1 ETTN yoksa 400 döndü', r.status === 400, `status: ${r.status}`);
    kontrol('B-2 ⚠️ Entegratöre HİÇ çağrı gitmedi', gonderilenler.length === 0,
      `çağrılar: ${JSON.stringify(gonderilenler)}`);
    kontrol('B-3 Mesaj ETTN eksikliğini söylüyor', /ETTN/i.test(String(r.body?.message || '')),
      `gelen: ${r.body?.message}`);
    kontrol('B-4 success:false', r.body?.success === false);
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('C. DOĞRULAMALAR — eksik/geçersiz gövde');
  // ═════════════════════════════════════════════════════════════════════════

  {
    hazirlaFatura();
    casusuKur();

    const r1 = await post('/api/efatura/hizli/application-response', { responseType: 'KABUL' });
    kontrol('C-1 uuid yoksa 400', r1.status === 400, `status: ${r1.status}`);

    const r2 = await post('/api/efatura/hizli/application-response', { uuid: TEST_INV_ID, responseType: 'FOO' });
    kontrol('C-2 geçersiz responseType 400', r2.status === 400, `status: ${r2.status}`);

    const r3 = await post('/api/efatura/hizli/application-response', { uuid: 'yok-boyle-bir-id', responseType: 'KABUL' });
    kontrol('C-3 kayıt yoksa 400', r3.status === 400, `status: ${r3.status}`);
    kontrol('C-4 Mesaj kaydın bulunamadığını söylüyor',
      /bulunamad|ETTN/i.test(String(r3.body?.message || '')), `gelen: ${r3.body?.message}`);

    kontrol('C-5 ⚠️ Bu üç geçersiz istekte entegratöre HİÇ çağrı gitmedi',
      gonderilenler.length === 0, `çağrılar: ${gonderilenler.length}`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('D. RED — aynı route, ResponseCode "RED"');
  // ═════════════════════════════════════════════════════════════════════════

  {
    const id = hazirlaFatura();
    casusuKur();

    const r = await post('/api/efatura/hizli/application-response', {
      uuid: id, responseType: 'RED', reason: 'İçerik uyumsuz',
    });

    kontrol('D-1 RED isteği 200', r.status === 200);
    kontrol('D-2 ResponseCode "RED"', gonderilenler[0]?.payload?.responseCode === 'RED');
    kontrol('D-3 Red nedeni taşındı',
      gonderilenler[0]?.payload?.responseDescription === 'İçerik uyumsuz');
    kontrol('D-4 Kimlik yine ETTN', gonderilenler[0]?.payload?.documentUuid === TEST_ETTN);
  }

  // ═════════════════════════════════════════════════════════════════════════
  bolum('E. AUTH — token olmadan erişilemez');
  // ═════════════════════════════════════════════════════════════════════════

  {
    hazirlaFatura();
    casusuKur();

    const res = await fetch(`${baseUrl}/api/efatura/hizli/application-response`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid: TEST_INV_ID, responseType: 'KABUL' }),
    });
    let b: any = null; try { b = await res.json(); } catch { /* boş */ }

    kontrol('E-1 Token yoksa 401', res.status === 401, `status: ${res.status}`);
    kontrol('E-2 Entegratöre çağrı gitmedi', gonderilenler.length === 0,
      `gelen: ${JSON.stringify(b)}`);
  }

  // Kapanış
  casusuKaldir();
  await new Promise<void>((resolve) => srv.close(() => resolve()));

  console.log('\n' + '='.repeat(72));
  console.log(`  SONUÇ: ${passCount} PASS / ${failCount} FAIL`);
  console.log('  ⛔ Bu sonuç CASUS tabanlıdır — gerçek sandbox PASS DEĞİLDİR.');
  console.log('='.repeat(72) + '\n');

  process.exitCode = failCount === 0 ? 0 : 1;
}

main().catch((err) => {
  casusuKaldir();
  console.error('\n❌ Test beklenmeyen hata ile durdu:', err);
  process.exit(1);
});
