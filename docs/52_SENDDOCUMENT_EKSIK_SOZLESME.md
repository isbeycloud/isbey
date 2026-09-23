# docs/52 — `SendDocument` Eksik Sözleşme Raporu (Koşu 3 sonrası DURMA noktası)

**Tarih:** 17.09.2026 (güncelleme: 18.09, Koşu 4+5 sonrası)
**İlişki:** `docs/51` §7–§8 (Koşu 3–5) · `docs/48` §10.3 (kontör hükmü açık)
**Karar:** `[FAZ19_KARAR:FAIL]` (Koşu 1–4 aynı iş hatası; Koşu 5 YENİ iş hatası)
**Kural:** "Vendor sözleşmesi yetersizse endpoint uydurup kod yazma; dur ve eksik sözleşmeyi açıkça raporla." → sözleşme **resmi Swagger'dan bulundu**
(`GET /swagger/docs/v1`); kod değişikliği sözleşmeye dayandırıldı (§6).

---

## 1. Ölçülen gerçek (varsayım değil)

- Üç koşuda da API yanıtı: `[{"IsSucceeded":false,"Message":"Alıcı Vergi Kimlik No Zorunludur!"}]` (HTTP 2xx içi iş hatası).
- Koşu 3'te gönderilen XML **dosyadan okundu** (`.verify-tmp\faz19-belge-32fee9b3-….xml`):
  `AccountingCustomerParty → PartyIdentification → ID schemeID="VKN"` içinde 10 haneli değer **MEVCUT**.
- Yani "alıcı VKN'si boş gönderildi" açıklaması (`docs/51` §2) **çürütüldü**; XML'de VKN var, API yine reddediyor.
- `.env` VKN'si boş değilmiş (XML'deki VKN `.env`'den geldi; Login VKN'sinden farklı). Koşu 1+2'deki "değer boş" çıkarımı da yanlıştı.

## 2. Kod okuması hipotezleri (KANIT DEĞİL — üçü de doğrulanmadı)

1. `UblInvoiceBuilder` `PartyTaxScheme` bloğunda `CompanyID` alanı YOK — yalnız `TaxScheme/Name` yazılıyor (`ublInvoiceBuilder.ts:125-129` satıcı, `149-153` alıcı). API VKN'yi `PartyIdentification` yerine `PartyTaxScheme/CompanyID` alanından okuyor olabilir.
2. `SendDocument` gövdesi (`[{ xmlContent }]` dışında) ek alan bekliyor olabilir.
3. `.env` VKN'si sandbox mükellef kaydıyla eşleşmiyor olabilir (Login VKN'si ≠ `.env` VKN'si).

**Hiçbiri vendor belgesinde doğrulanmadı.** Bu yüzden üçü de hipotez olarak kalır; koda `CompanyID` eklenmedi, gövdeye alan eklenmedi.

## 3. Eksik sözleşme (satıcıdan gerekenler)

Aşağıdakiler repo içi dokümanlarda (`docs/21`, `docs/38`, kod yorumları) **BULUNAMADI**:

1. `SendDocument` istek şeması: `inputDocuments[]` elemanının zorunlu alanları nelerdir? Yalnız `xmlContent` yeterli mi, ek alan (alıcı VKN, alias, profil) gerekir mi?
2. "Alıcı Vergi Kimlik No" API tarafından **hangi XML yolundan** okunur? (`PartyIdentification/ID` mi, `PartyTaxScheme/CompanyID` mi, başka alan mı?)
3. Test ortamında alıcı VKN için geçerli değer kuralı nedir? (Kendi VKN'sine gönderim kabul edilir mi? Login VKN'si mi kullanılmalı?)
4. UBL-TR profili kısıtı var mı? (`TEMELFATURA` kabul edilir mi, `TICARIFATURA`/alias gerekir mi?)

Bu dört soru yanıtlanmadan 4. koşu **aynı hatayı verir** — koşulmaz.

## 4. Kontör — KAPANDI (sonrası kanıtı 17.09 akşamı)

- Gerçek `KalanKontorSorgula` yanıtı (Login VKN'siyle): kalan 236.353.622,00 (sandbox
  sanal kredisi) · harcanan giden/e-Arşiv/gelen **0** · toplam fatura 0.
