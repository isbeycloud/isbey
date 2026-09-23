# FAZ 19 — Gönderilmediği Söylenen Belgeye ETTN Gösteriliyor

**Tarih:** 16.09.2026
**Durum:** ✅ **UYGULANDI** — §1–§5 ÖLÇÜM anıdır (o gün hiçbir şey değiştirilmedi);
uygulama kaydı **§7**'dedir. Kullanıcı izni: *"değiştir"*.
**Kapsam:** `docs/46` §3 düzeltmesinin **yarım bıraktığı** yer
**Canlı API'ye istek gönderilmedi. Belge gönderilmedi/iptal edilmedi. Kontör tüketilmedi.**

---

## 1. Sorun — tek cümle

`docs/46` §3'te rozet dürüstleştirildi: `MOCK_SENT` artık
*"Test — GİB'e Gönderilmedi"* diyor. Ama **aynı ekranın bir üstünde**, aynı belgenin
**ETTN'si gösteriliyor ve kopyalanabiliyor.** Kullanıcı "gönderilmedi" yazısını okuyup
hemen altındaki belge kimliğini karşı tarafa verebilir.

---

## 2. Ölçüm — 5 kayıt, ikisi birden

`data/database.json`, salt okuma. Rozet mantığı ve gönderim izi, koddaki hâliyle
birebir taklit edildi (`server/routes/hizli-bilisim.ts:906-918` filtresi ile
`OfficialEInvoiceViewerModal.tsx:26,32,147` rozeti).

| Fatura | `eInvoiceStatus` | Rozet | Arayüzde ETTN | Gönderim izi |
|---|---|---|---|---|
| `SAT-2026-000016` | `MOCK_SENT` | Test — GİB'e Gönderilmedi | `aa58f0cc-4128-46d9-aa2d-e81bd9f38b7e` | **YOK** |
| `SAT-2026-000017` | `MOCK_SENT` | Test — GİB'e Gönderilmedi | `6506996c-0e34-47b0-8b27-1baa99854e2f` | **YOK** |
| `SAT-2026-000018` | `MOCK_SENT` | Test — GİB'e Gönderilmedi | `d28da93d-f2dc-49ff-8814-32fbbc26f860` | **YOK** |
| `SAT-2026-000019` | `MOCK_SENT` | Test — GİB'e Gönderilmedi | `e8dfdb4a-a2c5-4c06-8de0-f9c59b136176` | **YOK** |
| `SAT-2026-000020` | `MOCK_SENT` | Test — GİB'e Gönderilmedi | `fa630edd-0019-4bbe-a58e-ffec9b3ded3a` | **YOK** |

**Çelişen kayıt: 5.** Karşı kontrol (gönderim izi VAR ama rozet "gönderildi"
demiyor): **0** — yani çelişki tek yönlü ve tam olarak bu 5 kayıtta.

`electronicDocuments` içindeki 7 kaydın **hepsi** `providerId: "MOCK"`. MOCK dışı
gönderim izli belge sayısı: **0**.

### 2.1 ETTN taşıyan kayıtların çapraz tablosu

| Rozet | Gönderim izi | Adet |
|---|---|---|
| gönderildi | var | 0 |
| gönderildi | yok | 0 |
| **gönderilmedi** | **yok** | **5** |

Yani veritabanında ETTN taşıyan **tek** kayıt kümesi, "gönderilmedi" denen 5 kayıttır.
Gönderilmiş ve ETTN'si olan tek bir kayıt bile yok.

---

## 3. Kod — nerede

### 3.1 Rozet ile ETTN aynı ekranda, ayrı kurallarla

`src/components/modules/edonusum/OfficialEInvoiceViewerModal.tsx`

```
:26   const isSent = invoice.eInvoiceStatus === 'SENT' || ... === 'DELIVERED' || ... === 'ACCEPTED';
:32   const isMockSent = invoice.eInvoiceStatus === 'MOCK_SENT';
:38   const ettn = invoice.eInvoiceUUID || null;     // ← koşulsuz
:147  {isSent ? 'GİB İletildi' : isMockSent ? 'Test — GİB\'e Gönderilmedi' : 'Taslak'}
:168  ETTN: {ettn || 'Belge gönderilmediği için atanmadı'}
:171  <button onClick={handleCopyEttn} disabled={!ettn} ...>
```

