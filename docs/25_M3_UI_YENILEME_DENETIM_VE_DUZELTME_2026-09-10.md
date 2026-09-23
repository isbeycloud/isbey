# İŞBEY — M3 UI Yenileme: Denetim ve Düzeltme Raporu (2026-09-10)

**Yapan:** Google Antigravity (kod) · **Denetim/düzeltme:** Claude (Opus-5)
**Kapsam:** `DashboardView.tsx` (yeni), `Sidebar.tsx`, `Header.tsx`, `index.css` (m3 bloğu), `.agents/rules/ui-design-system.md` (yeni)

---

## Özet

Antigravity'nin M3 yenilemesi görsel olarak istenen yönde ve **iş mantığına dokunmamış** (muhasebe/stok/cari/API uçları korunmuş, `npx tsc -b` temiz). Ancak denetimde **iki ciddi sorun** bulundu ve ikisi de düzeltildi:

1. **Dashboard uydurma finansal veri gösteriyordu** — CLAUDE.md'deki "API response'u uydurmak / simüle etmek" yasağıyla doğrudan çelişiyor.
2. **Mavi palet kayıtlı kararla çelişiyordu** — docs/22 §2.12'de "İŞBEY kırmızısı korunur, mockup'ın mavi paleti reddedildi" kararı kayıtlıydı. Kullanıcı onayı alınarak kırmızıya hizalandı.

---

## 1. Uydurma veri (KRİTİK — düzeltildi)

`DashboardView.tsx` sunum katmanında üretilmiş sabit iş verisi içeriyordu:

