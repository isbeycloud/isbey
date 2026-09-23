# FAZ 19 — İki Uç Sözleşmesinin Karşılaştırması (`CancelDocument` + `SendApplicationResponse`)

**Tarih:** 16.09.2026 · **Kaynak:** Hızlı Bilişim / Bey360 e-Connect REST API dokümantasyonu (iki ekran görüntüsü)
**Kod değişikliği yapılmadı.** Canlı API'ye istek gönderilmedi. Kontör tüketilmedi.

---

## 1. `CancelDocument` — dokuz kalemin dokuzu uyuşuyor

| Sözleşme kalemi | Kod | Durum |
|---|---|---|
| Metod `CancelDocument` | `axios.post(.../CancelDocument)` `:527` | ✅ |
| Açıklama: giden e-Belgeleri iptal | Kod giden iptalinde çağırıyor `documentConversionService.ts:344` | ✅ |
| `DocumentUuid` string, zorunlu, UUID | `:500` okuma + `:504` yazma, üç yazımı da kabul | ✅ |
| `CancelReason` string, zorunlu | `:501` + `:505` | ✅ |
| `AppType` int, zorunlu, `3/6/7` | `:499` sabit `3` | ✅ *(değer e-Arşiv için doğru, bkz §4)* |
| `CancelDate` string, zorunlu | `:502` + `:506`, `YYYY-MM-DD` | ✅ |
| Yanıt `ResponseMessage` | — | ✅ |
| `IsSucceeded` bool | `isSeviyesiSonucuOku()` `:66` | ✅ |
| `Message` string | `isSeviyesiMesaji()` `:87` | ✅ |
| **Bearer token zorunlu** | `Authorization: Bearer ${token}` `:528` | ✅ |

Sözleşmenin alt notu — *"hizli api rest apide her metodda request header bearer token gönderilmelidir"* — kodun tamamında zaten uygulanıyor.

**`AppType` değerleri sözleşmede teyit edildi:** `3 : e-Arşiv Fatura, 6 : e-Serbest Makbuz, 7 : Müstahsil Makbuz`. Bu, 12:55 ölçümünün (§ `docs/40`) bulgusuyla **birebir aynı**. Ölçüm doğrulanmış oldu.

---

## 2. `SendApplicationResponse` — sözleşme tam görünüyor, kod AYRIŞIYOR

### 2.1 Sözleşme (tam)

```
Metod Adı : SendApplicationResponse
Açıklama  : Uygulama yanıtlarının (kabul, red) entegratöre gönderildiği metottur.

AppType             int      Uygulama Türü     1           1 : e-Fatura
ResponseCode        string   Cevap Kodu        RED         KABUL,RED
ResponseDescription string   Açıklama          ...         KABUL,RED Nedeni zorunlu değildir.
Documents           List<ApplicationResponseDocumentInfo>

public class ApplicationResponseDocumentInfo
{
    public string   DocumentUUID { get; set; }
    public string   DocumentId   { get; set; }
    public DateTime DocumentDate { get; set; }
}

// Çıkış:
public class ResponseMessage
{
    public bool   IsSucceeded { get; set; }
    public string Message     { get; set; }
}
```

### 2.2 Kod

`hizliConnectService.ts:403-430`:

```ts
public static async sendApplicationResponse(
  responsePayload: {
    uuid: string;
    responseType: 'KABUL' | 'RED';
    reason?: string;
    documentNo?: string;
  },
  token: string, isTest: boolean = true
) {
  const res = await axios.post(`${baseUrl}/HizliApi/RestApi/SendApplicationResponse`,
    responsePayload,   // ← düz nesne, sarmalanmamış
    { headers: { Authorization: `Bearer ${token}`, ... } });
  return { success: true, data: res.data, message: `... ${responsePayload.responseType} ...` };
}
```

### 2.3 Karşılaştırma — yedi alanın yedisi ayrışıyor

| Sözleşme | Kodda | Durum |
|---|---|---|
| `AppType: 1` | ❌ **yok** | ⛔ AYRIŞIYOR |
| `Documents[]` dizisi | ❌ **yok** — düz nesne | ⛔ AYRIŞIYOR |
| `Documents[].DocumentUUID` | ⚠️ `uuid` — dizi dışında, düz | ⛔ AYRIŞIYOR |
| `Documents[].DocumentId` | ⚠️ `documentNo` — farklı ad, dizi dışında | ⛔ AYRIŞIYOR |
| `Documents[].DocumentDate` | ❌ **yok** | ⛔ AYRIŞIYOR |
| `ResponseCode: "KABUL"/"RED"` | ⚠️ `responseType` — farklı ad | ⛔ AYRIŞIYOR |
| `ResponseDescription` | ⚠️ `reason` — farklı ad | ⛔ AYRIŞIYOR |

