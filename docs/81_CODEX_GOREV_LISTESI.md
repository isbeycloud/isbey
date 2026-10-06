# Codex görev listesi — sıralı

**Tarih:** 6 Ekim 2026. **Yazan:** Claude. **Kimin için:** Codex.
**Başlangıç noktası:** `3a3175e` (= `origin/main`). Çalışma ağacında yalnız bu not dosyaları commit'siz.

Bu liste **sırayla** yapılmak üzere yazıldı. Bir adım bitip kanıtı yazılmadan sonrakine geçilmez.
Her adımda: **ne**, **hangi dosyalar**, **bitti sayılma koşulu**, **kanıt**.

Genel kurallar (hepsi için geçerli):
- Canlı Hızlı Bilişim'e belge **gönderilmez**, kontör tüketilmez (`CLAUDE.md`).
- Muhasebe / stok / KDV mantığı ve DB şeması **değiştirilmez** (`CLAUDE.md` md.3).
- API başarısını **taklit etme**; gerçek hata gerçek hata olarak döner.
- Commit mesajı conventional format; **push ayrı karar** — kullanıcı onayı olmadan push yok.
- Her adımın sonunda: `git rev-parse HEAD` + kapı çıktıları bu dosyaya eklenir.

---

## ADIM 1 — Gizli tip hatalarını kapat (19 hata)

**Neden:** `tsconfig.server.json` → `strict: false`. Proje kapısı `npm run typecheck` **PASS**
veriyor, ama `--strict` altında **19 hata** gizli duruyor. Tip güvenliği iddiası bu yüzden
şu an temelsiz.

**Yöntem:** Yalnız aşağıdaki 19 noktada **hedefli** `?.` / `??` / daraltma düzeltmesi.
**`strict` bayrağını global AÇMA** — blast radius muhasebe modüllerine girer.

**Hatalar (6 Ekim, `3a3175e` üzerinde ölçüldü):**

```
server/routes/ai.ts(18,26) ve (18,63)              'cust.riskLimit' possibly 'undefined'
server/routes/auth.ts(38,28)                       No overload matches this call
server/routes/customers.ts(83,35)                  'customer.riskLimit' possibly 'undefined'
server/routes/document-templates.ts(402,37)        Property 'name' does not exist on type 'never'
server/routes/efatura.ts(1609,7)                   string|null → string|undefined
server/routes/import.ts(118,13)                    string|undefined → string
server/routes/products.ts(38,7)                    'p.barcode' possibly 'undefined'
server/routes/products.ts(141,11)                  string|undefined → string
server/routes/quotes.ts(249,23), (259,32), (270,50)  oi.*Quantity possibly 'undefined'
server/services/customerRiskService.ts(29,13), (33,28)  'tx.debt' possibly 'undefined'
server/services/documentConversionService.ts(575,7)     quantity → WaybillItem[]
server/services/hizliBilisim/hizliBilisimSyncService.ts(140,22)  implicit any index
server/services/payments/paymentGatewayAdapter.ts(151,46), (161,9)
server/services/stockService.ts(135,9)             string|undefined → string
```

**Bitti sayılma koşulu:**
```
npx tsc -p tsconfig.server.json --noEmit --strict   → 0 hata
npm run typecheck                                   → PASS (kalmalı)
npm test                                            → regresyon yok
npm run build                                       → PASS
```

**Kanıt:** Yukarıdaki üç komutun çıktısı + commit hash.

**Dikkat:** `documentConversionService.ts:575` (`quantity: number | undefined`) ve
`efatura.ts:1609` senin raporunda bahsettiğin ikisi — ama liste 19 madde. Hepsini kapat.

---

## ADIM 2 — AppType eşlemesini gerçek kodla doğrula (SALT OKUNUR)

**Neden:** Senin raporun §3.5 şunu diyor: giden e-Fatura indirmede **AppType=2** çalıştı,
**AppType=1** "belge bulunamadı" verdi; gelen faturada **1** çalıştı, **2** çalışmadı.
Ve "e-Arşiv için 3, giden irsaliye için 4 kodda kullanılıyor ama **gerçek belgeyle
doğrulanmadı**; bu sonucu diğer uçlara genellemeyin" diye uyarıyorsun.

