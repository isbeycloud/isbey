# İŞBEY — FAZ 19: Belge İptal Entegrasyonu Kanıt Dosyası

**Tarih:** 2026-09-15 · **Yöntem:** Kaynak kod okuması (statik kanıt) · **Değişiklik yapılmadı**

> Bu dosya yalnızca **koddan okunabilen** kanıta dayanır. Hiçbir satır
> çalıştırılarak doğrulanmamıştır; hiçbir API çağrısı yapılmamıştır. Her satırın
> kaynağı dosya + satır numarasıyla verilmiştir; okuyucu bağımsız doğrulayabilir.

---

## 1. Özet karar

| Soru | Cevap | Dayanak |
|------|-------|---------|
| ERP'de giden fatura iptal edilince entegratöre iptal gidiyor mu? | **HAYIR** | §3.1 |
| `cancelInvoice` ne yapıyor? | Yalnız ERP tarafını ters çeviriyor | §3.1 |
| `CancelDocument` nerede kullanılıyor? | Yalnız gelen-belge reddi | §3.2 |
| `/hizli/cancel-earsiv` ne yapıyor? | Farklı bir uç (`CancelEArsivInvoice`), kronolojik ön koşullu | §3.3 |
| İki iptal yolu aynı şey mi? | **HAYIR** — farklı uçlar, farklı kapsam | §4 |
| Bu bir ürün hatası mı? | **INTEGRATION GAP** (kullanıcı onayı olmadan düzeltilmedi) | §6 |

---

## 2. İptal akışları kanıt tablosu

| Akış | Yerel iptal | Vendor iptali | Endpoint | Durum |
|------|-------------|---------------|----------|-------|
| Giden satış faturası — `DELETE /api/invoices/:id` | ✅ `isDeleted=true`, `status=CANCELLED`, stok/cari/nakit/banka hareketleri silinir | ❌ **YOK** | — | **INTEGRATION GAP** |
| Giden satış faturası — `POST /api/v1/invoices/:id/cancel` | ✅ ters stok hareketi, cari geri alma, `CANCELLED`, denetim kaydı | ❌ **YOK** | — | **INTEGRATION GAP** |
| Giden e-Arşiv — E-Dönüşüm ekranı "İptal Et" | ❌ yerel kayıt güncellenmez | ✅ var | `GET RestApi/CancelEArsivInvoice` | ⚠️ Ayrı kusur (§5) |
| Giden e-Fatura — GİB İptal | ❌ **hiçbir yol yok** | ❌ **YOK** | — | **INTEGRATION GAP** |
| Giden e-İrsaliye iptali | ❌ yok | ❌ **YOK** | — | **INTEGRATION GAP** |
| Gelen belge — RED (`REJECTED`) | ✅ `status=REJECTED` | ✅ var | `POST RestApi/CancelDocument` | ✅ DOĞRU |
| Gelen belge — KABUL (`ACCEPTED`) | ✅ `status=ACCEPTED` | ❌ yok (arayüzde uç yok) | — | ✅ Kodda dürüstçe not edilmiş |
| Ham uç — `POST /api/efatura/hizli/cancel-earsiv` | ❌ yerel kayıt yok | ✅ var | `GET RestApi/CancelEArsivInvoice` | ⚠️ Bkz. §5 |

---

## 3. Satır bazlı kanıt

### 3.1 `DocumentConversionService.cancelInvoice` — entegratör çağrısı YOK

**Dosya:** `server/services/documentConversionService.ts:320-407`

Fonksiyonun tamamı okundu. Yaptığı işlemler sırasıyla:

| # | İşlem | Satır |
|---|-------|-------|
| 1 | Faturayı bul, zaten iptal mi kontrol et | 321-327 |
| 2 | Stokları geri al, ters stok hareketi yaz | 337-380 |
| 3 | Cari bakiyeyi geri al, cari hareketi `isCancelled` yap | 383-397 |
| 4 | `invoice.status = 'CANCELLED'` | 399-400 |
| 5 | Denetim kaydı yaz, `storage.save()` | 402-406 |

**Fonksiyon gövdesinde `CancelDocument`, `cancelDocument`, `provider`,
`HizliConnectService` veya herhangi bir HTTP çağrısı GEÇMEZ.**
Gerekli importlar da yoktur (`axios` bu dosyada kullanılmaz).

Aynı fonksiyona giden iki rota:

- `server/routes/v1/invoices.ts:148` → `POST /api/v1/invoices/:id/cancel`
- `server/routes/invoices.ts:523` → `DELETE /api/invoices/:id` (bu rota **doğrudan**
  `storage.runTransaction` ile yazar; `cancelInvoice`'ı bile çağırmaz — kendi
  içinde bağımsız bir iptal yoludur ve entegratör çağrısı içermez)

