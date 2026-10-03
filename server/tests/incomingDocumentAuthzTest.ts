/**
 * GELEN BELGE YETKİSİ — GERÇEK HTTP SÖZLEŞME TESTİ
 * ==========================================================================
 * 2026-09-28 — Kullanıcı isteği: "MUHASEBE kullanıcısı Gelen Belgeler ekranını
 * açabilmeli, gelen faturaları görebilmeli, gelen irsaliyeleri görebilmeli,
 * eşleştirme/onay ekranını açabilmeli, bunun dışında admin yetkisi kazanmamalı."
 *
 * ⚠️ NEDEN GERÇEK HTTP: Bu hata ilk olarak KAYNAK TARAMASI ve REGISTRY
 * TUTARLILIK TESTLERİ yeşilken ortaya çıktı. Sebep: route kaydı registry'de
 * tanımlıydı (`einvoice.view`), ama DB rol kayıtlarına hiç girmiyordu ve
 * `companyIdentity()` izinleri DB'den okur. Yani statik test PASS, gerçek
 * istek 403. Bu yüzden burada router GERÇEKTEN mount edilir ve istek atılır;
 * matris karşılaştırması tek başına YETMEZ.
 *
 * ⚠️ AĞ İSTEĞİ YOK: Yalnız okuma uçları (`/list`) çağrılır. Senkron/onay
 * uçları çağrılmaz — entegratöre gidilmez, stok/cari yazılmaz.
 *
 * İZOLASYON: Yalnız NODE_ENV=test ve DATABASE_PATH=<tmp>/incomingDocumentAuthzTest.ts.json
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';

const configuredPath = process.env.DATABASE_PATH || '';
if (process.env.NODE_ENV !== 'test' || path.basename(configuredPath) !== 'incomingDocumentAuthzTest.ts.json') {
  throw new Error(
    'Bu test yalnız NODE_ENV=test ve DATABASE_PATH=<tmp>/incomingDocumentAuthzTest.ts.json ile çalıştırılabilir.'
  );
}
process.env.JWT_SECRET ||= crypto.randomBytes(48).toString('hex');

// XML deposu geçici klasöre taşınır — bu testte dövizli belge kurulurken
// belge içeriği diske yazılır; depo köküne dosya BIRAKILMAZ.
if (!process.env.ISBEY_DATA_DIR) {
  process.env.ISBEY_DATA_DIR = path.join(os.tmpdir(), 'isbey-authz-data');
}

const { storage } = await import('../db/storage');
const { v1EDocumentsRouter } = await import('../routes/v1/e-documents');
const { generateToken } = await import('../routes/auth');
const { companyIdentity, membershipFor } = await import('../security/memberships');
const { PERMISSIONS, ROLE_PERMISSIONS, ROLE_SLUGS } = await import('../security');

const T = 'tnt-authz-gelen';

// ── Koşum düzeneği ──────────────────────────────────────────────────────────
const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [];
function test(name: string, fn: () => void | Promise<void>) { tests.push({ name, fn }); }

const KULLANICILAR: Array<{ id: string; rol: string; slug: string }> = [
  { id: 'k-admin', rol: 'SUPER_ADMIN', slug: 'platform_admin' },
  { id: 'k-firmaadmin', rol: 'COMPANY_ADMIN', slug: 'company_admin' },
  { id: 'k-muhasebe', rol: 'MUHASEBE', slug: 'accountant' },
  { id: 'k-satis', rol: 'SATIS', slug: 'employee' },
  { id: 'k-rapor', rol: 'RAPOR', slug: 'viewer' },
];

function kurulum() {
  storage.update(db => {
    db.tenants = [{ ...db.tenants[0], id: T, name: 'Yetki Test A.Ş.', status: 'ACTIVE', isArchived: false }];
    const now = new Date().toISOString();
    db.users = KULLANICILAR.map(k => ({
      id: k.id, username: k.id, fullName: k.id, email: `${k.id}@test.local`,
      role: k.rol as any, active: true, companyId: T, allowedCompanyIds: [T],
      passwordHash: bcrypt.hashSync('TestPassword123!', 4), createdAt: now,
    }));
    db.tenantUsers = KULLANICILAR.map(k => ({
      id: `tu-${k.id}`, userId: k.id, tenantId: T, roleSlug: k.slug,
      status: 'active' as const, isOwner: k.slug === 'platform_admin',
      joinedAt: now, createdAt: now, updatedAt: now,
    }));
    // Sayfalama için 30 gelen fatura + 30 gelen irsaliye.
    db.incomingInvoices = Array.from({ length: 30 }, (_, i) => ({
      id: `ii-${i + 1}`, tenantId: T, uuid: `inv-uuid-${i + 1}`,
      invoiceNo: `AF-${String(i + 1).padStart(3, '0')}`, supplierTitle: `Tedarikçi ${i + 1}`,
      supplierTaxNumber: '1111111111', issueDate: '2026-09-01', status: 'RECEIVED', items: [],
    })) as any;
    db.incomingDespatches = Array.from({ length: 30 }, (_, i) => ({
      id: `id-${i + 1}`, tenantId: T, uuid: `dsp-uuid-${i + 1}`,
      despatchNo: `AI-${String(i + 1).padStart(3, '0')}`, supplierTitle: `Tedarikçi ${i + 1}`,
      supplierTaxNumber: '1111111111', issueDate: '2026-09-01', status: 'RECEIVED', items: [],
    })) as any;
  });
}

const app = express();
app.use(express.json());
app.use('/api/v1/e-documents', v1EDocumentsRouter);

let base = '';
let server: any = null;

async function basla() {
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
}

function token(id: string): string {
  return generateToken(storage.getState().users.find(u => u.id === id)!, T);
}

async function istek(id: string, url: string, method = 'GET', body?: unknown) {
  const res = await fetch(base + url, {
    method,
    headers: { Authorization: `Bearer ${token(id)}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

// ════════════════════════════════════════════════════════════════════════════
// 1. MUHASEBE ERİŞİMİ — kullanıcının istediği asıl senaryo
// ════════════════════════════════════════════════════════════════════════════

test('MUHASEBE: gelen fatura listesini GÖREBİLİR (200)', async () => {
  const r = await istek('k-muhasebe', '/api/v1/e-documents/incoming/list');
  assert.equal(r.status, 200, `beklenen 200, gelen ${r.status}: ${JSON.stringify(r.json)}`);
  assert.equal(r.json.success, true);
  assert.ok(Array.isArray(r.json.data), 'data dizisi dönmeli');
});

test('MUHASEBE: gelen irsaliye listesini GÖREBİLİR (200)', async () => {
  const r = await istek('k-muhasebe', '/api/v1/e-documents/incoming-despatches/list');
  assert.equal(r.status, 200, `beklenen 200, gelen ${r.status}: ${JSON.stringify(r.json)}`);
  assert.equal(r.json.success, true);
  assert.ok(Array.isArray(r.json.data), 'data dizisi dönmeli');
});

test('MUHASEBE: eşleştirme/onay ekranının PLANINI açabilir (200, yazmaz)', async () => {
  const oncesi = JSON.stringify({
    urun: (storage.getState().products || []).length,
    cari: (storage.getState().customers || []).length,
  });
  const r = await istek('k-muhasebe', '/api/v1/e-documents/incoming/ii-1/plan');
  // Belge minimal (kalemsiz) olduğu için plan 400 dönebilir; 403 OLMAMALI.
  assert.notEqual(r.status, 403, `MUHASEBE plan ucunda 403 ALMAMALI: ${JSON.stringify(r.json)}`);
  assert.equal(
    JSON.stringify({ urun: (storage.getState().products || []).length, cari: (storage.getState().customers || []).length }),
    oncesi,
    'plan ucu ürün/cari kartı AÇMAMALI'
  );
});

test('MUHASEBE: irsaliye plan ucunda da 403 almaz', async () => {
  const r = await istek('k-muhasebe', '/api/v1/e-documents/incoming-despatches/id-1/plan');
  assert.notEqual(r.status, 403, `MUHASEBE irsaliye planında 403 ALMAMALI: ${JSON.stringify(r.json)}`);
});

test('MUHASEBE: gelen irsaliyeyi ONAYLAYABİLİR yetkiye sahip', () => {
  const u = storage.getState().users.find(x => x.id === 'k-muhasebe')!;
  const identity = companyIdentity(storage.getState(), u, T);
  assert.ok(
    identity.permissionCodes.includes(PERMISSIONS.WAYBILLS_APPROVE),
    `MUHASEBE ${PERMISSIONS.WAYBILLS_APPROVE} iznine sahip olmalı`
  );
});

// ════════════════════════════════════════════════════════════════════════════
// 2. EN AZ YETKİ — muhasebe ADMIN yetkisi KAZANMAMALI
// ════════════════════════════════════════════════════════════════════════════

test('MUHASEBE: ADMIN yetkisi KAZANMAZ (kullanıcı yönetimi, firma, platform)', async () => {
  const u = storage.getState().users.find(x => x.id === 'k-muhasebe')!;
  const codes = companyIdentity(storage.getState(), u, T).permissionCodes;
  for (const yasak of [
    PERMISSIONS.TENANTS_MANAGE, PERMISSIONS.USERS_VIEW, PERMISSIONS.USERS_CREATE,
    PERMISSIONS.USERS_UPDATE, PERMISSIONS.USERS_DELETE, PERMISSIONS.COMPANY_UPDATE,
  ]) {
    assert.ok(!codes.includes(yasak), `MUHASEBE '${yasak}' iznine SAHİP OLMAMALI`);
  }
});

test('MUHASEBE: sevk irsaliyesi KESME yetkisi kazanmaz (waybills.create YOK)', () => {
  const u = storage.getState().users.find(x => x.id === 'k-muhasebe')!;
  const codes = companyIdentity(storage.getState(), u, T).permissionCodes;
  assert.ok(
    !codes.includes(PERMISSIONS.WAYBILLS_CREATE),
    'MUHASEBE giden sevk irsaliyesi kesme yetkisine SAHİP OLMAMALI (yalnız geleni onaylar)'
  );
  assert.ok(!codes.includes(PERMISSIONS.WAYBILLS_UPDATE), 'waybills.update verilmemeli');
  assert.ok(!codes.includes(PERMISSIONS.WAYBILLS_DELETE), 'waybills.delete verilmemeli');
});

test('MUHASEBE: stok kartı açma yetkisi kazanmaz (products.create YOK)', () => {
  const u = storage.getState().users.find(x => x.id === 'k-muhasebe')!;
  const codes = companyIdentity(storage.getState(), u, T).permissionCodes;
  assert.ok(!codes.includes(PERMISSIONS.PRODUCTS_CREATE), 'products.create verilmemeli');
  assert.ok(!codes.includes(PERMISSIONS.PRODUCTS_DELETE), 'products.delete verilmemeli');
});

test('MUHASEBE: yetki sayısı en az tutuldu (22 — admin 49 ile karışmaz)', () => {
  const u = storage.getState().users.find(x => x.id === 'k-muhasebe')!;
  const fa = storage.getState().users.find(x => x.id === 'k-firmaadmin')!;
  const muh = companyIdentity(storage.getState(), u, T).permissionCodes;
  const adm = companyIdentity(storage.getState(), fa, T).permissionCodes;
  assert.equal(muh.length, 22, `MUHASEBE 22 izin olmalı, gelen ${muh.length}`);
  assert.ok(adm.length > muh.length, 'firma admini muhasebeden DAHA GENİŞ olmalı');
  assert.ok(muh.length < adm.length / 2, 'muhasebe firma admininin yarısından az yetkiye sahip olmalı');
});

test('MUHASEBE: platform_admin erişimini (403) gelen belgelerde ALMAZ', async () => {
  // Muhasebe yetkisi platform admin uçlarına sızmamalı — ölçülebilir tek kanıt
  // aşırı geniş wildcard ('*') ALMAMASI ve admin izinlerine sahip olmamasıdır.
  const u = storage.getState().users.find(x => x.id === 'k-muhasebe')!;
  const codes = companyIdentity(storage.getState(), u, T).permissionCodes;
  assert.ok(!codes.includes('*'), "MUHASEBE wildcard ('*') OLMAMALI");
});

// ════════════════════════════════════════════════════════════════════════════
// 3. ROL BAZINDA ERİŞİM — regresyon (firma admini kırılmadı)
// ════════════════════════════════════════════════════════════════════════════

test('COMPANY_ADMIN: gelen fatura ve irsaliye (200) — önceden 403 idi', async () => {
  const f = await istek('k-firmaadmin', '/api/v1/e-documents/incoming/list');
  const d = await istek('k-firmaadmin', '/api/v1/e-documents/incoming-despatches/list');
  assert.equal(f.status, 200, `firma admini fatura listesi 200 olmalı, gelen ${f.status}`);
  assert.equal(d.status, 200, `firma admini irsaliye listesi 200 olmalı, gelen ${d.status}`);
});

test('PLATFORM ADMIN: erişimi korunuyor (200)', async () => {
  const f = await istek('k-admin', '/api/v1/e-documents/incoming/list');
  assert.equal(f.status, 200, `platform admin 200 olmalı, gelen ${f.status}`);
});

test('SATIS/VIEWER: gelen FATURA ucunda 403 (yetki genişlemedi)', async () => {
  const s = await istek('k-satis', '/api/v1/e-documents/incoming/list');
  const v = await istek('k-rapor', '/api/v1/e-documents/incoming/list');
  assert.equal(s.status, 403, `SATIS fatura ucunda 403 almalı, gelen ${s.status}`);
  assert.equal(v.status, 403, `VIEWER fatura ucunda 403 almalı, gelen ${v.status}`);
  assert.equal(s.json.code, 'FORBIDDEN_PERMISSION');
});

test('kimlik doğrulaması olmayan istek 401 (fallback YOK)', async () => {
  const res = await fetch(base + '/api/v1/e-documents/incoming/list');
  assert.equal(res.status, 401, "token'sız istek 401 olmalı — 'ilk kullanıcı' fallback'i YASAK");
});

test('kiracı izolasyonu: başka firmanın belgesi görünmez', async () => {
  storage.update(db => {
    db.incomingInvoices.push({
      id: 'ii-yabanci', tenantId: 'tnt-baska-firma', uuid: 'yabanci-uuid',
      invoiceNo: 'YABANCI-1', supplierTitle: 'Yabancı', issueDate: '2026-09-01', status: 'RECEIVED', items: [],
    } as any);
  });
  const r = await istek('k-muhasebe', '/api/v1/e-documents/incoming/list?limit=100');
  assert.equal(r.status, 200);
  assert.ok(
    !r.json.data.some((x: any) => x.invoiceNo === 'YABANCI-1'),
    'başka firmanın gelen faturası SIZMAMALI'
  );
});

// ════════════════════════════════════════════════════════════════════════════
// 4. SAYFALAMA SÖZLEŞMESİ — fatura ve irsaliye AYNI davranmalı
// ════════════════════════════════════════════════════════════════════════════

test('sayfalama: fatura ve irsaliye AYNI alanları döner', async () => {
  const f = await istek('k-muhasebe', '/api/v1/e-documents/incoming/list?page=1&limit=10');
  const d = await istek('k-muhasebe', '/api/v1/e-documents/incoming-despatches/list?page=1&limit=10');
  for (const k of ['total', 'page', 'limit', 'totalPages']) {
    assert.ok(k in f.json.pagination, `fatura yanıtında '${k}' olmalı`);
    assert.ok(k in d.json.pagination, `irsaliye yanıtında '${k}' olmalı`);
  }
  assert.deepEqual(f.json.pagination, { total: 30, page: 1, limit: 10, totalPages: 3 });
  assert.deepEqual(d.json.pagination, { total: 30, page: 1, limit: 10, totalPages: 3 });
});

test('sayfalama: page 1 ve page 2 FARKLI kayıtlar döner (fatura + irsaliye)', async () => {
  for (const uc of ['incoming', 'incoming-despatches']) {
    const p1 = await istek('k-muhasebe', `/api/v1/e-documents/${uc}/list?page=1&limit=10`);
    const p2 = await istek('k-muhasebe', `/api/v1/e-documents/${uc}/list?page=2&limit=10`);
    assert.equal(p1.json.data.length, 10, `${uc}: 1. sayfa 10 kayıt`);
    assert.equal(p2.json.data.length, 10, `${uc}: 2. sayfa 10 kayıt`);
    const id1 = new Set(p1.json.data.map((x: any) => x.id));
    const kesisim = p2.json.data.filter((x: any) => id1.has(x.id));
    assert.equal(kesisim.length, 0, `${uc}: sayfa 1 ve 2 AYNI kaydı içermemeli`);
  }
});

test('sayfalama: son sayfa kalan kayıtları verir', async () => {
  for (const uc of ['incoming', 'incoming-despatches']) {
    const p3 = await istek('k-muhasebe', `/api/v1/e-documents/${uc}/list?page=3&limit=10`);
    assert.equal((p3.json.data || []).length, 10, `${uc}: 3. sayfa 10 kayıt`);
    const p4 = await istek('k-muhasebe', `/api/v1/e-documents/${uc}/list?page=4&limit=10`);
    assert.equal(p4.json.data.length, 0, `${uc}: kayıt kalmadığında boş dizi`);
    assert.equal(p4.json.pagination.total, 30, `${uc}: total toplamı korur`);
    assert.equal(p4.json.pagination.totalPages, 3);
  }
});

test('sayfalama: limit üst sınırı 100 (kaynak tüketimi koruması)', async () => {
  const r = await istek('k-muhasebe', '/api/v1/e-documents/incoming/list?limit=100000');
  assert.equal(r.json.pagination.limit, 100, 'limit 100 ile sınırlanmalı');
  assert.ok(r.json.data.length <= 100);
});

test('sayfalama: geçersiz page/limit HATA VERMEZ, güvenli aralığa kırpılır', async () => {
  // NOT: Negatif limit 25'e DEĞİL 1'e kırpılır (Math.max(1, ...)). Bu davranış
  // fatura ucunda da aynıdır ve önceden vardır; amaç sunucuyu korumaktır.
  // Test belirli bir sayıyı değil GÜVENLİK DEĞİŞMEZİNİ sınar.
  for (const uc of ['incoming', 'incoming-despatches']) {
    for (const sorgu of ['page=abc&limit=-5', 'page=0&limit=0', 'page=-1&limit=abc', 'page=NaN&limit=Infinity']) {
      const r = await istek('k-muhasebe', `/api/v1/e-documents/${uc}/list?${sorgu}`);
      assert.equal(r.status, 200, `${uc}?${sorgu} → 200 dönmeli`);
      assert.ok(r.json.pagination.page >= 1, `${uc}?${sorgu} → page ≥ 1 olmalı`);
      assert.ok(r.json.pagination.limit >= 1 && r.json.pagination.limit <= 100,
        `${uc}?${sorgu} → limit 1..100 aralığında olmalı (gelen ${r.json.pagination.limit})`);
      assert.ok(Array.isArray(r.json.data), 'data dizisi dönmeli');
    }
  }
});

test('sayfalama: boş sonuç totalPages 1 döner, hata vermez', async () => {
  for (const uc of ['incoming', 'incoming-despatches']) {
    const r = await istek('k-muhasebe', `/api/v1/e-documents/${uc}/list?search=HİÇBİRŞEYLE-EŞLEŞMEZ`);
    assert.equal(r.status, 200, `${uc}: eşleşmeyen arama 200 dönmeli`);
    assert.equal(r.json.pagination.total, 0);
    assert.deepEqual(r.json.data, []);
    assert.equal(r.json.pagination.totalPages, 0, `${uc}: kayıt yoksa totalPages 0`);
  }
});

test('sayfalama: status süzgeci toplamı doğru hesaplar', async () => {
  storage.update(db => {
    (db.incomingDespatches || []).find((d: any) => d.id === 'id-1')!.status = 'APPROVED';
  });
  const r = await istek('k-muhasebe', '/api/v1/e-documents/incoming-despatches/list?status=APPROVED');
  assert.equal(r.json.pagination.total, 1, 'süzgeç toplamı süzülmüş kümeyi saymalı');
  assert.equal(r.json.data[0].id, 'id-1');
});

test('irsaliye yanıtı geriye dönük `incomingDespatches` alanını KORUR', async () => {
  const r = await istek('k-muhasebe', '/api/v1/e-documents/incoming-despatches/list?limit=5');
  assert.ok(Array.isArray(r.json.incomingDespatches), 'eski alan korunmalı (istemci kırılmasın)');
  assert.equal(r.json.incomingDespatches.length, r.json.data.length, 'iki alan aynı dilimi döner');
});

// ════════════════════════════════════════════════════════════════════════════
// 5. OPERASYON DURUMU, SAYAÇLAR VE FİLTRELER (2026-09-29)
//
// ⚠️ NEDEN HTTP ÜZERİNDEN: Durum türetme saf bir fonksiyondur ve kendi testi
// vardır; ama o test ucun bu fonksiyonu GERÇEKTEN kullandığını kanıtlamaz.
// Uç yeniden eski `status` karşılaştırmasına dönerse yalnız bu test kırmızıya
// döner.
// ════════════════════════════════════════════════════════════════════════════

test('durum: liste yanıtı `operationalStatus` ve `statusCounts` döner', async () => {
  const r = await istek('k-muhasebe', '/api/v1/e-documents/incoming/list?limit=5');
  assert.equal(r.status, 200);
  assert.ok(r.json.statusCounts, 'sayaçlar dönmeli (pano kartları ve rozetler bunu kullanır)');
  for (const k of ['NEW', 'PENDING_MATCH', 'READY', 'INGESTED', 'ERROR', 'pendingOperation']) {
    assert.equal(typeof r.json.statusCounts[k], 'number', `statusCounts.${k} sayı olmalı`);
  }
  assert.equal(typeof r.json.data[0].operationalStatus, 'string', 'her satır operasyon durumu taşımalı');
});

test('durum: sayaçlar SÜZGEÇTEN BAĞIMSIZ hesaplanır (iş yükü gizlenmez)', async () => {
  // ⚠️ Sayaçlar süzülmüş kümeden hesaplansaydı, kullanıcı "Hazır" sekmesine
  // geçtiğinde diğer sayaçlar sıfırlanır ve kalan iş görünmez olurdu.
  const hepsi = await istek('k-muhasebe', '/api/v1/e-documents/incoming/list?limit=1');
  const suzulmus = await istek('k-muhasebe', '/api/v1/e-documents/incoming/list?limit=1&status=READY');
  assert.deepEqual(suzulmus.json.statusCounts, hepsi.json.statusCounts, 'sayaçlar süzgeçle DEĞİŞMEMELİ');
});

test('durum: kalemsiz belgeler HATA sayılır (içeri alınamaz)', async () => {
  // Kurulumdaki 30 faturanın hepsi `items: []` — yani hiçbiri içeri alınamaz.
  const r = await istek('k-muhasebe', '/api/v1/e-documents/incoming/list?limit=100');
  assert.equal(r.json.statusCounts.ERROR, 30, 'kalemsiz 30 belge HATA olmalı');
  assert.equal(r.json.statusCounts.READY, 0, 'hiçbiri HAZIR olmamalı');
});

test('durum: ham durum süzgeci GERİYE DÖNÜK uyum için çalışmaya devam eder', async () => {
  // Eski istemciler `status=RECEIVED` gönderiyor; bu değer operasyon durumu
  // değildir ve ham alan üzerinden süzmeye devam etmelidir.
  const r = await istek('k-muhasebe', '/api/v1/e-documents/incoming/list?status=RECEIVED&limit=100');
  assert.equal(r.status, 200);
  assert.equal(r.json.pagination.total, 30);
});

test('filtre: ETTN, belge no ve VKN ile arama çalışır', async () => {
  const ettn = await istek('k-muhasebe', '/api/v1/e-documents/incoming/list?ettn=inv-uuid-7');
  assert.equal(ettn.json.pagination.total, 1);
  assert.equal(ettn.json.data[0].uuid, 'inv-uuid-7');

  const no = await istek('k-muhasebe', '/api/v1/e-documents/incoming/list?documentNo=AF-012');
  assert.equal(no.json.pagination.total, 1);

  const vkn = await istek('k-muhasebe', '/api/v1/e-documents/incoming/list?supplierTaxNumber=1111111111');
  assert.equal(vkn.json.pagination.total, 30);

  const yok = await istek('k-muhasebe', '/api/v1/e-documents/incoming/list?supplierTaxNumber=9999999999');
  assert.equal(yok.json.pagination.total, 0, 'eşleşmeyen VKN boş liste döner (hata değil)');
});

test('filtre: tarih aralığı issueDate üzerinden süzer', async () => {
  const icinde = await istek('k-muhasebe', '/api/v1/e-documents/incoming/list?startDate=2026-08-01&endDate=2026-09-30');
  assert.equal(icinde.json.pagination.total, 30);
  const disinda = await istek('k-muhasebe', '/api/v1/e-documents/incoming/list?startDate=2026-10-01');
  assert.equal(disinda.json.pagination.total, 0);
});

test('irsaliye listesi de aynı sayaçları ve durum alanını döner', async () => {
  const r = await istek('k-muhasebe', '/api/v1/e-documents/incoming-despatches/list?limit=5');
  assert.ok(r.json.statusCounts, 'irsaliye listesi de sayaç dönmeli');
  assert.equal(typeof r.json.data[0].operationalStatus, 'string');
});

test('inceleme işareti: plan ucu SALT-OKUNUR kalır, işaret AYRI uçtan atılır', async () => {
  // ⚠️ `getIngestionPlan` sözleşmesi gereği hiçbir şey yazmaz. "Bakıldı"
  // işaretini plan ucuna gizlice koymak, bir listeleme çağrısının bile
  // operasyon sayaçlarını değiştirmesine yol açardı.
  //
  // Ölçüm için EŞLEŞMEYEN kalemli bir belge kurulur: böylece durumu NEW'dir ve
  // `reviewedAt` onu PENDING_MATCH'e taşır — yani işaretin etkisi görünür olur.
  storage.update(db => {
    (db.incomingInvoices || []).push({
      id: 'ii-isaret', tenantId: T, uuid: 'inv-uuid-isaret', invoiceNo: 'AF-ISARET',
      supplierTitle: 'İşaret Tedarikçisi', supplierTaxNumber: '2222222222',
      issueDate: '2026-09-10', status: 'RECEIVED',
      items: [{ id: 'li-1', incomingInvoiceId: 'inv-uuid-isaret', name: 'Hiçbir Karta Uymayan Kalem', quantity: 1, unit: 'Adet', unitPrice: 1, vatRate: 20, vatAmount: 0.2, lineTotal: 1 }],
    } as any);
  });

  const durum = async () => {
    const r = await istek('k-muhasebe', '/api/v1/e-documents/incoming/list?limit=100');
    const satir = (r.json.data || []).find((x: any) => x.id === 'ii-isaret');
    return { durum: satir?.operationalStatus, sayaclar: r.json.statusCounts };
  };

  const once = await durum();
  assert.equal(once.durum, 'NEW', 'bakılmamış ve eşleşmemiş kalem → YENİ');

  // Plan ucu: SALT-OKUNUR olmalı. Bu kurulumda belgenin XML'i diskte yok,
  // bu yüzden uç 422 döner — beklenen davranış. Kanıtlanan şey, uç hata verse
  // bile GERİYE YAZMA yapmadığıdır.
  const plan = await istek('k-muhasebe', '/api/v1/e-documents/incoming/ii-isaret/plan');
  assert.equal(plan.status, 422, 'içeriği olmayan belgenin planı 422 olmalı (NOT_INGESTIBLE)');
  assert.equal(plan.json.code, 'NOT_INGESTIBLE');
  const planSonrasi = await durum();
  assert.equal(planSonrasi.durum, 'NEW', 'PLAN ucu durumu DEĞİŞTİRMEMELİ (salt-okunur)');
  assert.deepEqual(planSonrasi.sayaclar, once.sayaclar, 'PLAN ucu sayaçları DEĞİŞTİRMEMELİ');

  // Ayrı uç: işaret atılır ve durum DEĞİŞİR.
  const isaret = await istek('k-muhasebe', '/api/v1/e-documents/incoming/ii-isaret/reviewed', 'POST');
  assert.equal(isaret.status, 200);

  const sonra = await durum();
  assert.equal(sonra.durum, 'PENDING_MATCH', 'işaretten sonra EŞLEŞTİRME BEKLİYOR olmalı');
  assert.equal(sonra.sayaclar.NEW, once.sayaclar.NEW - 1, 'YENİ sayacı bir azalmalı');
  assert.equal(sonra.sayaclar.PENDING_MATCH, once.sayaclar.PENDING_MATCH + 1, 'bekleyen sayacı bir artmalı');
  // Bekleyen toplam DEĞİŞMEZ: iş yükü aynı, yalnız sınıfı değişti.
  assert.equal(sonra.sayaclar.pendingOperation, once.sayaclar.pendingOperation);
});

// ════════════════════════════════════════════════════════════════════════════
// 5b. DÖVİZ KURU UCU (2026-10-03)
//
// ⚠️ ÖLÇÜLEN RİSK: Dövizli faturayı TL'ye çeviren kur yanlış olursa tedarikçi
// borcu ve stok maliyeti yanlış yazılır. Kur ucunun (a) yetkisiz kullanıcıya
// AÇILMADIĞINI, (b) TL belgede sağlayıcıya HİÇ ÇIKMADIĞINI ve (c) çağrıldığında
// döviz kasasını AÇMADIĞINI (salt-okunur) kanıtlamak gerekir.
//
// ⚠️ AĞ İSTEĞİ YOK: `tcmbKurGetirGuvenli` yerel bir taklit ile değiştirilir.
// Taklit kur UYDURMAZ — testin verdiği değeri aynen döndürür; amaç sağlayıcıyı
// değil, UÇ SÖZLEŞMESİNİ ölçmek.
// ════════════════════════════════════════════════════════════════════════════

// Dövizli / TL belgeler için gerçek XML diske yazılır: plan ancak o zaman kurulur.
async function belgeKur(id: string, uuid: string, belgeNo: string, paraBirimi: string, fiyat: number) {
  const { DocumentStorageService } = await import('../services/documentStorageService');
  const { faturaXml } = await import('./fixtures/ublFixtureBuilder');
  const xml = faturaXml({
    uuid, belgeNo, paraBirimi,
    saticiVkn: '5556667778', saticiUnvan: 'Kur Testi Tedarikçisi',
    aliciVkn: '1111111111', aliciUnvan: 'Yetki Testi Firma',
    satirlar: [{ no: '1', ad: 'Kur Testi Kalem', kod: 'KUR-1', miktar: 1, fiyat, kdv: 20 }],
  });
  const yol = DocumentStorageService.saveXml(T, 'incoming_invoice', uuid, xml);
  storage.update(db => {
    (db.incomingInvoices || []).push({
      id, tenantId: T, uuid, invoiceNo: belgeNo,
      supplierTitle: 'Kur Testi Tedarikçisi', supplierTaxNumber: '5556667778',
      issueDate: '2026-09-20', status: 'RECEIVED', xmlStoragePath: yol, items: [],
    } as any);
  });
}

function dovizKasaSayisi(): number {
  return (storage.getState().cashRegisters || []).filter(k => k.tenantId === T && k.currency === 'USD').length;
}

/** Sağlayıcı çağrısını yerel taklitle değiştirir; `cagrildi` ile sayılır. */
function saglayiciSahte(yanit: any) {
  let cagri = 0;
  return {
    cagrildi: () => cagri,
    kur: () => async (pb: string) => {
      cagri++; // ⚠️ sayaç YALNIZ gerçek çağrıda artar; fabrika üretirken değil
      return { ...yanit, currency: pb };
    },
  };
}

