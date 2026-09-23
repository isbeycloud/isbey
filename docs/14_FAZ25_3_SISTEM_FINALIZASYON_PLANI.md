# FAZ 25.3 — SİSTEM FİNALİZASYONU PLANI (Fatura + Rapor + Genel UX)

**Tarih:** 2026-09-08
**Kapsam:** Onaylı FAZ 25.3 — sistem genel UX/UI düzenlemesi + fatura/rapor tasarım modülleri
**Uygulama modeli:** Tek onayla 7 alt faz; her alt faz sonunda bir 25.2-B migration adımı (B-2/B-3/B-4 paralel)
**Durum:** 🔄 UYGULANIYOR

---

## 1. Varsayımlar (onaylanmamış, makul kabul)

| # | Varsayım | Gerekçe |
|---|----------|---------|
| V1 | Fatura tasarım verisi backend'de `invoiceDesigns` koleksiyonu + frontend localStorage fallback ile tutulur; mevcut `company.documentSettings` akışı **bozulmaz** | SettingsView mevcut docSettings'i kullanıyor; geriye dönük uyumluluk şart |
| V2 | 6 hazır temadan 5'i mevcut `InvoiceTemplates.tsx` bileşenlerine sarılır (Kurumsal→Corporate, Minimal→Classic, Modern→Modern, E-Ticaret→Compact, Resmi Evrak→Professional); "Özel" yeni konfigüre edilebilir şablon | Kod tekrarı önlenir; mevcut testler bozulmaz |
| V3 | Yeni backend route `invoice-designs.ts` + `report-designs.ts` FAZ 25.2-A konvansiyonuna uyar: `requireAuth` + tenantId YALNIZCA token'dan | CLAUDE.md kuralı; IDOR eklenmez |
| V4 | Rol bazlı ekranlar mevcut `getSidebarModulesForRole`/`getInitialViewForRole` üzerinden iyileştirilir; `MODULE_ACCESS_MATRIX` **değiştirilmez** | RBAC kuralları (CLAUDE.md §2) dokunulmaz |
| V5 | Ctrl+K zaten mevcut (`CommandPaletteModal`) — yalnız Header ipucu + FAB entegrasyonu eklenir | Yeniden icat yok |
| V6 | Bu fazda canlı Hızlı Bilişim yok, deploy yok, migration yok — yalnız uygulama + test | Faz onay kapsamı |

---

## 2. Alt Faz A — Fatura Tasarım Motoru (öncelik 1)

### A1. Model + tema katmanı (YENİ dosya)
`src/components/templates/invoiceDesignConfig.ts`
- `InvoiceDesignConfig` tipi: `{ id, name, theme: 'CORPORATE'|'MINIMAL'|'MODERN'|'ECOMMERCE'|'OFFICIAL'|'CUSTOM', isDefault, accentColor, logoDataUrl?, companyHeader{show,title,subtitle}, showColumns{kod,aciklama,miktar,fiyat,kdv,iskonto}, sections{notes,stampSignature,paymentInfo}, customLayout?: fieldOrder[] }`
- `PRESET_THEMES`: 6 hazır tema tanımı (Varsayım V2)
- `DEFAULT_INVOICE_DESIGN`: sıfır kurulum değeri
- Alan yönetimi: `INVOICE_FIELDS` (sürükle-bırak sıralaması için id/label/alanTipi)