### 3.2 `CancelDocument` yalnız GELEN belge reddinde kullanılıyor

`CancelDocument` çağrısı **tek** bir yerde yapılır:

**Zincir:**
```
server/services/incomingInvoiceService.ts:227
  → provider.cancelInvoice(incInvoice.uuid, ...)
      ↓
server/services/providers/hizliTeknolojiProvider.ts:337-355
  → HizliConnectService.cancelDocument({ uuid, cancelReason }, token, isTest)
      ↓
server/services/hizliConnectService.ts:396-399
  → POST ${baseUrl}/HizliApi/RestApi/CancelDocument
```

`incomingInvoiceService` içindeki çağrı, yalnızca `action === 'REJECTED'`
dalında ve **gelen** fatura için yapılır (satır 224-230). Ayrıca sonuç
kontrol edilir: `success` değilse hata fırlatılır ve durum değiştirilmez —
sahte başarı üretilmez.

**Sonuç:** Giden belgeler için `CancelDocument`'a giden hiçbir kod yolu yoktur.

### 3.3 `/hizli/cancel-earsiv` farklı bir uçtur

**Dosya:** `server/routes/efatura.ts:1470-1483`

```ts
router.post('/hizli/cancel-earsiv', ...)   // requireAuth var (satır 8)
  → HizliConnectService.cancelEArsivInvoice(uuid, reason, token, isTest)
```

**Dosya:** `server/services/hizliConnectService.ts:374-391`

```ts
GET ${baseUrl}/HizliApi/RestApi/CancelEArsivInvoice?Uuid=...&CancelReason=...
```

Bu, `CancelDocument`'tan **ayrı bir uçtur** ve yalnız e-Arşiv faturalarına
yöneliktir. E-Dönüşüm ekranındaki "İptal Et" butonu bu rotayı çağırır
(`src/components/modules/edonusum/EDonusumView.tsx:248`).

---

## 4. İki iptal yolunun farkı

| | `cancelInvoice` / `DELETE :id` | `cancel-earsiv` |
|---|---|---|
| Kapsam | ERP içi fatura kaydı | Yalnız e-Arşiv belgesi |
| Yerel güncelleme | ✅ stok + cari + durum + denetim | ❌ **yok** |
| Entegratör çağrısı | ❌ **yok** | ✅ `CancelEArsivInvoice` |
| Uç tipi | POST/DELETE | GET (sorgu parametreli) |
| Çağıran | Fatura listeleri | E-Dönüşüm ekranı |

**Kritik:** İkisi birbirinin alternatifi değil, **tamamlayıcısıdır.** Doğru akış
her ikisini de gerektirir: yerel ters kayıt **ve** entegratör iptali. Şu an
kullanıcı hangi ekranı kullanırsa kullansın **ikisi birden** olmuyor.

---

## 5. E-Arşiv UI iptalinin kimlik kusuru (ayrı bulgu)

`EDonusumView.tsx:248`:
```ts
await api.cancelHizliEArsiv({ uuid: inv.id, cancelReason: '...' })
```

Burada `inv.id`, **ERP iç kimliğidir** (`inv-<timestamp>` biçiminde üretilir —
`documentConversionService.ts:80`, `routes/invoices.ts:118`). Ekrandaki
`Invoice` nesnesi `api.getInvoices()` kaynağından gelir
(`EDonusumView.tsx:114-121`), yani ERP faturasıdır.

Entegratör belge kimliği ise ayrı bir alanda tutulur: **`eInvoiceUUID`**
(`server/db/schema.ts:451`, `src/types/index.ts:405`) ve gerçek gönderim
sonrası entegratör yanıtından doldurulur (`efatura.ts:1364`).

Aynı dosyanın 232. satırı da aynı deseni kullanır (`uuid: inv.id`).

**Sonuç:** e-Arşiv iptal çağrısı entegratöre ERP iç kimliğini gönderir. Bu,
entegratörün tanıyacağı bir belge kimliği değildir. **Bu bulgu statik okumaya
dayanır — gerçek API yanıtıyla doğrulanmamıştır** (sandbox erişimi gerekir).

**Not:** Aynı ekranda gösterilen "ETTN" de aynı iç kimlikten türetilir
(`EDonusumView.tsx:323` → `inv.id.slice(0,18)`), `eInvoiceUUID` değil.

---

## 6. Değerlendirme ve öneri (uygulanmadı)

Giden belge iptalinin entegratöre bildirilmemesi gerçek bir **INTEGRATION GAP**'tir:
kullanıcı ERP'de faturayı iptal ettiğinde GİB/entegratör tarafında belge geçerli
kalır — iki taraf tutarsız olur.

