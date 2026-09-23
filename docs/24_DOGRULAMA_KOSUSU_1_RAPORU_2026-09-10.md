# İŞBEY — Doğrulama Koşusu #1 Raporu (2026-09-10)

**Koşuyu yapan:** Google Antigravity · **Analiz/düzeltme:** Claude (Opus-5)
**Komut:** `powershell -ExecutionPolicy Bypass -File tools\dogrulama.ps1`
**Makine:** BEYOGLU · Node v24.14.1 · Port 4000
**Ham rapor:** `.verify-tmp\dogrulama-raporu.txt`

## Sonuç: PASS=32 · FAIL=7 · SKIP=4

Kritik kural gereği bu koşuda **hiçbir faz ✅ ilan edilmedi**. Aşağıda 7 FAIL'in tamamı kök nedene indirildi; üçü gerçek hata/eksik, ikisi doğrulama paketinin kendi hatası, biri test hatası, biri de yanlış-FAIL.

---

## 1. Kök neden: seed kullanıcıları DB'de yok (4 FAIL'in tek sebebi)

`firmaadmin` (usr-4), `rapor` (usr-5) ve `pasifkullanici` (usr-6) `data/database.json`'da **hiç yok**.

**Kanıt:** Koşu öncesi alınan yedekte (`database.once-20260910-183147.json`) ve `data/backups/` içindeki **en eski yedekte (2026-08-20)** de `usr-4` yok. Yani eksiklik bu koşudan önce oluşmuş ve **en az 3 haftadır** sürüyor. Audit log'da koşuya ait "Başarısız giriş denemesi: firmaadmin" kayıtları var — bunlar suitlerin başarısız denemeleri.

**Mekanizma:** `server/db/storage.ts` → `loadDatabase()` çoğu koleksiyon için `parsed.x.length > 0 ? parsed.x : initialDatabaseState.x` koruması taşır; **`users` için bu koruma yoktur** — `...parsed` doğrudan kazanır. Dolayısıyla seed kullanıcısı bir kez silinirse (ör. bir oturumda `DELETE /api/users/:id` çağrıldıysa) bir daha geri gelmez.

