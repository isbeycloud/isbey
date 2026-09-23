# FAZ 25.3 — SİSTEM FİNALİZASYON SPRINT RAPORU

**Tarih:** 2026-09-08
**Kapsam:** docs/14 planındaki A–G alt fazları + 25.2-B registry migration (B-2/B-3/B-4)
**Durum:** ✅ A–F + registry migration TAMAMLANDI — 140/140 regresyon PASS, canlı veri dokunulmadı

---

## 1. Yönetici Özeti

FAZ 25.3 sprinti, docs/14 planına göre yürütüldü. Altı alt faz (Fatura Tasarım Motoru,
Rapor Tasarım Merkezi, Dashboard yenileme, Menü sadeleştirme, FAB + Ctrl+K, Mobil uyum)
ve 25.2-B'den bekleyen registry migration adımları (B-2/B-3/B-4) tamamlandı.
Önemli mimari sonuç: **permission/rol tanımlarının tek kaynağı artık
`server/security/` registry'sidir** — storage seed ve 57 route çağrısı bu kaynaktan
türetilir; frontend için üretim hattı (permission-map snapshot) kuruldu.

> Regresyon sonucu: **140/140 PASS** (Registry 26 + SecurityGate 43 + İzolasyon 7 +
> 25.2-A 19 + FAZ 19 45). Kritik veri: `D:\İŞBEY\data\database.json` hiç okunmadı
> bile (testler izole /tmp kopyasında koştu) — canlı veri riski sıfır.

---

## 2. Alt Faz Sonuçları

| Alt faz | İçerik | Teslim | Durum |
|---------|--------|--------|-------|
| 25.3-A | Fatura Tasarım Motoru (invoiceDesigns backend + InvoiceDesignTab + PrintModal entegrasyonu) | src/components/modules/ayarlar/, server/routes/invoice-designs.ts, src/services/api.ts | ✅ |
| 25.3-B | Rapor Tasarım Merkezi (ReportDesignerView + report-designs backend + reportDataLoader/reportBuilderTypes) | src/components/modules/raporlar/, server/routes/report-designs.ts | ✅ |
| 25.3-C | Dashboard yenileme (Hızlı İşlemler + Bekleyen İşler & Son İşlemler + rol filtreli kısayollar) | src/components/modules/dashboard/DashboardView.tsx | ✅ |
| 25.3-D | Menü sadeleştirme + rol bazlı başlangıç ekranları (MUHASEBE grupları birleştirildi, SATIS/KASA/RAPOR initial view) | src/utils/modulePermissions.ts (matris DOKUNULMADI) | ✅ |
| 25.3-E | "+Yeni" FAB (QuickActionFab — yetki filtreli) + Header'da mevcut Ctrl+K rozeti doğrulandı | src/components/common/QuickActionFab.tsx | ✅ |
| 25.3-F | Mobil uyum (hamburger menü + overlay, tek kolon gridler, dokunmatik FAB 56px, ribbon/scroll düzeltmeleri) | Header.tsx, Sidebar.tsx, AppContext.tsx, index.css | ✅ |
| 25.3-G | Final regresyon + bu rapor | docs/15 | ✅ (bu doküman) |

## 3. Registry Migration (25.2-B B-2/B-3/B-4 — onaylı)

| Adım | Önce | Sonra | Test |
|------|------|-------|------|
| **B-2** Seed türetimi | storage.ts içinde 37 literal permission + 4 literal rol matrisi | `PERMISSION_CATALOG` / `ROLE_DEFINITIONS` / `ROLE_PERMISSIONS` registry'den türetilir; seed'de literal permission tanımı 0 | Registry §3: 6/6 |
| **B-3** Route sabitleri | 57 literal `requirePermission('...')` / 14 dosya | `requirePermission(PERMISSIONS.X_Y)` — PERMISSIONS authGuards'tan re-export (tek import noktası) | Registry §2: %100 uyum |
| **B-4** Frontend hattı | (yok) | `server/scripts/generatePermissionMap.mjs` → `src/generated/permission-map.json` (49 kod, 5 rol); güncellik testi Registry §6 ile zorunlu | Registry §6: 3/3 |

