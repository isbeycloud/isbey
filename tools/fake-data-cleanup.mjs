/**
 * İŞBEY CLOUD — Uydurma veri temizliği (2026-09-12)
 * =================================================
 * NEDEN VAR:
 *   `hizli-bayi.ts` içindeki eski `ensureDealerData()` ve `seed.ts`, DB'ye
 *   UYDURMA bayi/müşteri/komisyon kayıtları yazmıştı. Kaynak kod artık
 *   üretmiyor, ancak kayıtlar `data/database.json` içine kalıcı olarak
 *   işlenmişti ve panel/KPI'ları beslemeye devam ediyordu:
 *     - dashboard: 3 "bayi müşterisi", 27.500 kontör
 *     - komisyon ekranı: 5.976 TL hakediş (MOCK ödemeden türetilmiş)
 *     - partner ağı: ~10 adet "TEST ANADOLU BAYİSİ LTD." düğümü
 *
 *   Aynı temizlik `server/db/storage.ts` içindeki
 *   `migrateFabricatedDataCleanup()` ile de uygulanır (sunucu açılışında).
 *   Bu betik, sunucuyu başlatmadan JSON'a doğrudan uygulamak içindir.
 *
 * NE SİLER (yalnız kanıtlanmış uydurma kayıtlar — açık ID allowlist'i):
 *   dealerCustomers : dc-1681136628, dc-20574058582, dc-08132170413
 *   dealers         : dealer-marmara            (dealer-isbey-hq GERÇEK, korunur)
 *   dealerCommissions: dcom-1                   (+ bayi bakiyesinden düşülür)
 *   partnerNodes    : adı "TEST ANADOLU BAYİSİ LTD." ve parentPartnerId=null
 *   commissionPayoutTxs: yukarıdaki partner'lara ait kayıtlar
 *
 * NEYE DOKUNMAZ:
 *   - Gerçek Hızlı Bilişim mükellef kayıtları: `externalCustomers`
 *     (externalId "HB-<VKN>", taxNumber gerçek). Bunlar Hızlı Bilişim test
 *     ortamından GERÇEKTEN çekilmiş kayıtlardır.
 *   - Gerçek partner zinciri: partner-hq → partner-dealer-marmara →
 *     partner-sub-kadikoy (parentPartnerId/cüzdan/komisyon ilişkileri korunur).
 *   - `documentPrefixConfigs` (bu görev kapsamı dışı — belge üretiminden
 *     bağımsız, kullanıcı talimatı).
 *   - `dealers/dealer-isbey-hq` (VKN 4810592817 = platformun kendi firması).
 *
 * GÜVENLİK SINIRLARI:
 *   - NODE_ENV=production ise ÇALIŞMAZ.
 *   - Yazmadan önce `.verify-tmp/` altına zaman damgalı tam yedek bırakır.
 *   - Yazma atomiktir: temp dosya + renameSync.
 *   - İdempotenttir: silinecek kayıt yoksa hiçbir şey yazmaz (exit 0).
 *
 * KULLANIM (repo kökünden):
 *   node tools/fake-data-cleanup.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DATA_FILE = path.join(ROOT, 'data', 'database.json');
const TMP_DIR = path.join(ROOT, '.verify-tmp');

function log(etiket, mesaj) {
  console.log(`${etiket} ${mesaj}`);
}

if (process.env.NODE_ENV === 'production') {
  log('TEMIZLIK-HATA', 'NODE_ENV=production — bu araç üretimde çalışmaz.');
  process.exit(1);
}

if (!fs.existsSync(DATA_FILE)) {
  log('TEMIZLIK-ATLANDI', `data/database.json yok (${DATA_FILE}) — uygulama ilk açılışta seed üretecek.`);
  process.exit(0);
}

let state;
try {
  state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
} catch (e) {
  log('TEMIZLIK-HATA', `database.json okunamadı/parse edilemedi: ${e.message}`);
  process.exit(1);
}

// ─── Açık ID allowlist'leri (desen/regex ile toplu silme YOK) ───────────────
const FABRICATED_DEALER_CUSTOMER_IDS = [
  'dc-1681136628',
  'dc-20574058582',
  'dc-08132170413',
];
const FABRICATED_DEALER_IDS = ['dealer-marmara'];
const FABRICATED_COMMISSION_IDS = ['dcom-1'];
const TEST_PARTNER_NAME = 'TEST ANADOLU BAYİSİ LTD.';

const silinecek = [];

// 1) Uydurma bayi müşterileri
const dcOnce = (state.dealerCustomers || []).length;
state.dealerCustomers = (state.dealerCustomers || []).filter(c => {
  const sil = FABRICATED_DEALER_CUSTOMER_IDS.includes(c.id);
  if (sil) silinecek.push(`dealerCustomers  ${c.id}  ${c.companyName || c.title || ''}`);
  return !sil;
});
const dcSonra = state.dealerCustomers.length;

// 2) Uydurma bayi
state.dealers = (state.dealers || []).filter(d => {
  const sil = FABRICATED_DEALER_IDS.includes(d.id);
  if (sil) silinecek.push(`dealers          ${d.id}  ${d.name || ''}`);
  return !sil;
});

// 3) Uydurma komisyon (+ bayi bakiyesinden düş)
const kaldirilanKomisyonlar = (state.dealerCommissions || []).filter(c =>
  FABRICATED_COMMISSION_IDS.includes(c.id)
);
if (kaldirilanKomisyonlar.length > 0) {
  state.dealerCommissions = state.dealerCommissions.filter(
    c => !FABRICATED_COMMISSION_IDS.includes(c.id)
  );
  for (const com of kaldirilanKomisyonlar) {
    silinecek.push(`dealerCommissions ${com.id}  ${com.commissionAmount} TL (${com.dealerName || com.dealerId})`);
    const dealer = (state.dealers || []).find(d => d.id === com.dealerId);
    if (dealer) {
      dealer.balance = Math.round((((dealer.balance || 0) - (com.commissionAmount || 0))) * 100) / 100;
      silinecek.push(`  ↳ ${dealer.id} bakiyesi ${com.commissionAmount} TL düşüldü → ${dealer.balance} TL`);
    }
  }
}

// 4) Test partner düğümleri + onlara bağlı komisyon ödemeleri
const testPartnerIds = (state.partnerNodes || [])
  .filter(p => (p.name || '').trim() === TEST_PARTNER_NAME && !p.parentPartnerId)
  .map(p => p.id);

if (testPartnerIds.length > 0) {
  state.partnerNodes = (state.partnerNodes || []).filter(p => !testPartnerIds.includes(p.id));
  for (const id of testPartnerIds) silinecek.push(`partnerNodes     ${id}  ${TEST_PARTNER_NAME}`);

  // Savunmacı referans temizliği: gerçek düğümler öksüz kalmasın.
  for (const node of state.partnerNodes) {
    if (Array.isArray(node.subDealerIds) && node.subDealerIds.length > 0) {
      node.subDealerIds = node.subDealerIds.filter(id => !testPartnerIds.includes(id));
    }
    if (node.parentPartnerId && testPartnerIds.includes(node.parentPartnerId)) {
      node.parentPartnerId = null;
    }
  }

  const txOnce = (state.commissionPayoutTxs || []).length;
  state.commissionPayoutTxs = (state.commissionPayoutTxs || []).filter(
    tx => !testPartnerIds.includes(tx.partnerId)
  );
  const txSilinen = txOnce - state.commissionPayoutTxs.length;
  if (txSilinen > 0) silinecek.push(`commissionPayoutTxs ${txSilinen} kayıt (test partnerlerine ait)`);
}

// ─── Rapor / yazma ──────────────────────────────────────────────────────────
if (silinecek.length === 0) {
  log('TEMIZLIK-OK', `Silinecek uydurma kayıt yok (idempotent). dealerCustomers=${dcSonra}, partnerNodes=${(state.partnerNodes || []).length}.`);
  process.exit(0);
}

fs.mkdirSync(TMP_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const yedek = path.join(TMP_DIR, `fake-data-before-${stamp}.json`);
fs.copyFileSync(DATA_FILE, yedek);

const tempFile = `${DATA_FILE}.tmp-cleanup`;
fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf-8');
fs.renameSync(tempFile, DATA_FILE);

for (const satir of silinecek) log('TEMIZLIK-SILINDI', satir);
log(
  'TEMIZLIK-OK',
  `${silinecek.length} satır temizlendi. dealerCustomers ${dcOnce}→${dcSonra}. Yedek: ${path.relative(ROOT, yedek)}`
);
process.exit(0);