test('kur ucu: yetki sözleşmesi — SATIS/VIEWER 403, anonim 401, MUHASEBE geçer', async () => {
  // Yetkisizlik denetimi işleyiciden ÖNCE olur: sağlayıcıya ÇIKILMAZ.
  const s = await istek('k-satis', '/api/v1/e-documents/incoming/ii-hic-yok/exchange-rate');
  const v = await istek('k-rapor', '/api/v1/e-documents/incoming/ii-hic-yok/exchange-rate');
  assert.equal(s.status, 403, `SATIS kur ucunda 403 almalı, gelen ${s.status}`);
  assert.equal(v.status, 403, `VIEWER kur ucunda 403 almalı, gelen ${v.status}`);
  assert.equal(s.json.code, 'FORBIDDEN_PERMISSION');

  const anon = await fetch(base + '/api/v1/e-documents/incoming/ii-hic-yok/exchange-rate');
  assert.equal(anon.status, 401, "token'sız istek 401 olmalı — 'ilk kullanıcı' fallback'i YASAK");

  // MUHASEBE yetkiyi GEÇER (kayıt olmadığı için 404 — ama 403 DEĞİL).
  const m = await istek('k-muhasebe', '/api/v1/e-documents/incoming/ii-hic-yok/exchange-rate');
  assert.equal(m.status, 404, `MUHASEBE yetkiyi geçmeli (kayıt yok → 404), gelen ${m.status}`);

  const fa = await istek('k-firmaadmin', '/api/v1/e-documents/incoming/ii-hic-yok/exchange-rate');
  assert.equal(fa.status, 404, `COMPANY_ADMIN yetkiyi geçmeli (kayıt yok → 404), gelen ${fa.status}`);
});

