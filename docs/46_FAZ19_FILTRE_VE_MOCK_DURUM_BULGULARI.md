# FAZ 19 — İki Bağımsız Bulgu: Ters Filtre ve MOCK Durum Sızıntısı

**Tarih:** 16.09.2026
**Durum:** 🔍 **ÖLÇÜLDÜ — düzeltme için izin bekliyor. Hiçbir kod/veri değiştirilmedi.**
**Kapsam:** `docs/45` §7'deki iki açık maddenin (filtre dışlaması, `{...source}` taraması)
ölçümü + ölçüm sırasında çıkan **üçüncü** bağımsız bulgu
**Canlı API'ye istek gönderilmedi. Belge gönderilmedi/iptal edilmedi. Kontör tüketilmedi.**

> Bu belgedeki her sayı `data/database.json` üzerinde **salt okuma** üç `.mjs` betiğiyle
> ölçüldü ve gerçek çıktıdan kopyalandı. Hiçbiri koddan çıkarım değildir.

---

## 1. `{...source}` taraması — TEMİZ

`docs/45` §2.2'deki yayılım tuzağının başka uçlarda olup olmadığı tarandı:

```
$ grep -rn "\.\.\.\(source\|src\|kaynak\|original\|oldInvoice\|baseInvoice\|existingInvoice\|inv\)\b" \
    server/routes/*.ts server/services/*.ts
server/routes/invoices.ts:423:      ...source,      ← duplicate (düzeltildi, docs/45)
server/routes/invoices.ts:479:      ...source,      ← convert-return (düzeltildi, docs/45)
```

**Bulgu:** Kayıt yayan tek desen bu iki uçtur ve **ikisi de `docs/45`'te kapatıldı**.
Başka sızıntı noktası yok. Bu madde **kapandı**.

---

## 2. 🔴 Bulgu A — `hizli-bilisim.ts:898` filtresi **TERS** çalışıyor

`docs/45` §4.6'da "çıplak UUID'li gönderilmiş belgeler bu filtreden düşer, ayrı bir
kusurdur" denmişti. Ölçüm bunu **doğruladı ve ağırlaştırdı**: filtre yalnız eksik
bırakmıyor, aynı zamanda **uydurma kimliği içeri alıyor.**

### 2.1 Kod (`server/routes/hizli-bilisim.ts:897-899`)

```ts
const tracked = (db.invoices || []).filter(
  inv => inv.type === 'SALES' && typeof inv.eInvoiceUUID === 'string' && inv.eInvoiceUUID.startsWith('urn:uuid:')
);
```

### 2.2 Ölçüm — filtrenin gerçek davranışı

Filtre birebir kopyalanıp veriye uygulandı (`filtre-ters-mi.mjs`):

```
=== FİLTREDEN GEÇEN kayıtlar (entegratöre SORGULANACAKLAR): 1 ===
  inv-1788011937673 | SAT-2026-000013 | DELIVERED
  | urn:uuid:inv-1788011937673-2026 | UYDURMA Mİ: 🔴 EVET (uydurma!)
  | sağlayıcı: (gönderim kaydı yok)

=== FİLTREYE TAKILAN kayıtlar (sorgulanmayacak): 5 ===
  inv-1788332052626-1bcn | SAT-2026-000016 | SENT | aa58f0cc-… | sağlayıcı: MOCK
  inv-1788332086409-arlq | SAT-2026-000017 | SENT | 6506996c-… | sağlayıcı: MOCK
  inv-1788332086887-52ny | SAT-2026-000018 | SENT | d28da93d-… | sağlayıcı: MOCK
  inv-1788332105110-gc4u | SAT-2026-000019 | SENT | e8dfdb4a-… | sağlayıcı: MOCK
  inv-1788332105587-vwo1 | SAT-2026-000020 | SENT | fa630edd-… | sağlayıcı: MOCK
```

**Filtre tam olarak tersini yapıyor:**

| | Kayıt | Sonuç |
|---|---|---|
| ✅ İçeri alıyor | `inv-1788011937673` — **tek uydurma ETTN'li kayıt** | Bu, `docs/45` §4.4'te "karar bekliyor" denen kayıttır. Filtre onu GİB durum sorgusuna **sokuyor.** |
| ⛔ Dışlıyor | 5 kayıt — hepsi `SENT` | Hiçbirinin GİB durumu hiç sorgulanmayacak. |