- Koşu 1–5'in tamamı iş kuralında durdu; havuza kesinleşmiş fatura işlenmedi → kontör düşmedi.
- Önceki "yetkiniz yok" hatası VKN eşleşmesiydi (`.env` VKN'si ≠ Login VKN'si); Login
  VKN'si kullanılınca sayaç okundu. Bu aynı zamanda `docs/52` §2'deki 3. sorunun
  yanıtıdır: sorgu uçları **çağrıyı yapan test firmasının VKN'siyle** sorgulanmalı.
- Portal paketi (kalan 206) ile API firma kredisi (236M) ayrı havuzlardır.
- Tam hüküm: `docs/48` §10.3. `GetCredits` ucu sandbox'ta hâlâ YOK.

## 5. Yapılmayanlar

Production'a dokunulmadı, `ALLOW_PROD=true` yapılmadı, gerçek belge gönderilmedi/iptal edilmedi. Mock kullanılmadı. Credential/token/VKN değerleri bu rapora yazılmadı.

## 6. Çözüm (Koşu 4+5 sonrası — sözleşmeye dayalı)

- **Sözleşme kaynağı:** resmi Swagger (`https://econnecttest.hizliteknoloji.com.tr/swagger/docs/v1`),
  `HizliWebApp.Services.InputDocument`: `AppType` + **`DestinationIdentifier`** (alıcı VKN/TCKN, ZORUNLU)
  + `XmlContent` + `DocumentUUID` + `DocumentId` + `DocumentDate`.
- **Kök neden (kanıtlı):** kod `[{ xmlContent }]` gönderiyordu — küçük harfli alan adı ve
  `DestinationIdentifier` YOK. API "Alıcı Vergi Kimlik No Zorunludur!" diyordu çünkü alıcı
  VKN'sini gövdeden okuyor, XML içinden DEĞİL. `docs/51` §2 (boş VKN) ve §7'deki 1. hipotez
  (`CompanyID`) **yanlıştı** — düzeltiliyor.
- **Değişiklik:** `hizliConnectService.sendDocument` gövdeyi sözleşmeye göre normalleştiriyor
  (XML'den alıcı VKN + ETTN otomatik çıkarımı dahil); `cancelDocument` gövdesi
  `CancelDocumentInput` modeline bağlandı (`AppType`/`DocumentUuid`/`CancelReason`/`CancelDate`);
  `hizliTeknolojiProvider.cancelInvoice` + `documentConversionService.cancelInvoice` (fail-closed)
  + `EDonusumView.handleCancelEArsiv` (gerçek ETTN) + `efatura.ts` `cancel-earsiv` rotası bağlandı.
- **Koşu 5 kanıtı** (`…-235022.txt`): hata **değişti** → "Alıcı e-Fatura Mükellefi Değildir!".
  `DestinationIdentifier` kabul edildi; istek derin iş kuralı seviyesine ulaştı. Gönderim hâlâ
  oluşmadı (alıcı sandbox mükellefi değil) — kontör düşmedi.
- **Kalan açık:** alıcı VKN'nin sandbox mükellef kaydıyla eşleşme kuralı + UBL profili
  (yukarı §3'ün 3. ve 4. soruları). Bunlar yanıtlanmadan gönderim ayağı PASS olmaz.

## 7. Bu oturumda bağımsız doğrulananlar (Linux VM, gerçek çıktı)

- `tsc --noEmit -p tsconfig.server.json` → **EXIT 0** (18.09).
- `phase19CancelFlowTest` → **29/0** (stub tabanlı uygulama-mantığı kanıtı — GERÇEK SANDBOX PASS DEĞİL).
- `sendDocument` normalizasyon sondası (çevrimdışı, axios stub): `DestinationIdentifier` +
  `DocumentUUID` XML'den çıkarıldı; `CancelDocument` gövdesi sözleşme alanlarını taşıdı.
- `phase18` 65/65 bu ortamda TEKRAR KOŞULAMADI: süitte top-level `await` var, VM derleme
  reçetesi CommonJS emit üretiyor (kod hatası değil, koşum altyapısı sınırı). Önceki 65/65
  kaydı aynen durur; yeniden kanıt olarak KULLANILMADI.

**İlgili:** `docs/31` B-3/B-5 · `docs/48` §10.3 · `docs/50` §6 · `docs/51` §7–§8.
