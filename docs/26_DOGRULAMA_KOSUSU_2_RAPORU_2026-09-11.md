# İŞBEY — Doğrulama Koşusu #2 Raporu (2026-09-11)

**Koşuyu yapan:** Kullanıcı (BEYOGLU) · **Analiz/düzeltme:** Claude (Opus-5)
**Komut:** `powershell -ExecutionPolicy Bypass -File tools\dogrulama.ps1`
**Makine:** BEYOGLU · Node v24.14.1 · Port 4000
**Ham rapor:** `.verify-tmp\dogrulama-raporu.txt`

## Sonuç: PASS=34 · FAIL=3 · SKIP=4 · WARN=1

Koşu #1'e göre (PASS=32 / FAIL=7) iyileşme var: **4 FAIL kapandı.** Kalan 3 FAIL'in
hiçbiri muhasebe/stok/KDV mantığıyla ilgili değil; ikisi doğrulama altyapısının kendi
sorunu, biri gerçek bir güvenlik bulgusudur. Kritik kural gereği **bu koşuda da hiçbir
faz ✅ ilan edilmedi** — kalan kanıt eksiği kapanana kadar kalemler `🔧 KOD` kalır.

---

## 1. Kapanan kalemler (koşu #1 → koşu #2)

| Kalem | Koşu #1 | Koşu #2 | Sebep |
|-------|---------|---------|-------|
| FAZ 25.2-A smoke | FAIL (9/10) | **PASS 19/0** | `firmaadmin` geri eklendi |
| FAZ 25.1 izolasyon | FAIL (3/4) | **PASS 7/0** | aynı |
| FAZ 25.1 security gate | FAIL (3) | **PASS 43/0** | `firmaadmin` + `pasifkullanici` geri eklendi |
| Bilanço denkliği | PASS | **PASS 15/0** | değişmedi (Fark = 0,00 TL) |
| 3 aylık muhasebe simülasyonu | PASS | **PASS 9/0** | değişmedi |

`tools/ensure-test-fixtures.mjs` bu koşuda beklendiği gibi çalıştı:
`FIXTURE-EKLENDI usr-4 firmaadmin / usr-5 rapor / usr-6 pasifkullanici` → `FIXTURE-OK`.
Fixture onarımı bir kez daha kanıtlandı; **`loadDatabase()`'daki kalıcı seed koruması
önerisi hâlâ onay bekliyor** (bkz. §4).

---

## 2. FAIL #1 — `HIZLI_BILISIM_IS_TEST_MODE` (YANLIŞ ALARM)

**Rapor:** `HIZLI_BILISIM_IS_TEST_MODE= (true olmali)`
**Gerçek:** `.env` satır 11'de `HIZLI_BILISIM_IS_TEST_MODE=true` **var**. Canlı entegrasyon
kapısı kilitli ve doğru.

**Kök neden:** Doğrulama script'inin `.env` ayristirmasi. Bölüm 0 "**.env okundu — 3 anahtar
tanimli**" diyor; oysa dosyada **15 anahtar** var. Yani okunan 3 anahtar (satır 22/26/28)
dışındaki 12 anahtar `EnvMap`'e girmiyor, `HIZLI_BILISIM_*` bloğu sorgulandığında boş
dönüyor. (İlk yazımda bu sayı yanlışlıkla 17 verildi; `.env` yeniden sayıldı: 15.)

**Önemli:** Koşu #1'de **tam olarak aynı hata** oluştu ve `docs/24` bunu "karışık satır
sonu (CR/LF)" diye teşhis edip bir "düzeltme" yaptı. Koşu #2, o düzeltmenin **işe
yaramadığını** kanıtladı (hata harfi harfine tekrarladı). Yani koşu #1'in kök nedeni
yanlış teşhis edilmişti.

**Gerçek mekanizma (dürüst sınır):** Dosyada CR/LF karışıklığı yok; `.env` sahiden 15
anahtar içeriyor ve BOM'suz UTF-8. Koşu anında script'in belleğinde ne olduğunu
göremediğim için kesin mekanizmayı **kanıtlayamıyorum**; iki olasılık kalıyor: (a) desen
eşleşmesinin kültür/ayar bağımlı davranması, (b) koşuyu yapan kopyanın bu düzeltmeyi
içermemesi. Bu yüzden §2'deki düzeltme tek bir varsayıma dayanmıyor: hem ayristirma
kültürden bağımsız hale getirildi hem de **kendini denetleyen** bir kontrol eklendi —
script artık "kaç aday satır gördüm / kaçını çözdüm" kıyasını yapıp uyuşmazsa FAIL verir.
Sessiz yanlış-rapor ihtimali böylece ortadan kalkar.