Yani filtre, **sahte kimliği sorguya gönderirken gerçek belgeleri sorgudan men ediyor.**
`docs/45`'te "ayrı bir kusur" diye not edilen şey, aslında bir *ters çalışma* kusurudur.

⚠️ **Bu, filtre düzeltilmeden `inv-1788011937673` temizlense bile geçerlidir:**
filtre `urn:uuid:` önekini ETTN kanıtı sayıyor; önek ise yalnız biçimdir.

---

## 3. 🔴 Bulgu B — Gönderilmemiş belge "GİB'e iletildi" görünüyor

Bu bulgu `docs/45`'te yoktu; ölçüm sırasında çıktı.

### 3.1 Kod

`server/services/electronicDocumentQueue.ts`:

```ts
237:  const isTestProvider = provider.providerId.toUpperCase() === 'MOCK';
...
260:      description: isTestProvider
261:        ? `Belge TEST sağlayıcısına (${provider.name}) işlendi — GERÇEK gönderim yapılmadı, kontör düşülmedi.`
...
269:  this.syncErpDocumentStatus(doc, 'SENT');   // ← isTestProvider AYRIMI YOK
```

`syncErpDocumentStatus` (aynı dosya, `:418-425`) koşulsuz yazar:

```ts
inv.eInvoiceStatus = status;      // 'SENT'
inv.eInvoiceUUID = doc.uuid;
```

**Yani MOCK sağlayıcısında bile** ERP faturası `SENT` işaretleniyor. Zaman çizelgesi
(timeline) dürüstçe *"GERÇEK gönderim yapılmadı"* derken, **faturanın kendi alanı
"gönderildi" diyor.** İki kayıt birbiriyle çelişiyor.

### 3.2 Arayüz sonucu

`OfficialEInvoiceViewerModal.tsx:26` ve `EInvoicePreviewModal.tsx:602` `SENT`'i
"GİB İletildi" diye gösterir:

```tsx
const isSent = invoice.eInvoiceStatus === 'SENT' || ... === 'DELIVERED' || ... === 'ACCEPTED';
...
{isSent ? 'GİB İletildi' : 'Taslak'}
```

`EInvoicePreviewModal.tsx`'te bu yalnız etiket değil: **gönderim düğmesini de kilitler**
(`disabled={sending || isSent}`) ve yeşile boyar (`var(--success)`).

### 3.3 Ölçüm

```
=== ÖZET: hiçbir yere gönderilmediği hâlde "gönderildi" görünen faturalar ===
  ⚠️ inv-1788011937673 | SAT-2026-000013 | DELIVERED | kanıtlı gerçek gönderim: YOK
  ⚠️ inv-1788332052626-1bcn | SAT-2026-000016 | SENT | kanıtlı gerçek gönderim: YOK
  ⚠️ inv-1788332086409-arlq | SAT-2026-000017 | SENT | kanıtlı gerçek gönderim: YOK
  ⚠️ inv-1788332086887-52ny | SAT-2026-000018 | SENT | kanıtlı gerçek gönderim: YOK
  ⚠️ inv-1788332105110-gc4u | SAT-2026-000019 | SENT | kanıtlı gerçek gönderim: YOK
  ⚠️ inv-1788332105587-vwo1 | SAT-2026-000020 | SENT | kanıtlı gerçek gönderim: YOK
  toplam: 6
```

**6 fatura**, hiçbir yere gönderilmediği hâlde gönderilmiş görünüyor.

### 3.4 MOCK sınırı doğrulandı — bu bir test artefaktıdır

`mockProvider.ts` `docs/45`'ten **önce** (2026-09-12/13) zaten dürüst hâle getirilmişti:

```ts
providerStatus: `${MockElectronicDocumentProvider.MOCK_STATUS_PREFIX}SANDBOX`,   // 'MOCK_SANDBOX'
gibStatusCode: '',
gibMessage: 'MOCK sağlayıcı: gerçek GİB durumu yoktur (belge gönderilmedi).',
providerDocumentId: undefined,   // uydurma entegratör belge no'su ÜRETİLMEZ
```

Yani **MOCK sağlayıcısı doğru davranıyor**; kusur, kuyruğun dönen durumu ERP'ye
yazarken MOCK ayrımı yapmamasıdır.

Etkilenen kiracılar ve sağlayıcı ayarı (veriden):

