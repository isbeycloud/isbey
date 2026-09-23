# İŞBEY — FAZ 19 Gerçek Koşu Raporu ve Windows Koşu Talimatı

**Tarih:** 2026-09-15 · **Hazırlayan:** Claude (Opus-5) · **Kod değişikliği:** YOK (yalnız test/harness/doküman)

> Bu rapor yalnızca **gerçek çıktıya** dayanır. Hiçbir kalem "çalışmış olmalı"
> diye PASS yazılmamıştır. Mock kullanılmamıştır. Canlı ortama hiçbir istek
> gönderilmemiştir.

---

## 1. SONUÇ

### 1.1 Belge yaşam döngüsü

# ⛔ KOŞULAMADI

Gerçek TEST/SANDBOX ortamına **bu koşu ortamından ulaşılamadı**. Ölçülen engel:

```
$ curl -i https://econnecttest.hizliteknoloji.com.tr/HizliApi/RestApi/Test
HTTP/1.1 403 Forbidden
Content-Type: text/plain
X-Proxy-Error: blocked-by-allowlist
```

Aynı yanıt `example.com` için de döner → engel hedefe özgü değil, **ortamsaldır**
(allowlist proxy). Bu bir API/ürün hatası **değildir**; bu yüzden FAIL değil
KOŞULAMADI'dır.

