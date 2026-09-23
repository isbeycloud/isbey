# FAZ 19 — Sentetik ETTN Üretimi: Düzeltme (UYGULANDI)

**Tarih:** 16.09.2026
**Onay:** Kullanıcı — hedefli iki soruya verilen yanıt: **"Evet, 4 noktayı düzelt"** ve **"7 DRAFT kaydı temizle, kritik kaydı ayır"**
**Durum:** ✅ **UYGULANDI ve doğrulandı.** (Bkz. §8 uygulama kaydı.)
⚠️ **§7'deki 1. madde SONRADAN KAPANDI:** `inv-1788011937673` kullanıcı onayı alınarak
temizlendi (`DRAFT`; `gibStatusCode`/`gibStatusDescription`/`eInvoiceUUID` silindi).
Ayrıntı: `docs/46` §5 ve §7.3. §7'nin 2. maddesi de `docs/46` Bulgu A olarak kapatıldı.
**Kapsam:** `eInvoiceUUID` alanına tahmin edilebilir sahte kimlik yazan 4 nokta + verideki kalıntılar
**Kaynak bulgu:** `docs/44` §6
**Canlı API'ye istek gönderilmedi. Belge gönderilmedi/iptal edilmedi. Kontör tüketilmedi.**

---

## 1. Sorun — tek cümlede

`eInvoiceUUID` alanına, **GİB'in resmî belge kimliği yerine** kayıt kimliğinden türetilmiş,
`urn:uuid:` önekli ama **var olmayan** bir değer yazılıyor. Biçim ikna edici olduğu için
bu değer aşağı akışta "gerçek ETTN" gibi okunuyor.

`docs/44` §1'de kimlik zinciri düzeltildi: artık gövdeye **her zaman** kaydın
`eInvoiceUUID` alanı gidiyor. Bu, doğru alanı okumayı sağladı — ama **alanın içi hâlâ
sahte olabiliyor**. Yani §1 düzeltmesi, sahte alan doldurulduğunda sahte kimliği
**daha güvenilir biçimde** iletebilir hâle geldi. Bu yüzden bu madde açık.

Kök neden: fatura **oluşturulurken** kimlik atanıyor. Oysa kimlik, belge entegratöre
gerçekten gönderildiğinde alınır. İkisi karıştırılmış.

---

## 2. Üretim noktaları — tam harita

| # | Dosya:satır | Uç / bağlam | Yazılan değer |
|---|---|---|---|
| 1 | `server/routes/invoices.ts:288` | Normal fatura oluşturma (`eInvoiceStatus:'DRAFT'` ile birlikte) | `` `urn:uuid:${invoiceId}-2026` `` |
| 2 | `server/routes/invoices.ts:425` | `POST /:id/duplicate` | `` `urn:uuid:${newId}-2026` `` |
| 3 | `server/routes/invoices.ts:479` | `POST /:id/convert-return` | `` `urn:uuid:${newId}-2026` `` |
| 4 | `src/.../edonusum/OfficialEInvoiceViewerModal.tsx:27` | Görüntüleme/kopyalama | `` invoice.eInvoiceUUID \|\| `urn:uuid:${invoice.id}-2026` `` |

### 2.1 Doğru davranış zaten kodda var

`server/services/electronicDocumentService.ts:106`:

```ts
const uuid = invoice.eInvoiceUUID || crypto.randomUUID();
```

Belge gönderim kuyruğuna alınırken ETTN yoksa **gerçek RFC-4122 UUID** üretiliyor.
Yani üç satır kaldırıldığında doğru davranış **kendiliğinden** devreye giriyor;
yeni bir mekanizma yazmak gerekmiyor.

### 2.2 ⚠️ `{...source}` tuzağı (2 ve 3 için kritik)

`duplicate` ve `convert-return` uçları kaydı `{ ...source }` ile yayıp üzerine yazıyor:

```ts
const clonedInvoice: Invoice = {
  ...source,          // ← kaynağın GERÇEK eInvoiceUUID'si buradan sızar
  id: newId,
  ...
  eInvoiceUUID: `urn:uuid:${newId}-2026`,   // ← şu an üzerine yazıldığı için sızıntı görünmüyor
```