```
tnt-1788332052266-8kek | FAZ4 TEKNOLOJI VE TICARET A.S. | eDönüşüm sağlayıcı: MOCK
tnt-1788332086036-f59i | FAZ4 TEKNOLOJI VE TICARET A.S. | eDönüşüm sağlayıcı: MOCK
tnt-1788332104731-v34a | FAZ4 TEKNOLOJI VE TICARET A.S. | eDönüşüm sağlayıcı: MOCK
```

`electronicDocuments` içinde `providerId` dağılımı **`{ "MOCK": 7 }`** — MOCK dışında
tek bir giden belge kaydı yok. Yani **gerçek HIZLI sağlayıcıdan geçmiş tek bir belge
kaydı bu veritabanında bulunmuyor.**

### 3.5 ⚠️ Bu bulgu `docs/45` §4.1 sınıflandırmasını etkiliyor

`docs/45` §4.1 "5 çıplak UUID kusur değildir, e-Arşiv'de ETTN'yi gönderici üretir"
diyordu. **Gerekçe kısmı hâlâ geçerli** — `crypto.randomUUID()` meşrudur. Ancak artık
ölçülmüş bir ek bilgi var: o 5 kaydın **hiçbiri gerçek bir gönderimden gelmemiştir**
(sağlayıcı: `MOCK`, hepsinde `gibStatusCode: undefined`). Yani:

> "Çıplak UUID kusur değildir" ✅ (doğru — biçim meşru)
> "Bu 5 kayıt gerçek gönderimin ürünüdür" ⛔ (yanlış — hiçbiri gönderilmedi)

Bu, `docs/45` §6'daki dürüstlük sınırını **doğrular**: "üretilen kimlik GİB'in
ETTN'sidir" iddiası kanıtlanmamıştı — ve bu veri kümesinde **hiçbir kimlik gerçek
gönderimden gelmemiştir.**

---

## 4. Önerilen düzeltme — kesin diff

### 4.1 Bulgu A — `server/routes/hizli-bilisim.ts:897-899`

`urn:uuid:` öneki ETTN kanıtı değildir. Kanıt, kaydın **gönderim izidir**:
`electronicDocuments` içinde o faturaya bağlı, MOCK olmayan bir kayıt.

```diff
-    const tracked = (db.invoices || []).filter(
-      inv => inv.type === 'SALES' && typeof inv.eInvoiceUUID === 'string' && inv.eInvoiceUUID.startsWith('urn:uuid:')
-    );
+    // 2026-09-16 (`docs/46` §2): Burada eskiden `eInvoiceUUID.startsWith('urn:uuid:')`
+    // filtresi vardı. Bu önek ETTN KANITI DEĞİL, yalnız biçimdir; iki yönde de
+    // yanıltıyordu: (a) uydurma `urn:uuid:<id>-<yıl>` değerini gerçek ETTN gibi
+    // sorguya SOKUYOR, (b) e-Arşiv'de göndericinin ürettiği çıplak UUID'li GERÇEK
+    // belgeleri sorgudan DÜŞÜRÜYORDU. Kanıt, kaydın gönderim izidir.
+    const gonderimIzli = new Set(
+      (db.electronicDocuments || [])
+        .filter(d => d.documentType === 'INVOICE'
+                  && d.providerId
+                  && d.providerId.toUpperCase() !== 'MOCK')
+        .map(d => d.internalDocumentId)
+    );
+    const tracked = (db.invoices || []).filter(
+      inv => inv.type === 'SALES'
+        && typeof inv.eInvoiceUUID === 'string' && inv.eInvoiceUUID.length > 0
+        && gonderimIzli.has(inv.id)
+    );
```

**Bu değişiklikle:** `inv-1788011937673` (gönderim izi yok) sorgudan **çıkar**;
5 MOCK kaydı da `providerId: 'MOCK'` olduğu için çıkar. Gerçek HIZLI gönderimi olan
belgeler — çıplak UUID'li olsalar bile — **girer**. Filtre amacına döner.

⚠️ **Yan etki:** Gerçek bir gönderimde `electronicDocuments` kaydı yoksa belge
sorgulanmaz. Bu, "yanlış belgeyi sorgula"dan daha güvenli taraftır (fail-closed).

⚠️ **AppType sabiti:** mevcut `1` (e-Fatura) sabiti bu turda **tartışılmadı ve
değiştirilmedi.** e-Arşiv için `3` olması gerekiyorsa bu **ayrı bir iştir** ve
`docs/40`'taki AppType ölçümüyle doğrulanmalıdır.

