# FAZ 19 — Gönderim İzi Sorgusu `AppType: 1` Gönderiyor (Ölçülmemiş Varsayım)

**Tarih:** 16.09.2026
**Durum:** 🔴 **ÖLÇÜM / BULGU** — hiçbir kod değiştirilmedi, hiçbir ölçüm koşulmadı.
Bu belge bir **tespit** ve bir **ölçüm talebidir**.
**Canlı API'ye istek gönderilmedi. Belge gönderilmedi/iptal edilmedi. Kontör tüketilmedi.**

---

## 1. Sorun — tek cümle

`docs/40` ölçümü, `CancelDocument` ucunda **`AppType` numaralandırmasının
`1=e-Fatura, 2=e-Arşiv, 3=e-İrsaliye` OLMADIĞINI** kanıtladı (o uçta `3=e-Arşiv,
6=e-SMM, 7=Müstahsil`). Ama aynı numaralandırmayı kullanan **`GetDocumentListGUID`**
ucu bu ölçüme hiç dâhil edilmedi — ve gönderilen belgelerin **durum sorgusu** o uçtan
geçiyor.

---

## 2. Ölçüm — çağrı yerleri

`GetDocumentListGUID`'e giden **beş** yolun hepsi `appType = 1` gönderiyor:

| # | Çağrı yeri | Gönderilen | Bağlam |
|---|---|---|---|
| 1 | `hizliConnectService.ts:1567` (`getInvoiceStatus` gövdesi) | `1` | Sabit — tüm sağlayıcı-üstü durum sorgusu buradan geçer |
| 2 | `hizliTeknolojiProvider.ts:236` (`getInvoiceStatus`) | `1` | Sabit |
| 3 | `hizli-bilisim.ts:951` (`sync-portal-invoices`) | `1` | Yorumu: `// AppType 1: e-Fatura` |
| 4 | `phase19DocumentLifecycleTest.ts:338` | `1` | Test |
| 5 | `phase19DocumentSendFlowRun.ts:418,458` | `1` | Test |

Gönderim yolu (`sendDocument`) ise **`AppType` hiç göndermiyor** — gövde yalnız
`xmlContent` taşıyor; belge türü XML'in kendisinden anlaşılıyor. Yani gönderim
tarafında bir tür seçimi yok, **sorgu tarafında sabit bir varsayım var.**

---

## 3. Neden bu bir kusur adayı

`docs/40` §1, API'nin geçerli tür listesini **kendi hata mesajında beyan ettiğini**
gösterdi (o uç için `3, 6, 7`). Aynı satıcının uçları arasında numaralandırma
tutarsızsa, durum sorgusunun `1` göndermesi şu sonucu doğurur:

> **e-Arşiv olarak gönderilmiş bir belgenin durumu, `AppType: 1` (e-Fatura) ile
> sorgulandığında bulunamaz** — belge `MOCK_SENT`/`SENT` durumunda takılı kalır,
> gerçek GİB durumu hiç öğrenilemez.

Bu **sessiz bir başarısızlıktır**: sorgu HTTP 200 döner, `documents` dizisi boş
gelir, kod güncellenecek kayıt bulamaz ve belge "gönderildi" olarak kalır.

### 3.1 Repoda üç ayrı, birbiriyle uyuşmayan sözlük var

| Yer | İddia | Ölçüldü mü? |
|---|---|---|
| `hizliConnectService.ts:566` (`cancelDocument`) | `3=e-Arşiv, 6=e-SMM, 7=Müstahsil` | ✅ **ÖLÇÜLDÜ, DOĞRU** (`docs/40`) |
| `hizliConnectService.ts:686` (`getDocumentList`) | `1=e-Fatura, 2=e-Arşiv, 3=e-İrsaliye, 4=e-SMM, 5=e-Müstahsil` | ⛔ **ÖLÇÜLMEDİ** — ama çağrı yeri (`efatura.ts:1446,1469`) `\|\| 1` varsayıyor |
| `hizliConnectService.ts:432` (`sendApplicationResponse`) | `1 = e-Fatura (bu ucun numaralandırması)` | ⛔ **ÖLÇÜLMEDİ** |

