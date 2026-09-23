# İŞBEY — Hızlı Bilişim Token Geçişi Uyum Denetimi

**Tarih:** 2026-09-14 · **Tetikleyen:** Hızlı Bilişim Yazılım Ekibi bayilik duyurusu (token geçişi)
**Yöntem:** Statik kod denetimi (dosya araçları). **KOŞU YAPILMADI** — bu oturumda Linux kabuğu açılamadı (`SDK version 2.1.260 not verified`), derleme/test/sunucu çalıştırılamaz.

> **Kanıt sözleşmesi:** Aşağıdaki her ifade "kod düzeyinde doğrulandı" demektir. Hiçbir kalem davranış kanıtıyla PASS ilan edilmemiştir.

---

## 0. ÖNCE TARİH: duyurudaki son tarih GEÇMİŞTE

Duyuruda geçiş tarihi **03.07.2026 saat 22:00** olarak verilmiş. Bugün **14.09.2026**. Yani
duyurudaki kesim tarihi **yaklaşık 2,5 ay önce geçti.**

Bunun iki anlamı var ve ayırt edilmeleri kritik:

1. Bu duyuru size **geç ulaşmış** olabilir (bayi bilgilendirme zinciri gecikmiş), veya
2. Kesim fiilen uygulanmıştır ve **kullanıcı adı/şifre ile doğrudan API erişimi artık çalışmıyor**
   olabilir.

İkinci durum doğruysa, eski yöntemle konuşan herhangi bir entegrasyon **çalışmıyor** demektir.
Bu ayrım, aşağıdaki FAZ 18 bulgusunun yorumunu doğrudan değiştirir (bkz. §3).

**Doğrulama adımı:** Hızlı Bilişim Portal > Müşteri İşlemleri > Toplu İşlem Seçiniz raporunu alıp
İŞBEY'in bağlı olduğu firmaların listede olup olmadığına bakın. Ayrıca satıcıya "03.07.2026
kesimi bizim hesabımız için fiilen uygulandı mı?" diye sorun — bu, §3'teki teşhisi kesinleştirir.

---

## 1. Bulgu: kod, duyurunun istediği token akışına ZATEN UYGUN

Duyurunun istediği üç adım ile İŞBEY'deki karşılığı:

| # | Duyurunun istediği | İŞBEY'de karşılığı | Durum |
|---|--------------------|--------------------|-------|
| 1 | `UtilEncrypt` ile username/password **şifrele** | `HizliConnectService.utilEncrypt()` → `RestApi/UtilEncrypt` | ✅ mevcut |
| 2 | Şifreli username/password + `apiKey` ile `Login` → **token al** | `HizliConnectService.login()` → `RestApi/Login` | ✅ mevcut |
| 3 | Sonraki isteklerde **yalnızca token**: `Authorization: Bearer ...` | `hizliConnectService.ts` içinde **46** `Authorization`/`Bearer` kullanımı; tüm belge/sorgu metodları token parametresi alıyor | ✅ mevcut |

**Kritik doğrulama:** Düz metin `username`/`password` API'ye **yalnızca `UtilEncrypt` çağrısında**
gönderilir. Başka hiçbir uçta düz metin kimlik gönderilmiyor (grep ile doğrulandı):

- `hizliConnectService.ts:106` → Login'e `hashedUsername`/`hashedPassword` gider (düz metin değil)
- `hizliBilisimClient.ts:128, 204` → Login'e `encData.username`/`encData.password` gider (UtilEncrypt çıktısı)
- Belge gönderim metodlarının tamamı (`sendDocument`, `sendInvoiceModel`, `getDocumentListByGUID`, …)
  imza olarak `token: string` alır ve `Bearer` başlığı kullanır.

**Sonuç:** Token geçişi açısından İŞBEY'de **yapısal bir iş kalmamıştır.** Duyurunun istediği
mimari (UtilEncrypt → Login → Bearer) zaten uygulanmış durumda; üstelik satıcının 2026-09-09
Q&A'sıyla (docs/21) uyumlu olarak firma bazlı token'a kadar ilerletilmiş (`hizliTenantCredentialRegistry.ts`).

