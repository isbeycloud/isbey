# 91 — SATIŞ FİYATI GÜVENLİĞİ: ÖLÇÜM VE YETKİ KAPISI

**Tarih:** 2026-10-21 · **Durum:** kapı SIKILAŞTIRILDI, testler yeşil
**Canlıya yazılan:** hiçbir şey · **Fiyatlar:** DEĞİŞTİRİLMEDİ

---

## 1. Ölçülen durum

13 ürünün **`salePrice` alanı 0**, `priceLists` **0 kayıt**, hiçbir üründe
`salePrices` yok. Yani fiyat bilgisi **hiçbir yerde durmuyor**; yalnız
`purchasePrice` dolu.

Sonuç zinciri (daha önce ölçülmüştü, değişmedi): satış faturası ürünün satış
fiyatını kullanır → bu ürünlerle kesilen fatura **0 TL** çıkar → stok çıkışı
doğar, alacak doğmaz.

**Fiyatlar TAHMİNLE DOLDURULMADI.** Satış fiyatı bir işletme kararıdır;
alış fiyatından türetmek (ör. ×1,2) uydurma bir mali veri üretirdi.

---

## 2. 2026-10-20 kapısı ve ÖLÇÜLEN EKSİĞİ

İlk kapı (`zeroPriceGate.ts`) sıfırı yasaklamıyor, yalnız **≥10 karakter
gerekçe** istiyordu. Ölçüm — kapı saf fonksiyon olarak doğrudan çağrıldı:

| Gerekçe | Sonuç |
|---|---|
| (yok) | ENGELLEDİ ✓ |
| `"x"`, `"test"` | ENGELLEDİ ✓ |
| `"asdfasdfasdf"` | **GEÇTİ** ✗ |
| `"1111111111"` | **GEÇTİ** ✗ |
| `"promosyon"` (9 kr) | ENGELLEDİ ✓ |

Yani **herhangi bir kasiyer**, klavye ezberi 10 karakter yazarak malı bedelsiz
çıkarabiliyordu. Kapı "sessizliği kaldırıyordu" ama **yetki sormuyordu**.
İş emrinin P3 maddesi tam olarak bunu istiyor: *"Meşru ücretsiz işlemleri AYRI
ve AÇIK yetkilendirmeyle destekle."*

---

## 3. Yeni kapı — üç şart birden

`server/services/zeroPriceGate.ts`:

### 3.1 YETKİ (yeni)

Sıfır/negatif tutarlı **satış** faturası yalnız şu rollerde kesilebilir:

```
SUPER_ADMIN · ADMIN · COMPANY_ADMIN · company_admin · platform_admin
```

Liste **beyaz liste**: dışındaki her rol reddedilir. Aktör **sunucudan** gelir
(`req.user.role` + `req.userRole`), **istek gövdesinden ASLA** — istemci
kendini yönetici ilan edemez.

**Aktör hiç verilmezse fail-closed:** yazılmaz. Bu, yeni bir çağrı yolu
eklendiğinde kapının sessizce açılmasını engeller.

Yetki kontrolü **gerekçeden ÖNCE** yapılır: yetkisiz çağırana "gerekçe yaz"
demek, ona deneme-yanılma ile kapıyı aşma imkânı verirdi.

### 3.2 GEREKÇE (sıkılaştırıldı)

- en az **10 karakter** (eskisi),
- **en az 2 kelime** (yeni): `"asdfasdfasdf"` tek kelimedir → reddedilir,
- **en az 3 farklı karakter** (yeni): `"1111111111"` → reddedilir.

### 3.3 İZ (korundu)

Gerekçe belgeye (`zeroTotalReason`) **ve** denetim kaydına yazılır.

---

## 4. HTTP kodları artık ayrışıyor

| Durum | Kod | Kod adı |
|---|---|---|
| Yetki yok | **403** | `ZERO_TOTAL_FORBIDDEN` |
| Yetki var, gerekçe yok/kötü | **400** | `ZERO_TOTAL_REASON_REQUIRED` |

Önceden ikisi de `400` dönüyordu. `400` "isteğin biçimi bozuk" der; oysa
yetkisiz istek **kusursuz** biçimde gelir — eksik olan yetkidir. İstemci bu
ikisini ayırt edebilmeli.

---

## 5. Neden yeni bir PERMISSION kodu DEĞİL

Ayrı bir `invoices.zero_total` kodunu `server/security/permissions.ts`
kataloğuna eklemek, o kataloğa bağlı **iki sözleşme testini** (registry
tutarlılığı + frontend matrisi) ve **canlıdaki mevcut müşteri paketlerinin**
yetki setlerini değiştirmeyi gerektirir. Bu, P3'ün kapsamı dışında ve yüksek
riskli bir katalog değişikliğidir.

Rol listesi ise kimlik katmanında zaten var olan bir olgudur ve **dar**
tutulabildi. Katalog genişletmesi ayrı bir karar olarak **açık bırakıldı** —
istenirse tek adımda eklenebilir, çünkü kapı zaten tek kaynakta.

---

## 6. Kanıt

`server/tests/zeroPriceGateContractTest.ts` → **21 PASS / 0 FAIL**

Yeni kontroller:

| # | Ölçülen |
|---|---|
| K11 | Yetkisiz rol, **geçerli gerekçe yazsa bile** geçemez (403); aktörsüz çağrı fail-closed |
| K11b | Yetkisiz → **403**, yetkili+gerekçesiz → **400** |
| K12 | `"asdfasdfasdf"`, `"1111111111"`, `"------------"`, `"aaaa bbbb"` **yetkiliyi de** geçirmez |
| K12b | Yetki kontrolü **normal satışı ve ALIŞ'ı etkilemez** (regresyon yok) |

**Negatif kontrol (kanıt):** yetki kontrolü kasten devre dışı bırakıldı →
`K11` ve `K11b` **KIRMIZI** (19 PASS / 2 FAIL). Kapı geri yüklendiğinde
dosya birebir aynı (`diff -q` temiz). Yani testler gerçekten kapıyı ölçüyor.

---

## 7. Kapsam dışı — bilinçli

- **ALIŞ faturaları**: tedarikçinin belgesidir; bedelsiz mal girişi meşru
  olabilir (numune, garanti). Karar GİB sürecinindir.
- **PROFORMA**: stok/cari hareketi doğurmaz.
- **Toplamı > 0 olan satış**: hiç etkilenmez (yetki de sorulmaz).

---

## 8. Kalan iş (kullanıcı kararı)

Kod tarafı bitti; **veri tarafı bitmedi**:

1. 13 ürün için gerçek satış fiyatı girilmeli (işletme kararı).
2. `SAT-2026-000005` (0 TL, 3 kalem, carisi bir **tedarikçi** kartı) ayrı bir
   veri kalitesi sorunu — bu iş kapsamında düzeltilmedi.
3. Fiyat girilene kadar bu ürünlerle kesilen her satış 0 TL çıkar; yeni kapı
   bunu **görünür** kılar, **doğru** kılmaz.

---

**İlgili:** `server/services/zeroPriceGate.ts` ·
`server/tests/zeroPriceGateContractTest.ts` · `docs/88` §6