Sentetik satır **silinirse**, yayılım yüzünden klona **kaynağın gerçek ETTN'si** geçer.
Bu, sahte kimlikten **daha ciddi** bir kusur olurdu: iki farklı belge aynı ETTN'yi taşır
ve iptal/kabul bildirimi yanlış belgeyi hedefler. Bu yüzden bu iki noktada satır
**silinmez**, açıkça `undefined` atanır.

---

## 3. Önerilen düzeltme — kesin diff

### 3.1 `server/routes/invoices.ts:288`

```diff
         items: processedItems,
         eInvoiceStatus: 'DRAFT',
-        eInvoiceUUID: `urn:uuid:${invoiceId}-2026`,
         userId: 'admin',
```

Yerine açıklama satırı:

```ts
        eInvoiceStatus: 'DRAFT',
        // 2026-09-16 (`docs/45`): ETTN ATANMAZ. ETTN GİB'in resmî belge
        // kimliğidir; belge entegratöre gitmeden bilinemez. Önceden burada
        // `urn:uuid:<id>-2026` diye tahmin edilebilir bir değer yazılıyordu ve
        // bu değer aşağı akışta gerçek ETTN gibi okunuyordu. Kimlik, belge
        // gerçekten gönderildiğinde `electronicDocumentService.queueInvoice`
        // tarafından atanır (`eInvoiceUUID || crypto.randomUUID()`).
        eInvoiceUUID: undefined,
```

### 3.2 `server/routes/invoices.ts:425` (`duplicate`)

```diff
       status: 'ACTIVE',
       eInvoiceStatus: 'DRAFT',
-      eInvoiceUUID: `urn:uuid:${newId}-2026`,
+      // 2026-09-16 (`docs/45`): `{...source}` yayılımı kaynağın gerçek ETTN'sini
+      // klona taşır. Klon AYRI bir belgedir; aynı ETTN'yi taşıyamaz. Bilerek
+      // `undefined` yazılıyor — satırı silmek yetmez.
+      eInvoiceUUID: undefined,
       gibStatusCode: undefined,
```

### 3.3 `server/routes/invoices.ts:479` (`convert-return`)

```diff
       status: 'ACTIVE',
       eInvoiceStatus: 'DRAFT',
-      eInvoiceUUID: `urn:uuid:${newId}-2026`,
+      // 2026-09-16 (`docs/45`): 3.2 ile aynı gerekçe — iade faturası AYRI belgedir.
+      eInvoiceUUID: undefined,
       notes: `${source.invoiceNo} nolu faturanın İADESİDİR.`,
```

### 3.4 `OfficialEInvoiceViewerModal.tsx:27`

```diff
-  const ettn = invoice.eInvoiceUUID || `urn:uuid:${invoice.id}-2026`;
+  // 2026-09-16 (`docs/45`): ETTN yoksa UYDURULMAZ. Bu değer ekranda gösteriliyor
+  // ve panoya kopyalanıyordu; kullanıcı onu gerçek belge kimliği sanıp karşı
+  // tarafa verebilirdi. Yoksa açıkça "ATANMADI" yazılır.
+  const ettn = invoice.eInvoiceUUID || null;
```

Ve gösterim satırı (151):

```diff
-                <span>ETTN: {ettn}</span>
-                <button onClick={handleCopyEttn} ...>
+                <span style={!ettn ? { color: 'var(--text-muted)', fontStyle: 'italic' } : undefined}>
+                  ETTN: {ettn || 'Belge gönderilmediği için atanmadı'}
+                </span>
+                <button onClick={handleCopyEttn} disabled={!ettn} ...>
```

`handleCopyEttn` başına erken çıkış:

```ts
const handleCopyEttn = () => {
  if (!ettn) return;   // 2026-09-16 (`docs/45`): uydurma kimlik kopyalanmaz.
  ...
};
```

### 3.5 Değişmeyenler

`electronicDocumentService.ts:106` **değişmez** (zaten doğru).
`electronicDocumentQueue.ts:424` (`inv.eInvoiceUUID = doc.uuid`) **değişmez** — orası
entegratörün gerçek yanıtını yazıyor.
`hizliConnectService.ts`, `efatura.ts`, `documentConversionService.ts` **değişmez**.
Muhasebe/stok/KDV mantığına dokunulmaz.

---

## 4. Veri tarafı — ayrı karar (kod düzeltmesi bunu ÇÖZMEZ)

### 4.1 Ölçüm (salt okuma, `data/database.json`)

459 fatura kaydı; 14'ünde `eInvoiceUUID` var.

