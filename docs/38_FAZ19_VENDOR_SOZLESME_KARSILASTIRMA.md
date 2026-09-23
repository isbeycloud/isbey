# FAZ 19 — Mevcut `CancelDocument` Kodunun Vendor Sözleşmesiyle Karşılaştırması

**Tarih:** 16.09.2026 · **Yöntem:** satır bazlı kaynak kod okuması + mevcut test/ölçüm çıktılarının yeniden koşulması
**Kod değişikliği yapılmadı.** Canlı API'ye istek gönderilmedi. Kontör tüketilmedi.

---

## 0. İki ön tespit (raporun geri kalanını etkiliyor)

### 0.1 Bu karşılaştırma, daha önce yapılmış olan launch'ın değil, bugünkü kodun karşılaştırmasıdır

İncelenen dört dosyanın üçü **bugün 09:12'de** değişmiş:

| Dosya | Son değişiklik | Boyut |
|---|---|---|
| `server/services/hizliConnectService.ts` | 2026-09-16 09:12:04 | 67.811 B |
| `server/services/providers/hizliTeknolojiProvider.ts` | 2026-09-16 09:12:14 | 17.003 B |
| `server/services/documentConversionService.ts` | 2026-09-16 09:12:38 | 22.470 B |
| `server/services/incomingInvoiceService.ts` | 2026-09-12 23:27:54 | 9.501 B (değişmemiş) |

Yani "giden iptal entegratöre çağrı yapmıyor" bulan `docs/30` ve **`docs/36` §9'daki durum etiketleri artık bayat.** `docs/36` dosyası 16.09.2026 00:25'te yazılmış; kod ise 09:12'de değişmiş. **Etiketler kodun gerisinde kalmış, kod etiketlerin önünde.**

Aşağıdaki karşılaştırma **bugünkü kod** üzerindendir.

### 0.2 Bağımsız bir gerçek-sandbox ölçümü zaten mevcut — ve sözleşmeyi doğruluyor

Bugün 09:07 ve 09:19'da, `econnecttest` ortamına karşı iki kez koşulmuş bir sözleşme ölçümü var:

- `.verify-tmp/faz19-cancel-sozlesme-2026-09-16T06-07-23-410Z.json` (09:07)
- `.verify-tmp/faz19-cancel-sozlesme-2026-09-16T06-19-17-821Z.json` (09:19)
- `.verify-tmp/faz19-cancel-sozlesme-20260916-091916.txt` (okunabilir rapor)

Ölçümün kanıtladıkları (iki koşuda birebir aynı):

| Ölçüm | Sonuç |
|---|---|
| Auth zinciri | ✅ `UtilEncrypt` + `Login` başarılı — firma: HIZLI BİLİŞİM TEST MERKEZ, VKN 4620553774 |
| Hedef | `https://econnecttest.hizliteknoloji.com.tr/HizliApi/RestApi/CancelDocument` |
| Deney A — `{uuid, cancelReason}` | HTTP 200 → `{"IsSucceeded":false,"Message":"Tüm alanlar dolu olmalıdır!"}` |
| Deney B — `{Uuid, CancelReason}` | HTTP 200 → `{"IsSucceeded":false,"Message":"Tüm alanlar dolu olmalıdır!"}` |
| Yanıt şeması | `IsSucceeded` (boolean) + `Message` (string) — **her iki deneyde de aynı** |
| İş-seviyesi başarı alanı | ✅ `IsSucceeded` — **GERÇEK yanıtta mevcut** |
| Belge gönderildi mi | ❌ Hayır (`belgeGonderildi: false`) — uydurma UUID |
| Kontör yakıldı mı | ❌ Hayır |
| Canlıya çıkış | ❌ Yok (`IS_TEST_MODE=true`, `ALLOW_PROD` boş) |

**Bu, e-Arşiv `CancelDocument` sözleşmesinin başarı kriterini (`IsSucceeded`/`Message`) sandbox'ta doğrulayan bağımsız bir kanıttır.** Kullanıcının verdiği sözleşme ile birebir örtüşüyor. Ölçümün kendi uyarısı geçerli: uydurma kimlikle yapıldığı için *başarılı* bir iptalin yanıtı farklı olabilir — ama **yanıt şeması ve hata yolu ölçülmüş durumda.**

---

## 1. Kalem kalem karşılaştırma — e-Arşiv akışı

