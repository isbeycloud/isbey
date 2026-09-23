# FAZ 19 — `CancelDocument` Düzeltme Turu · Son Rapor

Tarih: 2026-09-15 · Ortam: Claude Linux VM (egress engelli) + repo `D:\İŞBEY`
Atıf: kullanıcının 11 kurallık düzeltme direktifi

---

## 1. SONUÇ

```
Vendor sözleşmesi: YETERSİZ
Uygulama düzeltmesi: KISMEN yapıldı (kural 5'in uygulanabilir kısmı)
```

`CancelDocument` talebinin **istek gövdesi alan adları** ve **yanıt şeması**
doğrulanamadı. Bu nedenle asıl `INTEGRATION GAP` düzeltmesi (giden iptalin
entegratöre gönderilmesi) **kural 1 gereği durduruldu**. Sözleşme gerektirmeyen
tek parça — *HTTP 200'ü otomatik PASS saymama* — uygulandı ve kanıtlandı.

---

## 2. VENDOR SÖZLEŞMESİ: **YETERSİZ**

| Alan | Durum | Kanıt |
|------|-------|-------|
| HTTP method | 🟡 kısmen | Kod POST kullanıyor; satıcı belgesi yok |
| Endpoint yolu | 🟡 kısmen | `RestApi/CancelDocument` kodda var; satıcı belgesi yok |
| **İstek gövdesi alan adları** | ❌ **DOĞRULANAMADI** | `{uuid, cancelReason}` — kod tahmini. Aynı API ailesi `CancelEArsivInvoice`'da `Uuid`/`CancelReason` kullanıyor. Hangisi doğru, kaynak yok. |
| Belge kimliği (ETTN/UUID) | ❌ DOĞRULANAMADI | Hangi kimlik alanı gönderilmeli, belgelenmemiş |
| **Yanıt formatı / şeması** | ❌ **YOK** | Repo'da hiçbir yerde `CancelDocument` yanıt örneği yok |
| **`IsSucceeded` alanı** | ❌ **YOK** | Yanıt şeması bilinmediği için varlığı kanıtlanamadı |
| Auth | ✅ DOĞRULANDI | Bearer JWT (satıcı teyitli, 24h TTL) |

**Tüketilen tüm kaynaklar:** `docs/21` (iptal=0, cancel=0, swagger=0),
`docs/02` (tümü 0), repo geneli Swagger/OpenAPI (yok), satıcı web dokümanı
(egress engelli).

**Sonuç:** kural 1 gereği **endpoint/parametre uydurulmadı.** Gövde alan adları
bilerek değiştirilmedi — tahminle başka ad yazmak da aynı hata olurdu.

---

## 3. DEĞİŞEN DOSYALAR