**Kritik:** `docs/40`, ikinci sözlüğü "bu uç için YANLIŞ" diye işaretledi — ama
"bu uç" `CancelDocument` idi. `GetDocumentListGUID` **ayrı bir uçtur** ve
numaralandırması ölçülmemiştir. `docs/40` §7 zaten bunu açıkça kabul ediyor:

> *"`getDocumentList` yorumu düzeltilmedi (bu uç için yanlış olsa da `getDocumentList`
> çağrısının kendi bağlamında doğru olabilir — **ölçülmedi**)."*

⚠️ **Sözlüklerin farklı olması tek başına kusur değildir.** Farklı uçların farklı
numaralandırması normal olabilir. Kusur, **ölçmeden sabit yazmak** ve **yanlış
sabit yazıldığında bunun sessizce boş liste dönmesidir.**

---

## 4. Yan bulgu — `GetDocumentList` ucu da aynı varsayımı taşıyor

`efatura.ts:1446` ve `:1469` (`/hizli/documents`, `/hizli/document-file`) da
`Number(req.query.appType) || 1` ile varsayılan `1` kullanıyor. Arayüz bu uçlara
`appType` açıkça geçmiyorsa, e-Arşiv belgeleri yine yanlış türle sorgulanır.

---

## 5. ⛔ Dürüstlük sınırı

Bu belge **hiçbir şeyi kanıtlamaz.** Kanıtladığı tek şey şudur:

- ✅ Kodun `GetDocumentListGUID`'e **her yerde `1` gönderdiği** (kaynak okuması)
- ✅ Bu numaralandırmanın **hiç ölçülmediği** (`docs/38`/`docs/39`/`docs/40` kapsamı dışı)
- ✅ Repoda **üç ayrı sözlük** bulunduğu ve yalnız birinin doğrulandığı

Kanıtlamadığı:

- ⛔ `1`'in bu uçta **yanlış** olduğu — doğru da olabilir
- ⛔ e-Arşiv belgelerinin şu an durum sorgusunda bulunamadığı
- ⛔ Sorunun üretimde **fiilen yaşandığı** (gönderilmiş gerçek belge yok)

Yani bu bir **kusur iddiası değil, ölçülmemiş varsayım tespitidir.** Dili buna
göre kurulmalıdır.

---

## 6. Önerilen ölçüm (kontör yakmayan)

`docs/39`'un aracı (`tools/faz19-cancel-sozlesme-ispeti.ps1`) ile **aynı yöntem**
`GetDocumentListGUID` ucuna uygulanabilir:

| Deney | Gövde | Amaç |
|---|---|---|
| D0 (kontrol) | `appType` **hiç yok** | "AppType eksik" ile "AppType geçersiz" ayrışıyor mu? |
| D1…D7 | `appType` = 1…7 | Hangi değerler doğrulamadan geçiyor? |
| — | **uydurma UUID listesi** | Belge gönderilmez, kontör yakılmaz |

**Okunacak çıktı:** her `AppType` için dönen mesaj. Eğer `3` (veya başka bir değer)
kontrol mesajından **ayrışıyorsa**, doğru sözlük kanıtlanır. Eğer **hiçbiri
ayrışmıyorsa**, bu uçta `AppType` doğrulanmıyor demektir ve soru vendor'a gider.

⚠️ Bu ölçüm **ayrı bir izin turu gerektirir** (mevcut kod değiştirilmez, ama
egress'li makinede sandbox'a istek gider). Ayrıca `GetDocumentListGUID` bir
**sorgu** ucudur; `CancelDocument` gibi mutasyon değildir — kontör riski
`docs/48` kapsamında **bilinmiyor** ve ölçümden önce doğrulanmalıdır.