| # | Sözleşme kalemi (verilen) | Koddaki durum | Karar |
|---|---|---|---|
| 1 | Endpoint `POST /HizliApi/RestApi/CancelDocument` | `hizliConnectService.ts:527` → `axios.post(\`${baseUrl}/HizliApi/RestApi/CancelDocument\`, …)` | ✅ **UYUŞUYOR** |
| 2 | HTTP method `POST` | `axios.post`, `Content-Type: application/json`, `Bearer ${token}` | ✅ **UYUŞUYOR** |
| 3 | `DocumentUuid` alanı | `:500` `const docUuid = payload?.DocumentUuid \|\| payload?.uuid \|\| payload?.Uuid \|\| '';` → `:504` `DocumentUuid: docUuid` | ✅ **UYUŞUYOR** |
| 4 | `CancelReason` alanı | `:501` okuma + `:505` `CancelReason: reason` | ✅ **UYUŞUYOR** |
| 5 | `AppType` alanı | `:499` `payload?.AppType ?? 3` → `:504` `AppType: appType` | ✅ **UYUŞUYOR** (değer uyuşmuyor — bkz. §2) |
| 6 | `CancelDate` alanı | `:502` okuma + `:506` `CancelDate: cancelDate`, varsayılan `YYYY-MM-DD` | ✅ **UYUŞUYOR** |
| 7 | Başarı kriteri `IsSucceeded` | `isSeviyesiSonucuOku()` `hizliConnectService.ts:66` → `d.IsSucceeded ?? d.isSucceeded ?? d.Success ?? d.success` | ✅ **UYUŞUYOR** |
| 8 | Mesaj alanı `Message` | `isSeviyesiMesaji()` `:87` → `d.Message ?? d.message ?? …` | ✅ **UYUŞUYOR** |
| 9 | Yanıt modeli `ResponseMessage` | HTTP 2xx + `IsSucceeded:false` → `success:false`, `isSeviyesi:'basarisiz'` | ✅ **UYUŞUYOR** |

**e-Arşiv `CancelDocument` için dokuz kalemin dokuzu uyuşuyor.** Kod, sözleşmenin bu kısmını doğru uyguluyor.

### 1.1 Çağrı zinciri — giden iptali artık gerçekten entegratöre gidiyor

`documentConversionService.ts:332-347`:

```ts
// 0. INTEGRATION GAP ÇÖZÜMÜ: Giden Belge Entegratör İptali (CancelDocument)
const hasOutgoingEDoc = Boolean(
  invoice.eInvoiceUUID &&
  ['SENT', 'ACCEPTED', 'DELIVERED'].includes(invoice.eInvoiceStatus || '')
);

if (hasOutgoingEDoc) {
  const { provider, settings } = ProviderFactory.getProviderForTenant(tenantId);
  const cancelRes = await provider.cancelInvoice(invoice.eInvoiceUUID!, reason, settings);
  if (!cancelRes.success) throw new Error(...);
  if (cancelRes.dogrulandi === false) throw new Error(...);   // fail-closed
}
```

→ `hizliTeknolojiProvider.ts:343` `HizliConnectService.cancelDocument({ uuid, DocumentUuid: uuid, cancelReason, CancelReason, AppType: 3, CancelDate })`

Bu, **yerel iptalden ÖNCE** ve **fail-closed** (entegratör reddederse yerel ters kayıt hiç yapılmaz). Sıralama doğru.

**Kanıt — gerçek test çıktısı.** `phase19DocumentLifecycleTest` bugünkü kodla koşuldu (§6 statik sözleşme denetimi):

```
✅ PASS  İptal: uç (RestApi/CancelDocument) + metot (static async cancelDocument) mevcut
✅ PASS  Giden belge iptali entegratöre bildiriliyor (CancelDocument)
```

Bir önceki turda bu satır `⚠️ WARN — Giden belge iptali entegratöre GİTMİYOR` idi. **Aynı test, aynı koşum biçimi, farklı sonuç** — yani 09:12 değişikliği ölçülebilir biçimde gap'i kapatmış.

---

## 2. ⛔ KRİTİK AYKIRILIK — `AppType` numaralandırması çelişkili

Aynı `CancelDocument` ucu için repoda **iki farklı `AppType` sözlüğü** var ve ikisi bağdaşmıyor:

| Kaynak | Numaralandırma |
|---|---|
| `hizliConnectService.ts:486` — `cancelDocument` yorumu (verilen sözleşme) | `3 = e-Arşiv Fatura`, `6 = e-SMM`, `7 = e-Müstahsil` |
| `hizliConnectService.ts:631` — `getDocumentList` yorumu | `1 = e-Fatura`, `2 = e-Arşiv`, `3 = e-İrsaliye`, `4 = e-SMM`, `5 = e-Müstahsil` |
| `hizliConnectService.ts:499` + `hizliTeknolojiProvider.ts:348` — **fiilen gönderilen değer** | `AppType: 3` — **sabit kodlanmış** |

Bu bir yorum tutarsızlığı değil, **davranışsal bir kusur**: `cancelInvoice` giden **e-Fatura** iptalinde de `AppType: 3` gönderiyor. İkinci sözlük doğruysa `3 = e-İrsaliye` olur ve çağrı **yanlış belge türüne** yapılır. İlk sözlük doğruysa `3 = e-Arşiv` olur ve e-Fatura yine yanlış türle gönderilir.

**İki sözlükten hangisinin doğru olduğu repoda kanıtlanamıyor.** Ayrıca `AppType` çağrıda parametreleştirilmemiş; belge türünden türetilmiyor.

### 2.1 İkinci bulgu — `uuid` küçük harfli alan gövdeye hâlâ yazılıyor

`hizliConnectService.ts:508-510`:

```ts
// Geriye dönük test uyumluluğu için küçük harfli alanlar
uuid: docUuid,
cancelReason: reason,
```

Gövde **altı alan** taşıyor: `AppType`, `DocumentUuid`, `CancelReason`, `CancelDate`, `uuid`, `cancelReason`. Gerçek sandbox ölçümü (Deney A) `{uuid, cancelReason}` ile de HTTP 200 ve "Tüm alanlar dolu olmalıdır!" döndü — yani API bu alanları **tanımadığı için yok sayıyor**, zorunlu alanların eksikliğinden şikâyet ediyor. Kanıtlanan: fazladan alanlar isteği kırmıyor. **Kanıtlanmayan:** API'nin bunları yok saydığı — "belki kabul ediyor ama değeri eksik" ihtimali uydurma kimlikle ayırt edilemez.

Bu kod **test uyumluluğu** gerekçesiyle yazılmış; ama üretim çağrısı da aynı gövdeyi kullanıyor. Sözleşmede karşılığı yok.

---

## 3. e-Fatura — karıştırılmaması gereken iki ayrı uç

Kullanıcının uyarısı haklı ve kodda karşılığı **doğru**:

| İşlem | Uç | Kod | Ayrım |
|---|---|---|---|
| e-Fatura **red/kabul yanıtı** | `POST /HizliApi/RestApi/SendApplicationResponse` | `hizliConnectService.ts:403` `sendApplicationResponse`, `routes/efatura.ts:1459` | ✅ Ayrı ve doğru |
| e-Arşiv/giden belge **iptali** | `POST /HizliApi/RestApi/CancelDocument` | `hizliConnectService.ts:491` `cancelDocument` | ✅ Ayrı ve doğru |

İki uç kodda **karıştırılmamış** — `sendApplicationResponse` ayrı bir metot, ayrı bir rota, ayrı bir çağrı noktası. Doğrulandı.

### 3.1 ⚠️ Ancak `SendApplicationResponse` gövdesi sözleşmeyle uyuşmuyor

**Verilen sözleşme:**
```json
{ "AppType": 1,
  "Documents": [{ "DocumentDate": "...", "DocumentId": "...", "DocumentUUID": "..." }],
  "ResponseCode": "RED", "ResponseDescription": "RED EDİYORUM" }
```

**Koddaki gövde** (`hizliConnectService.ts:343-359`, `routes/efatura.ts:1459`):
```ts
{ uuid: string; responseType: 'KABUL' | 'RED'; reason?: string; documentNo?: string }
```
→ düz `{ uuid, responseType, reason }` olarak gönderiliyor.

| Sözleşme alanı | Kodda | Sonuç |
|---|---|---|
| `AppType: 1` | ❌ yok | **UYUŞMUYOR** |
| `Documents[]` dizisi | ❌ yok — düz nesne | **UYUŞMUYOR** |
| `DocumentUUID` | ⚠️ `uuid` (düz, küçük harf, dizi dışında) | **UYUŞMUYOR** |
| `DocumentId` | ⚠️ `documentNo` (farklı ad) | **UYUŞMUYOR** |
| `DocumentDate` | ❌ yok | **UYUŞMUYOR** |
| `ResponseCode: "RED"` | ⚠️ `responseType: 'RED'` (farklı ad) | **UYUŞMUYOR** |
| `ResponseDescription` | ⚠️ `reason` (farklı ad) | **UYUŞMUYOR** |

