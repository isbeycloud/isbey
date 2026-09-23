# İŞBEY CLOUD — FAZ 25.2 AUTHORIZATION HARDENING PLAN v1

**Tarih:** 2026-09-08
**Durum:** ANALİZ — kod değişikliği YAPILMADI (plan onaya sunuluyor)
**Önceki faz:** FAZ 25.1 (default deny + IDOR) — 95/95 PASS, docs/10
**Bu sprintin sorusu:** "Kullanıcı sisteme girebiliyor ama içeride ne kadarını görmeli/giderebilmeli?"

> **Beyan (tasarım artefaktı):** Önceki oturumda `server/middleware/moduleGate.ts` adlı bir
> taslak dosya oluşturulmuştur. Bu dosya **hiçbir router'a veya middleware zincirine
> bağlanmamıştır; çalışma zamanı etkisi SIFIR'dır.** Bu raporda "uygulanmış güvenlik
> katmanı" olarak DEĞİL, Sprint 25.2-B için hazır tasarım taslağı olarak değerlendirilir.

---

# 1. PERMISSION REGISTRY ENVANTERİ

## 1.1 Roller (3 ayrı katmanda tanımlı — tutarlılık analizi aşağıda)

| Katman | Tanım yeri | Değerler |
|--------|-----------|----------|
| Platform rolü (User.role) | db/schema.ts `UserRole` | SUPER_ADMIN, ADMIN, COMPANY_ADMIN, MUHASEBE, SATIS, KASA, RAPOR, employee |
| Tenant rolü (TenantUser.roleSlug) | storage.ts migrateTenantUsers | platform_admin, company_admin, accountant, employee, viewer |
| Kullanıcının soruda saydığı adlar | — | SUPER_ADMIN ✓, PLATFORM_ADMIN = ADMIN (kodda ayrı rol yok), COMPANY_ADMIN ✓, USER = employee/SATIS |

**Not:** Kodda `PLATFORM_ADMIN` adında ayrı bir enum değeri yoktur; platform operasyonu
`ADMIN` rolüyle yapılır. `USER` karşılığı `employee` (personel/satış) slug'ıdır.
Aşağıdaki matrisler kod gerçeklerine göre ADMIN ve employee adlarıyla verilmiştir.

## 1.2 Permission Katalogu (storage.ts seed — `state.permissions`)

Katalog 32 koddan oluşur. Kullanım durumu (route'larda `requirePermission()` ile
referans edilip edilmediği) son sütunda:

| Permission | Modül | Kullanıldığı yer | Durum |
|------------|-------|------------------|-------|
| customers.view | CARI | v1/customers.ts (3 uç) | Var |
| customers.create | CARI | v1/customers.ts | Var |
| customers.update | CARI | v1/customers.ts | Var |
| customers.delete | CARI | v1/customers.ts | Var |
| products.view | STOK | v1/products.ts (4 uç) | Var |
| products.create | STOK | v1/products.ts | Var |
| products.update | STOK | v1/products.ts (2 uç) | Var |
| products.delete | STOK | v1/products.ts | Var |
| warehouses.view | STOK | v1/products.ts | Var |
| warehouses.update | STOK | v1/products.ts | Var |
| invoices.view | FATURA | v1/invoices.ts (2 uç) | Var |
| invoices.create | FATURA | v1/invoices.ts, v1/checkout.ts | Var |
| invoices.update | FATURA | — (yalnızca katalog) | **Kullanılmıyor** |
| invoices.delete | FATURA | v1/invoices.ts | Var |
| invoices.send | FATURA | v1/invoices.ts | Var |
| quotes.view | TEKLİF | v1/quotes.ts (2 uç) | Var |
| quotes.create | TEKLİF | v1/quotes.ts | Var |
| quotes.update | TEKLİF | v1/quotes.ts | Var |
| quotes.delete | TEKLİF | — (yalnızca katalog) | **Kullanılmıyor** |
| waybills.view | İRSALİYE | v1/waybills.ts | Var |
| waybills.create | İRSALİYE | v1/waybills.ts (3 uç) | Var |
| waybills.update | İRSALİYE | — (yalnızca katalog) | **Kullanılmıyor** |
| waybills.delete | İRSALİYE | — (yalnızca katalog) | **Kullanılmıyor** |
| cash.view | FINANS | v1/cash.ts (2 uç) | Var |
| cash.create | FINANS | v1/cash.ts (2 uç), v1/collections | Var |
| cash.update | FINANS | — (yalnızca katalog) | **Kullanılmıyor** |
| cash.delete | FINANS | — (yalnızca katalog) | **Kullanılmıyor** |
| expenses.view | GİDER | — | **Kullanılmıyor** |
| expenses.create | GİDER | — | **Kullanılmıyor** |
| expenses.update | GİDER | — | **Kullanılmıyor** |
| expenses.delete | GİDER | — | **Kullanılmıyor** |
| reports.view | RAPORLAR | v1/reports.ts (3 uç) | Var |
| users.view | YÖNETİM | — | **Kullanılmıyor** (users.ts requireRole kullanıyor) |
| users.create | YÖNETİM | — | **Kullanılmıyor** |
| users.update | YÖNETİM | — | **Kullanılmıyor** |
| users.delete | YÖNETİM | — | **Kullanılmıyor** |
| company.view | AYARLAR | v1/checkout.ts, hizli-bilisim.ts (3 uç) | Var |
| company.update | AYARLAR | v1/checkout.ts (2 uç) | Var |
| tenants.manage | PLATFORM | — | **Kullanılmıyor** (tenants.ts requireRole kullanıyor) |
| einvoice.view | E-DÖNÜŞÜM | e-documents.ts (7 uç), e-invoice-settings.ts (4 uç) | Var (katalogda tanımlı, yukarıda sayılmadı) |

