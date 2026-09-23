# İŞBEY — Güvenlik Sertleştirmesi Raporu (2026-09-12)

**Kapsam:** Görev F — "Güvenlik" adımı (XFF bypass + uydurma webhook iletimi)
**Uygulayan:** Claude (Opus-5) · **Durum:** Statik doğrulama yapıldı; **runtime kanıtı YOK** (aşağıya bakınız)

> **Kanıt sözleşmesi:** Bu rapordaki hiçbir kalem "test edildi ve PASS" olarak
> işaretlenmemiştir. Tüm ifadeler "tip/kod düzeyinde doğrulandı, davranış kanıtı
> bekliyor" anlamına gelir. Koşu #4 çalıştırılmadan hiçbir kalem ✅ sayılmaz.

---

## 1. XFF bypass düzeltildi (bulgu: `docs/26` §4 / `docs/27` §5.4)

### Sorun
`server/middleware/productionSecurity.ts` içindeki `rateLimit()` bucket anahtarını
**koşulsuz olarak ham `X-Forwarded-For`** başlığından üretiyordu:

```ts
const fwd = (req.headers['x-forwarded-for'] as string) || '';
const ip = (fwd.split(',')[0] || req.ip || 'unknown').trim();
```

Projede `app.set('trust proxy', ...)` **hiçbir yerde yoktu** (doğrulandı: `server/index.ts`
yalnızca `securityHeaders` + `cors` + body parser montajı yapıyordu). Proxy katmanı yokken
XFF'e güvenmenin meşru gerekçesi yoktur. Sonuç: istemci her istekte rastgele bir
`X-Forwarded-For` göndererek **her istekte yeni bir kova** açtırıyor; `login` 20/15dk,
`mobile-login` 30/15dk ve `webhook` 60/1dk limitleri tamamen devre dışı kalıyordu —
FAZ 25.4 #3'ün brute-force koruması **etkisizdi**.

### Düzeltme (2 dosya)

**`server/middleware/productionSecurity.ts`** — elle başlık okuma kaldırıldı, IP tespiti
Express'e bırakıldı:

```ts
const ip = req.ip || 'unknown';
```

`req.ip`, `trust proxy` açıkken XFF'i (sağdan ilk güvenilmeyen adım) doğru çözer; kapalıyken
istemcinin taklit edemeyeceği gerçek socket adresini döner.

**`server/index.ts`** — eksik olan yapılandırma noktası eklendi (varsayılan **kapalı = güvenli**):

```ts
const trustProxyRaw = (process.env.TRUST_PROXY || '').trim();
if (trustProxyRaw) {
  if (trustProxyRaw === 'true') app.set('trust proxy', true);
  else if (/^\d+$/.test(trustProxyRaw)) app.set('trust proxy', Number.parseInt(trustProxyRaw, 10));
  else app.set('trust proxy', trustProxyRaw);
}
```

`TRUST_PROXY` tanımsızsa hiçbir şey yapılmaz → mevcut/güvenli davranış korunur.

**`.env.example`** — `TRUST_PROXY` anahtarı açıklamasıyla eklendi
(`loopback|1|true`; "yalnızca ters proxy arkasındaysa doldurun").

### Dikkat edilecek dağıtım notu
Ters proxy (nginx / Cloudflare / LB) arkasında `TRUST_PROXY` **ayarlanmalıdır**; aksi hâlde
tüm istekler proxy IP'sinde toplanıp aşırı limitlenir. Bu, güvenli yöndür (atlatılabilir
limitten yeğdir); ama prod dağıtımında yapılandırma kalemidir.

---

## 2. Uydurma webhook iletimi gerçek gönderime çevrildi

### Sorun
İki ayrı webhook yolu **hiç HTTP isteği yapmadan** "başarılı iletim" kaydediyordu. Bu,
CLAUDE.md md.1'in *"API response'u uydurmak / simüle etmek"* yasağına doğrudan giriyordu.

**(a) `server/services/ai/automationEngine.ts` → `dispatchWebhooks()`**
- `crypto.createHmac('sha256', ep.secret || 'isbey_secret')` — secret'i boş bir endpoint,
  **kaynak kodda yazılı, herkesin bildiği** bir anahtarla imzalanıyordu → alıcı imzayı
  doğrulasa bile bu bir güvenlik garantisi değildi.