`:38` etiketi **koşulsuz** okuyor. `:168`'in yedek metni *"Belge gönderilmediği için
atanmadı"* — yani yazarı, "gönderilmedi" hâlinde ETTN **olmamasını** bekliyor.
Ama `MOCK_SENT` kayıtlarında ETTN **var**, dolayısıyla yedek metin hiç görünmüyor ve
kopyalama düğmesi `disabled` olmuyor.

### 3.2 `docs/45`'in sınırı buydu

`docs/45` yalnız **uydurma biçimi** (`urn:uuid:<id>-<yıl>`) hedefliyordu. Bu 5 kayıt
e-Arşiv'in meşru biçimini taşıyor — kusur **biçimde değil, gösterim kuralında.**
`docs/45` bunu kapsamıyordu; bu bulgu ayrıdır.

### 3.3 Aynı kayıt için XML ve HTML çelişiyor

`server/routes/efatura.ts` — iki ayrı çıktı yolu:

| Yol | `isDraft` tanımı | `MOCK_SENT` için sonuç |
|---|---|---|
| `:36` XML | `:95` `=== 'DRAFT' \|\| !status` | `false` → uyarı notu **yok**, `<cbc:UUID>` içinde **gerçek ETTN** var |
| `:321` HTML | `:365` `!isSent` | `true` → "TASLAK FATURA" filigranı basılır |

Aynı belge XML'de uyarısız ve kimlikli, HTML'de TASLAK filigranlı. İkisi de ETTN'yi
yazdırır (`:105/:118` ve `:372/:608`). `docs/45`'in *"uydurma kimlik basılmaz"*
düzeltmesi burada çalışıyor — ama gerçek görünen bir kimlik basılmaya devam ediyor.

---

## 4. Yan bulgular (aynı sınıf, daha küçük)

`MOCK_SENT` yeni bir durum olduğu için, onu tanımayan mevcut karşılaştırmalar onu
**yanlış tarafa** düşürüyor:

| Yer | Kod | Sonuç |
|---|---|---|
| `src/components/modules/satis/InvoiceListView.tsx:197-198` | filtre yalnız `SENT`/`DELIVERED` ve `DRAFT`/boş dallarını tanır | `MOCK_SENT` **hiçbir** filtreye girmiyor → "GİB İletilenler" ve "Taslaklar" seçilince kayıt listeden **düşüyor** |
| `server/routes/hizli-bilisim.ts:592` | `eInvoiceStatus !== 'DRAFT'` | `MOCK_SENT` "e-Fatura var" sayılır — panelde **fazla** sayım |
| `server/routes/efatura.ts:815` | `['SENT','WAITING','QUEUED']` | `MOCK_SENT` dışarıda — **güvenli yön**, değişiklik gerekmez |
| `server/services/documentConversionService.ts:338` | `['SENT','ACCEPTED','DELIVERED']` | iptal kapısı kapalı — **güvenli yön** |

---

## 5. ⛔ Dürüstlük sınırı

- Bu belge **ölçümdür, düzeltme değildir.** Hiçbir kod ve hiçbir veri değiştirilmedi.
- ⛔ **Gerçek sandbox PASS değildir.** Hiçbir entegratör çağrısı yapılmadı.
- ⚠️ **Şüpheli `ACCEPTED`:** `SAT-2026-000017` ve `SAT-2026-000019`, `electronicDocuments`
  içinde `status: 'ACCEPTED'` taşıyor. Bu durumun nerede yazıldığı **incelenmedi** —
  `providerId` MOCK olduğu için gönderim izi sayılmaz, ama "MOCK bir belgeyi nasıl
  ACCEPTED yaptı" sorusu **açıktır.**
- ⚠️ Bu ETTN'lerin gerçek gönderimden gelip gelmediği **bu veritabanından
  kanıtlanamaz**; yalnız "yerel gönderim izi yok" denebilir.
- Credential/token değeri bu belgeye yazılmadı. Production'a dokunulmadı,
  `ALLOW_PROD` boş, `IS_TEST_MODE=true`.

---

## 6. Önerilen düzeltme — izin gerektirir

**Karar kullanıcıya aittir ve ALINMIŞTIR** (*"değiştir"*). Uygulama kaydı §7'de.