### A2. UI — InvoiceDesignTab (YENİ dosya)
`src/components/modules/ayarlar/InvoiceDesignTab.tsx`
- Sol: tema galerisi (6 kart) + kayıtlı tasarımlar listesi (varsayılan seç/yeniden adlandır/kopyala/sil)
- Orta: canlı önizleme (mevcut InvoiceTemplates bileşenleri + `sampleInvoicePayload` SettingsView'dan taşınır)
- Sağ: özellik paneli — logo yükleme (dataURL), renk seçici, alan göster/gizle + sürükle-bırak sıralama (formdesigner `useFormHistory` deseni referans)
- `SettingsView.tsx` değişimi: `activeTab` union'a `'INVOICE_DESIGN'` eklenir, buton + render eklenir (şablon/sekme yapısı korunur)

### A3. Backend + yazdırma
`server/routes/invoice-designs.ts` (YENİ)
- `GET /` `POST /` `PUT /:id` `DELETE /:id` `POST /:id/set-default`
- `router.use(requireAuth)`; tenantId = `req.tenantId` (token); `db/storage.ts`'e `invoiceDesigns: InvoiceDesignRecord[]`
- `server/index.ts` mount: `app.use('/api/invoice-designs', ...)`
- `src/services/api.ts`: `getInvoiceDesigns / saveInvoiceDesign / deleteInvoiceDesign / setDefaultInvoiceDesign`
- Yazdırma: `PrintModal`/`InvoiceListView` aktif tasarımı çeker (fallback: DEFAULT_INVOICE_DESIGN)

**Test (A):** faz253InvoiceDesignTest.mjs — API CRUD + default flag tenant bazlı + auth yoksa 401 + "token'sız tenantId" reddi (25.2-A kalıbı)

---

## 3. Alt Faz B — Rapor Tasarım Merkezi (öncelik 2)

`src/components/modules/raporlar/ReportDesignerView.tsx` (YENİ)
- Rapor şablonları: ad + veri kaynağı (satış/alış/cari/kasa/stok/KDV) + KPI seçimi
- Alan seçici: ☑ tarih, cari, ürün, KDV, personel, bölge, depo
- Grafik tasarım: bar/line/donut seçimi (mevcut Chart.js altyapısı)
- Filtre yönetimi: tarih aralığı/cari/stok filtre tanımları
- Kolon yönetimi: göster/gizle + sırala
- Dashboard tarzı önizleme: KPI kartları + mini grafik (örn. "SATIŞ RAPORU ₺1.250.000 ↑ %18")
- PDF çıktı: window.print + print CSS; Excel: mevcut ImportWizard karşıtı export deseni
- Backend: `server/routes/report-designs.ts` (YENİ — A3 ile aynı güvenlik konvansiyonu) + AppView'a `'rapor-tasarimci'` + App.tsx case + modulePermissions matris/erisim kontrolü (admin+company_admin+muhasebe)

**Test (B):** faz253ReportDesignTest.mjs — CRUD + tenant izolasyonu + auth

---

## 4. Alt Faz C — Dashboard Yenileme

`DashboardView.tsx` revizyonu (mevcut 736 satır; içerik korunur, yenileri eklenir):
- **Hızlı İşlemler** şeridi (YENİ `dashboard/QuickActions.tsx`): Yeni Fatura / Yeni Cari / Tahsilat / Ödeme / Rapor — `canAccessModule` ile yetkiye göre filtrelenir; Tahsilat/Ödeme mevcut `setIsFastCollectionOpen/setIsFastPaymentOpen` modallarını açar; Yeni Fatura→satis, Yeni Cari→cari (yeni kayıt modalı), Rapor→raporlar
- **Özet Kartları** (YENİ `dashboard/SummaryCards.tsx`): Ciro (thisMonthSales), Alacak (totalReceivables), Borç (totalPayables), Stok (criticalProducts sayısı), KDV (monthlyTrends'ten hesap — backend değişikliği YOK)
- **Son İşlemler + Bekleyen İşler** (YENİ `dashboard/PendingItems.tsx`): overdueCustomers + criticalProducts mevcut verisinden; "vadesi geçen tahsilat", "kritik stok" öğeleri

**Test (C):** render mantığı statik inceleme + mevcut FAZ testlerinde dashboard regresyonu

---

## 5. Alt Faz D — Menü Sadeleştirme + Rol Bazlı Ekranlar

`src/utils/modulePermissions.ts` — `getSidebarModulesForRole` içerik güncellemesi:
- MUHASEBE: Fatura → Cari → Banka → Rapor (mali-musavir ana ekranı korunur)
- SATIS: Müşteri → Teklif → Sipariş (dashboard + raporlar kalır)
- DEPO (PERSONEL varsayılanı): Stok → Sevkiyat (irsaliye) → Sayım (stok)
- `getInitialViewForRole`: MUHASEBE→mali-musavir (koru), SATIS→cari, KASA→kasa, RAPOR→raporlar
- `MODULE_ACCESS_MATRIX` ve backend RBAC **dokunulmaz** (Varsayım V4)

---

## 6. Alt Faz E — UX: FAB "+Yeni" + Ctrl+K ipucu

- `src/components/common/QuickActionFab.tsx` (YENİ): sağ alt sabit "+Yeni" FAB; açılınca Fatura/Tahsilat/Sipariş/Cari (yetkiye göre); App.tsx'e eklenir (form-designer dışında)
- `Header.tsx`: Ctrl+K arama ipucu rozeti (mevcut CommandPaletteModal'a yönlendirir)

---

## 7. Alt Faz F — Mobil Uyum

`src/index.css` @media (max-width:768px) genişletme:
- Sidebar → overlay + hamburger (Header'a hamburger butonu; Sidebar `isMobileOpen` prop)
- Özet kartlar tek kolon; FAB dokunmatik 56px; tablolar yatay kaydırma
- Mevcut `MobileAppView` korunur (bu faz kapsamı dışı derin değişiklik yok)

---

## 8. Alt Faz G — Final Regresyon + Rapor

- Tüm suitler: 25.1 gate (43) + izolasyon (7) + 25.2-A (19) + 25.2-B (17) + FAZ 19 (45) + 25.3 yeni (A+B)
- Kalite kontrol listesi: UI kontrolü, responsive, yetki, PDF/Excel, yazdırma, logo/kaşe, demo veri temizliği notu
- `docs/15_FAZ25_3_SISTEM_FINALIZASYON_RAPORU.md` + memory güncelleme

---

## 9. Paralel 25.2-B Migration Adımları (onaylı: her alt faz sonunda biri)

| Adım | İçerik | Bağlı alt faz |
|------|--------|----------------|
| B-2 | storage seed → registry türetimi (duplicate tanım sıfırlanır) | A sonrası |
| B-3 | 57 requirePermission noktası → PERMISSIONS sabitleri + authGuards slug bağlantısı | C/D sonrası |
| B-4 | Frontend matrisi registry'den üretim (generate-permission-map) | F sonrası |

**Not:** Yeni route'lar (invoice-designs, report-designs) B-3'te registry kodlarına bağlanır; bu fazda `requirePermission('company.update')` / `requirePermission('reports.view')` gibi **mevcut katalogda tanımlı** kodlar kullanılır — rezerve kod (accounting.* / backup.manage) BAĞLANMAZ.

## 10. Dokunulmayan Dosyalar

- server/security/* (yalnız B-2/B-3/B-4 adımlarında, onaylı kapsamda)
- Muhasebe/Stok/KDV/Cari/Cash/Bank mantığı ve DB şeması (CLAUDE.md §3)
- Hızlı Bilişim modülü, .env, mevcut test suitlerinin iddiaları
