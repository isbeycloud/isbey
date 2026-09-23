# FAZ 19 — `SendApplicationResponse` Gövdesi (a) + Kabul Bildirimi (c)

**Tarih:** 16.09.2026
**Onay:** Kullanıcı — *"SEN KARAR VER SIRADAN DEVAM ET"*
**Kapsam:** (a) istek gövdesinin sözleşmeye uydurulması + (c) kabul bildiriminin sağlayıcı arayüzüne eklenmesi
**Canlı API'ye istek gönderilmedi. Belge gönderilmedi/iptal edilmedi. Kontör tüketilmedi.**

> Bu belge `docs/42`'nin devamıdır. (b) iş-seviyesi kapısı `docs/42`'de tamamlanmıştı; burada (a) ve (c) yapıldı. **Üç kalemin üçü de artık tamam.**

---

## 1. (a) — İstek gövdesi sözleşmeye uyduruldu

`server/services/hizliConnectService.ts` → `sendApplicationResponse`

| | Önce | Sonra |
|---|---|---|
| Gövde | `{uuid, responseType, reason, documentNo}` | `{AppType, ResponseCode, ResponseDescription, Documents[]}` |
| `AppType` | ❌ yok | ✅ `1` (bu ucun numaralandırması) |
| `ResponseCode` | ⚠️ `responseType` | ✅ sözleşme adı, `"KABUL" \| "RED"` |
| `ResponseDescription` | ⚠️ `reason` | ✅ sözleşme adı |
| `Documents[]` | ❌ yok (düz nesne) | ✅ `[{DocumentUUID, DocumentId, DocumentDate}]` |

Arayüz imzası da değişti (`uuid`/`responseType` → `documentUuid`/`responseCode` ve `documentId`/`documentDate` eklendi). (b)'de eklenen iş-seviyesi kapısı **korundu**.

### 1.1 Route — `Documents[]` alanları sunucuda türetiliyor

`server/routes/efatura.ts` → `POST /hizli/application-response`

Sözleşme `DocumentId` ve `DocumentDate` de istiyor; istemci bunları bilmiyor. Sunucu, belgeyi yerel kayıttan bulup **gerçek değerlerinden** türetiyor (`invoiceNo` → `DocumentId`, `date` → `DocumentDate`). Uydurma yok.

İki yeni doğrulama eklendi: `uuid` yoksa ve `responseType` `KABUL`/`RED` değilse **400**. Belge numarası/tarihi bulunamazsa da **400** — eksik alanla sessizce gövde yollanmaz.

### 1.2 İstemci tarafı değişmedi

`src/services/api.ts` ve `EDonusumView.tsx` **aynı imzayı** kullanmaya devam ediyor (`uuid`, `responseType`, `reason`). Zaten sözleşme alanı göndermiyorlardı; artık sunucu dönüştürüyor.

---

## 2. (c) — Kabul bildirimi sağlayıcı arayüzüne eklendi

`respondToInvoice(bildirim, settings)` → `ElectronicDocumentProvider` arayüzüne eklendi; iki sağlayıcıda karşılığı yazıldı.

| Dosya | Değişiklik |
|---|---|
| `electronicDocumentProvider.ts` | Arayüze `respondToInvoice` eklendi |
| `hizliTeknolojiProvider.ts` | `SendApplicationResponse`'a bağlandı; `cancelInvoice` ile **aynı** iş-seviyesi kapısı |
| `mockProvider.ts` | Sahte teyit YOK — `dogrulandi: undefined` |
| `incomingInvoiceService.ts` | `ACCEPTED` dalı artık entegratöre **gerçekten** bildiriyor; eski "kabul ucu yok" notu kaldırıldı |

### 2.1 ⚠️ Fail-closed — sessiz yalan üretilmiyor

Kabul dalı, red dalıyla **aynı disiplini** uyguluyor:

```ts
const kabulRes = await provider.respondToInvoice({...}, settings);
if (!kabulRes?.success) {
  throw new Error(kabulRes?.message || 'Kabul bildirimi entegratöre iletilemedi; durum değiştirilmedi.');
}
incInvoice.status = 'ACCEPTED';   // ← yalnız bildirim BAŞARILIYSA
```

Entegratör bayrağı görülmezse (`belirsiz`) bildirim **kesinleşmemiş** sayılır → kayıt ACCEPTED yapılmaz. "Gönderdim ama teyit yok" durumu "kabul edildi" diye yazılmaz.

---

## 3. ⛔ KANITLANMAMIŞ KALAN — kimlik değerinin kaynağı

**Bunu gizlemiyorum: `DocumentUUID`'ye hangi değerin gittiği hâlâ kanıtlanmamıştır ve bu turda DEĞİŞTİRİLMEMİŞTİR.**

