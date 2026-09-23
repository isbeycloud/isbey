# FAZ 19 — `SendApplicationResponse` İş-Seviyesi Kapısı Düzeltmesi

**Tarih:** 16.09.2026
**Onay:** Kullanıcı — *"onay veriyorum tek tek ilerle"* (üç kalemin ikincisi: **b**)
**Kapsam:** Yalnız (b). (a) ve (c) **yapılmadı**.
**Canlı API'ye istek gönderilmedi. Belge gönderilmedi/iptal edilmedi. Kontör tüketilmedi.**

---

## 1. Ne değişti — tek dosya, tek metot

**Dosya:** `server/services/hizliConnectService.ts` → `sendApplicationResponse`

| | Önce | Sonra |
|---|---|---|
| İstek gövdesi | `{uuid, responseType, reason, documentNo}` | **DEĞİŞMEDİ** (bu (a) işidir) |
| Uç / metot | `POST .../SendApplicationResponse` | **DEĞİŞMEDİ** |
| Başarı kararı | HTTP 2xx → koşulsuz `success: true` | HTTP 2xx **+ iş-seviyesi bayrak** |
| Dönen alanlar | `{success, data, message}` | `{success, isSeviyesi, data, message}` + hata yolunda `error` |

Eklenen kapı, `cancelDocument` ve `cancelEArsivInvoice`'ta **zaten kullanılan** desenin aynısıdır: `isSeviyesiSonucuOku(res.data)` → `'basarisiz'` ise `success: false`.

Üç davranış kuralı:

1. **HTTP 200 + `IsSucceeded: false` → `success: false`.** Yanıt "gönderildi" diye raporlanmaz; mesaj API'nin `Message` alanını taşır.
2. **Bayrak yoksa → `success: true` ama `isSeviyesi: 'belirsiz'`** ve mesaj açıkça *"iş-seviyesi başarı bayrağı yanıtta yok — doğrulanmadı"* der. Uydurma onay üretilmez.
3. **HTTP hatası / ağ hatası → `success: false`, `isSeviyesi: 'basarisiz'`.** (Önceden de böyleydi; `isSeviyesi` alanı eklendi.)

> **Sözleşme dayanağı:** `docs/41` §2.1 — bu ucun çıkışı `ResponseMessage` (`IsSucceeded` + `Message`). `docs/40` ölçümü, aynı API ailesinin 200 içinde iş hatası bildirdiğini zaten kanıtlamıştı.

---

## 2. Kanıt — yeni test süiti

**Dosya:** `server/tests/phase19ApplicationResponseTest.ts` (23 kontrol)

Süit, `phase19CancelFlowTest.ts`'in stub kalıbını kullanır: `axios.post` sahtelenir, **ağa çıkılmaz**.

### 2.1 Ayırt etme gücü — kontrol koşumu

Testin gerçekten kusuru yakaladığını kanıtlamak için, **kapı kaldırılıp** (eski davranış) aynı test koşuldu. Yalnız derlenmiş `.js` kopyası yamalandı; **kaynak `.ts`'e dokunulmadı.**

| Koşum | Sonuç | Çıkış kodu |
|---|---|---|
| **Kapı YOK** (eski davranış) | **12 PASS / 11 FAIL** | **1** |
| **Kapı VAR** (mevcut kod) | **23 PASS / 0 FAIL** | **0** |

Kontrol koşumunun yakaladığı asıl kusur, birebir kanıt satırı:

```
❌ FAIL  B-1a HTTP 200 + IsSucceeded:false → success:false
   — {"success":true,"data":{"IsSucceeded":false,"Message":"Belge bulunamadı."},
      "message":"KABUL uygulama yaniti gonderildi."}
```

Bu satır, `docs/41` §3'te tarif edilen kusurun **ta kendisidir**: API iş hatası bildiriyor, kod "gönderildi" diyor. Kapı eklendiğinde aynı kontrol `success:false` döner ve geçer.

### 2.2 Kontrol listesi

**A. Pozitif**
- A-1a/b/c — doğru URL, POST, `Authorization: Bearer`
- A-1d/e — `IsSucceeded:true` → `success:true`, `isSeviyesi:'basarili'`
- A-2a/b/c — bayrak yok → `success:true` ama `isSeviyesi:'belirsiz'` + "doğrulanmadı" mesajı