| Biçim | Adet | Değerlendirme |
|---|---|---|
| `urn:uuid:<id>-<yıl>` — **sentetik** | **8** | ⛔ Sahte. Temizlenmeli. |
| Çıplak UUID (urn öneki yok) | 5 | ⚠️ **Kusur değil** — aşağıya bakın. |
| `urn:uuid:` + UUID-v4 | 1 | ✅ Gerçek ETTN. |

**Düzeltme (`docs/44` §6'ya göre):** 5 çıplak UUID **kusur sayılmamalı.** Bunlar
`crypto.randomUUID()` çıktısıdır ve e-Arşiv'de ETTN'yi **gönderici üretir** — bu
meşrudur, hatta zorunludur. §6'daki "tutarsızlık" değerlendirmesi bu ölçümle
**geri alınıyor**.

### 4.2 Sentetik kayıtların durumu

8 kaydın **hiçbiri** gönderim kuyruğunda değil (`electronicDocuments` eşleşmesi: **0**).
Yani hiçbiri entegratöre gitmemiş. 7'si `DRAFT`.

### 4.3 ⚠️ Tek kritik kalıntı

| Alan | Değer |
|---|---|
| `id` | `inv-1788011937673` |
| `invoiceNo` | `SAT-2026-000013` |
| `eInvoiceStatus` | **`DELIVERED`** |
| `eInvoiceUUID` | `urn:uuid:inv-1788011937673-2026` ← sahte |
| `gibStatusCode` | **`1200`** |
| `gibStatusDescription` | *"1200 - Belge GİB ve alıcı posta kutusu tarafından başarıyla işlendi."* |

Sentetik ETTN ile **sahte GİB onayı** aynı kayıtta. Kaynağı, 2026-09-12'de düzeltilen
eski `batch-status-sync` uydurmasıdır (`efatura.ts:794-800`'deki not). Kanıt: bu faturaya
değen `electronicDocuments` **0**, `integrationLogs` **0**, `auditLogs` **0** — gerçek
gönderime dair hiçbir iz yok. **Kalıntıdır, gerçek gönderim değildir.**

### 4.4 ⚠️ Bu kayıt hâlâ bir uca gidebilir (canlı tüketim yolu)

`documentConversionService.cancelInvoice:336`:

```ts
const hasOutgoingEDoc = Boolean(
  invoice.eInvoiceUUID &&
  ['SENT', 'ACCEPTED', 'DELIVERED'].includes(invoice.eInvoiceStatus || '')
);
```

`DELIVERED` bu kapıyı **açar** ve `cancelInvoice` sentetik ETTN ile `CancelDocument`
çağırır. Yani sahte kimlik bugün de bir uca gönderilebilir durumda. Kod düzeltmesi
**yeni** kayıtları durdurur; **bu kaydı durdurmaz.**

### 4.5 Seçilen yol — (B), kritik kayıt ayrıldı

Kullanıcı **(B)**'yi seçti. Uygulanan kural:

| Kayıt | İşlem |
|---|---|
| 7 × `eInvoiceStatus: 'DRAFT'` (hepsi `SAT-2026-000014`) | `eInvoiceUUID` + `gibStatusCode` + `gibStatusDescription` **silindi** |
| `inv-1788011937673` (`DELIVERED`, GİB 1200) | ⛔ **DOKUNULMADI** — kayıtlı ve karar bekliyor |

`inv-1788011937673` neden ayrıldı: gerçekten gönderilmiş olup olmadığı **bu ortamdan
doğrulanamaz**. Yerel kayıtta gönderim izi yok (bkz. §4.3) ama bu, gerçek gönderimin
olmadığının kanıtı değildir — yalnız bu veritabanında iz olmadığının kanıtıdır.
Sahte bir GİB onayını silmek, gerçek bir onayı silmekten daha az maliyetli görünse de
karar veri sahibinindir.

⚠️ **§4.4'teki kapı bu kayıt için HÂLÂ AÇIK:** `DELIVERED` + ETTN mevcut olduğu için
`documentConversionService.cancelInvoice` onu giden belge sayar ve sentetik ETTN ile
`CancelDocument` çağırır. Kod düzeltmesi bunu **durdurmaz**.

### 4.6 Yan bulgu — filtre dışlaması (ayrı iş, dokunulmadı)

`hizli-bilisim.ts:898` durum senkronu için:

```ts
inv.eInvoiceUUID.startsWith('urn:uuid:')
```

Çıplak UUID'li — ve §4.1'e göre **meşru** — gönderilmiş belgeler bu filtreden düşer;
GİB durumları hiç sorgulanmaz. Bu, sentetik ETTN'den **bağımsız** bir kusur.
Tam gönderim yolu izlenmedi; bu turda **dokunulmadı**.

---

## 5. Test planı (düzeltme onaylanırsa)

Yeni süit: `server/tests/phase19SyntheticEttnTest.ts` — casus tabanlı, gerçek Express
route ile. Kontroller:

**Bölüm A — oluşturma ucunda sahte kimlik yok.**
`POST /api/invoices` sonrası kayıtta `eInvoiceUUID` **undefined**. Kayıt üzerinden
`urn:uuid:<id>-` deseni **geçmiyor**.

**Bölüm B — duplicate sızıntısı YOK (en kritik).**
Kaynağa **gerçek** ETTN verilir → duplicate çağrılır → klonun `eInvoiceUUID`'si
**kaynağınki DEĞİL** ve **undefined**. Kontrol koşumu: sentetik satır silinip
`undefined` yazılmazsa bu kontrol FAIL vermeli; kanıt `{...source}` sızıntısıdır.

**Bölüm C — convert-return sızıntısı YOK.** B ile aynı desen, iade kaydı üzerinde.

**Bölüm D — viewer'da uydurma yok.**
ETTN'siz kayıtta gösterilen değer uydurma `urn:uuid:` **içermez**; kopyalama
devre dışıdır. ETTN'li kayıtta gerçek değer gösterilir ve kopyalanır.
(birim düzeyi — bileşen mantığı saf fonksiyona çıkarılarak test edilir.)

**Bölüm E — kuyruk hâlâ doğru kimlik üretiyor.**
ETTN'siz fatura `queueInvoice`'a verilir → üretilen UUID **RFC-4122** biçiminde ve
`urn:uuid:<id>-<yıl>` **desenine uymuyor**. (`electronicDocumentService.ts:106`
davranışının bozulmadığının kanıtı.)

**Bölüm F — veri temizliği (yalnız B/C seçildiyse).**
Temizlik sonrası: desen taraması **0 sonuç**; hedef kayıtta `gibStatusCode`/
`gibStatusDescription` **silinmiş**. Yedek dosyasının varlığı raporlanır.

**Regresyon:** `phase19CancelFlowTest` 29/0 · `phase19AcceptResponseTest` 27/0 ·
`phase19ApplicationResponseTest` 34/0 · `phase19RejectAndIdentityTest` 26/0 ·
`phase19ApplicationResponseRouteTest` 24/0 · FAZ 18 53/0/3 SKIP ·
`tsc --noEmit -p tsconfig.server.json` 0 · `tsc -b` 0.

⚠️ Düzeltme `invoices.ts` ve bir bileşene dokunduğu için **fatura oluşturma,
kopyalama ve iade** akışlarının mevcut süitleri de koşulmalı.

---

## 6. ⛔ Dürüstlük sınırı

- ⛔ **Gerçek sandbox PASS DEĞİLDİR.** Yeni süit gerçek Express route'larını kullanır
  ama entegratöre **çıkmaz**; bu akışlar zaten entegratör çağrısı yapmaz.
- ⛔ **"Uydurma kimlik üretilmiyor" kanıtlandı** — **"üretilen kimlik GİB'in ETTN'sidir"**
  DEĞİL. Beş çıplak UUID'nin gerçek gönderimden geldiği `providerId: "MOCK"` kayıtlarıyla
  zayıflatılmıştır (§4.1); gerçek entegratör yanıtı bu ortamda görülmemiştir.
- ⛔ `inv-1788011937673`'ün gerçekten gönderilip gönderilmediği **bu ortamdan
  doğrulanamaz** — yalnız "yerel kayıtta gönderim izi yok" denebilir.
- Geçici derleme dizinleri (`/tmp/synettn`, `/tmp/ctl`, `/tmp/reg45`, `/tmp/reg45b`,
  `/tmp/f18b`) **silindi**.

---

## 7. Kalan karar noktaları

1. **`inv-1788011937673`** — sahte GİB onayı (`DELIVERED` + 1200) ve sentetik ETTN
   duruyor. §4.4'teki iptal kapısını açık tutuyor. Temizlensin mi?
2. **§4.6 filtre dışlaması** — `hizli-bilisim.ts:898` `startsWith('urn:uuid:')` filtresi
   çıplak UUID'li gönderilmiş belgeleri GİB durum sorgusundan düşürüyor.
3. **§2.2 `{...source}` taraması** — aynı yayılım deseni başka uçlarda da kimlik/
   durum alanı sızdırıyor mu?
4. **Gerçek sandbox koşumu** — `tools/faz19-belge-akisi.ps1` (egress erişimli Windows).

---

## 8. Uygulama kaydı (16.09.2026)

### 8.1 Değiştirilen dosyalar

| Dosya | Değişiklik |
|---|---|
| `server/routes/invoices.ts` | 3 nokta: yeni fatura (`:288`), `duplicate` (`:425`), `convert-return` (`:479`) |
| `src/components/modules/edonusum/OfficialEInvoiceViewerModal.tsx` | `:27` uydurma ETTN kaldırıldı; gösterim + kopyalama düğmesi güncellendi |

`electronicDocumentService.ts`, `electronicDocumentQueue.ts`, `efatura.ts`,
`hizliConnectService.ts`, `documentConversionService.ts` **değişmedi**.

### 8.2 Yeni süit — `phase19SyntheticEttnTest.ts` (34 kontrol)

| Koşum | Sonuç | Exit |
|---|---|---|
| **Sentetik satırlar geri getirildi (K1)** | 21 PASS / **13 FAIL** | 1 |
| **`undefined` satırları silindi — `{...source}` tuzağı (K2)** | 30 PASS / **4 FAIL** | 1 |
| **Mevcut kod** | **34 PASS / 0 FAIL** | 0 |

**K2 en kritik kanıttır:** `duplicate`/`convert-return` içindeki `eInvoiceUUID: undefined`
satırları silinince `{...source}` yayılımı kaynağın **gerçek** ETTN'sini klona sızdırdı:

```
❌ FAIL  B-4 ⚠️⚠️ Klona KAYNAĞIN GERÇEK ETTN'si SIZMADI
        — klon eInvoiceUUID: "urn:uuid:7c89b21f-8294-4d81-9872-918239019283"
❌ FAIL  C-4 ⚠️⚠️ İadeye KAYNAĞIN GERÇEK ETTN'si SIZMADI
```

Yani bu satırlar **süsleme değil**, iki ayrı belgenin aynı kimliği taşımasını
engelleyen tek savunmadır.

**K1:** satırlar eski hâline döndürülünce yeni faturaya yine
`urn:uuid:inv-…-2026` yazıldı ve E-3 kontrolü kaynağın kendisinde 3 üretim
satırı buldu.

### 8.3 Veri temizliği

```
Uydurma desen taşıyan toplam : 8
Temizlenen (DRAFT)           : 7   → SAT-2026-000014 (7 kayıt)
ATLANAN                      : 1   → inv-1788011937673 (DELIVERED, KORUMALI)
✅ Yedek: database.yedek-sentetik-once-2026-09-16T13-51-25-202Z.json
✅ Doğrulama: kalan uydurma desen = 1 (yalnız korumalı kayıt)
```

Temizlik betiği yazma **öncesi** ve **sonrası** desen taraması yapar; beklenen
sonuç çıkmazsa yazmayı iptal eder.

### 8.4 Regresyon — hepsi temiz

| Kontrol | Sonuç |
|---|---|
| `tsc --noEmit -p tsconfig.server.json` | ✅ **EXIT=0** |
| `tsc -b` | ✅ **EXIT=0** |
| `phase19SyntheticEttnTest` (yeni) | ✅ **34 / 0** |
| `phase19CancelFlowTest` | ✅ **29 / 0** |
| `phase19AcceptResponseTest` | ✅ **27 / 0** |
| `phase19ApplicationResponseTest` | ✅ **34 / 0** |
| `phase19RejectAndIdentityTest` | ✅ **26 / 0** |
| `phase19ApplicationResponseRouteTest` | ✅ **24 / 0** |
| `phase11FullFunctionalAuditTest` (15 modül) | ✅ **EXIT=0** |
| `phase12PerformanceLoadTest` | ✅ **EXIT=0** — 0 duplicate, 0 kayıp, 0 negatif stok |
| FAZ 18 | ✅ **53 / 0 / 3 SKIP** (SKIP = bilinen egress kısıtı) |