| # | Dosya | Değişiklik | Neden |
|---|-------|-----------|-------|
| 1 | `server/services/hizliConnectService.ts` | `isSeviyesiSonucuOku()` + `isSeviyesiMesaji()` saf fonksiyonları eklendi | Yanıt gövdesinden iş-seviyesi başarı bayrağını şema-bağımsız okuyabilmek (kural 5) |
| 2 | `server/services/hizliConnectService.ts` | `cancelDocument`: HTTP 2xx + iş hatası → `success:false`, "Belge iptal edilemedi" | **HTTP 200'ü PASS sayma.** Önceden `IsSucceeded:false` yanıtı `success:true` dönüyordu |
| 3 | `server/services/hizliConnectService.ts` | `cancelDocument`: bayrak yoksa `isSeviyesi:'belirsiz'` + "doğrulanmadı" mesajı | Emin olunmayan durumu "iptal edildi" diye raporlamamak |
| 4 | `server/services/hizliConnectService.ts` | `cancelDocument` üstüne ⚠️ SÖZLEŞME SINIRI bloğu | Alan adlarının kanıtlanmadığını kalıcı olarak kayda geçirmek |
| 5 | `server/services/hizliConnectService.ts` | `cancelEArsivInvoice`: aynı iş-seviyesi kapısı + harf kuralı çelişkisi notu | Aynı sınıf hata orada da vardı |
| 6 | `server/services/providers/hizliTeknolojiProvider.ts` | `cancelInvoice` → `dogrulandi` bayrağı döner | Çağıran "iptal kesinleşti" varsaymasın |
| 7 | `server/services/providers/electronicDocumentProvider.ts` | Arayüz imzasına `dogrulandi?` + dokümantasyon | Sözleşme tüm sağlayıcılar için tek yerde tanımlı olsun |
| 8 | `server/services/providers/mockProvider.ts` | `cancelInvoice` → `dogrulandi: undefined` | MOCK entegratör onayı görmez; "doğrulandı" diyemez |
| 9 | `server/tests/phase19CancelFlowTest.ts` | **YENİ** — 21 kontrol (pozitif/negatif) | Kural 6 |
| 10 | `server/tests/phase19CancelContractProbe.ts` | **YENİ** — sözleşme ispat aracı | Sözleşmeyi kontör yakmadan ölçmek |
| 11 | `tools/faz19-cancel-sozlesme-ispeti.ps1` | **YENİ** — PowerShell sarmalayıcı | Windows'ta güvenlik kapısıyla koşum |
| 12 | `tools/faz19-belge-akisi.ps1` | 3 kademeli `tsx` çağrı yolu + sağlam sürüm ayrıştırma | Kural 10 — gerçek koşu harness'i |
| 13 | `docs/35_FAZ19_CANCELDOCUMENT_SOZLESME_DENETIMI.md` | §9–§12 eklendi | Ölçüm, mutasyon kanıtı, regresyon, sonuç |
| 14 | `docs/36_FAZ19_CANCEL_FIX_SON_RAPOR.md` | **YENİ** — bu rapor | Kural 11 |

**Dokunulmayanlar (bilerek):** `cancelInvoice`'a vendor çağrısı eklenmedi ·
gövde alan adları değiştirilmedi · `EDonusumView.tsx:248` `inv.id` →
`eInvoiceUUID` yapılmadı (kural 4: sözleşme kanıtı yok) · DB şeması · muhasebe
mantığı · işlem (transaction) yapısı.

---

## 4. TESTLER

| Test | Sonuç | Not |
|------|-------|-----|
| `tsc --noEmit -p tsconfig.server.json` | ✅ **PASS** — 0 hata, exit 0 | |
| Test dosyaları tip kontrolü (ayrı bayrak seti) | ✅ **PASS** — 0 hata | `tsconfig.server.json` `server/tests`'i hariç tutuyor |
| **`phase19CancelFlowTest.ts`** (YENİ) | ✅ **PASS — 21/21**, 0 FAIL | Mock/stub |
| **Mutasyon testi** (düzeltme geri alındı) | ✅ **PASS (kanıt)** — 21→18 PASS, 0→**3 FAIL** (N-3, N-4, N-5) | Düzeltmenin iş yaptığını kanıtlar |
| `phase18HizliBilisimIntegrationTest.ts` | ⚠️ **KISMİ** — 53 PASS / 0 FAIL / **3 SKIP** | SKIP = egress engeli; **PASS sayılmaz** |
| `phase19NegativeAccessTest.ts` | ✅ **PASS — 45/45**, 0 FAIL | |
| `phase19DocumentLifecycleTest.ts` | ⚠️ **KOŞULAMADI** — 28 PASS / 0 FAIL / 2 WARN / 5 SKIP | Sandbox'a ulaşılamadı |
| `phase19CancelContractProbe.ts` | ⚠️ **KOŞULAMADI** — `[SOZLESME_OLCUMU:KOSULAMADI]` | Sandbox erişilemedi |

**SKIP'lerin gerekçesi:** koşu ortamı egress engelli. OS üzerinden ölçüldü:
`UtilEncrypt` → HTTP 403 (allowlist proxy), bağımsız DNS → `EAI_AGAIN`.
Bu bir API hatası değil, **ortam engelidir** — hiçbir iddia ölçülmüş sayılmadı.

