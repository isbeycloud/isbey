# FAZ 19 — AppType Ölçüm Aracı Genişletmesi · Kapanış Notu

**Tarih:** 16.09.2026 · **İzin:** kullanıcı onayı alındı ("devam et, onay veriyorum")
**Kapsam:** yalnız ölçüm aracı. **Uygulama kodu değiştirilmedi.**

---

## 1. Ne yapıldı

`docs/38` §2'deki `AppType` çelişkisini çözmek için, kontör yakmayan sözleşme
ölçüm aracı genişletildi.

**Değişen dosya (tek):** `server/tests/phase19CancelContractProbe.ts`
**Yeni dosya (tek):** `tools/apptype-mantik-testi.mjs`

Genişletme, aracın mevcut §2 bölümünden **sonra** yeni bir `§2B` ekler. Mevcut
Deney A/B ve §3 özeti **bozulmadı**.

### Kontrollü deney tasarımı

Tek değişkenli ölçüm: gövde sabit, **yalnız `AppType` değişir**.

| Deney | Gönderilen |
|---|---|
| C0 (kontrol) | `AppType` **hiç yok** — diğer alanlar tam |
| C1 … C7 | `AppType` = 1 … 7 |

Hepsi **aynı uydurma UUID** (`00000000-...-000000000000`) ile çağrılır. Var olmayan
bir belge iptal edilemez — gerçek iptal oluşmaz, kontör yakılmaz.

### Neden bu tasarım çelişkiyi çözer

C0 olmadan "AppType=3 geçerli" hükmü çıkarılamaz — çünkü `AppType` hiç
doğrulanmıyorsa tüm değerler aynı yola girer ve fark görünmez. C0, **"AppType eksik"
mesajının imzasını** verir; C1–C7 bununla karşılaştırılır:

- C0'dan **ayrışan** türler → API o türü **tanıyor** (farklı doğrulama yolu)
- C0 ile **aynı kalanlar** → ya geçersiz tür ya da alan hiç okunmuyor
- **Hiçbiri ayrışmıyor** → `AppType` bu uçta doğrulanmıyor

Bu ayrım, repodaki iki zıt sözlükten hangisinin gerçek olduğunu gösterir.

---

## 2. Doğrulama — ne kanıtlandı, ne kanıtlanmadı

### ✅ Kanıtlanan: araç tip-güvenli ve sözdizimi geçerli

```
npx tsc --noEmit -p tsconfig.server.json   →  TSC_EXIT=0
```

### ✅ Kanıtlanan: güvenlik kapısı çalışıyor

Araç VM'de gerçekten koşuldu. Egress engeli nedeniyle doğru davrandı:

```
[HIZLI_CONNECT] UtilEncrypt hatası: Request failed with status code 403
  ⛔ AUTH KANITLANAMADI — sözleşme ölçümüne GEÇİLMEDİ.
     Hiçbir CancelDocument çağrısı yapılmadı.
  [SOZLESME_OLCUMU:KOSULAMADI]
```

**§2B'ye hiç girilmedi** — auth kanıtlanmadan istek atmıyor. Tasarım gereği doğru.

### ✅ Kanıtlanan: §2B sınıflandırma mantığı 4/4 doğru

Gerçek API'ye dokunmadan, sentetik yanıtlarla sınandı
(`tools/apptype-mantik-testi.mjs`):

| Senaryo | Hüküm | Sonuç |
|---|---|---|
| S1 — geçerli/geçersiz türler farklı mesaj veriyor | Ayrışan: C1,C4,C5,C7 (geçersiz) · C2,C3,C6 (geçerli) | ✅ |
| S2 — tüm değerler aynı mesaj | "Hiçbiri ayrışmadı" | ✅ |
| S3 — **yalnız AppType=3** kontrolle aynı | Ayrışan: diğerleri · Aynı: C3 | ✅ |
| S4 — kontrol deneyi yok | "KONTROL YOK" | ✅ |

**S3 en kritik senaryodur**: çelişkinin tam da beklediği hâl. Araç onu doğru yakalıyor.

