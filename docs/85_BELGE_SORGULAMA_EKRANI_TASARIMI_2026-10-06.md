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
| Başlangıç / Bitiş | `<input type="date">` | `startDate`/`endDate`; boşsa sınırsız. Ters aralıkta (başlangıç > bitiş) **uyarı ver, sorgu gönderme** |
| Unvan | metin | İstemci-içi değil **sunucu `search`**; en az 2 karakterde tetikle |
| VKN/TCKN | metin | Rakam-dışı temizlenir, tam eşleşme (havuz ucu böyle yapıyor, `:369`) |
| Belge No | metin | Kısmi eşleşme; sekmenin belge türüne göre `invoiceNo`/`despatchNo` |
| Durum | açılır liste | Sekmeye göre değişir: faturada ödeme/`ACTIVE-CANCELLED`, havuzda `operationalStatus` |
| Sayfa boyutu | 25/50/100 | Sunucu `limit` |

**Ön ayarlı tarih kısayolları:** Bugün / Bu ay / Geçen ay / Bu yıl — tek tık.

**Toplam satırı:** Sekmenin türüne göre tutar toplamı (sunucudan `summary` geliyorsa ondan;
yoksa görünür sayfadan, **etiketlenerek** "görünen sayfa toplamı").

### 3.4 Sekme → uç eşlemesi

| Sekme | Uç | Gerekli yeni parametre |
|---|---|---|
| Giden Faturalar | `GET /api/v1/invoices` (`type=SALES`) | `taxNumber`, `invoiceNo` |
| Gelen Faturalar | `GET /api/v1/invoices` (`type=PURCHASE`) | `taxNumber`, `invoiceNo` |
| Giden İrsaliyeler | `GET /api/v1/waybills` (`type=SALES_DESPATCH`) | `startDate`, `endDate`, `taxNumber`, `waybillNo` |
| Gelen İrsaliyeler | `GET /api/v1/waybills` (`type=PURCHASE_DESPATCH`) | aynı |
| Entegratör Havuzu | `/api/v1/e-documents/incoming{,-despatches}/list` | **hazır, değişiklik yok** |

> Ön yüz **v1 uçlarına geçmeli** (sayfalama+özet orada). Düz uçlar korunur (başka çağıranlar var).

---

## 4. Yapılacak işler — sıralı

### Adım 1 — Backend: `v1/invoices.ts`'e VKN + belge no parametresi
`recipientTaxNumber` (rakam-dışı temizlenip tam eşleşme) ve `invoiceNo` (kısmi) eklenir.
`search` korunur. `summary`'ye dokunulmaz.
**Bitiş:** İki parametre filtre uygular; mevcut testler yeşil.

### Adım 2 — Backend: `v1/waybills.ts`'e tarih + VKN + belge no
`startDate`/`endDate` (`date` alanı), `waybillNo` (kısmi), `taxNumber`.
⚠️ **VKN için karar gerekir:** `Waybill`'da `customerTaxNumber` **yok**. Seçenekler:
(a) `customerId` → `db.customers` join ile VKN bul, (b) tipe alan ekle + kayıtta doldur.
**(a) önerilir** — şema değişmez, mevcut kayıtlar çalışır, geriye dönük veri sorunu yok.
**Bitiş:** Filtreler çalışır; yeni kayıt gerekmez.

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

### Adım 5 — Bağlama
`FaturalarHubView.tsx`'e sekme, `App.tsx`'e rota + yetki kapısı (`guard('faturalar', ...)`).
**Bitiş:** Menüden erişilir; yetkisiz kullanıcı görmez.

### Adım 6 — Test
- **Kalıcılık/regresyon:** `server/tests/documentQueryFilterTest.ts` — VKN, belge no, tarih
  aralığı, ters aralık, tenant izolasyonu (A tenant'ı B'nin belgesini görmez).
- **Negatif kontroller:** olmayan VKN → boş liste (500 değil); boş filtre → tüm liste
  (**`search=undefined` tuzağı**: `docs/` — boş filtre listeyi boşaltmamalı).
- **Kapsam:** en az bir uçtan uca (havuz sekmesi) + bir işlenmiş belge sekmesi.

### Adım 7 — Doğrulama ve rapor
`npm run typecheck`, `npm run lint`, `npm test`; ekran görüntüsü ile UI kanıtı.
**Bitiş:** Hepsi yeşil; FAIL varsa FAIL olarak raporlanır.

---

## 5. Dosya sahipliği (Codex ile çakışma önleme)

| Sahip | Dosyalar |
|---|---|
| **Claude** | `server/routes/v1/invoices.ts`, `server/routes/v1/waybills.ts`, `src/components/modules/sorgulama/*`, `src/components/common/BelgeSorguCubugu.tsx`, `docs/*` |
| **Ortak — dokunmadan önce haberleş** | `src/components/modules/edonusum/IncomingDocumentsView.tsx` (Adım 3 geçişi), `src/services/api.ts` (yeni fonksiyonlar), `src/App.tsx`, `src/components/modules/faturalar/FaturalarHubView.tsx` |
| **Sahiplenilmedi (dokunma)** | `server/routes/invoices.ts`, `server/routes/waybills.ts` (düz uçlar — korunur) |

---

## 6. Karar noktaları (uygulamadan önce)

1. **İrsaliyede VKN nasıl bulunacak?** → join (önerilen) mi, şema alanı mı?
2. **Varsayılan tarih aralığı ne olsun?** Öneri: **son 30 gün** (boş aralık tüm veriyi çeker,
   büyük veride yavaş olur) + "Tümü" kısayolu.
3. **Mevcut üç ekran ne olacak?** Öneri: **korunur**, yeni ekran üstüne sorgu katmanı olur.
   Alternatif: satış/alış/irsaliye sekmelerindeki zayıf filtreler de yeni bileşene geçirilir.
4. **Entegratör havuzu sekmeleri** icin ayrı yetki mi (bugün `EINVOICE_VIEW`)?

---

## 7. Sınırlar

- Bu belge **tasarımdır**; hiçbir tuzağa dokunulmadı. Muhasebe/stok/KDV mantığı değişmez —
  sorgulama ekranı **salt okunur**dur, hiçbir belge yazmaz.
- `DataGrid` sunucu sorgusu bilmiyor; bu ekran `IncomingDocumentsView`'daki **manuel deseni**
  izler (harici sayfalama), `DataGrid` değiştirilmez.
- Canlıda şu an **0 cari / 0 belge** (`docs/` canlı durum notları); ekran boş liste gösterecek.
  Bu bir hata değildir, ama **UI kanıtı boş tablo olur** — test için yerel seed gerekir.
- Push yapılmadı; bu yalnız tasarım.
