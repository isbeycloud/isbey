# İŞBEY — Doğrulama Paketi: Kurulum ve Kullanım Kılavuzu

**Tarih:** 2026-09-10
**Amaç:** FAZ 25.2-C / 25.2-D / 25.3 / 25.4 / 25.5 kalemlerinin **koşu kanıtını** tek komutla üretmek.
**Durum etiketleri:** ✅ PASS = koşuldu ve geçti · ❌ FAIL = koşuldu ve başarısız · ⛔ BLOCKED = ortam nedeniyle koşulamadı · ⏭️ SKIP = kapsam dışı/atlandı · ⚠️ WARN = koşuldu, dikkat gerekiyor

---

## Neden bu paket var?

Bu oturumlarda Claude'un Linux çalışma alanı (VM) Plan9 mount hatasıyla açılmıyor. Bu yüzden tsc derlemesi, 140 regresyon ve yeni suitler **Claude tarafında koşulamıyor**; "koşu kanıtı bekliyor" etiketi olan kalemler o yüzden birikti. Paket, bu kanıtı **sizin makinenizde** üretir ve raporu Claude'a geri gönderilebilir tek bir dosyaya toplar.

Kritik kural hatırlatması: bu script hiçbir testi "geçmiş" saymaz. Yalnızca çalıştırır, çıktıyı okur ve etiketler. Bir test başarısızsa FAIL olarak görünür; ortam engelliyse BLOCKED olarak görünür — asla PASS gösterilmez.

---

## Ön koşullar

1. **`npm run dev` DURDURULMUŞ olmalı.** Script kendi sunucusunu 4000 portunda açar; port doluysa "harici sunucu" senaryosuna düşer ve rate-limit kanıtı zayıflar (uzağında DB çakışması riski var). Varsa Ctrl+C ile durdurun.
2. `node_modules` mevcut olmalı (`npm install` yapılmış).
3. `.env` mevcut ve `HIZLI_BILISIM_IS_TEST_MODE=true` olmalı (test modu kilidi — değişmez kural).

---

## Çalıştırma

Proje kökünde (`D:\İŞBEY`) PowerShell açıp:

```powershell
powershell -ExecutionPolicy Bypass -File tools\dogrulama.ps1
```

**Alternatif — Antigravity üzerinden:** Koşuyu Google Antigravity'ye devretmek isterseniz `tools\ANTIGRAVITY-GOREV.md` dosyasını Antigravity'ye verin. İçinde ön koşul, tam komut, çıktı konumu ve "FAIL'leri düzeltme, yalnız raporu bırak" sınırı yazılı. Koşu bitince rapor yine `.verify-tmp\dogrulama-raporu.txt` olur ve Claude oradan okur; sizin araya girmeniz gerekmez.

Süre: tam koşu genelde **3–8 dakika** (3 aylık muhasebe simülasyonu dahil). İsteğe bağlı anahtarlar:

