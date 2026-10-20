# İŞBEY CLOUD ERP — MÜŞTERİ KULLANIMA HAZIRLIK PROMPTU (NİHAİ)

**Tarih:** 2026-10-17
**Sürüm:** v2 (v1'in yerine geçer)
**Dayanak:** Canlı `database.prod.json` (2.389.720 bayt, sunucu tarihi 15 Eki 08:00) indirilip
`df44a41`'in **gerçek** sahiplik fonksiyonları bu veriyle birebir çalıştırılarak ölçüldü.
Sayısal iddialar bağımsız bir doğrulama turundan geçirildi; 7 iddia yanlış çıktı ve
düzeltildi (sahiplik doluluğu, boş kayıt listesi, "GİB onaylı" hükmü, `required` ifadesi,
E2E sayısı, `docs/81` commit sayısı, `04f8430` tarihi). Kalan **doğrulanamayan** iki nokta
(pilot faturanın GİB onayı ve kontör düşümü) aşağıda açıkça işaretlidir — ölçüm gerektirir.

> **BİRİNCİ KURAL:** Bu prompttaki hiçbir faz, önceki fazın kabul kapısı YEŞİL olmadan
> başlatılmaz. "Muhtemelen çalışıyor" kabul değildir; **ölçülmüş çıktı** kabuldür.

---

## 1. AMAÇ VE KAPSAM

İŞBEY CLOUD ERP'yi gerçek müşteri kullanımına hazır hâle getirmek. Kapsam beş sütundur:
geliştirme, test, güvenlik, tasarım, yardım merkezi. Teslim ölçütü, pilot firma
**Beyoğlu Teknoloji**'nin verisini kaybetmeden ve başka firmaya sızdırmadan
sistemi kesintisiz kullanabilmesidir.

**Mevcut canlı taban (ölçüldü):** 4 tenant · 4 kullanıcı · 9 fatura · 13 ürün ·
4 cari · 1 banka hesabı · 4 kasa · 3 depo · 16 stok hareketi · 54 iş kaydı.

---

## 2. ÖLÇÜLMÜŞ DURUM (kanıt tablosu)

| Alan | Ölçüm | Hüküm |
|---|---|---|
| Sahiplik doluluğu (18 iş koleksiyonu, 54 kayıt) | 44'ü `tenantId`, **3'ü yalnız `companyId`** ile dolu → 47; **7'si hiç sahipsiz (%13)** | Kısmen kirli |
| `tnt-isbey` (kod varsayılanı) | **CANLIDA YOK** | VARSAYILAN HAYALET |
| `customers` / `products` / `invoices` / `users` | 4/4, 13/13, 9/9, 4/4 dolu | Temiz |
| `users` özel durumu | Sahiplik **3 kayıtta yalnız `companyId`**, 1'inde ikisi de dolu | `companyId` yolu CANLI |
| `warehouses` | 3 kayıt: 2 sahipsiz + 1 `tnt-c4485ce2-…`'ye ait. `f0af349d` (Beyoğlu) için **0** | **KRİTİK** |
| Beyoğlu ürünleri | 13 ürün, hepsi `warehouseId: "wh-default"` — bu kimlik DB'de **yok** | **KIRIK REFERANS** |
| Pilot fatura | `SAT-2026-000001`: DB *"bu ETTN için kayıt bulunamadı… Belge gönderilmedi"* diyor; hafıza kaydı `getDocumentListByGUID` ile **EnvelopeStatus 1300** diyor | **ÇELİŞKİLİ — sağlayıcıdan teyit şart** |
| E2E paketi | **50 spec** (7 dosya, `--list` ile ölçüldü). PASS hükmü **koşumla** doğrulanmalı | Sayı düzeltildi |
| Push bekleyen commit | `df44a41`, `ec9b82b` (origin/main'de yok) | Bekliyor |
| CI durumu | `414dc99` (2026-10-07) ve `04f8430` (**2026-10-14**) CI'sız girmiş | Güvenilmez |

---

## 3. ENGEL-1: DEPO SAHİPLİĞİ (push'tan ÖNCE çözülmeli)

**Neden engel:** `df44a41`, `products.ts /meta/groups-warehouses` içindeki
`warehouses.length > 0 ? warehouses : db.warehouses` **fallback'ini kaldırdı** ve
yerine `filterOwned(db.warehouses, tenantId)` koydu. Canlıda Beyoğlu'nun deposu
olmadığı için bu değişiklik şu zinciri doğurur. Ölçülen depo sahipliği:
2 depo **sahipsiz** (`wh-tnt-1791215659174-lpzf-default`, `wh-tnt-1791990569721-iwlu-default`),
1 depo `tnt-c4485ce2-…`'ye ait; **`f0af349d` (Beyoğlu) için 0 depo**.

1. Beyoğlu **0 depo** görür (eskiden fallback tüm depoları veriyordu).
2. Stok hareketi ekranındaki Depo `<select>` **boş** kalır; etikette `required` sınıfı var ama
   `<select>`'te `required` özniteliği **yok**, `handleSubmit` de `warehouseId`'yi doğrulamıyor →
   gövdede `warehouseId: ''` gider.
3. `POST /api/products/adjust` → `draft.warehouses.find(...) || draft.warehouses[0]`
   → **`wh-tnt-1791215659174-lpzf-default`**'a yazar, yani **ABDULKADİR SEZER'in deposuna**.
4. Üstelik `/adjust` oluşturduğu `StockMovement`'a **`tenantId` ATAMAZ** (satır 513–531) →
   yeni sahipsiz kayıt doğar; yani depo onarılsa bile sahipsiz kayıt üretme yolu açık kalır.

Yani "tenant sızıntısını kapat" commit'i, tek başına push edilirse **yeni bir
cross-tenant YAZMA sızıntısı** doğurur. Bu, kapatmaya çalıştığı açığın aynısıdır.

**Ek kanıt:** Beyoğlu'nun 13 ürünü DB'de var olmayan `wh-default` kimliğini işaret ediyor;
bu referans `df44a41`'den önce de kırıktı, ama fallback onu örtüyordu. Fallback kalkınca
kırıklık görünür hâle geliyor.

**Neden E2E yakalamıyor:** `storage.ts registerTenant` yeni firmaya
`{...ownedFields(tenant.id)}` ile depo açar; test verisinde depo `tenantId`'si **hep doludur**.
Tek bozuk firma canlıdaki legacy Beyoğlu'dur. **Yeşil test bu sınıfa kördür.**

### Faz 1 — Depo verisi onarımı (kabul kapısı K1)

- [ ] Beyoğlu (`f0af349d-da17-419c-b9e4-1fde66beec3d`) için `tenantId` **dolu** bir depo oluştur.
- [ ] Beyoğlu'nun 13 ürünündeki `warehouseId: "wh-default"` referansını bu yeni depoya bağla.
- [ ] `tenantId`/`companyId` BOŞ kayıtları sahibine bağla. **18 iş koleksiyonunda 7 kayıt**:
  `cashRegisters`: `cash-tnt-1791215659174-lpzf-default`, `cash-tnt-1791990569721-iwlu-default`;
  `warehouses`: `wh-tnt-1791215659174-lpzf-default`, `wh-tnt-1791990569721-iwlu-default`;
  `stockMovements`: `sm-1791372483711-0/1/2`.
  **Ayrıca bu 7'nin dışında** `currentTransactions`: `ctx-1791372483711` (SAT-2026-000005,
  bakiye −576) — iş kaydıdır, o da bağlanmalı. Toplam **8 iş kaydı**.
- [ ] Değişiklik **geri alınabilir** olsun: önce `database.prod.json` yedeği + sha256.
- [ ] `tnt-isbey` VARSAYILAN kimliğinin canlıda karşılığı olmadığını belgele; boş kayıtların
      "varsayılana gider" kuralı canlıda **kayba** dönüşüyor — bu kuralı gözden geçir.

**K1 kabulü:** Onarımdan sonra `filterOwned` mantığı yeniden çalıştırıldığında
Beyoğlu **≥1 depo** görür, hiçbir tenant'ta boş sahiplikli kayıt kalmaz, ürün→depo
referansları %100 çözülür.

### Faz 2 — Yapısal koruma (kabul kapısı K2)

- [ ] `POST /api/products/adjust` içindeki `|| draft.warehouses[0]` fallback'ini **kaldır**;
      geçersiz/boş `warehouseId` → açık hata (sessiz yanlış yazma yasak).
- [ ] Aynı desendeki diğer fallback'leri tara: `companies.ts`, `import.ts`, `quotes.ts`,
      `v1/products.ts` (`!w.tenantId ||` kalıbı — bu kalıp legacy kaydı **herkese** açar).
- [ ] Yazma yollarında `warehouseId`'nin sahipliğini doğrula (`isWritableBy` benzeri kapı).

**K2 kabulü:** Yabancı depoya yazma denemesi **negatif testle** kanıtlanır: Beyoğlu token'ı ile
başka firmanın deposuna stok çıkışı → 4xx döner, diske **hiçbir şey yazılmaz**.

---

## 4. ENGEL-2: CI BEKÇİSİNİN KÖR NOKTASI

`main`'e commit **hiç CI koşmadan** girebiliyor. Kanıt: `414dc99` ve `04f8430`
(2026-10-07/08) için GitHub API **0 workflow run** döndürüyor; kırılma ancak
`c2cc6ab` (2026-10-14) koşumunda göründü. Ayrıca **hbuilds** webhook'u `main` push'unda
otomatik dağıtım yapıyor — yani **push = canlıya alma**. CI, dağıtım kapısı değildir.

### Faz 3 — Push disiplini (kabul kapısı K3)

- [ ] Push'tan ÖNCE yerelde: `npm run build` → `npx playwright test --reporter=json`.
      `dist/` gitignore'da olduğu için **build şart**; bayat bundle E2E'yi sessizce geçersiz kılar.
- [ ] Push sonrası **o SHA için** koşum olduğunu doğrula
      (`/commits/<sha>/check-runs`). Dalın son yeşil koşumu kanıt değildir.
- [ ] Push edilen commit'te server kullanıcı adı / IP / parola / token **yok**.
      Repo **herkese açık**. Ölçüm: `u455582886` dizesi **HEAD'de temiz (0 dosya)**,
      `docs/81`'de **1 commit** (`fc07d78`), tüm repoda **7 commit**. Geçmiş temizliği
      force-push gerektirir → ayrı onay.
- [ ] `hostinger.txt` gitignore'da kalır; içeriği hiçbir dosyaya kopyalanmaz.
- [ ] Paylaşılmış GitHub token'ları **rotate** edilir.

**K3 kabulü:** `origin/main..HEAD` diff'inde 0 secret; o SHA için CI + Playwright
`success`; canlıda yeni bundle sha256'sı yerelde üretilenle **eşit**.

---

## 5. GÜVENLİK (kabul kapısı K4)

- [ ] Kimlik dizesinden sahiplik çıkarma **tamamen** kalkar: `id.includes(tenantId)`,
      `!id.startsWith('cash-tnt-')`, `!w.tenantId ||` kalıpları yasak.
- [ ] Sahiplik **tek kaynaktan** okunur (`server/security/tenantOwnership.ts`).
      `reports.ts` kendi `ownedBy` kopyasını taşıyor — **ikinci doğruluk kaynağı**, birleştir.
- [ ] Her route `requireAuth` + `requireRole`/`requirePermission` ile korunur.
      **"Sidebar gizlemek güvenlik değildir."**
- [ ] `requireAuth` içinde "token yoksa ilk kullanıcı" fallback'i **yok**.
- [ ] Secret yalnız `.env`'den; eksikse açık hata (fallback şifre **yasak**).
- [ ] Hata mesajı hassas bilgi sızdırmaz; `console.log` yok.
- [ ] IDOR: okuma **ve** yazma yolları ayrı ayrı test edilir (okuma kapalı, yazma açık kalabilir).

**K4 kabulü:** `cashBankTenantIsolationTest.ts` + yeni depo senaryosu PASS;
A-firması token'ı ile B-firması kaydına erişim hem okuma hem yazmada **reddedilir**.

---

## 6. TEST (kabul kapısı K5)

- [ ] E2E'ye **legacy veri senaryosu** ekle: `tenantId`'siz depo + `isDefault: true` +
      kırık `warehouseId` referansı. Mevcut paket bu sınıfa **kör**; asıl hata burada gizlendi.
- [ ] E2E `dist/`'i test eder (`tools/test-server.mjs`, `SERVE_STATIC=true`) → **build şart**.
- [ ] Paket **50 spec** (7 dosya) — `npx playwright test --list` ile ölçüldü.
      Daha önce raporlanan "55/55" rakamı depoyla **uyuşmuyor**; PASS hükmü koşumla verilir.
- [ ] `-g` çapası tüm başlık zincirine uygulanır; `^` çalışmaz. `--reporter=list` çıktısı
      konsolda kaybolur → **`--reporter=json`** kullan.
- [ ] Sunucu testleri: `server/tests/` kökünde **76 `.ts`** (+13 `.mjs`) aynı kalıpta koşar.
- [ ] **Başarısız test raporda FAIL yazılır — asla PASS gösterilmez.**
- [ ] Kapsam hedefi %80; birim + entegrasyon + E2E üçü de gerekli.

**K5 kabulü:** E2E yeşil **ve** yeni legacy senaryo yeşil; başarısız test yok.

---

## 7. TASARIM (kabul kapısı K6)

- [ ] Depo listesi boşken stok/fatura ekranları **çökmez**: boş durum mesajı gösterir,
      kaydet düğmesi kilitlenir, "Depo tanımlayın" yönlendirmesi verir.
- [ ] Pilot firma için e-Fatura GİB onaylı çıktı görseli doğrulanır.
- [ ] **`SAT-2026-000001` durumu NETLEŞTİRİLİR — iki kanıt çelişiyor.**
      DB (`updatedAt` 2026-09-25T15:47:12Z) diyor: `gibStatusDescription` = *"Gönderim kilidi elle
      serbest bırakıldı… bu ETTN için kayıt bulunamadı… **Belge gönderilmedi**"*, `notes` =
      *"[e-Connect GİB No: YOK]"*, audit log *"SENDING mutabakatı: 1 bulunamadı"*.
      Aynı dakikada (15:47:19Z) *"Fatura Hızlı Teknoloji tarafından kabul edildi; **GİB sonucu
      ayrıca sorgulanmalı**"* kaydı var — yani kabul **entegratör** düzeyinde.
      Karşı kanıt: proje hafızası 2026-09-25 18:47 için `getDocumentListByGUID` ile
      **EnvelopeStatus 1300 "BAŞARI İLE TAMAMLANDI" / belge Status 12** sonucunu kaydetmiş
      (kontör 155,00 → 153,00, sağlayıcı belge no `BTF2026000000144`).
      **Çözüm yolu:** sağlayıcıdan `getDocumentListByGUID` ile yeniden sorgula (sorgu kontör
      tüketmez). Sonuç 1300 ise onay doğrulanır; değilse müşteriye "GİB onaylı" **denmez**.
      Kontör iddiası DB'de iz bırakmamış (`electronicDocumentUsage` = 0 kayıt) — ayrıca teyit et.
- [ ] Mobil/küçük ekranda kritik akışlar (fatura, stok, cari) kullanılabilir.
- [ ] Tasarım gerilemesi: mevcut ekranların görsel karşılaştırması (referans dosyalar `crop_*.png`).
- [ ] Tutarlılık: aynı işlem tüm ekranlarda aynı adı ve ikonu taşır.

**K6 kabulü:** Boş depolu firma ile uçtan uca akış (ürün → stok → fatura)
**hatasız** tamamlanır; hiçbir ekranda boş liste kaynaklı kırılma olmaz.

---

## 8. YARDIM MERKEZİ (kabul kapısı K7)

- [ ] Uygulama içi **Yardım Merkezi** yok; bugün yalnız açılış sayfasında `SSS` ve
      `WhatsApp Destek` var. Modül bazlı yardım uygulama içine taşınır.
- [ ] Her modül için: ne işe yarar, ilk kayıt nasıl atılır, sık hata + çözümü.
- [ ] Pilot firmaya özel: VKN ile kayıt, 14 gün deneme, deneme kararı ekranı,
      e-Fatura gönderimi, gelen belge aktarma.
- [ ] `docs/01_KULLANICI_VE_MODUL_KILAVUZU.md` (132 satır) güncel ekranlarla hizalanır.
- [ ] Yardım araması Türkçe karakter ve eşanlamlı sözcüklerle çalışır.

**K7 kabulü:** Yeni müşteri, yardım merkezi dışında hiçbir kaynağa bakmadan
kayıt → ürün → fatura → e-fatura gönderimi zincirini tamamlar.

---

## 9. MÜŞTERİ TESLİM (kabul kapısı K8)

- [ ] Pilot firma verisi doğrulandı, demo verisi canlıya karışmıyor.
- [ ] Canlı `tenantId` doluluğu %100 (boş kayıt kalmadı).
- [ ] Dönem sonu bilanço değişmez: **Aktif = Pasif + Öz Kaynak, Fark = 0,00 TL.**
- [ ] Hızlı Bilişim production kullanımı **yalnız** tüm QA PASS olduktan sonra,
      ayrı onay fazıyla açılır. Test modu (`econnecttest`) korunur.
- [ ] Kontör tüketen işlemler test aşamasında çalıştırılmaz.
- [ ] Canlı smoke: giriş, fatura listesi, stok, cari, rapor — gerçek tarayıcıyla.

**K8 kabulü:** Pilot firma kullanıcısı canlıda kesintisiz çalışır; hiçbir raporda FAIL yok.

---

## 10. YASAKLAR

- Canlı Hızlı Bilişim'e onay fazından önce belge göndermek.
- API hatasında sahte/simüle başarılı response üretmek.
- Mevcut muhasebe/stok/KDV mantığını değiştirmek.
- Credential'ları kaynak koda yazmak veya sohbete dökmek.
- Başarısız testi PASS göstermek.
- **Bu prompttaki K1 ve K2 kapıları yeşil olmadan `df44a41`'i push etmek.**

---

## 11. RAPORLAMA

Her faz sonunda: ölçülen değer, beklenen değer, hüküm (PASS/FAIL), kanıt (dosya/sha/çıktı).
FAIL gizlenmez, gerekçesiyle yazılır. "Çalışıyor gibi görünüyor" ifadesi kullanılmaz —
**gerçek çıktı** gösterilir.

**Nihai hüküm cümlesi şu biçimde olur:**
> Faz X: K1 PASS / K2 FAIL / K3 PASS … — engel: <varsa> — sonraki adım: <ne>.
