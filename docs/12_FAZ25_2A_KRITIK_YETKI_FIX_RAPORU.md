# FAZ 25.2-A — KRİTİK YETKİ AÇIKLARI KAPATMA SPRINT RAPORU

**Tarih:** 2026-09-08
**Kapsam:** Onaylı Sprint 25.2-A (sadece P0/P1: C1, C2, C4, C5) — kod değişikliği
**Durum:** ✅ TAMAMLANDI — 114/114 test PASS, canlı veri bütünlüğü korundu

---

## 1. Yönetici Özeti

docs/11 analiz raporunda tespit edilen 5 kritik bulgudan 4'ü (C1, C2, C4, C5) bu sprintte
kapatıldı. C3 (73 IDOR noktası) onay gereği **düzeltilmedi** — kaynak envanteri
25.2-C girdisi olarak raporlandı (Bölüm 5).

| Bulgu | Açıklama | Durum |
|-------|----------|-------|
| C1 | admin-users.ts: COMPANY_ADMIN `PUT /:id` ile tek istekte kendini SUPER_ADMIN yapabiliyordu; companyId/allowedCompanyIds/permissions body'den serbest atanıyordu; şifreler düz metin saklanıyordu | ✅ KAPATILDI |
| C2 | search.ts: tüm sorgular tenant filtresiz — her kimlik tüm tenant verisini + platform verisini (firmalar, kullanıcılar, Hızlı Bilişim müşterileri) arayabiliyordu | ✅ KAPATILDI |
| C4 | POST /api/settings/backup her role açıktı (tüm DB dump'ı) | ✅ KAPATILDI — yalnızca SUPER_ADMIN |
| C5 | GET /api/admin/users yalnızca requireAuth'lu — tüm tenant PII sızıyordu | ✅ KAPATILDI — SUPER_ADMIN + ADMIN |
| C3 | IDOR deseni: tenantId'yi query/body/header'dan alma (74 nokta/27 dosya) | ⏸ 25.2-C — envanter Bölüm 5'te |

---

## 2. Değişen Dosyalar

### 2.1 `server/routes/admin-users.ts` (C1 + C5)

**Eklendi (yardımcılar, users.ts FAZ 25.1 deseni ile aynı):**
- `isPlatformAdmin(user)` — SUPER_ADMIN veya ADMIN (kodda PLATFORM_ADMIN diye ayrı rol yoktur)
- `canAssignRole(caller, role)` — platform yöneticisi olmayan SUPER_ADMIN/ADMIN atayamaz
- `isSameTenant(caller, targetCompanyId)` — hedef şirket kontrolü (companyId + allowedCompanyIds)
- `isPlatformAdminTarget(target)` — COMPANY_ADMIN platform yöneticisi kullanıcıya dokunamaz

**Uç bazında değişiklikler:**

| Uç | Eski | Yeni |
|----|------|------|
| `GET /` | requireAuth yalnız | + `requireRole('SUPER_ADMIN','ADMIN')` (C5) |
| `GET /:id` | requireAuth yalnız | + `requireRole('SUPER_ADMIN','ADMIN')` (C5) |
| `POST /` | COMPANY_ADMIN açık; `passwordHash: password` **düz metin**; companyId body'den serbest | + canAssignRole 403; hedef şirket = platform ise body, değilse çağıranın şirketi (body'den tenant seçimi kapatıldı); `allowedCompanyIds` serbest ataması kaldırıldı → `[targetCompanyId]`; **bcrypt.hashSync** |
| `PUT /:id` | role/companyId/allowedCompanyIds/permissions serbest atama (satır 198-203) | + canAssignRole 403 (rol); tenant izolasyonu; platform-admin hedef koruması; companyId/allowedCompanyIds/permissions **yalnızca platform yöneticisi** |
| `POST /:id/toggle-status` | COMPANY_ADMIN açık, tenant kontrolü yok | + tenant izolasyonu + platform-admin hedef koruması |
| `POST /:id/reset-password` | `user.passwordHash = newPassword.trim()` **düz metin** | + tenant izolasyonu + platform-admin hedef koruması + **bcrypt.hashSync** |
| `POST /:id/revoke-sessions` | (SA, A) | değişmedi |
| `DELETE /:id` | (SA, A), usr-1 korumalı | değişmedi |

