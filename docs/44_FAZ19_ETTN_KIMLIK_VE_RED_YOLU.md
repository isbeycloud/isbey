# FAZ 19 — Belge Kimliği (ETTN) ve Red Yolu Düzeltmesi

**Tarih:** 16.09.2026
**Onay:** Kullanıcı — *"sana bırakıyorum"* + iki hedefli soruya verilen yanıt (ETTN'ye geç + reddi doğru uca taşı)
**Kapsam:** (1) `DocumentUUID`'nin ETTN olması, (2) red bildiriminin `SendApplicationResponse` + `ResponseCode:"RED"` olması
**Canlı API'ye istek gönderilmedi. Belge gönderilmedi/iptal edilmedi. Kontör tüketilmedi.**

> Bu belge `docs/42` ((b)) ve `docs/43` ((a)+(c))'ün devamıdır. Bu turda `docs/43` §3 ve §8'de **açık bırakılan iki madde kapatıldı**.

---

## 1. Belge kimliği — `inv.id` → ETTN

### 1.1 Sorun

`Documents[0].DocumentUUID` sözleşmede **e-Belge UUID (ETTN)** olmalıydı. Zincir şuydu:

```
EDonusumView.tsx:232   uuid: inv.id            ← iç kayıt kimliği
  → efatura.ts         documentUuid: uuid      ← ham değer doğrudan gövdeye
  → SendApplicationResponse  Documents[0].DocumentUUID
```

Gerçek veriyle ölçüm — ikisi **eşit değil**:

| Alan | Değer |
|---|---|
| `inv.id` | `inv-inc-1787823405260` |
| `eInvoiceUUID` | `urn:uuid:7c89b21f-8294-4d81-9872-918239019283` |

Entegratör belgeyi iç kimlikle bulamaz → kabul/red gerçek belgede çalışmazdı.

### 1.2 Düzeltme — üç katmanda birden

| Katman | Değişiklik |
|---|---|
| `EDonusumView.tsx` | `uuid: inv.id` → `uuid: inv.eInvoiceUUID`; **ETTN yoksa istek hiç başlatılmaz**, kullanıcıya sebep gösterilir |
| `routes/efatura.ts` | Kimlik **sunucuda kayıttan çözümlenir**: `kayit.eInvoiceUUID`. İstemci id ya da ETTN göndermiş olabilir; ikisi de çözülür, ama gövdeye **yalnız ETTN** gider. ETTN yoksa **400** — ağa hiç çıkılmaz |
| `hizliConnectService.ts` | JSDoc'taki `⛔ BİLİNEN AÇIK` notu kaldırıldı; kural yazıldı |

Sunucu tarafındaki çözümleme savunma katmanıdır: istemci eski sürümde kalmış olsa bile gövdeye yanlış kimlik gitmez.

### 1.3 Neden "ETTN yoksa 400" ve "sessizce boş gönder" değil

Boş veya yanlış kimlikle gönderilen bir istek, entegratörde **hiçbir belgeyi hedeflemez** ama HTTP 200 dönebilir. Kullanıcı "kabul ettim" sanır, belge karşı tarafta reddedilmemiş olur. Bu yüzden eksik kimlik **fail-closed** karşılanır ve `docs/43`'te eklenen iş-seviyesi kapısıyla aynı disiplini izler.

---

## 2. Red yolu — `CancelDocument` → `SendApplicationResponse` (`RED`)

### 2.1 Sorun (`docs/43` §8'de raporlanmıştı)

`incomingInvoiceService` gelen faturayı reddederken `provider.cancelInvoice(...)`, yani **`CancelDocument`** çağırıyordu. Ama red bir **uygulama yanıtıdır**, iptal değildir. `CancelDocument` ucunun `AppType` kümesi **3/6/7**'dir (e-Arşiv / e-SMM / Müstahsil); e-Fatura (1) **yoktur**. Yani gelen bir e-Faturayı reddetmek, sözleşmeye göre yanlış uçla yapılıyordu.

### 2.2 Düzeltme — iki dal tek disiplinde birleşti

```ts
const belgeUuid = typeof incInvoice.uuid === 'string' ? incInvoice.uuid.trim() : '';
if (!belgeUuid) {
  throw new Error('Gelen belgenin e-Belge UUID (ETTN) bilgisi yok; uygulama yanıtı gönderilemedi.');
}

const yanitKodu: 'KABUL' | 'RED' = action === 'ACCEPTED' ? 'KABUL' : 'RED';
const yanit = await provider.respondToInvoice({
  uuid: belgeUuid,
  responseCode: yanitKodu,
  description: action === 'REJECTED' ? (reason || 'Müşteri reddi') : undefined,
  documentId: incInvoice.invoiceNo,
  documentDate: incInvoice.issueDate,
}, settings);

if (!yanit?.success) {
  throw new Error(yanit?.message || `${yanitKodu} bildirimi entegratöre iletilemedi; durum değiştirilmedi.`);
}

if (action === 'ACCEPTED') { incInvoice.status = 'ACCEPTED'; }
else { incInvoice.status = 'REJECTED'; incInvoice.rejectionReason = reason; }
```

Ayırt edici ayrıntı: `description` **yalnız redde** doldurulur. Kabulde `undefined` kalır — kabul bildirimine red gerekçesi iliştirilmez.

Ayrıca arayüzdeki `respondToInvoice` JSDoc'una *"RED için bu metot kullanılır, `cancelInvoice` DEĞİL"* kuralı yazıldı.

### 2.3 Etkilenmeyen yol

**Giden belge iptali** (`documentConversionService.cancelInvoice`) **değiştirilmedi**. O gerçek bir iptaldir ve `CancelDocument` doğru uçtur; testi 29/0 PASS kaldı (bkz. §4).

---

## 3. Kanıt — iki yeni süit, ikisinin de ayırt etme gücü kanıtlı

### 3.1 `phase19RejectAndIdentityTest.ts` — 26 kontrol (servis katmanı)

Casus sağlayıcı hangi metodun çağrıldığını kaydeder.

| Koşum | Sonuç | Exit |
|---|---|---|
| **Eski davranış** (red → `cancelInvoice`) | 20 PASS / **6 FAIL** | 1 |
| **ETTN kapısı kaldırıldı** | 22 PASS / **4 FAIL** | 1 |
| **Mevcut kod** | **26 PASS / 0 FAIL** | 0 |

Eski davranış kontrolünün yakaladığı sapma:

```
❌ FAIL  A-1 Red, respondToInvoice ile gitti — çağrılar: ["cancelInvoice"]
❌ FAIL  A-3 ResponseCode = "RED" — gelen: undefined
```

ETTN kapısı kontrolünün yakaladığı sapma:

```
❌ FAIL  D-3 ⚠️ Entegratöre HİÇ çağrı gitmedi — çağrılar: ["respondToInvoice"]
```

### 3.2 `phase19ApplicationResponseRouteTest.ts` — 24 kontrol (YENİ, gerçek HTTP)

Bu süit **gerçek Express route'unu, gerçek auth middleware'ini ve gerçek JWT'yi** kullanır; yalnızca entegratör çağrısı casuslanır. `127.0.0.1`'e bağlanır, dış ağa çıkmaz.

| Koşum | Sonuç | Exit |
|---|---|---|
| **Eski davranış** (ham `uuid` gövdeye) | 17 PASS / **7 FAIL** | 1 |
| **Mevcut kod** | **24 PASS / 0 FAIL** | 0 |

Kontrol koşumunun yakaladığı — **en kritik kanıt**: ETTN'siz kayıtta iç kimlik entegratöre gidiyordu ve route **HTTP 200** dönüyordu.

```
❌ FAIL  A-3 Gövdeye ETTN gitti — gelen: inv-route-test-1
❌ FAIL  B-1 ETTN yoksa 400 döndü — status: 200
❌ FAIL  B-2 Entegratöre HİÇ çağrı gitmedi — çağrılar: [{"payload":{"documentUuid":"inv-route-test-1",...}}]
```

Kapsam: kimlik çözümlemesi (istemci `inv.id` **ve** ETTN gönderdiğinde) · ETTN yoksa 400 + ağa çıkmama · uuid/responseType eksik- geçersiz · kayıt yok · RED yolu · token yoksa 401.

---

## 4. Regresyon — hepsi temiz

| Kontrol | Komut | Sonuç |
|---|---|---|
| Tip (sunucu) | `npx tsc --noEmit -p tsconfig.server.json` | ✅ **EXIT=0** |
| Tip (frontend dahil) | `npx tsc -b` | ✅ **EXIT=0** |
| Red + kimlik (yeni) | `phase19RejectAndIdentityTest` | ✅ **26 PASS / 0 FAIL** |
| Route + kimlik (yeni) | `phase19ApplicationResponseRouteTest` | ✅ **24 PASS / 0 FAIL** |
| Kabul bildirimi | `phase19AcceptResponseTest` | ✅ **27 PASS / 0 FAIL** |
| Kapı + gövde | `phase19ApplicationResponseTest` | ✅ **34 PASS / 0 FAIL** |
| Giden iptal akışı | `phase19CancelFlowTest` | ✅ **29 PASS / 0 FAIL** |
| FAZ 18 | `phase18HizliBilisimIntegrationTest` | ✅ **53 PASS / 0 FAIL / 3 SKIP** |

FAZ 18'deki 3 SKIP, `docs/36`'dan bilinen **egress kısıtıdır** (HTTP 403 `blocked-by-allowlist`) — FAIL değildir, bu değişiklikle ilgisi yoktur. Giden iptal akışının 29/0 kalması, `CancelDocument`'un **bilerek** dokunulmadığını kanıtlar.

---

## 5. ⛔ Dürüstlük sınırı — bu kanıt NE DEĞİLDİR

- ⛔ **Gerçek sandbox PASS DEĞİLDİR.** Entegratör çağrısı üç süitte de taklit edilir; **gerçek entegratör yanıtı görülmemiştir**.
- ⛔ **Sözleşme ölçülmedi.** `DocumentUUID`'nin ETTN beklediği ve `ResponseCode:"RED"` kabul edildiği **gözlemlenmedi**; `docs/41`'teki vendor dokümanından okundu.
- ⛔ **Belge kimliğinin ETTN olduğu varsayımı kanıtlanmadı.** Bu turda *"gövdeye giden değer, kaydın ETTN alanıdır"* kanıtlandı — **o alanın gerçekten GİB'in ETTN'si olduğu değil.** Veride `eInvoiceUUID` iki farklı biçimde bulunuyor (bkz. §6).
- ⛔ **Uçtan uca belge yaşam döngüsü koşulamadı** — gelen fatura senkronu + kabul hâlâ gerçek sandbox'ta denenmedi.
- Geçici derleme dizinleri (`/tmp/redtest`, `/tmp/routetest`, `/tmp/reg2`, `/tmp/f18b`) **silindi**.

---

## 6. ⛔ Bu turda ÇIKAN YENİ BULGU — `eInvoiceUUID` alanı tutarsız doldurulmuş

Belge kimliği düzeltilirken alanın kendi geçmişi incelendi. Veride **14 kayıt** `eInvoiceUUID` taşıyor ve **üç farklı üretim yolu** var:

| Biçim | Adet | Örnek | Kaynak |
|---|---|---|---|
| `urn:uuid:<id>-2026` — **sentetik** | **8** | `urn:uuid:inv-1788011937673-2026` | `routes/invoices.ts` (3 yer) |
| Çıplak UUID (urn yok) | 5 | `aa58f0cc-4128-46d9-aa2d-e81bd9f38b7e` | entegratörden dönen ham değer |
| `urn:uuid:` + UUID-v4 | **1** | `urn:uuid:7c89b21f-…` | entegratörden dönen tam ETTN |

**En ciddi olan sentetik kalıp:** `server/routes/invoices.ts` üç yerde faturaya `urn:uuid:${invoiceId}-2026` biçiminde **tahmin edilebilir, üretilmiş** bir ETTN yazıyor. 8 kayıt bu deseni taşıyor (7'si `DRAFT`). Bu, `efatura.ts` içindeki "uydurma ETTN yazma" düzeltmesinin **atladığı ayrı bir kaynak**: XML üretimi artık gerçek ETTN yoksa `TASLAK-ETTN-YOK` yazıyor, ama **fatura kaydının kendisi** hâlâ sahte bir ETTN taşıyor.

Sonuç: bu kalıptaki bir kayıt entegratöre gönderilirse, **gövdeye sözleşmeye uygun biçimde ama var olmayan bir belge kimliği** gider. Bu turda **düzeltilmedi** — ayrı bir karar (üretim noktalarını kaldırmak + mevcut 8 kaydın nasıl ele alınacağı).

> **2026-09-16 DÜZELTME (`docs/45`):** Yukarıdaki sınıflandırmanın bir kısmı geri alındı.
> **Çıplak UUID'ler (5 kayıt) kusur DEĞİLDİR** — `crypto.randomUUID()` çıktısıdır ve
> e-Arşiv'de ETTN'yi gönderici üretir; bu meşrudur. Ayrıca üretim noktası **3 değil 4**'tür:
> `invoices.ts`'teki üç satıra ek olarak `OfficialEInvoiceViewerModal.tsx:27` de kullanıcıya
> gösterilen ve panoya kopyalanan uydurma bir ETTN üretiyor. Tam harita, kesin diff ve
> veri seçenekleri **`docs/45`**'tedir.


---

## 7. Yapılmayanlar

Sentetik ETTN üretimi (`routes/invoices.ts`) **düzeltilmedi** — §6. Giden belge iptali (`documentConversionService.cancelInvoice`) **değiştirilmedi**. e-Fatura iptal ucu **uydurulmadı**; `docs/40` §3 ve `docs/41` §5'teki boşluk **açık**, `docs/37` 10. madde geçerli. `AppType: 3` sabiti değişmedi. `getDocumentList` yorumu değişmedi. Muhasebe/stok/KDV mantığına dokunulmadı. Production'a dokunulmadı, `ALLOW_PROD` açılmadı, gerçek belge gönderilmedi/iptal edilmedi, kontör tüketilmedi. **Mock/casus sonucu gerçek sandbox kanıtı sayılmadı.** Credential/token değerleri rapora yazılmadı (testlerde yalnız `sahte-*` yer tutucuları var).

---

## 8. Kalan karar noktaları

1. **§6 sentetik ETTN üretimi** — `routes/invoices.ts` üç nokta + verideki 8 kayıt.
2. **`eInvoiceUUID` biçim tutarsızlığı** — 5 kayıt `urn:` öneki olmadan. Entegratörün hangi biçimi beklediği vendor'dan teyit edilmeli.
3. **Gerçek sandbox koşumu** — `tools/faz19-belge-akisi.ps1` (egress erişimli Windows makinesi, kontör riski).
4. **e-Fatura iptal ucu** — vendor'dan hâlâ teyit gerekli (`docs/37` 10. madde).
