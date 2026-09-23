# İŞBEY — Doğrulama Koşusu #3 Raporu (2026-09-11)

**Koşuyu yapan:** Google Antigravity · **Analiz/düzeltme:** Claude (Opus-5)
**Komut:** `powershell -ExecutionPolicy Bypass -File tools\dogrulama.ps1`
**Makine:** BEYOGLU · Node v24.14.1 · Port 4000
**Ham rapor:** `.verify-tmp\dogrulama-raporu.txt`

## Sonuç: PASS=39 · FAIL=2 · SKIP=4 · WARN=2

| Metrik | Koşu #1 | Koşu #2 | **Koşu #3** |
|--------|--------:|--------:|------------:|
| PASS | 32 | 34 | **39** |
| FAIL | 7 | 3 | **2** |
| SKIP | 4 | 4 | 4 |
| WARN | 0 | 1 | 2 |

Koşu #2'de uygulanan üç düzeltmenin **üçü de tuttu**:
`.env` artık 15/15 anahtar okunuyor, TEST modu kilidi PASS, 25.5 backup zinciri
(checksum + sidecar + retention) PASS. Kritik kural gereği **yine hiçbir faz
✅ ilan edilmedi** — kalan 2 FAIL kanıtlanmadan fazlar `🔧 KOD` kalır.

**Önemli yön notu:** 63 runtime authz FAIL'inin **tamamı "fazla kısıtlama"
yönündedir** (beklenti ALLOW → 403 veya DENY → 404). Hiçbir FAIL "DENY beklenirken
200 döndü" biçiminde değil — yani **hiçbir FAIL gizli yetki sızıntısı değil.**
Tersine, fazla kısıtlama production için güvenli taraftır. Bu, bulguların aciliyetini
düşürür ama yine de giderilmelidir: matris yanlış olduğu sürece suite gerçek
regresyonları maskeler.

---

## 1. FAIL #1 — `FAZ 25.2-A smoke` (17 PASS / 2 FAIL): TEST İZOLASYONU

Her iki FAIL de aynı nedenden: test **sabit kullanıcı adları** kullanıyor.

```
✗ COMPANY_ADMIN başka tenant'a kullanıcı açamaz → companyId zorla tnt-isbey (undefined)
✗ COMPANY_ADMIN kendi tenant'ına SATIS oluşturur → 200 (normal akış bozulmadı)
```

**Kök neden:** Test `crmtest1` ve `satis262a` adlarını kullanıyordu. Bu kayıtlar
**koşu #2'de (2026-09-11T08:22 UTC) zaten oluşmuş** ve DB'de duruyor:

```json
{ "username": "crmtest1",  "companyId": "tnt-isbey", "createdAt": "2026-09-11T08:22:59.821Z" }
{ "username": "satis262a", "companyId": "tnt-isbey", "createdAt": "2026-09-11T08:22:59.952Z" }
```

Koşu #3'te aynı adlar tekrar istenince create handler `400` döndü ("bu kullanıcı adı
zaten kayıtlı") → `r.json.user` undefined → ikinci kalem FAIL; ilkinde de 400 ≠ 200.

**Kritik bulgu — güvenlik doğru çalışıyor:** `crmtest1` kaydında istekte gönderilen
`companyId: "tnt-ankara"` değil, **`companyId: "tnt-isbey"`** yazılı. Yani tenant
zorlaması **doğru davranıyor**; sorun tamamen testin tekrar koşabilir olmaması.

**Düzeltme (uygulandı, `faz252aAuthorizationTest.mjs`):** Kullanıcı adları her koşuda
çakışmasız üretilir (`esc-<sonek>`, `crm-<sonek>`, `satis-<sonek>`). Ayrıca testin
asıl iddiası düzeltildi: kalem artık "200 dönmesi"ni değil **tenant zorlaması**nı
doğrular — 409/çakışma durumunda bile isteğin `tnt-ankara`'ya kayıt açmadığı kontrol
edilir. Böylece test hem idempotent hem de iddiaya daha sadık hale geldi.

---

## 2. FAIL #2 — `FAZ 25.2-D #2 runtime authz` (2690 PASS / 63 FAIL / 1595 SKIP)

63 FAIL üç gruba ayrıldı. **Üçünün de kökü suite/matris tarafında**, uygulama kodunda değil.

### Grup A — 48 FAIL: jeneratörün iç içe parantez hatası (`tenants` 16 + `admin-saas` 32)