**Sözleşme kanıtlanmış olsa da kod bu sözleşmeye göre yazılmamış.** Yedi alanın sıfırı birebir uyuşuyor; beşi hiç yok, ikisi farklı adla var. Bu uç için uygulama düzeltmesi gerekiyor — ama **kullanıcı talimatı gereği bu turda yapılmadı.**

---

## 4. e-İrsaliye — sözleşme yok, kod yok, uydurma yapılmadı

| Aradığım | Bulunan |
|---|---|
| e-İrsaliye iptal metodu (`cancelDespatch` vb.) | ❌ **yok** |
| e-İrsaliye iptal ucu | ❌ **yok** |
| Mevcut e-İrsaliye metotları | `sendDespatchAdvice` (`:293`), `convertDespatchToInvoice` (`:381`), `sendEIrsaliye` (`:1484`) — hepsi **gönderim/dönüşüm**, iptal değil |
| `AppType` değeri | İkinci sözlükte `3 = e-İrsaliye`; `cancelDocument` sabit `3` gönderiyor — bkz. §2 çelişkisi |

**e-İrsaliye iptali için kod yazılmadı ve yazılmamalı** — sözleşme yok. Kullanıcının verdiği tabloda da "HÂLÂ TEYİT GEREKİYOR" olarak işaretli; bu tespitle örtüşüyor.

---

## 5. `docs/30` ve `docs/36` ile çelişki — hangisi doğru?

| İddia | Kaynak | Bugünkü kod karşısında |
|---|---|---|
| "`cancelInvoice` gövdesinde `CancelDocument`… GEÇMEZ" | `docs/30` §3.1 | ❌ **ARTIK YANLIŞ** — `:332-347` çağırıyor |
| "Giden belge iptali — vendor iptali ❌ YOK — INTEGRATION GAP" | `docs/30` §2 | ❌ **ARTIK YANLIŞ** |
| "Vendor `CancelDocument` sözleşmesi KANITLANAMADI" | `docs/36` §9 | ❌ **ARTIK YANLIŞ** — sözleşme kanıtlandı (§0.2) + kod uyguluyor (§1) |
| "Giden belge kimliği KANITLANAMADI" | `docs/36` §9 | 🟡 **KISMEN** — alan adı `DocumentUuid` kanıtlandı; **değerin nereden geldiği** hâlâ ölçülmedi (§6) |
| "Uygulama düzeltmesi YAPILMADI" | `docs/36` §9 | ❌ **YAPILDI** — 09:12'de |
| "Production KAPALI" | `docs/36` §10 | ✅ **HÂLÂ DOĞRU** |
| "Gerçek sandbox belge yaşam döngüsü KOŞULAMADI" | `docs/36` §9 | ✅ **HÂLÂ DOĞRU** — gerçek belge gönderilmedi |

**`docs/36` §9 etiketlerinin en az dördü kodun gerisinde kalmış.** Bu, kullanıcının "statü revize edilmeli" tespitini doğruluyor.

---

## 6. Kanıtlanmayan tek şey: giden belge kimliğinin kaynağı

`db/36`'nın "giden belge kimliği KANITLANAMADI" etiketi **tamamen kapanmamıştır** ve kapanmamasının nedeni alan adı değil, **değerin üretildiği yer**:

| Kaynak | Ne yapıyor | Sorun |
|---|---|---|
| `routes/efatura.ts:101-104` | Gerçek ETTN yoksa `'TASLAK-ETTN-YOK'` yazar | Uydurmuyor — ama **iptal edilemez bir değer** |
| `electronicDocumentService.ts:106` | `eInvoiceUUID \|\| crypto.randomUUID()` | **Yerel UUID üretir** — entegratörün tanıdığı kimlik olmayabilir |
| `electronicDocumentQueue.ts:424` | `doc.uuid` yazar | Hangi uuid belirsiz |
| `hizliTeknolojiProvider.ts:312` | Gelen akışta `inv.uuid \|\| inv.ettn` bekler | Gelen için makul; **giden için kaynak teyitli değil** |

`documentConversionService.ts:344` bu değeri `invoice.eInvoiceUUID!` olarak alıp entegratöre gönderiyor. **Gönderilen değerin entegratörün kabul ettiği belge kimliği olduğu HİÇ ÖLÇÜLMEDİ** — çünkü gerçek belge gönderilmedi, dolayısıyla gerçek bir ETTN → `CancelDocument` eşleşmesi denenmedi.