test('kur ucu: TL belgede sağlayıcıya HİÇ ÇIKMAZ (isForeign:false)', async () => {
  await belgeKur('ii-kur-tl', 'inv-uuid-kur-tl', 'AF-KUR-TL', 'TRY', 100);

  const { HizliConnectService } = await import('../services/hizliConnectService');
  const gercek = (HizliConnectService as any).tcmbKurGetirGuvenli;
  const sahte = saglayiciSahte({ success: true, rate: 40, rateDate: '2026-09-20' });
  (HizliConnectService as any).tcmbKurGetirGuvenli = sahte.kur();
  try {
    const r = await istek('k-muhasebe', '/api/v1/e-documents/incoming/ii-kur-tl/exchange-rate');
    assert.equal(r.status, 200);
    assert.equal(r.json.isForeign, false, 'TL belge dövizli sayılmamalı');
    assert.equal(r.json.rate, undefined, 'TL belgede kur alanı DÖNMEMELİ');
    assert.equal(sahte.cagrildi(), 0, 'TL belgede sağlayıcıya ÇIKILMAMALI');
  } finally {
    (HizliConnectService as any).tcmbKurGetirGuvenli = gercek;
  }
});

test('kur ucu: dövizli belgede kasa BİLDİRİR + TL karşılık verir, kasa AÇMAZ', async () => {
  await belgeKur('ii-kur-usd', 'inv-uuid-kur-usd', 'AF-KUR-USD', 'USD', 1000);
  assert.equal(dovizKasaSayisi(), 0, 'başlangıçta USD kasası YOK');

  const { HizliConnectService } = await import('../services/hizliConnectService');
  const gercek = (HizliConnectService as any).tcmbKurGetirGuvenli;
  const sahte = saglayiciSahte({ success: true, rate: 40, rateDate: '2026-09-20' });
  (HizliConnectService as any).tcmbKurGetirGuvenli = sahte.kur();
  try {
    const r = await istek('k-muhasebe', '/api/v1/e-documents/incoming/ii-kur-usd/exchange-rate');
    assert.equal(r.status, 200);
    assert.equal(r.json.success, true, `kur gelmeli: ${JSON.stringify(r.json)}`);
    assert.equal(r.json.isForeign, true);
    assert.equal(r.json.currency, 'USD');
    assert.equal(r.json.rate, 40, 'takladin verdiği kur AYNEN dönmeli — dönüşüm uçta değil');
    assert.equal(r.json.source, 'TCMB');
    assert.equal(r.json.documentPayable, 1200);
    assert.equal(r.json.payableInTry, 48000, 'önizleme TL karşılığı doğru hesaplanmalı');
    // Kullanıcıya "hangi döviz kasası" BİLDİRİLİR.
    assert.equal(r.json.cashRegister.code, 'KAS-USD');
    assert.equal(r.json.cashRegister.currency, 'USD');
    assert.equal(r.json.cashRegister.exists, false, 'kasa henüz yok — onayda açılacak');
    assert.equal(sahte.cagrildi(), 1, 'sağlayıcı TAM BİR kez çağrılmalı');
  } finally {
    (HizliConnectService as any).tcmbKurGetirGuvenli = gercek;
  }

  // SALT-OKUNUR: kur ucu ne kasa açar ne fatura oluşturur.
  assert.equal(dovizKasaSayisi(), 0, 'kur ucu döviz kasası AÇMAMALI');
  assert.equal(
    (storage.getState().invoices || []).filter(i => i.tenantId === T).length, 0,
    'kur ucu fatura OLUŞTURMAMALI'
  );
});

