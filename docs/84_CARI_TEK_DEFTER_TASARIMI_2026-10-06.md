# Cari Tek Yetkili Defter — B Yolu Tasarımı

**Tarih:** 2026-10-06
**Karar:** Kullanıcı **B**'yi seçti (tek deftere geçiş). Bu dosya **tasarımdır, kod değildir.**
**Taban:** `9e92f43`
**Hazırlayan:** Claude — kullanıcı "sayıyı ölçme, tasarımı yaz" dedi.

> ⚠️ Bu belge hiçbir muhasebe mantığını DEĞİŞTİRMEZ. Uygulama ayrı onay ister.

---

## 1. Bugünkü durum — iki defter, tek bakiye sahibi

| Defter | Şema | Kim yazar | Kim okur | Bakiye doğurur mu? |
|---|---|---|---|---|
| `currentTransactions` | `schema.ts:476` | `routes/invoices.ts`, `routes/waybills.ts`, `routes/cash.ts`, `routes/banks.ts`, `routes/checks.ts`, `routes/quotes.ts`, `incomingInvoiceService.ts`, `fieldCollectionService.ts`, `bankMatchingService.ts`, `paymentLinkService.ts`, `ai/documentAIService.ts` | `storage.ts:1651` (`recalculateBalances`), `routes/customers.ts:61`, `customerRiskService.ts:13` | **EVET** — tek yetkili |
| `accountTransactions` | `schema.ts:210` | `documentConversionService.ts:281`, `financialTransactionService.ts:216,374`, `v1/customers.ts:235` | `v1/customers.ts:234`, `v1/reports.ts:23`, `financialTransactionService.ts:696,784`, `documentConversionService.ts:280` | **HAYIR** — sadece denetim izi |

`recalculateBalances` (`storage.ts:1649+`) cari bakiyeyi **yalnız `currentTransactions`**'tan türetir:

```ts
const txs = state.currentTransactions.filter(t => t.customerId === cust.id);
debit += Number(t.debit || 0); credit += Number(t.credit || 0);
cust.balance = cust.totalDebit - cust.totalCredit;
```

**Sonuç:** `accountTransactions`'a yazan ama `currentTransactions`'a yazmayan her yol
sessizce sıfırlanır. Ölçülen örnek: `docs/82` §5 — 36 TL fatura, bakiye 0 TL.

---

## 2. B'nin çözdüğü şey ve asıl zorluk

B = `accountTransactions`'ı **kaldırmak**, tek yetkili defter `currentTransactions` olsun.

Kolay kısım: yazan 3 yerin `currentTransactions`'a yönlendirilmesi.

**Zor kısım — şema uyumsuzluğu.** İki tip aynı işi yapmıyor:

| Alan | `AccountTransaction` | `CurrentTransaction` | Fark |
|---|---|---|---|
| `debit` | **zorunlu** `number` | **opsiyonel** `debit?: number` | ⚠️ |
| `debt` (eski ad) | — | `debt?: number` | iki ad, tek kavram |
| `credit` | zorunlu | zorunlu | ok |
| `transactionType` | zorunlu union (`OPENING\|INVOICE\|COLLECTION\|PAYMENT\|RETURN\|ADJUSTMENT\|TRANSFER`) | `transactionType?: string` (serbest) | ⚠️ tip kaybı |
| `isCancelled` | **var** `boolean` | **YOK** | 🔴 **EN KRİTİK** |
| `cancelReason` | **var** | **YOK** | 🔴 |
| `exchangeRate`, `originalAmount`, `referenceNo`, `relatedCashTxId`, `relatedBankTxId` | var | **YOK** | ⚠️ döviz izi kaybı |
| `userId`, `createdAt`, `balance`, `dueDate` | `createdBy?` / var | ikisi de var | uyumlu |
| `customerCode`/`customerTitle` | opsiyonel | **zorunlu** | doldurulmalı |

### 🔴 Karar gerektiren tek nokta: iptal temsili

`v1/reports.ts:23` yaşlandırmayı `!t.isCancelled` ile filtreliyor;
`financialTransactionService.ts:696` iptal ters kaydını `isCancelled` ile buluyor.
`currentTransactions`'ta bu alan **yok**. B'de iki seçenek:

- **B1 — alanı ekle:** `CurrentTransaction`'a `isCancelled?: boolean` + `cancelReason?: string`
  eklenir. En az sürprizli, mevcut okurlar neredeyse aynı kalır.
- **B2 — ters kayıt (reversal):** iptal, ters yönlü YENİ bir kayıtla temsil edilir
  (muhasebede yaygın). Daha temiz ama **tüm iptal akışları yeniden yazılır** ve
  `recalculateBalances` ters kaydı zaten topladığı için doğru çalışır.