- `responseStatus: 200`, `status: 'DELIVERED'`, `responseBody: 'OK (Mock Dispatch)'`,
  `lastDeliveryStatus: 'SUCCESS'` — hiç istek atılmadan yazılıyordu.

Bu yol **üretimde canlıdır**: `POST /api/v1/automations/test-trigger` →
`AutomationEngine.triggerEvent` → `TRIGGER_WEBHOOK` kuralı → `dispatchWebhooks`.

**(b) `server/services/faz9/webhookEngine.ts` → `dispatchEvent()`**
`// Simüle başarılı iletim` yorumuyla `httpStatus: 200` + `status: 'SUCCESS'` +
`deliveredAt` yazıyordu. Üretimde çağıranı **yoktur** (yalnızca testler), ama aynı uydurmayı
taşıyordu.

### Düzeltme

**(a)** `dispatchWebhooks()` artık **gerçek `fetch`** yapar:
- HMAC anahtarı **secret yoksa gönderim yapılmaz**; kayıt dürüstçe `FAILED` işaretlenir
  (uydurma secret kaldırıldı).
- `AbortController` ile **10 sn** zaman aşımı (`WEBHOOK_TIMEOUT_MS`).
- Gerçek `responseStatus` / kırpılmış (500 karakter) `responseBody` kaydedilir; `resp.ok`
  ise `DELIVERED`, değilse/ağ hatasında `FAILED`.
- `X-ISBEY-Event` + `X-ISBEY-Signature: sha256=<hmac>` başlıkları gönderilir.
- **Otomatik retry YOKTUR** — otomasyon webhook'u yan etkili olabilir; sessiz retry
  mükerrer tetikleme üretir. Aynı endpoint'e eşzamanlı gönderim `inFlightWebhooks`
  defteriyle atlanır.

**(b)** `dispatchEvent()` gerçek gönderim yapmadığı için artık **teslim edilmiş gibi
işaretlemez**: `status: 'RETRYING'`, `httpStatus` yok, `retryAttempt: 0`. Abonelik kaydı
yalnızca `secretHash` sakladığı için HMAC üretilemez; gerçek gönderim için düz metin secret
saklanması gerekir — bu **ayrı bir tasarım kararı** olarak not edildi (şema değişikliği
yapılmadı).

**İlgili test iddiası düzeltildi** — `server/tests/fullScopeVerificationTest.ts` (`DEV-API-001`):
iddia `delivery?.status === 'SUCCESS'` idi; artık teslim kaydının **oluştuğunu** ölçer
(`!!delivery`). Gerçek gönderim `webhook.site/test-receiver` adresine gittiği için test
ortamında iletim `FAILED` olabilir; bu **dürüst** sonuçtur. (Bu test doğrulama paketinin
parçası değildir; yine de uydurmayı doğrulayan bir iddia olduğu için düzeltildi.)

---

## 3. Statik doğrulama (bu oturumda yapılanlar)

| Kontrol | Sonuç |
|---------|-------|
| `server/` içinde ham `x-forwarded-for` okuması kaldı mı? | **Yalnız yorum satırı** — kod yolu yok (grep) |
| `trust proxy` çağrısı var mı? | `server/index.ts` — `TRUST_PROXY` env'e bağlı, varsayılan kapalı |
| `'isbey_secret'` fallback'i kaldı mı? | Kaldırıldı (grep: eşleşme yok) |
| `Mock Dispatch` / sahte 200 kaldı mı? | Kaldırıldı; `automationEngine` gerçek `fetch` yapar |
| `webhookEndpoints` gerçek DB'de boş mu? | Evet — eski/boş-secret kayıt yok (`data/database.json`) |
| `npx tsc -b` / runtime suite | **KOŞULAMADI** — VM engeli (aşağıda) |

---

## 4. Runtime kanıtı YOK — açıkça raporlanmıştır

**Bugünkü oturumda `mcp__workspace__bash` Plan9 mount hatasıyla açılamadı**
("source path … is under Plan9 share \"c\" which is not mounted") ve harness yeniden
denemenin yardımcı olmayacağını belirtti. Bu nedenle:

- `npx tsc -b`, sunucu başlatma, doğrulama paketi **çalıştırılamadı**.
- Yukarıdaki kalemler **yalnızca tip/kod düzeyinde** doğrulanmıştır.
- XFF düzeltmesinin davranış kanıtı (rastgele XFF ile 21. istekte **429** alınması)
  koşu #4'te üretilmelidir. Bu kanıt oluşmadan **FAZ 25.4 ✅ sayılmaz.**