---

## 2. Bulgu: duyurunun GÜVENLİK NOTU ile İŞBEY arasında gerçek bir açık var

Duyurunun güvenlik notu birebir şöyle:

> *"Aşağıdaki istekte kullanılan secretKey, username ve password bilgileri **localde, uygulama
> dosyalarında, istemci tarafında veya log kayıtlarında saklanmamalıdır.**"*

Bu not, tek seferlik örnek için yazılmış olsa da ilkesi açık: **bu üç değer kalıcı olarak
saklanmamalı.** İŞBEY'de durum:

### 2.1 🔴 `secretKey` kaynakta değil ama `.env`'de kalıcı (kabul edilebilir sınırda)

`HIZLI_BILISIM_SECRET_KEY` yalnızca `.env`'den okunur; kaynak koda gömülü değil (grep: kodda
0 sabit secretKey). `.env` `.gitignore`'da (satır 20). Bu, duyurunun "uygulama dosyalarında
saklanmamalı" maddesine **kısmen** uyar — secretKey kalıcı saklanıyor, ama uygulama kodunda değil,
yapılandırmada. Kabul edilebilir bir yorumdur.

### 2.2 🔴 YÜKSEK — "şifreli" alanlar aslında YALNIZCA base64

`TenantEinvoiceSettings` şemasında `encryptedPassword`, `apiKeyEncrypted`, `apiSecretEncrypted`
alanları var. İsimleri "encrypted" ama uygulama **şifreleme değil, base64 kodlama** yapıyor:

```ts
// server/routes/v1/e-invoice-settings.ts:167, 170, 173
settings.encryptedPassword  = Buffer.from(password).toString('base64');
settings.apiKeyEncrypted    = Buffer.from(apiKey).toString('base64');
settings.apiSecretEncrypted = Buffer.from(apiSecret).toString('base64');
```

Çözümleme de simetrik olarak base64 (`hizliTenantCredentialRegistry.ts:80-87` `decodeB64`).

**Sorun:** base64 **geri döndürülebilir bir kodlamadır, şifreleme değildir.** `data/database.json`
ele geçirilirse (yedek dosyası, yanlış yapılandırılmış erişim, dizin listeleme) firma WS
şifreleri tek satır `Buffer.from(x,'base64').toString()` ile düz metne döner. Duyurunun
"şifre istemci tarafında/loglarda saklanmamalı" ilkesi, en azından *at-rest* koruma bekler.

**Aynı sorun `portalCredentials.wsPassword` için de geçerli ve daha ağır:** bu alan
`server/routes/hizli-bilisim.ts:1260, 1345` içinde **düz metin** olarak yazılıyor
(satır 1260'ın yorumu bunu "Backend'de güvenle saklanır" diye gerekçelendiriyor — bu gerekçe
yanlıştır). Düz metin şifre diskte duruyor.

**Öneri (karar sizde):** `JWT_SECRET`'ten türetilmiş bir anahtarla
AES-256-GCM gerçek şifreleme (`crypto.createCipheriv`), alan adlarının da `encryptedX` yerine
`xCiphertext` olarak düzeltilmesi, ve mevcut base64 kayıtlar için tek seferlik geçiş migrasyonu.
Bu bir **şema/davranış değişikliğidir** — CLAUDE.md gereği ayrı onay fazı ister.

> **GÜNCELLEME (2026-09-14, kullanıcı onayı sonrası):** AES-256-GCM şifreleme, geçiş migrasyonu
> ve `.env.example` belgelemesi **UYGULANMIŞTIR** — ayrıntı ve doğrulama gereksinimleri §5–§6'da.
> Alan adları bilinçli olarak `encryptedX` bırakıldı (yeniden adlandırma şema değişikliği olurdu);
> okuma tarafı hem yeni hem eski biçimi çözer.