**Durum (17.09.2026):** Ölçüm aracı YAZILDI, **koşturulmadı**:
`server/tests/phase19GuidContractProbe.ts` + `tools/faz19-guid-sozlesme-ispeti.ps1`
(`docs/39` aracıyla aynı kalıp: güvenlik kapısı, auth zinciri, KOSULAMADI dalı,
JWT maskeli kanıt dosyası). `tsc --noEmit -p tsconfig.server.json` **EXIT 0**.
Araçta `SendDocument`/iptal/kontör çağrısı YOK (taranarak doğrulandı); tek hedef
`POST …/HizliApi/RestApi/GetDocumentListGUID`. Koşum izni + kontör doğrulaması
bekliyor.

---

## 7. `GetDocumentReceiverAllList` — kapsam notu (17.09.2026)

Bu ucun gövdesi `GetDocumentListGUID`'ten farklıdır: `AppType` **almıyor**;
`dateType/startDate/endDate[/takenFromEntegrator]` sorgu parametreleriyle
çalışıyor (`hizliConnectService.ts:1304-1328`). Yanıt şemasının (`documents`
dizisi) kodun beklediği biçimde olup olmadığı da **ölçülmedi**.

Tek somut bilgi: `getIncomingInvoices` (`:1588-1598`) yanıtı
`res.data?.documents || res.data || []` ile normalize ediyor — şema
belirsizliğine karşı esnek yazılmış, gövde doğrudan kullanılmıyor. Bu bir
koruma, ama şemanın doğru olduğuna dair kanıt değil.

**Hüküm:** `ReceiverAllList` için sözleşme sorusu açık ama **acil değil** —
uç `AppType` varsayımı taşımıyor, yanıtı normalize eden koruma var.
Gerçek bir gelen-belge akışında ilk uyumsuzlukta yeniden ele alınır.

---

## 8. Yapılmayanlar

Kod değiştirilmedi. `AppType: 1` sabitine dokunulmadı. Uç, gövde veya parametre
adı **uydurulmadı**. `docs/39` ölçüm aracı `GetDocumentListGUID` için genişletilmedi
(izin gerekir). `getDocumentList` yorumu düzeltilmedi. Production'a dokunulmadı,
`ALLOW_PROD=true` yapılmadı, gerçek belge gönderilmedi/iptal edilmedi, kontör
tüketilmedi. Mock kullanılmadı ve hiçbir sonuç PASS sayılmadı. Credential/token
değerleri bu rapora yazılmadı.

---

## 9. Koşum öncesi kapanış denetimi (17.09.2026)

Araç yazıldıktan sonra koşumdan ÖNCE yapılması gereken denetim yapıldı.
**Koşum YAPILMADI** — aşağıda nedeni var.

### 9.1 Araç dosyalarının son hâli