---

## 5. Ayrı bulgu — kapsam dışı, DEĞİŞTİRİLMEDİ

**`POST /api/v1/payments/webhook`** (`server/routes/v1/payments.ts`) her ödemeyi
`paymentProvider: 'MOCK'` ile kaydeder ve `CommissionEngine.processPaymentCommission`
çağırır. İmza `PAYMENT_WEBHOOK_SECRET` ile doğrulanır (fail-closed, doğru), ancak üretilen
`Payment` kaydı **her zaman** MOCK sağlayıcıya yazılır. Aynı şekilde `/api/v1/credits`,
`/api/v1/pos`, `/api/v1/ai`, `/api/v1/marketplace` uçları `Mock*` sağlayıcı kullanır.

Bu **ödeme/faturalama mantığı**dır ve görev kapsamı (uydurma *bayi/müşteri* verisi) ile
CLAUDE.md'nin dokunulmazlık sınırı dışında kalır. Mock'lar açıkça etiketli olduğu için
"uydurma başarı" ile aynı sınıfa girmez, ancak **gerçek ödeme sağlayıcısı bağlanana kadar
bu uçların üretimde kullanılmaması** gerekir. Karar sizde.

---

## 6. `server/` tip kontrolü artık koşulabiliyor (yeni `tsconfig.server.json`)

**Boşluk:** `npm run build` = `tsc -b`; kök `tsconfig.json` yalnızca `tsconfig.app.json`
(`include: ["src"]`) ve `tsconfig.node.json` (`include: ["vite.config.ts"]`) referanslarını
taşır. Yani **`server/` hiç tip kontrolünden geçmiyordu** — `tsx` tipleri silerek çalıştırır.
Önceki raporlardaki "`npx tsc -b` → 0 hata" ifadesi bu yüzden **sunucu koduna dair kanıt
sayılamaz.**

**Çözüm:** `tsconfig.server.json` eklendi (`include: ["server"]`, `exclude: ["server/tests"]`,
`moduleResolution: bundler`, `strict: false`, `noEmit: true`). Kök `tsconfig.json`'ın
`references` listesine **BİLİNÇLİ OLARAK EKLENMEDİ** — eklenirse 141 hata `npm run build`'i
kırar. Bu, ayrı koşulan bir doğrulama adımıdır:

```
npx tsc -p tsconfig.server.json --noEmit
```

**İlk tarama sonucu:** 167 hata. Kök nedenlerden biri düzeltildi — `schema.ts` içinde
`PaymentStatus` **iki kez** tanımlıydı (fatura durumu `UNPAID/PARTIAL/PAID` ile SaaS ödeme
durumu `successful/failed/…`). İkincisi `SaasPaymentStatus` olarak ayrıldı; çakışma kalktı
(167 → 141). Kalan 141 hata **gerçek tip uyumsuzluğu**dur ve tam liste
`.verify-tmp/server-tsc-raporu-v2.txt` dosyasındadır — çoğu şema alanı eksikliği
(`companyName`, `tenantId`, `dueDate`, `stock` vb.) ve `req.params` tip genişliği
(`string | string[]`) kaynaklıdır.

> Bu 141 hata **davranışsal kanıt değildir**: `tsx` ile çalışan sistem bu alanları çoğu
> yerde `any` üzerinden okuyor olabilir. Ancak şema ile kod arasındaki gerçek uyumsuzluğu
> gösterdiği için koşu #5 öncesi gözden geçirilmelidir.

**Not:** `tsconfig.server.json` bu oturumda **başka bir ajan tarafından** oluşturulmuş ve
Claude tarafından statik olarak doğrulanmıştır; `npx tsc -p tsconfig.server.json` çıktısı
bu oturumda **koşulamamıştır** (VM engeli) — hata sayıları aktarılan rapordandır.

---

## 7. Fatura (XML/HTML) alıcı kimliği uydurması kaldırıldı

`server/routes/efatura.ts` — XML ve HTML rotalarının **her ikisi de** alıcı kimliğini
uyduruyordu (satıcı tarafı önceki oturumda düzeltilmişti):