Alan adı (`DocumentUuid`) ✅ kanıtlandı. **Değerin doğruluğu ⛔ kanıtlanmadı.**

---

## 7. Sonuç — revize edilmiş durum tablosu

| Kalem | Eski (`docs/36` §9) | **Yeni** | Dayanak |
|---|---|---|---|
| e-Arşiv `CancelDocument` sözleşmesi | KANITLANAMADI | ✅ **KANITLANDI** | Kod (§1/1-9) + gerçek sandbox yanıtı (§0.2) |
| e-Arşiv belge kimliği `DocumentUuid` (alan adı) | KANITLANAMADI | ✅ **KANITLANDI** | Kod §1/3 + sözleşme |
| `CancelReason` | — | ✅ **KANITLANDI** | Kod §1/4 |
| `AppType` (alan adı) | — | ✅ **KANITLANDI** | Kod §1/5 |
| `AppType` **değeri = 3 (e-Arşiv)** | — | ⛔ **ÇELİŞKİLİ** | İki zıt sözlük, §2 |
| `CancelDate` | — | ✅ **KANITLANDI** | Kod §1/6 |
| Başarı kriteri `IsSucceeded`/`Message` | KISMEN | ✅ **KANITLANDI** | Gerçek sandbox yanıtı §0.2 + okuyucu §1/7-8 |
| e-Fatura `SendApplicationResponse` | — | ✅ **KANITLANDI** (uç/ayrım) | §3 |
| e-Fatura red işlemi `ResponseCode: RED` | — | ✅ **KANITLANDI** (sözleşme) | §3 |
| e-Fatura `SendApplicationResponse` **gövdesi kodda** | — | ⛔ **UYUŞMUYOR** | §3.1 — 7/7 alan sapması |
| **Giden** e-Fatura iptali | TEYİT GEREKİYOR | ⛔ **HÂLÂ TEYİT GEREKİYOR** | §2 `AppType` belirsiz |
| e-İrsaliye iptali | TEYİT GEREKİYOR | ⛔ **HÂLÂ TEYİT GEREKİYOR** | §4 — kod yok, sözleşme yok |
| Giden belge kimliği **değerinin kaynağı** | KANITLANAMADI | ⛔ **HÂLÂ KANITLANMADI** | §6 |
| Gerçek sandbox belge yaşam döngüsü | KOŞULAMADI | ⛔ **HÂLÂ KOŞULAMADI** | Gerçek belge gönderilmedi |
| Production | KAPALI | ✅ **KAPALI** | §0.1 |

**Giden e-Fatura iptali için `AppType` çelişkisi çözülmeden ve e-İrsaliye sözleşmesi gelmeden implementasyon tamamlanmış sayılamaz.**

---

## 8. Önerilen sonraki adım (kod değişikliği DEĞİL)

Bugünkü kanıtla yapılabilecek **tek** düşük riskli işlem, §2'deki `AppType` çelişkisini **kontör yakmadan** ölçmektir: mevcut `phase19CancelContractProbe` aracı, uydurma bir kimlikle `AppType` değerlerini (1, 2, 3, 4, 5, 6, 7) tek tek deneyip hangisinin "belge bulunamadı" hangisinin "geçersiz tür" dediğini kaydedebilir. Bu, hata mesajı farkından doğru sözlüğü çıkarır — belge göndermez, kontör yakmaz.

Ancak bu, **mevcut kodu değiştirmek anlamına gelmez**; yalnız ölçüm aracının genişletilmesidir. Kullanıcı talimatı gereği bunun için de ayrıca izin istenmelidir.

---

## 9. Yapılmayanlar (bilinçli)

Mevcut kod **değiştirilmedi**. `AppType` sabit değeri değiştirilmedi. `inv.id` → `eInvoiceUUID` değişikliği yapılmadı. `uuid`/`cancelReason` fazla alanları kaldırılmadı. `SendApplicationResponse` gövdesi sözleşmeye uydurulmadı. e-İrsaliye için endpoint uydurulmadı. Production'a dokunulmadı, `ALLOW_PROD=true` yapılmadı, gerçek belge gönderilmedi/iptal edilmedi, kontör tüketilmedi. Mock kullanılmadı; hiçbir mock/lokal sonuç kanıt sayılmadı. Credential/token değerleri bu rapora yazılmadı.
