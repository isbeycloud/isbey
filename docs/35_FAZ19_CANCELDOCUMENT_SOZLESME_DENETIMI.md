# İŞBEY — FAZ 19: `CancelDocument` Sözleşme Denetimi

**Tarih:** 2026-09-15 · **Yöntem:** Depo geneli statik denetim + satıcı kaynağı araması · **Kod değişikliği:** YOK (yalnız bu rapor + testler)

> **Amaç:** Düzeltmeye geçmeden önce satıcı sözleşmesinin yeterliliğini kanıtlamak.
> Kullanıcı kuralı: *"Vendor sözleşmesinde olmayan endpoint veya parametre UYDURMA.
> Eğer sözleşme yeterli değilse bunu açıkça belirt ve implementasyonu durdur."*

---

## 1. SONUÇ

# ⛔ SÖZLEŞME YETERSİZ — ANA DÜZELTME DURDURULDU

Giden belge iptalini vendor'a bağlayan asıl düzeltme **yapılmadı**. Gerekçe §4'te:
gövde alan adları doğrulanamıyor ve `CancelDocument`'un yanıt sözleşmesi hakkında
**hiçbir** bağımsız kaynak yok. Uydurma endpoint/parametre yazmak yasak olduğu için
implementasyon durduruldu.

---

## 2. Sözleşme alanları — doğrulama durumu

| # | Alan | Durum | Kanıt |
|---|------|-------|-------|
| 1 | **HTTP method** | 🟡 Kısmen | Kod `POST` kullanır (`hizliConnectService.ts:399`). Satıcı kaynağı **YOK** — kod tahmini |
| 2 | **Endpoint** | 🟡 Kısmen | `/HizliApi/RestApi/CancelDocument`. Yol deseni diğer uçlarla tutarlı; **satıcı kaynağı YOK** |
| 3 | **Request body** | ❌ **DOĞRULANAMADI** | `{ uuid, cancelReason }` — `hizliTeknolojiProvider.ts:342`'de elle yazılmış, tip tanımı yok (`payload: any`), satıcı kaynağı **YOK** |
| 4 | **Belge kimliği** | ❌ **DOĞRULANAMADI** | Alan adının `uuid` mi `Uuid` mi `Ettn` mi olduğu bilinmiyor. Aynı API `CancelEArsivInvoice`'da **`Uuid`** (büyük U) kullanır — çelişki §4.1 |
| 5 | **ETTN / UUID kullanımı** | ❌ **DOĞRULANAMADI** | GİB'in hangi kimliği beklediği belgelenmemiş (ETTN mi, entegratör UUID'si mi) |
| 6 | **Auth** | ✅ **DOĞRULANDI** | `Authorization: Bearer <JWT>` (`:400`). Zincir: UtilEncrypt → Login → Bearer. Satıcı teyitli: 24h TTL (`docs/21` §7) |
| 7 | **Response formatı** | ❌ **YOK** | Kod içinde `CancelDocument` yanıt örneği **hiç yok** — ne gövdeli ne yorumlu |
| 8 | **`IsSucceeded` alanı** | ❌ **YOK** | `CancelDocument` yanıtında bu alanın bulunup bulunmadığı **bilinmiyor** |

---

## 3. Kanıt: ne var, ne yok

### 3.1 Kodda belgelenmiş GERÇEK yanıt örnekleri (tek somut kaynak)

| Servis | Kodda gerçek yanıt örneği | Satır |
|--------|---------------------------|-------|
| `UtilEncrypt` | ✅ **VAR** — `// Gerçek API yanıt formatı: { username, password, IsSucceeded, Message }` | `hizliConnectService.ts:61` |
| `Login` istek gövdesi | ✅ **VAR** — `{ "apiKey": "...", "username": "...", "password": "..." }`, "satıcı duyurusu" kaydıyla; üstelik *"CANLI ÇAĞRI ile doğrulanmamıştır"* notu düşülmüş | `:108-116` |
| `Login` yanıtı | ✅ **VAR** — `// Gerçek API yanıtı DİZİ döndürür: [{ Token: "eyJ...", IsSucceeded: true, ... }]` | `:120` |
| **`CancelDocument`** | ❌ **YOK** | — |
| `SendDocument` | ❌ **YOK** | — |
| `CancelEArsivInvoice` | ❌ **YOK** | — |