- XML: alıcı kaydı bulunamazsa `taxNumber` = `invoice.customerCode` (cari KODU, VKN değil)
  ve şablon satırında `${customer.taxNumber || '11111111111'}` → **11 haneli uydurma TCKN**;
  ayrıca `CityName: 'Adana'`, `CitySubdivisionName: 'Merkez'`, `TaxScheme: 'Vergi Dairesi'`
  sabitleri.
- HTML: aynı şekilde `VKN/TCKN: ${customer.taxNumber || invoice.customerCode || '—'}` ile
  cari kodu VKN gibi gösteriyordu.

**Düzeltme:** her iki rota da `customers` içinde kimliği (önce `customerId`, yoksa VKN/kod
eşleşmesi ile) arar; **bulunamazsa XML üretilmez** (422, açık hata). Sabit şehir/vergi
dairesi değerleri `''` oldu; cari kodu artık VKN alanında gösterilmiyor. `Customer`
tipinde olmayan `customer.name` erişimleri kaldırıldı.

---

## 8. `GET /api/efatura/taxpayer-check/:vkn` — "canlı sorgulama" uydurması

**Sorun:** Uç "Canlı GİB / Hızlı Bilişim Mükellef Sorgulama" olarak sunuluyordu ama gerçek
sorgu **hiç yapılmıyordu**:

- `HizliConnectService.checkGibUser` düz bir nesne döner (`success`, `title`, `aliasPk`,
  `aliasGb`, `firstCreationTime`); kod ise `checkRes.data` okuyordu — **böyle bir alan yok**,
  yani online dal hiç dolmuyordu.
- Bunun sonucu olarak `isEInvoiceUser`, **VKN'nin son hanesinden** türetiliyordu
  (`endsWith('0'|'2'|'8')` → mükellef). Yanlış "mükellef" kararı yanlış belge tipine
  (e-Fatura vs e-Arşiv) yol açar.
- `isEArchiveUser: true` **sabit**ti; `firstRegistrationDate: '2023-01-15T09:00:00Z'` ve GİB
  alias'ları (`urn:mail:defaultgb@<vkn>.com.tr`) **uyduruluyordu**.

**Düzeltme:** önce gerçek API'ye sorulur (`GIB_ONLINE`); ulaşılamazsa yerel **gerçek** cari
kaydı kullanılır (`YEREL_KAYIT`), ki bu durumda mükellefiyet alanları `null` = 
"doğrulanamadı" olur. İkisi de yoksa uydurma yerine `success: false` + açıklama döner.
Yanıt artık `source` alanı taşır. Yan etki: `tenantId` filtresi **yoktur** (mevcut durum
korundu, ayrı bulgu).

**Frontend (`NewInvoiceModal.tsx`, `api.ts`):** `isEInvoiceUser` artık üç değerli
(`true` / `false` / `null`). `null` durumu "e-Arşiv" diye gösterilmiyor — ayrı rozet ve
"mükellefiyet doğrulanamadı" bildirimi ile ayrılır. `checkTaxpayer` dönüş tipi ve bileşen
state tipi buna göre güncellendi.

---

## 9. Koşu #5 için eklenen kanıt kalemi — `RATE-003` (XFF bypass)