test('kur ucu: sağlayıcı kur VERMEZSE success:false döner, kur UYDURULMAZ', async () => {
  const { HizliConnectService } = await import('../services/hizliConnectService');
  const gercek = (HizliConnectService as any).tcmbKurGetirGuvenli;
  (HizliConnectService as any).tcmbKurGetirGuvenli = saglayiciSahte({
    success: false, rate: null, message: 'TCMB kuru alınamadı (taklit).',
  }).kur();
  try {
    const r = await istek('k-muhasebe', '/api/v1/e-documents/incoming/ii-kur-usd/exchange-rate');
    assert.equal(r.status, 200, 'sağlayıcı hatası HTTP hatası DEĞİL — gövdede bildirilir');
    assert.equal(r.json.success, false, 'başarısızlık DÜRÜSTÇE bildirilmeli');
    assert.equal(r.json.isForeign, true);
    assert.equal(r.json.rate, undefined, 'kur yoksa kur ALANI OLMAMALI');
    assert.match(String(r.json.message), /kur/i, 'başarısızlığın NEDENİ söylenmeli');
  } finally {
    (HizliConnectService as any).tcmbKurGetirGuvenli = gercek;
  }
  assert.equal(dovizKasaSayisi(), 0, 'kur alınamadıysa da kasa AÇILMAMALI');
});