**Sonuç:** `IsSucceeded` bayrağının varlığı **yalnız** UtilEncrypt ve Login için
kanıtlıdır. `CancelDocument` için **bilinmiyor**.

### 3.2 Satıcı kaynakları — hepsi tükendi

| Kaynak | Durum | Denetim |
|--------|-------|---------|
| `docs/21` (satıcı Q&A) | ❌ İptalden söz etmiyor | `grep -ci "iptal"` → **0**, `grep -ci "cancel"` → **0**, `swagger` → **0** |
| `docs/02` (GİB entegrasyon rehberi) | ❌ İptalden söz etmiyor | `iptal` → **0**, `cancel` → **0** |
| Satıcı Swagger/OpenAPI dosyası | ❌ Repoda yok | `find` (swagger/openapi/pdf/bey360) → **eşleşme yok** |
| Satıcı PDF/DOCX/XLSX | ❌ API dokümanı yok | `tema/pdf/` yalnız şirket birleşme sözleşmeleri |
| `tools/ANTIGRAVITY-GOREV.md` | ❌ `CancelDocument` geçmiyor | — |
| Web: satıcı doküman sayfası | ❌ **Erişilemedi** | `https://econnect.hizliteknoloji.com.tr/Integrationdocuments` → *"not on the network allowlist"* (egress engeli) |
| Web: bağımsız arama | ❌ Sonuç yok | Yalnız ilgisiz ürünlerin `CancelDocument` API'leri |

**Satıcı Swagger'ı kod içinde yalnız BAŞKA uçlar için referans verilmiş** ve hep
"uç yok" tespiti amacıyla: `hizliBilisimClient.ts:41,451` (müşteri listesi),
`hizliConnectService.ts:905,941,993,1013` (cari/stok/dashboard/e-posta). **Bu
referanslar `CancelDocument` gövdesini kapsamaz.**

### 3.3 `CancelDocument` tek gerçek çağrı yolu

```
incomingInvoiceService.ts:227   (yalnız action === 'REJECTED', yalnız GELEN belge)
  → provider.cancelInvoice(incInvoice.uuid, reason, settings)   :337-351
    → HizliConnectService.cancelDocument({ uuid, cancelReason: reason }, token, isTest)   :342
      → POST ${baseUrl}/HizliApi/RestApi/CancelDocument   hizliConnectService.ts:399
```

Tek üretim çağrısı budur ve **gelen** belge içindir; giden akışla ilgisi yoktur.

---

## 4. Neden ana düzeltme durduruldu

### 4.1 Alan adı çelişkisi (somut kanıt)

Aynı API ailesinde aynı semantik alanlar **iki farklı harf kuralıyla** kullanılıyor:

| Uç | Alan adları | Kaynak |
|----|-------------|--------|
| `CancelEArsivInvoice` | `Uuid`, `CancelReason` (büyük U, büyük C) | `hizliConnectService.ts:377` |
| `CancelDocument` | `uuid`, `cancelReason` (küçük) | `hizliConnectService.ts:342` (çağıran) |

İkisinden biri yanlış. Hangisinin doğru olduğunu gösteren **hiçbir kaynak yok**.
Bu çelişki, `CancelDocument` gövdesinin doğrulanmamış olduğunun en somut kanıtıdır.

### 4.2 Giden e-Arşiv için doğru uç hangisi — belirsiz

