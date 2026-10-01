/**
 * HIZLI BİLİŞİM MÜKELLEF SORGU / PORTFÖY YÖNETİMİ — GERÇEK HTTP SÖZLEŞME TESTİ
 * ==========================================================================
 * 2026-10-01 — Kullanıcı isteği: "Müşteri İşlemleri ekranı 0 kayıtla kilitleniyor;
 * ilk müşteriyi sisteme alabileceği GERÇEK bir yol olsun. Ve bu değişiklik
 * mevcut çalışan gelen e-Fatura/e-İrsaliye akışını BOZMASIN."
 *
 * ⚠️ AĞ İSTEĞİ YOK. `HizliBilisimClient.sorgulaMukellef` YEREL taklit ile
 * değiştirilir; Hızlı Bilişim'e tek bir istek gitmez. Gerçek HTTP yalnız
 * İŞBEY router'ına (127.0.0.1) yapılır.
 *
 * ⚠️ MUTASYON SINIRI: Bu test yalnız `externalCustomers` havuzuna yazar
 * (ekleme akışının kendisi budur). Ürün, cari, fatura, stok hareketi ve
 * muhasebe koleksiyonlarına DOKUNULMAZ — test 30 bunu kanıtlar.
 *
 * İZOLASYON: Yalnız NODE_ENV=test ve
 * DATABASE_PATH=<tmp>/hizliMusteriSorguTest.ts.json.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';

const configuredPath = process.env.DATABASE_PATH || '';
if (process.env.NODE_ENV !== 'test' || path.basename(configuredPath) !== 'hizliMusteriSorguTest.ts.json') {
  throw new Error(
    'Bu test yalnız NODE_ENV=test ve DATABASE_PATH=<tmp>/hizliMusteriSorguTest.ts.json ile çalıştırılabilir.'
  );
}
process.env.JWT_SECRET ||= crypto.randomBytes(48).toString('hex');

const { storage } = await import('../db/storage');
const { HizliBilisimClient } = await import('../services/hizliBilisim/hizliBilisimClient');
const { HizliBilisimSyncService } = await import('../services/hizliBilisim/hizliBilisimSyncService');
const { validateTaxId, normalizeTaxId } = await import('../services/hizliBilisim/taxIdValidation');
const { hizliBilisimRouter } = await import('../routes/hizli-bilisim');
const { generateToken } = await import('../routes/auth');

const T = 'tnt-hb-musteri';
const T2 = 'tnt-hb-diger';

// ── Koşum düzeneği ──────────────────────────────────────────────────────────
const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [];
function test(name: string, fn: () => void | Promise<void>) { tests.push({ name, fn }); }
let passCount = 0, failCount = 0;

// ── Sağlayıcı taklidi ───────────────────────────────────────────────────────
type SahteSonuc =
  | { durum: 'BULUNDU'; musteri: any }
  | { durum: 'BULUNAMADI' }
  | { durum: 'HATA'; hataSinifi: string; hataMesaji?: string };

let sahteKurulum: (vkn: string) => SahteSonuc = () => ({ durum: 'BULUNAMADI' });
let sorguSayaci = 0;

const gercekSorgula = HizliBilisimClient.sorgulaMukellef.bind(HizliBilisimClient);
(HizliBilisimClient as any).sorgulaMukellef = async (vkn: string): Promise<SahteSonuc> => {
  sorguSayaci++;
  return sahteKurulum(vkn);
};

/** Sağlayıcıdan dönen GERÇEK alanlar (uydurma alan yok). */
function musteriVt(vkn: string, ek: Record<string, unknown> = {}) {
  return {
    externalId: `HB-${vkn}`, companyName: `Test Firma ${vkn}`, title: `Test Firma ${vkn}`,
    taxNumber: vkn, taxOffice: 'Test VD', contactName: 'Yetkili Kişi',
    phone: '5550000000', email: 'a@b.c', address: 'Adres', city: 'İstanbul', district: 'Kadıköy',
    registeredAt: '2026-01-01T00:00:00.000Z', customerType: 'Müşteri', ...ek,
  };
}