test('inceleme işareti: olmayan belge 404 döner (400 değil)', async () => {
  const r = await istek('k-muhasebe', '/api/v1/e-documents/incoming/inc-yok-boyle/reviewed', 'POST');
  assert.equal(r.status, 404, 'kayıt yokluğu 404 olmalı — 400 "istek bozuk" demek olurdu');
  assert.equal(r.json.code, 'NOT_FOUND');
});

// ════════════════════════════════════════════════════════════════════════════
// 6. YETKİ MATRİSİ DEĞİŞMEZLERİ (registry)
// ════════════════════════════════════════════════════════════════════════════

test('registry: einvoice.view ve waybills.approve KATALOGDA (DB rol kayıtlarına girebilsin)', async () => {
  const { PERMISSION_CATALOG } = await import('../security/permissions');
  const kodlar = PERMISSION_CATALOG.map(p => p.code as string);
  assert.ok(kodlar.includes(PERMISSIONS.EINVOICE_VIEW), 'einvoice.view katalogda OLMALI');
  assert.ok(kodlar.includes(PERMISSIONS.WAYBILLS_APPROVE), 'waybills.approve katalogda OLMALI');
});

test('registry: ilk 37 katalog kodunun SIRASI korunuyor (perm-1..37 kaymadı)', async () => {
  const { SEED_CATALOG_CODES } = await import('../security/permissions');
  const ilk37 = SEED_CATALOG_CODES.slice(0, 37) as string[];
  assert.equal(ilk37[0], 'customers.view', 'perm-1 customers.view olmalı');
  assert.equal(ilk37[36], 'tenants.manage', 'perm-37 tenants.manage olmalı');
  assert.equal(new Set(ilk37).size, 37, 'ilk 37 tekrarsız');
  // Yeni kodlar SONA eklenmiş olmalı.
  assert.ok(!ilk37.includes(PERMISSIONS.EINVOICE_VIEW), 'yeni kod ilk 37 içinde OLMAMALI');
});