**Bulgu:** Mevcut `RATE-001` kalemi 21 login isteğini **X-Forwarded-For başlığı
göndermeden** yapar. Bu, limiter'ın *çalıştığını* gösterir ama **bypass'ın kapandığını
GÖSTERMEZ** — düzeltmeden önce de bu kalem PASS ederdi (ham XFF okunsa bile başlık yoksa
`req.ip`'ye düşülür). Yani koşu #5 tek başına XFF düzeltmesini kanıtlamazdı.

**Eklenen kalem (`tools/dogrulama.ps1`, sunucu #1 bölümü):** 40 istek, her birinde
**farklı uydurma `X-Forwarded-For`** (`203.0.113.<i>`) **ve farklı `X-Real-IP`**
(`198.51.100.<i>`) gönderilir.

Ayrım gücü şuradan gelir:

- **Düzeltme çalışıyorsa:** kova anahtarı `req.ip` (127.0.0.1). Hemen önceki `RATE-001`
  aynı kovayı doldurduğu için bu dizi **anında** 429 alır (ilk 429 ≈ 1).
- **Düzeltme çalışmıyorsa (ham XFF'e güven):** her uydurma XFF yeni bir kova açar; dolu
  kova hiç görülmez → 40 istek boyunca **hiç 429 alınmaz**.

`LOGIN_RATE_LIMIT_MAX` .env'de tanımlıysa (varsayılan dışı) kalem **SKIP** verir, çünkü
varsayılan bütçe kanıtı o sunucuda üretilemez.

> Bu kalem **henüz koşulmamıştır** — davranış kanıtı koşu #5 çıktısıyla gelecektir. Kalemin
> kendisi de statik doğrulanmıştır; runtime'da PASS/FAIL sonucu bu oturumda görülmemiştir.

---

## 10. Sıradaki adım

1. XFF davranış kanıtı: rastgele `X-Forwarded-For` ile login denemeleri →
   21. istekte **429** (aynı kova).
2. `automationEngine` gerçek gönderim yolu için erişilebilir bir test alıcısıyla (veya
   kapalı port ile `FAILED` kaydı) davranış kanıtı.
3. `npx tsc -p tsconfig.server.json --noEmit` çıktısı (141 hata) gözden geçirilsin;
   öncelik `PaymentStatus`/şema alanı eksikliklerinde.
4. §7–§8 için davranış testi: alıcı kaydı olmayan bir faturada XML/HTML rotası 422
   dönmeli; `taxpayer-check` GİB bağlantısı yokken `source: null` + `success: false`.
5. Karar bekleyenler: §5 (ödeme uçları), `loadDatabase()` users seed koruması,
   `vat-report` 500 (`docs/27` §3), `taxpayer-check`'te eksik `tenantId` filtresi.

---

## 11. `/api/hizli-bayi` — kimlik bilgisi sızıntısı ve denetim izi düzeltmeleri (2026-09-12, ek oturum)

Bu bölüm, "Güvenlik" ve "Hızlı Bilişim bayi yönetimi" adımlarının gözden geçirmesinde
bulunan **dört ayrı kusuru** kaydeder. Hepsi `server/routes/hizli-bayi.ts` içindedir.

### 11.1 KRİTİK — WS şifresi düz metin olarak frontend'e gidiyordu

`hizli-bayi.ts` içindeki üç okuma ucu `dealerCustomers` kayıtlarını **ham** döndürüyordu.
Bu kayıtlar `portalCredentials` altında Hızlı Bilişim web servis kullanıcı adı ve
**düz metin şifresini** taşır (`/admin/hizli-bilisim/dealers` POST/PUT orada bilinçli
saklar — token yenilemede sunucu tarafında tekrar Login için gerekir).

Dolayısıyla modül erişimi olan her kullanıcıya **tüm firmaların WS şifresi** düz metin
gidiyordu. Bu, kullanıcının açık gereksiniminin ihlaliydi: *"credential'lar / SecretKey
frontend'e ulaşmamalı."*

**Düzeltme:** `sanitizeDealerCustomer()` yardımcısı eklendi. `portalCredentials` nesnesi
dışa dönük görünümden **tamamen çıkarılır**; yerine yalnızca panelin gerçekten ihtiyaç
duyduğu `wsUsername` ve `hasWsPassword` (boolean) alanları konur — şifrenin kendisi
hiçbir koşulda geri gönderilmez (`apiKey`/`secretKey` de aynı gerekçeyle dışarıda).
Uygulandığı yerler: `GET /customers`, `POST /customers` (yanıt), `POST /credits/add`
(yanıt). `GET /dealers` (`hizli-bilisim.ts`) zaten maskeliydi; o yol korundu.

### 11.2 YÜKSEK — `PUT /customers/:id` mass-assignment ve fail-open tenant kontrolü

Önceden gövde doğrudan yazılıyordu: `Object.assign(cust, updates, ...)`. Sonuçları:

- `id` / `tenantId` değiştirilerek kayıt **başka bir kiracıya taşınabiliyordu**.
- `credits` doğrudan set edilerek kontör bakiyesi **denetim kaydı üretmeden** uydurulabiliyordu.
- `portalCredentials` ile **başka bir firmanın WS kimlik bilgileri** değiştirilebiliyordu.
- Ayrıca `if (cust.tenantId && cust.tenantId !== tenantId)` koşulu **fail-open**'dı:
  `tenantId` taşımayan eski kayıtlar herkese açıktı ve kayıt bulunamazsa uç sessizce
  `200` dönüyordu.

**Düzeltme:** (1) yalnızca açık bir **alan allowlist'i** yazılır (kimlik, tenant,
kontör ve kimlik bilgisi alanları listede yoktur); (2) tenant kontrolü **fail-closed**
(`cust.tenantId !== tenantId` → reddet); (3) kayıt yok → `404`, yetkisiz → `403`
(sessiz başarı kaldırıldı).

### 11.3 ORTA — `GET /credits` kiracı filtresi taşımıyordu

Kontör hareketleri **tüm kiracılar** için döndürülüyordu (firma ünvanı + kontör miktarı
dâhil). `CreditTransaction` kaydında `tenantId` alanı yoktur; bu yüzden hareketin
bağlı olduğu müşteri (`customerId`) üzerinden bu kiracıya ait olanlar süzülür.
Bağı kurulamayan hareket gösterilmez.

### 11.4 ORTA — denetim izi uydurmaydı (`performedBy: 'Bayi Yöneticisi'`)

Kontör yükleme, kontör transferi ve belge aktarımı kayıtlarının **tamamı** sabit
`performedBy: 'Bayi Yöneticisi'` + `performedByRole: 'BAYI_ADMIN'` yazıyordu. Hangi
kullanıcı işlemi yaptıysa kayda aynı uydurma isim düşüyordu; ayrıca sistemde
karşılığı olmayan bir rolü ima ediyordu. Denetim izi (audit trail) bu hâliyle işe
yaramazdı.

**Düzeltme:** `requireAuth`'un çözdüğü oturum sahibi (`req.user.username`,
`req.userRole`) yazılır. Kimlik yoksa `'bilinmeyen-kullanici'` (sessizce uydurulmaz).

> Not: `hizli-bilisim.ts` içindeki `dealers/test-connection`, `dealers/:id/refresh-token`,
> `dealers` POST/PUT ve `dealers/logs` uçları **zaten** `req.user?.username` +
> `storage.addSyncLog` ile İŞBEY kullanıcısına dayalı log üretmektedir — istenen
> "İŞBEY kullanıcısına dayalı işlem kaydı" bu yolda mevcuttu; eksik olan `hizli-bayi.ts`
> tarafıydı ve yukarıda kapatıldı.

### 11.5 Doğrulanan (değişiklik gerektirmeyen) kalemler

| Kalem | Durum |
|-------|-------|
| Firma bazlı WS kimliği + JWT | `hizliTenantCredentialRegistry.ts` — `resolveTenantWsCredentials` fail-closed; UtilEncrypt yalnız kimlik değişince |
| 24 saat TTL + proaktif yenileme | `TOKEN_REFRESH_BUFFER_MS = 4 saat` |
| `401`'de kontrollü yeniden kimlik doğrulama | `hizliTeknolojiProvider.ts` → `invalidateStaleTokenIfUnauthorized` → `invalidateTenantToken` (yalnız token cache'i; credential cache'i korunur) |
| Credential'ın frontend'e sızmaması | `HizliBayiYonetimeView` şifreyi yalnız form state'inde tutar, gönderimden sonra temizler, geri gösterilmez (§11.1 ile birlikte artık backend'den de gelmiyor) |
| Gerçek API çağrısı (uydurma yok) | `authenticateWithCredentials` → gerçek `UtilEncrypt` + `Login` POST |
| `EDonusumView` / `EDonusumMerkeziView` ayrımı | İki ayrı menü öğesi, iki ayrı `case`, iki ayrı bileşen — mükerrer kayıt yok |
| `documentPrefixConfigs` | Belge üretiminde **kullanılmıyor** (numaralandırma `sequences` koleksiyonundan). İsteğe uygun olarak akışa bağlanmadı |

### 11.6 Runtime kanıtı yine YOK

Bu oturumda `mcp__workspace__bash` **15. kez** Plan9 mount hatasıyla açılamadı
(`... is under Plan9 share "c" which is not mounted`); harness yeniden denemenin
yardımcı olmayacağını bildirdi. Bu nedenle `npx tsc -b`, `npx tsc -p tsconfig.server.json`
ve doğrulama paketi **koşulamadı**. §11.1–§11.4 **yalnızca kod düzeyinde** doğrulanmıştır;
davranış kanıtı **koşu #5**'te üretilmelidir.