### 2.3 🟠 ORTA — Login gövdesinde alan adı büyük/küçük harf TUTARSIZ

Duyuru ve örnek istek `apiKey` (küçük a) kullanıyor. İŞBEY'de iki farklı yazım var:

| Dosya | Satır | Gönderilen alan |
|-------|-------|-----------------|
| `server/services/hizliConnectService.ts` | 106 | `ApiKey` (büyük A) |
| `server/services/hizliBilisim/hizliBilisimClient.ts` | 126, 202 | `apiKey` (küçük a) |
| `server/tests/phase18HizliBilisimIntegrationTest.ts` | 335 | `apiKey` (küçük a) |

**Bu bir tutarsızlıktır ve biri yanlış olabilir.** `hizliConnectService.login()` firma bazlı token
yolunun (`hizliTenantCredentialRegistry` → `ensureTenantToken`) tek çağrı noktasıdır; eğer API
büyük/küçük harfe duyarlıysa, firma bazlı token alımı sessizce başarısız oluyor olabilir.
JSON anahtarları çoğu API'de duyarlıdır; bu **koşu ile doğrulanmalıdır.**

**Doğrulama:** koşu #6'da `FAZ 18` çıktısında Login adımının `apiKey` (küçük a) ile geçtiği
görülüyor — bu, duyurudaki yazımın doğru olduğuna işaret eder ve `hizliConnectService.ts:106`'nın
düzeltilmesi gerekir. Ancak FAZ 18 hiç Login adımına ulaşamadı (§3), yani bu **kanıtlanmadı**.

> **GÜNCELLEME (2026-09-14):** `hizliConnectService.ts` `apiKey` (küçük a) olarak **değiştirildi**
> — bkz. §5.4. ⚠️ Bu değişiklik hâlâ **hiçbir canlı çağrıyla doğrulanmadı**; FAZ 18 §3 engeli
> nedeniyle Login adımına ulaşamıyor. Doğrulama koşu #6'ya bağlıdır (§6.5).

---

## 3. FAZ 18 `secretKey` hatasının gerçek nedeni (yüksek olasılık)