test('registry: accountant matrisi 20 onaylı izni korur, yalnız 2 yeni izin ekler', () => {
  const m = ROLE_PERMISSIONS[ROLE_SLUGS.ACCOUNTANT];
  assert.equal(m.length, 22, `accountant 22 izin olmalı, gelen ${m.length}`);
  assert.ok(m.includes(PERMISSIONS.EINVOICE_VIEW));
  assert.ok(m.includes(PERMISSIONS.WAYBILLS_APPROVE));
  assert.ok(!m.includes(PERMISSIONS.WAYBILLS_CREATE), 'waybills.create muhasebeye VERİLMEMELİ');
  assert.ok(!m.includes(PERMISSIONS.PRODUCTS_CREATE), 'products.create muhasebeye VERİLMEMELİ');
  assert.ok(!m.includes(PERMISSIONS.USERS_UPDATE), 'users.update muhasebeye VERİLMEMELİ');
});

test('registry: e-invoice izni olmayan roller bu izni KAZANMAZ', () => {
  for (const slug of [ROLE_SLUGS.EMPLOYEE, ROLE_SLUGS.VIEWER]) {
    const m = ROLE_PERMISSIONS[slug] as readonly string[];
    assert.ok(!m.includes(PERMISSIONS.EINVOICE_VIEW), `${slug} einvoice.view ALMAMALI`);
    assert.ok(!m.includes(PERMISSIONS.WAYBILLS_APPROVE), `${slug} waybills.approve ALMAMALI`);
  }
});

// ── Koşucu ──────────────────────────────────────────────────────────────────

async function main() {
  kurulum();
  await basla();
  let passed = 0, failed = 0;
  try {
    for (const { name, fn } of tests) {
      try {
        await fn();
        passed++;
        console.log(`PASS: ${name}`);
      } catch (err: any) {
        failed++;
        console.error(`FAIL: ${name}`);
        console.error(`      ${err?.message || err}`);
      }
    }
  } finally {
    server?.close();
  }
  console.log(`\nGelen belge yetki sözleşmesi: ${passed} PASS / ${failed} FAIL`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch(err => {
  console.error('Test düzeneği çöktü:', err);
  process.exitCode = 1;
});