**Doğrulama notu:** `read_widget_context` ve ikinci bir koşu ile teyit edilemedi — script
koşusu kullanıcı tarafında yapılır. Aşağıdaki düzeltme, koşu #3'te `.env okundu` kaleminin
**15 anahtar** bildirmesiyle doğrulanmalıdır; 15 görülmezse teşhis hâlâ eksiktir ve o kalem
FAIL kalır.

**Düzeltme (uygulandı, `tools/dogrulama.ps1`):**
- Dosya **tek bayt dizisi** olarak ele alınır; her türlü satır sonu (`\r\n`, `\n`, `\r`)
  tek regex ile bölünür — satır sonu varsayımına gerek kalmaz.
- Anahtar deseni `[regex]::new(..., CultureInvariant)` ile **kültürden bağımsız** kurulur.
- BOM varsa temizlenir (BOM ilk anahtarın adını bozar).
- **Teşhis güvencesi:** "kaç aday satır vardı" ile "kaç anahtar çözüldü" karşılaştırılır;
  uyuşmazsa sessizce PASS/FAIL üretmek yerine `.env okundu` kalemi **FAIL** verir. Böylece
  aynı sessiz hata bir daha gizlenemez.
- Ayrıca **"anahtar yok"** ile **"değer false"** ayrımı metne yazıldı; koşu #1–#2'de bu
  ikisi karıştığı için rapor "değer boş" gibi okunuyordu.

---

## 3. FAIL #2 + #3 — Login rate-limit bütçesi (TEK kök neden)

**Rapor:**
- `FAZ 25.2-D #2 runtime authz suite` → `Error: Login başarısız (rapor): HTTP 429`
- `25.5 backup kaniti` → `admin login basarisiz -> HTTP 429`

**Kök neden:** **Suitler arasında paylaşılan login rate-limit bütçesi.**

`server/index.ts` yalnızca `securityHeaders` ve `cors` montajı yapar; login/mobil login
limiter'ları **route seviyesinde** takılır (`server/routes/auth.ts:53` → `loginRateLimit`,
`server/routes/v1/mobile.ts:47` → `mobileLoginRateLimit`). Limiter
`server/middleware/productionSecurity.ts` içindeki **modül-global** `rateBuckets` map'ini
kullanır ve anahtar `login:<ip>`'dir. Tüm suitler aynı makineden (127.0.0.1) koştuğu için
**tek bir ortak kova** oluşur: 15 dakikada 20 deneme.

Sunucu #2 oturumunda login yapan suitler:
`faz252a` (3) + `faz25Izolasyon` (1) + `faz25SecurityGate` (4+) + `faz252dRuntimeAuthz`
(8 rol + bootstrap) → **sunucu #2'nin 20'lik bütçesi tükeniyor.** Sıralamada runtime authz
(8. rol: `rapor`) ve sonrasındaki 25.5 backup 429 alıyor. 429 = rate limit testinin
kendisinin çalıştığının kanıtı; sorun **testlerin birbirinin bütçesini yemesi**.

**Neden koşu #1'de görünmedi:** O koşuda suitler zaten 401'de duruyordu (eksik seed
kullanıcıları) ve 20 login'lik bütçe hiç tükenmedi. Kullanıcılar geri gelince suitler
gerçekten çalışmaya başladı ve bütçe baskısı ortaya çıktı — yani bu, ilerlemenin yan
etkisi olarak görünür hale gelen bir altyapı sorunu.

**Düzeltme (uygulandı):** Limit **zayıflatılmadı**; yalnızca **doğrulama koşusunda, açıkça
raporlanan** bir sapma eklendi.
- `productionSecurity.ts`: `LOGIN_RATE_LIMIT_MAX` / `MOBILE_RATE_LIMIT_MAX` env ile
  ayarlanabilir. **Tanımsızsa varsayılan 20 / 30 aynen geçerlidir — üretim davranışı
  değişmez.**
- `tools/dogrulama.ps1`: sunucu #2 **yalnızca** `LOGIN_RATE_LIMIT_MAX=500` ile başlatılır ve
  bu kalem raporda `WARN` olarak **görünür**: *"Sunucu #2 login rate-limit butcesi
  (dogrulama sapmasi) — varsayilan 20; suitler kanit uretebilsin diye yukseltildi"*.
  Ayar, sunucu kapatılınca geri alınır.
- Sunucu #1 **dokunulmaz**: rate-limit kanıtı (429, tam 21. istek) hâlâ **varsayılan 20
  bütçesiyle** alınır. Yani rate limit davranışının kendisi kanıtlanmaya devam eder;
  sapma yalnızca diğer suitlerin kanıt üretebilmesi içindir.
- `.env.example`'a iki anahtar, "production'da boş bırakın" notuyla eklendi.