- `server/tests/phase19GuidContractProbe.ts` (462 satır) + `tools/faz19-guid-sozlesme-ispeti.ps1` (232 satır) — ikisi de yerinde.
- `tsc --noEmit -p tsconfig.server.json` **EXIT 0** · `tsc --noEmit -p tsconfig.app.json` **EXIT 0** (17.09, Linux VM'de ölçüldü).
- Yasaklı çağrı taraması (17.09): probe içinde `SendDocument`/iptal/kontör (`commitCredits`/`deductCredits`/`consumeCredits`/`reserveCredits`) çağrısı **YOK** — eşleşen 3 satırın üçü de yorum satırı (`CancelDocument` ölçümüne atıf). Tek yürütülebilir hedef: `axios.post(${baseUrl}/HizliApi/RestApi/GetDocumentListGUID)`. ps1 dosyası **doğrudan HTTP çağrısı yapmıyor** (yalnız probe'u çalıştırır; `Invoke-RestMethod`/`curl`/`wget` yok).

### 9.2 Kontör hükmü — KOŞUM ENGELİ

`GetDocumentListGUID` sorgu ucunun sandbox'ta kontör tüketip tüketmediği
**doğrulanamadı.** İki kanıt yönü de yetersiz:

- **İç kanıt (kod):** `hizliConnectService.ts` (`getDocumentListByGUID`, `getDocumentReceiverAllList`) ve `hizli-bilisim.ts` (`sync-portal-invoices`) içinde `CreditWallet`/`reserveCredits`/`commitCredits`/`rollbackCredits` çağrısı **YOK** — yerel kontör akışı yalnız kuyruk/gönderim yollarında (`electronicDocumentService.ts:84,216`, `electronicDocumentQueue.ts:296`). Yani **bizim kodumuz** sorguda yerel kontör düşmüyor. Ama bu, **satıcının** sandbox tarafında sorguyu ücretlendirmediğini kanıtlamaz.
- **Dış kanıt (sözleşme):** Satıcı sözleşmesi (`docs/21`) test ortamının **yalnızca base URL ile** ayrıldığını söyler; sorgu uçlarının kontör davranışını **belgelemiyor**. `docs/31` B-4 ve `docs/33` K-5 de aynı boşluğu kayda geçirmiş: *"test ortamında kontörün tüketilip tüketilmediği belgelenmemiştir."*

**Hüküm:** "Kontör tüketmiyor" **KANITLANAMADI.** Bu araç da bunu kanıtlayamaz
(okuma sorgusu olması tüketmediğini göstermez — bunu yalnız satıcı sözleşmesi
veya bakiye öncesi/sonrası ölçümü gösterir). Dolayısıyla koşum, kontör onayı
olmadan **YAPILMAZ.** Koşum için gerekenler:

1. Satıcıdan yazılı cevap (sorgu uçları kontör tüketir mi?) **veya**
2. Kullanıcının açık koşum onayı (riski kabul ederek), tercihen sandbox bakiyesi
   not edilerek öncesi/sonrası karşılaştırmasıyla.

Koşum yapıldığında sonuç D0 + D1…D7 bazında bu belgeye eklenecek
(`docs/40` §1 tablosu biçiminde: deney → HTTP → mesaj → TANINIYOR/TANINMIYOR).

### 9.3 Koşum onayı + öncesi bakiye (17.09.2026)

- Kullanıcı **koşum izni verdi** ("koşum izni veriyorum artık bitir").
- Sandbox bakiyesi (kullanıcının portal gözlemi, 12:16 itibarıyla):
  Yüklenen 9.000 · Harcanan 8.794 (Diğer Düşümler: 1.529) · **Kalan 206**.
- ⚠️ **Bu bakiye tek başına "tüketmiyor" kanıtı DEĞİLDİR** (öncesi/sonrası
  karşılaştırması yok, hangi işlemlerin yapıldığı belirsiz). Gerçek kanıt,
  koşum SONRASI bakiyeyle karşılaştırma olacak.
- **Koşum bu ortamdan YAPILAMAZ:** Linux VM'de egress yok (proxy engeli).
  Koşum, egress'li Windows makinede aşağıdaki komutla yapılır. Koşum sonrası
  portal bakiyesi tekrar not edilir; fark koşumun kontör etkisini kanıtlar.

```
powershell -ExecutionPolicy Bypass -File tools\faz19-guid-sozlesme-ispeti.ps1
```

Beklenen çıktılar: konsolda `[SOZLESME_OLCUMU:OLCULDU|KOSULAMADI|GUVENLIK_IHLALI]` +
`.verify-tmp\faz19-guid-sozlesme-<zaman>.json` (kanıt, JWT maskeli) +
`.verify-tmp\faz19-guid-sozlesme-<zaman>.txt` (ham kayıt). Bu üçü bana
iletildiğinde D0+D1…D7 tablosu bu belgeye işlenecek.

---

## 10. Koşum sonucu — D0 + D1…D7 (17.09.2026, rev 2 ile OLCULDU)

**Koşumlar:** Windows, egress'li makine · güvenlik kapısı geçti (TEST hostu, sandbox kimliği) · auth zinciri kanıtlandı (`UtilEncrypt` + `Login`).
- 12:56 koşusu: 8 deney ölçüldü ama imza adımında `JSON.parse` çökmesi → `[SOZLESME_OLCUMU]` üretilemedi (kayıt: `.verify-tmp\faz19-guid-sozlesme-20260917-125650.txt`).
- **13:03 koşusu (rev 2): `[SOZLESME_OLCUMU:OLCULDU]`** — imza tablosu + S-G4 üretildi. Ham kayıt: `.verify-tmp\faz19-guid-sozlesme-20260917-130318.txt` · kanıt JSON: `.verify-tmp\faz19-guid-sozlesme-2026-09-17T10-03-20-805Z.json`.
**Düzeltmeler (rev 2, `tsc` server EXIT 0, yasaklı çağrı taraması temiz):** `JSON.parse` tamamen çıkarıldı (`mesaj` ölçüm anında saklanıyor); imza formülü tek fonksiyona indirgendi (`imzaOf`); yeni **S-G4 `guids` filtresi** bölümü (belge sayısı + kimlik döndü mü + dönen AppType ölçüm anında kaydediliyor).

### 10.1 Deney → yanıt (13:03 kaydı — OLCULDU koşusu)

| Deney | HTTP | Belge sayısı | İstenen kimlik döndü mü | Dönen `AppType` | Belge türü izlenimi |
|---|---|---|---|---|---|
| D0 (kontrol, appType yok) | 200 | 10 | HAYIR | **2** | `SFT…`, `ISTISNA`, `TEMELFATURA` |
| D1 (appType=1) | 200 | 5 | HAYIR | **1** | `EFA…`, `HKSSATIS`, `HKS` |
| D2 (appType=2) | 200 | 10 | HAYIR | **2** | `SFT…`, `ISTISNA` (D0 ile aynı belge) |
| D3 (appType=3) | 200 | 31 | HAYIR | **3** | `SED…`, `SATIS`, `EARSIVFATURA`, nihai tüketici |
| D4 (appType=4) | 200 | 1 | HAYIR | **4** | `EIR…`, `SEVK`, `TEMELIRSALIYE` (e-İrsaliye) |
| D5 (appType=5) | 200 | 12 | HAYIR | **5** | `TYH…`, `SEVK`, `TEMELIRSALIYE` |
| D6 (appType=6) | 200 | **0** | HAYIR | — | `IsSucceeded=true`, "Başarılı" |
| D7 (appType=7) | 200 | **0** | HAYIR | — | `IsSucceeded=true`, "Başarılı" |

Tüm yanıtlarda `IsSucceeded` (boolean) alanı var (S-G3: ✅ VAR). Şema (S-G2): `documents[]` içinde `ReportNo/UUID/EnvelopeUUID/AppType/DocumentId/DocumentTypeCode/ProfileId/…` + kökte `IsSucceeded/Message` — D6/D7'de yalnız `documents/IsSucceeded/Message`.

**S-G1 imza tablosu (13:03, araç çıktısı):**

| İmza | Deneyler |
|---|---|
| `200\|Başarılı\|belge:10\|kimlik:HAYIR` | D0, D2 |
| `200\|Başarılı\|belge:5\|kimlik:HAYIR` | D1 |
| `200\|Başarılı\|belge:31\|kimlik:HAYIR` | D3 |
| `200\|Başarılı\|belge:1\|kimlik:HAYIR` | D4 |
| `200\|Başarılı\|belge:12\|kimlik:HAYIR` | D5 |
| `200\|Başarılı\|belge:0\|kimlik:HAYIR` | D6, D7 |

Kontrolden ayrışanlar: D1, D3, D4, D5, D6, D7. Kontrolle aynı kalan: D2.

### 10.2 Hüküm (D0 + D1…D7 bazında)

1. **Uç `guids` filtresini UYGULAMIYOR (veya uydurma kimliği yok sayıyor):** 8 deneyin 8'inde de istenen kimlik DÖNMEDİ (S-G4, araç çıktısıyla kanıtlı). Her deney, istenen `AppType`'ın genel listesinden sandbox belgesi döndürdü. Yani bu uç "verdiğin kimliğin durumunu söyle" değil, "bu türden belgeleri listele" gibi davranıyor.
2. **`AppType` 1…5 TANINIYOR:** her değer, kendi türünden belge döndürdü (dönen `AppType` === istenen) ve her biri kontrolden ayrıştı. **6 ve 7** kontrolden ayrıştı ama **boş liste** döndürdü — bu uçta ya tür karşılığı yok ya da sandbox'ta o türden belge yok; hata da vermedi (`IsSucceeded=true`).
3. **D0 = D2 (iki koşuda da):** kontrol (appType yok) ile `appType=2` aynı belgeyi ve aynı imzayı verdi (12:56 ve 13:03). Olası okuma: varsayılan tür 2 — ama iki koşumluk gözlemdir, kesin kanıt değildir.
4. **Asıl soruya cevap:** kodun gönderdiği `appType=1` bu uçta **TANINIYOR** (D1 kendi türünden belge döndürdü, kontrolden ayrıştı). Ancak 1. maddedeki bulgu daha önemli: sorgu, kimliğe göre değil türe göre listeliyor görünüyor. `sync-portal-invoices` akışının "UUID listesi ver, durumları al" varsayımı **yanlış olabilir** — dönen listedeki belgenin istenen UUID ile eşleştiği kodda doğrulanmıyor. Bu ayrı bir bulgu olarak izlenecek.
5. ⚠️ Dönen belgeler sandbox'taki **başka test firmalarının gerçek test belgeleridir** (döküm alınmadı; yukarıda yalnız tür izlenimi için önek/profil yazıldı). Kişisel veri yok, kimlik detayı bu rapora yazılmadı.

### 10.3 Kontör — KAPANDI (sonrası kanıtı 17.09 akşamı)

**Sonrası kanıtı (Windows, egress'li makine, gerçek `KalanKontorSorgula` yanıtı):**
test firması için entegratör sayacı — **Kalan: 236.353.622,00** (sandbox sanal kredisi) ·
**Harcanan giden/e-Arşiv/gelen: 0** · Toplam fatura adedi: 0.
Önceki koşularda aynı uç "Bu VKN/TCKN yi sorgulamaya yetkiniz yok!" diyordu; Login
yanıtındaki gerçek VKN kullanılınca sayaç okundu (yetki sorunu VKN eşleşmesiydi).

**Hüküm:**
1. **Sorgu uçları kontör tüketmedi** — harcanan sayaçlar 0. `GetDocumentListGUID`
   koşumları (D0–D7 × 2 koşu) + durum sorguları faturalaşmış işlem üretmedi.
2. **Gönderim denemeleri kontör düşürmedi** — Koşu 1–5'in tamamı entegratör iş
   kuralında durdu (Koşu 1–4: alıcı VKN; Koşu 5: alıcı mükellef değil); havuza
   kesinleşmiş fatura işlenmedi, API sayacındaki harcanan miktarlar 0.
3. **İki sayaç ayrıdır:** portal arayüzündeki kullanıcı paketi (12:16'da kalan 206)
   ile API'deki firma sanal kredisi (236M) farklı havuzlardır; birbirinin yerine
   kullanılmaz. Portal sonrası bakiyesi ayrıca not edilirse buraya eklenecek —
   hüküm API sayacıyla kapanmıştır.
4. Vendor sözleşmesi uyarısı aynen durur: başarılı bir gönderimin 206'lık paketten
   düşüp düşmeyeceği sözleşmede taahhüt edilmiyor — ilk BAŞARILI gönderimde
   öncesi/sonrası portal karşılaştırması yeniden yapılacak.
5. **Vendor teyidi (18.09, kullanıcı iletisi):** test ortamında bütün uçlarda kontör
   düşmüyor. Böylece test-ortamı kontör sorusu kapandı — Koşu 1–10'da sayaçların
   0 kalması beklenen davranıştır. Bu teyit YALNIZCA test ortamını kapsar;
   canlı/production kontör davranışı için ayrı onay fazı gerekir (madde 4 saklıdır).

**İlgili:** `docs/38` §2 · `docs/39` §2 · `docs/40` §1 ve §7 · `docs/37` madde 10.