**A) Gösterim kuralı (asıl kusur).** ✅ Uygulandı — §7.1
**B) XML/HTML tutarlılığı.** ✅ Uygulandı — §7.1
**C) Yan bulgular.** ✅ Uygulandı — §7.1 (ama önerilen ölçüt DEĞİL; bkz. §7.4)

**Veri:** Rozet düzeltilip ETTN gösterimi kapatıldığı için bu 5 kaydın `eInvoiceUUID`
alanına **dokunulmadı** — saklanması artık zararsız. Ayrı karar olarak açık kalıyor.

---

## 7. Uygulama kaydı

> ⚠️ §1–§5, düzeltmenin YAPILDIĞI gün değil, kusurun ÖLÇÜLDÜĞÜ gün yazıldı.
> Aşağısı uygulamanın kendisidir.

### 7.1 Değişen dosyalar

| Dosya | Değişiklik | Öneri |
|---|---|---|
| `src/components/modules/edonusum/OfficialEInvoiceViewerModal.tsx` | `const ettn = isSent && invoice.eInvoiceUUID ? invoice.eInvoiceUUID : null;` — koşulsuz okuma kaldırıldı. `ettnYoklukMetni` ile **neden** gösterilmediği ayrıştırıldı (MOCK / kuyruk / red / iptal / taslak). Kopyalama düğmesi `disabled={!ettn}`. | A |
| `server/routes/efatura.ts` (XML yolu, ~:95–128) | `isDraft` artık `!isSent`; `isSent` üçlüsü SENT/DELIVERED/ACCEPTED. `<cbc:Note>`'a *"GİB'E GÖNDERİLMEMİŞTİR - KİMLİK DOĞRULANMAMIŞTIR"* eklendi. Gönderilmemiş belgede ETTN yerine `DOGRULANMAMIS-ETTN` / `TASLAK-ETTN-YOK`. | B |
| `server/routes/efatura.ts` (HTML yolu, ~:387–403) | Aynı `isSent` ölçütü; `ETTN DOĞRULANMAMIŞ (GİB'e gönderilmedi)` yer tutucusu. | B |
| `src/components/modules/satis/InvoiceListView.tsx` | Filtre birleşimine `'MOCK'` eklendi, dal ve `<option value="MOCK">GİB'e Gönderilmeyenler (Test)</option>` yazıldı. | C |
| `server/routes/hizli-bilisim.ts:592` | `eInvoiceCount` ölçütü `!== 'DRAFT'` → `!GONDERILMEMIS_DURUMLAR.includes(...)`. | C (düzeltilmiş ölçüt) |

`/api/efatura/:invoiceId/xml` ucu **yalnız** önizleme/indirme içindir
(`EInvoicePreviewModal.tsx:69`, `OfficialEInvoiceViewerModal.tsx:240`); gönderim
gövdesini beslemediği doğrulandı — bu yüzden uyarı notu eklemek gönderimi etkilemez.

### 7.2 Yeni süit — `phase19EttnGosterimTest.ts` (75 PASS / 0 FAIL)

Bölümler: **A** kaynak kod (koşulsuz okuma kalmadı mı) · **B** davranış + rozet/ETTN
çelişkisi · **C** XML↔HTML hüküm birliği · **D** gerçek veri (eski çelişki 6 → yeni 0)
· **E** liste filtresi · **F** "GİB onaylı" sayımı · **G** gerçek route, kimliksiz istek.

**Ayırt etme gücü — 3 kontrol koşumu** (mutasyonlar **yalnız** `/tmp` kopyasında,
gerçek repoya yazılmadı):

| Kontrol | Uygulanan mutasyon | Sonuç |
|---|---|---|
| K1 | Viewer'da koşulsuz `invoice.eInvoiceUUID \|\| null` geri getirildi | **EXIT=1**, A-2 + A-3 FAIL, 73/2 |
| K2 | XML yolunda `isDraft = ... === 'DRAFT'` geri getirildi | **EXIT=1**, C-2 + C-4 FAIL, 73/2 |
| K3 | `eInvoiceCount` eski `!== 'DRAFT'` ölçütüne döndürüldü | **EXIT=1**, F-3 FAIL, 74/1 |
| — | Temiz (mutasyonlar geri alındı) | **EXIT=0**, 75/0 |

### 7.3 Tam regresyon (her süit TAZE DB kopyasında)

