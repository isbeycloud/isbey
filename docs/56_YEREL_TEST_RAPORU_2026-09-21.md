# Yerel test raporu — 21 Eylül 2026

Bu koşu yerel doğrulamadır; canlı entegratör veya tarayıcı üzerinden uçtan uca kabul kanıtı değildir.

| Kontrol | Sonuç |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | Çıkış 0; mevcut uyarılar var |
| `npm run build` | PASS; ana JS paketi 2.506,86 kB, gzip 593,15 kB; boyut uyarısı var |
| credentialVaultRegressionTest | 44 PASS / 0 FAIL |
| credentialMaskRegressionTest | 28 PASS / 0 FAIL |
| faz29UatScenarioSuite | 17 PASS / 0 FAIL |
| phase32CreditLifecycleTest | PASS: rezervasyon, düşüm, serbest bırakma, iade |
| faz252bPermissionRegistryTest | Düzeltmeden sonra 33 PASS / 0 FAIL; 29 farklı route izin kodu |
| faz252dFrontendMatrixAlignmentTest | 20 PASS / 0 FAIL |
| faz27EnvironmentConfigTest | 10 PASS / 0 FAIL |
| phase19GuidFindUnitTest | 12 PASS / 0 FAIL |

Sayaç bildiren süitler toplamı: 164 PASS / 0 FAIL. Kontör yaşam döngüsü ayrıca geçti.

## Düzeltilen test açığı

Permission registry testi yalnız tek tırnaklı `requirePermission('...')` çağrılarını arıyordu. Mevcut route'lar `PERMISSIONS.*` kullandığından sıfır izin koduyla PASS üretiyordu. Tarama TypeScript sözdizimi ağacına taşındı; yorumlar dışarıda bırakıldı, sabitler ve string değerler okunuyor. Boş tarama ve çözümlenemeyen çağrılar artık FAIL.

İzole negatif örnekte tanımsız sabit ve tanımsız izin kodunun beklenen üç kontrolü başarısız yaptığı doğrulandı. Çok satırlı geçerli çağrı okundu, yorumdaki çağrı sayılmadı.

## Koşum ve kapsam

TypeScript testleri `node --import tsx server/tests/<dosya>` ile çalıştırıldı. Frontend matris testi doğrudan `node` ile çalıştırıldı.

Veri yazan UAT ve kontör testlerinde `NODE_ENV=test` ve ayrı `DATABASE_PATH` kullanıldı:

- `.verify-tmp/uat-20260921.test.json`
- `.verify-tmp/phase32-credit-lifecycle.test.json` (test sonunda kendi dosyasını temizler)

UAT ilk denemesi sandbox içindeki esbuild `spawn EPERM` hatası nedeniyle başlayamadı; izinli yeniden koşum geçti.

Canlı entegratöre istek veya belge gönderimi yapılmadı. UAT süitinin yerel senaryoları ve statik yetki matrisleri, gerçek HTTP yetkilendirme testlerinin yerine geçmez. `tests/example.spec.ts` yalnız Playwright örnek sitesini test ettiğinden bu koşuya dahil edilmedi. Tarayıcı E2E ve bağımlılık güvenlik taraması bu koşuda çalıştırılmadı.