**Gözlem (koşu #5, 2026-09-13):** `UtilEncrypt` sandbox'ta şunu döndürdü:

```json
{"username":null,"password":null,"IsSucceeded":false,"Message":"Hatalı secretKey!"}
```

**Teşhis:** Bu bir kod hatası **değildir.** Sunucu erişilebilir (HTTP 404, 227 ms), secretKey
taşınmış, sunucu "secretKey yanlış" diyor. Yani `.env`'deki üçlü **birbiriyle eşleşmiyor**:

| `.env` anahtarı | Değerin kaynağı | Sorun |
|-----------------|-----------------|-------|
| `HIZLI_BILISIM_SECRET_KEY` | İŞBEY'in kendi firması için alınmış | **Sandbox (test) ortamı için geçerli değil** |
| `HIZLI_BILISIM_WS_USERNAME` / `_PASSWORD` | İŞBEY'in kendi WS kimliği | Aynı |
| `HIZLI_BILISIM_API_KEY` | ERP seviyesi | Aynı |

Yani: `.env`de **canlı/firma** kimliği var, ama `HIZLI_BILISIM_API_URL` **test** ortamına
(`econnecttest`) işaret ediyor. Test ortamı bu secretKey'i tanımıyor.

**Duyurunun ilgili kısmı bu teşhisi destekliyor:** duyurudaki örnek istek, test ortamına ait
çalışan bir UtilEncrypt çağrısı gösteriyor — kullanıcı adı `hizlitest`, ve ona ait secretKey ile
apiKey değerleri metinde açıkça verilmiş. Bunlar **örnek/demo kimlik** görünümündedir ve
İŞBEY'in `.env`'indeki firmaya ait değerlerle **aynı olması beklenmez**.

> ⚠️ **Bu değerleri repoya YAZMADIM ve yazmayacağım.** docs/21 §5 ve CLAUDE.md md.1 gereği
> kimlik bilgileri yalnızca `.env`'e girer. Duyurudaki değerler bu belgede bilinçli olarak
> tekrarlanmamıştır (sohbette ayrıca belirtilmiştir).

### Çözüm yolu (öncelik sırasına göre)

**A. Duyurudaki örnek sandbox kimliğini deneyin (en hızlı, dışsal bağımlılık yok).**
Duyuruda verilen `secretKey` + `username` (`hizlitest`) + `password` + `apiKey` değerlerini
`.env`'e yazıp FAZ 18'i yeniden koşturun. UtilEncrypt `username`/`password` dönerse teşhis
doğrulanmış olur ve sandbox kanıtı üretilir.
**UYARI:** bunlar paylaşılmış (çok alıcıya gitmiş) değerlerdir; **yalnızca sandbox** için
kullanın, canlıya asla taşımayın, commit etmeyin.

**B. Satıcıdan teyit alın.** "Duyurudaki örnek secretKey/apiKey/username/password hâlâ geçerli
sandbox hesabı mı, yoksa İŞBEY'e özel test kimliği mi tahsis edilir?" — bu, kalıcı ve doğru yol.

**C. Test ortamı için ayrı credential gerekiyorsa** `.env.example`'a
`HIZLI_BILISIM_TEST_WS_USERNAME` gibi ayrı anahtarlar eklenmesi düşünülebilir. Şu an tek set
anahtar hem test hem canlı için kullanılıyor; bu tasarım karışıklığın kökü (bkz. §4).

### Yan etki
Bu kalem kapanmadan:
- `FAZ 18` WARN'da kalır,
- `KAPI` (canlı e-belge akışı) **BLOCKED** kalır — doğru davranış, kapı açılmamalı,
- FAZ 30/31 (RC/canlı) kapıları kapalı kalır.

---

## 4. Kök neden: test/canlı credential ayrımı yok

`.env` şemasında Hızlı Bilişim için **tek bir credential seti** var; test mi canlı mı olduğunu
yalnızca `HIZLI_BILISIM_API_URL` ve `HIZLI_BILISIM_IS_TEST_MODE` belirliyor. Yani test moduna
geçmek URL'i değiştiriyor ama **kimliği değiştirmiyor.** Test ortamı ayrı bir secretKey
istiyorsa (ki istiyor — §3), bu şema bunu ifade edemiyor.

`hizliTenantCredentialRegistry.ts` cache anahtarını `tenantId:test` / `tenantId:prod` olarak
ayırıyor — yani **kod tarafı bu ayrımı zaten destekliyor**, eksik olan yalnız `.env` tarafı.

---

## 5. Uygulanan kod değişiklikleri (kullanıcı onayı: "devam et kodlara müdahale edebilirsin")

> **Kanıt durumu:** Aşağıdaki değişiklikler **yalnızca statik olarak yazılmıştır.** Bu oturumda da
> Linux kabuğu açılamadı (`SDK version 2.1.260 not verified`), dolayısıyla **derleme yapılmadı,
> test koşturulmadı, sunucu başlatılmadı.** Hiçbir kalem PASS ilan edilmemiştir. Doğrulama
> gereksinimleri §6'dadır.

### 5.1 YENİ — `server/security/credentialVault.ts` (AES-256-GCM kasa)

§2.2'nin çözümü. base64 yerine gerçek kimlik doğrulamalı şifreleme.

| Özellik | Uygulama |
|---------|----------|
| Algoritma | `aes-256-gcm` (CBC değil — GCM kurcalamayı da yakalar) |
| Biçim | `enc:v1:<iv b64>:<tag b64>:<ciphertext b64>` — takma-çıkarma etiketli |
| Anahtar | `CREDENTIAL_ENCRYPTION_KEY` (32 B, base64/hex) → yoksa `JWT_SECRET`'ten HKDF-SHA256 |
| Bozuk anahtar | 32 bayta çözülemezse **AÇIK HATA** — sessizce `JWT_SECRET`'e düşmez |
| Anahtar yok | `encryptSecret` **düz metin YAZMAZ**, hata fırlatır (fail-closed) |
| Çözme hatası | GCM kimlik doğrulaması düşerse **AÇIK HATA** — sessizce `''` dönmez |
| Legacy okuma | Etiketsiz kayıtlar okunur: base64 alfabesi dışıysa düz metin, değilse base64 çözülür |

Kritik tasarım kararı: **sessiz boş dize yok.** Yanlış anahtar veya kurcalanmış kayıt, "şifre boş"
gibi görünmek yerine açık hata üretir. Aksi hâlde kimlik doğrulama hatası "başarısız giriş" olarak
yorumlanır ve hata ayıklama imkânsızlaşırdı.

### 5.2 DÜZELTİLDİ — base64 yazımı gerçek şifrelemeye çevrildi

| Dosya | Değişiklik |
|-------|-----------|
| `server/routes/v1/e-invoice-settings.ts` | `Buffer.from(x,'base64')` × 3 → `encryptSecret(x)` (satır 176/179/182) |
| `server/services/hizliTenantCredentialRegistry.ts` | `decodeB64` gövdesi → `decryptSecret(value)` (tek noktadan hem yeni hem legacy okuma) |

Alan adları (`encryptedPassword`, `apiKeyEncrypted`, `apiSecretEncrypted`) **bilinçli olarak
korundu** — yeniden adlandırma şema değişikliği olurdu ve okuma uyumunu kırardı. Okuma tarafı
her iki biçimi de çözer.

### 5.3 DÜZELTİLDİ — `portalCredentials.wsPassword` düz metinden çıkarıldı

`server/routes/hizli-bilisim.ts`: 2 okuma noktası `decryptSecret(...)`, 2 yazma noktası
`encryptSecret(...)`. Satır 1260'taki **yanlış gerekçe** ("Backend'de güvenle saklanır, dışa açık
gönderilmez") kaldırıldı: dosyayı okuyabilen herkes şifreyi okuyabiliyordu.

### 5.4 DÜZELTİLDİ — Login gövdesi `apiKey` (küçük a) — ⚠️ DOĞRULANMADI

`server/services/hizliConnectService.ts` satır ~106: `ApiKey` → `apiKey`, duyuru örneğiyle
hizalandı. **Ancak bu değişiklik hiçbir canlı çağrıyla doğrulanmadı** — FAZ 18, §3'teki
`Hatalı secretKey!` engeli nedeniyle Login adımına hiç ulaşamıyor. Bu, kaynak kodun içine
uyarı olarak da yazıldı. Gerçek doğrulama koşu #6'ya bağlıdır.

### 5.5 DÜZELTİLDİ — test log sızıntısı

`server/tests/phase18HizliBilisimIntegrationTest.ts` satır ~380: ham `JSON.stringify(encData)`
kaldırıldı. Başarısız bir UtilEncrypt yanıtı bile `username`/`password` (hash'ler) taşıyabilir;
duyurunun "log kayıtlarında saklanmamalı" notunun ihlaliydi. Yerine yalnız varlık/yokluk + `Message`
yazılıyor.

> **Ek tarama yapıldı:** `server/**` içinde `JSON.stringify` + kimlik bilgisi içeren başka log
> bulunmadı. `hizliConnectService.ts:794` `GetCredits` yanıtını `slice(0, 200)` ile ve yalnız
> **kontör bakiyesi** bağlamında yazıyor — kimlik bilgisi değil, bırakıldı.

### 5.6 YENİ — `tools/credential-migration.ts` (tek seferlik migrasyon)

Mevcut `data/database.json` kayıtları hâlâ eski biçimde duruyor. Betik etiketsiz kayıtları
`enc:v1:` biçimine taşır.

- Varsayılan **KURU ÇALIŞTIRMA** (hiçbir şey yazmaz); yazmak için `--apply` şart.
- `NODE_ENV=production` ise çalışmaz.
- Yazmadan önce `.verify-tmp/` altına zaman damgalı **tam yedek** bırakır; yazma atomiktir.
- İdempotenttir: taşınacak kayıt yoksa dosya hiç yazılmaz.
- Çıktıda **hiçbir kimlik bilgisi veya anahtar materyali yok** — yalnız sayılar.

**KULLANIM (sunucu KAPALIYKEN, repo kökünden):**

```powershell
npx tsx tools/credential-migration.ts            # kuru çalıştırma — önce bunu koşun
npx tsx tools/credential-migration.ts --apply    # gerçekten yaz
```

> ⚠️ `--apply` gerçek veritabanını değiştirir. Kuru çalıştırma çıktısı görülmeden `--apply`
> **koşulmamalıdır.** Yedek `.verify-tmp/` altındadır ama `.verify-tmp` temizlenirse yedek de gider.

### 5.7 YENİ — `server/tests/credentialVaultRegressionTest.ts`

Kasa için 11 bölümlük regresyon süiti (ağ çağrısı yapmaz, `.env` okumaz, anahtarı kendi kurar):
tur, etiket, rastgele IV, kurcalama tespiti, legacy base64/düz metin okuma, **sezgi tuzağı**,
boş girdi, migrasyon idempotentliği, anahtar yokken fail-closed, HKDF türetimi, bozuk anahtar
yapılandırması. Özet biçimi bilinçli olarak `PASS: N | FAIL: N` — `dogrulama.ps1` çözümleyicisi
bu kalıbı arar.

### 5.8 GÜNCELLENDİ — `.env.example`

`CREDENTIAL_ENCRYPTION_KEY` anahtarı üç uyarısıyla belgelendi (bozuk anahtar → açık hata;
anahtar değişirse eski kayıtlar okunamaz; `JWT_SECRET` değişimi de aynı etkiyi yapar).

### 5.9 ✅ YENİ BULGU ve DÜZELTME — sezgisel legacy çözümü VERİ KAYBETTİRİYORDU

Süiti yazarken ortaya çıkan gerçek kusur. İlk sürümde `decryptSecret(value)` etiketsiz kaydı
**sezgisel** olarak çözüyordu: "tamamen base64 alfabesinde ve uzunluğu 4'ün katıysa base64'tür."
Bu sezgi, düz metin bir şifre için tam da eski `wsPassword` alanında yanlış çalışır:

> `TWFu` → tamamen base64 alfabesi, 4 karakter (4'ün katı) → base64 çözümü `Man`, geçerli UTF-8
> ve yeniden kodlandığında birebir aynı → base64 kabul edilir → şifre **`Man` olarak sessizce değişir**

Ve bu, migrasyonda kalıcı hâle gelirdi: yanlış düz metin şifrelenir, gerçek şifre **geri
dönüşsüz** kaybolur. Kusur, `wsPassword`'un eskiden düz metin olduğu bilgisi elimizde olduğu
hâlde kullanılmadığı için oluşuyordu.

> **Tuzak neden dar:** sezgisel yol, base64 çözümü geçersiz UTF-8 ürettiğinde kaydı zaten
> korurdu (tur kontrolü). Yani `Test2024` **bozulmaz** — ilk akla gelen örnek yanlış olurdu.
> Bozulma yalnızca çözümü geçerli UTF-8 olan değerlerde gerçekleşir (`TWFu` → `Man`). Dar ama
> gerçek bir kusur; süitin 5b bölümü tam olarak bu değeri kullanır.

**Düzeltme:** `decryptSecret` ve `migrateLegacyValue` artık `LegacyEncodingHint` parametresi alır
(`'auto' | 'base64' | 'plaintext'`). Alanın eski biçimini BİLEN her çağrı ipucunu açıkça geçer:

| Çağrı yeri | İpucu | Gerekçe |
|-----------|-------|---------|
| `hizliTenantCredentialRegistry.ts` `decodeB64` | `'base64'` | Bu alanlar eklendiklerinden beri base64 yazılıyordu |
| `hizli-bilisim.ts` `wsPassword` (2 okuma) | `'plaintext'` | Bu alan eskiden düz metin yazılıyordu |
| `tools/credential-migration.ts` settings alanları | `'base64'` | Aynı |
| `tools/credential-migration.ts` `wsPassword` | `'plaintext'` | Aynı |

`migrateLegacyValue`'nin varsayılanı `'auto'` bile değil — ipucu **zorunlu** kılındı ki yanlış
varsayımla çağrılamasın. `'auto'` yalnız `decryptSecret`'ta, biçimi bilinmeyen kayıtlar için
varsayılan kaldı; süitin 5b bölümü bu tuzağı **belgeliyor ve ölçüyor**.

### 5.10 ✅ YENİ BULGU ve DÜZELTME — `vaultStatus()` teşhis fonksiyonu hata fırlatıyordu

`vaultStatus()` "kasa kullanılabilir mi?" sorusunu yanıtlar ve `getVaultKey()` çağırıyordu. Bozuk
bir `CREDENTIAL_ENCRYPTION_KEY` durumunda `getVaultKey()` hata fırlatır (şifreleme yolunda
DOĞRU davranış) — ama teşhis fonksiyonunun hatası çağırana sıçrarsa "kasa durumu nedir?" sorusu
uygulamayı çökertirdi.

**Düzeltme:** `vaultStatus()` artık hiçbir koşulda fırlatmaz; hatayı yutar ve
`keySource: 'misconfigured'` ile **açıkça** raporlar. `'none'` demek yanıltıcı olurdu — anahtar
VAR, yalnız geçersiz; ikisini karıştırmak yanlış yapılandırmayı gizler. Migrasyon betiği bu iki
duruma ayrı hata mesajı verir.

### 5.11 DÜZELTİLDİ — `tools/dogrulama.ps1`

- Kasa regresyon süiti statik bölüme eklendi (`-Tip 'PASSFAIL'`, sunucu gerektirmez).
- **3 yeni statik regresyon deseni** — bu düzeltmelerin sessizce geri gelmesini engeller:
  `Buffer.from(password|apiKey|apiSecret).toString('base64')` (rotalarda), `wsPassword` düz metin
  yazımı, `JSON.stringify(encData)` (testlerde). Üçü de şu an yalnız **yorum satırlarında** geçiyor
  ve `Test-Desen` yorumları ihlal saymıyor — yani desenler doğru çalışacak.

---

## 6. Doğrulama gereksinimleri (koşu #6)

Bu oturumda **hiçbir koşu yapılamadı**, yani §5'in tamamı kanıtsızdır. Sıra ÖNEMLİDİR:

**6.1 — Önce derleme (migrasyondan ÖNCE).**
```powershell
npx tsc -b --pretty false
```
`credentialVault.ts`, `credential-migration.ts` ve düzenlenen üç dosya derlenmelidir. Derleme
geçmeden migrasyon **çalıştırılmaz**.

**6.2 — Kasa regresyon süiti (veriye dokunmaz, güvenli).**
```powershell
npx tsx server/tests/credentialVaultRegressionTest.ts
```
Beklenen: `PASS: N | FAIL: 0`. Bu geçmeden `--apply` **kesinlikle koşulmaz**. Süit aynı zamanda
`dogrulama.ps1` içinden de koşar (§5.11), yani paket çalıştırıldığında iki kez kanıt üretilir.

> **Not (kuru çalıştırmadan ÖNCE okunmalı):** §5.9'daki sezgi tuzağı, migrasyonda yanlış ipucu
> verilirse gerçek bir şifrenin **geri dönüşsüz** kaybına yol açar. Betik ipuçlarını sabit yazar
> (`settings` → base64, `wsPassword` → plaintext) ve bu, alanların eski yazım biçimiyle
> eşleşmektedir. Ancak `data/database.json` içinde bu alanlardan birine **elle** değer girilmişse
> (biçimi farklıysa) migrasyon onu bozabilir. Bu yüzden 6.3 çıktısındaki "taşınacak" sayısı
> beklenenden fazlaysa **`--apply` koşmadan önce sorun**.

**6.3 — Migrasyon kuru çalıştırma.**
```powershell
npx tsx tools/credential-migration.ts
```
Çıktı **kaydedilmelidir** — kaç kayıt taşınacak, gözle görülmelidir.

**6.4 — Migrasyon uygulama (yalnız 6.1–6.3 geçtikten sonra).**
```powershell
npx tsx tools/credential-migration.ts --apply
```
Sonrasında aynı komutu tekrar koşun: `TOPLAM taşınan alan : 0` dönmelidir (idempotentlik kanıtı).

**6.5 — Tam doğrulama paketi.**
```powershell
powershell -ExecutionPolicy Bypass -File .\tools\dogrulama.ps1
```
`BLOCKED = 0` beklenir. `FAZ 18` için ayrıca §3-A uygulanmalıdır (sandbox kimliği `.env`'e);
dönmezse çıktıdaki `Hatalı secretKey!` satıcıya iletilmelidir.

**6.6 — Geri alma.** Bir sorun çıkarsa `.verify-tmp/database.pre-credential-migration.<zaman>.json`
dosyasını `data/database.json` üzerine kopyalayın. **Bu yüzden migrasyondan sonra `.verify-tmp`
temizlenmemelidir.**

---

## 7. Özet karar tablosu (güncel)

| Kalem | Durum | Kim kapatır |
|-------|-------|-------------|
| Duyurunun istediği token akışı (UtilEncrypt→Login→Bearer) | ✅ kod uyumlu (statik) | — |
| Düz metin kimliğin başka uçta kullanılmaması | ✅ kod uyumlu (statik) | — |
| 03.07.2026 kesiminin fiilen uygulanıp uygulanmadığı | ❓ bilinmiyor | satıcı / Portal raporu |
| FAZ 18 `Hatalı secretKey!` | ❌ WARN → BLOCKED zinciri | **siz** (§3-A/B) — **dışsal, değişmedi** |
| base64 ≠ şifreleme (at-rest) | ✅ **KOD YAZILDI** | koşu #6 ile doğrulanmalı (§6.2) |
| `wsPassword` düz metin | ✅ **KOD YAZILDI** | aynı |
| Login `ApiKey` → `apiKey` | ⚠️ **KOD DEĞİŞTİ, DOĞRULANMADI** | koşu #6 (§6.5) — FAZ 18 Login'e ulaşmalı |
| FAZ 18 testinde log sızıntısı | ✅ **KOD YAZILDI** | koşu #6 (§6.5) |
| Mevcut DB kayıtlarının taşınması | ⏳ **BETİK HAZIR, KOŞULMADI** | **siz** — §6.3/§6.4 sırasıyla |
| Legacy sezgisel çözüm veri kaybettiriyordu | ✅ **BULUNDU + DÜZELTİLDİ** (§5.9) | süit 5b bölümü ölçer |
| `vaultStatus()` teşhis fonksiyonu hata fırlatıyordu | ✅ **BULUNDU + DÜZELTİLDİ** (§5.10) | süit bölüm 10 ölçer |
| Üç düzeltmenin geri gelmesini engelleyen statik desenler | ✅ **EKLEDİ** (§5.11) | `dogrulama.ps1` §5 koşar |

**Genel durum: KOD TARAFI BİTTİ, KANIT TARAFI AÇIK.** Yukarıdaki "KOD YAZILDI" kalemleri
*iddia*dır; koşu #6 yapılmadan hiçbiri PASS sayılamaz (kanıt sözleşmesi). Canlı Hızlı Bilişim
kullanımı ve `KAPI` yine **BLOCKED** kalır.