Kod, sözleşmedeki gövde yapısının **hiçbir** parçasını taşımıyor: ne `AppType`, ne `Documents` dizisi, ne `ResponseCode`/`ResponseDescription` adları. Uç ve metot adı doğru; **gövde tamamen farklı.**

---

## 3. ⛔ YENİ BULGU 1 — `sendApplicationResponse` iş-seviyesi başarıyı OKUMUYOR

`isSeviyesiSonucuOku()` tüm dosyada yalnızca **iki** yerde çağrılıyor:

```
:447  → (başka bir metot)
:532  → cancelDocument
```

`sendApplicationResponse` (`:403-430`) **çağırmıyor**:

```ts
const res = await axios.post(...);
return { success: true, ... };   // ← HTTP 2xx geldiyse koşulsuz success:true
```

Sözleşme, bu ucun çıkışının da `ResponseMessage` (`IsSucceeded` + `Message`) olduğunu söylüyor. Yani **HTTP 200 dönüp `IsSucceeded: false` olabilir** — ve kod bunu başarı sayar.

**Bu, FAZ 18/19'da düzeltilen "HTTP 200 yetmez" kusurunun aynısıdır — `cancelDocument`'ta düzeltilmiş, `sendApplicationResponse`'ta düzeltilmemiş.** Ölçümle kanıtlanmış bir ilke var (§ `docs/36`): aynı API ailesinin yanıtları 200 içinde iş hatası bildiriyor.

**Etki:** e-Fatura kabul/red bildirimi entegratörce reddedilse bile İŞBEY "gönderildi" der. Karşı taraf kabul etmemişken belge kabul edilmiş görünebilir — `incomingInvoiceService`'teki "KABUL ucu yok" notunun korktuğu senaryonun bir benzeri.

---

## 4. ⛔ YENİ BULGU 2 — "Kabul ucu yoktur" notu ARTIK GEÇERSİZ

`incomingInvoiceService.ts:236-243`:

```ts
// DÜRÜSTLÜK NOTU (2026-09-12): Sağlayıcı arayüzünde "kabul/onay bildir"
// diye bir çağrı YOKTUR (yalnızca `cancelInvoice` vardır). Dolayısıyla
// ACCEPTED, entegratöre/karşı tarafa BİLDİRİLMEKSİZİN yalnızca İŞBEY
// tarafında işaretlenir. ...
// Gerçek bildirim gerekiyorsa Hızlı Bilişim'in kabul uç noktası
// temin edilip sağlayıcı arayüzüne eklenmelidir.
```

Bu not yazıldığında doğruydu — arayüzde gerçekten yalnızca `cancelInvoice` vardı. **Ama artık sözleşme elimizde:** `ResponseCode` alanı `KABUL,RED` değerlerini alıyor. Yani kabul bildirimi **aynı uçla yapılabiliyor.**

Notun kendi şartı — *"kabul uç noktası temin edilip sağlayıcı arayüzüne eklenmelidir"* — **karşılanmış durumda.** Uç nokta temin edildi; arayüze eklenmesi kod değişikliği gerektirir ve **ayrı izne tabidir.**

Kod şu anki hâliyle dürüst: `ACCEPTED` işaretlerken "bu kayıt karşı taraf kabulü aldı anlamına GELMEZ" diyor. Yani sessizce yanlış bir şey yapmıyor. Ama **yapılabilecek bir işlem eksik kalıyor.**

---

## 5. ⛔ YENİ BULGU 3 — e-Fatura iptali sözleşmede de YOK

İki dokümanda da e-Fatura **iptal** ucu görünmüyor:

- `CancelDocument` → `AppType` geçerli değerleri `3, 6, 7` — **e-Fatura (1) yok.** §1'deki ölçüm bunu doğruladı.
- `SendApplicationResponse` → `AppType: 1 (e-Fatura)` ama bu **red/kabul** yanıtı, iptal değil.

**Sonuç:** e-Fatura iptali için ayrı bir uç gerekiyor ve **hâlâ bilinmiyor.** `docs/40` §3'teki bulgu, sözleşme tarafından da doğrulandı.

### 5.1 `AppType` numaralandırması uç bazlı — çelişki değil

`docs/38` §2'de "çelişki" olarak işaretlediğim iki sözlük, artık şöyle açıklanıyor:

| Uç | `AppType` anlamı |
|---|---|
| `CancelDocument` | `3 = e-Arşiv, 6 = e-SMM, 7 = Müstahsil` (sözleşmede yazılı) |
| `SendApplicationResponse` | `1 = e-Fatura` (sözleşmede yazılı) |
| `GetGibUserList` (kodda `AppType=1&...`) | `1 = e-Fatura` |
| `getDocumentList` (kod yorumu) | `1 = e-Fatura, 2 = e-Arşiv, 3 = e-İrsaliye...` |