| Anahtar | Etki |
|---------|------|
| `-SkipRateLimit` | İki rate-limit testini atlar (login testi, çalıştığı makinede 15 dakika boyunca login'i kilitler) |
| `-SkipHeavy` | 3 aylık muhasebe simülasyonunu atlar (en yavaş kalem) |
| `-NoBackup` | `data/database.json` yedeğini almaz (önerilmez — ağır testler DB dosyasına yazar) |

Hızlı ilk deneme için:

```powershell
powershell -ExecutionPolicy Bypass -File tools\dogrulama.ps1 -SkipHeavy
```

---

## Script ne yapıyor? (iki ayrı sunucu oturumu)

Login rate-limit testi 20 istek bütçesini 15 dakika boyunca doldurur. Suitler de login yaptığı için aynı süreçte koşarlarsa testin kanıt değeri düşer (429 çok erken gelir) ve suitler kilitlenir. Bu yüzden:

| Bölüm | Ne koşar | Neden |
|-------|----------|-------|
| 0 | node/npx/çalıştırma yolu probesu, `.env` durumu (secret'lar yalnız VAR/YOK) | Ön koşul kontrolü |
| 1 | `data/database.json` zaman damgalı yedeği | Ağır testler DB'ye yazar — geri dönüş yolu |
| 2 | **Taze sunucu #1** → login rate limit (21 istek: 20×401 + 1×429) | Temiz bütçeyle kesin kanıt; sonra sunucu kapanır |
| 2b | **Test fixture onarımı** → `tools/ensure-test-fixtures.mjs` | DB'de eksik seed kullanıcısı varsa geri ekler (bkz. not) |
| 4 | Statik suitler: 25.2-C tenant sourcing, 25.2-D jeneratör + hizalama, 25.2-B registry | Sunucu gerekmez |
| 5 | Statik secret/bypass taraması (24.3 iddiaları) | Kod ile yorum ayrımı yapılır |
| 6 | **Taze sunucu #2** → 25.2-A smoke, 25.1 izolasyon, 25.1 gate, 25.2-D runtime authz | Taze login bütçesi |
| 7 | Canlı 25.4/25.5 kanıtları: güvenlik başlıkları, CORS preflight, backup + SHA-256 checksum, webhook rate limit | Gerçek HTTP çağrıları |
| 8 | Muhasebe bütünlüğü: bilanço denkliği (Fark = 0,00 TL) + 3 aylık simülasyon | Sunucu **kapatıldıktan sonra** (aynı DB dosyasına iki süreç yazmasın) |

**Kritik sıra detayı:** Webhook rate-limit testi (1 dk / 60) bölüm 7'nin **en sonunda** koşar ve sunucu #2 bölüm 8'den önce kapatılır. Böylece hem webhook bütçesi hem de DB dosyası temiz kalır. Fixture onarımı (2b) da **sunucu #2 açılmadan önce** çalışır — sunucu veritabanını boot'ta belleğe aldığı için onarım sonradan yapılırsa etkisiz olur.

**Test fixture onarımı neden var?** `server/db/storage.ts` → `loadDatabase()` çoğu koleksiyon için "DB'de yoksa seed'den doldur" koruması taşır, ancak `users` için **taşımaz**. Bu yüzden silinen bir seed kullanıcısı (ör. `firmaadmin`) bir daha geri gelmez ve onunla giriş yapan suitler zincirleme 401 alır. Onarım aracı yalnızca **eksik** kullanıcıları ekler (id ve kullanıcı adı çift kontrolü), üretimde çalışmaz, yazmadan önce `.verify-tmp/fixtures-before-*.json` kopyası bırakır. Rapor bunu ⚠️ WARN olarak gösterir — gizli bir onarım yoktur. (Koşu #1'de bu eksiklik 4 FAIL'e yol açmıştı: `docs/24`.)

---

## Çıktılar

Hepsi `D:\İŞBEY\.verify-tmp\` altında:

| Dosya | İçerik |
|-------|--------|
| `dogrulama-raporu.txt` | **Claude'a geri gönderilecek dosya** — özet, tüm kontroller, FAIL listesi |
| `cikti-*.txt` | Her suite'in ham çıktısı (Türkçe karakterler dahil) |
| `sunucu-ana-err.log` / `sunucu-rlimit-err.log` | Sunucu hata logları (boot engeli olursa kök neden burada) |
| `raw-*.txt` | Ham süreç çıktıları (cikti-*.txt bunların birleşimi) |
| `runtime-authz-FAIL-listesi.txt` | Runtime suitinde FAIL varsa ilk 40 satır |
| `database.once-<zaman>.json` | Koşu öncesi DB yedeği |

`.verify-tmp/` git'e girmez — `.gitignore`'a eklendi (DB yedekleri, loglar ve ham çıktılar commit edilmez).

---

## Beklenen sonuçlar (referans)

| Kontrol | Beklenen |
|---------|----------|
| node / npx / tsx | ✅ |
| Çalıştırma yolu probe | ✅ `node --import tsx` (olmazsa ⚠️ npx yedeği) |
| `HIZLI_BILISIM_IS_TEST_MODE` | ✅ `true` |
| Login rate limit | ✅ 20×401 ardından 429 (ilk 429 = 21. istek) |
| 25.2-C tenant sourcing | ✅ FAIL=0 |
| 25.2-D jeneratör | ✅ exit=0, bilinmeyen guard ≈ 0 |
| 25.2-D frontend hizalama | ✅ FAIL=0 |
| 25.2-B registry | ✅ 31 PASS / 0 FAIL |
| Secret taraması (4 desen) | ✅ KODDA 0 eşleşme |
| 25.2-A smoke | ✅ FAIL=0 |
| 25.1 izolasyon | ✅ FAIL=0 |
| 25.1 security gate | ✅ FAIL=0 |
| 25.2-D runtime authz | ✅ FAIL=0 (SKIP satırları normaldir: yan etkili yazma uçları + handler-içi rol kontrolleri) |
| Güvenlik başlıkları | ✅ nosniff / DENY / no-referrer |
| CORS | ✅ allowlist tanımsızsa "mevcut açık davranış" bilgisi; tanımlıysa yabancı origin için başlık **boş** |
| Backup checksum | ✅ `success:true`, `checksumVerified:true` |
| Sidecar bütünlüğü | ✅ CHECKSUM MATCH |
| Backup retention | ✅ json sayısı ≤ `BACKUP_RETENTION_COUNT` |
| Webhook rate limit | ✅ 401/503 yığını ardından 429 |
| `TSC-SERVER` (sunucu tip kontrolü) | ✅ 0 hata (eşik 141 → **0**'a indirildi) |
| `BUILD` (`tsc -b && vite build`) | ✅ exit=0, 0 TS hatası |
| `SEC-006` (hizli-bayi yanıtında WS şifresi) | ✅ anahtar yok |
| `SEC-012` (MOCK sessiz fallback kapalı) | ✅ 33 kusur maddesi temiz |
| `SEC-013` (FAZ 18 canlı adres koruması) | ✅ tüm giden istekler süzgeçli, iddialar ölçüme bağlı |
| `FAZ 18` (sandbox UtilEncrypt → Login) | ⚠️ **dış credential'a bağlı** — geçerli test-ortamı SecretKey'i gerekir (bkz. aşağıdaki not) |
| `KAPI` (canlı e-Fatura/e-Arşiv) | ⛔ **kapalı** — FAZ 18 PASS olmadan açılmaz (kasıtlı) |
| Bilanço denkliği | ✅ Fark = 0,00 TL, FAIL=0 |
| 3 aylık simülasyon | ✅ FAIL=0 |

### `FAZ 18` notu — ✅ PASS (2026-09-15 18:22 koşusu, gerçek sandbox kanıtıyla)

**GÜNCEL DURUM (2026-09-15).** Bu bölüm eskiden "kapıyı tutan tek engel" diyordu; **artık geçerli değil.** Koşu #9 (2026-09-15 18:22:09) FAZ 18'i **ilk kez gerçek TEST/SANDBOX yanıtıyla** PASS'a çıkardı: `PASS=65 FAIL=0 WARN=0 SKIP=0`.

BÖLÜM 5'in altı kanıt satırı (birebir çıktı):

```
✅ PASS  UtilEncrypt başarılı (78ms)
✅ PASS  Login başarılı — Bearer Token alındı (114ms)
✅ PASS  Mükellef bilgisi alındı — HIZLI BİLİŞİM TEST MERKEZ (VKN: 4620553774)
✅ PASS  Token geçerlilik: 3 gün
✅ PASS  Token formatı geçerli
✅ PASS  Bearer Token ile endpoint çağrısı başarılı (HTTP 200)
```

BÖLÜM 11 sayaçları: `süzgeçten geçen: 4, hedefe ulaşan: 2, ağ engeline takılan: 0, canlıya çıkan: 0`.

**§5 ↔ §11 tutarlılığı:** `hedefeUlasanIstekSayisi` yalnız `httpYanitiniSiniflandir()` içinde ve yalnız `X-Proxy-Error` taşımayan gerçek yanıtta artar. `2 = 1 (§4 Version ping) + 1 (§5 MusteriGetir)`. Değer `> 0` olduğu için BÖLÜM 11 PASS verir ve **§5'in fiilen sandbox'a çıktığını bağımsız olarak doğrular.** Tutarsızlık yoktur.

**Tarihçe — neden eski kayıt farklıydı:** 2026-09-13 koşularında sandbox `UtilEncrypt` `{"IsSucceeded":false,"Message":"Hatalı secretKey!"}` döndürüyordu (istenen ayrıştırılmış, kimlik reddedilmiş; ağ hatası değil). 2026-09-15'te `.env` test ortamı credential'larıyla güncellendi ve zincir geçti. Bu sırada süitteki **bayat iddialar** da düzeltilmişti (süit satıcı dokümanındaki Türkçe endpoint adlarını `GonderFatura` vb. ve `deductCredits`/`consume` adlarını arıyordu; kod bunları bilinçli kullanmıyordu). Artık gerçek servis sözleşmesi (`sendDocument` / `checkGibUser` / `getDocumentListByGUID` / `getDocumentReceiverAllList` / `cancelDocument` / `utilEncrypt` / `login`) ve üç fazlı kontör (`reserveCredits` → `commitCredits` / `rollbackCredits`) denetleniyor.

**ÖNEMLİ — bu ne DEĞİLDİR:** FAZ 18 PASS olması **production geçiş onayı değildir**. Belge gönderimi (kontör tüketen işlem) hâlâ yapılmadı ve FAZ 19'un belge ayağı hâlâ yok. Production için gereken maddeler: `docs/31_FAZ18_FAZ19_TEST_BORCLARI.md`.

### FAZ 18'e eklenen canlı adres koruması (2026-09-13)

FAZ 18 süiti BÖLÜM 4/5'te **gerçek ağ çağrısı** yapar (Version ping, UtilEncrypt,
Login, MusteriGetir). Önceden bu istekleri canlı host'a karşı koruyan hiçbir şey
yoktu: adresler sabitten (`sandboxUrl`) geliyordu ve sabit bir gün canlıya
çevrilirse süit sessizce üretim entegratörüne dokunurdu. Artık:

- Süitteki **her** `axios` çağrısı `guvenliTestUrl(...)` süzgecinden geçer; canlı
  host görülürse istek **gönderilmez**, test `FAIL` verir (sayaç artar).
- BÖLÜM 11'in "canlıya gönderilmedi" iddiaları artık koşulsuz `pass()` değil;
  `canliAdresEngeli === 0` ölçümüne bağlıdır.
- Süitte `SendDocument`/`CancelDocument` çağrısı **olmadığı** statik olarak
  ölçülür (kontör yakılmadığının kanıtı).
- Bu korumanın silinmesi **`SEC-013`** kalemiyle yakalanır: süzgeç çağrı sayısı
  istek sayısından az olamaz, "canlıya gönderilmedi" iddiaları `canliAdresEngeli`
  ölçümüne bağlı olmak zorundadır ve süitte belge gönderen uca çağrı bulunamaz.
  `SEC-013` kapı kalemlerinden biridir.

**Not:** Bu koruma FAZ 18'in `WARN` durumunu **değiştirmez** — kök neden hâlâ 1
numaralı dış credential'dır. Eklenen şey, süitin kendisinin üretime yan etki
yapma riskinin kapatılmasıdır.

---

## Bilinçli kapsam dışı (dürüstlük notu)

Bu paket aşağıdakileri **kapsamaz**; bunlar ayrı kalem olarak duruyor:

- **FAZ 19 izole sunucu testi (port 4719):** `testServer19.mjs` + `phase19NegativeAccessTest.ts` ayrı bir izole sunucu ister; bu paket o sunucuyu kurmaz (`SKIP`). Geçmiş not: eski `testServer19.js` iki nedenle hiç başlamıyordu — (1) kök `package.json` `"type": "module"` iken dosya CommonJS'ti (`require is not defined`), (2) `require('./routes/auth')` yolu `server/tests/` altından çözülmüyordu (o dizinler `server/` altında). **Düzeltildi (2026-09-15):** yerine ESM tabanlı `testServer19.mjs` yazıldı, kırık `.js` silindi; süit gerçek çıktıyla koşuldu (45/45 PASS). Bu kalemin `SKIP` kalması artık "test kırık" değil, "bu paket sunucuyu kendi kurmuyor" anlamına gelir.
- **FAZ 25.5 #4 restore testi:** Projede restore ucu/akışı yok; checksum doğrulaması API olarak hazır, restore senaryosu yazılmadı.
- **FAZ 25.4 #4/#6 (request validation standardı, moduleGate montajı):** #6 davranış değiştirir (yeni 403'ler) — onay bekliyor, bilinçli olarak devrede değil.
- **Canlı Hızlı Bilişim çağrıları:** Kontör tüketen işlem yok; test modu kilidi korunuyor.

---

## Sorun giderme

| Belirti | Çözüm |
|---------|-------|
| "Port 4000'te ZATEN bir sunucu çalışıyor" (⛔) | `npm run dev` durdurup tekrar çalıştırın |
| Sunucu #2 başlamadı (⛔) | `.verify-tmp\sunucu-ana-err.log` dosyasını raporla birlikte gönderin — kök neden orada |
| Login testi hep 429 döndü (⚠️) | Son 15 dakikada çok login denemesi yapılmış; 15 dakika bekleyip tekrar çalıştırın (kanıt güçlenir) |
| "özet satırı okunamadı" | İlgili `cikti-*.txt` dosyasını gönderin — parser'ı çıktıya göre güncelleriz |
| `node_modules (tsx) hazır` ❌ | `npm install` |
| Registry köprüsü ❌ | `node tools/gen-security-barrel.mjs` çıktısını gönderin |

---

## Koşu sonrası Claude'un yapacakları

Rapor geldiğinde Claude şu sırayı işler (docs/20 EK ve docs/18 ile uyumlu):

1. FAIL / BLOCKED kalemleri kök nedene indirir, düzeltmeyi uygular (asla testi "geçti" saymaz).
2. FAIL=0 çıkan fazları docs/18'de 🔄 → ✅ yapar (**yalnız kanıt varsa**).
3. Raporu `docs/24_*` olarak arşivler ve `docs/22` oturum raporuna işler.
4. Sıradaki adım: FAZ 26 (CI/CD) — bu paket oradaki pipeline adımlarının taslağı olarak da kullanılabilir.

---

## İlgili dosyalar

- `tools/dogrulama.ps1` — bu paketin kendisi
- `tools/ANTIGRAVITY-GOREV.md` — koşuyu Antigravity'ye devreden görev dosyası (dosya üzerinden haberleşme; Claude ile Antigravity arasında doğrudan bağlantı yoktur)
- `tools/gen-security-barrel.mjs` — 25.2-B registry testinin derleme yapmadan koşabilmesi için modül köprüsü
- `docs/18` — canlıya geçiş kontrol listesi (durum tabloları)
- `docs/20` — koşulacak doğrulama zinciri (EK bölümleri)
- `docs/22` — 2026-09-09 oturum raporu (koşu kanıtı bekleyen kalemler)
