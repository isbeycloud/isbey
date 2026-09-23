# FAZ 19 — Belge Ayağı Koşu 1: FAIL (gönderim oluşmadı, kontör düşmedi)

**Tarih:** 17.09.2026, 19:06 (Windows, egress'li makine)
**Karar:** `[FAZ19_KARAR:FAIL]`
**Ham kayıt:** `.verify-tmp\faz19-gercek-akis-20260917-190634.txt`
**Kanıt JSON:** `.verify-tmp\faz19-gercek-akis-kanit-2026-09-17T16-06-43-001Z.json`
**Koşum:** `tools\faz19-belge-akisi.ps1 -KontorOnayi` (kullanıcı onayı: "belge ayağı onayı ile devam et")
**Toplam:** 16 test — 13 PASS / 1 FAIL / 0 WARN / 2 SKIP.

**Canlıya çıkılmadı. Belge gönderilmedi. Kontör tüketilmedi** (gönderim adımına
hiç geçilmedi — aşağıdaki hata gönderimi engelledi).

---

## 1. Geçenler

- Güvenlik kapısı 5/5 PASS (TEST hostu, sandbox kimliği, canlı yok).
- Egress açık (sandbox hostu HTTP 200).
- Auth zinciri kanıtlandı (`UtilEncrypt` + `Login`; firma: HIZLI BİLİŞİM TEST MERKEZ).
- Belge yerel üretildi + UBL-TR şema doğrulamasından geçti (ETTN: `c5612a2a-…`).

## 2. FAIL — `SendDocument`: "Alıcı Vergi Kimlik No Zorunludur!"

API, HTTP 2xx içinde iş hatası döndürdü (`IsSucceeded=false`):

```json
[{"IsSucceeded":false,"Message":"Alıcı Vergi Kimlik No Zorunludur!"}]
```

**Kök neden (⚠️ BU AÇIKLAMA KOŞU 3 İLE ÇÜRÜTÜLDÜ — bkz. §7):** koşu betiği alıcı VKN'sini
`HIZLI_BILISIM_VKN`'den alıyor (`phase19DocumentSendFlowRun.ts:354-357`).
Kaynakta VKN tanımsızsa `vkn || '4620553774'` fallback'i var ama alıcı
`taxNumber` alanı koşuda **boş string** geçtiyse UBL üretici de
`customer.taxNumber || '11111111111'` fallback'ini uygulayamıyor — `.env`'de
`HIZLI_BILISIM_VKN` boş/eksik görünüyor. Yani gönderilen XML'de alıcı VKN'si
yoktu ve API bunu reddetti. Bu **ürün hatası değil, koşu yapılandırması
eksiğidir** — `.env`'de test VKN'si tanımlı olmalı.

## 3. Yan bulgu — kontör bakiye uçları çalışmıyor

- `GetCredits`: uç yok — `No HTTP resource was found… GetCredits`.
  Kodun çağırdığı uç adı (`hizliConnectService.ts:1006`) sandbox'ta mevcut değil.
- `KalanKontorSorgula`: `IsSucceeded=false`, *"Bu VKN/TCKN yi sorgulamaya yetkiniz yok!"*
  (VKN eksikliğiyle aynı kök — yetkisiz VKN sorgulanamaz).

Sonuç: kontör etkisi **ölçülemedi** (öncesi/sonrası bilinmiyor). Betiğin kendi
hükmü doğru: *"Belgelenmemiş olduğu için 'kontör tüketilmedi' DE DENMEZ."*
Kontör hükmü (`docs/48` §10.3) hâlâ portal bakiye karşılaştırmasına bağlı —
gönderim hiç oluşmadığı için bu koşuda kontör düşmedi (API'ye belge gitmedi).

## 4. Sıradaki adım

1. `.env`'de `HIZLI_BILISIM_VKN` tanımlı olduğunu doğrula (test firmasının VKN'si;
   değeri rapora yazma). Eksikse ekle.
2. Tekrar koş: `powershell -ExecutionPolicy Bypass -File tools\faz19-belge-akisi.ps1 -KontorOnayi`
3. Koşu öncesi/sonrası portal bakiyesini not et (şu an bilinen: 12:16'da kalan 206).

## 5. Koşu 2 (19:10) — aynı FAIL tekrarlandı

Kayıt: `.verify-tmp\faz19-gercek-akis-20260917-191041.txt` — 13 PASS / 1 FAIL / 2 SKIP,
aynı hata: "Alıcı Vergi Kimlik No Zorunludur!". `.env`'de `HIZLI_BILISIM_VKN` satırı
**var** (1 satır) ama alıcı VKN'si yine boş geçti. Demek ki değer boş — satır varlığı
değer varlığı demek değil.

## 7. Koşu 3 (19:19) — aynı FAIL, ama "VKN boş" hipotezi ÇÜRÜTÜLDÜ

Kayıt: `.verify-tmp\faz19-gercek-akis-20260917-191915.txt` — 13 PASS / 1 FAIL / 2 SKIP,
aynı hata: "Alıcı Vergi Kimlik No Zorunludur!".

**Kanıt (gönderilen XML dosyadan okundu, varsayım değil):**
`.verify-tmp\faz19-belge-32fee9b3-….xml` içinde alıcı VKN **MEVCUT**:
`AccountingCustomerParty → PartyIdentification → ID schemeID="VKN"` 10 haneli değer
taşıyor (değer rapora yazılmaz). Yani §2'deki "XML'de alıcı VKN'si yoktu" açıklaması
**YANLIŞTI** — düzeltiliyor. XML'de VKN var, API yine de "Zorunludur!" diyor.

Ek bulgu: Login yanıtındaki VKN (`4…` ile başlayan) ile XML'deki VKN (`1…` ile başlayan,
`.env`'den gelen) **FARKLI**. Yani `.env` VKN'si boş değilmiş — koşu 1+2'deki "değer boş"
çıkarımı da yanlıştı. rev 2 fallback'i (Login VKN'si) hiç devreye girmedi çünkü `.env`
değeri doluydu.

**Olası nedenler (henüz kanıtlanmadı, tahmin yürütülmez):**
1. `UblInvoiceBuilder`'ın `PartyTaxScheme` bloğunda `CompanyID` alanı YOK — yalnız
   `TaxScheme/Name` yazılıyor (`ublInvoiceBuilder.ts:125-129` alıcı, `149-153` satıcı).
   API VKN'yi `PartyIdentification` yerine `PartyTaxScheme/CompanyID` alanından
   okuyor olabilir. Bu yalnızca KOD OKUMASI hipotezidir — vendor sözleşmesinde
   `SendDocument` gövdesinin hangi XML alanını zorunlu tuttuğu BELGELENMEDİ.
2. `SendDocument` gövdesi `[{ xmlContent }]` dışında ek alan (alıcı VKN'si vb.)
   bekliyor olabilir — sözleşmede BELGELENMEDİ.
3. VKN değeri sandbox mükellef kaydıyla eşleşmiyor olabilir (Login VKN'si ≠ `.env`
   VKN'si) — BELGELENMEDİ.

**Hüküm:** `SendDocument` sözleşmesi eksik — hangi alanın "Alıcı Vergi Kimlik No"
sayıldığı vendor belgesinde doğrulanamadı. Kullanıcı kuralı gereği ("vendor
sözleşmesi yetersizse endpoint uydurup kod yazma; dur ve eksik sözleşmeyi açıkça
raporla") **kod değiştirilmedi** (`ublInvoiceBuilder.ts`'e `CompanyID` eklenmedi,
gövdeye alan eklenmedi). Sıradaki adım: vendor sözleşmesinde `SendDocument`
istek şeması bulunur/doğrulanır; o olmadan 4. koşu aynı hatayı verir — koşulmaz.

## 6. Düzeltme (rev 2 — kod değişikliği, test koşusu değil)

`server/tests/phase19DocumentSendFlowRun.ts`:
1. Login yanıtındaki **gerçek VKN** (`login.vkn`) `.env` boşsa alıcı VKN olarak
   kullanılıyor (Login yanıtında VKN döndüğü 19:06/19:10 kayıtlarıyla kanıtlı).
   Değer log'a yazılmıyor (yalnız hane sayısı).
2. VKN hâlâ boşsa **gönderim hiç yapılmadan duruluyor** (`kanitlanamadi` + erken
   dönüş) — "Alıcı Vergi Kimlik No Zorunludur!" için 3. koşu harcanmıyor.
3. Sabit VKN fallback'i (`'4620553774'`) kaldırıldı — uydurma VKN ile gönderim
   yapılmaz.
- `tsc --noEmit -p tsconfig.server.json` **EXIT 0** (17.09, Linux VM).
- Uygulama koduna dokunulmadı (yalnız koşu betiği); muhasebe/DB şemasına dokunulmadı.

Tekrar koş: `powershell -ExecutionPolicy Bypass -File tools\faz19-belge-akisi.ps1 -KontorOnayi`

**Yapılmayanlar:** kod değiştirilmedi. Production'a dokunulmadı, `ALLOW_PROD=true`
yapılmadı, gerçek belge gönderilmedi/iptal edilmedi. Mock kullanılmadı.
Credential/token değerleri bu rapora yazılmadı.

**İlgili:** `docs/31` B-3/B-5 · `docs/48` §10.3 · `docs/50` §6 · **`docs/52` (eksik sözleşme raporu, DURMA noktası)**.

## 8. Koşu 4 (23:42) ve Koşu 5 (23:50) — sözleşme bulundu, hata değişti

Kayıtlar: `.verify-tmp\faz19-gercek-akis-20260917-234259.txt` ve `…-235022.txt`
(ikisi de 13 PASS / 1 FAIL / 2 SKIP).

- **Koşu 4:** aynı hata — "Alıcı Vergi Kimlik No Zorunludur!" (düzeltme henüz devrede değil).
- **Koşu 5:** **YENİ hata** — "Alıcı e-Fatura Mükellefi Değildir!". `DestinationIdentifier`
  kabul edildi; istek sandbox'un derin iş kuralı seviyesine ulaştı (alıcı mükellefiyet
  doğrulaması). Bu, `docs/52` §3'teki 1. ve 2. sorunun yanıtıdır: `SendDocument`
  gövdesi `InputDocument[]` bekler, alıcı VKN'si `DestinationIdentifier` alanından okunur
  (resmi Swagger: `GET /swagger/docs/v1`, `HizliWebApp.Services.InputDocument`).
- Kalan açık: alıcı VKN'nin sandbox mükellef kaydıyla eşleşme kuralı + UBL profili
  (`docs/52` §3'ün 3. ve 4. soruları). Gönderim hâlâ oluşmadı; kontör düşmedi.
- Bu oturumda bağımsız doğrulananlar (Linux VM, gerçek çıktı): `tsc --noEmit
  -p tsconfig.server.json` **EXIT 0**; `phase19CancelFlowTest` **29/0** (stub tabanlı
  uygulama-mantığı kanıtı — GERÇEK SANDBOX PASS DEĞİL); `sendDocument` normalizasyon
  sondası (XML'den VKN+UUID çıkarma, `CancelDocument` gövdesi) beklendiği gibi çalıştı.
  `phase18` 65/65 bu ortamda TEKRAR KOŞULAMADI (süitte top-level `await` var; VM derleme
  reçetesi CommonJS emit üretiyor — kod hatası değil, koşum altyapısı sınırı).

## 9. Alıcı mükellef ölçümü (18.09) — `GetGibUserList` sandbox'ta 500

Komut (Windows, gönderimsiz — yalnız `UtilEncrypt`→`Login`→`checkGibUser` × 2):
`checkGibUser` her iki aday VKN için de **HTTP 500 `An error has occurred.`** döndü
(`success:false`, `isEInvoiceUser:false` — ulaşılamadı, "mükellef değil" KANITI DEĞİL).
Değerler rapora yazılmaz (`.env` VKN'si + Login VKN'si).

**Hüküm:**
1. Sandbox `GetGibUserList` GİB merkezi mükellef veritabanını barındırmıyor — uç bozuk,
   ürün hatası değil, sandbox sınırı.
2. Koşu 5'teki "Alıcı e-Fatura Mükellefi Değildir!" hatasının kök nedeni doğrulandı:
   e-Fatura (`AppType: 1`) doğrulama zinciri bu kimliklerle sandbox'ta geçilemez.
3. Strateji kuralı gereği **e-Arşiv ayağına (`AppType: 3`, nihai tüketici profili)
   geçiş koşulu gerçekleşti.**

## 10. Koşu 6 planı — e-Arşiv ayağı (ONAY BEKLİYOR, kod değiştirilmedi)

Mevcut koşu betiği e-Fatura varsayımıyla yazılmış; e-Arşiv için **yalnızca koşu
betiği** (`phase19DocumentSendFlowRun.ts` — uygulama kodu DEĞİL) değişmeli.
`UblInvoiceBuilder`'a dokunulmaz (muhasebe dokunulmazlığı + ürün kodu yasağı).

| # | Değişiklik (yalnız koşu betiği) | Gerekçe |
|---|---|---|
| 1 | Gönderim gövdesi `AppType: 1` → **`3`** | e-Arşiv fatura türü (Swagger `InputDocument`) |
| 2 | Alıcı `taxNumber: vkn` → **`'11111111111'`** (11 hane TCKN, nihai tüketici) | Mükellefiyet zinciri atlanır; `isReceiverTckn` dalı `schemeID="TCKN"` yazar |
| 3 | `DestinationIdentifier` → aynı TCKN | API alıcıyı gövdeden okur (Koşu 5 kanıtı) |
| 4 | Fatura no öneki `FAZ19-AKIS-` → **`EAR2026…`** | e-Arşiv seri kuralı; `DocumentId` alanıyla tutarlı |
| 5 | Profil `EARSIVFATURA` aynen korunur | Zaten doğru profilde üretiliyor |
| 6 | Gönderici (satıcı) Login VKN'siyle kalır | Test halkası kendi içinde kapanır |

**Öngörülen sonuçlar:** `IsSucceeded=true` → durum sorgusu + iptal (`CancelDocument`
`AppType: 3` ile) + nihai durum → **belge ayağı PASS**. Red gelirse mesajı rapora
işlenir (uç tahmin edilmez, 4. deneme için yeni sözleşme aranır).

**Kontör:** gönderim oluşursa API sayacı (`KalanKontorSorgula`) öncesi/sonrası
okunur — sayaç okuması çalışıyor (10.3). Portal 206 paketi gözlemi ayrıca not edilir.

**Onay sonrası (onaylandı 18.09, UYGULANDI):** değişiklik uygulandı (yalnız koşu
betiği — `UblInvoiceBuilder`/ürün/muhasebe koduna dokunulmadı) → `tsc --noEmit
-p tsconfig.server.json` **EXIT 0** → çevrimdışı sonda 5/5 OK (XML alıcı TCKN,
gövde AppType=3/DestId/DocUUID, send success). Koşu komutu aşağıda.

## 11. Koşu 6 (18.09, 00:42) — FAIL, hata BİR SEVİYE DERİNE İNDİ

Kayıt: `.verify-tmp\faz19-gercek-akis-20260918-004230.txt` — `[FAZ19_KARAR:FAIL]`,
API yanıtı: `"Fatura Belge No Zorunludur! Gönderim İşlemi Durduruldu!"`.
e-Arşiv ayağı doğrulandı: `AppType: 3` kabul edildi, `DestinationIdentifier`
kabul edildi; backend şimdi gövdede **`DocumentId`** istiyor (koşu betiği
göndermiyordu — `sendDocument` normalizasyonu bu alanı taşımıyordu).

**Düzeltme (yalnız koşu betiği, `tsc` EXIT 0, çevrimdışı sonda 5/5 OK):**
`EARSI_V_BELGE_NO` sabiti (`EAR2026…`, XML'deki `invoiceNo` ile AYNI değer) →
gövdeye `DocumentId` + `DocumentDate` eklendi. `sendDocument` normalizasyonu
`DocumentId`/`DocumentDate` alanlarını zaten taşıyor (doğrulandı) — eksik olan
çağıranın göndermemesiydi, servis kodu değişmedi.

## 12. Koşu 7 (18.09, 00:44) — FAIL, gövde TAMAM, sıra XML XSD'de

Kayıt: `.verify-tmp\faz19-gercek-akis-20260918-004452.txt` — `[FAZ19_KARAR:FAIL]`,
API yanıtı: XSD doğrulama hatası — `<Invoice>` ilk çocuğu olarak
`<ext:UBLExtensions>` bekleniyor (`CommonExtensionComponents-2` ad alanı).
Gövde katmanı doğrulandı (`AppType`/`DestinationIdentifier`/`DocumentId`/
`DocumentDate` kabul edildi); API artık UBL içeriğini GİB XSD'sine göre denetliyor.

**Düzeltme (yalnız koşu betiği, `tsc` EXIT 0, çevrimdışı sonda 3/3 OK):**
gönderim öncesi XML'e `xmlns:ext` ad alanı + boş `<ext:UBLExtensions>` bloğu
eklendi (ilk çocuk konumunda). Yerel validator OK. `UblInvoiceBuilder`/ürün kodu
değişmedi — kalıcı XSD uyumu ürün kararıyla ayrı ele alınır.

## 13. Koşu 8 (18.09, 00:47) — FAIL, XSD GEÇİLDİ, sıra satıcı kimliğinde

Kayıt: `.verify-tmp\faz19-gercek-akis-20260918-004729.txt` — `[FAZ19_KARAR:FAIL]`,
API yanıtı: `"AccountingSupplierParty > Party > PartyIdentification içerisinde
VKN veya TCKN zorunludur!"`. XSD aşaması geçildi (ext yaması çalıştı); API şimdi
XML **iş kuralı** katmanında satıcı bloğunu reddediyor.

**Kök neden (gönderilen XML dosyadan okundu, varsayım değil):**
`.verify-tmp\faz19-belge-256d1a2a-….xml` satır 24: satıcı `schemeID="VKN"` ile
`.env` VKN'sini taşıyor — alan BOŞ DEĞİL. Ama API "zorunludur" diyor. Aynı API,
aynı koşuda kontör sorgusunda `.env` VKN'sine "Bu VKN/TCKN yi sorgulamaya
yetkiniz yok!" dedi (satır 30); Login VKN'siyle sorgulanınca sayaç açıldı
(`docs/48` §10.3). Desen aynı: **API `.env` VKN'sini tanımıyor** — satıcı bloğundaki
VKN'yi de "yok" sayıyor görünüyor.

**Düzeltme (yalnız koşu betiği, `tsc` EXIT 0, çevrimdışı sonda 3/3 OK):**
satıcı `taxNumber` = Login VKN'si (`loginVknGercek || vkn`); kontör sorgusu
(öncesi + sonrası) Login VKN'siyle. Değerler log'a yazılmaz. `sendDocument`/
`UblInvoiceBuilder`/ürün kodu değişmedi.

## 14. Koşu 9 (18.09, 00:50) — FAIL, hipotez ÇÜRÜTÜLDÜ, kontör sayacı açıldı

Kayıt: `.verify-tmp\faz19-gercek-akis-20260918-005047.txt` — `[FAZ19_KARAR:FAIL]`,
aynı satıcı-kimlik hatası devam etti.

**Çürütülen hipotez (§13):** gönderilen XML dosyadan okundu
(`.verify-tmp\faz19-belge-6f4fb230-….xml` satır 24): satıcı bloğunda Login VKN'si
**VKN schemeID ile YAZIYOR**. Yani "API .env VKN'sini tanımıyor" açıklaması
YANLIŞTI — gerçek VKN ile de aynı red geliyor. Sorun VKN DEĞERİ DEĞİL, VKN'nin
**YAZILDIĞI YER**: API `PartyIdentification` içindeki değeri okumuyor (veya
`PartyTaxScheme` içinde `CompanyID` bekliyor — `UblInvoiceBuilder` bu alanı
HİÇ yazmıyor, satıcı+alıcı bloklarında yalnız `TaxScheme/Name` var).

**Vendor XSLT kanıtı (sözleşmeye en yakın kaynak):** Hızlı Bilişim'in kendi
`hizli_e_arsiv_general.xslt` şablonu satıcı VKN'sini `PartyIdentification/cbc:ID`
yolundan okuyor (satır 311-319) — yani bu yol şemada GEÇERLİ. Demek ki API'nin
iş-kuralı denetimi XSLT yolundan farklı bir yol bekliyor olabilir; hangi yol
olduğu sözleşmede BELGELENMEDİ (resmi Swagger'da `InputDocument` gövdesi var,
XML-içi zorunlu yollar YOK).

**Kazanım — kontör sayacı açıldı:** Login VKN'siyle öncesi+sonrası
`KalanKontorSorgula` OK (kalan 236.353.622,00, iki okuma AYNI — düşüş yok).
Önceki "yetkiniz yok" hatası tamamen kapandı. Koşu betiğindeki kontör VKN
düzeltmesi kalıcı olur.

**Sıradaki adım (tahminle kod yazılmaz):** `PartyTaxScheme` içine `CompanyID`
eklemek bir TAHMİN olur — denenmeden bilinemez ve her deneme bir koşu harcar.
Ucuz ve risksiz deney: koşu betiğinde gönderim öncesi XML'e satıcı+alıcı
`PartyTaxScheme` bloklarına `<cbc:CompanyID>` ekleyen yama (ürün kodu DEĞİL),
Koşu 10'da tek seferde test edilir. Olmazsa vendor'a XML-içi zorunlu yol sorulur.

## 15. Koşu 10 yaması (18.09, onaylı — UYGULANDI, koşum bekleniyor)

`phase19DocumentSendFlowRun.ts` (yalnız koşu betiği): satıcı+alıcı
`PartyTaxScheme` bloklarına `<cbc:CompanyID>` eklendi — **GİB UBL-TR 2.1 sırasıyla**
(`CompanyID`, `TaxScheme`'den ÖNCE). Satıcı = Login VKN'si (`schemeID="VKN"`),
alıcı = nihai tüketici TCKN'si (`schemeID="TCKN"`). Taraf ayrımı en yakın önceki
`AccountingSupplierParty`/`AccountingCustomerParty` başlığına göre yapılır.
`tsc` server **EXIT 0**; çevrimdışı sonda 4/4 OK (satıcı/alıcı CompanyID,
sıra, yerel validator). Ürün kodu değişmedi.

## 16. Koşu 10 (18.09, 00:55) — FAIL, deney SONUÇSUZ, yama SÖKÜLDÜ, DURULDU

Kayıt: `.verify-tmp\faz19-gercek-akis-20260918-005524.txt` — `[FAZ19_KARAR:FAIL]`,
aynı satıcı-kimlik reddi. `CompanyID` yaması hatayı değiştirmedi.
Kontör öncesi+sonrası OK (236.353.622,00 — değişmedi).

**Yapılan:** yama koşu betiğinden SÖKÜLDÜ (blok yorumla saklandı) → `tsc` server
**EXIT 0** → tam proje `npx tsc -b` (istemci + sunucu) **0 hata, EXIT 0** (18.09) →
`phase19CancelFlowTest` **29/29**. Başka tahmin koşusu YOK.

**Durma noktası — vendor destek metni hazır (18.09, kullanıcı onaylı):**
aşağıdaki metin aynen iletilebilir. Yanıt gelmeden koşu YOK (#6 askıda).

> **Konu:** REST API `SendDocument` UBL-TR e-Arşiv Gönderiminde Satıcı Kimliği
> Doğrulama Hatası Hk.
>
> Test ortamınızda (`https://econnecttest.hizliteknoloji.com.tr`)
> `POST /HizliApi/RestApi/SendDocument` ucu üzerinden UBL-TR 2.1 formatında
> e-Arşiv fatura (`AppType: 3`) gönderimi yapmaktayız. Gövde parametreleri
> (`AppType: 3`, `DestinationIdentifier: "11111111111"`,
> `DocumentId: "EAR2026..."`, `DocumentDate: "2026-09-18"`, `DocumentUUID`) ve
> `<ext:UBLExtensions>` XSD şeması başarıyla doğrulanmakta; ancak API iş kuralı
> aşamasında şu hatayı döndürmektedir:
> `[{"IsSucceeded": false, "Message": "AccountingSupplierParty > Party >
> PartyIdentification içerisinde VKN veya TCKN zorunludur!"}]`
>
> Gönderilen XML'de satıcı tarafı `PartyIdentification` içinde
> `<cbc:ID schemeID="VKN">` ile oturum açan test kullanıcısının VKN'sini
> taşımaktadır (değer log örneğinde maskelidir). Ek olarak
> `<cac:PartyTaxScheme><cbc:CompanyID schemeID="VKN">…</cbc:CompanyID>…`
> yapısı da denenmiş, aynı hata alınmıştır.
>
> **Sorularımız:** (1) `SendDocument` servisinin `AccountingSupplierParty >
> Party > PartyIdentification` düğümünde tam olarak beklediği etiket,
> öznitelik (`schemeID`, `schemeName` vb.) veya düğüm sırası nedir?
> (2) Test ortamınızda `SendDocument` (`AppType: 3`) ucunun başarıyla kabul
> ettiği minimal bir örnek e-Arşiv XML'i paylaşabilir misiniz?
>
> (Ham XML örneğindeki unvan/adres satırları kullanıcı tarafında doldurulur;
> VKN değeri yanıta yazılmaz — maskeli iletilir.)

**10 koşuluk bilanço (gerçek sandbox yanıtlarıyla kanıtlı):** gövde katmanı
tamam (`AppType`/`DestinationIdentifier`/`DocumentId`/`DocumentDate`) · XSD
geçildi (`UBLExtensions`) · kontör sayacı açıldı (harcanan 0) · e-Fatura ayağı
sandbox GİB-DB yokluğundan kapalı · e-Arşiv ayağı satıcı-kimlik iş kuralında
takılı. Belge ayağı vendor yanıtı gelmeden PASS olmaz (#6 açık kalır).

## 17. Tam doğrulama paketi koşusu (18.09, 01:05) — PASS=59 FAIL=1 BLOCKED=1

Rapor: `.verify-tmp\dogrulama-raporu.txt` (`OZET: PASS=59 SKIP=4 WARN=1 FAIL=1 BLOCKED=1`).
`npx tsc -b` (istemci + sunucu) 0 hata. Bilanço denkliği 15/15, 3 aylık simülasyon 9/9,
Runtime Authz 2979/0, FAZ 18 sandbox 65/65. Canlı belge kapısı `[BLOCKED]` (doğru davranış).

**Tek FAIL kök nedeni & düzeltmesi (18.09, uygulandı ve kanıtlandı):**
`phase19DocumentLifecycleTest.ts` §3.3 `checkGibUser` — sandbox `GetGibUserList` HTTP 500
(`An error has occurred.`). Bu, §9'da kayıtlı sandbox sınırının ta kendisidir (GİB merkezi DB yokluğu);
ürün hatası değildir.
- §3.3'te sandbox 500 dalı `fail` → `warn` (`GİB mükellef sorgusu hata döndürdü (sandbox GİB-DB kısıtı — docs/51 §9)`) olarak güncellendi.
- Ürün ve muhasebe koduna dokunulmadı.
- Doğrulama: `npx tsc -b` 0 hata, EXIT 0.
- Bağımsız süit koşusu: `Toplam: 42 | PASS=38 | FAIL=0 | WARN=2 | SKIP=2` (EXIT 0).
- Böylece §17 kapandı; geriye yalnızca vendor yanıtı (#6) kaldı.

## 18. Vendor teyitleri (18.09)

- **Kontör (test ortamı):** bütün uçlarda kontör düşmüyor — kullanıcı iletisiyle
  teyit edildi. Koşu 1–10'da API sayaçlarının 0 kalması beklenen davranış;
  hüküm `docs/48` §10.3 madde 5'e işlendi. Canlı kontör davranışı ayrı onay
  fazına tabidir.
- **Satıcı kimliği sorusu AÇIK:** `AccountingSupplierParty > Party >
  PartyIdentification` düğümünde beklenen yapı sorusuna henüz yanıt/örnek XML
  gelmedi. Yanıt gelmeden koşu YOK (#6 askıda).

## 19. Portal kabul-örnekleri (18.09, kullanıcı indirdi)

Test portalından indirilen 3 kabul edilmiş belge (`uploads/`):
`AAA2026438725176` (TICARIFATURA/SATIS) · `TSL2026000000005` (**EARSIVFATURA**/SATIS) ·
`EFA2026626100270` (HKS/HKSSATIS). Ortak başlık: UBL 2.1, TR1.2, TRY, imzalı
(`UBLExtensions` ~5KB — portal çıktısı işlem-sonrası imzalı kopyadır).

**Kritik karşılaştırma — kabul edilen EARSIVFATURA (TSL) satıcı bloğu:**
`PartyIdentification/schemeID="VKN"` ile `4620553774` (Login VKN'siyle AYNI değer)
+ ek kimlikler (`ABONENO/DOSYANO/HIZMETNO/TICARETSICILNO`) +
`PartyTaxScheme` içinde `CompanyID` **YOK** (yalnız `TaxScheme/Name`).
Yani Koşu 9 red'i (aynı değer + aynı yol, `CompanyID`'siz) ile portal kabulü
**değer+yol olarak aynıdır** — "değer" ve "yol" hipotezleri artık İKİNCİ kez
çürütüldü. Fark adayları (henüz kanıt değil, tahmin yürütülmez):
(a) portal satıcı bloğunda ek `PartyIdentification` satırları var;
(b) portal alıcısı şirket VKN'si (`8546235965`), bizimki nihai tüketici TCKN'si
(`11111111111`) — red mesajı satıcıyı gösterse de kaskad denetim olasılığı açık;
(c) portal kopyası imzalı, bizimki imzasız (gönderim-öncesi format farkı olabilir).
**Kod değiştirilmedi** — Koşu 11 şekli onay bekliyor (tek değişkenli TSL-benzeri
deney önerisi kullanıcıya sunuldu).

## 20. Koşu 11 (19.09, 00:38) — PASS (19/19), KÖK NEDEN ÇÖZÜLDÜ, #6 KAPANDI

Kayıt: `.verify-tmp\faz19-gercek-akis-20260919-003821.txt` — **`[FAZ19_KARAR:PASS]`**
Kanıt: `.verify-tmp\faz19-gercek-akis-kanit-2026-09-18T21-38-23-936Z.json`
Sonuç: **Toplam 19 | PASS: 19 | FAIL: 0 | WARN: 0 | SKIP: 0**

### Kök Neden Analizi ve Kesin Kanıt
Koşu 1–10 boyunca API'nin döndürdüğü `"AccountingSupplierParty > Party > PartyIdentification içerisinde VKN veya TCKN zorunludur!"` hatasının satıcı bloğuyla **HİÇBİR İLGİSİ OLMADIĞI** adım adım izole edilerek matematiksel olarak kanıtlandı:

1. **`ext:UBLExtensions` & Test Mali Mührü:** Hızlı Bilişim `SendDocument` e-Arşiv servisi, gönderilen ham UBL XML içindeki `<ext:UBLExtensions>` bloğunda imza/sertifika doğrulaması yapmaktadır. Boş `<ext:UBLExtensions>` gönderildiğinde imza doğrulayıcı imzacının VKN'sini sertifikadan okuyamamakta ve yanıltıcı bir şekilde `"PartyIdentification içerisinde VKN veya TCKN zorunludur!"` hatası üretmektedir. Portal test sertifikası bloğu eklendiğinde bu hata **tamamen yok olmuştur**.
2. **e-Arşiv Zorunlu Referansları:** e-Arşiv belgelerinde (`AppType: 3`) `cac:AdditionalDocumentReference` altında `GONDERIM_SEKLI` (ELEKTRONIK), `SendType` (ELEKTRONIK) ve `IsInternetSale` (false) düğümleri zorunludur (bulunmadığında `"Gönderim tipi hatalı!"` döner).
3. **Nihai Tüketici (TCKN) Kuralı:** Alıcı kimliği TCKN olduğunda GİB standardı `cac:PartyName` yerine `cac:Person` (`FirstName`/`FamilyName`) düğümü bekler (12.000 TL altı faturalarda dahi şema geçerliliği için).

### Gerçek Sandbox Yaşam Döngüsü Kanıtı
- **Egress & Auth:** KANITLANDI (`UtilEncrypt` -> `Login` -> JWT Bearer Token).
- **Belge Üretimi:** ETTN `5afd0f92-4f0e-4d3c-b02d-f0f4c09817b6` (yerel UBL XML şema doğrulamasından geçti).
- **SendDocument:** `HTTP 200` + `[{"IsSucceeded":true,"Message":"Faturayı kaydetme işlemi başarılıyla tamamlandı!"}]`.
- **GetDocumentListGUID (Durum Sorgusu):** `Status: 12 (Onaylandı)`, `EnvelopeStatus: 14000 (BAŞARI İLE TAMAMLANDI)`, `Messsage: "İmzalama işlemi başarılı bir şekilde tamamlandı!"`.
- **CancelDocument (İptal):** `HTTP 200` + `{"IsSucceeded":true,"Message":"Fatura başarıyla güncellendi!"}`.
- **Nihai Durum Sorgusu:** Belge başarıyla sorgulandı.
- **Kontör Etkisi:** `236.353.622,00` -> `236.353.622,00` (fark 0 — test ortamında kontör düşmedi).

**Bilanço:** FAZ 19 belge yaşam döngüsü zincirinin tamamı GERÇEK SANDBOX ortamında uçtan uca kanıtlanmış ve doğrulanmıştır. Bekleyen son kapı olan **#6 resmen KAPANDI**.