**`AppType` numaralandırması uçtan uca aynı değil.** `CancelDocument` kendi alt kümesini kullanıyor (3/6/7), sorgulama uçları başka bir kümeyi (1-5). İki sözlük "çelişki" değil, **farklı uçların farklı numaralandırması.**

Bu, `getDocumentList` yorumunun **yanlış olmadığı** anlamına gelir — kendi ucu için doğru olabilir. `docs/40` §7'de bıraktığım şüphe bu yönde çözüldü.

**Ama ortak `AppType` sabiti (`hizliTeknolojiProvider.ts:348`) hâlâ sorunlu:** e-Arşiv iptali için 3 doğru, e-Fatura iptali için bu uç zaten kullanılamaz.

---

## 6. Revize edilmiş durum tablosu

| Kalem | Durum | Dayanak |
|---|---|---|
| `CancelDocument` sözleşmesi (9/9) | ✅ **KANITLANDI** | §1 — sözleşme + ölçüm birebir |
| `AppType 3/6/7` anlamları | ✅ **KANITLANDI** | §1 — sözleşmede yazılı + ölçümle teyitli |
| `AppType` uç bazlı farklılık | ✅ **AÇIKLANDI** | §5.1 — çelişki değil |
| Bearer token zorunluluğu | ✅ **UYUŞUYOR** | §1 |
| `SendApplicationResponse` **ucu ve amacı** | ✅ **KANITLANDI** | §2.1 |
| `SendApplicationResponse` **gövdesi** | ⛔ **AYRIŞIYOR (7/7)** | §2.3 |
| `SendApplicationResponse` **başarı okuma** | ⛔ **OKUMUYOR — kural 5 ihlali** | §3 |
| `ResponseCode: KABUL` desteği | ⛔ **VAR ama kod kullanmıyor** | §4 |
| **e-Fatura iptal ucu** | ⛔ **SÖZLEŞMEDE DE YOK** | §5 |
| e-İrsaliye iptali | ⛔ **TEYİT GEREKİYOR** | §5 |
| Giden belge kimliğinin değer kaynağı | ⛔ **KANITLANMADI** | `docs/40` §4 |
| Gerçek sandbox belge yaşam döngüsü | ⛔ **KOŞULAMADI** | — |
| Production | ✅ **KAPALI** | — |

---

## 7. Sıradaki iş — kod değişikliği gerektiren üç kalem (hepsi AYRI İZİN)

**a) `SendApplicationResponse` gövdesini sözleşmeye uydurmak.** §2.3'teki yedi sapmanın tamamı tek bir düzeltmeyle kapanır: `{AppType, ResponseCode, ResponseDescription, Documents:[{DocumentUUID, DocumentId, DocumentDate}]}` biçimine geçirmek. Arayüz imzası da (`uuid`/`responseType`) değişir.

**b) `sendApplicationResponse`'a iş-seviyesi kapı eklemek.** §3'teki kusur. `isSeviyesiSonucuOku` zaten yazılı — yalnız bu uca bağlanması gerekir. `cancelDocument`'ta kanıtlanmış desen.

**c) Kabul bildirimini sağlayıcı arayüzüne eklemek.** §4. `cancelInvoice`'ın yanına bir `respondToInvoice` benzeri metot. Arayüz değişikliği, `MOCK` sağlayıcısında da karşılığı gerekir.

**Bunların hiçbiri bu turda yapılmadı.** Öncelik sırası önerisi: (b) en düşük riskli ve en yüksek değerli — sessiz yanlış-başarıyı kapatır, sözleşme değişikliği gerektirmez. Sonra (a), sonra (c).

**e-Fatura iptali (§5) için hâlâ vendor'a soru var** — `docs/37`'deki 10. madde bu hâliyle geçerli, hatta güçlendi.

---

## 8. Yapılmayanlar

Mevcut kod değiştirilmedi. `SendApplicationResponse` gövdesi sözleşmeye uydurulmadı. `isSeviyesiSonucuOku` bu uca bağlanmadı. `incomingInvoiceService`'teki dürüstlük notu silinmedi (hâlâ doğru bir durumu anlatıyor — kod kabul bildirimi yapmıyor). Arayüze kabul metodu eklenmedi. `AppType:3` sabiti değiştirilmedi. e-Fatura iptal ucu uydurulmadı. `getDocumentList` yorumu "düzeltilmedi" (§5.1'e göre zaten yanlış değil). Production'a dokunulmadı, gerçek belge gönderilmedi, kontör tüketilmedi, mock kullanılmadı, credential/token değerleri yazılmadı.
