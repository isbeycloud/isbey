# Sessiz Veri Kaybı Düzeltmesi — `DocumentConversionService`

**Tarih:** 2026-10-06
**Sahip:** Claude (dosya: `server/services/documentConversionService.ts`)
**Kaynak:** Codex `docs/81` (Adım 4 sonrası not) → Claude doğrulaması ve düzeltmesi

---

## 1. Ne bulundu

`DocumentConversionService`'in beş metodu, **transaction DIŞINDAN** çağrıldığında
sessiz veri kaybı üretiyordu: API `{ success: true }` dönüyor, ama fatura /
irsaliye / stok hareketi / cari hareket **diske hiç yazılmıyordu**.

### Kök neden

`storage.update()` derin klon üretir (`JSON.parse(JSON.stringify(this.db))`),
mutasyonu klonda işler, sonra `this.db = clone` ile **YENİ bir nesne** atar
(`storage.ts:1577-1585`). `storage.getNextSequence()` içeride `update()` çağırır.

Metot başında `const db = storage.getState()` ile alınan referans, o çağrıdan
sonra **bayatlar**: sonraki `db.waybills.push(...)`, `prod.currentStock = ...`,
`db.stockMovements.push(...)` yazımları atılır. Metot yine de `newInvoice` /
`newWaybill` döndürdüğü için API "başarılı" der.

> Bu, ekip tarafından `incomingInvoiceService.ts:242-255` ve
> `incomingDespatchService.ts:455-464`'te **belgelenmiş** bir tuzaktır; ama
> `documentConversionService.ts` hiç düzeltilmemişti.

### Kanıt (izole ölçüm, düzeltme ÖNCESİ)

```
donen irsaliye no : IRS-2026-000002   (fonksiyon "basarili" dondu)
stok once/sonra   : 10 -> 10          (9 olmaliydi)
irsaliye sayisi   : 0 -> 0            (1 olmaliydi)
stok hareketi     : 0                 (1 olmaliydi)
siparis durumu    : PENDING           (SHIPPED olmaliydi)
```

---

## 2. Etkilenen uçlar (hepsi canlı, transaction sarmalı YOK)

| # | Metot | Canlı uç | Çağıran |
|---|-------|----------|---------|
| 1 | `convertOrderToWaybill` | `POST /api/v1/orders/:id/convert-to-waybill` | `v1/orders.ts:159` |
| 2 | `createInvoice` | `POST /api/v1/invoices` | `v1/invoices.ts:140` |
| 3 | `createInvoice` | `POST /api/v1/waybills` | `v1/waybills.ts` |
| 4 | `convertWaybillToInvoice` | `POST /api/v1/waybills/:id/convert-to-invoice` | `v1/waybills.ts:199` |
| 5 | `convertQuoteToOrder` | `POST /api/v1/quotes/:id/convert-to-order` | `v1/quotes.ts:159` |

**Ön yüz hangi uçları kullanıyor?** `src/services/api.ts`:
`createInvoice` → `/api/invoices` (**etkilenen** #2 çekirdeği),
`convertWaybillToInvoice` → `/api/waybills/:id/convert-to-invoice` (**etkilenen** #4).
`convertOrderToWaybill` ve `convertQuoteToOrder` ise `/api/quotes/...` (legacy,
`runTransaction`'lı) uçlarını kullanır → ön yüzde etkilenmez.

### ETKİLENMEYEN yollar (yanlış yeri düzeltmemek için)

- `POST /api/quotes/orders/:id/convert-to-waybill` (`quotes.ts:231`) ve
  `POST /api/quotes/:id/convert-to-order` (`quotes.ts:94`): kendi
  `storage.runTransaction`'ları var.
- `incomingInvoiceService.ts:837`'deki `createInvoice`: `runTransaction` içinde
  çağrılır; transaction içindeyken `getState()` draft'ı döndürür ve `update()`
  erken çıkar → bayatlama **olmaz**.

---

## 3. Düzeltme

Beş metot da transaction'a alındı. Her public metot ince bir sarmalayıcı oldu;
gövde `...Core` private metoduna taşındı; sondaki `storage.save()` kaldırıldı
(commit artık `runTransaction` içinde yapılır).

```typescript
static async convertOrderToWaybill(orderId, tenantId, userId, username = 'Sistem'): Promise<Waybill> {
  return storage.runTransaction(() =>
    DocumentConversionService.convertOrderToWaybillCore(orderId, tenantId, userId, username));
}
```

`convertWaybillToInvoice`, `createInvoice`'ı çağırdığı için **tek** transaction'da
sarılır: aksi hâlde irsaliye "INVOICED" işaretlenip fatura yazılmadan kalabilirdi.

### Önemli davranış notu

`runTransaction` sonunda `recalculateBalances(clone)` çalışır; bu, ürün stoğunu
**yalnız stok hareketlerinden** yeniden türetir (`inQty - outQty`). Yani bir
ürünün açılış stoğu mutlaka bir stok hareketiyle temsil edilmeli — tasarım gereği
böyle (`seed.ts`, `products.ts` adjust akışı).

`createInvoice`, `sourceWaybillId` verildiğinde **bilerek** stok hareketi
üretmez: stoğu irsaliye zaten düşürmüştür, yeni hareket çift sayım olurdu. Bu
davranış korundu.

---

## 4. Test

**Yeni kalıcı regresyon testi:** `server/tests/documentConversionPersistenceTest.ts`
— beş metodu da kalıcılık açısından ölçer (19 kontrol).

Düzeltmeden **önce**: `FAIL (15)` — 5 metotta da yazımlar kayıp.
Düzeltmeden **sonra**: `PASS (19/19)`.

**`optionalFieldsContractTest.ts` güncellendi.** Test, ürün stok'unu 10 veriyor
ama hiç stok hareketi seed etmiyordu. `recalculateBalances` stoğu hareketlerden
türettiği için düzeltme sonrası router'ın `currentStock < shipQty` kapısı
haklı olarak "Yetersiz stok" veriyordu. Eksik olan **testin seed'iydi**;
açılış hareketi eklendi. Ayrıca test artık yalnız durum kodu değil, **stoğun
gerçekten düştüğünü ve siparişin SHIPPED olduğunu** da ölçüyor — eskiden bu
yol hiç ölçülmüyordu (sahte yeşil).

### Doğrulama çıktıları

| Test | Sonuç |
|------|-------|
| `documentConversionPersistenceTest.ts` | **19 PASS / 0 FAIL** |
| `optionalFieldsContractTest.ts` | **PASS** |
| `incomingDocumentMatrixTest.ts` | 17 PASS / 0 FAIL |
| `phase19CancelFlowTest.ts` | 29 PASS / 0 FAIL |
| `tsc -b` | **temiz** |

`tools/test-local.mjs` paketine yeni test eklendi.

> **Not:** `oxlint`, esbuild gibi, Linux VM'de Windows'a özel native binding
> istediği için koşmaz (bilinen kısıt). CI'da doğru platformda koşar.

---

## 5. Sınır

- Testler **canlıya çıkmadı**; push ayrı onay konusu.
- `phase19DocumentLifecycleTest`, `.env`'deki canlı Hızlı Bilişim URL'i
  nedeniyle durur — bu düzeltmeyle ilgisizdir ve `test-local` paketinde **değildir**.
- Gerçek e-Fatura gönderimi yapılmadı (kontör tüketir).