Çağrı yolu birebir şudur:

```
EDonusumView.tsx:232   uuid: inv.id            ← iç kayıt kimliği
  → efatura.ts         kayit = i.id === uuid || i.eInvoiceUUID === uuid
  → hizliConnectService documentUuid: uuid      ← inv.id  (ETTN DEĞİL)
  → SendApplicationResponse  Documents[0].DocumentUUID
```

Gerçek veriyle ölçüm:

| Alan | Değer |
|---|---|
| `inv.id` | `inv-inc-1787823405260` |
| `eInvoiceUUID` | `urn:uuid:7c89b21f-8294-4d81-9872-918239019283` |

Sözleşme `DocumentUUID` için **ETTN** ister; kod `inv.id` gönderiyor. Bu **muhtemelen yanlış** ama `inv.id → eInvoiceUUID` değişikliği **kullanıcının yürürlükteki yasağıdır** → ayrı izin gerekir. Bu yüzden gövde şekli düzeltildi, kimlik değeri bilerek bırakıldı, kodun içine de bu açık `⛔` notu olarak yazıldı.

**Bu açık kapanana kadar kabul/red bildirimi gerçek belgede çalışmaz** (entegratör belgeyi bulamaz). Testler bunu gizlemiyor: test, `documentUuid`'ye doğru ETTN değerini veriyor ve **değerin kaynağını değil, gönderimini** ölçüyor.

---

## 4. Kanıt — iki süit, ikisi de ayırt etme gücü kanıtlı

### 4.1 `phase19ApplicationResponseTest.ts` — 34 kontrol (kapı + gövde)

| Koşum | Sonuç | Exit |
|---|---|---|
| **Kapı YOK** (eski davranış) | 12 PASS / **11 FAIL** | 1 |
| **Eski düz gövde** | 25 PASS / **9 FAIL** | 1 |
| **Mevcut kod** | **34 PASS / 0 FAIL** | 0 |

Eski gövde kontrolünün yakaladığı sapmalar: `A-3b AppType` → `undefined`, `A-3c ResponseCode` → `undefined`, `A-3e Documents[]` → `undefined` ve altı alanın tamamı.

### 4.2 `phase19AcceptResponseTest.ts` — 27 kontrol (YENİ, kabul bildirimi)

| Koşum | Sonuç | Exit |
|---|---|---|
| **Fail-closed YOK** (koşulsuz başarı) | 19 PASS / **8 FAIL** | 1 |
| **Mevcut kod** | **27 PASS / 0 FAIL** | 0 |

Kontrol koşumunun yakaladığı asıl tehlike — **ağ hatası ve HTTP 500'de bile "kabul iletildi" denmesi**:

```
❌ FAIL  C-7 Ağ hatası → success:false — {"success":true,"dogrulandi":true,"message":"KABUL yaniti iletildi."}
❌ FAIL  C-8 HTTP 500 → success:false — {"success":true,"dogrulandi":true,"message":"KABUL yaniti iletildi."}
```

Kapsam: MOCK arayüz uyumu ve sahte teyit üretmemesi · doğru gövde (`AppType=1`, `ResponseCode`, `Documents[]`) · HTTP 200+iş hatası · bayrak yok · ağ hatası · HTTP 500 · RED yolu · ağ izolasyonu.

> **Kontrol koşumları hakkında dürüstlük notu:** yalnızca **derlenmiş `.js` kopyaları** yamalandı; kaynak `.ts`'e dokunulmadı. Bir denemede yama `try/catch` yapısını bozdu ve koşum geçersiz oldu (SyntaxError) — o koşum **kanıt sayılmadı**, yama düzeltilip yeniden koşuldu.

---

## 5. Regresyon — hepsi temiz

| Kontrol | Komut | Sonuç |
|---|---|---|
| Tip (sunucu) | `npx tsc --noEmit -p tsconfig.server.json` | ✅ **EXIT=0** |
| Tip (frontend dahil) | `npx tsc -b` | ✅ **EXIT=0** |
| Kabul bildirimi (yeni) | `phase19AcceptResponseTest` | ✅ **27 PASS / 0 FAIL** |
| Kapı + gövde | `phase19ApplicationResponseTest` | ✅ **34 PASS / 0 FAIL** |
| İptal akışı | `phase19CancelFlowTest` | ✅ **29 PASS / 0 FAIL** |
| FAZ 18 | `phase18HizliBilisimIntegrationTest` | ✅ **51 PASS / 0 FAIL / 3 SKIP** |