Giden bir e-Arşiv faturası iptal edilirken:
- `CancelDocument` mı kullanılmalı (genel belge iptali), yoksa
- `CancelEArsivInvoice` mı (e-Arşiv'e özel, `GET`, yerel kayıt güncellemez)?

Satıcı bu ayrımı **belgelemiyor**. Yanlış seçim, üretimde sessiz tutarsızlık üretir.

### 4.3 Yanıt doğrulaması yazılamıyor (kural 5 ve 6 engelleniyor)

Kural 5 *"`IsSucceeded`, hata kodu, hata mesajı, belge durumu gibi alanları
sözleşmeye göre kontrol et"* diyor. Ancak `CancelDocument` yanıtının hangi alanları
taşıdığı **bilinmiyor** (§3.1). Sözleşme olmadan bu kontrolü yazmak, alan adı
uydurmak olurdu.

### 4.4 Kimlik kaynağı sorunu (kural 4)

Kural 4 `inv.id` yerine `eInvoiceUUID` kullanılmasını istiyor. Ancak:

| Konu | Ölçülen durum |
|------|---------------|
| `eInvoiceUUID` gerçek vendor yanıtından doluyor mu? | ✅ Evet, `efatura.ts:1364` (`sentUuid`), `:756-764`, `:1778` |
| Yerel uydurma değer yazılıyor mu? | ⚠️ **Evet** — `electronicDocumentService.ts:106` (`crypto.randomUUID()`), `routes/invoices.ts:288,425,479` (`` `urn:uuid:${invoiceId}-2026` ``) |
| Hangi değerin vendor tarafından kabul edildiği kanıtlı mı? | ❌ **Hayır** — gerçek yanıt görülmedi |

Yani `eInvoiceUUID` her zaman gerçek vendor kimliği **değildir**; bazı yollarda
yerel üretilmiş bir değerdir. Alanı değiştirmek, doğrulanmamış bir varsayıma
dayanırdı — kural 4 bunu açıkça yasaklıyor (*"yalnız vendor sözleşmesiyle
doğruladıktan sonra değiştir"*).

---

## 5. Sözleşmeyi kapatmak için gereken (satıcıdan veya sandbox'tan)

Aşağıdakilerden **biri** sağlanmadan düzeltme yazılamaz:

| # | Gereken | Nasıl elde edilir |
|---|---------|-------------------|
| S-1 | `CancelDocument` **istek gövdesi** alan adları (tam, harf duyarlı) | Satıcı Swagger'ı **veya** §6'daki ispat aracının gerçek koşusu |
| S-2 | `CancelDocument` **yanıt gövdesi** örneği (başarılı + hatalı) | Aynı |
| S-3 | Yanıtta **iş-seviyesi başarı alanı** var mı? Adı ne? | Aynı |
| S-4 | Giden e-Fatura / e-Arşiv için **hangi uç** kullanılmalı? | Satıcıya yazılı soru |
| S-5 | Gönderilecek **kimlik**: ETTN mi, entegratör UUID'si mi? | Satıcıya yazılı soru |
| S-6 | İptal **kontör tüketiyor mu**? | Satıcıya yazılı soru |
| S-7 | GİB **zaman penceresi** kısıtı var mı? | Satıcıya yazılı soru |
| S-8 | Entegratör reddederse **ERP tarafı** ne olmalı? | Ürün kararı |

**S-1…S-3 için araç hazır:** §6.

---

## 6. Sözleşme ispat aracı (yazıldı, kontör yakmaz)

`tools/faz19-cancel-sozlesme-ispeti.ps1` + `server/tests/phase19CancelContractProbe.ts`

Bu araç sözleşmeyi **ölçmek** için yazıldı, düzeltmeyi uygulamak için değil:

- Geçersiz/uydurma bir UUID ile `CancelDocument`'a **tek** çağrı yapar
- **Ham istek gövdesini ve ham yanıt gövdesini** olduğu gibi kaydeder
- Yanıttaki **tüm alan adlarını** listeler → `IsSucceeded` var mı, adı ne, tipi ne
- Başarısız yanıtta **hata mesajını** kaydeder → alan adı yanlışsa API bunu söyler
- **Belge göndermez** (kontör yakmaz) — yalnız geçersiz kimlikle iptal dener
- Kimlik bilgisi/token **maskelenir**

**Neden geçersiz UUID yeterli:** API'nin alan adı beklentisi yanlışsa yanıt
"zorunlu alan eksik" benzeri bir hata verir; bu, gövde şemasını kanıtlar. Doğru
alan adı verilse bile uydurma bir belge kimliği "belge bulunamadı" döndürür —
her iki durumda da **yanıt gövdesi** sözleşmeyi açığa çıkarır.

**Bu araç PASS üretmez.** Çıktısı sözleşme kanıtıdır, uygulama doğrulaması değil.

---

## 7. Bu denetimde YAPILMAYANLAR (bilerek)

| Yapılmayan | Neden |
|-----------|-------|
| `cancelInvoice`'a vendor çağrısı ekleme | İstek/yanıt sözleşmesi doğrulanamadı (§4.1, §4.3) |
| Gövde alan adlarını "düzeltme" (`uuid`→`Uuid`) | Hangisinin doğru olduğu bilinmiyor — değiştirmek de tahmin olur |
| Uç seçimi (`CancelDocument` vs `CancelEArsivInvoice`) | Satıcı belgelemiyor (§4.2) |
| `EDonusumView`'de `inv.id` → `eInvoiceUUID` | Kural 4: önce vendor sözleşmesiyle doğrula (§4.4) |
| Yeni endpoint/parametre uydurma | Kullanıcı yasağı |

---

## 8. İlgili dosyalar

- `server/services/hizliConnectService.ts:480-532` — `cancelDocument` (istek/yanıt; iş-seviyesi kapısı `:499-511`)
- `server/services/hizliConnectService.ts:431-478` — `cancelEArsivInvoice` (harf kuralı çelişkisi)
- `server/services/providers/hizliTeknolojiProvider.ts:337-368` — gövde üretimi + `dogrulandi`
- `server/services/incomingInvoiceService.ts:227` — tek üretim çağrısı
- `server/services/providers/electronicDocumentProvider.ts:121-133` — arayüz imzası
- `docs/30_FAZ19_IPTAL_ENTEGRASYON_KANITI.md` — iptal gap kanıtı
- `docs/34_FAZ19_GERCEK_KOSU_RAPORU.md` — gerçek koşu + Windows komutu
- `docs/36_FAZ19_CANCEL_FIX_SON_RAPOR.md` — bu fix turunun son raporu
- `tools/faz19-cancel-sozlesme-ispeti.ps1` — sözleşme ispat aracı (sarmalayıcı)
- `server/tests/phase19CancelContractProbe.ts` — sözleşme ispat aracı (kontör yakmayan ölçüm)
- `server/tests/phase19CancelFlowTest.ts` — iptal akışı testleri (mock sınırı, 21 kontrol)

---

## 9. SÖZLEŞME İSPAT ARACI — KOŞU SONUCU (2026-09-15)

Araç yazıldı ve koşuldu. **Sandbox'a erişilemedi — sözleşme ÖLÇÜLEMEDİ.**

| Adım | Sonuç | Kanıt |
|------|-------|-------|
| Güvenlik kapısı (5 kontrol) | ✅ Geçti | `IS_TEST_MODE=true`, `ALLOW_PROD` boş, TEST hostu, credential tanımlı, `getBaseUrl(true)` → `econnecttest` |
| `UtilEncrypt` | ⛔ HTTP 403 | Allowlist proxy reddi |
| Bağımsız DNS ölçümü | ⛔ `EAI_AGAIN` | `econnecttest...` doğrudan çözülemiyor — 403 ortam engelidir |
| `CancelDocument` çağrısı | — | **Hiç yapılmadı** (auth kanıtlanmadan geçilmez) |
| Belge gönderimi | — | **Hiç yapılmadı** |
| Etiket | `[SOZLESME_OLCUMU:KOSULAMADI]` | exit 0 |

**Sözleşme hâlâ YETERSİZ.** Ölçüm, egress erişimli makinede
`tools\faz19-cancel-sozlesme-ispeti.ps1` ile tekrarlanmalıdır.

---

## 10. UYGULAMA DÜZELTMESİ — YAPILAN VE YAPILMAYAN

Kullanıcı kuralı 2 ("minimum fix") ve kural 5 ("HTTP 200 kuralı") uyarınca
ayrım şudur:

| Parça | Durum | Gerekçe |
|-------|-------|---------|
| **İş-seviyesi başarı kapısı** (HTTP 2xx + `IsSucceeded=false` → `success:false`) | ✅ **YAPILDI** | Sözleşme gerektirmez: yanıt hangi şemada olursa olsun, "başarısız" diyen bir yanıtı "başarılı" saymak hiçbir koşulda doğru değildir. Kural 5'in doğrudan uygulanması. |
| `dogrulandi` bayrağı ile "belirsiz" durumun açık raporlanması | ✅ **YAPILDI** | Yanıtta bayrak yoksa "iptal kesinleşti" denmez |
| **Gövde alan adlarını düzeltme** (`uuid`→`Uuid`) | ❌ **YAPILMADI** | Kural 1: kanıtlanmamış — değiştirmek de tahmin olur |
| **`cancelInvoice`'a vendor çağrısı ekleme** (asıl INTEGRATION GAP) | ❌ **YAPILMADI** | Uç/e/marka seçimi ve gövde sözleşmesi kanıtlanmadı |
| **`EDonusumView` `inv.id` → `eInvoiceUUID`** | ❌ **YAPILMADI** | Kural 4: vendor sözleşmesiyle doğrulanmadan değiştirilmez |

Yani: **kural 5'in uygulanabilir kısmı uygulandı; kural 1'in durdurduğu kısım
durduruldu.**

### 10.1 Mutasyon kanıtı (düzeltme gerçekten iş yapıyor mu?)

"Düzeltme çalışıyor" iddiası, düzeltme **geri alınarak** sınandı:

| | Düzeltme AÇIK | Düzeltme KAPALI (mutasyon) |
|---|---|---|
| Toplam | 21 | 21 |
| PASS | **21** | 18 |
| FAIL | **0** | **3** |

Mutasyonda kırılan kontroller tam olarak şunlardır: **N-3, N-4, N-5** — hepsi
"sahte başarı üretti — HTTP 200 iş hatasını maskeliyor" mesajıyla. Örnek ölçülen
çıktı (mutasyon hâli):

```
❌ FAIL N-3 HTTP 200 + IsSucceeded=false sahte başarı üretti
   {"success":true,"isSeviyesi":"basarisiz",
    "data":{"IsSucceeded":false,"Message":"Belge bulunamadı."},
    "message":"Belge iptal edildi."}
```

Bu, düzeltmeden önceki kodun gerçek davranışıdır: `IsSucceeded:false` yanıtı
`success:true` + "Belge iptal edildi." dönüyordu. Mutasyon sonrası dosya
SHA-256 ile byte-özdeş geri yüklendi (`1b7707661c25442c5a6b76647d90c6d2042db707d62f0b46532d0f2023cb8309`).

---

## 11. REGRESYON VE TEST SONUÇLARI (2026-09-15, gerçek çıktı)

| Süit | Sonuç | Not |
|------|-------|-----|
| `tsc --noEmit -p tsconfig.server.json` | ✅ **0 hata** (exit 0) | |
| Test dosyaları tip kontrolü (ayrı) | ✅ **0 hata** | `tsconfig.server.json` `server/tests`'i hariç tutuyor |
| `phase19CancelFlowTest.ts` | ✅ **21/21 PASS**, 0 FAIL | Mock/stub — **gerçek sandbox kanıtı DEĞİL** |
| `phase18HizliBilisimIntegrationTest.ts` | **53 PASS / 0 FAIL / 3 SKIP** | SKIP: egress engeli → **PASS sayılmaz** |
| `phase19NegativeAccessTest.ts` | ✅ **45/45 PASS**, 0 FAIL | |
| `phase19DocumentLifecycleTest.ts` | 28 PASS / 0 FAIL / 2 WARN / 5 SKIP | KARAR: **KOŞULAMADI** |
| `phase19CancelContractProbe.ts` | `[SOZLESME_OLCUMU:KOSULAMADI]` | Sandbox'a erişilemedi |

`phase19DocumentLifecycleTest` WARN'lerinden biri **B-11 INTEGRATION GAP'i
bağımsız olarak yeniden onayladı**:

> "Giden belge iptali entegratöre GİTMİYOR — yalnız ERP tarafı ters çevriliyor."

### 11.1 Gerçek sandbox

**ERİŞİLEMEDİ.** Ölçülmüş kanıt: `UtilEncrypt` → HTTP 403 (allowlist proxy);
bağımsız DNS ölçümü → `EAI_AGAIN`. Bu ortamdan **hiçbir** hedefe ulaşılmadı.
Gerçek sandbox koşusu Windows'ta yapılmalıdır:
`tools\faz19-belge-akisi.ps1 -KontorOnayi` ve `tools\faz19-cancel-sozlesme-ispeti.ps1`.

### 11.2 Production kilidi

| Kalem | Değer |
|-------|-------|
| Canlı API çağrısı | **0** |
| Canlı belge gönderimi | **0** |
| Canlı iptal | **0** |
| `ALLOW_PROD` | boş/kapalı (araçla teyit edildi) |
| `IS_TEST_MODE` | `true` (araçla teyit edildi) |
| Canlı host'a giden istek | **0** |

---

## 12. SONUÇ

**FIX VERIFIED** — ancak **kapsamı sınırlıdır**:

- ✅ Uygulanan kısım (iş-seviyesi başarı kapısı) mutasyon testiyle kanıtlandı,
  21/21 PASS, regresyon temiz, production'a çıkış yok.
- ⛔ Asıl `INTEGRATION GAP` (giden iptalin entegratöre hiç gitmemesi)
  **DÜZELTİLMEDİ** — vendor sözleşmesi yetersiz olduğu için durduruldu.
- ⛔ Sözleşme ölçümü **KOŞULAMADI** — sandbox'a erişilemedi.

Bu iki ⛔ kapanmadan giden belge iptali production'a hazır **değildir**.

---

## 13. ÜÇ ZORUNLU KANIT — YENİDEN DENETİM (2026-09-15, karar turu)

Kullanıcı, kod yazmadan önce şu **üç** sonucun kanıtlanmasını şart koştu. Üçü de
bağımsız olarak yeniden denendi; **hiçbiri kanıtlanamadı.**

| # | İstenen kanıt | Sonuç | Ölçülen gerekçe |
|---|---------------|-------|-----------------|
| 1 | `CancelDocument` gerçek vendor sözleşmesi — endpoint, method, body, belge kimliği | ⛔ **KANITLANAMADI** | Repo genelinde vendor sözleşmesi **yok**. `find` (swagger/openapi/wadl/econnect, derinlik 4) → **0 eşleşme**. `tema/` ve `tema2/` klasörleri web sitesi teması aynası (isbasi.com) — API dokümanı değil. `docs/21` (satıcı Q&A) iptalden hiç söz etmiyor. Uydurma kaynak yok. |
| 2 | Giden belge için kullanılacak kimlik — `eInvoiceUUID` / ETTN / başka alan | ⛔ **KANITLANAMADI** | Alan **karışık kaynaklı**: `efatura.ts:101-104` ETTN'yi `invoice.eInvoiceUUID`'den alır ve **yoksa `'TASLAK-ETTN-YOK'` yazar** (ETTN uydurulmuyor). Ancak `electronicDocumentService.ts:106` `invoice.eInvoiceUUID \|\| crypto.randomUUID()` ile **yerel UUID** üretebiliyor; `electronicDocumentQueue.ts:424` ise `doc.uuid` yazıyor. Yani aynı alan bazen gerçek GİB kimliği, bazen yerel üretilmiş değerdir. **Hangisinin entegratörce kabul edildiği ölçülmedi.** `hizliTeknolojiProvider.ts:312` gelen akışta `inv.uuid \|\| inv.ettn` bekliyor — alan adı tercihi net değil. |
| 3 | Başarı kriteri — HTTP 200'ün tek başına yetmediği + response içindeki iş sonucu | 🟡 **KISMEN** | *İlke* kanıtlı ve uygulandı (§10, §10.1): HTTP 2xx + `IsSucceeded:false` → `success:false`; mutasyonla doğrulandı (21/21 ↔ 18/3 FAIL). Ancak `CancelDocument` yanıtının **hangi alanı taşıdığı bilinmiyor** — okuyucu şema-bağımsız yazıldı ve bayrak yoksa `'belirsiz'` döner. Yani *kural* uygulandı, *CancelDocument'a özgü başarı kriteri* kanıtlanamadı. |

### 13.1 Sonuç etiketi

```
INTEGRATION GAP — IMPLEMENTATION BLOCKED BY INCOMPLETE VENDOR CONTRACT
```

Üç maddeden **1 ve 2** tamamen kanıtsız, **3** ise yalnız genel ilke düzeyinde
kanıtlı. Kullanıcı kuralı gereği (*"bunlardan biri vendor dokümanında yoksa kod
yazmaması gerekiyor"*) **kod yazılmadı** — mevcut durum (kural 5 düzeltmesi
hariç) değiştirilmedi.

### 13.2 Bu turda yapılmayanlar (bilerek)

- ❌ Vendor çağrısı ekleme / gövde alan adı değiştirme / uç seçimi — madde 1 kanıtsız
- ❌ `EDonusumView.tsx:248` `inv.id` → `eInvoiceUUID` — madde 2 kanıtsız
- ❌ Mock/lokal sunucu ile "PASS" üretme — kullanıcı yasağı (mock PASS sayılmaz)
- ❌ Canlı API'ye istek — güvenlik kuralı

### 13.3 Bu turda yapılanlar

- ✅ Repo genelinde vendor sözleşmesi araması (swagger/openapi/wadl/econnect → **0**)
- ✅ `tema/`, `tema2/` klasörlerinin içeriği denetlendi → **API dokümanı değil**
- ✅ Belge kimliği akışı uçtan uca izlendi (`efatura.ts` ↔ `electronicDocumentService.ts` ↔ `electronicDocumentQueue.ts` ↔ `hizliTeknolojiProvider.ts`) → alan karışık kaynaklı
- ✅ Uygulama kodunda **hiçbir değişiklik yapılmadı**

### 13.4 Sözleşmeyi kapatacak tek yol

Egress erişimli makinede sözleşme ispat aracını koşmak (kontör yakmaz):

```powershell
powershell -ExecutionPolicy Bypass -File tools\faz19-cancel-sozlesme-ispeti.ps1
```

Çıktı `[SOZLESME_OLCUMU:OLCULDU]` ise: ham istek/yanıt gövdeleri madde 1 ve 3'ü
kapatır. Alternatif: satıcıdan yazılı `CancelDocument` Swagger/örnek yanıtı almak
(§5, S-1…S-3). **Bu iki yoldan biri tamamlanmadan kod yazılmaz.**