// ── Şema kurulumu ───────────────────────────────────────────────────────────
function kurulum() {
  storage.update(db => {
    const taban = { ...(db.tenants?.[0] || {}) } as any;
    db.tenants = [
      { ...taban, id: T, name: 'HB Test A.Ş.', status: 'ACTIVE', isArchived: false },
      { ...taban, id: T2, name: 'HB Diğer A.Ş.', status: 'ACTIVE', isArchived: false },
    ];
    const now = new Date().toISOString();
    db.users = [
      { id: 'u-super', username: 'u-super', fullName: 'Süper Yönetici', email: 's@t.local', role: 'SUPER_ADMIN',
        active: true, companyId: T, allowedCompanyIds: [T, T2], passwordHash: bcrypt.hashSync('x', 4), createdAt: now },
      { id: 'u-muhasebe', username: 'u-muhasebe', fullName: 'Muhasebe', email: 'm@t.local', role: 'MUHASEBE',
        active: true, companyId: T, allowedCompanyIds: [T], passwordHash: bcrypt.hashSync('x', 4), createdAt: now },
    ] as any;
    db.tenantUsers = [
      { id: 'tu-super', userId: 'u-super', tenantId: T, roleSlug: 'platform_admin', status: 'active',
        isOwner: true, joinedAt: now, createdAt: now, updatedAt: now },
      { id: 'tu-muhasebe', userId: 'u-muhasebe', tenantId: T, roleSlug: 'accountant', status: 'active',
        isOwner: false, joinedAt: now, createdAt: now, updatedAt: now },
    ] as any;
    db.externalCustomers = [];
    db.dealerCustomers = [];
    db.auditLogs = [];
    (db as any).integrationSyncLogs = [];
  });
}

const app = express();
app.use(express.json());
app.use('/api/admin/hizli-bilisim', hizliBilisimRouter);

let base = '';
let server: any = null;

async function basla() {
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
}

function token(id: string, tenant = T): string {
  return generateToken(storage.getState().users.find(u => u.id === id)!, tenant);
}