### 4.2 Bulgu B — `server/services/electronicDocumentQueue.ts:269`

```diff
-        // ERP Faturasının veya İrsaliyesinin e-Belge Durumunu Güncelle
-        this.syncErpDocumentStatus(doc, 'SENT');
+        // ERP Faturasının veya İrsaliyesinin e-Belge Durumunu Güncelle
+        // 2026-09-16 (`docs/46` §3): MOCK sağlayıcısında ERP faturası 'SENT'
+        // İŞARETLENMEZ. MOCK hiçbir entegratöre bağlı değildir; hiçbir yere
+        // gönderilmemiş belgeyi "GİB'e iletildi" göstermek muhasebede yanlış
+        // beyana yol açar (CLAUDE.md md.1). Etiket MOCK olduğunu taşımalıdır.
+        this.syncErpDocumentStatus(doc, isTestProvider ? 'MOCK_SENT' : 'SENT');
```

Ve arayüz eşlemeleri (üç yer) `MOCK_SENT`'i "gönderildi" saymamalı:

```diff
-  const isSent = invoice.eInvoiceStatus === 'SENT' || invoice.eInvoiceStatus === 'DELIVERED' || invoice.eInvoiceStatus === 'ACCEPTED';
+  // 2026-09-16 (`docs/46` §3): MOCK_SENT "GİB'e iletildi" DEĞİLDİR — belge hiçbir
+  // yere gönderilmedi. Yalnız gerçek entegratör durumları gönderilmiş sayılır.
+  const isSent = invoice.eInvoiceStatus === 'SENT' || invoice.eInvoiceStatus === 'DELIVERED' || invoice.eInvoiceStatus === 'ACCEPTED';
```

`EInvoicePreviewModal.tsx:602` etiketi ve `OfficialEInvoiceViewerModal.tsx:141` rozeti
`MOCK_SENT` için ayrı metin göstermeli: *"Test sağlayıcısı — gönderilmedi"*.

**Tip engeli yok:** `eInvoiceStatus?: '...' | string` (`schema.ts:450`,
`src/types/index.ts:404`) — `MOCK_SENT` tipi kırmaz. Yeni bir durum değeri olduğu için
`isSent`'in **dışında** kalır ve varsayılan "Taslak" dalına düşer.

### 4.3 Değişmeyenler

`docs/45`'teki 4 nokta, `mockProvider.ts`, `hizliTeknolojiProvider.ts`,
`electronicDocumentService.ts:106`, muhasebe/stok/KDV mantığı **değişmez.**

---

## 5. Veri tarafı — ayrı karar

Kod düzeltmesi yeni kayıtları durdurur; **mevcut 6 kaydı durdurmaz.**

| Kayıt | Önce | Sonra |
|---|---|---|
| 5 × `SENT` (MOCK, `SAT-2026-000016`–`000020`) | "GİB İletildi" görünüyordu | `eInvoiceStatus` → `MOCK_SENT` |
| `inv-1788011937673` (`DELIVERED` + 1200) | Sahte GİB onayı + uydurma ETTN | `DRAFT`; `gibStatusCode`/`gibStatusDescription`/`eInvoiceUUID` silindi |

Karar **kullanıcıya aittir ve alınmıştır** (bu oturumda soruldu, "hepsini düzelt"
onayı verildi). Uygulama §7'de kayıtlıdır; öncesinde yedek alınmıştır.

---

## 6. ⛔ Dürüstlük sınırı

- Bu belgenin **1–5. bölümleri ölçümdür**; hiçbir kod ve hiçbir veri değiştirilmediği
  anda yazılmıştır. Düzeltmelerin uygulanması ayrıca **§7**'de kayıtlıdır — §7
  okunmadan bu belge "hiçbir şey yapılmadı" diye okunmamalıdır.
- Ölçümler `data/database.json`'un **o andaki** hâline aittir; salt okuma yapıldı.
- ⛔ **Gerçek sandbox PASS değildir.** Hiçbir entegratör çağrısı yapılmadı.
- ⛔ "Bu belgeler GİB'e gönderilmedi" **kanıtı**, yerel kayıtta gönderim izi
  bulunmamasıdır. "Gerçekte gönderilmedi" iddiasının kanıtı değildir — yalnız bu
  veritabanında iz olmadığının kanıtıdır.