| Süit | Sonuç |
|---|---|
| `phase19GonderimIziTest` | 40 PASS / 0 FAIL |
| `phase19SyntheticEttnTest` | 34 PASS / 0 FAIL |
| `phase19CancelFlowTest` | 29 PASS / 0 FAIL |
| `phase19AcceptResponseTest` | 27 PASS / 0 FAIL |
| `phase19ApplicationResponseTest` | 34 PASS / 0 FAIL |
| `phase19RejectAndIdentityTest` | 26 PASS / 0 FAIL |
| `phase19ApplicationResponseRouteTest` | 24 PASS / 0 FAIL |
| `phase19EttnGosterimTest` (**YENİ**) | **75 PASS / 0 FAIL** |

Tip: `tsc --noEmit -p tsconfig.server.json` **EXIT 0** ·
`tsc --noEmit -p tsconfig.app.json` **EXIT 0**.

⚠️ **Ölçüm yöntemi notu.** İlk regresyon turunda süitler **paylaşılan** bir DB'de
koşuldu ve sonuçlar yanıltıcıydı: `GonderimIzi` 40→39'a düştü, kiracı sayısı 43→44,
sayım 43→88 oldu. Sebep süitlerin kendi fixture'larını yazması
(`SAT-2026-000021` gibi) ve sonraki süitin ölçümünü kirletmesiydi — **kaynak kodda
kusur yoktu.** Her süit taze kopyada koşulduğunda hepsi tekrar PASS verdi.
Gerçek repo verisi (`data/database.json`, 459 fatura) bu turlarda **hiç değişmedi**.

### 7.4 ⚠️ Önerilen ölçüt uygulanmadı — çünkü YANLIŞTI

§6/C'de `hizli-bilisim.ts:592` için **"gönderim izi"** ölçütü önerilmişti
(`docs/46` Bulgu A'daki filtrenin aynısı). Uygulandı, ölçüldü ve **geri alındı.**
Gerçek veride bu ölçüt `EFT202600009988` kaydını da düşürüyordu: kayıt
`gibStatusCode='1300'` + *"BAŞARIYLA TAMAMLANDI"* + `urn:uuid:` ETTN taşıyor, yani
**GÖNDERİLMİŞ**; yalnız `electronicDocuments` izi yok — tablo sonradan eklendiği için
eski kayıtta iz bulunmuyor.

> **Kural: yerel iz YOKLUĞU, "gönderilmedi" KANITI DEĞİLDİR.**
> Fail-closed bir ölçüt burada gerçek bir gönderimi GİZLERDİ.

Uygulanan ölçüt bunun yerine **kanıtı olan iki sınıfı dışlar**:
`GONDERILMEMIS_DURUMLAR = ['DRAFT','MOCK_SENT','CANCELLED']`. Tanınmayan durumlar
(ör. `APPROVED`) eskisi gibi **sayılır** — sessizce düşürülmez.
Gerçek veride sonuç: kiracı başına **301 → 43** (fark = 6 sahte kayıt × 43 kiracı).

Bu tuzak süite **kalıcı bekçi** olarak bağlandı: `F-9` (izi olmasa bile GİB onaylı
belge sayılır), `F-10` (bilinmeyen durum düşürülmez), `F-14` (geri alınan ölçütün
gerçek gönderimi düşürdüğü kanıtı).

### 7.5 Yapılmayanlar

- **Veriye dokunulmadı.** 5 kaydın `eInvoiceUUID` alanı duruyor; artık gösterilmiyor.
  Temizliği ayrı karar (§6 son paragraf).
- `AppType` sabit `1` değiştirilmedi (`docs/40` konusu).
- Gerçek sandbox koşumu yapılmadı — `tools/faz19-belge-akisi.ps1`, egress'li makine.
- **İki ölçüt bilinçli olarak FARKLI ve bu doğrudur.** `hizli-bilisim.ts:920`
  (`sync-portal-invoices`) *sorgulanacak* belgeyi seçer; orada **fail-closed**
  davranmak zorundadır — izi olmayan belge entegratöre sorulmaz, çünkü sorulacak
  kimliği yoktur. `:592` ise *gösterilecek sayıyı* üretir; orada fail-closed
  davranmak gerçek bir gönderimi gizler (§7.4). Aynı görünen iki ölçütün farklı
  olması bir tutarsızlık değil, iki farklı sorunun doğru cevabıdır. Bu ayrım
  kodda yorumla yazılıdır; birleştirilmemelidir.
