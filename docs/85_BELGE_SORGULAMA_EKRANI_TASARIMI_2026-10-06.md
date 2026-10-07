# Belge Sorgulama Ekranı — Tasarım ve Görev Listesi

**Tarih:** 2026-10-06
**Taban:** `c1e2d97`
**Hazırlayan:** Claude
**Kullanıcı kararları:** (1) Önce tasarım + görev listesi. (2) "Gelen" tarafında **iki kaynak ayrı** gösterilecek.
**Durum:** Tasarım. Kod yazılmadı. Uygulama onay bekler.

---

## 1. İstenen işlev — kullanıcının sözleri

> "göreve gelen giden, fatura ve irsaliye için sorgulama ekranı ekle ve tarih aralığı unvan vkno/tc ile sorgulama fatura no ile sorgulama alanları olsun yada sen tasarla işlevsel olarak"

Dört belge türü × üç ana filtre (tarih aralığı, unvan, VKN/TCKN, belge no).

---

## 2. ÖLÇÜLEN mevcut durum — tasarımın dayanağı

### 2.1 Bugün filtre gerçekten çalışıyor mu?

| Ekran | Tarih aralığı | Unvan | VKN/TCKN | Belge no | Sunucu sayfalama |
|---|---|---|---|---|---|
| Satış (GİDEN fatura) `satis/InvoiceListView.tsx` | ❌ | yalnız istemci-içi | ❌ | yalnız istemci-içi | ❌ |
| Alış (GELEN fatura) `alis/PurchaseInvoiceView.tsx` | ❌ | yalnız istemci-içi | ❌ | yalnız istemci-içi | ❌ |
| İrsaliye `irsaliye/WaybillListView.tsx` | ❌ | yalnız istemci-içi | ❌ | yalnız istemci-içi | ❌ |
| Gelen Belgeler `edonusum/IncomingDocumentsView.tsx` | ✅ | sunucu `search` | ✅ | ✅ | ✅ |

**Kritik ayrım:** İlk üç ekran tüm listeyi çekip **tarayıcıda** süzüyor. Oradaki "arama kutusu"
`DataGrid`'in jenerik istemci-içi aramasıdır (`common/DataGrid.tsx:60-69`) — **sunucuya gitmez**.
Bu yüzden kayıt sayısı büyüyünce hem yanlış hem yavaş olur. **Gelen Belgeler ekranı istisnadır**:
`IncomingDocumentsView.tsx` + `v1/e-documents.ts` gerçek sunucu sorgusu yapar (sayfalama,
`statusCounts`, tam filtre seti). **Yeni ekranın modeli budur.**

### 2.2 Backend uçları — kapasite farkı

| Uç | Arama | Tarih | VKN | Belge no | Sayfalama |
|---|---|---|---|---|---|
| `GET /api/invoices` (`routes/invoices.ts:14`) | ✅ `search` = invoiceNo+customerTitle+customerCode | ✅ | ❌ | yalnız `search` içinde | ❌ |
| `GET /api/v1/invoices` (`v1/invoices.ts:43`) | ✅ aynı | ✅ | ❌ | yalnız `search` içinde | ✅ + `summary` |
| `GET /api/waybills` (`routes/waybills.ts:7`) | ❌ | ❌ | ❌ | ❌ | ❌ |
| `GET /api/v1/waybills` (`v1/waybills.ts:14`) | ✅ (waybillNo+customerTitle) | ❌ | ❌ | yalnız `search` içinde | ✅ |
| `GET /api/v1/e-documents/incoming/list` (`v1/e-documents.ts:309`) | ✅ | ✅ | ✅ `supplierTaxNumber` | ✅ `documentNo` | ✅ + `statusCounts` |
| `GET /api/v1/e-documents/incoming-despatches/list` (`:709`) | ✅ | ✅ | ✅ | ✅ `documentNo`→despatchNo | ✅ |

**Ön yüz düz uçları kullanıyor** (`api.ts:357` `getInvoices`, `:439` `getWaybills` → `/api/...`),
yani v1'in sayfalama/özet yetenekleri liste ekranlarında **kullanılmıyor**.

### 2.3 Veri modeli — iki ayrı "gelen" kaynağı

1. **İşlenmiş alış belgeleri** → `db.invoices` içinde `type='PURCHASE'`
   (`src/types/index.ts:373`). Alanlar: `invoiceNo`, `customerTitle`, `date`, `grandTotal`,
   `paymentStatus`, `recipientTaxNumber`, `isIncomingEInvoice`, `incomingSupplierVkn` (`:418-419`).