| Yer | Sorun |
|-----|-------|
| Satır 93-96 (eski) | `data?.kpis?.thisMonthSales \|\| 689450` — **`\|\|` tuzağı:** gerçek `0` falsy olduğu için yeni açılmış boş firma ₺689.450,00 gelir, ₺412.320,00 gider, ₺277.130,00 kâr görüyordu |
| Satır 105/118 (eski) | 12 aylık grafik verisi tamamen sabit. Oysa backend aynı yanıtta **gerçek** `monthlyTrends` gönderiyordu — kullanılmamıştı |
| Satır 187-248 (eski) | "Son Belgeler" tablosu uydurma: `A-2025-00123` fatura no, ABC Ltd. Şti. / XYZ Ticaret / DEF A.Ş. firma adları, tutarlar, tarihler |
| Satır 251-297 (eski) | "Son Aktiviteler" akışı uydurma: "Ziraat Bankası", "Ürün: Laptop", "Mart 2025" |
| Satır 396 (eski) | Sabit "12 Nisan 2025" (bugün 2026-09-10 — tarih de yanlış) |
| Satır 64 (eski) | Takvim 'Nisan 2025'e sabitlenmiş |
| KPI alt yazıları | Sabit "%12,5", "%8,3", "%18,7", "%6,7" değişim yüzdeleri |
| `totalDocuments` | Backend yanıtında **böyle bir alan yok** (`kpis`/`today`/`overdueCustomers`/`monthlyTrends` döner) → kart her zaman 48 gösterirdi |
| Header 657 | `user?.fullName \|\| 'Ahmet Demir'` |
| Header 653 | Avatar baş harfi fallback'i `'AD'` |
| Header 660 | Unvan fallback'i `'Yönetici'` |
| Sidebar 365 | Sabit saat: `{new Date().toLocaleDateString('tr-TR')} 10:24` |
| Sidebar 369 | Uydurma sürüm: `İŞBEY CLOUD ERP v2.0.0` (package.json'da `0.0.0`) |

### Uygulanan düzeltme

**Gerçek veri kaynakları:**
- KPI değerleri: `data.kpis.*` üzerinden, **`??` ile** (gerçek sıfır sıfır kalır).
- Grafik: `data.monthlyTrends` — backend'de zaten hesaplanan `gider` alanı yanıta eklendi (salt-okunur, hesap değişmedi) ve Gelir/Gider serileri gerçek veriden çiziliyor.
- "Son Belgeler": mevcut `GET /api/invoices` ucu (yeni uç açılmadı). Belge türü/durum eşlemeleri gerçek enum değerlerine göre yapıldı (`SALES`/`PURCHASE`/`RETAIL_POS`; `ACTIVE`/`CANCELLED`; `PAID`/`PARTIAL`/`UNPAID`).
- "Son Aktiviteler": `data.notifications` (gerçek sistem bildirimleri).
- Takvim: geçerli ay, gerçek ay gezinmesiyle (`ayDegistir`), "bugün" gerçek tarihe göre vurgulu.
- Tarih etiketi: `bugunEtiketi` (gerçek tarih, tr-TR).
- Düzenlenen belge sayısı: faturalar ucundan gelen gerçek kayıt sayısı; alt yazı "Kayıtlı fatura sayısı".
- Değişim yüzdeleri: son iki ayın **gerçek** değerlerinden hesaplanıyor (`aylikDegisim`); veri yetersizse "Karşılaştırma için yeterli veri yok".
- Grafik eksen tavanı sabitlemesi (1.000.000) kaldırıldı — veriye göre ölçeklenir.

**Dürüst boş/hata durumları:**
- Yükleniyor / "Bu dönem için finansal hareket bulunmuyor" / "Henüz kayıtlı belge yok." / "Şu anda bildirim yok."
- API hatasında `loadError` banner'ı: "Özet verileri alınamadı…" — hata sessizce varsayılan veriyle kapatılmıyor.

**Kullanıcı bilgisi:** Gerçek kullanıcıdan; yoksa nötr ("Merhaba,", "Kullanıcı", `'?'`) — uydurma isim/baş harf/unvan yazılmıyor.

**Ek düzeltme:** Takvimde **iki adet** gezinme düğmesi çifti vardı ve hiçbiri bağlı değildi (tıklanınca hiçbir şey olmuyordu) → tek çift bırakıldı ve gerçek ay gezinmesine bağlandı. Ayrıca `Math.random()` render anahtarı olarak kullanılıyordu (her render'da yeniden mount) → kararlı anahtara çevrildi.

---

## 2. Palet: mavi → İŞBEY kırmızısı (kullanıcı onayıyla)

Kullanıcı kararı: **kırmızı kalsın** (docs/22 §2.12'deki kayıtlı karar geçerli). Anlamsal info mavisi korunur.

| Dosya | Değişiklik |
|-------|-----------|
| `DashboardView.tsx` | KPI 1 ikon zemini, gelir grafik serisi + legend noktası, takvim "bugün" vurgusu, "Tümünü Gör" bağlantıları → marka kırmızısı / `var(--primary)` |
| `Sidebar.tsx` | Logo `Cloud` ikonu (2 yer), aktif menü öğesi zemini (`#EBF3FE`→`var(--primary-light)`) ve metin rengi (`#2563EB`→`var(--primary)`) |
| `Header.tsx` | Avatar arka planı `#7c3aed` (mor) → `var(--primary)` |
| `LiveQaTestScreen.tsx` | `var(--primary, #2563eb)` fallback'i → `#d12131` (fallback tokenla çelişiyordu) |
| `SupportView.tsx` | 4 adet mavi gradyan → marka kırmızısı gradyanı |
| `SetupWizard.tsx` | 2 adet mavi gradyan → marka kırmızısı gradyanı |
| `.agents/rules/ui-design-system.md` | Bölüm 2 yeniden yazıldı: marka rengi İŞBEY kırmızısı olarak zorunlu kılındı; mavi yalnız anlamsal info'ya indirildi. Grafik kuralı (gelir=kırmızı, gider=turuncu, eksen sabitlenmez) eklendi. |

**Korunan anlamsal mavi:** `--info` tokenları, `m3-pill-info` ("Bekliyor" rozeti), Header'daki bilgi ikonu. Bunlar marka değil **durum** rengidir.

---

## 3. Kural dosyasına eklenen bölüm

`.agents/rules/ui-design-system.md` → **Bölüm 7: Veri Dürüstlüğü — SAHTE VERİ YASAĞI.** İçerik:
- Sunum katmanında uydurma iş verisi üretilemez (rakam, belge no, firma adı, tarih, kullanıcı adı, sürüm, sabit yüzde).
- `||` tuzağı yasak — para/sayı alanlarında `??` kullanılır.
- Veri yoksa dürüst boş durum; API hatası gizlenmez.
- Eksik alan gerekiyorsa uydurmak yerine uça salt-okunur alan eklenir.
- Demo verisi gerekiyorsa sunum değil **veri** katmanında (seed) üretilir.

---

## 4. Doğrulama durumu

| Kontrol | Durum |
|---------|-------|
| İş mantığı / API uçları dokunulmadı | ✅ (backend'de yalnız `gider` alanı yanıta eklendi — hesaplama değişmedi) |
| Uydurma veri kaldı mı | ✅ `DashboardView`/`Sidebar`/`Header`'da tarandı: kalan yalnızca açıklama yorumları |
| Marka mavisi kaldı mı (dokunulan dosyalarda) | ✅ temiz (kalan mavi = anlamsal info) |
| `npx tsc -b` | ✅ **PASS** (Antigravity tarafından koşuldu; `DashboardView.tsx:794` parametre tipi TS7006 düzeltildi, exit code: 0) |

**Durum etiketi:** ✅ PASS — uygulandı, derleme kanıtı alındı (0 hata).

---

## 5. Kapsam dışı bırakılan (ayrı iş)

`src/` genelinde **192 adet** marka-mavi kullanımı 65 dosyada duruyor (RibbonBar, GlobalSearch, AccountantPortalView, DocumentTemplateDesigner, AcceptInvitePage vb.). Bu, Antigravity'nin dokunmadığı, projede önceden var olan yaygın bir kalıntıdır. Tek tek gözden geçirilmesi gereken ayrı bir temizlik kalemidir — bu oturumda yalnızca M3 yenilemesinin kapsamındaki dosyalar hizalandı.

---

## 6. Bu oturumda değişen dosyalar

| Dosya | Değişiklik |
|-------|-----------|
| `src/components/modules/dashboard/DashboardView.tsx` | Uydurma veri kaldırıldı; gerçek veri + boş/hata durumları; kırmızı palet; takvim gerçek ay; kullanılmamış importlar temizlendi |
| `server/routes/dashboard.ts` | `monthlyTrends` yanıtına `gider` alanı eklendi (salt-okunur) |
| `src/components/layout/Sidebar.tsx` | Logo + aktif öğe kırmızı; uydurma saat ve sürüm kaldırıldı |
| `src/components/layout/Header.tsx` | Avatar kırmızı; uydurma isim/baş harf/unvan fallback'leri kaldırıldı |
| `src/components/modules/yonetim/LiveQaTestScreen.tsx` | Fallback rengi marka kırmızısına çevrildi |
| `src/components/modules/support/SupportView.tsx` | 4 mavi gradyan → kırmızı |
| `src/components/modules/onboarding/SetupWizard.tsx` | 2 mavi gradyan → kırmızı |
| `.agents/rules/ui-design-system.md` | Palet bölümü kırmızıya hizalandı; Bölüm 7 (sahte veri yasağı) eklendi |
