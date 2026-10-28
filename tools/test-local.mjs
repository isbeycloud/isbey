import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
fs.mkdirSync('.verify-tmp', { recursive: true });
const directory = fs.mkdtempSync(path.resolve('.verify-tmp/local-'));
const suites = [
  'navigationUsabilityTest.ts',
  'fiscalDevicesTest.ts',
  'garantiPreparationTest.ts',
  'companyPackageManagementTest.ts',
  'documentVisualTest.ts',
  'hizliDocumentFileContractTest.ts',
  'invoiceRecipientContractTest.ts',
  'customerSearchTest.ts',
  'optionalFieldsContractTest.ts',
  // 2026-10-06: CANLI SESSİZ VERİ KAYBI. `DocumentConversionService` metotları
  // transaction DIŞINDAN çağrıldığında `getNextSequence` bayatlatmasına
  // yakalanıyordu: fatura/irsaliye/stok hareketi diske yazılmıyor ama API
  // "başarılı" diyordu. Bu dosya beş metodu da kalıcılık açısından ölçer.
  'documentConversionPersistenceTest.ts',
  // 2026-10-07 (`docs/85`): Belge sorgulama filtreleri. Karşı-taraf VKN'si belge
  // YÖNÜNE göre çözülür: gelen faturada `recipientTaxNumber` BİZİM VKN'mizdir,
  // tedarikçi değil. Yanlış alan okunursa arama sessizce yanlış/boş sonuç verir.
  'documentQueryFilterTest.ts',
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
  // 2026-10-12: İSİMLİ SATIŞ FİYAT LİSTELERİ (Perakende/Toptan/Bayi…).
  // Ürün başına tek `salePrice` alanına ek olarak liste bazlı fiyatlar,
  // carinin listeye bağlanması ve belge satırının o listeye göre fiyatlanması.
  // Bu dosya şunları ölçer: liste CRUD + tek varsayılan kuralı, liste SİLİNMEZ
  // (pasife alınır — bağlı cariler korunur), tenant izolasyonu (IDOR),
  // geçersiz fiyat girdilerinin diske yazılmaması (NaN tutar koruması),
  // kısmi güncellemede fiyatların korunması, "ne taban ne liste fiyatı yoksa
  // ürün açılmaz" kapısı, salePrice=0'ın geçerli olması ve GERİYE DÖNÜK UYUM
  // (listesiz üründe salePrice AYNEN kalır). Ağa ÇIKMAZ.
  'priceListContractTest.ts',
  // 2026-10-12: ÜRÜN VARYANTLARI + SUNUCU GÖRSEL YÜKLEME. Özellik tanımları
  // (Renk/Ebat…), ürün varyantları (kendi stoğu/barkodu/fiyatı), belge satırında
  // varyant zorunluluğu ve `data/uploads/products/` altına görsel kaydetme.
  // Bu dosya şunları ölçer: özellik CRUD + pasife alma, değer kimliği koruması,
  // tenant izolasyonu (IDOR), geçersiz varyant atılması, varyantsız üründe
  // davranışın korunması, varyant stok düşüşü ve toplam formülünün değişmemesi,
  // görsel mime/boyut kapıları ve tenant klasörü dışına erişilememesi. Ağa ÇIKMAZ.
  'variantContractTest.ts',
  // 2026-10-12: KULLANICI GÖRÜNÜRLÜK KAPSAMI (muhasebeci yetkilendirme).
  // Menü anahtarları + kasa/banka/personel/vergi kapsamı ve bu kapsamın VERİ
  // uçlarında (kasa/banka listeleme) gerçekten uygulanması. Kapsam yoksa tam
  // görünüm, boş liste kısıtlama değil, IDOR koruması ve audit kaydı ölçülür.
  // Ağa ÇIKMAZ.
  'userScopeContractTest.ts',
  // 2026-10-12: FATURA SERİLERİ (A/B Serisi…). Seri seçimi, sayaç ilerlemesi,
  // yabancı/pasif seri reddi, sayaç geri alınamaz, tenant izolasyonu ve
  // serisiz faturada eski sayaca düşüş (geriye dönük uyum). Ağa ÇIKMAZ.
  'invoiceSeriesContractTest.ts',
  // 2026-10-12: TASLAK FATURA PDF (gelen + giden). Sunucu yazdırılabilir HTML
  // üretir (TASLAK damgalı), istemci PDF'e çevirir. Gönderilmiş/işlenmiş belge
  // buradan alınamaz, TASLAK bandı zorunlu, tutarlar ERP kaydıyla birebir.
  // Ağa ÇIKMAZ (sunucuda PDF motoru yoktur).
  'draftPdfContractTest.ts',
  // 2026-10-12: GİB FATURA TİPLERİ (sekmeli vergi seçimi). 8 geçerli tip
  // (KONAKLAMA + SGK dahil) aynen saklanır, geçersiz tip 400, hesap formülü
  // değişmez. Ağa ÇIKMAZ.
  'invoiceTaxTypeContractTest.ts',
  // 2026-10-15: RAPOR TENANT İZOLASYONU. Legacy `/api/reports/*` (7 uç)
  // tenant filtresizdi — HER firma TÜM firmaların verisini görüyordu.
  // İki tenant'lı veride A kendi verisini görür, B sıfır görür. Ağa ÇIKMAZ.
  'reportsTenantIsolationTest.ts',
  // 2026-10-17: KASA/BANKA TENANT İZOLASYONU. `/api/cash`, `/api/banks`,
  // `/api/dashboard/summary` ve `/api/products` (depo) sahipliği kayıt
  // KİMLİĞİ dizesinden çıkarıyordu (`id.includes(tenantId)`, `isDefault`,
  // `!id.startsWith('cash-tnt-')`). B firmasının token'ı A'nın kasa/banka
  // kayıtlarını ve HAREKETLERİNİ okuyabiliyor; `POST /api/cash/transaction`
  // yabancı kasanın BAKİYESİNİ değiştirebiliyordu. Bu dosya sahipliğin TEK
  // KAYNAKTAN (tenantId/companyId alanı) okunduğunu, yazma yolunun IDOR
  // kapısını, geçiş verisinin varsayılan firmada kaldığını ve yeni kayıtların
  // AÇIK damgayla yazıldığını ölçer. Ağa ÇIKMAZ.
  'cashBankTenantIsolationTest.ts',
  // 2026-10-17: DEPO SAHİPLİĞİ + STOK HAREKETİ KAPISI (P0).
  // Eski hâlde `POST /api/products` ve `POST /api/products/adjust` depo
  // seçimini `|| draft.warehouses[0]` ile DOLDURUYORDU: B firması A'nın
  // deposuna stok yazabiliyor, hiç depo yoksa ürün `warehouseId`'siz
  // kalıyordu. Bu dosya boş/geçersiz/yabancı deponun REDDEDİLDİĞİNİ,
  // `StockMovement`'ın tenantId'siz yazılamadığını, geri alınan işlemin
  // stoğu DEĞİŞTİRMEDİĞİNİ ve sahipsiz deponun HİÇBİR firmaya açılmadığını
  // ölçer. N1–N8 negatif senaryoları tek tek kanıtlanır. Ağa ÇIKMAZ.
  'warehouseTenantIsolationTest.ts',
  // 2026-10-19: ÇAPRAZ-TENANT IDOR TARAMASI (P0 devamı).
  // Depo kapısı kapandıktan sonra geriye "başka firmanın KAYDINI kimliğiyle
  // okuyup/yazabilme" sınıfı kaldı. Bu dosya B firmasının gerçek kayıtlarını
  // kurar, A kimliğiyle 12 router'ın `/:id` uçlarını dener: yabancı kayıt
  // 403/404 almalı, kendi kaydı 2xx almalı (aşırı kilit de hata sayılır).
  // Liste uçlarında gövde sızıntısı da taranır. Ağa ÇIKMAZ.
  'crossTenantIdorTest.ts',
  // 2026-10-17: KAPSAMLI RAPOR FİLTRELERİ + DETAY RAPORLARI.
  // `/api/v1/reports/detail/*` uçları geçersiz filtreyi SESSİZCE boş liste
  // yapmıyor, açık 400 dönüyor (bozuk tarih/tutar/ters aralık); cari ekstre
  // defteri, varyant stok kırılımı ve kasa/banka hareket dökümü tutarlılığı
  // ölçülüyor; B firması A'nın kimliğini filtre olarak verse bile kayıt
  // göremiyor (parametre yetki kanıtı değildir). Ağa ÇIKMAZ.
  'reportFilterDetailTest.ts',
  // 2026-10-17: v1 DOĞRUDAN KAYIT KALICILIĞI (orders/quotes/waybills/cash).
  // HTTP 201 dönmek kayıt anlamına GELMEZ: bayat `db` referansı yüzünden uç
  // "kaydedildi" derken satır diske yazılmıyordu. Test her uç için kaydı DİSKTEN
  // yeniden okuyarak doğrular; irsaliyede stok hareketi + ürün stoğu düşümü de
  // ölçülür. Yalnız localhost'a bağlanır.
  'directCreatePersistTest.ts',
  // 2026-10-17: RAPOR OLUŞTURUCU MANTIĞI (saf fonksiyonlar). Boş filtre
  // "seçili değil" demektir ve satır ELENMEZ; dolu ürün/varyant/durum/tutar
  // filtreleri KATI süzer (alanı taşımayan satır da elenir, tarih hariç);
  // tutar MUTLAK değerle ölçülür (çıkış satırı da eşiğe takılır); gruplama
  // toplamı satır toplamına EŞİTTİR. Ağa ÇIKMAZ.
  'reportBuilderLogicTest.ts',
  // 2026-10-15: VKN İLE KAYIT + 14 GÜN DENEME + E-DÖNÜŞÜM KARAR KAPISI.
  // Kayıtta e-Fatura/e-Belge seçimi sorulmaz (ön muhasebe doğrudan açılır),
  // deneme bitince karar zorunludur (kilitli veri uçları 403). Hızlı Bilişim
  // YEREL taklit edilir; dışarı tek istek (SMTP dahil) çıkmaz. SMTP
  // bilerek boştur: mail QUEUED kalır, SENT asla uydurulmaz. Ağa ÇIKMAZ.
  'registrationTrialGateTest.ts',
  // 2026-10-20: SIFIR TUTAR KAPISI. Canlıda SAT-2026-000005 (RETAIL_POS, 3×0 TL)
  // stok çıkışı doğurdu, alacak doğurmadı, nedeni hiçbir yerde yazmıyordu.
  // Bu dosya kapının İKİ yazma yolunda da (legacy `/api/invoices` ve
  // `/api/v1/invoices`) çalıştığını, gerekçesiz sıfır satışın HİÇBİR ŞEY
  // yazmadan reddedildiğini, gerekçelinin belgeye + denetim kaydına geçtiğini
  // ve ALIŞ/PROFORMA ile toplamı > 0 olan işlemlerin ENGELLENMEDİĞİNİ ölçer.
  // Ağa ÇIKMAZ.
  'zeroPriceGateContractTest.ts',
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