> ⛔ Bu 4/4 sonucu **sözleşme kanıtı DEĞİLDİR.** Mantığın doğruluğunun kanıtıdır,
> API'nin davranışının değil. Bu ayrım korunmalıdır.

### ⛔ Kanıtlanmayan: gerçek `AppType` numaralandırması

**Ölçüm hâlâ yapılmadı.** VM'de egress yok:

```
curl → canceldocument_http=000
getent hosts econnecttest.hizliteknoloji.com.tr → yok
```

Gerçek cevabı yalnız **egress erişimli makine** verebilir. Bu araç o makinede
koşulmaya hazır.

---

## 3. Koşum talimatı (Windows, proje kökünde)

```powershell
powershell -ExecutionPolicy Bypass -File tools\faz19-cancel-sozlesme-ispeti.ps1
```

Aynı sarmalayıcı, aynı ön koşullar. Beklenen etiket yine
`[SOZLESME_OLCUMU:OLCULDU]` — **PASS değil.**

**Yaklaşık istek sayısı:** 2 (mevcut A/B) + 8 (yeni C0–C7) = **10 istek**.
Hepsi uydurma kimlikle. Kontör yakmaz, belge göndermez, canlıya çıkmaz.

**Okunacak çıktı:** §2B altındaki `S-4 AppType MESAJ İMZALARI` bloğu. Özellikle
"Kontrolden ayrışan türler" satırı.

**Kanıt dosyası:** `.verify-tmp\faz19-cancel-sozlesme-<zaman>.json` —
yeni `appTypeOlcumleri` dizisi ham istek/yanıt gövdelerini taşır.

---

## 4. Uygulama koduna dokunulmadı — kanıt

```
find server/services server/routes -newermt "2026-09-16 10:00" -type f → 0 dosya
```

Bu turda değişen tek şey:

```
./server/tests/phase19CancelContractProbe.ts   (ölçüm aracı)
./tools/apptype-mantik-testi.mjs               (yeni, mantık testi)
./docs/38_FAZ19_VENDOR_SOZLESME_KARSILASTIRMA.md  (önceki turun raporu)
```

`AppType: 3` sabit değeri **değiştirilmedi**. `uuid`/`cancelReason` fazla alanları
**kaldırılmadı**. `SendApplicationResponse` gövdesi **sözleşmeye uydurulmadı**.
e-İrsaliye için endpoint **uydurulmadı**.

Güvenlik kilidi değişmedi: `IS_TEST_MODE=true`, `ALLOW_PROD` boş,
production'a dokunulmadı, gerçek belge gönderilmedi, kontör tüketilmedi,
mock kullanılmadı, credential/token değerleri yazılmadı.

---

## 5. Ölçümden sonra ne olacak

`S-4` çıktısı üç sonuçtan birini verir ve her biri farklı bir eylem gerektirir:

| Çıktı | Anlamı | Gereken eylem |
|---|---|---|
| C1–C7'den bir grup ayrışıyor | Doğru sözlük kanıtlandı | `AppType` sabit değeri düzeltilmeli — **ayrıca izin gerekir** |
| Hiçbiri ayrışmıyor | `AppType` bu uçta doğrulanmıyor | Sözleşme sorusu vendor'a sorulmalı |
| Hepsi aynı hata | Ölçüm belirsiz | Gerçek belge akışı gerekir (`faz19-belge-akisi.ps1`) |

Her üç durumda da **kod değişikliği ayrı bir izin turuna tabidir.**

---

## 6. Değişmeyen açık kalemler

Bu tur bunların hiçbirini kapatmadı:

- **`AppType` çelişkisi** — ölçüm aracı hazır, ölçüm yapılmadı
- **`SendApplicationResponse` gövdesi** — 7/7 alan sözleşmeyle uyuşmuyor
- **Giden belge kimliğinin değer kaynağı** — `eInvoiceUUID` mi, yerel UUID mi?
- **Giden e-Fatura iptali** — `AppType` belirsizliğine bağlı
- **e-İrsaliye iptali** — sözleşme de yok, kod da yok
- **Gerçek sandbox belge yaşam döngüsü** — KOŞULAMADI
- **Production** — KAPALI