**B. Negatif — sahte "gönderildi" üretilmemeli**
- B-1 — HTTP 200 + `IsSucceeded:false` → `success:false` *(asıl kusur)*; mesaj API'yi taşır; **"gönderildi" iddia etmez**
- B-2 — `isSucceeded:false` (küçük harf)
- B-3 — iç içe `{data:{IsSucceeded:false}}`
- B-4 — `Success:false`
- B-5 — HTTP 400 · B-6 — HTTP 500 · B-7 — ağ hatası (`ECONNABORTED`)
- B-8 — boş gövde → `belirsiz`, onay iddia edilmez
- B-9 — hata mesajı API'nin `Message` alanından okunur

**C. Ağ izolasyonu** — C-1/C-2: tüm çağrılar stub'dan geçti, canlı host kullanılmadı.

> **Not (test sağlamlaştırması):** B-1d ilk sürümde yalnız Türkçe "gönderildi" yazımını yakalıyordu ve kontrol koşumunda yanlışlıkla geçti. Kalıp `/g[öo]nderildi/i` olarak düzeltildi; kontrol koşumunda artık **FAIL** veriyor. (Yukarıdaki 11 FAIL bu düzeltilmiş hâlin sonucudur.)

---

## 3. Regresyon

| Kontrol | Komut | Sonuç |
|---|---|---|
| Tip kontrolü (sunucu) | `npx tsc --noEmit -p tsconfig.server.json` | ✅ **TSC_EXIT=0** |
| İptal akışı süiti | `phase19CancelFlowTest` (derlenmiş, `data/database.json` kopyasıyla) | ✅ **29 PASS / 0 FAIL** |
| Yeni süit | `phase19ApplicationResponseTest` | ✅ **23 PASS / 0 FAIL** |

İptal akışı süiti **değişmedi** — kapı eklenmesi `cancelDocument` / `cancelEArsivInvoice` davranışına dokunmadı.

---

## 4. ⛔ Dürüstlük sınırı — bu kanıt NE DEĞİLDİR

- ⛔ **Gerçek sandbox PASS DEĞİLDİR.** Gerçek entegratör yanıtı görülmedi. Süit HTTP katmanını taklit eder.
- ⛔ **Sözleşmenin kendisi ölçülmedi.** `IsSucceeded` alanının bu uçta gerçekten döndüğü **henüz gözlemlenmedi**; bu, `docs/41`'deki vendor dokümantasyonundan okunmuştur. Kod, alan yoksa `'belirsiz'` dediği için bu belirsizlik **güvenli** karşılanıyor.
- ⛔ **Gövde hâlâ sözleşmeye uymuyor** — `AppType` ve `Documents[]` yok (bkz. §5).
- Geçici derleme dizinleri (`.verify-tmp/artest`, `.verify-tmp/reg`) silindi; yalnızca test süiti kalıcı olarak repoda.

---

## 5. Bu turda YAPILMAYANLAR

- **(a)** `sendApplicationResponse` istek gövdesi sözleşmeye uydurulmadı — `{uuid, responseType, reason, documentNo}` **olduğu gibi kaldı**. `AppType` ve `Documents[]` hâlâ yok. Arayüz imzası ve `routes/efatura.ts:1459` çağıranı **değiştirilmedi**.
- **(c)** Sağlayıcı arayüzüne (`ElectronicDocumentProvider`) kabul/yanıt metodu **eklenmedi**. `MOCK` ve `HIZLI_TEKNOLOJI` sağlayıcıları değişmedi.
- `incomingInvoiceService.ts:236-243`'teki dürüstlük notu **silinmedi** — kod hâlâ kabul bildirimi yapmıyor, not hâlâ doğru.
- `AppType: 3` sabiti (`hizliTeknolojiProvider.ts:348`) değişmedi. `docs/40` §3'teki e-Fatura iptal boşluğu **açık**; `docs/37` 10. madde geçerli.
- `getDocumentList` yorumu değişmedi (`docs/41` §5.1 — bu uç için yanlış değil).
- `CancelDocument`, `CancelEArsivInvoice`, `RescindCancel` davranışı değişmedi.
- Production'a dokunulmadı, `ALLOW_PROD` açılmadı, gerçek belge gönderilmedi/iptal edilmedi, kontör tüketilmedi.
- **Canlı API'ye hiçbir istek gönderilmedi.** Mock/stub sonucu gerçek sandbox kanıtı **sayılmadı**.
- Credential/token değerleri bu raporda **yazılmadı** (test'te yalnızca `test-token-degeri` yer tutucusu var).