**Not:** `GET /api/admin/users`'tan COMPANY_ADMIN çıkarıldı (onaylı C5 kararı). Frontend
etkisi doğrulandı: `api.getAdminUsers` hiçbir bileşenden çağrılmıyor (yalnızca api.ts'de
tanımlı); AdminPanelView/UserManagementTab/UserManagementModal `/api/users` kullanır
(FAZ 25.1'de RBAC'lı, COMPANY_ADMIN erişimi korunur); CompanyDetailModal `toggleUserStatus`
çağırır (bu uç COMPANY_ADMIN'de kalır, tenant izolasyonu eklendi).

### 2.2 `server/routes/search.ts` (C2)

- `searchRouter.use(requireAuth)` — arama artık kimlik doğrulamalı (önceden global
  defaultDeny yalnız 401 veriyordu; req.user/req.tenantId dolmuyordu).
- `inTenant(recordTenantId, tenantId)` yardımcısı — customers.ts konvansiyonu ile aynı:
  `c.tenantId === t || (!c.tenantId && t === 'tnt-isbey')` (legacy kayıtlar yalnız
  varsayılan tenant'ta görünür).
- tenantId **yalnızca token'dan** (`req.tenantId`); `req.query.tenantId` /
  `x-tenant-id` ASLA yetki kaynağı değildir (kullanıcı kuralı: "tek başına kullanıcı
  girdisi kabul edilemez").
- Tenant-scope uygulanan varlıklar: customers, products, invoices, waybills, quotes.
- Platform-verisi kategorileri (COMPANY/tenants, USER, SERVICE, HIZLI_CUSTOMER)
  **yalnızca platform yöneticilerine** (SUPER_ADMIN/ADMIN) açıldı.
- Expense şemasında tenantId alanı yok (bkz. Bölüm 6 Kalan Riskler) → varsayılan
  tenant dışındaki arayanlara gider sonucu **döndürülmez** (güvenli varsayılan).

### 2.3 `server/routes/settings.ts` (C4)

- `POST /api/settings/backup` → `requireAuth, requireRole('SUPER_ADMIN')`.
- Depoda başka backup/download ucu olmadığı doğrulandı (`routes/` + `routes/v1/` taraması).

### 2.4 `server/tests/faz252aAuthorizationTest.mjs` (YENİ — kalıcı test suiti)

19 test: C4 (4), C5 (4), C1 (5 — escalation, cross-tenant, normal akış), C2 (5).

**Mimari kısıt:** permission mimarisi değiştirilmedi (onay kuralı), yeni middleware
yazılmadı — mevcut `requireAuth`/`requireRole` katmanları kullanıldı.

---

## 3. Test Sonuçları

İzole ortam (/tmp/f25/server, ayrı DATA_DIR) — canlı veriye dokunulmadı.

| Suit | Test | Sonuç |
|------|------|-------|
| FAZ 25.2-A Authorization (YENİ) | 19 | ✅ 19 PASS / 0 FAIL |
| FAZ 25.1 Security Gate (regresyon) | 43 | ✅ 43 PASS / 0 FAIL |
| FAZ 25.1 İzolasyon (regresyon) | 7 | ✅ 7 PASS / 0 FAIL |
| FAZ 19 Negatif Erişim (regresyon, port 4719) | 45 | ✅ 45 PASS / 0 FAIL |
| **TOPLAM** | **114** | **✅ 114/114 PASS** |

**Canlı veri bütünlüğü:** `data/database.json` md5 = `36322a81e3b1519cfafc1ad674df03b3`
(sprint öncesiyle birebir aynı — değişiklik YOK).

**Denetim notu:** İlk smoke koşusunda (dağıtım hatası → eski kod çalıştı) COMPANY_ADMIN
escalation testi izole test DB'sinde usr-4'ü SUPER_ADMIN yaptı. İzole DB silinip taze
seed ile koşular tekrarlandı; bu olay canlı veriyi etkilememiştir (md5 kanıtı).

---

## 4. Onaylı Kabul Kriterleri Karşılaması

| Kriter | Hedef | Sonuç |
|--------|-------|-------|
| Privilege escalation | 0 | ✅ COMPANY_ADMIN → SUPER_ADMIN girişimi 403 |
| Cross-tenant search | 0 | ✅ firmaadmin yalnız kendi tenant verisini görür |
| Backup sadece admin | SUPER_ADMIN 200, diğerleri 403 | ✅ (A/COMPANY_ADMIN/MUHASEBE/anonim: 403) |
| Admin user list RBAC | SA/A 200, diğerleri 403 | ✅ |
| Regression PASS | mevcut suitler bozulmasın | ✅ 43+7+45 |
| Yeni auth testleri PASS | 19 | ✅ |

---

## 5. tenantId Kaynak Envanteri (C3 — 25.2-C GİRDİSİ, DÜZELTME YAPILMADI)

Kural hatırlatması (kullanıcı onayı): `req.user.tenantId` / `req.tenantId` (token)
**güvenli**; `req.query.tenantId`, `req.body.tenantId`, `req.headers['x-tenant-id']`
**tek başına yetki kaynağı kabul edilemez**.

Toplam **74 riskli referans / 27 dosya** (tümü `server/routes/v1/` altında) —
kod taraması sonuçları:

| Kaynak | Nokta sayısı | Örnek desen |
|--------|-------------|-------------|
| `req.query.tenantId` ile başlayan zincir | 41 (25 dosya) | `const tenantId = (req.query.tenantId \|\| req.headers['x-tenant-id'] \|\| 'tnt-isbey')` |
| `req.body.tenantId` ile başlayan zincir | 32 (20 dosya) | `const tenantId = (req.body.tenantId \|\| req.headers['x-tenant-id'] \|\| 'tnt-isbey')` |
| Güvenli karşılaştırma: token-sourced `req.tenantId` kullanımı | 101 | — |

Sıkışık dosyalar (25.2-C'de önce bakılacaklar):

| Dosya | query | body | Toplam |
|-------|-------|------|--------|
| v1/field-collections.ts | 4 | 1 | 5 |
| v1/advanced-reports.ts | 4 | 0 | 4 |
| v1/developer.ts | 3 | 2 | 5 |
| v1/automations.ts | 3 | 3 | 6 |
| v1/ai-insights.ts | 3 | 0 | 3 |
| v1/billing.ts | 1 | 3 | 4 |
| v1/whitelabel.ts | 1 | 2 | 3 |
| v1/tasks.ts | 1 | 2 | 3 |
| v1/document-ai.ts | 2 | 2 | 4 |
| v1/approvals.ts | 2 | 2 | 4 |
| v1/ai.ts | 2 | 2 | 4 |
| kalan 16 dosya | ... | ... | 1-2'şer |

**25.2-C için önerilen yaklaşım (uygulanmadı):** Tüm zincirler
`req.tenantId` (requireAuth dolumu) ile değiştirilir; platform yöneticisinin
başına tenant seçme ihtiyacı olan uçlar (platform-admin/billing/developer sınıfı)
için açık `isPlatformAdmin(req.user)` kontrolüyle seçime izin verilir — body/header
kaynağı **asla tek başına** yetki vermez.

---

## 6. Kalan Riskler

1. **Expense şemasında tenantId alanı yok** (schema.ts:883) — search.ts'te güvenli
   varsayılan uygulandı (varsayılan tenant dışına döndürülmez). Kalıcı çözüm şema
   değişikliği gerektirir → **muhasebe şeması dokunulmaz kuralı** nedeniyle 25.2-C'de
   mimar ile karar gerekir.
2. **users.* permission kodları** katalogda mevcut ama hiçbir uca bağlı değil
   (13 bağlı olmayan kod) → 25.2-B Permission Registry kapsamı.
3. **moduleGate.ts** hâlâ taslak (hiçbir router'a bağlı değil, runtime etkisi sıfır)
   → 25.2-B'de tek kaynak permission mimarisiyle birlikte karar.
4. **C3 IDOR (74 nokta)** → 25.2-C Ownership Hardening.
5. admin-users GET uçlarından COMPANY_ADMIN çıkarıldı; ileride firma bazlı kullanıcı
   listesi gerekiyorsa COMPANY_ADMIN'e tenant-filtreli ayrı uç açılmalı (şu an UI bu
   ucu kullanmıyor — etkisi yok).

## 7. Sonraki Adım

Onaylı sprint sırası: **25.2-B Permission Registry** (`server/security/permissions.ts`
tek kaynak) → 25.2-C Ownership Hardening (74 IDOR) → 25.2-D Test ve Sertifikasyon.
