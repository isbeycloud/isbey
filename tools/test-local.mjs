import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
fs.mkdirSync('.verify-tmp', { recursive: true });
const directory = fs.mkdtempSync(path.resolve('.verify-tmp/local-'));
const suites = [
  'documentVisualTest.ts',
  'customerSearchTest.ts',
  'hizliSendContractTest.ts',
  'hizliReconcileContractTest.ts',
  'hizliSendingLockTest.ts',
  'hizliInvoiceNumberContractTest.ts',
  'hizliRegistryContractTest.ts',
  'xsltSecurityTest.ts',
  'eInvoiceLivePreparationTest.ts',
  'eServicesTest.ts',
  'serviceEntitlementsTest.ts',
  'hizliDealerPortalTest.ts',
  'productionProvisioningTest.ts', 'productionTenantTest.ts', 'membershipIsolationTest.ts', 'credentialVaultRegressionTest.ts', 'credentialMaskRegressionTest.ts',
  'faz252bPermissionRegistryTest.mjs', 'faz252dFrontendMatrixAlignmentTest.mjs',
  'faz27EnvironmentConfigTest.ts', 'phase19GuidFindUnitTest.ts',
  'faz29UatScenarioSuite.ts', 'phase32CreditLifecycleTest.ts', 'productionReadinessTest.ts', 'storageWriteFailureTest.ts',
  'xsltStudioScenarioTest.ts',
  'ublParserTest.ts',
  'incomingDocumentIngestionTest.ts',
  // 2026-09-29: Operasyon durumu (YENİ/EŞLEŞTİRME BEKLİYOR/HAZIR/İÇERİ ALINDI/HATA)
  // türetme kuralları. Durum yanlış türetilirse operatörün iş listesi bozulur.
  'incomingDocumentStatusTest.ts',
  // 2026-09-28: Gelen belge YETKİ + SAYFALAMA sözleşmesi. Gerçek router'ı mount
  // edip HTTP isteği atar — `einvoice.view` katalogda olmadığı için COMPANY_ADMIN
  // dahil herkesin 403 aldığı hata, statik/registry testleri YEŞİLKEN ortaya
  // çıkmıştı; yalnız gerçek istek bunu yakalayabilir.
  'incomingDocumentAuthzTest.ts',
  // 2026-09-29: A–O ZORUNLU MATRİS. Tek satır / 10 satır / 100 satır, aynı
  // belgede %1+%10+%20 KDV, iskontolu satır (çift indirim yok), TRY dışı para
  // birimi (kur UYDURULMADAN engellenir), transaction ortasında hata → TAM geri
  // alma, XXE yükü (diske yazılmaz). G/H/I/J/L/M/N maddeleri kendi dosyalarında
  // koşar; bu dosya onların yerinde durduğunu programatik olarak da doğrular.
  'incomingDocumentMatrixTest.ts',
  // 2026-09-29: ENTEGRATÖRDEN ÇEK senkron sözleşmesi (16 senaryo). Bu dosya
  // sağlayıcıyı YEREL taklit ile değiştirir; Hızlı Bilişim'e ÇIKMAZ. Ölçtüğü
  // şey yalnız "çalışıyor mu" değil: 401/500/timeout'ta sessizce "0 belge"
  // denmemesi, mükerrerin SAYILMASI (0 gösterilmesi operatörü yanıltıyordu),
  // tarih aralığının sunucuda 90 güne sınırlanması ve her senkron sonrası
  // stok/cari/fatura/stok hareketinin DEĞİŞMEMESİ.
  'incomingProviderSyncTest.ts',
  // 2026-09-30: SAĞLAYICI YANIT SÖZLEŞMESİ. Canlıda "1 yeni / 15 mükerrer"
  // üreten ve havuzda içeriği okunamayan TEK kayıt bırakan sessiz bozulmanın
  // regresyonu. Ölçülen gerçek şekil: liste PascalCase (`UUID`, `DocumentId`,
  // `TargetIdentifier`, …), içerik ise `{ DocumentFile: "<base64>" }`.
  // 28 yerel suite + 33 Playwright spec YEŞİLKEN bu hata canlıdaydı; bu dosya
  // yalnız o boşluğu kapatır. Ağa ÇIKMAZ.
  'providerResponseContractTest.ts',
  // 2026-10-01: HIZLI BİLİŞİM MÜKELLEF SORGU / PORTFÖY YÖNETİMİ. Panel sıfır
  // kayıtla açıldığında "HB'den Güncelle" çıkmazda kalıyordu ve kullanıcıya
  // teknik sağlayıcı metni ("...listele uç noktası bulunmuyor") gösteriyordu.
  // Bu dosya yeni akışı ölçer: VKN/TCKN biçim kapısı, BULUNDU/BULUNAMADI/401/
  // 429/500/timeout sınıfları, idempotent ekleme, 20 kayıtlık toplu güncelleme
  // (17/2/1), tenant izolasyonu, audit'te secret yokluğu ve MUHASEBE yetkisizliği.
  // Ağa ÇIKMAZ (sağlayıcı yerel taklit edilir).
  'hizliMusteriSorguTest.ts',
  // 2026-10-02: CANLI HATA (liste bos, KPI dolu). `params ? ...URLSearchParams(params): ''`
  // kalibi `undefined`'i "undefined" string'ine ceviriyordu; backend bunu gercek
  // arama terimi sanip TUM kayitlari eliyordu. buildQuery yalniz dolu degerleri gecirir.
  // Aga CIKMAZ (saf fonksiyon + router filtresinin kopyasi).
  'hizliQueryParamSanitizeTest.mjs',
];
let failures = 0;
for (const suite of suites) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', `server/tests/${suite}`], {
    stdio: 'inherit', timeout: 120000,
    env: { ...process.env, NODE_ENV: 'test',
      DATABASE_PATH: path.join(directory, suite === 'phase32CreditLifecycleTest.ts' ? 'phase32-credit-lifecycle.test.json' : `${suite}.json`),
      JWT_SECRET: crypto.randomBytes(48).toString('hex'),
      HIZLI_BILISIM_ALLOW_PROD: 'false', HIZLI_BILISIM_IS_TEST_MODE: 'true',
    },
  });
  if (result.status !== 0) { failures++; console.error(`FAIL: ${suite}`, result.error?.message || ''); }
}
console.log(`Local suites: ${suites.length - failures} PASS / ${failures} FAIL`);
process.exitCode = failures ? 1 : 0;