**Sınır (dürüst not):** Bu, limiter'ın *davranışını* değiştiren bir env anahtarıdır. Varsayılan
değişmediği ve sapma raporda görünür olduğu için kabul edilebilir bulundu; ancak fazın ✅
sayılması için koşu #3'te runtime authz suite'in **FAIL=0** vermesi şarttır.

---

## 4. GÜVENLİK BULGUSU — Rate limiter `X-Forwarded-For` ile atlatılabilir

**Önem:** Yüksek (brute-force koruması etkisiz kılınabilir) · **Durum:** ⚠️ ONAY BEKLİYOR —
davranış değiştirir, tek taraflı düzeltilmedi.

`server/middleware/productionSecurity.ts:106-107` bucket anahtarını şöyle üretir:

```ts
const fwd = (req.headers['x-forwarded-for'] as string) || '';
const ip = (fwd.split(',')[0] || req.ip || 'unknown').trim();
```

Yani istemcinin **gönderdiği ham başlık** koşulsuz kabul edilir. `app.set('trust proxy', ...)`
hiçbir yerde çağrılmadığı doğrulandı (`server/index.ts`), dolayısıyla gerçek istemci IP'si
`req.ip`'dir; XFF'e güvenmek için hiçbir meşru gerekçe yoktur.

**Etki:** Saldırgan her istekte farklı `X-Forwarded-For: <rastgele>` göndererek her istekte
**yeni bir kova** oluşturur → 20/15dk login limiti, 30/15dk mobil login limiti ve 60/1dk
webhook limiti **tamamen devre dışı** kalır. Bu, FAZ 25.4 #3'ün amacını (brute-force
koruması) doğrudan boşa çıkarır.

**Önerilen düzeltme:** XFF yalnızca açıkça yapılandırılmış bir proxy arkasında okunmalıdır.
Somut olarak `server/index.ts`'e `TRUST_PROXY` env'ine bağlı `app.set('trust proxy', ...)`
eklenmeli; limiter `req.ip` kullanmalı, XFF'e yalnızca `trust proxy` aktifken (ve o zaman da
Express'in çözdüğü `req.ip` üzerinden) güvenilmelidir.

**Neden şimdi uygulanmadı:** Bu, çalışan bir güvenlik katmanının davranışını değiştirir ve
mevcut koşu kalemlerini etkileyebilir (FAZ 25.4 #4/#6 ile aynı onay sınıfında). Onay
verildiğinde uygulanacaktır.

---

## 5. Diğer gözlemler (FAIL değil)

- **SEC-005 CORS** `PASS` ama detay önemli: `CORS_ALLOW_ORIGINS` tanımsız olduğu için
  yabancı origin'e `Access-Control-Allow-Origin` dönüyor. Bu **bilinçli ve belgelenmiş**
  bir davranıştır (geliştirme akışı bozulmasın diye); production'a çıkmadan önce bu env'in
  doldurulması gerekir. Aksi halde allowlist hiç devreye girmez.
- **`npx tsc -b` → 0 hata**, exit 0 (`.verify-tmp/tsc-sonucu.txt`). Ancak bu adım doğrulama
  script'inin bir parçası değil, ayrı koşulmuş — script'e eklenmesi önerilir.
- **FAZ 25.2-D #1 jeneratör** `exit kodu okunamadi; karar CIKTIYA DAYALI`. Çıktıya dayalı
  karar bilinçli olarak açıkça etiketleniyor (sessiz varsayım yok), ancak exit kodu
  okunabilirliği Start-Process katmanında hâlâ kırılgan.
- **git status** `SKIP` — doğrulama ortamında git çalıştırılamıyor; değişen dosya listesi
  koşu kanıtında yok. Ayrı bir kayıt eksikliği (kritik değil).
- **Fixture onarımı `WARN`** — doğru davranış: onarım gerekti (yani `users` seed koruması
  hâlâ yok), ama suitler geçti. `loadDatabase()` için kalıcı çözüm hâlâ onay bekliyor
  (bkz. `docs/24` §1 ve hafızadaki `isbey-db-seed-tuzagi`).

---

## 6. Sıradaki adım

Koşu #3 için gerekenler:

1. Bu raporda uygulanan üç düzeltmenin (`dogrulama.ps1` ×2, `productionSecurity.ts` ×1)
   etkisini görmek üzere script yeniden koşulmalı.
2. Beklenen: `.env okundu` artık **15 anahtar** demeli; TEST modu kilidi **PASS** olmalı;
   `FAZ 25.2-D #2 runtime authz suite` ve `25.5 backup kaniti` **FAIL=0** vermeli.
3. `25.5 backup kaniti` ayrıca `server/tests/output/runtime-authz-results.json` dosyasının
   üretildiğini göstermeli.
4. XFF bulgusu (§4) için onay kararı bekleniyor.

**Hiçbir faz, bu koşuda FAIL=0 kanıtı oluşmadan ✅ yapılmayacaktır.**