Düzeltme **yapılmadı**; davranış değişikliği ayrı onay gerektirir. Düzeltilecekse
şu tasarım soruları önce cevaplanmalıdır:

1. **Hata yolu:** Entegratör iptali reddederse ERP tarafı ne olur? (Mevcut
   `incomingInvoiceService` deseni: önce entegratör, başarılıysa yerel yaz.
   Giden akışta tersine çevrilirse "yerel iptal edildi ama GİB'de duruyor"
   durumu oluşur.)
2. **Uç seçimi:** Giden e-Fatura için `CancelDocument`, e-Arşiv için
   `CancelEArsivInvoice` mi kullanılmalı? Satıcı dokümanı bu ayrımı
   belgelemiyor.
3. **Kimlik:** Çağrıda `eInvoiceUUID` kullanılmalı; `inv.id` değil (§5).
4. **Zaman penceresi:** GİB iptal süreleri kısıtlıdır; süre dışı iptalde
   kullanıcıya ne söylenecek?
5. **Kontör:** İptal kontör tüketiyor mu? Belgelenmemiş.

Bu beş madde netleşmeden kod değişikliği **yapılmamalıdır**.

---

## 7. Doğrulanmamış olanlar (dürüstlük sınırı)

- Hiçbir API çağrısı yapılmadı. Entegratörün `CancelDocument` /
  `CancelEArsivInvoice` uçlarına verdiği **gerçek** yanıtlar görülmedi.
- Entegratörün geçersiz bir ERP iç kimliğine nasıl davrandığı **ölçülmedi** (§5).
- İptalin kontör tüketip tüketmediği **belgelenmedi**.

Bunlar için gerçek sandbox koşusu gerekir: `tools/faz19-belge-akisi.ps1`.

### 7.1 Bağımsız doğrulama (2026-09-15, tüm depo grep)

Bu dosyadaki iddialar, tüm depo üzerinde bağımsız `grep` ile yeniden denetlendi:

| İddia | Denetim deseni | Ölçülen sonuç |
|-------|----------------|---------------|
| §3.1 — `cancelInvoice` entegratöre gitmiyor | `provider.cancelInvoice(` | Tüm depoda **tek** çağrı: `incomingInvoiceService.ts:227` (yalnız gelen/red). Giden akışta yok |
| §3.2 — `CancelDocument` tek yerde | `cancelDocument\|CancelDocument` | Üretim kodu: yalnız `hizliTeknolojiProvider.ts:342`. Kalan eşleşmeler test dosyaları + servis tanımı + rota yorumu |
| §3.1 — ikinci yol da gitmiyor | `DELETE /api/invoices/:id` gövdesinde `provider\|HizliConnect\|axios\|fetch(` | **Bulunamadı** — hiçbir entegratör çağrısı yok |
| §3.3 — `cancel-earsiv` ayrı uç | `cancelEArsivInvoice` | Üretimde tek çağrı: `efatura.ts:1473` (ham rota) |
| §5 — UI iç kimliği gönderiyor | `EDonusumView.tsx` | `:232` ve `:248` her ikisi de `uuid: inv.id` — **teyit edildi** |
| §3 — süit bu kusuru yakalıyor | `phase19DocumentLifecycleTest.ts:470-486` | Denetim **çağrı biçimini** arıyor (`HizliConnectService.cancelDocument(`), metot tanımına eşleşmiyor → doğru WARN, sahte PASS yok |

**Kapsam notu:** Bu denetim statik okumanın **tekrarıdır**, gerçek API kanıtı
değildir. Yine de iddiaların kod tabanıyla tutarlı olduğunu bağımsız olarak
doğrular; "dosyayı yanlış okudum" riskini ortadan kaldırır.

---

## 8. İlgili dosyalar

- `server/services/documentConversionService.ts` — `cancelInvoice`
- `server/routes/invoices.ts:523` — `DELETE /:id`
- `server/routes/v1/invoices.ts:148` — `POST /:id/cancel`
- `server/services/incomingInvoiceService.ts:227` — tek `CancelDocument` yolu
- `server/services/providers/hizliTeknolojiProvider.ts:337` — sağlayıcı iptali
- `server/services/hizliConnectService.ts:374,396` — iki farklı uç
- `server/routes/efatura.ts:1470` — ham e-Arşiv iptal rotası
- `src/components/modules/edonusum/EDonusumView.tsx:248` — UI çağrısı
- `docs/31_FAZ18_FAZ19_TEST_BORCLARI.md` §B-11 · `docs/33_FAZ19_TEST_KORUMA_NOTU.md`