`faz252dAuthzMatrixGenerator.mjs` dosya-genel rol korumasını şu desenle arıyordu:

```js
content.matchAll(new RegExp(`${routerName}\\.use\\(([^)]*)\\)`, 'g'))
```

`[^)]*` **ilk `)` karakterinde durur.** `tenants.ts` satır 11'deki gerçek kod:

```ts
tenantsRouter.use(requireRole('SUPER_ADMIN', 'ADMIN'));
```

Bu çağrıda iç içe parantez var; dilim `requireRole('SUPER_ADMIN', 'ADMIN'` noktasında
kesiliyor → `requireRole\(...\)` **hiç eşleşmiyor** → dosya-genel rol koruması
görülmüyor → uçlar yanlışlıkla `auth-only` sayılıyor.

**Kanıt:** Üretilen matriste `tenants.ts` kayıtları `"guard": "auth-only"` ve dokuz rolün
tamamı `ALLOW`. Oysa dosyada dosya-genel `requireRole('SUPER_ADMIN','ADMIN')` var ve
runtime'da COMPANY_ADMIN/MUHASEBE/… **403** alıyor. Yani uygulama doğru, matris yanlış.
`admin-saas.ts` için de aynısı: satır 9 `requireRole('SUPER_ADMIN','ADMIN','platform_admin')`
— iki iç içe parantez, aynı hata.

> Not: `extractGuardChain()` fonksiyonu bu sorunu zaten doğru çözüyordu (dengeli parantez
> sayacı kullanıyor). Hata yalnızca dosya-genel tarama kodundaydı ve gözden kaçmıştı.

**Düzeltme (uygulandı):** `balancedArgs()` yardımcısı eklendi; `router.use(...)` argüman
gövdeleri artık dengeli parantezle okunuyor ve `requireRole(` çağrıları `g` bayrağıyla
aranıyor (çoklu requireRole zincirleri için). Jeneratörün ürettiği matris artık
`tenants.ts` için `role (dosya-genel: SUPER_ADMIN, ADMIN)` demeli ve 8 rol DENY olmalı.

### Grup B — 8 FAIL: suite'in inline-yetki dedektörü eksik (`accountant`)

```
beklenti ALLOW → 403  (GET /api/v1/accountant/clients/rt-test-id/monthly-report [8 rol])
```

`accountant.ts` dosya-genel yalnızca `requireAuth` taşır (satır 11) → matris tüm rollere
`ALLOW` der. Ama handler içinde satır 34 gerçek yetki kararını verir:

```ts
if (!AccountantService.isAccountantAuthorizedForTenant(userId, tenantId))
  return res.status(403).json({ ... });
```

Suite'in `hasInlineRoleCheck()` dedektörü bu fonksiyonu **tanımıyordu** — listesinde
yalnızca `req.user.role ===`, `isPlatformAdmin()`, `caller.role ===` vardı. Bu yüzden
403 "beklenmeyen" sayılıp FAIL yazıldı; oysa **403 doğru davranıştır** (kimliği doğrulanmış
ama yetkisiz kullanıcı reddediliyor).

**Düzeltme (uygulandı):** Dedektör kapsamı genişletildi
(`isAccountantAuthorizedForTenant(`, `isSameTenant(`, `hasPermission(`, `canAccess*(`).
Bu desenler bulunduğunda ALLOW-beklentili 403, FAIL yerine **açık gerekçeli SKIP** olur
(mevcut tasarımın "statik matris göremez → manuel inceleme" ilkesi).

### Grup C — 7 FAIL: mount çözümlemesi artefaktı (`v1/products.ts /warehouses`)

```
beklenti DENY → 404 (401/403 beklenir)  (GET /api/v1/products/warehouses [7 rol])
```

Bu uç matriste `DENY` (guard `permission`), ama API'de **404** dönüyor — çünkü uç o yolda
yok. `server/index.ts` onu **alias mount** ile bağlıyor:

```ts
app.use('/api/v1/warehouses', (req, res, next) => { req.url = '/warehouses'; v1ProductsRouter(req, res, next); });
```

Suite'in mount çözümleyicisi yalnızca `app.use('/prefix', binding)` biçimini görür
(`mounts` regex'i arrow-function mount'ları doğal olarak dışarıda bırakır). Sonuç: uç
`/api/v1/products/warehouses` yoluna düşüyor, orada böyle bir rota yok → 404. Bu bir
yetki sonucu değildir; "DENY" beklentisini ne doğrular ne çürütür.