### 4.1 Mutasyon kanıtının ayrıntısı

Düzeltme kapatıldığında testin verdiği **gerçek** çıktı:

```
❌ FAIL N-3 HTTP 200 + IsSucceeded=false sahte başarı üretti
   --- HTTP 200 iş hatasını maskeliyor
   {"success":true,"isSeviyesi":"basarisiz",
    "data":{"IsSucceeded":false,"Message":"Belge bulunamadı."},
    "message":"Belge iptal edildi."}
```

Bu, düzeltme öncesi kodun **gerçek davranışıdır**. Dosya SHA-256 ile byte-özdeş
geri yüklendi: `1b7707661c25442c5a6b76647d90c6d2042db707d62f0b46532d0f2023cb8309`.

---

## 5. GERÇEK SANDBOX: **ERİŞİLEMEDİ**

- Ölçülen engel: `UtilEncrypt` → HTTP 403; bağımsız DNS → `EAI_AGAIN`
- Hedefe ulaşan istek: **0** · Belge gönderimi: **0** · Gerçek iptal: **0**
- Sözleşme ölçümü: `[SOZLESME_OLCUMU:KOSULAMADI]` (exit 0)
- **"Belge gönderildi/iptal edildi" DENMEZ** — kural 10.

**Windows'ta koşulacak:**
```powershell
powershell -ExecutionPolicy Bypass -File tools\faz19-cancel-sozlesme-ispeti.ps1
powershell -ExecutionPolicy Bypass -File tools\faz19-belge-akisi.ps1 -KontorOnayi
```
İlki kontör yakmaz (yalnız sözleşme ölçer). İkincisi **gerçek belge gönderir ve
iptal eder** — onaysız çalışmaz.

---

## 6. PRODUCTION

```
Production:
* çağrı 0
* belge 0
* iptal 0
```

`IS_TEST_MODE=true` (araçla teyit) · `ALLOW_PROD` boş/kapalı (araçla teyit) ·
canlı host'a giden istek **0** · canlı credential kullanılmadı · sandbox
credential kullanıldı ancak **hedefe hiç ulaşmadı** (değerler maskeli, rapora
yazılmadı).

---

## 7. SONUÇ

```
FIX VERIFIED — kapsamı sınırlı
```

**Doğrulanan:** iş-seviyesi başarı kapısı uygulandı, mutasyon testiyle kanıtlandı
(21/21 ↔ 18/3), regresyon temiz (tsc 0 hata, 45/45 negatif erişim), production
kilidi el değmemiş.

**Doğrulanmayan / kapanmayan:**
1. ⛔ **Asıl INTEGRATION GAP açık** — giden belge iptali hâlâ entegratöre
   gitmiyor. Sözleşme yetersiz olduğu için düzeltilmedi.
2. ⛔ **Vendor sözleşmesi hâlâ YETERSİZ** — istek gövdesi alan adları ve yanıt
   şeması ölçülemedi.
3. ⛔ **Gerçek sandbox doğrulaması yok** — egress engeli.

**Kapanış koşulu:** egress erişimli makinede `faz19-cancel-sozlesme-ispeti.ps1`
koşup sözleşmeyi ölçmek → alan adları ve yanıt şeması kanıtlanınca §2'de
listelenen iki maddeyi düzeltmek → `-KontorOnayi` ile gerçek akışı doğrulamak.

Bu üç madde kapanmadan giden belge iptali production'a hazır **değildir.**

---

## 8. KARAR TURU — ÜÇ ZORUNLU KANIT (2026-09-15, son)

Kullanıcı kod yazmadan önce üç kanıt istedi. Üçü de yeniden denendi:

| # | İstenen | Sonuç |
|---|---------|-------|
| 1 | `CancelDocument` endpoint / method / body / belge kimliği | ⛔ **KANITLANAMADI** — repo geneli vendor sözleşmesi yok (`swagger`/`openapi`/`wadl`/`econnect` → **0 eşleşme**); `tema/`+`tema2/` web sitesi teması; `docs/21` iptalden söz etmiyor |
| 2 | Giden belge kimliği: `eInvoiceUUID` / ETTN / başka alan | ⛔ **KANITLANAMADI** — alan karışık kaynaklı: `efatura.ts:101-104` gerçek ETTN yoksa `'TASLAK-ETTN-YOK'` yazar; ama `electronicDocumentService.ts:106` `crypto.randomUUID()` ile yerel UUID üretir. Hangisinin entegratörce kabul edildiği ölçülmedi |
| 3 | Başarı kriteri — HTTP 200 yetmez + iş sonucu | 🟡 **KISMEN** — ilke kanıtlı ve mutasyonla doğrulandı (§4.1); ancak `CancelDocument`'a özgü yanıt alanı bilinmiyor, okuyucu şema-bağımsız ve bayrak yoksa `'belirsiz'` der |

```
INTEGRATION GAP — IMPLEMENTATION BLOCKED BY INCOMPLETE VENDOR CONTRACT
```

**Kod yazılmadı.** Kullanıcı kuralı: *"bunlardan biri vendor dokümanında yoksa kod
yazmaması gerekiyor."* Madde 1 ve 2 tamamen kanıtsız olduğu için implementasyon
durduruldu.

**Bu turda uygulama kodunda hiçbir değişiklik yapılmadı.** Yalnız `docs/35` §13
(denetim kaydı) güncellendi.

**Doğrulama turu KAPANDI — tekrar edilmeyecek.** Karar kesindir.

---

## 9. DURUM ETİKETLERİ (kesin, değişmez)

| Kalem | Durum |
|-------|-------|
| Vendor `CancelDocument` sözleşmesi | **KANITLANAMADI** |
| Giden belge kimliği | **KANITLANAMADI** |
| `CancelDocument` başarı response sözleşmesi | **KISMEN KANITLANDI** |
| Uygulama düzeltmesi | **YAPILMADI** |
| Gerçek sandbox belge yaşam döngüsü | **KOŞULAMADI** |
| Production | **KAPALI** |

```
SON DURUM: WAITING FOR VENDOR CONTRACT
```

> **Not:** Önceki turlarda yapılan *iş-seviyesi başarı kapısı* düzeltmesi
> (HTTP 2xx + `IsSucceeded:false` → `success:false`, mutasyonla doğrulanmış
> 21/21 ↔ 18/3) **mevcut kodda durmaktadır ve geri alınmamıştır** — bu bir
> `CancelDocument` implementasyonu değildir, sözleşme gerektirmeyen genel bir
> doğruluk düzeltmesidir. "Uygulama düzeltmesi: YAPILMADI" etiketi **giden iptal
> entegrasyonunun (asıl INTEGRATION GAP) yapılmadığını** ifade eder.

**Vendor cevabı gelmeden implementasyon yapılmayacaktır.** Cevap geldiğinde
mevcut kodla karşılaştırılacak ve ancak o zaman minimum fix değerlendirilecektir.
**Bu aşama PASS olarak kapatılmamıştır.**

---

## 10. GÜVENLİK KİLİDİ (tüm turlar boyunca)

```
IS_TEST_MODE=true                     · korundu
HIZLI_BILISIM_ALLOW_PROD              · boş/kapalı korundu
ALLOW_PROD=true                       · YAPILMADI
Production URL                        · kullanılmadı
Production credential                 · kullanılmadı
Canlı belge gönderimi                 · 0
Canlı kontör tüketimi                 · 0
Sandbox credential                    · kullanıldı, hedefe ULAŞMADI (egress engeli)
Mock/lokal sunucu PASS sayımı         · 0 (mock PASS olarak sayılmadı)
Credential/token artifact yazımı      · maskeli
```

**Yürürlükteki yasaklar (kullanıcı direktifi):** mevcut kodu değiştirme ·
`CancelDocument` endpoint/body/UUID formatı tahmin etme · `inv.id` → `eInvoiceUUID`
değişikliği yapma · production'a dokunma · `ALLOW_PROD=true` yapma · gerçek belge
gönderme/iptal başlatma · kontör tüketme.