**Zincirleme etki:**
- `faz252aAuthorizationTest` → PASS=9 FAIL=10 (firmaadmin token'ı `undefined`)
- `faz25IzolasyonTest` → PASS=3 FAIL=4 (aynı sebep)
- `faz25SecurityGateTest` → 3 FAIL (2× firmaadmin, 1× pasifkullanici)
- `faz252dRuntimeAuthzSuite` → "Login başarısız (firmaadmin): HTTP 401" ile baştan durdu

**Bulunan yan bulgu:** Security gate'teki `pasif kullanıcı mobil login → 401 (403 beklenir)` kalemi **gerçek bir davranış hatası değil**. `mobile.ts:60-67` sıralaması doğrudur: önce kullanıcı+şifre (401), sonra `!user.active` (403). Kullanıcı DB'de olmadığı için 401 döndü. Kullanıcı geri eklendiğinde bu kalem 403 beklediği gibi geçecektir.

**Düzeltme:** `tools/ensure-test-fixtures.mjs` (YENİ) — seed'deki kullanıcılardan DB'de bulunmayanları (id VE username kontrolü) idempotent biçimde geri ekler. Üretimde çalışmaz (`NODE_ENV=production` → durur), yazmadan önce `.verify-tmp/` altına kopya bırakır, yazma kalıbı uygulamayla aynıdır (`JSON.stringify(x, null, 2)` + temp + `renameSync`). Doğrulama scriptine **sunucu #2 açılmadan önce** bağlandı (sunucu DB'yi boot'ta belleğe alıyor).

**Kalıcı çözüm önerisi (ayrı kalem, henüz uygulanmadı):** `loadDatabase()`'a `users` için de "seed'den doldur" koruması eklemek. Riskli olduğu için (üretimde kasıtlı silinmiş kullanıcıyı diriltebilir) onaya bırakıldı.

---

## 2. Gerçek kod hatası: `modulePermissions.ts`'te geçersiz rol etiketi

`src/utils/modulePermissions.ts` `cari` satırında `'employee'` etiketi duruyordu. `canAccessModule` matristeki değeri **doğrudan platform rolüyle** karşılaştırır (`rule.includes(userRole)`); `'employee'` bir tenant slug'ıdır, platform rolü değildir → **ölü kayıt**. Sonuç: PERSONEL rolü `cari` modülünü göremiyordu.

**Önemli:** `docs/18`, bu düzeltmenin yapıldığını (`'employee'` → `'PERSONEL'`) yazıyordu; ancak dosyada düzeltme **yoktu**. Ya uygulanmadı ya da sonradan geri geldi. (Not: aşağıdaki 3. maddedeki test körlüğü bu hatanın neden yakalanmadığını açıklıyor.)

**Düzeltme uygulandı:** `'employee'` → `'PERSONEL'` + nedenini açıklayan yorum satırı.

---

## 3. Test hatası: hizalama testi matrisin yarısını görmüyordu

`server/tests/faz252dFrontendMatrixAlignmentTest.mjs:58` deseni:

```js
const entryRe = /'([a-z0-9-]+)'\s*:\s*(\[[^\]]*\]|'ALL')/g;
```

Bu desen **yalnızca tırnaklı anahtarları** yakalar. `MODULE_ACCESS_MATRIX`'te yalnızca tire içeren anahtarlar tırnaklıdır; `cari`, `stok`, `dashboard`, `edonusum` gibi ~37 modül tırnaksızdır ve **hiç taranmıyordu**. Matriste tam olarak 23 tırnaklı anahtar var — testin bildirdiği "23 modül" sayısı bu yüzdendir.

**İki yönlü hasar:**
- **Yanlış FAIL:** "modül sayısı 23 (≥40 beklenir)" — gerçek sayı ~57.
- **Tehlikelisi — sahte PASS:** tırnaksız satırlardaki geçersiz rol etiketleri kör noktada kaldığı için "0 bilinmeyen rol" sonucu güvenilmezdi. `'employee'` hatası tam da bu yüzden görünmedi. Aynı şekilde `edonusum` / `edonusummerkezi` için çalıştırılan finansal-izolasyon kontrolü boş string üzerinde geçiyordu (anlamsız PASS).

**Düzeltme uygulandı:** satır bazlı, iki biçimi de kabul eden desen:

```js
const entryRe = /^\s*(?:'([a-z0-9-]+)'|([a-z0-9-]+))\s*:\s*(\[[^\]]*\]|'ALL')\s*,?\s*$/;
for (const satir of matrixBlock.split('\n')) {
  const m = entryRe.exec(satir);
  if (m) entries[m[1] || m[2]] = m[3];
}
```

Düzeltme sonrası: sayım ~57 (≥40 → PASS), tüm roller geçerli, `edonusum`/`edonusummerkezi` kontrolleri artık gerçekten çalışıyor.

---

## 4. Doğrulama paketinin kendi hataları (2 FAIL, testlerle ilgisiz)

**(a) `.env` yalnızca 3 anahtar okundu → `HIZLI_BILISIM_IS_TEST_MODE` boş göründü.**
Rapor "3 anahtar tanımlı" dedi; oysa dosyada 15 anahtar var ve satır 11'de `HIZLI_BILISIM_IS_TEST_MODE=true` yazıyor. Sebep: `Get-Content` ile satır satır okuma; dosyada karışık satır sonu (CR / LF) kullanımı var ve CR ile biten blok tek satır gibi okunup regex'in satır başı yakalamasını bozuyor (6–19 arasındaki `HIZLI_BILISIM_*` bloğu hiç eşleşmedi; yalnız satır 22/26/28 eşleşti).
**Düzeltme:** dosya ham olarak okunur (`[System.IO.File]::ReadAllText`), `\r\n` ve `\r` normalize edilir, sonra bölünür. Bu, BOM ve karışık satır sonu sorunlarının ikisini de çözer.

**(b) Süreç exit kodu boş döndü → jeneratör yanlış FAIL.**
`faz252dAuthzMatrixGenerator` aslında **başarılıydı**: 89 dosya tarandı, 436 endpoint bulundu, bilinmeyen guard 0, matris yazıldı — ham çıktı bunu kanıtlıyor. Ancak `$proc.ExitCode` boş döndüğü için script exit kodu 0 göremedi ve FAIL yazdı.
**Düzeltme:** `WaitForExit()` + `Refresh()` ile exit kodu kesinleştirilir; kod yine okunamazsa çıktıdaki başarı işareti aranır ve karar **"çıktıya dayalı"** olarak açıkça etiketlenir (sessiz varsayım yapılmaz). Jeneratör için `Bulunan endpoint : N` deseni kullanılıyor.

---

## 5. Yanlış alarm olduğu doğrulanan kalem

**Webhook rate limit "ilk 429 = 60. istek" (beklenen 61).** Bu bir hata değil, doğru davranışın kanıtı: aynı limiter kovasına bölüm 6'daki security gate suitinden **1 istek** zaten gitmişti (imzasız webhook → 401 kalemi). 1 + 59 = 60 → döngünün 60. isteği aslında 61. istekti. Yani limiter tam olarak 60/60'ta bloklamaya başladı. **Düzeltilmemeli.**

---

## 6. Temiz çıkan kalemler (kanıtlı)

| Kalem | Sonuç |
|-------|-------|
| Login rate limit | 20×401 ardından tam 21. istekte 429 — kanıt dizisi raporda |
| Güvenlik başlıkları | nosniff / DENY / no-referrer / X-XSS-Protection 0 |
| CORS | allowlist tanımsız → mevcut açık davranış korunuyor (yabancı origin yansıdı) |
| Backup + checksum | HTTP 200, `checksumVerified=True`, sidecar CHECKSUM MATCH |
| Retention | 12 json ≤ 20 |
| Webhook fail-closed | 59×401 imzasız istek reddedildi |
| Statik secret taraması (4 desen) | KODDA 0 eşleşme (`mock-valid-signature` yalnız yorumda) |
| 25.2-C tenant sourcing | 11 PASS / 0 FAIL |
| 25.2-B registry | 31 PASS / 0 FAIL |
| Bilanço denkliği | 15 kontrol, Fark = 0,00 TL |
| 3 aylık simülasyon | 9 kontrol, FAIL 0 |
| 25.2-D #1 jeneratör | 436 endpoint, bilinmeyen guard 0, exit 0 |

---

## 7. Sonraki adım

Düzeltmeler uygulandı; **yeniden koşu gerekir.** Beklenen: firmaadmin/rapor/pasifkullanici geri geldiğinde faz252a, izolasyon, security gate ve runtime authz suitlerinin PASS'a dönmesi; hizalama testinin 20/20 olması; script kaynaklı 2 FAIL'in kaybolması.

Yeniden koşuda hâlâ FAIL çıkan kalem olursa bunlar gerçek bulgu sayılır ve tek tek ele alınır. Hiçbir faz, FAIL=0 kanıtı görülmeden ✅ yapılmayacaktır.

---

## 8. Bu koşuda değişen dosyalar

| Dosya | Değişiklik |
|-------|-----------|
| `src/utils/modulePermissions.ts` | `cari` satırı: `'employee'` → `'PERSONEL'` + açıklama yorumu |
| `server/tests/faz252dFrontendMatrixAlignmentTest.mjs` | Matris parse deseni: tırnaksız anahtarlar da okunur (satır bazlı) |
| `tools/ensure-test-fixtures.mjs` | YENİ — seed kullanıcılarını idempotent onarır (üretimde çalışmaz) |
| `tools/dogrulama.ps1` | `.env` parse düzeltmesi (ham okuma + satır sonu normalizasyonu); exit kodu kesinleştirme + çıktıya dayalı karar; fixture onarım adımı (sunucu #2'den önce) |