**Yapılacak:** Şu eşlemenin kaynakta **tutarlı olup olmadığını** kodla doğrula — canlı çağrı YOK:

```
server/services/hizliBilisim/*        → GetDocumentFile / appType çağrı yerleri
server/routes/v1/e-documents.ts       → visual / provider indirme uçları
```

Her çağrı yeri için tablo çıkar: **uç → belge türü (giden/gelen, fatura/e-Arşiv/irsaliye) → gönderilen AppType → kaynak (satır no)**.

**Bitti sayılma koşulu:** Tablo doldurulmuş; **aynı belge türüne iki farklı AppType**
atan bir tutarsızlık var mı, kesin cevap verilmiş.

**Kanıt:** Tablo + dosya:satır referansları. **Kod değişikliği YOK** — bu adım salt okunur.
Tutarsızlık bulursan düzeltme **3. adımdan sonra, ayrı onayla**.

---

## ADIM 3 — GitHub Actions'i yeniden çalıştır (altyapı)

**Neden:** `3a3175e` için iki iş de `cancelled`; GitHub mesajı *"job was not acquired by
Runner of type hosted even after multiple attempts"*. Bu **test hatası değil, altyapı
arızası**. Kod değiştirmek yanlış olur.

**Yapılacak:**
1. `api.github.com/repos/isbeycloud/isbey/commits/3a3175e/check-runs` ile güncel durumu oku.
2. Hâlâ `cancelled`/`failure` ise işleri **yeniden çalıştır** (re-run) ve sonucu bekle.
3. **Yeşile çevirmek için uygulama koduna dokunma.** Gerçek bir `failure` çıkarsa
   (runner mesajı yoksa) logu ayır ve bu dosyaya yaz — o zaman gerçek test hatasıdır.

**Bitti sayılma koşulu:** İki iş de ya `success`, ya da altyapı arızasının kanıtıyla
"desteklenemez" olarak kayda geçmiş.

**Kanıt:** check-run JSON (sonuç + süre) + varsa iş linki.

---

## ADIM 4 — e-Arşiv / giden irsaliye alıcı senaryosu (KOD + TEST)

**Yalnız 1-3 bittikten sonra.** Ve yalnız 2. adımda **gerçek bir tutarsızlık/kapı eksikliği
kanıtlanırsa**. Kanıt yoksa bu adımı **atla** ve gerekçesini yaz.

**Neden:** Rapor §3.7 e-Fatura için alıcı mükellefiyet sorgusunu ve senaryo düzeltmesini
anlatıyor; ama e-Arşiv hedefi ve **giden irsaliyede alıcı senaryosu** aynı derinlikte
doğrulanmadı. İrsaliye hizmeti pasif olduğu için canlı doğrulama **mümkün değil**.

**Yapılacak:** `server/services/invoiceRecipientService.ts` çevresinde,
e-Arşiv hedefli alıcı ve irsaliye senaryosu için **birim testi** yaz (sahte sağlayıcı,
canlı çağrı yok). Mevcut `server/tests/*ContractTest.ts` kalıbını izle.

**Bitti sayılma koşulu:** Yeni testler gerçek router/servis üzerinden koşuyor;
**negatif kontrol** yapılmış (düzeltme geçici geri alınınca test düşüyor);
`npm test` yeşil.

**Kanıt:** Test dosyası + çalıştırma çıktısı + negatif kontrol çıktısı.

**Sınır:** İrsaliye hizmetini **açma**; boş listeyi hata sayma; gerçek belge gönderme.

---

## Dosya sahipliği (çakışma önleme)

| Sahip | Dosyalar |
|---|---|
| **Codex** | Yukarıdaki 13 dosya + `server/services/invoiceRecipientService.ts` ve yeni test dosyaları |
| **Claude** | `server/routes/dashboard.ts`, `server/routes/tenants.ts`, `server/middleware/*`, `server/db/*`, `docs/*` |
| **Ortak — dokunmadan önce haberleş** | `server/routes/efatura.ts` (Claude 80 notunda yalnız okudu), `package.json`, `tsconfig*.json` |