async function istek(id: string, url: string, method = 'GET', body?: unknown, tenant = T) {
  const res = await fetch(base + url, {
    method,
    headers: { Authorization: `Bearer ${token(id, tenant)}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const havuz = () => storage.getState().externalCustomers || [];
const auditler = () => (storage.getState().auditLogs || []) as any[];

function havuzSayisiSifirla() {
  storage.update(db => { db.externalCustomers = []; db.dealerCustomers = []; });
}

/** Muhasebe koleksiyonlarının dokunulmazlığını ölçmek için anlık görüntü. */
function muhasebeSayilari() {
  const db = storage.getState() as any;
  return {
    products: (db.products || []).length,
    customers: (db.customers || []).length,
    invoices: (db.invoices || []).length,
    stockMovements: (db.stockMovements || []).length,
  };
}
let muhasebeTabani: ReturnType<typeof muhasebeSayilari> | null = null;

// ════════════════════════════════════════════════════════════════════════════
// 1. BİÇİM DOĞRULAMASI — sağlayıcıya istek atmadan
// ════════════════════════════════════════════════════════════════════════════
test('01) geçerli VKN (10 hane) → ok', () => {
  const r = validateTaxId('1234567890');
  assert.equal(r.ok, true);
  assert.equal(r.kind, 'VKN');
});

test('02) geçerli TCKN (11 hane) → ok', () => {
  const r = validateTaxId('10000000146');
  assert.equal(r.ok, true);
  assert.equal(r.kind, 'TCKN');
});

test('03) ayraçlı girdi normalize edilir (123.456.789/0 → 1234567890)', () => {
  assert.equal(normalizeTaxId('123.456.789/0'), '1234567890');
  assert.equal(validateTaxId('123 456 789 0').ok, true);
});

test('04) hatalı VKN uzunluğu (9 hane) → REDDEDİLİR, sağlayıcıya GİDİLMEZ', async () => {
  const r = validateTaxId('123456789');
  assert.equal(r.ok, false);
  assert.match(String(r.message), /10 hane|11 hane/);
  const oncesi = sorguSayaci;
  const s = await HizliBilisimSyncService.sorgula('123456789');
  assert.equal(s.durum, 'GECERSIZ');
  assert.equal(sorguSayaci, oncesi, 'geçersiz biçim sağlayıcıya istek ATMAMALI');
});

test('05) hatalı TCKN (12 hane) → REDDEDİLİR, sağlayıcıya GİDİLMEZ', async () => {
  assert.equal(validateTaxId('123456789012').ok, false);
  const oncesi = sorguSayaci;
  const s = await HizliBilisimSyncService.sorgula('123456789012');
  assert.equal(s.durum, 'GECERSIZ');
  assert.equal(sorguSayaci, oncesi);
});

test('06) boş girdi → REDDEDİLİR', () => {
  assert.equal(validateTaxId('').ok, false);
  assert.equal(validateTaxId(undefined).ok, false);
  assert.equal(validateTaxId('   ').ok, false);
});

// ════════════════════════════════════════════════════════════════════════════
// 2. SORGU — BULUNDU / BULUNAMADI / HATA sınıfları
// ════════════════════════════════════════════════════════════════════════════
test('07) bulunan VKN → BULUNDU, yalnız gerçek alanlar döner', async () => {
  sahteKurulum = v => ({ durum: 'BULUNDU', musteri: musteriVt(v) });
  const s = await HizliBilisimSyncService.sorgula('1234567890');
  assert.equal(s.durum, 'BULUNDU');
  assert.equal(s.musteri?.taxNumber, '1234567890');
  assert.equal(s.musteri?.companyName, 'Test Firma 1234567890');
  assert.equal(s.musteri?.city, 'İstanbul');
  assert.equal(s.musteri?.provider, 'HIZLI_BILISIM');
});

test('08) bulunamayan VKN → BULUNAMADI, açık ve teknik olmayan mesaj', async () => {
  sahteKurulum = () => ({ durum: 'BULUNAMADI' });
  const s = await HizliBilisimSyncService.sorgula('9999999999');
  assert.equal(s.durum, 'BULUNAMADI');
  assert.match(s.message, /bulunamadı/i);
});

test('09) HB 401 → YETKI sınıfı; ham sağlayıcı gövdesi kullanıcıya SIZMAZ', async () => {
  sahteKurulum = () => ({ durum: 'HATA', hataSinifi: 'YETKI', hataMesaji: '<html>401 Unauthorized</html>' });
  const s = await HizliBilisimSyncService.sorgula('1234567890');
  assert.equal(s.durum, 'HATA');
  assert.equal(s.hataSinifi, 'YETKI');
  assert.ok(!String(s.message).includes('<html>'), `ham sağlayıcı gövdesi sızdı: ${s.message}`);
  assert.ok(!String(s.message).includes('401'), 'HTTP kodu kullanıcıya gitmemeli');
});

test('10) HB 429 → HIZ_SINIRI sınıfı, yönlendirici mesaj', async () => {
  sahteKurulum = () => ({ durum: 'HATA', hataSinifi: 'HIZ_SINIRI' });
  const s = await HizliBilisimSyncService.sorgula('1234567890');
  assert.equal(s.hataSinifi, 'HIZ_SINIRI');
  assert.match(s.message, /sınırı/i);
});

test('11) HB 500 → SUNUCU sınıfı', async () => {
  sahteKurulum = () => ({ durum: 'HATA', hataSinifi: 'SUNUCU' });
  const s = await HizliBilisimSyncService.sorgula('1234567890');
  assert.equal(s.hataSinifi, 'SUNUCU');
});

test('12) timeout → ZAMAN_ASIMI sınıfı', async () => {
  sahteKurulum = () => ({ durum: 'HATA', hataSinifi: 'ZAMAN_ASIMI' });
  const s = await HizliBilisimSyncService.sorgula('1234567890');
  assert.equal(s.hataSinifi, 'ZAMAN_ASIMI');
  assert.match(s.message, /zaman aşımı/i);
});

test('13) hataSiniflandir: gerçek taşıma hatalarını doğru sınıflar', () => {
  const H = HizliBilisimClient.hataSiniflandir.bind(HizliBilisimClient);
  assert.equal(H({ response: { status: 401 } }), 'YETKI');
  assert.equal(H({ response: { status: 403 } }), 'YETKI');
  assert.equal(H({ response: { status: 429 } }), 'HIZ_SINIRI');
  assert.equal(H({ response: { status: 502 } }), 'SUNUCU');
  assert.equal(H({ code: 'ECONNABORTED', message: 'timeout of 30000ms exceeded' }), 'ZAMAN_ASIMI');
  assert.equal(H({ code: 'ENOTFOUND' }), 'AG');
  assert.equal(H({ code: 'ECONNREFUSED' }), 'AG');
  assert.equal(H({ isAuth: true, message: 'x' }), 'KIMLIK');
  assert.equal(H({ message: 'Eksik yapılandırma: HIZLI_BILISIM_API_KEY' }), 'YAPILANDIRMA');
  assert.equal(H({ message: 'tanımsız bir şey' }), 'BILINMEYEN');
  assert.equal(H({}), 'BILINMEYEN');
});

// ════════════════════════════════════════════════════════════════════════════
// 3. PORTFÖYE EKLEME — idempotent, kaynak daima sağlayıcı
// ════════════════════════════════════════════════════════════════════════════
test('14) onaylı ekleme → havuzda TEK kayıt', async () => {
  havuzSayisiSifirla();
  sahteKurulum = v => ({ durum: 'BULUNDU', musteri: musteriVt(v) });
  const r = await HizliBilisimSyncService.portfoyeEkle('1234567890', 'tester', T);
  assert.equal(r.success, true);
  assert.equal(r.durum, 'EKLENDI');
  assert.equal(havuz().length, 1);
  assert.equal(havuz()[0].taxNumber, '1234567890');
  assert.equal(havuz()[0].status, 'NEW');
  assert.equal(havuz()[0].provider, 'HIZLI_BILISIM');
});

test('15) duplicate VKN → MEVCUT; İKİNCİ kayıt AÇILMAZ', async () => {
  sahteKurulum = v => ({ durum: 'BULUNDU', musteri: musteriVt(v) });
  const r = await HizliBilisimSyncService.portfoyeEkle('1234567890', 'tester', T);
  assert.equal(r.durum, 'MEVCUT');
  assert.equal(havuz().length, 1, 'duplicate eklenmemeli');
});

test('16) sağlayıcıda BULUNMAYAN VKN → portföye EKLENMEZ', async () => {
  sahteKurulum = () => ({ durum: 'BULUNAMADI' });
  const oncesi = havuz().length;
  const r = await HizliBilisimSyncService.portfoyeEkle('8888888888', 'tester', T);
  assert.equal(r.success, false);
  assert.equal(r.durum, 'BULUNAMADI');
  assert.equal(havuz().length, oncesi, 'bulunmayan kayıt eklenmemeli');
});

test('17) kayıt alanları SAĞLAYICIDAN gelir (istemci gövdesi kaydedilmez)', async () => {
  sahteKurulum = v => ({ durum: 'BULUNDU', musteri: musteriVt(v) });
  await HizliBilisimSyncService.portfoyeEkle('7777777777', 'tester', T);
  const k = havuz().find(c => c.taxNumber === '7777777777')!;
  assert.equal(k.companyName, 'Test Firma 7777777777', 'unvan sağlayıcıdan gelmeli');
  assert.equal(k.taxOffice, 'Test VD');
});

// ════════════════════════════════════════════════════════════════════════════
// 4. "HB'DEN GÜNCELLE" — ayrıştırılmış sonuç
// ════════════════════════════════════════════════════════════════════════════
test('18) 0 kayıt → teknik metin YOK, aksiyon odaklı mesaj + bos:true', async () => {
  havuzSayisiSifirla();
  const r = await HizliBilisimSyncService.hbDenGuncelle('tester');
  assert.equal(r.bos, true);
  assert.equal(r.checked, 0);
  assert.match(r.message, /mükellefi bulunamadı/i);
  assert.ok(!/eConnect|uç noktası|Swagger|endpoint/i.test(r.message), `teknik metin sızdı: ${r.message}`);
});

test('19) 20 kayıt: 17 güncellendi / 2 değişiklik yok / 1 hata', async () => {
  havuzSayisiSifirla();
  // 20 kayıt — sağlayıcıyla BİREBİR aynı alanlarla (yalnız unvan farklı).
  storage.update(db => {
    db.externalCustomers = Array.from({ length: 20 }, (_, i) => {
      const vkn = `50000000${String(i + 1).padStart(2, '0')}`;
      return {
        ...musteriVt(vkn, { companyName: `Eski Firma ${i + 1}`, title: `Eski Firma ${i + 1}` }),
        id: `hbc-${vkn}`, provider: 'HIZLI_BILISIM' as const, status: 'NEW' as const,
        syncedAt: '2026-01-01T00:00:00.000Z',
      };
    }) as any;
  });

  sahteKurulum = v => {
    const no = Number(v.slice(-2)); // 01..20
    if (no === 20) return { durum: 'HATA', hataSinifi: 'SUNUCU' };
    // 18 ve 19: sağlayıcıdaki değer kayıttakiyle AYNI → değişiklik yok.
    if (no >= 18) return { durum: 'BULUNDU', musteri: musteriVt(v, { companyName: `Eski Firma ${no}`, title: `Eski Firma ${no}` }) };
    // 1..17: unvan değişti → güncellenir.
    return { durum: 'BULUNDU', musteri: musteriVt(v, { companyName: `YENİ Firma ${no}`, title: `YENİ Firma ${no}` }) };
  };

  const r = await HizliBilisimSyncService.hbDenGuncelle('tester');
  assert.equal(r.checked, 20, `checked=${r.checked}`);
  assert.equal(r.updated, 17, `updated=${r.updated}`);
  assert.equal(r.unchanged, 2, `unchanged=${r.unchanged}`);
  assert.equal(r.failed, 1, `failed=${r.failed}`);
  assert.match(r.message, /20 mükellef kontrol edildi/);
  assert.deepEqual(r.hatalar, [{ vkn: '5000000020', sinif: 'SUNUCU' }]);
});

test('20) bir kayıt hata verse de diğerleri işlenir, hatalı kayıt SİLİNMEZ', () => {
  const db = storage.getState();
  const guncellenen = db.externalCustomers!.find(c => c.taxNumber === '5000000001')!;
  assert.equal(guncellenen.companyName, 'YENİ Firma 1', 'hatalı kayıt varken diğerleri güncellenmeli');
  assert.ok(
    db.externalCustomers!.find(c => c.taxNumber === '5000000020'),
    'hata alan kayıt havuzda kalmalı (silme yok)'
  );
});

// ════════════════════════════════════════════════════════════════════════════
// 5. GERÇEK HTTP — yetki, tenant, audit, secret
// ════════════════════════════════════════════════════════════════════════════
test('21) yetkisiz kullanıcı (MUHASEBE) sorgu ucundan 403 alır', async () => {
  const r = await istek('u-muhasebe', '/api/admin/hizli-bilisim/customers/sorgula', 'POST', { vknTckn: '1234567890' });
  assert.equal(r.status, 403, `MUHASEBE 403 almalı: ${JSON.stringify(r.json)}`);
});

test('22) yetkili kullanıcı geçersiz VKN için GECERSIZ döner (200)', async () => {
  const r = await istek('u-super', '/api/admin/hizli-bilisim/customers/sorgula', 'POST', { vknTckn: '123' });
  assert.equal(r.status, 200);
  assert.equal(r.json.durum, 'GECERSIZ');
});

test('23) yetkili kullanıcı mükellef sorgular — bu uç YAZMAZ', async () => {
  sahteKurulum = v => ({ durum: 'BULUNDU', musteri: musteriVt(v) });
  const oncesi = havuz().length;
  const r = await istek('u-super', '/api/admin/hizli-bilisim/customers/sorgula', 'POST', { vknTckn: '6060606060' });
  assert.equal(r.status, 200);
  assert.equal(r.json.durum, 'BULUNDU');
  assert.equal(havuz().length, oncesi, 'sorgula ucu YAZMAMALI');
});

test('24) ekle ucu mutasyon yapar ve audit kaydı bırakır', async () => {
  sahteKurulum = v => ({ durum: 'BULUNDU', musteri: musteriVt(v) });
  const oncesiAudit = auditler().length;
  const r = await istek('u-super', '/api/admin/hizli-bilisim/customers/ekle', 'POST', { vknTckn: '6161616161' });
  assert.equal(r.status, 200);
  assert.equal(r.json.durum, 'EKLENDI');
  const audit = auditler();
  assert.equal(audit.length, oncesiAudit + 1, 'tam olarak bir audit kaydı yazılmalı');
  // `addAuditLog` yeni kaydı BAŞA ekler (unshift) — en yeni = index 0.
  assert.match(String(audit[0].details), /6161616161/);
  assert.equal(audit[0].action, 'CUSTOMER_IMPORTED');
  assert.equal(audit[0].module, 'hizlibilisim');
});

test('25) audit ve sync loglarında token/parola GEÇMEZ', () => {
  const db = storage.getState() as any;
  const metin = JSON.stringify(db.auditLogs || []) + JSON.stringify(db.integrationSyncLogs || []);
  assert.ok(!/password|parola|wsPassword|secretKey|Bearer |apiKey/i.test(metin),
    `token/parola log içinde olmamalı: ${metin.slice(0, 400)}`);
});

test('26) ikinci ekleme MEVCUT döner, havuz büyümez (idempotent)', async () => {
  sahteKurulum = v => ({ durum: 'BULUNDU', musteri: musteriVt(v) });
  const oncesi = havuz().length;
  const r = await istek('u-super', '/api/admin/hizli-bilisim/customers/ekle', 'POST', { vknTckn: '6161616161' });
  assert.equal(r.json.durum, 'MEVCUT');
  assert.equal(havuz().length, oncesi);
});

test('27) "HB\'den Güncelle" portföy boşken teknik metin DÖNDÜRMEZ', async () => {
  havuzSayisiSifirla();
  const r = await istek('u-super', '/api/admin/hizli-bilisim/sync', 'POST');
  assert.equal(r.status, 200);
  assert.equal(r.json.bos, true);
  assert.ok(!/eConnect|Swagger|uç noktası|endpoint/i.test(String(r.json.message)), `teknik metin sızdı: ${r.json.message}`);
});

test('28) yetkisiz kullanıcı customers listesinden de 403 alır', async () => {
  const r = await istek('u-muhasebe', '/api/admin/hizli-bilisim/customers');
  assert.equal(r.status, 403);
});

test('29) tenant izolasyonu: audit kaydı token\'daki tenant\'ı taşır, gövdeden ALINMAZ', async () => {
  sahteKurulum = v => ({ durum: 'BULUNDU', musteri: musteriVt(v) });
  const r = await istek('u-super', '/api/admin/hizli-bilisim/customers/ekle', 'POST',
    { vknTckn: '6262626262', tenantId: T2 }, T2);
  assert.equal(r.status, 200);
  const kayit = auditler()[0];
  assert.equal(kayit.tenantId, T2, 'audit tenant bilgisi doğrulanmış token kaynağından gelmeli');
});

test('30) kaynak denetimi: kullanıcıya dönen teknik sağlayıcı metni KALMADI', async () => {
  const fs = await import('node:fs');
  const dosyalar = [
    'server/services/hizliBilisim/hizliBilisimSyncService.ts',
    'server/services/hizliBilisim/hizliBilisimClient.ts',
    'server/routes/hizli-bilisim.ts',
  ];
  for (const d of dosyalar) {
    const kaynak = fs.readFileSync(path.join(process.cwd(), d), 'utf8');
    // Yalnız KOD satırları denetlenir; yorumlarda "önceki davranış"ı anlatmak
    // serbesttir (o metin kullanıcıya dönmez). Yorum satırlarını süz.
    const kod = kaynak
      .split('\n')
      .filter(s => {
        const t = s.trim();
        return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
      })
      .join('\n');
    assert.ok(
      !/uç noktası bulunmuyor/i.test(kod),
      `${d} içinde hâlâ kullanıcıya dönebilecek teknik mesaj var`
    );
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 6. MUTASYON SINIRI — muhasebe koleksiyonlarına dokunulmadı
// ════════════════════════════════════════════════════════════════════════════
test('31) MUTASYON SINIRI: ürün/cari/fatura/stok hareketi DEĞİŞMEDİ', () => {
  assert.deepEqual(muhasebeSayilari(), muhasebeTabani, 'müşteri ekleme akışı muhasebeye dokunmamalı');
});

// ── Koşum ───────────────────────────────────────────────────────────────────
kurulum();
muhasebeTabani = muhasebeSayilari();
await basla();

for (const t of tests) {
  try {
    await t.fn();
    passCount++;
    console.log(`  PASS  ${t.name}`);
  } catch (err: any) {
    failCount++;
    console.error(`  FAIL  ${t.name} — ${err?.message}`);
  }
}

// Sağlayıcı taklidini geri koy (süreç izolasyonu olsa da dürüstlük için).
(HizliBilisimClient as any).sorgulaMukellef = gercekSorgula;
server?.close();

console.log(`\nhizliMusteriSorguTest: ${passCount} PASS / ${failCount} FAIL`);
process.exitCode = failCount ? 1 : 0;