**Davranış garantisi:** Seed'in DB'ye yazdığı kod kümesi ve rol matrisleri BİREBİR korundu
(37 katalog kodu, perm-1..37 id şeması; accountant=20 / employee=11 / viewer=9;
company_admin = tüm − tenants.manage). Resmileştirilen 7 kod ve rezerve 5 kod
(accounting.*, backup.manage) DB'ye YAZILMAYA DEVAM ETMEZ — rezerve kodlar hâlâ
hiçbir route'a bağlı değildir (test zorunlu tutuyor).

**Not — Registry Consistency Test v2:** B-2 ile seed literal'leri kalktığı için testin
§3/§4 bölümleri eski "seed literal eşleştirme" yönteminden "registry türetim kanıtı"
yöntemine güncellendi (literal yokluğu + SEED_CATALOG_CODES birebirliği + referans
sayılar). 17 test → 26 test oldu; testin KABUL KRİTERLERİ değişmedi, kanıt yöntemi
yeni mimariye uyarlandı.

---

## 4. Test Sonuçları — 140/140 PASS

| Suit | Test | Sonuç |
|------|------|-------|
| FAZ 25.2-B Registry Consistency (v2, B-2/B-3/B-4 sonrası) | 26 | ✅ 26/26 |
| FAZ 25.1 Security Gate | 43 | ✅ 43/43 |
| FAZ 25.1 İzolasyon | 7 | ✅ 7/7 |
| FAZ 25.2-A Authorization | 19 | ✅ 19/19 |
| FAZ 19 Negatif Erişim (4719) | 45 | ✅ 45/45 |
| **TOPLAM** | **140** | **✅ 140/140 PASS** |

**Canlı smoke test (B-3 sonrası davranış kanıtı):** report-designs 7/7 — token'sız 401,
POST 201 (tenantId token'dan), GET 200, PUT 200, whitelist dışu dataSource 400
("veri kaynağı zorunlu"), DELETE 200/tekrar 404; invoice-designs ilk kayıt isDefault:true.

**Öğrenilen not:** 25.2-A suiti idempotent değil (`crmtest1`, `satis262a` kullanıcılarını
oluşturur). Kalan data ile koşturulursa 409 nedeniyle 2 sahte FAIL üretir — temiz data
diziniyle koşulmalı (dokümante edildi; test dosyası bilinçli değiştirilmedi).

---

## 5. Değişen Dosyalar (25.3-E registry migration kısmı)

```
server/security/permissions.ts        → +PERMISSION_CATALOG (37 girdi meta) + SEED_CATALOG_CODES
server/db/storage.ts                  → seedDefaultRolesAndPermissions registry türevli (B-2)
server/middleware/authGuards.ts       → export { PERMISSIONS } re-export (B-3)
server/routes/v1/*.ts (14 dosya)      → 57 literal → PERMISSIONS sabiti (B-3)
server/scripts/generatePermissionMap.mjs → YENİ: registry → frontend snapshot (B-4)
src/generated/permission-map.json     → YENİ: üretilen snapshot (49 kod / 5 rol)
server/tests/faz252bPermissionRegistryTest.mjs → v2 (17 → 26 test)
```

25.3 A–F kısmı: bkz. §2 tablodaki dosya listesi + `docs/14` plan.

---

## 6. Kalan İşler

| Adım | İçerik | Durum |
|------|--------|-------|
| 25.3-C+ | Modül kalite kontrolü (Cari/Stok/Satış/Finans UX yüzeyi) | ⏳ sırada |
| 25.3-F+ | UX yüzeyi (bildirim merkezi, yardım ipuçları, boş ekranlar, insanlaştırılmış hatalar) | ⏳ sırada |
| 25.3-G/H | Performans denetimi + Prod hazırlık kontrol listesi | ⏳ sırada |
| 25.2-C | Resource Ownership Hardening (74 IDOR noktası → policies.ts bağlama) | planlı |
| Canlı Hızlı Bilişim | QA PASS koşulu sağlanmadan AÇILMAZ (CLAUDE.md Kural 1) | değişmedi |