2. **Entegratör havuzu** (GİB'den çekilmiş, henüz içeri alınmamış) → `db.incomingInvoices` /
   `db.incomingDespatches`. Alanlar: `uuid` (ETTN), `invoiceNo`/`despatchNo`, **`supplierTaxNumber`**,
   **`supplierTitle`**, `issueDate`, `grandTotal`, `operationalStatus`.

⚠️ **İki kaynakta alan adları farklı:** işlenmiş belgede `customerTitle`/`recipientTaxNumber`,
havuzda `supplierTitle`/`supplierTaxNumber`. Ortak arayüz bunu **iki adaptörle** normalize etmeli.

⚠️ **`Waybill` tipinde `customerTaxNumber` alanı YOK** (`types/index.ts:698-721`). İrsaliyede
VKN ile arama yapılacaksa ya cari üzerinden join edilmeli ya tipe alan eklenmeli. **Bu bir karar noktası.**

### 2.4 🔴 VKN'nin *karşı taraf* olduğundan emin olmak — yön farkı

Codex ön kontrolünün (`document-query-preflight.md` §12) uyardığı nokta kaynakla **doğrulandı**:

`recipientTaxNumber` belgenin **alıcısını** tanımlar, karşı tarafı değil
(`routes/invoices.ts:289` `recipient?.identifier || ... || customer.taxNumber`).
Yani:

| Belge yönü | `recipientTaxNumber` kim | Karşı taraf (=aramak istediğimiz VKN) |
|---|---|---|
| `SALES` (giden) | müşteri | ✅ `recipientTaxNumber` **doğru** |
| `PURCHASE` (gelen) | **bizim firmamız** | ❌ yanlış kaynak — `incomingSupplierVkn` veya cari (`customerId` → `db.customers[].taxNumber`) |

**Sonuç:** VKN filtresi yön-farkında olmalı. Gelen faturada `recipientTaxNumber` ile arama
yapmak **kendi VKN'mizi** arar ve saçma sonuç verir. Bu, sessiz-yanlış sınıfı bir tuzaktır:
hata vermez, boş ya da yanlış liste döner. **Gelen tarafta VKN = `incomingSupplierVkn` →
yoksa cari join.**

### 2.5 Aynı belge iki kaynakta olabilir

Entegratör havuzundan içeri alınmış bir belge hem havuzda hem `db.invoices`'ta durur.
Bunlar **iki ayrı kaynak kaydıdır**; "toplam belge" diye toplanmamalı. Sekmeler ayrı olduğu
için yapısal olarak ayrı kalır — ama **hiçbir yerde birleşik sayı gösterilmemeli**.

---

## 3. Tasarım — tek ekran, birleşik sorgu

### 3.1 Neden yeni ekran (mevcutları güçlendirmek yerine)

Kullanıcı **"gelen giden fatura ve irsaliye"** için tek sorgu yeri istiyor. Mevcut üç ekranı
ayrı ayrı güçlendirmek aynı filtre çubuğunu üç kez yazdırır ve "hepsinde birden ara" ihtiyacını
karşılamaz. **Ama** mevcut ekranlar da korunur (kullanıcılar alışkın); yeni ekran bunların
**üstünde bir sorgu katmanı** olur.

### 3.2 Yerleşim

`faturalar` hub'ına **beşinci sekme**: `🔍 Sorgulama` (`FaturalarHubView.tsx` `tabs` dizisine eklenir).
Ayrıca `App.tsx`'e `belge-sorgulama` rotası (kenar çubuğundan doğrudan erişim için).

Sekme içi: üstte **ortak filtre çubuğu**, altında **kaynak sekmeleri**:

```
[ Tarih: başlangıç – bitiş ]  [ Unvan ]  [ VKN/TCKN ]  [ Belge No ]  [ Durum ▾ ]  [ Temizle ]
─────────────────────────────────────────────────────────────────────────────────────────
( Giden Faturalar )  ( Gelen Faturalar )  ( Giden İrsaliyeler )  ( Gelen İrsaliyeler )  ( Entegratör Havuzu )
─────────────────────────────────────────────────────────────────────────────────────────
[ tablo: belge no · tarih · unvan · VKN/TCKN · tutar · durum ]      ← sunucu sayfalama
                                                     [ CSV indir ]
```

### 3.3 Alanlar ve davranış

| Alan | Denetim | Davranış |
|---|---|---|
| Başlangıç / Bitiş | `<input type="date">` | `startDate`/`endDate`; boşsa sınırsız. Ters/geçersiz aralıkta **sunucu 400** döner, arayüz uyarır ve sorgu göndermez. **Bitiş günü dahildir** (`<= bitiş 23:59:59`) |
| Unvan | metin | İstemci-içi değil **sunucu `search`**; en az 2 karakterde tetikle |
| VKN/TCKN | metin | Rakam-dışı temizlenir, tam eşleşme (havuz ucu böyle yapıyor, `:369`). **Yön-farkında** — bkz. §2.4 |
| Belge No | metin | Kısmi eşleşme; sekmenin belge türüne göre `invoiceNo`/`despatchNo` |
| Durum | açılır liste | Sekmeye göre değişir: faturada ödeme/`ACTIVE-CANCELLED`, havuzda `operationalStatus`. **Kaynak değişince sıfırlanır** (anlamı değişiyor) |
| Sayfa boyutu | 25/50/100 | Sunucu `limit` |

⚠️ **"Unvan" etiketi dürüst olmalı.** Mevcut `search` üç alanı birden tarar
(`invoiceNo`+`customerTitle`+`customerCode`). Kutuya "Unvan" yazıp altında kodu/belge no'yu da
aramak kullanıcıyı yanıltır. İki seçenek: (a) yalnız `customerTitle` tarayan **ayrı**
`title` parametresi ekle, (b) etiketi **"Unvan / kod / belge ara"** yap. **(b) daha ucuz ve
dürüst**; ileride (a)'ya geçilebilir.

**Filtre/sayfa davranışı:** herhangi bir filtre veya sayfa boyutu değişince **sayfa 1'e dön**.
Kaynak sekmesi değişince filtreler korunur ama **durum sıfırlanır**.

**Ön ayarlı tarih kısayolları:** Bugün / Bu ay / Geçen ay / Bu yıl — tek tık.

**Toplam satırı:** Sekmenin türüne göre tutar toplamı (sunucudan `summary` geliyorsa ondan;
yoksa görünür sayfadan, **etiketlenerek** "görünen sayfa toplamı").

### 3.4 Sekme → uç eşlemesi

| Sekme | Uç | Gerekli yeni parametre | Yetki |
|---|---|---|---|
| Giden Faturalar | `GET /api/v1/invoices` (`type=SALES`) | `taxNumber`, `invoiceNo` | `INVOICES_VIEW` |
| Gelen Faturalar | `GET /api/v1/invoices` (`type=PURCHASE`) | `taxNumber`, `invoiceNo` | `INVOICES_VIEW` |
| Giden İrsaliyeler | `GET /api/v1/waybills` (`type=SALES_DESPATCH`) | `startDate`, `endDate`, `taxNumber`, `waybillNo` | `WAYBILLS_VIEW` |
| Gelen İrsaliyeler | `GET /api/v1/waybills` (`type=PURCHASE_DESPATCH`) | aynı | `WAYBILLS_VIEW` |
| Entegratör Havuzu (fatura) | `/api/v1/e-documents/incoming/list` | **hazır, değişiklik yok** | `EINVOICE_VIEW` |
| Entegratör Havuzu (irsaliye) | `/api/v1/e-documents/incoming-despatches/list` | **hazır, değişiklik yok** | `EINVOICE_VIEW` |

> Ön yüz **v1 uçlarına geçmeli** (sayfalama+özet orada). Düz uçlar korunur (başka çağıranlar var).
>
> ⚠️ **Yetkiler ayrı kalır.** Faturalar erişimi havuz erişiminin yerine **geçmez**; havuz
> sekmeleri `EINVOICE_VIEW` ister (bugünkü uçlar böyle korumalı — `v1/e-documents.ts:309,709`).
> Yeni bir yetki kodu **üretilmez**; mevcut üç kod kullanılır. Sekmeler yetkiye göre
> **gizlenir**, tıklanınca hata vermez.

---

## 4. Yapılacak işler — sıralı

### Adım 1 — Backend: `v1/invoices.ts`'e **yön-farkında** VKN + belge no + tarih doğrulama
- `taxNumber` parametresi **tek başına yeterli değil** (§2.4). Uygulama:
  - `type=SALES` → karşı taraf = müşteri → `recipientTaxNumber` **veya** cari join (öncelik: cari)
  - `type=PURCHASE` → karşı taraf = tedarikçi → `incomingSupplierVkn` → yoksa cari join;
    **`recipientTaxNumber` KULLANILMAZ** (o bizim VKN'miz)
- `invoiceNo` kısmi eşleşme. `search` korunur, `summary`'ye dokunulmaz.
- `startDate`/`endDate` **API'de doğrulanır**; geçersiz/tarih-dışı → **400**, sessiz yutma yok.
**Bitiş:** Yön başına doğru VKN eşleşiyor; negatif test (gelen faturada kendi VKN'imiz sonuç
getirmiyor) geçiyor.

### Adım 2 — Backend: `v1/waybills.ts`'e tarih + VKN + belge no
`startDate`/`endDate` (`date` alanı; bitiş günü dahil), `waybillNo` (kısmi), `taxNumber`.
⚠️ **VKN için cari join zorunlu:** `Waybill`'da `customerTaxNumber` **yok** (§2.3).
Join iki güvenlik kontrolü gerektirir (ön kontrol §11):
1. **Belgenin** tenant'ı doğrulanır, sonra
2. **carinin** tenant'ı doğrulanır (`resolveTenant` + `isAccountantAuthorizedForTenant`).
Başka tenant'ın aynı `customerId`/VKN'si **filtre veya sütun üzerinden sızmamalı**.
Cari bulunamayan (orphan) eski kayıtta VKN **boş gösterilir, tahmin edilmez**.
**Bitiş:** Filtreler çalışır; çapraz-tenant negatif testi geçer.

### Adım 3 — Ortak `BelgeSorguCubugu` bileşeni
`src/components/common/BelgeSorguCubugu.tsx`. Tarih+unvan+VKN+belge no+durum+temizle + hazır
tarih kısayolları. Mevcut desen `IncomingDocumentsView.tsx:966-1001`'den alınır (aynı CSS
değişkenleri, aynı `form-control` sınıfı). **Ortak tarih bileşeni bugün YOK** — bu onu doğurur.
**Bitiş:** Bileşen tek başına render edilir; `IncomingDocumentsView` **isteğe bağlı** olarak
ona geçirilebilir (zorunlu değil, regresyon riski almamak için ayrı adım).

### Adım 4 — `BelgeSorgulamaView.tsx`
`src/components/modules/sorgulama/BelgeSorgulamaView.tsx`. Sekme durumu, filtre durumu
(tek `useState` nesnesi), sunucu sayfalama, debounce'lu sorgu, iptal edilebilir istek
(`AbortController` — hızlı yazımda yarış koşulu olmasın).
**Bitiş:** Beş sekme de veri çeker; filtre değişince 1. sayfaya döner.

### Adım 5 — Bağlama (yalnız `App.tsx` değil)
Ön kontrol §17 haklı: `App.tsx` route **tek başına yetmez**. Dört yere dokunulur:
1. `App.tsx` → `case 'belge-sorgulama': return guard(...)`
2. `context/AppContext.tsx` → `AppView` union'a yeni değer (`:5-...`)
3. `components/layout/Sidebar.tsx` → menü/etiket eşlemesi + `RibbonTab`
4. `data/erpMenus.ts` / `utils/modulePermissions.ts` → menü ve rol görünürlüğü

**Bitiş:** Menüden erişilir; yetkisiz kullanıcı görmez; tip birleşimi derlenir (`tsc -b`).

### Adım 6 — Test
- **Uç testi:** `server/tests/documentQueryFilterTest.ts` — VKN (yön-farkında: gelen faturada
  bizim VKN'miz eşleşmez), belge no, tarih aralığı (**bitiş günü dahil**), ters aralık → 400,
  tenant izolasyonu (**çapraz-tenant cari sızıntısı yok**).
- **Negatif kontroller:** olmayan VKN → boş liste (500 değil); boş filtre → tüm liste
  (**`search=undefined` tuzağı** — bkz. `proje_isbey_search_undefined_hatasi`: boş filtre
  listeyi boşaltıyordu).
- **Kapsam:** en az bir uçtan uca (havuz sekmesi) + bir işlenmiş belge sekmesi.

### Adım 7 — Doğrulama ve rapor
`npm run typecheck`, `npm run lint`, `npm test`; ekran görüntüsü ile UI kanıtı.
**Bitiş:** Hepsi yeşil; FAIL varsa FAIL olarak raporlanır. (Not: `vite build` bu Linux VM'de
yerel ikili eksikliğinden koşmuyor — build kanıtı kullanıcının ortamında alınmalı.)

---

## 5. Dosya sahipliği (Codex ile çakışma önleme)

| Sahip | Dosyalar |
|---|---|
| **Claude** | `server/routes/v1/invoices.ts`, `server/routes/v1/waybills.ts`, `src/components/modules/sorgulama/*`, `src/components/common/BelgeSorguCubugu.tsx`, `docs/*` |
| **Ortak — dokunmadan önce haberleş** | `src/components/modules/edonusum/IncomingDocumentsView.tsx` (Adım 3 geçişi), `src/services/api.ts` (yeni fonksiyonlar), `src/App.tsx`, `src/components/modules/faturalar/FaturalarHubView.tsx` |
| **Sahiplenilmedi (dokunma)** | `server/routes/invoices.ts`, `server/routes/waybills.ts` (düz uçlar — korunur) |

---

## 6. Karar noktaları (uygulamadan önce)

Ön kontrol raporu (`document-query-preflight.md` §31) şu dört öneriyi sundu; ben kaynakla
kontrol ettim ve **üçünü onaylıyorum, birini düzeltiyorum**:

| # | Karar | Öneri | Benim hükmüm |
|---|---|---|---|
| 1 | İrsaliyede VKN | cari join | ✅ Katılıyorum — şema değişmez |
| 2 | Varsayılan aralık | son 30 gün | ✅ Katılıyorum — + "Tümü"/"Bugün"/"Bu ay"/"Geçen ay"/"Bu yıl" |
| 3 | Mevcut üç ekran | korunur | ✅ Katılıyorum — dokunulmaz |
| 4 | Havuz yetkisi | mevcut yetkiler ayrı | ✅ Katılıyorum — `EINVOICE_VIEW` ayrı kalır, yeni kod üretilmez |

**Ama ön kontrolün atladığı bir nokta var (§2.4):** faturada VKN filtresi **yön-farkında**
olmalı. `recipientTaxNumber` gelen faturada **bizim** VKN'mizi tutar; onunla aramak
tedarikçiyi bulmaz. Bu, "görevi yaptım" deyip sessizce yanlış liste döndüren bir tuzaktır.
Uygulamaya girmeden önce bu kabul edilmeli.

---

## 7. Sınırlar

- Bu belge **tasarımdır**; hiçbir tuzağa dokunulmadı. Muhasebe/stok/KDV mantığı değişmez —
  sorgulama ekranı **salt okunur**dur, hiçbir belge yazmaz.
- `DataGrid` sunucu sorgusu bilmiyor; bu ekran `IncomingDocumentsView`'daki **manuel deseni**
  izler (harici sayfalama), `DataGrid` değiştirilmez.
- **Çoklu para birimi:** Havuzda USD/EUR/TRY karışık olabilir. Farklı para birimleri **tek
  tutara toplanmaz** (ön kontrol §20) — birim bazında toplanır veya "görünen sayfa toplamı,
  birim bazında" diye açıkça etiketlenir.
- **CSV kapsamı** etikette yazılır: "görünen sayfa" mı "tüm filtrelenmiş sonuç" mu. Görünen
  sayfadan üretiliyorsa "tüm sonuç" iddiası yok. `=` `+` `-` `@` ile başlayan hücreler
  **formül enjeksiyonuna** karşı güvenli metne kaçırılır.
- **`AbortController`:** `api.request` zaten `RequestInit` kabul ediyor → yeni v1 sorgu
  yöntemleri `signal` geçirebilir. Havuz yardımcılarına `signal` **opsiyonel** eklenir; mevcut
  çağıranlar uyumlu kalır.
- Canlıda şu an **0 cari / 0 belge** (`docs/` canlı durum notları); ekran boş liste gösterecek.
  Bu bir hata değildir, ama **UI kanıtı boş tablo olur** — test için yerel seed gerekir.
- Push yapılmadı; bu yalnız tasarım.

---

## 8. Ön kontrolün doğrulanması (2026-10-07)

Codex'in ön kontrol raporu bağımsız olarak yeniden ölçüldü:

| Ön kontrol iddiası | Benim kontrolüm |
|---|---|
| Bağımlılık ağacı lockfile ile eşitlendi (proxy-addr 2.0.8, source-map-js 1.2.2, shell-quote 1.12.0), 39/39 test, audit 0 | **Kabul** — kendi ölçümümle aynı; `npm ci` doğrulaması ek kanıt |
| `recipientTaxNumber` gelen belgede tedarikçiyi temsil etmez | **DOĞRULANDI** — `routes/invoices.ts:289` yalnız alıcıyı yazar; §2.4'e eklendi |
| `Waybill`'da VKN alanı yok | **DOĞRULANDI** — `types/index.ts:698-721` |
| `AppView` union + menü eşlemesi de gerekir | **DOĞRULANDI** — `AppContext.tsx:5`, `modulePermissions.ts:153,172+` |
