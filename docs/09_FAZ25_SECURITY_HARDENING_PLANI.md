# İŞBEY CLOUD ERP — FAZ 25: SECURITY HARDENING PLANI (KARAR DOKÜMANI)

**Tarih:** 07 Eylül 2026
**Durum:** ⚠️ **PLAN — Onay bekliyor. Kod değişikliği YAPILMAMIŞTIR.**
**Girdiler:** FAZ 24 Production Readiness Review (`08_...md`), FAZ 19–23 test çıktıları, kaynak kod statik taraması
**Üst karar (girilen):** 🟡 GO DEĞİL — Canlıya açılış, production credential girişi ve dış kullanıcı erişimi FAZ 25 tamamlanana kadar kapalı.

---

## 0. Yönetici Özeti

FAZ 24 bulguları endpoint seviyesine indirgendi. Sonuç: **170 korumasız endpoint** (70 ana route + 2 `auth.ts` içi kullanıcı yönetimi + 98 v1 route) ve bunlara ek olarak **route seviyesinde tenant izolasyonu hatası** (`/api/v1/mobile/bootstrap` — herhangi bir tenant'ın müşteri verisi `?tenantId=` ile okunabiliyor).

Kritik gözlem: Doğru desen repoda **zaten mevcut ve test edilmiş** — `roles.ts` `router.use(requireAuth)` ile açılıyor, `payments.ts` webhook sonrası `paymentsRouter.use(requireAuth)` uyguluyor. FAZ 25 yeni mekanizma icat etmez; bu deseni tüm ağaca yayıp **DEFAULT DENY** global katmanıyla garantiye alır.

| Alan | Şimdi | Hedef |
|------|-------|-------|
| Auth coverage | 🔴 ~170 endpoint açık | 🟢 %100 (allowlist dışı 401) |
| RBAC | 🟢 (korumalı yollarda) | 🟢 tüm ağaç |
| Tenant izolasyonu | 🟡 mobile IDOR + gap'ler | 🟢 tüm ağaç |
| Payment | 🔴 mock + fallback secret | 🟢 provider factory + fail-fast |
| Backup | 🔴 manuel | 🟢 otomatik + retention + restore |
| Monitoring | 🟠 statik health | 🟢 deep health + alarm |
| CI/CD | 🔴 yok | 🟡 temel pipeline |
| Build | 🟡 dev-only | 🟢 prod build script |

---

# 25.1 Route Security Inventory

**Yöntem:** Tüm `server/routes/**` dosyalarında guard deseni taraması. Bir dosya şu desenlerden hiçbirini içermiyorsa korumasız sayıldı: `requireAuth` / `requireRole` / `requirePermission` / `router.use(<guard>)` / inline `jwt.verify` / `Authorization` veya `x-api-key` başlık kontrolü. Ardından her dosyanın endpoint'leri tek tek çıkarıldı.

**Kategori sözlüğü:**

| Kategori | Anlam |
|----------|-------|
| PUBLIC | Kimlik doğrulama gerektirmez (rate limit + log yine de uygulanır) |
| AUTH | Geçerli JWT/session zorunlu |
| RBAC | AUTH + modül/aksiyon izni (`requirePermission`) veya rol (`requireRole`) |
| TENANT | RBAC + `resolveTenant` izolasyonu; veri yalnızca kendi tenant'ından |
| INTERNAL | Yalnızca platform admin / servis-arası (ayrı ağ katmanı önerilir) |
| WEBHOOK | İmza + timestamp + replay koruması; auth token BEKLENMEZ |
| PUBLIC-TOKEN | İmzalı tek-kullanımlık token ile erişim (paylaşılan belge/ödeme linki) |

## 25.1.a — Ana Routes (korumasız tespit: 70 endpoint)

| Route (mount: `/api/...`) | Method | Mevcut | Olması Gereken |
|---------------------------|--------|--------|----------------|
| `/auth/login` | POST | Public | **PUBLIC** ✅ (kalır) |
| `/auth/register` | POST | Public | **PUBLIC** ✅ (kalır) |
| `/auth/users` | GET | **Yok** | RBAC `users.read` |
| `/auth/users` | POST | **Yok** | RBAC `users.write` |
| `/users` | GET | **Yok** | RBAC `users.read` |
| `/users` | POST | **Yok** | RBAC `users.write` |
| `/users/:id` | PUT | **Yok** | RBAC `users.write` |
| `/users/:id` | DELETE | **Yok** | RBAC `users.delete` |
| `/tenants` | GET | **Yok** | INTERNAL `tenants.read` (platform) |
| `/tenants/:id` | GET | **Yok** | INTERNAL `tenants.read` |
| `/tenants` | POST | **Yok** | INTERNAL `tenants.manage` |
| `/tenants/:id` | PUT | **Yok** | INTERNAL `tenants.manage` |
| `/tenants/:id` | DELETE | **Yok** | INTERNAL `tenants.manage` |
| `/tenants/:id/credits` | POST | **Yok** | INTERNAL `tenants.manage` (kontör/faturalama) |
| `/tenants/:id/switch` | POST | **Yok** | INTERNAL (mevcut `/auth/switch-company` yetki kontrollü; bu kopya kapatılmalı) |
| `/settings` | GET | **Yok** | AUTH + TENANT |
| `/settings/company` | PUT | **Yok** | RBAC `settings.manage` |
| `/settings/sequences` | PUT | **Yok** | RBAC `settings.manage` |
| `/settings/system` | PUT | **Yok** | RBAC `settings.manage` |
| `/settings/backup` | POST | **Yok** | RBAC `backup.execute` + audit |
| `/settings/audit-logs` | GET | **Yok** | RBAC `audit.read` |
| `/reports/profit-loss` | GET | **Yok** | TENANT + RBAC `reports.view` |
| `/reports/aging` | GET | **Yok** | TENANT + RBAC `reports.view` |
| `/reports/stock-valuation` | GET | **Yok** | TENANT + RBAC `reports.view` |
| `/reports/cash-flow` | GET | **Yok** | TENANT + RBAC `reports.view` |
| `/reports/vat-report` | GET | **Yok** | TENANT + RBAC `reports.view` |
| `/reports/expense-report` | GET | **Yok** | TENANT + RBAC `reports.view` |
| `/reports/collection-report` | GET | **Yok** | TENANT + RBAC `reports.view` |
| `/ai/insights` | GET | **Yok** | TENANT + RBAC `ai.view` |
| `/search` | GET | **Yok** | TENANT + AUTH (firma verisi arama) |
| `/sync/batch` | POST | **Yok** | TENANT + AUTH |
| `/checks` | GET/POST | **Yok** | TENANT + RBAC `check.view/create` |
| `/checks/:id/status` | PATCH | **Yok** | TENANT + RBAC `check.update` |
| `/cost-centers` | GET/POST | **Yok** | TENANT + RBAC `settings.manage` |
| `/cost-centers/:id` | PUT/DELETE | **Yok** | TENANT + RBAC `settings.manage` |
| `/cost-centers/:id/expenses` | GET | **Yok** | TENANT + RBAC `expenses.view` |
| `/employees` | GET/POST | **Yok** | TENANT + RBAC `personel.view/manage` |
| `/employees/:id/transactions` | GET | **Yok** | TENANT + RBAC `personel.view` |
| `/employees/:id/pay` | POST | **Yok** | TENANT + RBAC `personel.manage` + audit |
| `/expenses` | GET/POST | **Yok** | TENANT + RBAC `expenses.view/create` |
| `/expenses/categories` | GET/POST | **Yok** | TENANT + RBAC `expenses.view/manage` |
| `/expenses/:id` | DELETE | **Yok** | TENANT + RBAC `expenses.delete` |
| `/form-designs` | GET/POST/PUT/DELETE | **Yok** | TENANT + RBAC `settings.manage` |
| `/form-designs/:id/default\|duplicate` | POST | **Yok** | TENANT + RBAC `settings.manage` |
| `/form-designs/:id/export` | GET | **Yok** | TENANT + RBAC `settings.manage` |
| `/form-designs/import` | POST | **Yok** | TENANT + RBAC `settings.manage` |
| `/import/customers` | POST | **Yok** | TENANT + RBAC `customers.create` |
| `/import/products` | POST | **Yok** | TENANT + RBAC `products.create` |
| `/quotes` | GET/POST | **Yok** | TENANT + RBAC `quotes.view/create` |
| `/quotes/:id` | GET | **Yok** | TENANT + RBAC `quotes.view` |
| `/quotes/:id/status` | PATCH | **Yok** | TENANT + RBAC `quotes.update` |
| `/quotes/:id/convert-to-*` | POST | **Yok** | TENANT + RBAC `quotes.update` |
| `/quotes/orders/*` (4 ep) | GET/POST | **Yok** | TENANT + RBAC `orders.*` |
| `/waybills` | GET/POST | **Yok** | TENANT + RBAC `waybills.view/create` |
| `/waybills/:id` | GET | **Yok** | TENANT + RBAC `waybills.view` |
| `/waybills/:id/convert-to-invoice` | POST | **Yok** | TENANT + RBAC `waybills.update` |
| `/waybills/bulk-invoice` | POST | **Yok** | TENANT + RBAC `waybills.update` |

> Not: `/api/admin/companies` ve `/api/companies` aynı router'a bağlı; global guard sonrası çift mount sorun olmaz, ancak `companiesRouter` içindeki guard durumu Sprint 25.1'de tek tek doğrulanacaktır (guard'lı görünüyor).

## 25.1.b — v1 Routes (korumasız tespit: 98 endpoint)

| Route (mount: `/api/v1/...`) | Method | Mevcut | Olması Gereken |
|------------------------------|--------|--------|----------------|
| `/mobile/auth/login` | POST | Cihaz login | **PUBLIC** (rate limit şart) |
| `/mobile/bootstrap` | GET | **Yok + IDOR** | AUTH + TENANT (**kritik:** `?tenantId=` ile başkasının müşteri verisi okunabiliyor) |
| `/mobile/sync` | POST | **Yok** | AUTH + TENANT |
| `/mobile/devices` | GET | **Yok** | AUTH + TENANT |
| `/mobile/devices/:id/revoke` | POST | **Yok** | AUTH + TENANT (yalnızca kendi cihazı) |
| `/mobile/dashboard` | GET | **Yok** | AUTH + TENANT |
| `/plans`, `/plans/:slug` | GET | **Yok** | **PUBLIC** ✅ (fiyat listesi, read-only) |
| `/payment-links/resolve/:token` | GET | **Yok** | **PUBLIC-TOKEN** (imzalı tek-kullanımlık token) |
| `/payment-links/pay` | POST | **Yok** | **PUBLIC-TOKEN** + rate limit |
| `/documents/public-share/:token` | GET | **Yok** | **PUBLIC-TOKEN** (imzalı paylaşımlink) |
| `/integrations/:provider/webhook` | POST | Zayıf (secret koşullu) | **WEBHOOK** (bkz. 25.5) |
| `/payments/webhook` | POST | Fallback secret + mock | **WEBHOOK** (bkz. 25.5) |
| `/platform-admin/metrics` | GET | **Yok** | INTERNAL `platform.admin` |
| `/platform-admin/tenants` | GET | **Yok** | INTERNAL `platform.admin` |
| `/platform-admin/impersonate` | POST | **Yok** | INTERNAL `platform.admin` + audit (yüksek riskli) |
| `/platform-admin/announcements` | POST | **Yok** | INTERNAL `platform.admin` |
| `/developer/keys` | GET/POST | **Yok** | RBAC `developer.keys` + audit |
| `/developer/logs`, `/developer/webhooks` | GET/POST | **Yok** | RBAC `developer.*` |
| `/billing/portal` | GET | **Yok** | RBAC `billing.view` |
| `/billing/upgrade`, `/buy-credits`, `/cancel` | POST | **Yok** | RBAC `billing.manage` + audit |
| `/marketplace/*` (5 ep) | GET/POST | **Yok** | TENANT + RBAC `marketplace.*` |
| `/dealer/partners`, `/commissions` | GET | **Yok** | RBAC `dealer.view` |
| `/dealer/partners` | POST | **Yok** | RBAC `dealer.manage` |
| `/dealer/commissions/:id/approve` | POST | **Yok** | RBAC `dealer.manage` + audit |
| `/ai/*` (6 ep) | GET/POST | **Yok** | TENANT + RBAC `ai.*` |
| `/ai-insights/*` (3 ep) | GET | **Yok** | TENANT + RBAC `ai.view` |
| `/document-ai/*` (4 ep) | GET/POST | **Yok** | TENANT + RBAC `documents.*` |
| `/documents` | GET | **Yok** | TENANT + RBAC `documents.view` |
| `/documents/upload`, `/share` | POST | **Yok** | TENANT + RBAC `documents.write` |
| `/approvals/*` (4 ep) | GET/POST | **Yok** | TENANT + RBAC `approvals.*` |
| `/automations/*` (6 ep) | GET/POST | **Yok** | TENANT + RBAC `automations.*` |
| `/bank-matching/suggestions` | GET | **Yok** | TENANT + RBAC `bank.view` |
| `/bank-matching/reconcile` | POST | **Yok** | TENANT + RBAC `bank.update` + audit |
| `/activity-logs` | GET | **Yok** | RBAC `audit.read` |
| `/advanced-reports/*` (4 ep) | GET | **Yok** | TENANT + RBAC `reports.view` |
| `/client/dashboard` | GET | **Yok** | AUTH + TENANT (portal rolü ayrıştırılmalı) |
| `/devices`, `/devices/:id/terminate` | GET/POST | **Yok** | AUTH + TENANT |
| `/field-collections/*` (5 ep) | GET/POST | **Yok** | TENANT + RBAC `collections.*` |
| `/messages/*` (3 ep) | GET/POST | **Yok** | TENANT + AUTH |
| `/onboarding/progress` | GET | **Yok** | AUTH + TENANT |
| `/onboarding/demo-data` | POST | **Yok** | RBAC `settings.manage` |
| `/pos/charge`, `/pos/transactions` | POST/GET | **Yok** | TENANT + RBAC `pos.*` |
| `/promotions/validate-coupon` | POST | **Yok** | AUTH + sıkı rate limit (kupon brute-force riski) |
| `/promotions/referral-code` | GET | **Yok** | AUTH |
| `/support-faz8/tickets` | GET/POST | **Yok** | AUTH + TENANT |
| `/support-faz8/knowledge` | GET | **Yok** | **PUBLIC** ✅ (yardım makaleleri, read-only) |
| `/tasks` | GET/POST | **Yok** | TENANT + AUTH |
| `/tasks/:id/status` | PATCH | **Yok** | TENANT + AUTH |
| `/visits` | GET/POST | **Yok** | TENANT + RBAC `visits.*` |
| `/visits/map` | GET | **Yok** | TENANT + RBAC `visits.view` |
| `/whitelabel/profile` | GET | **Yok** | AUTH (bayi kendi profili) |
| `/whitelabel/profile` | POST | **Yok** | RBAC `settings.manage` |
| `/whitelabel/verify-domain` | POST | **Yok** | RBAC `settings.manage` |

## 25.1.c — Korunan ama yeniden doğrulanacaklar (Sprint 25.1 regression seti)

`auth.ts` (`/me`, `/switch-company`), `customers.ts`, `products.ts`, `invoices.ts`, `cash.ts`, `banks.ts`, `checks.ts` dışındakiler, `efatura.ts`, `document-templates.ts`, `roles.ts` (✅ örnek desen: `router.use(requireAuth)`), `permissions.ts`, `invitations.ts`, `companies.ts` (çift mount!), `checkout.ts` (✅ requirePermission), `hizli-*`, v1 core seti. FAZ 19 suiti bu yolları kapsıyor; DEFAULT DENY devreye alınınca regression koşusu tekrarlanacak.

## 25.1.d — Envanter sayı özeti

| Grup | Korumasız endpoint | Kritik not |
|------|-------------------|------------|
| Ana routes | 70 | users/tenants/settings/reports dahil |
| auth.ts içi | 2 | `/auth/users` GET+POST |
| v1 routes | 98 | mobile IDOR + platform-admin dahil |
| **TOPLAM** | **170** | |

---

# 25.2 Middleware Mimari Planı

## Hedef zincir (server/index.ts — sırayla)

```
HTTP Request
  → 1. request-id (korelasyon kimliği, tüm log satırlarında taşınır)
  → 2. helmet (güvenlik başlıkları)
  → 3. cors (ALLOWED_ORIGINS whitelist, credentials: true)
  → 4. express-rate-limit (global 300/dk; login 10/dk-IP; webhook 60/dk; coupon 20/dk)
  → 5. express.json({ limit: '2mb' }) — 10mb yalnızca /import ve /upload yollarında
  → 6. GLOBAL DEFAULT DENY  ← kritik katman
  → 7. route-level RBAC (requireRole / requirePermission)
  → 8. resolveTenant (mevcut middleware — tenant izolasyonu)
  → 9. Controller
  → 10. Audit Log (hassas aksiyonlar; mevcut addAuditLog genişletilir)
```

## DEFAULT DENY mekanizması (yeni dosya: `server/middleware/securityGate.ts`)

```ts
// TASLAK — Sprint 25.1'de uygulanacak (bu doküman: yalnızca plan)
const PUBLIC_ROUTES = [
  { method: 'POST', pattern: '/api/auth/login' },
  { method: 'POST', pattern: '/api/auth/register' },
  { method: 'GET',  pattern: '/api/health' },
  { method: 'GET',  pattern: '/api/v1/plans' },              // ve /:slug
  { method: 'POST', pattern: /^\/api\/v1\/(payments|integrations)\/.*webhook$/ },
  { method: 'GET',  pattern: /^\/api\/v1\/documents\/public-share\/[^/]+$/ },
  { method: 'GET',  pattern: /^\/api\/v1\/payment-links\/resolve\/[^/]+$/ },
  { method: 'POST', pattern: '/api/v1/payment-links/pay' },
  { method: 'POST', pattern: '/api/v1/mobile/auth/login' },
  { method: 'GET',  pattern: '/api/v1/support-faz8/knowledge' },
];

export const defaultDeny: RequestHandler = (req, res, next) => {
  const isPublic = PUBLIC_ROUTES.some(r =>
    r.method === req.method && matches(r.pattern, req.path));
  if (isPublic) return next();
  return requireAuth(req, res, next);   // listede olmayan HER ŞEY en azından AUTH
};
```

## Bypass karşıtı tasarım kararları

1. **Allowlist yol bazında, dosya bazında değil.** Yeni route dosyası ekleyen geliştirici otomatik korunur; bir endpoint'i public yapmak istiyorsa allowlist'e eklemesi ve code review'dan geçmesi gerekir. "Unutulan router" sınıfı açık bu tasarımla imkânsızlaşır.
2. **Mount sırası:** `defaultDeny` tüm `app.use('/api/...')` mount'larından ÖNCE yer alır. İç router'larda guard olsa da olmasa da global katman önce devreye girer.
3. 401 yanıt gövdesi mevcut standartla aynı: `{ success:false, code:'UNAUTHORIZED', message }`.
4. `health` public kalır ama İÇERİĞİ Sprint 25.4'te derinleştirilir (aşağıda).
5. Çift mount (`/api/admin/companies` + `/api/companies`) sorun değil: ikisi de aynı global kapıdan geçer; router içi guard'lar ek katmandır.

## Neden "her router'a router.use(requireAuth)" yerine ikili model?

`router.use(requireAuth)` modeli repoda kanıtlanmış (roles.ts) ve RBAC yoğun dosyalarda **ikinci katman** olarak yine de eklenecek. Ancak 45 dosyaya elle eklemek yerine global defaultDeny: (a) bypass yüzeyini sıfırlar, (b) korumayı varsayılan yapar, (c) dosya başına tekrar gerektirmez. Defense-in-depth: global AUTH → router RBAC → service tenant check.

---

# 25.3 Public Endpoint Beyaz Listesi (onaya sunulan nihai liste)

## PUBLIC (tamamen açık — rate limit + request log yine de uygulanır)

| # | Endpoint | Gerekçe |
|---|----------|---------|
| P1 | `POST /api/auth/login` | Giriş |
| P2 | `POST /api/auth/register` | 14 gün deneme kaydı (mevcut iş akışı) |
| P3 | `GET /api/health` | LB/monitör sağlık kontrolü (içerik derinleştirilecek) |
| P4 | `GET /api/v1/plans` + `/:slug` | Fiyat listesi (read-only, static veri) |
| P5 | `POST /api/v1/mobile/auth/login` | Mobil cihaz girişi (rate limit şart) |
| P6 | `GET /api/v1/support-faz8/knowledge` | Yardım makaleleri (read-only) |

## PUBLIC-TOKEN (imzalı/kısa ömürlü token ile; auth token yok)

| # | Endpoint | Koruma detayı |
|---|----------|---------------|
| T1 | `GET /api/v1/documents/public-share/:token` | HMAC imzalı paylaşımlink, exp içeren; token doğrulama service katmanında |
| T2 | `GET /api/v1/payment-links/resolve/:token` | Aynı token mekanizması |
| T3 | `POST /api/v1/payment-links/pay` | Token + rate limit + audit |

## WEBHOOK (imza doğrulamalı, auth token beklenmez)

| # | Endpoint | Koruma detayı |
|---|----------|---------------|
| W1 | `POST /api/v1/payments/webhook` | İmza + timestamp + replay dedup (bkz. 25.5) |
| W2 | `POST /api/v1/integrations/:provider/webhook` | İmza ZORUNLU; secret tanımsızsa 503 (bkz. 25.5) |

## DEFAULT DENY

Yukarıdaki listede olmayan **her** `/api/*` yolu en azından AUTH; modül gerektirenler RBAC; veri yolları TENANT. Platform yönetim yolları (`/api/v1/platform-admin/*`, `/api/tenants/*`) INTERNAL kategoride — `requireRole('SUPER_ADMIN')` + (opsiyonel) ağ seviyesinde kısıt.

## İncelemeye açık sorular (onay verirken netleştiriniz)

1. `GET /api/v1/support-faz8/knowledge` public kalsın mı, yoksa AUTH mü? (yardım içeriklerinin gizlilik seviyesine bağlı)
2. Mobil login (P5) ayrı IP rate limit'i (örn. 10/dk) yeterli mi, yoksa cihaz kayıt akışı da ekstra doğrulama ister mi?
3. `POST /api/auth/register` deneme kayıtları için captcha/TURNSTILE eklensin mi? (Sprint 25.3 opsiyonu)
4. `/api/v1/mobile/bootstrap` AUTH sonrası bile `x-tenant-id` başlığı KABUL EDİLMEYECEK; tenant yalnızca token'dan çözülecek — onaylıyor musunuz?

---

# 25.4 Permission Matrisi (genişletme önerisi)

## Mevcut katalog (kodda zaten kullanılan — uyum korunacak)

`customers.view/create/update/delete`, `invoices.view/create/delete/send`, `products.view/create/update/delete`, `quotes.view/create/update`, `waybills.view/create`, `cash.view/create`, `bank.view/create`, `collections.create/cancel`, `company.view/update`, `einvoice.view`, `reports.view`, `warehouses.view/update`, `users.*` (backend `requirePermission` + `module.*` wildcard desteği mevcut).

## Yeni eklenecek permission'lar (FAZ 25 ile kapatılan yollar için)

| Modül | Permission | Kim |
|-------|-----------|-----|
| Kullanıcı | `users.read` | COMPANY_ADMIN |
| Kullanıcı | `users.write` | COMPANY_ADMIN |
| Kullanıcı | `users.delete` | COMPANY_ADMIN |
| Tenant (platform) | `tenants.read` / `tenants.manage` | Yalnızca SUPER_ADMIN |
| Ayarlar | `settings.manage` | COMPANY_ADMIN, MUHASEBE (kısıtlı) |
| Ayarlar | `backup.execute` / `backup.read` | COMPANY_ADMIN, SUPER_ADMIN |
| Denetim | `audit.read` | COMPANY_ADMIN, MUHASEBE, SUPER_ADMIN |
| Rapor | `reports.view` | (mevcut) + MUHASEBE, RAPOR |
| Muhasebe | `accounting.read` | MUHASEBE, COMPANY_ADMIN |
| Muhasebe | `accounting.approve` | MUHASEBE, COMPANY_ADMIN |
| Personel | `personel.view` / `personel.manage` | COMPANY_ADMIN (manage), tümü (view) |
| Gider | `expenses.view/create/delete` | KASA/MUHASEBE create, COMPANY_ADMIN delete |
| Çek/Senet | `check.view/create/update` | KASA, MUHASEBE |
| AI | `ai.view` / `ai.run` | Tümü (view), SATIS+ (run) |
| Faturalama | `billing.view` / `billing.manage` | COMPANY_ADMIN |
| Bayi | `dealer.view` / `dealer.manage` | DEALER rolü, SUPER_ADMIN |
| Geliştirici | `developer.keys` / `developer.webhooks` | COMPANY_ADMIN |
| Pazaryeri | `marketplace.view/connect` | COMPANY_ADMIN |
| POS | `pos.charge` / `pos.view` | SATIS, KASA |
| Saha | `visits.view/create`, `collections.view/create/cancel` | SATIS/KASA |
| Otomasyon | `automations.view/manage` | COMPANY_ADMIN |
| Onaylar | `approvals.view/decide` | MUHASEBE, COMPANY_ADMIN |
| Platform | `platform.admin` | Yalnızca SUPER_ADMIN (INTERNAL) |

**Uygulama notu:** `requirePermission` zaten `module.*` wildcard ve `*` superuser destekliyor; `roleObj.permissions` tenant bazlı rol kayıtlarından geliyor. Yeni string'ler mevcut mekanizmaya eklenecek — guard kodunun kendisi DEĞİŞMEYECEK (muhasebe mantığına ve doğrulanmış RBAC çekirdeğine dokunulmuyor).

---

# 25.5 Payment Security Planı

## Mevcut risk (FAZ 24 doğrulandı)

```
Webhook isteği → secret = process.env.PAYMENT_WEBHOOK_SECRET
                  || 'isbey-webhook-secret-key-2026'   ← BİLİNEN değer
                → MockPaymentProvider.validateWebhookSignature
                → PAYMENT_SUCCESS: payments tablosuna kayıt + komisyon işlenir
```
Ayrıca sağlayıcı `MOCK` hardcode; `new MockPaymentProvider()` webhook ve refund yollarında instance'lanıyor; `amount`/`tenantId` istemci gövdesinden aynen alınıyor.

## Hedef akış (Sprint 25.2)

```
Webhook isteği
  → 1. SECRET ZORUNLU: PAYMENT_WEBHOOK_SECRET yoksa → 503 (fail-fast, başta kontrol)
  → 2. İmza doğrulama (HMAC-SHA256, provider'dan gelen gövde bütünlüğüyle)
  → 3. Timestamp kontrolü: X-Timestamp ± 5 dk dışı → 401
  → 4. Replay koruması: (providerPaymentId + eventId) dedup cache; tekrar → 409
  → 5. amount/currency/tenantId: sağlayıcı kaydıyla eşleşme; uyuşmazlık → 422 + audit
  → 6. İşleme (mevcut runTransaction korunur — muhasebe mantığına dokunulmaz)
  → 7. Audit log: her webhook sonucu (başarı/dup/reject) addAuditLog ile
  → 8. Başarısız işlenen event → failed_webhooks kuyruğu (retry elle ya da timer)
```

## Provider factory (mock'un prod'dan çıkarılması)

```ts
// server/services/payments/providerFactory.ts — TASLAK
export function getPaymentProvider(): PaymentProvider {
  const env = process.env.NODE_ENV;
  if (env === 'test') return new MockPaymentProvider();      // yalnızca test
  const real = process.env.PAYMENT_PROVIDER;                 // 'iyzico' | 'paytr' | ...
  if (!real) throw new Error('PAYMENT_PROVIDER tanımlı değil (production)'); // fail-fast
  // gerçek sağlayıcı adapter'ları ayrı sprintte eklenecek
  throw new Error(`Gerçek ödeme sağlayıcısı (${real}) entegrasyonu henüz mevcut değil`);
}
```

Karar maddeleri (onay gerekli):
1. **Canlı ödeme henüz yoksa** production'da `/payments/webhook` ve `/checkout/pay` **503 dönsün** ("ödeme modülü aktif değil") — sahte başarılı ödeme KESİNLİKLE oluşamaz. Bu, CLAUDE.md "API response'u uydurmak yasak" kuralının ödeme alanındaki karşılığıdır.
2. Refund yolu da aynı factory'i kullanır; mock'a doğrudan bağımlılık kalkar.
3. `paymentProvider.ts` interface'i korunur (mevcut sözleşme sağlam).

---

# 25.6 Test Planı

## Yeni suit 1: `phase25DefaultDenyTest.ts` (Sprint 25.1 çıkışı)

```
Auth (401 beklenir):
  - token yok → 170 korumasız yolun TAMAMINDAN örnekleme %100 → 401
  - bozuk token → 401
  - expired token (1sn ömürlü) → 401
Public (200 beklenir):
  - login, register, health, plans, mobile/login → 200/201
  - token'sız RAPOR/USERS/TENANTS/settings → 401 (eski davranış 200'dü — REGRESYON)
```

## Yeni suit 2: `phase25AuthorizationTest.ts` (Sprint 25.1–25.3 çıkışı)

```
403 beklenir:
  - SATIS → /api/users (users.read yok)
  - RAPOR → /api/settings/backup
  - MUHASEBE → /api/v1/platform-admin/metrics
  - COMPANY_ADMIN → /api/v1/platform-admin/* (INTERNAL)
TENANT:
  - kasiyer token'ı + ?tenantId=tnt-kadikoy → veri yine kendi tenant'ından (mobile/bootstrap dahil)
  - x-tenant-id başlığıyla başkasının verisi → RED
```

## Yeni suit 3: `phase25WebhookSecurityTest.ts` (Sprint 25.2 çıkışı)

```
401: yanlış imza | imza yok | eski timestamp (>5dk)
409: aynı eventId ikinci kez
200: doğru imza + taze timestamp (yalnızca NODE_ENV=test; mock provider test modunda)
503: PAYMENT_WEBHOOK_SECRET tanımsızken istek
422: amount != sağlayıcı kaydı
```

## Yeni suit 4: `phase25ApiProtectionTest.ts` (Sprint 25.3 çıkışı)

```
429: login 11. deneme (1dk içinde) | global 301. istek
Başlık kontrolleri: helmet (X-Frame-Options, CSP...), request-id her yanıtta
CORS: izinli origin 200, yabancı origin engel
```

## Mevcut suitlerin regresyonu (kod değişmeden koşulacak)

phase17 (181), phase19 (45 — FAZ 19 testlerinin artık 401 bekleyenleri güncellenecek: eskiden "guard'sız ama 200 döndü" tespiti kalmasın), phase18, final gate, readiness, deepE2E, fullScope, 3 aylık simülasyon → izole ortamda TAM KOŞU. Muhasebe testlerinde sıfır sapma beklenir (mantık dokunulmaz).

---

# 25.7 Deployment Öncesi Gate

| Kontrol | Kriter | Durum |
|---------|--------|-------|
| Auth coverage | Allowlist dışı tüm endpoint'ler token'sızda 401 | ⏳ |
| Public route listesi | Bu doküman §25.3 kullanıcıca onaylı | ⏳ |
| Payment mock kaldırıldı | Prod yolda MockPaymentProvider yok; ödeme yoksa 503 | ⏳ |
| Secret fallback yok | Kod taraması: `process.env.* \|\| '...'` secret kalıbı = 0 | ⏳ |
| Webhook imza zorunlu | Secret'sız webhook 503; yanlış imza 401 | ⏳ |
| Rate limit | Login/global/webhook limitleri aktif, 429 testli | ⏳ |
| Helmet + CORS | Başlıklar + whitelist testli | ⏳ |
| Backup plan | Zamanlanmış yedek + atomik yazım + retention + restore prosedürü | ⏳ |
| Monitoring | Deep /health (db, token, disk, uptime) + token hatası alarmı | ⏳ |
| Security regression | Tüm mevcut suitler PASS + 4 yeni suit PASS | ⏳ |
| Muhasebe bütünlüğü | Bilanço farkı 0,00 TL — tüm regresyonda korunur | ⏳ |

---

# Sprint Dağılımı (önerilen uygulama sırası)

| Sprint | Kapsam | Çıktı | Öngörülen risk |
|--------|--------|-------|----------------|
| 25.1 Auth Hardening | securityGate.ts (defaultDeny) + 170 endpoint'e RBAC/TENANT etiketleri + /auth/users kapatma + mobile/bootstrap IDOR fix | phase25DefaultDenyTest %100 | Kapsama giren frontend çağrıları 401 alabilir → vite proxy ile smoke test |
| 25.2 Payment Security | Provider factory + secret fail-fast + webhook pipeline (imza/timestamp/replay/audit/queue) | phase25WebhookSecurityTest | Ödeme modülü prod'da 503'e çekilir (bilinçli kapatma) |
| 25.3 API Protection | helmet + rate limit + CORS whitelist + request-id + 2mb limit | phase25ApiProtectionTest | Meşru istemci kesilmesi → limitler env ile ayarlanabilir |
| 25.4 Operasyon Güvenliği | Zamanlanmış backup (saatlik) + atomik backup yazımı + retention (7g/4h/12a) + restore script + deep /health + token alarmı | Backup restore tatbikatı + health dokümanı | Disk kapasite planı |
| 25.5 Regression + Gate | Tüm suitler + gate tablosu doldurma + FAZ 25 QA raporu | Gate: yeşil | — |

**Öngörülen etki alanı (frontend):** FAZ 2–7'de sidebar/yönlendirme zaten rol bazlı süzüldü; 401'ler `AuthContext` mevcut interceptör akışıyla login'e yönlendirir. Sprint 25.1 sonunda tüm görünürlerin (dashboard, raporlar, ayarlar) gerçek kullanıcıyla elle smoke testi yapılacak.

---

# Kullanıcı İncelemesi İçin 3 Odak Sorusu (istenen)

1. **Public liste doğru mu?** §25.3'teki 6 PUBLIC + 3 PUBLIC-TOKEN + 2 WEBHOOK kalemi dışında public kalmasını istediğiniz bir yol var mı? (özellikle: support knowledge, plans, register)
2. **Bypass yok mu?** defaultDeny global katmanı tüm `/api/*` mount'larından ÖNCE gelir; allowlist yol bazlıdır (dosya bazlı değil) — bu tasarımla "unutulan router" senaryosu kapanır. İstisna isterseniz (örn. iç ağda auth'suz /metrics) şimdiden belirtin.
3. **Tenant izolasyonu eksik kalan yer?** Envanterde tespit edilen tek route-seviyesi IDOR `/api/v1/mobile/bootstrap` (query/header ile tenant seçilebiliyor). Ayrıca `/tenants/:id/switch` (INTERNAL yapılıyor) ve `x-tenant-id` başlığı tüm graph'ta token öncelikli olacak. Ek gözleminiz varsa Sprint 25.1'e eklenir.

---

*Bu doküman yalnızca plan içeriğidir; uygulama (kod değişikliği) onaylı remediation sonrası Sprint sırasıyla başlayacaktır. Muhasebe/stok/KDV mantığı ve doğrulanmış RBAC çekirdeği (authGuards.ts, modulePermissions.ts) FAZ 25'te DEĞİŞTİRİLMEYECEKTİR.*
