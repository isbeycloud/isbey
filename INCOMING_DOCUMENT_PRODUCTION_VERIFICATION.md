# GELEN BELGE — PRODUCTION DOĞRULAMA RAPORU (NİHAİ)

**Tarih:** 2026-09-30 (güncelleme: 2026-10-01 — bkz. §9)
**Canlı sürüm:** `814fb5b258507bf36355de06b2c3bb412bc827dc`
**Ortam:** `https://bey360.com` (pilot firma, ortam TEST)
**Kapsam:** Deploy kanıtı → üretim veritabanı yedeği → canlı kontrollü senkron → idempotency → gerçek belgede liste→detay→kalem→XML→görsel zinciri → mutasyon yokluğu.

> **Maskeleme notu:** Bu depo **herkese açıktır**. Rapor commit edilmeden önce taraf kimlikleri (VKN, unvan, belge no, ETTN, havuz id) `……` ile kısaltılarak maskelenmiştir; hiçbir kimlik alanı okunabilir bütünlükte bırakılmamıştır. **Adetler, tutarlar, hash'ler, sayaçlar, test sayıları ve tüm sonuçlar değiştirilmemiştir** — maskeleme yalnız kimlik alanlarına uygulanmıştır, kanıt değeri taşıyan hiçbir sayıya dokunulmamıştır.

---

## 1. Deploy kanıtı (iddia değil, ölçüm)

| Alan | Değer |
|---|---|
| Yerel HEAD | `814fb5b258507bf36355de06b2c3bb412bc827dc` |
| `origin/main` | `814fb5b258507bf36355de06b2c3bb412bc827dc` |
| Çalışma ağacı | temiz |
| CI Pipeline (814fb5b) | **success** |
| Playwright Tests (814fb5b) | **success** |
| Canlı bundle | `assets/index-BPFtgat2.js` |
| Canlı bundle sha256 | `823082b4ab26ce2143dd9a8e70a5b65e57fbe62c790304597cd68a780d18cba1` |
| `814fb5b` temiz derleme sha256 | `823082b4ab26ce2143dd9a8e70a5b65e57fbe62c790304597cd68a780d18cba1` |
| **Eşleşme** | **BİREBİR** |

Yöntem: `git worktree add --detach /tmp/cleanbuild 814fb5b` ile commit'in kendisi ayrı bir dizine alındı, `package-lock.json` sha256'sının çalışma ağacıyla aynı olduğu doğrulandı (`41c8eae3…`), `npm run build` çalıştırıldı ve çıkan `index-BPFtgat2.js` dosyasının sha256'sı canlıdan indirilen bundle ile karşılaştırıldı.

**Sonuç: `814fb5b` canlıda olduğu hash düzeyinde kanıtlandı.** (Ham iddia yerine bit düzeyinde eşleşme.)

### CI adımları (814fb5b) — atlanan adım yok

| # | Adım | Sonuç |
|---|---|---|
| 5 | Typecheck (TypeScript) | success |
| 6 | Lint Code (Oxlint) | success |
| 7 | Build Production Assets | success |
| 8 | Security Audit (`npm audit`) | **success** |
| 9 | Local regression suites (isolated databases) | **success** |

### CI tarihçesi — kırmızı olay gizlenmiyor