**Özet:** 122 requireRole/requirePermission kullanımı 26 dosyada. requirePermission
yalnızca v1 çekirdek dosyalarda (customers, products, invoices, quotes, waybills, cash,
reports, e-documents, e-invoice-settings, checkout, banks, collections, financial-transactions,
orders). requireRole 4 desende yoğunlaşmış: (SUPER_ADMIN,ADMIN) ×23, (SA,A,CA) ×12,
(SUPER_ADMIN) ×3, (SA,A,platform_admin) ×1.

## 1.3 Katalogda Hiç Olmayan ama Planlanan Kodlar

| Planlanan kod | Gerekçe (kullanıcı brief'inden) | Mevcut eşdeğer |
|---------------|--------------------------------|----------------|
| accounting.view/create/approve/delete | Muhasebe işlemleri eylem bazlı ayrılmalı | invoices.* / cash.* kısmen karşılıyor; "approve" kavramı YOK |
| reports.export | Rapor dışa aktarma sınırı | YOK (export uçlarında permission yok) |
| role.assign | Rol atama yükseltme yasağı | YOK (kod içi canAssignRole mantığı yalnızca users.ts'te — FAZ 25.1) |
| settings.manage | Ayarlar ayrımı | company.view/update kısmen karşılıyor |

---

# 2. ROL MATRİSİ

## 2.1 Rol Risk Profili

| Rol (kod adı) | Açıklama | Risk | Not |
|----------------|----------|------|-----|
| SUPER_ADMIN | Sistem sahibi | Çok yüksek | impersonation, tüm tenant'lar, tüm permission'lar |
| ADMIN (= PLATFORM_ADMIN) | Platform operasyonu | Yüksek | SUPER_ADMIN ile neredeyse aynı; impersonation YOK (yalnız SUPER_ADMIN) |
| COMPANY_ADMIN | Firma yöneticisi | Orta | kendi şirketi; users/ayarlar; platform modülleri kapalı |
| MUHASEBE (accountant) | Mali müşavir | Orta | çoklu şirket (allowedCompanyIds); finans+yazma geniş |
| SATIS (employee/sales) | Satış temsilcisi | Düşük | satış akışı; delete yasak (frontend hasPermission) |
| KASA | Kasa operasyonu | Düşük | tahsilat/ödeme; delete yasak |
| RAPOR (viewer) | Salt okunur | Çok düşük | view/print/export yalnız (frontend) |
| employee (genel USER) | Personel | Düşük | tenantUser.employee permission seti dar |

## 2.2 Yetki Matrisi (kodun bugünkü GERÇEK davranışı)

| Yetki alanı | SUPER | ADMIN | COMPANY | MUHASEBE | SATIS | KASA | RAPOR |
|-------------|:-----:|:-----:|:-------:|:--------:|:-----:|:----:|:-----:|
| tenants.manage (tüm şirketler) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| impersonation | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| users.read (tüm tenant'lar) | ✅ | ✅ | ✅* | ❌ | ❌ | ❌ | ❌ |
| users.create | ✅ | ✅ | ✅* | ❌ | ❌ | ❌ | ❌ |
| role.assign üst seviye (SUPER/ADMIN verme) | ✅ | ✅ | ❌ (25.1'de kapatıldı) | ❌ | ❌ | ❌ | ❌ |
| settings.read / settings.write | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ ⚠️ |
| settings.backup | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ ⚠️ |
| invoices.view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| invoices.create/update/delete | ✅ | ✅ | ✅ | ✅ | ✅(view/create)⚠️ | ✅(create)⚠️ | ⚠️ |
| raporlar (reports.view) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| rapor EXPORT sınırı | — | — | — | — | — | — | — ⚠️ |

`*` = FAZ 25.1'de tenant izolasyonu eklendi (COMPANY_ADMIN yalnız kendi şirketi).
`⚠️` = riskli/belirsiz — 3. bölümdeki boşluk analizinde detaylandırılıyor.

**Kritik tutarlılık notu:** Rol yetkileri ÜÇ farklı kaynakta farklı şekillerde tanımlı:
1. `modulePermissions.ts` (frontend) — RAPOR'u yalnız view kabul eder.
2. `storage.ts` role seed'leri (employee/viewer permission setleri) — granüler.
3. Sunucu route'ları — çoğunlukla rol kontrolü YOK (sadece auth).
Üçü aynı anda doğrulanmadığı sürece enforcement "parçalı"dır (bkz. §4).

---

# 3. ENDPOINT → PERMISSION BOŞLUK ANALİZİ

## 3.1 Kritik dosyalar (kullanıcının kontrol listesi) — mevcut durum

| Endpoint grubu | Mevcut Guard | Olması gereken (öneri) | Boşluk |
|----------------|--------------|------------------------|--------|
| GET/POST/PUT/DELETE /api/users | requireAuth + requireRole(SA,A,CA) + tenant izolasyonu (25.1) | users.view/create/update/delete + role.assign ayrımı | 🟡 role.assign ayrı permission değil; users.* kodları kataloğda var ama hiç requirePermission ile bağlanmadı |
| GET/POST /api/admin/users | GET: requireAuth (ROL YOK!) / POST-PUT: requireRole(SA,A,CA) | users.read admin varyantı + role.assign | 🔴 GET'te rol kontrolü yok → MUHASEBE/SATIS tüm kullanıcı listesini (tüm tenant) görebilir |
| PUT /api/admin/users/:id | requireRole(SA,A,CA) | canAssignRole + tenant kontrolü | 🔴 COMPANY_ADMIN: role+companyId+allowedCompanyIds+permissions body'den serbestçe atanabilir → **yetki yükseltme + tenant atlama** |
| /api/tenants (hepsi) | requireRole(SA,A) (25.1) | tenants.manage | 🟢 |
| /api/efatura/:id/xml | router.use(requireAuth+resolveTenant) + tenant filtresi | invoices.view | 🟡 filtre var ama permission yok |
| /api/reports (7 uç) | requireAuth (global) | reports.view | 🟡 |
| /api/search | requireAuth (global) | reports.view (ya da ayrı search.view) | 🔴 **tenant filtresi YOK** → tüm tenantların müşteri/ürün/faturası aranabilir |
| /api/settings (GET/PUT/backup) | requireAuth (global) | company.view/update + backup ayrı | 🔴 SATIS/KASA/RAPOR ayar okuyup değiştirebilir; backup herkese açık |
| /api/v1/* çekirdek (customers/products/invoices/quotes/waybills/cash/reports) | requireAuth + requirePermission granüler | (doğru model) | 🟢 referans model |
| /api/v1/advanced-reports, ai, ai-insights, document-ai | requireAuth (global) | reports.view / ai modül izni | 🟡 |
| /api/v1/accountant | requireAuth; tenantId query/body/header'dan | accountant mali-musavir izni; tenant token'dan | 🔴 IDOR deseni (mobile.ts'te kapatılanın aynısı) |
| /api/v1/mobile (25.1 sonrası) | requireAuth + token-tenant | (doğru model) | 🟢 referans model |

## 3.2 Tenant Ownership: istek girdisinden tenantId alan yerler (IDOR deseni)

`(req.query.tenantId || req.headers['x-tenant-id'] || 'tnt-isbey')` veya body varyantı —
26 dosyada 73 nokta (mobile.ts hariç — oradaki tek eşleşme yorum satırı; FAZ 25.1'de
kapatıldı). Dosya bazında: advanced-reports 4, ai 4, approvals 4, automations 6,
billing 4, developer 5, document-ai 4, field-collections 5, marketplace 3, pos 3,
tasks 3, visits 3, whitelabel 3, ai-insights 3, accountant 2, activity-logs 1,
bank-matching 2, client 1, devices 2, documents 3, messages 2, onboarding 2,
payment-links 2, promotions 1, support-faz8 2.

Bu desen, oturum açmış HERhangi bir kullanıcının (ör. SATIS) `?tenantId=tnt-kadikoy`
göndererek başka firmanın verisini okuyabilmesi demektir — FAZ 25.1'in mobil
bootstrap'ında kapatılan açığın 73 noktalı genel hali. **Sprint 25.2-C'nin ana iş kalemi.**

## 3.3 Resource Ownership (kaynak sahipliği)

- Ana ERP dosyalarında (invoices, customers, products) okuma/güncelleme uçlarında
  `resolveTenant` + `tenantId eşleşmesi` filtresi VAR (ör. customers.ts:44) — iyi.
- v1 çekirdekte ownership zaten tenant filtresiyle çözülüyor; SADECE tenant girdisi
  yukarıdaki 73 noktadan gelirse kırılıyor.
- Belge düzeyi sahiplik (kullanıcı bazlı: "sadece kendi oluşturduğunu görsün") hiçbir
  yerde uygulanmamış — MVP için tenant düzeyi yeterli kabul edilebilir, raporda not edildi.
- DELETE uçları: ana invoices DELETE tenant filtresiyle; v1/invoices DELETE
  `invoices.delete` permission'ı ile — tutarlı.

## 3.4 Export / Download uçları (veri sızıntısı yüzeyi)

| Uç | Guard | Boşluk |
|----|-------|--------|
| GET /api/efatura/:invoiceId/xml | requireAuth + tenant filtresi | invoices.view permission'ı yok |
| GET /api/v1/e-documents/:id/xml | requirePermission('einvoice.view') | 🟢 doğru model |
| GET /api/document-templates/sample-xml/:type | requireAuth | düşük risk (statik şablon) |
| GET /api/form-designs/:id/export | requireAuth (global) | 🟡 tasarım şeması sızar (tenant filtresi kontrol edilmeli) |
| POST /api/settings/backup | requireAuth (global) | 🔴 her rol DB yedeği (dosya) indirebilir |

## 3.5 Admin bypass noktaları

1. `requireRole` içinde `req.userRole === 'platform_admin'` kısayolu — tenantUser
   rolü platform admin'e çevrilmiş kullanıcı (SUPER_ADMIN olmayan) tüm role gate'lerini
   aşar. tenantUser.roleSlug'ı COMPANY_ADMIN değiştirebiliyorsa yükseltme vektörü.
2. `requirePermission` içinde COMPANY_ADMIN tam bypass (kod yorumuyla bilinçli) —
   granüler permission isteyen uçlarda COMPANY_ADMIN her şeyi yapabilir; kabul
   edilebilir ama matriste açıkça yazılmalı.
3. `requireService`/`checkLicenseStatus` içinde `tenant` bulunamazsa `next()` —
   lisans bypass'ı (fail-open).

---

# 4. PRIVILEGE ESCALATION ANALİZİ

## 4.1 Rol değiştirme desenleri

| Yer | Desen | Değerlendirme |
|-----|-------|---------------|
| server/routes/admin-users.ts:198 | `if (role) user.role = role as UserRole` | 🔴 **KRİTİK:** PUT guard'ı requireRole(SA,A,CA) ama `canAssignRole` kontrolü YOK. COMPANY_ADMIN, herhangi bir kullanıcıyı (kendi dahil) SUPER_ADMIN yapabilir; `companyId`/`allowedCompanyIds` de body'den serbest → tenant atlama + kalıcı platform admin yaratma. FAZ 25.1'de users.ts'e eklenen savunmanın admin-users.ts'te karşılığı yok. |
| server/routes/users.ts:134 | `if (role) user.role = role` | 🟢 25.1'de `canAssignRole` + tenant izolasyonu eklendi (referans model). |
| admin-users.ts POST / | requireRole(SA,A,CA) + role body'den | 🔴 Aynı boşluk: COMPANY_ADMIN platform rolüyle kullanıcı açabilir (yeni users.ts'te kapatılmıştı; admin-users.ts'te açık). |
| invitations.ts | roleSlug davet üzerinde | 🟡 davet kabul akışında rol atanır — COMPANY_ADMIN'in davetle üst rol verebilmesi kontrol edilmeli (Sprint 25.2-C). |

## 4.2 Tenant değiştirme girdileri

- 73 nokta (§3.2) — en büyük yüzey.
- `auth.ts switch-company` → yetki kontrolü VAR (SUPER/ADMIN/MUHASEBE/allowedCompanyIds) — 🟢.
- `tenants/:id/switch` → platform admin şartı (25.1) — 🟢.
- `admin-users.ts` PUT `companyId`/`allowedCompanyIds` body'den → 🔴 (4.1 ile birleşik).
- impersonation → yalnız SUPER_ADMIN + audit — 🟢 (bilinçli tasarım).

## 4.3 Export/download sızıntı yüzeyi

§3.4'teki tablo. En kritik: `POST /api/settings/backup` (tüm DB dump'ı, tüm roller erişebilir)
ve `GET /api/search` (tenant filtresiz tüm kayıtların başlık/bakiye gibi alanlarını
arayarak listeleyebilme). XML uçlarında tenant filtresi varsa da granüler permission
eksik (rapor rolü XML indirebilir — RAPOR read-only kuralının sunucu karşılığı yok).

## 4.4 Admin bypass zincirleri (kombinasyon analizi)

1. **COMPANY_ADMIN zinciri:** `PUT /api/admin/users/:id` (rol+company değiştir)
   → kendini SUPER_ADMIN yap → tüm platform. Tek istekle tam escalation. 🔴
2. **SATIS zinciri:** `GET /api/admin/users` (rol kontrolü yok) → tüm kullanıcı listesi
   (e-posta/telefon) → sosyal mühendislik malzemesi. 🟠
3. **Herhangi bir kullanıcı:** `/api/search` → tenant filtresi olmadan tüm firmaların
   cari/fatura verisini arama API'siyle sızmak. 🔴
4. **Herhangi bir kullanıcı:** `POST /api/settings/backup` → DB dosyasının tamamını
   (tüm tenantlar, bcrypt hash'leri dahil) indirmek. 🔴
5. **tenantUser.roleSlug manipülasyonu:** roles.ts güncelleme uçları requireRole'lu;
   ancak tenantUser rol atama ucu ayrı izinle korunmuyorsa platform_admin slug'ı
   atanabilir → requireRole/requirePermission kısayollarını aşar (4.4.1 bypass).
   Sprint 25.2-C'de kapatılacak.

---

# 5. ÜÇ LİSTE (istenen çıktı)

## 5.1 KRİTİK YETKİ AÇIKLARI (Critical — canlıya açılmadan önce KAPATILMALI)

| # | Bulgu | Yer | Etki |
|---|-------|-----|------|
| C1 | COMPANY_ADMIN → SUPER_ADMIN yükseltme (canAssignRole yok) + companyId/allowedCompanyIds/permissions body'den serbest | admin-users.ts PUT/:id (ve POST) | Tek istekle tam platform ele geçirme |
| C2 | Tenant filtresiz global arama | search.ts | Tüm tenant verisinin sızdırılması (IDOR-73'ün en kolay sömürülen üyesi) |
| C3 | Tenant girdisinden çözümlenen tenantId — 73 nokta / 26 dosya | v1/* (liste §3.2) | Oturum açmış her kullanıcı başka firmanın verisini okur/yazar |
| C4 | /api/settings/backup her role açık | settings.ts:90 | Tüm DB'nin (hash'ler dahil) tek istekle indirilmesi |
| C5 | GET /api/admin/users rol kontrolü yok (tüm tenant listesi) | admin-users.ts GET / | Kullanıcı PII sızıntısı |

## 5.2 EKSİK PERMISSION ENTEGRASYONLARI (High)

| # | Bulgu | Yer | Önerilen permission |
|---|-------|-----|---------------------|
| H1 | users.* kataloğu var ama hiç uçlara bağlı değil (requireRole ile el yapımı) | users.ts, admin-users.ts | users.view/create/update/delete + role.assign |
| H2 | Rapor uçlarında reports.view yok (ana /api/reports) | reports.ts | reports.view |
| H3 | Rapor/AI/advanced-reports/ai-insights/document-ai granulersiz | ai.ts, v1/ai*, v1/advanced-reports | reports.view / ai.view ayrımı |
| H4 | settings GET/PUT/backup granulersiz | settings.ts | company.view/company.update + settings.backup |
| H5 | invoices.update, quotes.delete, waybills.update/delete, cash.update/delete, expenses.* kodları kataloğda ama uçlara bağlı değil (uçlar korumasız AUTH-only: ana invoices PUT yok ama quotes/waybills/expenses/sync/checks/employees AUTH-only) | quotes.ts, waybills.ts, expenses.ts, checks.ts, employees.ts | requirePermission bağlanmalı |
| H6 | RAPOR read-only kuralı yalnızca frontend'de (hasPermission) — sunucuda RAPOR ile POST/DELETE yapılabilir (permission'sız AUTH-only uçlarda) | tüm AUTH-only uçlar | moduleGate (25.2-B) veya permission bağlama |
| H7 | efatura XML export'ta invoices.view yok | efatura.ts:35 | invoices.view |
| H8 | accountant uçlarında mali-musavir izni yok + IDOR | v1/accountant.ts | accountant.* + token-tenant |

## 5.3 İYİLEŞTİRME ÖNERİLERİ (Medium)

| # | Öneri | Not |
|---|-------|-----|
| M1 | requireService/checkLicenseStatus fail-open → fail-closed | tenant bulunamazsa 404 dönsün |
| M2 | requireRole'daki `req.userRole === 'platform_admin'` kısayolu kısıtlansın | tenantUser.roleSlug değişim izni ayrı denetlensin |
| M3 | Belge düzeyi sahiplik (createdBy) faturası | MVP sonrası; tenant düzeyi şu an yeterli |
| M4 | permission kataloğu ile route eşleşmesi CI testi (drift dedektörü) | yeni suit: her route'un guard'ı manifest'ten doğrulanır |
| M5 | Export uçlarına audit log + opsiyonel rate limit | FAZ 25.4 rate limit ile birleşir |
| M6 | invitations kabul akışında roleSlug beyaz listesi | davet eden COMPANY_ADMIN yalnız çalışan rolleri verebilsin |
| M7 | moduleGate.ts taslağı 25.2-B'de resmileştirilip bağlanır | tasarım artefaktı → canlı katman |

---

# 6. SPRINT UYGULAMA PLANI (onaya sunuluyor)

> Sıralama risk odaklı: önce escalation + sızıntı (Critical), sonra enforcement (High),
> en son regresyon ağı. Her sprint: uygula → izole test → tam regresyon → değişen
> dosya listesi + risk raporu. Canlıya deploy YOK.

## Sprint 25.2-A — Permission Registry (kod: yeni dosyalar, davranış değişikliği minimal)

1. `server/middleware/permissions.ts` — katalog single-source-of-truth:
   USER_READ/USER_CREATE/USER_DELETE/USER_ASSIGN_ROLE, REPORT_VIEW/REPORT_EXPORT,
   ACCOUNTING_VIEW/ACCOUNTING_CREATE/ACCOUNTING_APPROVE/ACCOUNTING_DELETE,
   SETTINGS_VIEW/SETTINGS_UPDATE/SETTINGS_BACKUP, SEARCH_GLOBAL (yalnız platform)
   vb. Katalog 1.2'deki 32 kodla birleştirilir; eksikler (role.assign,
   accounting.approve, reports.export, settings.*) eklenir.
2. Rol→permission seed güncellemesi (storage.ts) — 8 platform rolü × katalog.
3. Endpoint→permission manifest (`server/config/endpointPermissions.ts`):
   route başına beklenen guard bildirilir (M4 drift testinin veri kaynağı).

## Sprint 25.2-B — Middleware Enforcement (C1, C5, H1-H6'nın yarıması)

1. `moduleGate.ts` taslağı permissions.ts'e bağlanarak canlıya alınır:
   AUTH-only 41 dosyaya (risky olanlar öncelikli) `router.use(requireAuth, moduleGate(...))`.
2. admin-users.ts: `canAssignRole` + tenant izolasyonu + companyId serbest atama
   yasağı (users.ts'teki 25.1 modeli kopyalanır) — C1 kapanır.
3. admin-users.ts GET /: requireRole(SA,A,CA) + tenant filtresi — C5 kapanır.
4. settings.ts: `moduleGate('ayarlar')` + backup için ayrı
   `requireRole(SUPER_ADMIN, ADMIN, COMPANY_ADMIN)` + audit log — C4'ün permission
   ayağı (C4 tam kapanışı backup'ı SA/A/CA'ya düşürür; istenirse yalnız platform'a).
5. search.ts: SATIS/KASA/RAPOR/employee kendi tenant'ı içinde arar; tenant-scope
   filtreleri tüm varlıklara uygulanır; cross-tenant arama platform admin'e özel — C2 kapanır.

## Sprint 25.2-C — Resource & Tenant Ownership (C3 + H8)

1. `resolveTenantStrict` middleware: `req.tenantId` YALNIZ token'dan; 73 noktada
   `(req.query.tenantId || x-tenant-id || default)` deseni tek tek token-tenant ile
   değiştirilir (mobile.ts 25.1 referans modeli). Dosya sırası (risk): accountant →
   billing/developer/marketplace/whitelabel/promotions (platform ailesi) →
   documents/payment-links/client/onboarding/devices → field-collections/visits/pos/
   tasks/messages/approvals/automations/ai* → advanced-reports/activity-logs/
   bank-matching/support-faz8.
2. efatura XML + form-designs export'a granüler permission + tenant kontrolü (H7).
3. invitations: roleSlug beyaz listesi (M6).
4. requireService/checkLicenseStatus fail-closed (M1).
5. platform_admin slug kısayolu denetimi (M2).

## Sprint 25.2-D — Security Regression: Authorization Matrix Test

1. Yeni suit `phase25_2AuthorizationMatrixTest.ts`:
   - 8 rol × kritik endpoint seti (~60 uç: tüm C1-C5 + H listesi + örneklem)
   - 0 privilege escalation hedefi (COMPANY_ADMIN→SUPER denemesi, cross-tenant
     okuma denemeleri, backup/xml/search erişim denemeleri)
   - Kullanıcı listesi `users.read` x COMPANY_ADMIN kendi şirketiyle sınırlı gibi
     pozitif senaryolar da dahil.
2. Tam regresyon: FAZ 25.1 (43+7) + FAZ 19 (45) + yeni suit → hepsi PASS.
3. Rapor docs/12: değişen dosya listesi + kapanan bulgu ID'leri (C1..C5, H.., M..)
   + kalan riskler.

## Başarı kriterleri (sprint kapanışında)

| Kontrol | Hedef |
|---------|-------|
| Endpoint permission map | Kritik 60 uç %100 manifest'e bağlı; tüm 170 uç envanterli |
| Yetki matrisi | Tek kaynak (permissions.ts) + rol seed'i senkron |
| Tenant izolasyonu | 73/73 IDOR noktası token-tenant'a taşınmış; matrix test PASS |
| Admin escalation | 0 (C1 kapanmış; matrix test kanıtlar) |
| Regression | FAZ 25.1 + FAZ 19 + yeni suit hepsi PASS |
| Canlı deployment | Yok (izole ortam; md5 bütünlüğü raporlanır) |

## Risk notları (ikinci denetim için)

- **Uyum etkisi:** search/settings/admin-users sıkılaştırması mevcut frontend
  akışlarını etkileyebilir (ör. SATIS'in settings sayfası 403 alır). Frontend
  `modulePermissions` matrisi zaten bu rolleri kısıtladığından UI tutarlı olmalı;
  yine de matrix testinde pozitif senaryolarla doğrulanacak.
- **MUHASEBE çoklu şirketi:** allowedCompanyIds akışında switch-company modeli
  korunmalı; strict tenant çözümlemesi bu akışı bozmamalı (test senaryosu eklenir).
- **performans:** moduleGate ek katmanı O(1); riski yok.