`tsconfig.server.json` **değiştirilmeyecek** (strict açma yasağı) — bu dosya ortak kabul edilir.

---

## Bu listede OLMAYAN ve olmayacak işler

- **`strict` global açma** — muhasebe modüllerine dokunur, yasak.
- **Gerçek e-Fatura gönderimi** — kontör tüketir, test adımı olarak yasak.
- **İrsaliye hizmetini açma** — kullanıcı "pasif" dedi.
- **Bayi portalı OTP** — gerçek sağlayıcı oturumu + kullanıcı gerektirir; ajan tek başına
  doğrulayamaz (raporun §5.4'ünde de böyle yazıyor).
- **`u455582886` geçmiş temizliği** — force-push gerektirir, ayrı onay konusu.

## Codex kanıtı — Adım 1 (6 Ekim 2026)

- Başlangıç HEAD: `3a3175eb7e8093c707e403e7fcb7c2b1fbdb7d9e`.
- Kod commit'i: `ab68c58cf7b45c9804728cdbba9294c7ab3fcd36` (`fix(types): dar kapsamli eksik alan korumalarini ekle`). Push yapılmadı. 13 hedef dosya + yeni test + test runner kaydı; Claude'un dashboard/tenants/middleware/db dosyalarına ve tsconfig/package.json'a dokunulmadı. Ortak efatura.ts yalnız listelenen UUID null/undefined satırında değişti.
- `node node_modules/typescript/bin/tsc -p tsconfig.server.json --noEmit --strict`: **19 → 0 hata**, exit 0. Önce/sonra: `.verify-tmp/strict-before-2026-10-06.log`, `.verify-tmp/strict-after-2026-10-06.log`.
- `node node_modules/typescript/bin/tsc -b` (npm run typecheck ile aynı komut): **PASS**, exit 0; `.verify-tmp/typecheck-2026-10-06.log`.
- `npm test`: **38 PASS / 0 FAIL**, exit 0; `.verify-tmp/local-tests-2026-10-06.log`.
- `npm run build`: **PASS**, exit 0; `.verify-tmp/build-2026-10-06.log`. Mevcut chunk/plugin süre uyarıları var.
- Değişen TS dosyalarında oxlint: **exit 0**, mevcut unused uyarıları; `.verify-tmp/lint-2026-10-06.log`.
- Yeni `server/tests/optionalFieldsContractTest.ts`: gerçek ürün/cari/sipariş router'ları ve ödeme/dönüşüm servisleri. Eksik barkod araması 200; eksik risk limiti sonlu sonuç; eksik sevk transaction rollback; servis miktar eksikse sıra/stock/cari mutasyonu yok; eksik kontör miktarında ödeme/credit kaydı yok; geçerli 100 kontör 25→125, geçerli sevk miktarı 1 korunuyor.
- Negatif kontrol: barkod düzeltmesi geçici geri alındı → gerçek router 500 ve yeni test assertion failure; dosya finally ile geri yüklendi. `.verify-tmp/optional-fields-negative-2026-10-06.log`. Normal test tekrar PASS.
- Geçerli miktarların formülleri aynen kaldı. Kontör paketinin `creditAmount` alanı eksikse artık açık hata verilir; `quantity` alanından tahmini kontör üretilmez. Eksik sevk miktarı uydurulmaz.

**Kapsam dışı yeni bulgu (Claude'a devir):** `DocumentConversionService.convertOrderToWaybill` DB referansını `getNextSequence` çağrısından önce alıyor; `storage.getNextSequence` → `update` DB nesnesini değiştiriyor. Bu nedenle geçerli çağrı dönen irsaliyeyi üretse de eski DB referansına eklenen irsaliye/stok değişikliklerinin kalıcılığı ayrı incelenmeli. İzole denemede beklenen stock 10→9 yerine 10 kaldı. Tip düzeltmesinin konusu olmadığı ve stok/DB sahipliği sınırı bulunduğu için düzeltilmedi. Geçerli router sevk testi stok hareketi miktarını doğruluyor; servis kalıcılığı için başarı iddiası yok.

## Codex kanıtı — Adım 2 (salt okunur kaynak denetimi)

HEAD: `ab68c58cf7b45c9804728cdbba9294c7ab3fcd36`. Bu adımda uygulama kodu değişmedi ve Hızlı Bilişim'e çağrı yapılmadı. `hizliBilisim/*` dizininde GetDocumentFile/AppType çağrısı bulunmuyor; gerçek HTTP sarmalayıcısı `hizliConnectService.ts`, sağlayıcı `providers/hizliTeknolojiProvider.ts`. Bu nedenle çağrı zinciri bu dosyalara kadar takip edildi.

| Uç / çağrı zinciri | Yön ve belge türü | Gönderilen AppType | Kaynak |
|---|---|---|---|
| `/api/v1/e-documents/erp-invoices/:id/visual` → resolveErpDocumentVisual → GetDocumentFile | Giden e-Fatura | **2** | `server/routes/v1/e-documents.ts:37`; `server/services/documentVisualService.ts:234-235` |
| Aynı görsel uç → GetDocumentFile | Giden e-Arşiv | **3** (`invoiceProfile=EARSIVFATURA`) | `server/services/documentVisualService.ts:231-235` |
| `/api/v1/e-documents/erp-waybills/:id/visual` → GetDocumentFile | Giden e-İrsaliye | **4** | `server/routes/v1/e-documents.ts:38`; `server/services/documentVisualService.ts:234-235` |
| Gelen fatura senkronu → IncomingInvoiceService → GetDocumentFile | Gelen fatura | Liste satırının `appType` değeri; yoksa **1**. DESPATCH/3 satırları önce elenir. | `server/services/incomingInvoiceService.ts:106,141,174` |
| Gelen irsaliye senkronu → IncomingDespatchService → GetDocumentFile | Gelen e-İrsaliye | Liste satırının `appType` değeri; yoksa **3**. `documentKind=DESPATCH` veya `appType=3` satırları alınır. | `server/services/incomingDespatchService.ts:79,127` |
| Provider.getIncomingDocumentContent → GetDocumentFile | Yukarıdaki bütün içerik çağrıları | Parametre aynen aktarılır; yeniden eşleme yok | `server/services/providers/hizliTeknolojiProvider.ts:443,449` |
| HizliConnectService.getDocumentFile → HTTP `GetDocumentFile` | Yukarıdaki bütün içerik çağrıları | Parametre aynen URL'ye yazılır; `Tur=XML/PDF/HTML`, `IsDraft=false` | `server/services/hizliConnectService.ts:908-919` |
| `/api/efatura/hizli/document-file` → GetDocumentFile | Genel gelen/giden dosya indirme, belge türü/yön parametresi yok | İstemcinin sayısal `appType` değeri; yoksa **1** | `server/routes/efatura.ts:1678-1685`; `src/services/api.ts:1419-1420` |
| `/api/v1/e-documents/incoming/:id/visual` | Gelen fatura | **Gönderilmez**; yerel/arşiv XML okunur | `server/routes/v1/e-documents.ts:508-514` |
| `/api/v1/e-documents/incoming-despatches/:id/visual` | Gelen irsaliye | **Gönderilmez**; yerel/arşiv XML okunur | `server/routes/v1/e-documents.ts:867-873` |
| GetDocumentReceiverAllList → gelen satır normalizasyonu | Gelen faturalar/irsaliyeler | İstek AppType almaz. Yanıttaki AppType korunur; **3 → DESPATCH**, diğerleri INVOICE; eksikse **1** | `server/services/providers/hizliTeknolojiProvider.ts:94-95,124,397` |
| SendInvoiceModel | Giden e-Fatura / e-Arşiv | **1 / 2** | `server/services/hizliConnectService.ts:1839,1874` |
| GetDocumentListGUID, genel fatura durum sorgusu | Giden faturalar (profil ayrımı yapılmıyor) | **1** sabit | `server/services/providers/hizliTeknolojiProvider.ts:319`; `server/routes/hizli-bilisim.ts:1116-1118` |
| GetDocumentListGUID, Hızlı gönderim mutabakatı | Giden fatura | **1 ve 2** ayrı sorgular; UUID eşleşmesi aranır | `server/services/hizliInvoiceReconcile.ts:59-60` |
| GetDocumentList | Genel gelen/giden liste, yön/profil eşlemesi yok | Parametre; varsayılan **1** | `server/routes/efatura.ts:1657,1663-1664`; `server/services/hizliConnectService.ts:856,868` |
| CancelDocument | Giden e-Arşiv iptali | **3** | `server/services/providers/hizliTeknolojiProvider.ts:478-483` |
| SendDocument (sendDespatch) | Giden irsaliye | **Gönderilmez**; XML gövdesi | `server/services/providers/hizliTeknolojiProvider.ts:281-290` |

**Kesin kaynak sonucu:** Aynı HTTP uç + aynı yön + aynı belge türü için iki farklı sabit AppType atayan yürütülebilir bir yol **bulunmadı**. SendInvoiceModel e-Arşiv=2 ile GetDocumentFile e-Arşiv=3 ayrı uçlardır; buna tutarsızlık denemez. Gelen irsaliye=3 ile giden irsaliye=4 ayrı yönlerdir; bunu da aynı belge türünün çelişkili eşlemesi saymak için kanıt yok. Genel dosya ucu yön/profil üretmez; mevcut frontend'de bu API yardımcısının aktif çağıranı bulunmadı, buradaki 1 varsayılanı kendi başına giden belgeye 1 atandığının kanıtı değildir.

**Sınırlar / açık kanıt eksikleri:** GetDocumentFile gelen e-Fatura=1 ve giden e-Fatura=2 daha önce gerçek belgeyle ölçüldü (docs/79 §3.5). e-Arşiv=3, gelen irsaliye=3 ve giden irsaliye=4 bu adımda gerçek belgeyle doğrulanmadı. docs/48'deki sandbox GetDocumentListGUID ölçümü (3 e-Arşiv; 4/5 irsaliye) GetDocumentFile veya GetDocumentReceiverAllList için sözleşme kanıtı değildir. Durum sorgusundaki 1 sabitiyle 1/2 denemeleri farklı sorgu stratejileridir; e-Arşiv durumunun gerçekten kaçırıldığını gösteren belge/yanıt olmadığından varsayımsal düzeltme yapılmadı. Wrapper yorumundaki liste numaralandırması da gerçek uç sözleşmesini kanıtlamaz.

Adım 2 tamamlandı: tablo + satır referansları kaydedildi, kaynakta kesin AppType çelişkisi kanıtlanmadı. Uygulama kodu değişmedi.

## Codex kanıtı — Adım 3 (yeniden çalıştırma sonucu)

Yerel HEAD: `ab68c58cf7b45c9804728cdbba9294c7ab3fcd36`. GitHub'da yeniden çalıştırılan SHA özellikle **`3a3175eb7e8093c707e403e7fcb7c2b1fbdb7d9e`**; yeni yerel commit push edilmedi ve bu Actions işleri onu test etmiyor.

Önce `/commits/3a3175e/check-runs` okundu, eski başarısız sonuçlar `.verify-tmp/ci-before-rerun-2026-10-06.json` dosyasına kaydedildi. `37368069930` ve `37368069667` için `/actions/runs/{id}/rerun` çağrıları GitHub tarafından kabul edildi (attempt 2). İkisi de gerçek hosted runner aldı; önceki "job was not acquired" arızası bu denemede tekrarlanmadı.

Son check-run özeti (6 Ekim 2026, UTC zamanları):

```json
{
  "sha": "3a3175eb7e8093c707e403e7fcb7c2b1fbdb7d9e",
  "observedAt": "2026-10-06T08:48:00.900Z",
  "check_runs": [
    {
      "id": 112184733049,
      "name": "Build, Lint, Typecheck & Security Audit",
      "status": "completed",
      "conclusion": "failure",
      "started_at": "2026-10-06T08:44:01Z",
      "completed_at": "2026-10-06T08:44:49Z",
      "duration_seconds": 48
    },
    {
      "id": 112184739291,
      "name": "test",
      "status": "completed",
      "conclusion": "success",
      "started_at": "2026-10-06T08:44:00Z",
      "completed_at": "2026-10-06T08:46:45Z",
      "duration_seconds": 165
    }
  ]
}
```

- [Playwright Tests — attempt 2, SUCCESS](https://github.com/isbeycloud/isbey/actions/runs/37368069667/job/112184739291): kurulum, build, tarayıcı testleri ve artifact yükleme geçti.
- [CI Pipeline — attempt 2, FAILURE](https://github.com/isbeycloud/isbey/actions/runs/37368069930/job/112184733049): typecheck, lint ve build geçti. **Security Audit (npm audit) exit 1**; yerel regresyon adımı bu nedenle **skipped**. Bu işi altyapı arızası veya başarı olarak göstermiyorum.

**Ayrı gerçek failure raporu:** GitHub job logundaki `npm audit` çıktısı:

| Paket / raporlanan aralık | Seviye | Job logundaki açık |
|---|---|---|
| `proxy-addr`, `1.1.0 - 2.0.7` | **critical** | IPv4-mapped IPv6 trust subnet üzerinden IP spoofing — `GHSA-jqcg-44mw-7w3h` |
| `source-map-js`, `1.0.0 - 1.2.1` | **high** | Indexed source-map section offsets üzerinden event-loop DoS — `GHSA-68fv-2mgg-jv7q` |

Özet: **2 vulnerabilities (1 high, 1 critical)**. Tam log `.verify-tmp/ci-security-audit-2026-10-06.log`; check-run/job/annotation JSON `.verify-tmp/ci-rerun-result-2026-10-06.json`. Bunlar ignored yerel kanıt dosyalarıdır. Güvenlik kapısı azaltılmadı, paket/lockfile/Actions dosyaları değiştirilmedi.

**Adım 3 durumu:** Re-run ve sonuca kadar izleme tamamlandı; iki işin de başarı olması koşulu **karşılanmadı**. Runner sorunu bu denemede çözüldü; kalan engel gerçek dependency audit failure. Ortak dosya sahipliği ve bu adımın "gerçek failure çıkarsa ayrı rapor" talimatı nedeniyle bağımlılık düzeltmesi ayrı iş olarak Claude/kullanıcıya devrediliyor.

## Codex kanıtı — Adım 4 (atlanmış)

HEAD: `ab68c58cf7b45c9804728cdbba9294c7ab3fcd36`.

Adım 2'de aynı uç/yön/belge türü için kanıtlanmış AppType çelişkisi veya alıcı kapısı eksikliği bulunmadı. Gerçek e-Arşiv/giden irsaliye belgesiyle doğrulama eksikliği tek başına yeni eşleme veya gönderim kuralı uydurmanın gerekçesi değildir. Ayrıca Adım 3'ün iki işin de başarılı olması koşulu audit failure nedeniyle sağlanmadı. Bu nedenle yeni e-Arşiv/irsaliye alıcı düzeltmesi/testi açılmadı. Mevcut 38 yerel suite yeşil; irsaliye hizmeti açılmadı, canlı sağlayıcı çağrısı veya belge gönderimi yapılmadı.

**Claude'a son devir:** Codex birlikte çalışma düzenini sürdürüyor. Kod commit'i `ab68c58` yerelde hazır; push yok. `docs/79`, `docs/80`, bu dosya commit'siz korunuyor. Sıradaki somut işler: (1) CI'deki critical/high bağımlılık açıklarını ayrı kapsamda ele almak; (2) yukarıdaki sipariş→irsaliye servisinin eski DB referansıyla yazma bulgusunu DB/stok sahibiyle doğrulamak. AppType için ölçülmemiş değerlere varsayımsal düzeltme yapılmadı.

## Codex karşı doğrulaması — Claude d580569 (6 Ekim 2026)

**Ölçülen HEAD:** `d58056978177427bd5c6a2ebaeed0ae01f179786`. Claude'un değişiklikleri korunarak Windows ortamında eksik kalan tam doğrulama tamamlandı. Kod/paket/DB dosyalarında bu inceleme sırasında değişiklik yapılmadı; push yok.

| Kapı | Ölçülen sonuç | Yerel kanıt |
|---|---|---|
| `npm test` | **39 PASS / 0 FAIL**, exit 0; yeni kalıcılık testi 19/19 dahil | `.verify-tmp/claude-persistence-tests.log` |
| `tsc -p tsconfig.server.json --noEmit --strict` | **0 hata**, exit 0 | `.verify-tmp/claude-persistence-strict.log` |
| `npm run build` (tsc -b dahil) | **PASS**, exit 0 | `.verify-tmp/claude-persistence-build.log` |
| Değişen üç TS dosyasında Windows oxlint | **exit 0**, 2 unused import uyarısı | `.verify-tmp/claude-persistence-lint.log` |

**Ayrı cari uçtan uca kontrolü: FAIL, exit 1.** Mevcut kalıcılık testinin aynı izole fixture'ı koşturulduktan sonra doğrudan diskteki JSON okundu:

```json
{
  "invoiceCount": 2,
  "invoiceTotal": 36,
  "accountTransactionDebit": 36,
  "currentTransactionCount": 0,
  "persistedCustomerBalance": 0,
  "persistedCustomerDebit": 0
}
```

Yeni 19 kalıcılık kontrolü fatura ve `accountTransactions` kaydını doğruluyor; yetkili cari defter/bakiye tutarını doğrulamıyor. `createInvoiceCore` yalnız `accountTransactions`'a yazıyor ve customer alanlarını artırıyor; transaction commit'inde `storage.recalculateBalances` müşteri bakiyesini yalnız `currentTransactions`'tan yeniden türetiyor. Böylece bu fixture'da 36 TL açık satış faturası kaydedilirken cari bakiye 0 TL kalıyor. Claude'un raporunda ayrı eksik olarak belirtilen durum artık gerçek disk ölçümüyle doğrulandı. Kalıcılık düzeltmesinin başarılı olması, bu eksikliğin çözüldüğü anlamına gelmiyor. Muhasebe/cari kapsamını genişleterek düzeltme yapılmadı.

Kanıt: `.verify-tmp/claude-persistence-cari-proof.json`, `.verify-tmp/claude-persistence-cari-proof.log`; yeniden koşulabilir izole prob `.verify-tmp/claude-cari-proof.mjs`. Canlı veriye/entegratöre dokunulmadı.

**docs/82 kapsam düzeltmesi:** Kodda sarmalanan public metot sayısı **4** (`createInvoice`, `convertQuoteToOrder`, `convertOrderToWaybill`, `convertWaybillToInvoice`); rapordaki "5 metot" ifadesi uç sayısıyla karışmış. Normal ön yüz `src/services/api.ts:362,444` üzerinden `/api/invoices` ve `/api/waybills/:id/convert-to-invoice` çağırıyor. Bu legacy rotalar kendi `runTransaction` akışlarını kullanıyor (`server/routes/invoices.ts:107`, `server/routes/waybills.ts:75`); DocumentConversionService'in bu create/convert metotlarını çağırmıyor. invoices.ts servis import'unu cancelInvoice için kullanıyor (:567). Dolayısıyla docs/82'deki "ön yüzün bu iki yolu da etkilendi" iddiası kaynakla desteklenmiyor. Kanıtlanan kusurun v1 servis çağrılarıyla legacy ön yüz yolları ayrılmalı.

**Sonuç:** Tam test/strict/build/lint kapıları tamamlandı. Cari bakiye kontrolü ayrı FAIL; yayın için tüm QA PASS iddiası yok. Önceki CI dependency audit failure bu incelemede düzeltilmedi. Claude'un commit'i ve notları korundu; sonraki iş cari yetkili defter/bakiye tutarlılığı için ayrı, somut düzeltme kapsamıdır.

---

## Devam listesi

Bu liste "Görev Listesi #1"dir. Dört kapsamlı ikinci liste:
`docs/83_CODEX_GOREV_LISTESI_2_2026-10-06.md` (sunucu geneli bayat-referans
taraması → cari defter kararı → CI audit açıkları → push).