**Önerim: B1.** B2'nin blast radius'ı mevcut iptal kodunun tamamını kapsar
(`phase19CancelFlowTest` 29 kontrol bu akışı ölçüyor) ve kazanç tasarım temizliğiyle sınırlı.

---

## 3. Dokunulacak dosyalar (6 + şema)

| # | Dosya | Değişiklik | Risk |
|---|---|---|---|
| 1 | `server/db/schema.ts` | `CurrentTransaction`'a `isCancelled?`, `cancelReason?`, `exchangeRate?`, `originalAmount?`, `referenceNo?` ekle; `accountTransactions?` alanını **deprecated** işaretle (hemen silme) | Düşük |
| 2 | `server/services/documentConversionService.ts:280-281,448` | `createInvoiceCore`: `accountTransactions.push` → `currentTransactions.push` (cari bakiyeyi doğuran defter). `debit` alanını doldur | ⚠️ Yüksek — bu tam da `docs/82` §5 hatası |
| 3 | `server/services/financialTransactionService.ts:215-216,373-374,696,784` | Tahsilat/ödeme/iptal/ekstre: aynı yönlendirme + iptal alanı | ⚠️ Yüksek |
| 4 | `server/routes/v1/customers.ts:234-235` | Açılış (`DEVIR-*`) kaydı `currentTransactions`'a; okuma oradan | Orta |
| 5 | `server/routes/v1/reports.ts:23` | Yaşlandırma kaynağı `currentTransactions`; `t.debit` → `Number(t.debit ?? t.debt ?? 0)` | Orta |
| 6 | `server/services/incomingInvoiceService.ts:881` | **Mükerrer yazım kapısı**: bu akış şu an `createInvoice`'a EK olarak `currentTransactions`'a yazıyor. #2 uygulanınca **çift borç** doğar → ya ek yazım kaldırılır ya dedup anahtarı (`documentId`) konur | 🔴 **En kritik** |
| 7 | `server/routes/v1/collections.ts`, `financial-transactions.ts` | Dolaylı tüketiciler; tüketici testleri | Orta |

**Geçmiş veri göçü (migration):** `accountTransactions`'ta olup `currentTransactions`'ta
olmayan kayıtlar taşınmalı, yoksa bakiyeler **düşer**. Tek seferlik, idempotent bir
script (`documentId` + `date` + tutar ile dedup) gerekir.

---

## 4. Uygulama sırası (önerilen — her adım yeşil kalmalı)

1. **Şema + B1 iptal alanı** (davranış değişmez, yalnız alan).
2. **Mükerrer kapısı (#6)** — önce bunu çöz; yoksa #3'ü yaptığında çift borç doğar.
3. **Yazıcıları yönlendir (#2, #3, #4)** — her biri ayrı commit, ayrı kalıcılık testi.
4. **Okurları çevir (#5, #7)**.
5. **Migration script** — kuru koşum (`--dry-run`) çıktısı: taşınacak kayıt sayısı.
6. **`accountTransactions`'ı şemadan kaldır** — en son, tüm okurlar geçtikten sonra.

Her adımın testi **diskten taze oku**malı (`docs/82` §4 dersi: bellekteki duruma bakmak
bayatlığı gizler).

---

## 5. Sınırlar ve açık riskler

- **Canlı veri şekli ölçülmedi.** Eldeki snapshot `.verify-tmp/bey360-production/database.prod.json`
  **23 Eylül tarihli ve boş** (0 cari/fatura). O tarihten sonra canlıda SAT-2026-000001 ve
  ALI-2026-000004 oluştu; yani snapshot bugünü temsil etmiyor. **Migration kuru koşumu
  canlı sayı görülmeden yazılmamalı.**
- **`recalculateBalances` `debit` okur, `debt` değil.** Taşımada `debt` → `debit` eşlemesi
  yapılmazsa bakiye yanlış çıkar.
- **Döviz alanları** (`exchangeRate`, `originalAmount`) taşınmazsa ALI-2026-000004 gibi
  dövizli belgelerin kur izi kaybolur.
- **Muhasebe mantığı dokunulmaz kuralı**: bu tasarım onaylanıp uygulanırken
  dönem sonu bilanço değişmezi (Aktif = Pasif + Öz Kaynak, Fark = 0,00 TL) **önce/sonra
  ölçülmeli**.
- Push yapılmadı; bu belge yalnız tasarımdır.

---

## 6. Kaynak

- `docs/83` Adım 3 (A/B envanteri), `docs/82` §5 (ölçülen 36 TL hatası)
- `server/db/storage.ts:1649+` (`recalculateBalances`), `server/db/schema.ts:210,476`
- `server/services/incomingInvoiceService.ts:873-900` (ekip notu + mükerrer yazım)