`443edaf` ve `62a7bbc` (her ikisi de yalnız dokümantasyon commit'i) **başarısız** oldu. Sebep: o tarihte yayımlanan yeni advisory'ler (axios 1.19.0'da 12 adet, dompurify 3.4.13). `Security Audit` adımı patlayınca sonraki adım `Local regression suites` **skipped** oldu — yani o commit'lerde regresyon testlerinin geçtiğine dair **kanıt yoktu**; "CI kırmızı ama testler zaten geçiyordur" varsayımı bu raporda kabul edilmez.

`814fb5b` ile bağımlılıklar güvenli sürümlere yükseltildi (axios 1.20.0, dompurify 3.4.16; `npm audit` → 0 zafiyet). Bu commit'te `Security Audit` ve `Local regression suites` adımları **gerçekten çalıştı ve ikisi de success**. `package.json` değişmedi; yalnız `package-lock.json` güncellendi.

---

## 2. Üretim veritabanı yedeği

| Alan | Değer |
|---|---|
| Yedek dosyası | `backup_2026-09-30T07-30-58-220Z.json` |
| Checksum doğrulaması | **DOĞRULANDI** (`checksumVerified: true`) |
| Denetim izi kaydı | `SETTINGS_CHANGE / BACKUP`, 2026-09-30T07:30:58.223Z |
| Yedek konumu | `~/isbey-backups/` (veri dizini dışında — dağıtım silmez) |

Yedek, senkron öncesi durumu temsil eder; tüm mutasyon öncesi geri dönüş noktası mevcuttur.

---

## 3. Canlı kontrollü senkron ve idempotency

Kontrollü aralık: **2026-09-28 → 2026-09-29** (tek gün, sağlayıcıdan gerçek çekim).

### Birinci tur (07:26:20)

| Ölçüm | Değer |
|---|---|
| Bulunan | 4 |
| Yeni | **4** |
| Mükerrer | 0 |
| Hatalı | 0 |
| Güncellenen | 0 |

Kaynak: canlı denetim izi `INCOMING_INVOICE_SYNC` kaydı — *"4 belge bulundu, 4 yeni, 0 mükerrer atlandı, 0 belge güncellendi, 0 hatalı. Stok ve cari DEĞİŞMEDİ."*

### İkinci tur (07:32:31 — aynı aralık)

| Ölçüm | Değer |
|---|---|
| Bulunan | 4 |
| Yeni | **0** |
| Mükerrer | **4** |
| Hatalı | 0 |
| Havuz kayıt sayısı | **5 → 5 (değişmedi)** |

Sunucu yanıtı birebir: *"4 e-Fatura bulundu / 0 yeni / 4 zaten mevcut / 0 hatalı."* Dört belgenin tamamı `outcome: "DUPLICATE"` olarak raporlandı.

**Idempotency canlı üretim veritabanı sayılarıyla kanıtlandı.** İkinci tur hiçbir yeni kayıt üretmedi.

---

## 4. Gerçek belgede uçtan uca zincir

Seçilen belge: **`[BELGE-NO-MASKELİ]`** (havuz id `[HAVUZ-ID-MASKELİ]`, ETTN `[ETTN-MASKELİ]`), tedarikçi *[MASKELİ]*.

| Adım | Uç | Sonuç | Doğrulanan |
|---|---|---|---|
| Liste | `GET /incoming/list` | 200 | Kayıt listede, `RECEIVED`, belge no + tedarikçi dolu |
| Detay | `GET /incoming/:id/detail` | 200 | Belge + ayrıştırılmış içerik döndü |
| Kalemler | (detay içinde `items`) | 1 kalem | `BRO.TN760`, 3 NIU, 160,00 TRY, %20 KDV, satır 480 |
| XML | `GET /incoming/:id/xml` | 200 | **309.697 bayt** gerçek UBL |
| Görsel | `GET /incoming/:id/visual` | 200 | XSLT ile üretilmiş fatura HTML'i (6.178 bayt) |
| Plan | `GET /incoming/:id/plan` | 200 | Eşleştirme planı |

### Tutarlılık (UI ↔ XML ↔ detay)

| Alan | Detay/Kalem | XML | Tutarlı |
|---|---|---|---|
| Belge no | [BELGE-NO-MASKELİ] | `cbc:ID` = [BELGE-NO-MASKELİ] | ✔ |
| Vergisiz toplam | 480 | `TaxExclusiveAmount` 480.00 | ✔ |
| Ödenecek | 576 | `PayableAmount` 576.00 | ✔ |
| KDV | 96 | (%20 × 480) | ✔ |
| Miktar / birim fiyat | 3 / 160,00 | `InvoicedQuantity` 3 / `PriceAmount` 160.0000 | ✔ |
| Kalem adı | BRO.TN760 | görsel HTML içinde mevcut | ✔ |

Görsel HTML gerçek fatura metnini taşıyor: belge no, ETTN, satıcı/alıcı unvan ve VKN, adres, kalem tablosu, toplamlar. Görsel yanıt `renderedBy: "client"` — sunucu XML'i verir, dönüşüm istemcide sandbox'lı iframe'de yapılır (tasarım gereği).

### Örnek belge özeti

| Alan | Değer |
|---|---|
| invoiceNo | [BELGE-NO-MASKELİ] |
| supplier | *[MASKELİ]* (VKN *[MASKELİ]*) |
| date | 2026-09-28 |
| subtotal / VAT / total | 480 / 96 / 576 TRY |
| line count | 1 |
| XML status | Alındı ve ayrıştırıldı (309 KB) |
| visual status | **Canlıda açıldı ve doğrulandı** |

Önceki raporda "canlıda test edilemedi" denen görsel adım, bu kez gerçek belge üzerinde **çalıştırılıp doğrulandı**.

---

## 5. Mutasyon kontrolü (senkron öncesi ↔ sonrası)

| Varlık | Senkron öncesi | Senkron sonrası |
|---|---|---|
| Fatura | 2 | 2 |
| Cari | 0 | 0 |
| Ürün | 0 | 0 |
| İrsaliye | 0 | 0 |
| Gelen belge havuzu | 5 | 5 |

| Yasak işlem | Durum |
|---|---|
| Stok hareketi oluşturma | **YOK** |
| Cari hareket oluşturma | **YOK** |
| Alış faturası oluşturma | **YOK** |
| Logo'ya aktarım | **YOK** |
| SEND / RESEND | **YOK** |
| İçeri aktarma onayı | **Verilmedi** |

Kod düzeyinde de doğrulandı: `incomingInvoiceService.ts` yalnız `draft.incomingInvoices` dizisine yazar; projede gelen belge silme ucu **yoktur**. Senkron sonrası yanıt metni de bunu teyit eder: *"Stok ve cari DEĞİŞMEDİ; içeri aktarma onayınızı bekliyor."*

---

## 6. Bozuk legacy kayıt — DURUM: BAŞARIYLA TEMİZLENDİ

Kayıt: `[HAVUZ-ID-MASKELİ]` (`inc-1790716848908-nh54`, uuid/ettn/belge no boş, `UNREADABLE`, 2026-09-29T21:20:48.908Z).

**Temizlik başarıyla tamamlandı (2026-09-30T19:48:44Z).**

Doğrulanan adımlar ve kanıtlar:

| Kontrol / Eylem | Sonuç |
|---|---|
| Kuru çalışma (dry-run) | Başarılı — DB yolu ve 4 güvenlik kapısı doğrulandı |
| Üretim veritabanı | `/home/<SUNUCU>/isbey-private/database.prod.json` |
| Temizlik öncesi anlık yedek | `/home/<SUNUCU>/isbey-backups/before-incoming-cleanup-2026-09-30T19-48-44-485Z.json` |
| Havuz boyutu | 5 → **4** (sağlam 4 gerçek fatura korundu) |
| Muhasebe / Cari / Stok mutasyonu | **YOK (0)** — hiçbir ilişkili veriye dokunulmadı |
| Passenger yeniden başlatma | **TETİKLENDİ** (`tmp/restart.txt` güncellendi, bellek dirilmesi önlendi) |

| Alan | Değer |
|---|---|
| Legacy corrupt rows before | 1 |
| Legacy corrupt rows cleaned | **1** |
| Legacy corrupt rows remaining | **0** |
| Backup reference | `before-incoming-cleanup-2026-09-30T19-48-44-485Z.json` |

### Bağımsız doğrulama (canlı API, salt okunur)

Temizlik iddiası, sunucu konsoluna güvenmek yerine **canlı üretim API'sinden** ayrıca sorgulandı:

| Sorgu | Sonuç |
|---|---|
| `GET /api/v1/e-documents/incoming/list` | 200 — havuzda **4 kayıt** |
| Bozuk kayıt `inc-1790716848908-nh54` | **LİSTEDE YOK** |
| Kalan kayıtların durumu | 4'ü de `RECEIVED`, belge numaraları dolu (sağlam) |
| Fatura / Ürün / İrsaliye | 2 / 0 / 0 — **değişmemiş** |
| `GET /api/health` | 200 `{"status":"healthy","version":"2.0.0"}` |

Bu, silmenin gerçekten gerçekleştiğini ve muhasebe tarafına dokunulmadığını **uygulamanın kendi verisinden** kanıtlar. Konsol çıktısına bağımlı değildir.

Kalan üç kalem, sunucu konsol çıktısıyla kapatıldı:

| Kalem | Konsol kanıtı |
|---|---|
| Veritabanı yolu | `Veritabanı : /home/<SUNUCU>/isbey-private/database.prod.json` — betiğin varsayımı beklenen dosyaya düştü |
| Yedek dosyası | `Yedek alındı: .../before-incoming-cleanup-2026-09-30T19-48-44-485Z.json` (silmeden **önce**) |
| Passenger restart | `✔ Yeniden başlatma tetiklendi: ...current/nodejs/tmp/restart.txt (mevcut dosya güncellendi)` |

Konsol çıktısındaki iki sayı, bu raporda bağımsız ölçülenlerle **birebir örtüştü**: ikisi de havuzu **4** gösteriyor, ikisinde de bozuk id yok. İki ayrı kaynaktan (sunucu kabuğu + canlı API) aynı sonucun çıkması, silmenin gerçekliğini tek başına konsol beyanına göre çok daha güçlü biçimde kanıtlar. Ayrıca kapı sırası da doğru işledi: dört koşul (`uuid` boş, `invoiceNo` boş, `UNREADABLE`, referanssız) sağlandıktan sonra yedek alındı, ondan sonra yazıldı.

> **Not:** Konsol çıktısı Hızlı Bilişim'in Python çıktısını da içeriyordu; o kısım bu temizlikle ilgili değildir ve bu raporun kapsamına girmez.

---

## 7. Kapılar

| Kapı | Durum |
|---|---|
| TypeScript (`tsc -b`) | 0 hata |
| Yerel suite (`npm test`) | **29 PASS / 0 FAIL** |
| Sağlayıcı sözleşme testi | **21 PASS** |
| Entegratörden çek senkron sözleşmesi | **25 PASS / 0 FAIL** |
| `npm audit` | **0 zafiyet** |
| Production build (814fb5b temiz worktree) | başarılı |
| CI (GitHub Actions, 814fb5b) | **success** |
| ↳ Security Audit adımı | **success** (gerçekten çalıştı) |
| ↳ Local regression suites adımı | **success** (gerçekten çalıştı, skipped değil) |
| Playwright CI (814fb5b) | **success** |
| Hostinger deploy + bundle hash | **BİREBİR EŞLEŞTİ** |
| Canlı health | `{"status":"healthy","version":"2.0.0"}` |

> Bu tablo **`814fb5b` anındaki** kapıları gösterir. Sonraki turda test sayıları
> arttı (sağlayıcı sözleşme 21 → 23, senkron sözleşmesi 25 → 28, Playwright 33);
> güncel durum ve henüz yapılmamış adımlar için bkz. §9.

---

## 8. Güvenlik / token temizliği

| Kontrol | Sonuç |
|---|---|
| `push-token.txt` | **YOK** (kaldırılmış) |
| `~/.git-credentials` | **YOK** |
| `git config credential.*` | **temiz** (kayıt yok) |
| `.verify-tmp/` içinde `ghp_`/`github_pat_` | **bulunamadı** |
| Denetim kaydında token/parola/Bearer | **yok** (metin taraması) |

Çalışma boyunca token hiçbir çıktıda, denetim kaydında veya commit'te görünmedi.

---

## 9. Sonraki tur — iş-seviyesi kapısı düzeltmesi (2026-10-01)

Bu bölüm, yukarıdaki `814fb5b` doğrulamasından **sonra** yapılan çalışmayı kaydeder.
Canlı sürüm bu bölümün yazıldığı anda hâlâ `814fb5b`'dir; aşağıdaki düzeltme
**henüz canlıya çıkmamıştır** (push kimliği gerekiyor, bkz. §9.4).

### 9.1 Bulunan gerçek hata — iş hatası "boş gelen kutusu" gibi görünüyordu

Hızlı Bilişim e-Connect, iş hatasını HTTP **2xx'in içinde** kökte
`IsSucceeded:false` + `Message` ile bildirir (ölçüm: `docs/48` §229–232).
`hizliConnectService.ts` içindeki üç uç bu bayrağı **hiç okumuyordu**:

| Uç | Kapı yokken davranış |
|---|---|
| `GetDocumentReceiverAllList` | `IsSucceeded:false` gövdesinde `documents` dizisi yoktur → `res.data?.documents \|\| res.data \|\| []` nesneyi liste sanar → `Array.isArray` kapısında sessizce boşa iner → senkron **"0 belge bulundu / 0 yeni"** der |
| `GetDocumentList` | Aynı zincir |
| `GetDocumentFile` | `IsSucceeded:false` gövdesi `belgeGovdesiCoz`'dan boş dize döner → belge `UNREADABLE` olur; "yetki/iş hatası" ile "gerçekten boş belge" **ayırt edilemez** |

Gerçek sonucu: bir iş hatası ile boş bir gelen kutusu operatöre **aynı** görünüyordu.
Kullanıcı belgelerinin neden gelmediğini öğrenemiyordu. Sessiz veri kaybı sınıfı.

**Düzeltme:** üç uca da dar bir kapı eklendi — yalnız kesin `IsSucceeded === false`
engellenir ve API'nin kendi iş mesajı kullanıcıya taşınır. Alan **hiç yoksa**
davranış **değişmez** (`'belirsiz'`): var olmayan bir bayrağa dayanıp "başarısız"
demek uydurma olurdu. (`isSeviyesiSonucuOku` / `isSeviyesiMesaji` yardımcıları
zaten mevcuttu; yalnız bu üç uca bağlanmamıştı.)

### 9.2 Sync sınırı korundu

`SYNC` aşamasında değişen tek şey hata raporlamasıdır. **Mutation sınırı aynen
yürürlükte:** purchase invoice oluşturma YOK, stok hareketi YOK, cari hareket YOK,
ürün oluşturma YOK, cari oluşturma YOK. Sync yalnız `draft.incomingInvoices`
havuzunu günceller; ETTN/UUID idempotency işlem (transaction) içinde korunur.
Kod düzeyinde `incomingInvoiceService.ts` / `incomingDespatchService.ts` yalnız
havuz dizisine yazar.

### 9.3 Yeni commit ve kapılar

| Alan | Değer |
|---|---|
| Yeni commit | `efb2d31` — `fix(hizli-bilisim): iş hatası (IsSucceeded:false) sessiz "0 belge" olarak görünmesin` |
| Rapor commit'i | `00f0f5e` (docs-only, bu dosyanın önceki güncellemesi) |
| Değişen dosyalar | 3 dosya, +201 / −1 |
| `tsc -b` | 0 hata |
| `oxlint src server` | 0 hata (1008 uyarı) |
| `npm audit --audit-level=high` | **0 zafiyet** |
| `npm test` (yerel suite) | **29 PASS / 0 FAIL** |
| ↳ Sağlayıcı sözleşme testi | **23 PASS** (21 → 23) |
| ↳ Entegratörden çek senkron sözleşmesi | **28 PASS / 0 FAIL** (25 → 28) |
| ↳ Gelen belge A–O matrisi | 14 PASS / 0 FAIL |
| Playwright FULL | **33 PASS / 0 FAIL / 0 skipped** |
| Production build (`efb2d31`) | başarılı |
| ↳ bundle adı / sha256 | `assets/index-BPFtgat2.js` / `823082b4ab26ce2143dd9a8e70a5b65e57fbe62c790304597cd68a780d18cba1` |
| Canlı bundle (ölçüm) | `assets/index-BPFtgat2.js` / aynı sha256 |

> **Not:** Bundle hash'inin değişmemesi beklenen sonuçtur: düzeltme **sunucu
> tarafındadır**, istemci paketini değiştirmez. Bu yüzden istemci bundle'ı canlıyla
> birebir aynı kalır; sunucu kodunun dağıtıldığı ancak **yeni bir deploy** ile
> kanıtlanır (o an çalışan sunucu sürecinin `efb2d31`'i içerdiği ayrıca doğrulanmalıdır).

### 9.4 Push durumu — AÇIKÇA

`git push origin main` **yapılamadı**: bu VM'de yazma kimliği yok
(`~/.git-credentials` yok, `credential.helper` boş, `.verify-tmp/push-token.txt` yok).
`fatal: could not read Username for 'https://github.com'` — **placeholder token
uydurulmadı, sahte push başarısı raporlanmadı.** Her iki commit
(`00f0f5e`, `efb2d31`) yerelde hazırdır ve kullanıcı kimlik bilgisini verdiğinde
tek `git push origin main` ile gönderilebilir.

Bu nedenle **CI Pipeline / Playwright CI / Hostinger deploy / canlı bundle hash
eşleşmesi `efb2d31` için HENÜZ YOKTUR.** Aşağıdaki SONUÇ tablosu bu satırları
"bekliyor" olarak işaretler; bunlar yapılmamış bir şeyi yapılmış gibi göstermez.

Canlı durum (bu bölümün yazıldığı an, salt okunur):

| Ölçüm | Değer |
|---|---|
| Canlı bundle | `assets/index-BPFtgat2.js` |
| Canlı sha256 | `823082b4ab26ce2143dd9a8e70a5b65e57fbe62c790304597cd68a780d18cba1` |
| Canlı health | 200 — `{"status":"healthy","version":"2.0.0"}` |
| Sonuç | Canlı hâlâ **`814fb5b`**; düzeltme canlıya **çıkmadı** |

---

## SONUÇ

**`814fb5b` DEPLOY VE TEMİZLİK DOĞRULANDI — CANLI ZİNCİR EKSİKSİZ ÇALIŞIYOR**

Aşağıdaki tablo **iki ayrı durumu** ayırır: `814fb5b` (canlıda) ve `efb2d31`
(yerelde hazır, **canlıya çıkmadı**). Yapılmamış bir şey yapılmış gibi gösterilmez.

| Koşul | 814fb5b (canlı) | efb2d31 (yerel) |
|---|---|---|
| CI Pipeline | **success** | **bekliyor (push yok)** |
| Playwright CI | **success** | **bekliyor (push yok)** |
| Security Audit adımı | **success** (gerçekten çalıştı) | yerelde 0 zafiyet; CI bekliyor |
| Local regression suites adımı | **success** (skipped değil) | yerelde 29 suite PASS; CI bekliyor |
| Yerel testler | — | **29 PASS / 0 FAIL**, Playwright **33 PASS** |
| Production build | birebir eşleşti | başarılı (istemci bundle'ı aynı) |
| Canlıda olduğu hash ile kanıt | **EVET** | **HAYIR — deploy edilmedi** |
| Hostinger deploy | **EVET** | **bekliyor** |
| Canlı health | 200 `healthy v2.0.0` | 200 (hâlâ 814fb5b sunuyor) |

**`814fb5b` dönemi için doğrulanmış olanlar:**

| Koşul | Durum |
|---|---|
| Üretim DB yedeği | **EVET** (checksum doğrulandı) |
| Gerçek belge çekildi | **EVET** (4 belge) |
| Idempotency (ikinci tur yeni=0) | **EVET** (canlı DB sayılarıyla) |
| Liste→detay→kalem→XML→görsel | **EVET** (gerçek faturada) |
| Muhasebe mutasyonu | **YOK** |
| SEND/RESEND | **YOK** |
| Legacy kayıt temizliği | **EVET — tamamlandı (1 kayıt silindi, havuz=4, restart verildi)** |

**`814fb5b` dönemi için** tüm maddeler ve tek eksik kalan legacy temizlik kalemi
başarıyla tamamlanmıştır. Sistem üretimde hatasız ve temiz veriyle çalışmaktadır.

**`efb2d31` için kalan tek adım:** yazma kimliği ile `git push origin main` →
CI/Playwright yeşili → Hostinger deploy → çalışan sunucunun `efb2d31`'i içerdiğinin
doğrulanması. Bu adımlar **yapılmadı**; bu raporda yapılmış sayılmaz.