FAZ 18'deki 3 SKIP, `docs/36`'dan bilinen **egress kısıtıdır** (HTTP 403 `blocked-by-allowlist`) — FAIL değildir ve bu değişiklikle ilgisi yoktur. (İlk koşumda 3 FAIL görülmüştü; bunlar test ortamına `server/routes`, `server/middleware` ve `.env.example` kopyalanmadığı için "dosya bulunamadı" idi — eksik kopyalama düzeltilince kayboldu. **Gerçek bir kod kusuru değildi.**)

---

## 6. ⛔ Dürüstlük sınırı — bu kanıt NE DEĞİLDİR

- ⛔ **Gerçek sandbox PASS DEĞİLDİR.** İki süit de HTTP katmanını taklit eder; gerçek entegratör yanıtı **görülmemiştir**.
- ⛔ **Sözleşme ölçülmedi.** `AppType`, `ResponseCode`, `Documents[]` alanlarının bu uçta gerçekten kabul edildiği **gözlemlenmedi**; `docs/41`'deki vendor dokümantasyonundan okundu.
- ⛔ **Kimlik değeri hâlâ yanlış olabilir** — bkz. §3.
- ⛔ **Route uçtan uca koşulmadı.** `Documents[]` türetmesi canlı HTTP ile değil, kod ve veri incelemesiyle doğrulandı (hedef kayıtta `invoiceNo` ve `date` dolu: doğrulandı).
- Geçici derleme dizinleri (`.verify-tmp/accept`, `ar2`, `reg`, `f18`, `artest`) **silindi**; yalnızca test süitleri kalıcı.

---

## 7. Yapılmayanlar

`inv.id → eInvoiceUUID` değişikliği **yapılmadı** (yasak — §3). e-Fatura iptal ucu **uydurulmadı**; `docs/40` §3 ve `docs/41` §5'teki boşluk **açık**, `docs/37` 10. madde geçerli. `AppType: 3` sabiti (`hizliTeknolojiProvider.ts` — `cancelInvoice`) değişmedi. **Red bildirimi hâlâ `CancelDocument` ile yapılıyor** (aşağıda). `getDocumentList` yorumu değişmedi (`docs/41` §5.1). `CancelDocument`/`CancelEArsivInvoice`/`RescindCancel` davranışı değişmedi. Muhasebe/stok/KDV mantığına dokunulmadı. Production'a dokunulmadı, `ALLOW_PROD` açılmadı, gerçek belge gönderilmedi/iptal edilmedi, kontör tüketilmedi. **Mock/stub sonucu gerçek sandbox kanıtı sayılmadı.** Credential/token değerleri rapora yazılmadı (testlerde yalnız `sahte-*` yer tutucuları var).

---

## 8. ⛔ Bu turda ÇIKAN YENİ BULGU — red bildirimi yanlış uçla gidiyor

`incomingInvoiceService.ts` hâlâ şunu yapıyor:

```ts
if (action === 'REJECTED') {
  const cancelRes = await provider.cancelInvoice(incInvoice.uuid, reason, settings);  // ← CancelDocument
```

Ama sözleşmede **red bildirimi `SendApplicationResponse` + `ResponseCode: "RED"`** ile yapılır (`docs/41` §2.1: *"Uygulama yanıtlarının (kabul, red) entegratöre gönderildiği metottur"*). Yani:

| İşlem | Sözleşmeye göre | Kodda |
|---|---|---|
| Kabul | `SendApplicationResponse` `KABUL` | ✅ **düzeltildi (bu tur)** |
| Red | `SendApplicationResponse` `RED` | ⛔ **`CancelDocument`** |

`CancelDocument` bir **iptal** ucudur ve `AppType` kümesi `3/6/7`'dir — e-Fatura (1) **yok** (`docs/40` §3). Yani gelen bir e-Faturayı reddetmek, sözleşmeye göre iptal ucuyla **yanlış** yapılıyor.

**Bu bulgu rapor edildi, DEĞİŞTİRİLMEDİ** — red yolunu değiştirmek ayrı bir karardır (davranış değişikliği + mevcut `cancelFlow` testlerinin yeniden değerlendirilmesi gerekir). **Kullanıcı onayı bekliyor.**

---

## 9. Sıradaki karar noktaları

1. **§3 kimlik değeri** — `inv.id` → `eInvoiceUUID` değişikliği. Yürürlükteki yasak; ayrı izin gerekir. **Bu kapanmadan kabul/red gerçek belgede çalışmaz.**
2. **§8 red yolu** — `REJECTED` dalının `SendApplicationResponse` `RED`'e taşınması.
3. **e-Fatura iptal ucu** — vendor'dan hâlâ teyit gerekli (`docs/37` 10. madde).
4. **Gerçek sandbox koşumu** — `tools/faz19-belge-akisi.ps1` (egress erişimli Windows makinesi, kontör riski).