**Kanıtlanan (egress'ten bağımsız):** güvenlik ön koşulları (5/5 PASS), yerel UBL-TR
belge üretimi + şema doğrulaması, statik sözleşme denetimi, ölçülmüş izolasyon
sayaçları. **Kanıtlanamayan:** auth zinciri, gönderim, sorgulama, iptal.

### 1.2 İptal entegrasyonu

# ⚠️ INTEGRATION GAP

Giden belge iptali entegratöre **gitmiyor**. Ayrıntılı kanıt:
`docs/30_FAZ19_IPTAL_ENTEGRASYON_KANITI.md` (satır numaralı, bağımsız doğrulanabilir).

> Bu değerlendirme `DOĞRU` ya da `INTEGRATION GAP` ikilisinden biridir. Ölçülen
> sonuç: **INTEGRATION GAP**. Düzeltme **yapılmadı** — davranış değişikliği onayı gerekir.

---

## 2. Windows koşu talimatı (istenen: "tam komut")

Proje kökünde (`D:\İŞBEY`), PowerShell:

### 2.1 Önce mevcut süiti koş (gönderim yapmaz — güvenli)

```powershell
powershell -ExecutionPolicy Bypass -File tools\dogrulama.ps1
```

Bu, `phase19DocumentLifecycleTest.ts`'i de koşar. Gönderim/iptal adımları bilinçli
olarak SKIP kalır, o yüzden bu süit **asla PASS dönmez** — beklenen sonuç `BLOCKED`.

### 2.2 Sonra gerçek akışı koş (belge gönderir ve iptal eder)

```powershell
# 1) Kuru kontrol — HİÇBİR İSTEK GÖNDERMEZ, yalnız ön koşulları doğrular:
powershell -ExecutionPolicy Bypass -File tools\faz19-belge-akisi.ps1

# 2) Kontör riskini kabul ederek gerçek koşu:
powershell -ExecutionPolicy Bypass -File tools\faz19-belge-akisi.ps1 -KontorOnayi
```

`-KontorOnayi` **verilmezse** betik hiçbir istek göndermeden durur (exit 2).

### 2.3 Çıktılar

| Dosya | İçerik |
|-------|--------|
| `.verify-tmp\faz19-gercek-akis-<zaman>.txt` | Tam koşu kaydı |
| `.verify-tmp\faz19-gercek-akis-kanit-<zaman>.json` | Adım adım HTTP kanıtı (maskeli) |

---

## 3. Windows koşusunun ön koşulları (harness doğrulaması)

Betik, hiçbir istek göndermeden önce şunları **kendisi** doğrular:

| Ön koşul | Aranan | Sağlanmazsa |
|----------|--------|-------------|
| `.env` mevcut | `D:\İŞBEY\.env` | durur (exit 1) |
| Test modu | `HIZLI_BILISIM_IS_TEST_MODE=true` | durur |
| Prod kilidi | `HIZLI_BILISIM_ALLOW_PROD` boş/false | durur |
| Hedef | `HIZLI_BILISIM_API_URL` → `econnecttest…` | durur |
| Canlı sızıntı | URL `econnect.hizliteknoloji.com.tr` **içermemeli** | durur |
| Credential | `API_KEY`, `SECRET_KEY`, `WS_USERNAME`, `WS_PASSWORD` dolu | durur (eksik olanı adıyla söyler, **değeri yazmaz**) |

**Teknik gereksinimler (ölçülerek doğrulandı):**

| Bileşen | Ölçülen durum |
|---------|---------------|
| Node | Projede `engines` kısıtı yok. Betik `node -v` ile **≥ 20** arar (`--import` bayrağı 20.6+'da gelir). Bulunamazsa/eskiyse yedeğe düşer |
| `tsx` modülü | `node_modules/tsx` — **kurulu, v4.23.12** |
| `tsx` CLI (yedek-1) | `node_modules/tsx/dist/cli.mjs` — **var** |
| esbuild platform ikilisi | Yalnız `node_modules/@esbuild/win32-x64` — **Windows için doğru** |
| rolldown platform ikilisi | `node_modules/@rolldown/binding-win32-x64-msvc` — **Windows için doğru** |
| Çağrı biçimi | `node --import tsx server/tests/phase19DocumentSendFlowRun.ts` |
| `.env` yükleme | Betik `dotenv` ile repo kökünü `ISBEY_REPO_ROOT` üzerinden okur; `cwd`'den bağımsız |
| Sarmalayıcı `.env` denetimi | `HIZLI_BILISIM_IS_TEST_MODE=true`, `ALLOW_PROD` boş, `API_URL` test hostu, dört credential dolu — koşuldu, **hepsi karşılandı** |
| Türkçe karakter | Karar, ASCII'ye dayanıklı `[FAZ19_KARAR:…]` etiketinden okunur |

**Çağrı yolu üç kademeli (paketle aynı sıra):** `node --import tsx` → `node
node_modules/tsx/dist/cli.mjs` → `cmd /c npx tsx`. Sarmalayıcı hangisini
kullandığını ekrana yazar; bu, node sürümü eski olan bir makinede betiğin sessizce
durmasını engeller.

**Koşuldu ve doğrulandı:** Betik bu VM'de koşturuldu. VM'deki `tsx` ikilisi Windows
için kurulu olduğundan burada `tsc` ile derlenmiş CJS üzerinden koşuldu
(`tsc` → `node /tmp/.../phase19DocumentSendFlowRun.js`; araç zinciri Windows'ta
doğrudan çalışır). Çıktı: `KARAR: KOŞULAMADI`, `[FAZ19_KARAR:KOSULAMADI]`, exit 0.
Artifact üretildi, sır sızıntısı taraması temiz (bkz. §10.2).

---

## 4. Gerçek test kuralı — betiğin uyguladığı sıra

Windows koşusunda betik tam olarak şu sırayı izler:

| # | Adım | Ölçülen / kaydedilen | Kural |
|---|------|---------------------|-------|
| 0 | Güvenlik kapısı | Test modu, prod kilidi, host | Sağlanmazsa **hiç istek gönderilmez** |
| 1 | Egress ölçümü | HTTP durum + proxy imzası | Engel varsa → KOŞULAMADI |
| 2 | Auth zinciri | UtilEncrypt → Login → JWT | **Auth başarısızsa gönderime GEÇİLMEZ** |
| 3 | Kontör (öncesi) | `GetCredits` + `KalanKontorSorgula` | Bakiye okunur |
| 4 | Belge oluştur | Yerel UBL-TR XML + ETTN | Şema doğrulanmadan gönderilmez |
| 5 | **SendDocument** | Gerçek yanıt + ETTN/UUID | HTTP 2xx **yetmez** (bkz. §5) |
| 6 | Durum sorgula | `GetDocumentListGUID` | Gerçek yanıt kaydedilir |
| 7 | **CancelDocument** | Gerçek yanıt | Gerçek ETTN ile çağrılır |
| 8 | Nihai durum | `GetDocumentListGUID` | İptal sonrası durum |
| 9 | Kontör (sonrası) | Fark ölçülür | Ölçülen etki raporlanır |

Her adımda **gerçek HTTP sonucu** `.verify-tmp\...json` dosyasına yazılır.
Mock yoktur; uydurma UUID ile iptal çağrısı yapılmaz.

---

## 5. Gönderim başarısının ölçütü — önemli teknik bulgu

`HizliConnectService.sendDocument` ve `cancelDocument` **yalnızca HTTP durumuna**
bakar: 2xx dönen her yanıtı `success: true` sayar
(`hizliConnectService.ts:211-231`, `:396-414`).

Oysa aynı API'nin iş hatasını da **HTTP 2xx içinde** bildirdiği kod içinde
belgelidir — UtilEncrypt yolu `{"IsSucceeded":false,"Message":"Hatalı secretKey!"}`
gövdesini 2xx içinde ayrıştırır (`hizliConnectService.ts:78`).

**Sonuç:** HTTP 200 almak "belge GİB'e işlendi" demek **değildir**. Koşu betiği bu
yüzden yanıt gövdesindeki `IsSucceeded` alanını ayrıca okur:

| Durum | Betiğin kararı |
|-------|----------------|
| `IsSucceeded === true` | PASS |
| `IsSucceeded === false` (HTTP 2xx olsa bile) | **FAIL** |
| Alan yok | WARN — "belirsiz", rapora yazılır |

Bu, süitin sahte-PASS üretmemesinin ikinci savunma hattıdır.

---

## 6. KONTÖR

**Gönderimden önce raporlanan durum (betik bunu ekrana yazar):**

> **Kontör davranışı: vendor dokümanında doğrulanamadı**

Satıcı sözleşmesinin (§8) **gerçek ifadesi** — belgeden birebir:

> "Canlı ortam farkı? — **Yalnızca base URL**: `econnecttest` → `econnect` (4 harf).
> ApiKey/SecretKey yapısı aynı."

Bu ifade test ortamının kontör davranışı hakkında **hiçbir şey söylemez**: yalnız
adres farkını belgeler, kontörün tüketilip tüketilmediğini **belgelemez**. Satıcı
aynı zamanda ApiKey/SecretKey yapısının **aynı** olduğunu söylediğine göre, "test
ortamı kontör yakmaz" çıkarımı **yapılamaz** — bu yüzden varsayılmadı.

**Ölçülen etki (gönderim sonrası):** Betik, gönderim öncesi ve sonrası bakiyeyi
okur ve farkı üç durumdan biriyle raporlar:

| Ölçüm | Rapor |
|-------|-------|
| Bakiye düştü | `ÖLÇÜLEN KONTÖR ETKİSİ: N kontör DÜŞTÜ` — kritik bulgu |
| Değişmedi | `ÖLÇÜLEN KONTÖR ETKİSİ: değişmedi` |
| Okunamadı | SKIP — "tüketilmedi" DE denmez, "tükendi" DE denmez |

**Bu koşuda:** gönderim yapılmadı → kontör etkisi ölçülmedi (`0` tüketim).

---

## 7. PRODUCTION KİLİDİ — durum

| Kilit | Durum | Kanıt |
|-------|-------|-------|
| `HIZLI_BILISIM_IS_TEST_MODE=true` | ✅ KİLİTLİ | koşu çıktısı |
| `HIZLI_BILISIM_ALLOW_PROD` | ✅ BOŞ (kapalı) | koşu çıktısı |
| Canlı URL kullanımı | ✅ YOK | `getBaseUrl(true)` → test hostu |
| Canlı credential | ✅ KULLANILMADI | yalnız test credential |
| Canlı belge gönderimi | ✅ YOK | gönderim yapılmadı |
| **`ALLOW_PROD=true`** | ✅ **AYARLANMADI** | — |
| **Production kapısı** | 🔒 **KAPALI** | — |

**Bu oturumda canlıya çıkan istek: 0. Canlı belge: 0. Kontör tüketimi: 0.**

---

## 8. Süit korundu (değiştirilmedi)

`server/tests/phase19DocumentLifecycleTest.ts` **değiştirilmedi**. Değişmez
tasarım sözleşmesi `docs/33_FAZ19_TEST_KORUMA_NOTU.md` içinde kayda geçirildi ve
altı kural (K-1…K-6) olarak listelendi. Özellikle: egress ön ölçümü kaldırılamaz,
`KOŞULAMADI` mantığı silinemez, proxy 403'ü API FAIL sayılamaz, SKIP PASS'a
çevrilemez.

Süitin korunduğunun kanıtı: bu oturumda yeniden koşuldu →
`PASS=28 FAIL=0 WARN=2 SKIP=5` → **KOŞULAMADI** (önceki koşuyla aynı).

---

## 9. Bu oturumda üretilen / değişen dosyalar

| Dosya | Tür | Not |
|-------|-----|-----|
| `docs/30_FAZ19_IPTAL_ENTEGRASYON_KANITI.md` | YENİ | İptal bulgusu, satır bazlı kanıt + tablo |
| `docs/33_FAZ19_TEST_KORUMA_NOTU.md` | YENİ | Süitin değişmez tasarım sözleşmesi |
| `docs/34_FAZ19_GERCEK_KOSU_RAPORU.md` | YENİ | Bu rapor |
| `server/tests/phase19DocumentSendFlowRun.ts` | YENİ | Gerçek akış koşu betiği |
| `tools/faz19-belge-akisi.ps1` | YENİ | Windows sarmalayıcı + ön koşul kapısı |
| `server/tests/phase19DocumentLifecycleTest.ts` | **DEĞİŞMEDİ** | Korundu |

**Uygulama kodu değişmedi.** `DocumentConversionService`, sağlayıcılar, rotalar ve
frontend'e dokunulmadı.

---

## 10. Doğrulama (bu oturumda koşuldu)

| Kalem | Sonuç |
|-------|-------|
| `tsc --noEmit -p tsconfig.server.json` | **EXIT 0**, 0 hata |
| Yeni betik tip kontrolü (`phase19DocumentSendFlowRun.ts`) | **EXIT 0** |
| `phase19DocumentLifecycleTest.ts` yeniden koşu | `PASS=28 FAIL=0 WARN=2 SKIP=5` → KOŞULAMADI (değişmedi) |
| Yeni betik koşu | `[FAZ19_KARAR:KOSULAMADI]`, exit 0 — doğru sınıflandırma |
| Egress tespiti doğrulaması | `curl` ile bağımsız teyit: `X-Proxy-Error: blocked-by-allowlist` |
| Geçici koşu artıkları | Temizlendi |

### 10.1 İptal iddiasının bağımsız doğrulaması (grep ile teyit)

`docs/30`'daki her iddia, tüm depo üzerinde bağımsız `grep` ile yeniden denetlendi:

| İddia | Denetim | Sonuç |
|-------|---------|-------|
| `cancelInvoice` entegratöre çağrı yapmıyor | `provider.cancelInvoice(` tüm depo | **Tek** çağrı: `incomingInvoiceService.ts:227` (gelen/red) — giden akışta yok |
| `CancelDocument` üretimde tek yerde | `cancelDocument\|CancelDocument` tüm depo | Üretim kodu: yalnız `hizliTeknolojiProvider.ts:342`. Kalanlar: test dosyaları + servis tanımı |
| İkinci iptal yolu da entegratöre gitmiyor | `DELETE /api/invoices/:id` gövdesinde `provider\|HizliConnect\|axios\|fetch(` | **Bulunamadı** — hiçbir entegratör çağrısı yok |
| E-Arşiv ucu ayrı | `cancelEArsivInvoice` tüm depo | Üretimde tek çağrı: `efatura.ts:1473` (ham rota) |
| UI, ERP iç kimliğini gönderiyor | `EDonusumView.tsx` | `:232` ve `:248` her ikisi de `uuid: inv.id` — **teyit edildi** |
| Süit bu kusuru yakalıyor | `phase19DocumentLifecycleTest.ts:470-486` | Denetim `HizliConnectService.cancelDocument(` / `provider.cancelInvoice(` çağrı biçimini arıyor; metot tanımına eşleşmiyor → doğru WARN |

**Sonuç:** `docs/30`'daki hiçbir satır grep denetiminden geçemedi kalmadı; iddialar
bağımsız olarak doğrulandı.

### 10.2 Artifact sızıntı denetimi

Son koşunun kanıt dosyası (`.verify-tmp/faz19-gercek-akis-kanit-*.json`) `.env`'deki
9 sır anahtarına karşı tarandı:

| Denetim | Sonuç |
|---------|-------|
| Sir değerlerinden artifact'te geçen | **YOK — temiz** (9/9 sır taranmadı) |
| JWT deseni (`eyJ…`) | **YOK** |
| `authKanitlandi` / `gonderimYapildi` / `iptalYapildi` | `false` / `false` / `false` — beyan ile çıktı tutarlı |

---

## 11. Ne kanıtlandı, ne kanıtlanmadı

**Kanıtlandı:** güvenlik kapıları; belge XML üretimi ve şema doğrulaması; yaşam
döngüsü zincirinin kodda mevcut olduğu (statik); giden iptalin entegratöre
gitmediği (statik, satır bazlı); e-Arşiv UI iptalinin ERP iç kimliği gönderdiği
(statik); `sendDocument`/`cancelDocument`'un HTTP 2xx'i koşulsuz başarı saydığı
(statik).

**Kanıtlanmadı:** gerçek sandbox auth zinciri; gerçek gönderim; gerçek durum
sorgusu; gerçek iptal; kontör davranışı. Bunlar için §2.2'deki komut egress
erişimi olan makinede koşulmalıdır.

---

## 12. İlgili dosyalar

- `docs/30_FAZ19_IPTAL_ENTEGRASYON_KANITI.md` — iptal kanıt dosyası
- `docs/33_FAZ19_TEST_KORUMA_NOTU.md` — süit koruma sözleşmesi
- `docs/31_FAZ18_FAZ19_TEST_BORCLARI.md` — test borçları (B-11 güncellendi: INTEGRATION GAP olarak kesinleşti; §2b'ye ayrı koşu betiği eklendi)
- `docs/32_SON_DURUM_RAPORU_2026-09-15.md` — önceki durum raporu
- `tools/faz19-belge-akisi.ps1` · `server/tests/phase19DocumentSendFlowRun.ts`