**Düzeltme (uygulandı):** Suite'te `expected === 'DENY'` dalında **404 → SKIP**
(gerekçesiyle: "mount çözümlemesi/yol artefaktı, yetki kanıtı değil"). 404'ü FAIL saymak
yanlış sinyal veriyordu.

> Yan bulgu (ayrı kalem): `app.use('/api/v1/warehouses', ...)` ile
> `app.use('/api/v1/products', v1ProductsRouter)` **aynı router'ı iki ön ek altında**
> bağlıyor ve ikincisinin içinde `/warehouses` var. Bu shadowing karmaşası, mount
> çözümleyicisinin de kafasını karıştıran asıl kaynak. İş mantığını değiştirmemek için
> şimdilik yalnız belgelendi.

---

## 3. ⚠️ Yeni bulgu — `GET /api/reports/vat-report` her rolde 500 döndürüyor

Suite, auth'un geçtiği ama sunucu hatası üreten uçları ayrıca listeliyor:

```
⚠️  500 üreten uçlar (auth GEÇTİ ama sunucu hatası):
    GET /api/reports/vat-report [SUPER_ADMIN] → 500
    ... (9 rolün TAMAMI → 500)
```

**Dokuz rolün tamamında 500**, yani yetkiyle ilgili değil — handler'ın kendisinde bir
hata var. İlgili kod `server/routes/reports.ts:220-230`: KDV raporu satır satır
`inv.items` ve `item.vatRate` / `item.lineTotal` / `item.vatAmount` üzerinde dönüyor.
`items` dizisi olmayan bir fatura kaydı veya `vatRate` alanı eksik/eski bir kayıt
`TypeError` üretir → 500.

Bu **KDV raporu** olduğu için CLAUDE.md'deki "muhasebe/KDV mantığı dokunulmaz"
kuralı kapsamına girer. Bu yüzden **tek taraflı düzeltmedim**; kök neden (hangi kayıt
şekli patlatıyor) netleştirilip onayınıza sunulacak.

**Not:** Suite bu uçları FAIL değil uyarı olarak sayıyor, dolayısıyla koşu sonucunu
etkilemiyor — ama gerçek bir kullanıcı KDV raporu açamıyor demektir. Öncelikli kalem.

---

## 4. Diğer gözlemler

- **Fixture onarımı artık `PASS`:** `FIXTURE-OK 6 seed kullanıcısının tamamı DB'de
  mevcut (53 kayıtlı kullanıcı)`. Koşu #2'de onarım gerekmişti, koşu #3'te gerekmedi —
  yani `users` seed kaybı tekrarlamadı. (Kalıcı `loadDatabase()` koruması önerisi yine
  açık, çünkü mekanizma hâlâ korumasız.)
- **Rate-limit sapması görünür:** Sunucu #2 oturumu `LOGIN_RATE_LIMIT_MAX=500` ile
  başlatıldı ve raporda `WARN` olarak listelendi. Sunucu #1'in kanıtı hâlâ varsayılan 20
  ile (401×20 → 429 tam 21. istekte). Sapma amacına ulaştı: runtime authz artık
  429'a takılmadan 4.348 kontrol koştu.
- **`RATE-002 webhook`** `401 x 59, 429 x 2; ilk 429 = 60. istek` → beklendiği gibi.
- **`git status`** hâlâ `SKIP` (doğrulama ortamında git yok).
- **`npx tsc -b` → 0 hata** (koşu #2'de ayrıca koşulmuştu; script'in parçası değil).

---

## 5. Sıradaki adım (koşu #4)

1. Bu raporda uygulanan üç düzeltmenin etkisi görülmeli:
   - smoke → **FAIL=0** (benzersiz adlar)
   - runtime authz → Grup A (48) ve Grup C (7) **kaybolmalı**; Grup B (8) SKIP'e dönmeli.
   - Beklenen runtime authz: `FAIL=0`, SKIP artışı normal (1595 + ~15).
2. `authz-matrix.json`'da `tenants.ts` girdisi `role (dosya-genel: SUPER_ADMIN, ADMIN)`
   ve 8 rol `DENY` olmalı — bu, jeneratör düzeltmesinin doğrudan kanıtıdır.
3. **`vat-report` 500** için kök neden çıkarılıp onaya sunulacak.
4. Onay bekleyenler: XFF bypass (`docs/26` §4), `loadDatabase()` users seed koruması,
   FAZ 25.4 #4/#6.

**Hiçbir faz, FAIL=0 kanıtı oluşmadan ✅ yapılmayacaktır.**