- ⛔ Filtre düzeltmesi **çalıştırılarak** doğrulandı (§7.2/B bölümü, 40 kontrol) —
  ama yine de **uçtan uca** doğrulanmadı: uca giden istek entegratöre çıkmadı, gerçek
  `GetDocumentListGUID` yanıtı görülmedi. "Filtre yanlış belge seçiyor muydu" sorusu
  veri üzerinde ölçüldü; "düzeltme canlıda doğru listeyi getiriyor mu" sorusu
  **açıktır.**
- ⛔ `GetDocumentListGUID` ve `GetDocumentReceiverAllList` sözleşmeleri bu turda
  **incelenmedi**; AppType sabiti (e-Arşiv için `3` mi?) açık kalıyor.
- Credential/token değeri bu belgeye yazılmadı. Production'a dokunulmadı,
  `ALLOW_PROD` boş, `IS_TEST_MODE=true`.

---

## 7. Uygulama kaydı (16.09.2026)

Kullanıcı onayı alındıktan sonra uygulandı. **Canlı API'ye istek gönderilmedi.**

### 7.1 Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `server/routes/hizli-bilisim.ts:896-917` | Ters önek filtresi → gönderim-izi filtresi (§4.1) |
| `server/services/electronicDocumentQueue.ts:269` | MOCK sağlayıcıda `'MOCK_SENT'` yazılır (§4.2) |
| `src/components/modules/edonusum/OfficialEInvoiceViewerModal.tsx` | `isMockSent` + "Test — GİB'e Gönderilmedi" etiketi |
| `src/components/modules/satis/InvoiceListView.tsx:270-290` | `isMockSent` + "GİB'e Gönderilmedi (Test)" |
| `src/components/ui/StatusBadge.tsx:55-59` | `MOCK_SENT` → "GİB'E GÖNDERİLMEDİ (TEST)" |
| `data/database.json` | 6 kayıt (§5) — **yedek alınarak** |

### 7.2 Test çıktısı

**Yeni süit — `server/tests/phase19GonderimIziTest.ts`: 40 PASS / 0 FAIL.**
A (kaynak kod), B (filtre davranışı, karşı-kontrollerle), C (gerçek veri + yedek
taraması), D (MOCK ayrımı + tip güvenliği), E (veri durumu), F (gerçek Express
rotası + gerçek JWT).

⚠️ F bölümü gerçek bir HTTP isteği yapar ama **yalnız `127.0.0.1`'e**; istek
entegratöre çıkmaz. Bu bölüm "uç ayakta ve durum bozmuyor" kanıtıdır, "entegratör
çağrısı doğru" kanıtı **değildir.**

**Tam regresyon turu — 9 süit, hepsi EXIT=0:**

| Süit | Sonuç |
|---|---|
| `phase19GonderimIziTest` | 40 PASS / 0 FAIL |
| `phase19SyntheticEttnTest` | 34 PASS / 0 FAIL |
| `phase19CancelFlowTest` | 29 PASS / 0 FAIL |
| `phase19AcceptResponseTest` | 27 PASS / 0 FAIL |
| `phase19ApplicationResponseTest` | 34 PASS / 0 FAIL |
| `phase19RejectAndIdentityTest` | 26 PASS / 0 FAIL |
| `phase19ApplicationResponseRouteTest` | 24 PASS / 0 FAIL |
| `phase11FullFunctionalAuditTest` | 15 modül matrisi, tamamı PASS |
| `phase12PerformanceLoadTest` | 0 duplicate / 0 kayıp / 0 negatif stok / 0 bozulma |

Yukarıdaki 6 süitin çıktısı kendi içinde **"MOCK/STUB tabanlıdır — gerçek sandbox
PASS DEĞİLDİR"** uyarısını taşır. Bu uyarı kaldırılmadı.

**Tip kontrolü:** `tsc --noEmit -p tsconfig.server.json` → EXIT 0 (çıktı yok);
`tsc --noEmit -p tsconfig.app.json` → EXIT 0 (çıktı yok).

### 7.3 Yapılmayanlar

Bu turda `SendDocument`/`CancelDocument` **çağrılmadı**; kontör tüketilmedi; canlı
Hızlı Bilişim host'una istek gitmedi; `ALLOW_PROD` boş bırakıldı. `SAT-2026-000013`
kaydına dokunulmadı.

⚠️ Yarım kalanlar: AppType sözleşmesi (§6), gerçek sandbox uçtan uca koşu, ve
`docs/45` §5'teki 4 madde hâlâ açık.
