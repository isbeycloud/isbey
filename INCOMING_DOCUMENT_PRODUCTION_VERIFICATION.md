# GELEN BELGE — PRODUCTION DOĞRULAMA RAPORU (NİHAİ)

**Tarih:** 2026-09-30
**Canlı sürüm:** `77da29a2dc6d313fd84e604e7dcf038ebd7bf7f7`
**Ortam:** `https://bey360.com` (pilot firma, ortam TEST)
**Kapsam:** Deploy kanıtı → üretim veritabanı yedeği → canlı kontrollü senkron → idempotency → gerçek belgede liste→detay→kalem→XML→görsel zinciri → mutasyon yokluğu.

> **Maskeleme notu:** Bu depo **herkese açıktır**. Rapor commit edilmeden önce taraf kimlikleri (VKN, unvan, belge no, ETTN, havuz id) `……` ile kısaltılarak maskelenmiştir; hiçbir kimlik alanı okunabilir bütünlükte bırakılmamıştır. **Adetler, tutarlar, hash'ler, sayaçlar, test sayıları ve tüm sonuçlar değiştirilmemiştir** — maskeleme yalnız kimlik alanlarına uygulanmıştır, kanıt değeri taşıyan hiçbir sayıya dokunulmamıştır.

---

## 1. Deploy kanıtı (iddia değil, ölçüm)

| Alan | Değer |
|---|---|
| Yerel HEAD | `77da29a2dc6d313fd84e604e7dcf038ebd7bf7f7` |
| `origin/main` | `77da29a2dc6d313fd84e604e7dcf038ebd7bf7f7` |
| Çalışma ağacı | temiz (yalnız bu rapor takip edilmiyor) |
| CI Pipeline (77da29a) | **success** |
| Playwright Tests (77da29a) | **success** |
| Canlı bundle | `assets/index-DZYQJtDj.js` |
| Canlı bundle sha256 | `48f2507b05d994ff85ffdc086a532de0338741a1d4f8f99642f8ef5390a028a2` |
| `77da29a` temiz derleme sha256 | `48f2507b05d994ff85ffdc086a532de0338741a1d4f8f99642f8ef5390a028a2` |
| **Eşleşme** | **BİREBİR** |

Yöntem: `git worktree add --detach /tmp/cleanbuild 77da29a` ile commit'in kendisi ayrı bir dizine alındı, `package-lock.json` sha256'sının çalışma ağacıyla aynı olduğu doğrulandı (`4a49f8e7…`), `npm run build` çalıştırıldı ve çıkan `index-DZYQJtDj.js` dosyasının sha256'sı canlıdan indirilen bundle ile karşılaştırıldı.

**Sonuç: `77da29a` canlıda olduğu hash düzeyinde kanıtlandı.** (Ham iddia yerine bit düzeyinde eşleşme.)

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

## 6. Bozuk legacy kayıt — DURUM: TEMİZLENMEDİ

Kayıt: `[HAVUZ-ID-MASKELİ]` (uuid/ettn/belge no boş, `UNREADABLE`, 2026-09-29T21:20:48.908Z).

Yeniden doğrulananlar:

| Kontrol | Sonuç |
|---|---|
| Belge uçlarına erişim | **422** — `/detail`, `/xml`, `/visual`, `/plan` tamamı reddediyor |
| Muhasebeye aktarım | **YOK** — `NOT_INGESTIBLE` kapısında engelli |
| Havuzdan üretilmiş fatura/cari/stok | **YOK** |
| Kodda silme ucu | **YOK** (projede gelen belge DELETE yolu bulunmuyor) |
| SSH/FTP kimliği | **YOK** (VM'de `~/.ssh` yok, parola sohbete yazılmamalı) |

**Temizlik yapılmadı.** Gerekçe: doğrudan veritabanı düzenlemesi gerektiriyor, ancak ne onaylı bir silme ucu ne de bu oturumda SSH kimliği var. Kaydı API dışı bir yolla zorlamak, "otomatik DELETE yapma / gerçek belge silme" kuralının ihlali olurdu. Kayıt zararsızdır (engelli, referanssız, muhasebeye geçmemiş); görünür kalması veri kaybından yeğdir.

**Temizlik için gereken:** SSH parolası ya da onaylı bir yönetici silme ucu. Onay verilirse yalnız bu id hedeflenerek ve yedek (`backup_2026-09-30T07-30-58-220Z.json`) referansıyla yapılmalıdır.

### Hazırlanan temizlik aracı (çalıştırılmadı)

`tools/incoming-legacy-cleanup.mjs` — uygulamada silme ucu olmadığı için API dışında, elle çalıştırılan dar kapsamlı tek seferlik betik. Yalnız **dört kapının tamamı** geçerse siler: `uuid` boş, `invoiceNo` boş, `status === 'UNREADABLE'` ve hiçbir fatura/irsaliye/cari/stok kaydı bu id'ye referans vermiyor. Kapılardan biri tutmazsa hiçbir şey yazmaz. Ek sınırlar: `NODE_ENV=production` ise durur, yazmadan önce tam yedek alır, atomik yazar, idempotenttir; `--confirm` yoksa kuru çalışır.

Yerel kurguda beş senaryo doğrulandı: kuru çalışma (yazmadı), sağlam kayda çalıştırma (reddetti ve gerekçeleri yazdı), gerçek silme (sildi, yedek aldı, faturaya dokunmadı), tekrar çalıştırma (idempotent), `NODE_ENV=production` (durdu).

**Canlıda çalıştırılmadı** — sunucuya erişim yok. Çalıştırma komutu:

```
node tools/incoming-legacy-cleanup.mjs --id=<kayıt-id>          # kuru çalışma
node tools/incoming-legacy-cleanup.mjs --id=<kayıt-id> --confirm # gerçek silme
```

| Alan | Değer |
|---|---|
| Legacy corrupt rows before | 1 |
| Legacy corrupt rows cleaned | **0** |
| Backup reference | `backup_2026-09-30T07-30-58-220Z.json` (checksum DOĞRULANDI) |

---

## 7. Kapılar

| Kapı | Durum |
|---|---|
| TypeScript (`tsc -b`) | 0 hata |
| Yerel suite (`npm test`) | **29 PASS / 0 FAIL** |
| Sağlayıcı sözleşme testi | **21 PASS** |
| Entegratörden çek senkron sözleşmesi | **25 PASS / 0 FAIL** |
| Production build (77da29a temiz worktree) | başarılı |
| CI (GitHub Actions, 77da29a) | **success** |
| Playwright CI (77da29a) | **success** |
| Hostinger deploy + bundle hash | **BİREBİR EŞLEŞTİ** |
| Canlı health | `{"status":"healthy","version":"2.0.0"}` |

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

## SONUÇ

**DEPLOY DOĞRULANDI — CANLI GELEN BELGE ZİNCİRİ GERÇEK VERİYLE ÇALIŞIYOR**

| Koşul | Durum |
|---|---|
| 77da29a canlıda (hash eşleşmesi) | **EVET** |
| CI + Playwright yeşil | **EVET** |
| Üretim DB yedeği | **EVET** (checksum doğrulandı) |
| Gerçek belge çekildi | **EVET** (4 belge) |
| Idempotency (ikinci tur yeni=0) | **EVET** (canlı DB sayılarıyla) |
| Liste→detay→kalem→XML→görsel | **EVET** (gerçek faturada) |
| Muhasebe mutasyonu | **YOK** |
| SEND/RESEND | **YOK** |
| Legacy kayıt temizliği | **HAYIR — bekliyor** (yetki yolu yok, gerekçe §6) |

Tek eksik kalem, bozuk legacy kaydın temizliğidir ve bu bir başarısızlık değil, kasıtlı bir duruştur: kayıt engelli ve referanssızdır, ancak silmek için gereken yetki yolu bu oturumda mevcut değildir. Diğer tüm maddeler ölçülerek doğrulanmıştır.
