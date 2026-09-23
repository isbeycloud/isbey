# İŞBEY — Canlıya Geçiş Kontrol Listesi (FAZ 25.2-B → FAZ 31)

**Tarih:** 2026-09-08 · **Kaynak:** Kullanıcı yol haritası + gerçek sprint durumu mutabakatı
**Durum göstergeleri:** ✅ TAMAM (kanıt testle) · 🔄 KISMEN (bölüm tamam) · ⬜ BAŞLAMADI · 🔒 KAPI (aşağı fazı bloklar)

**Numara notu:** Kullanıcı planındaki FAZ 25.3 (Payment Security) ile docs/14-15'teki eski "25.3 Finalizasyon" farklıdır. Eski 25.3 A–H sprinti kullanıcı planındaki 25.3'ün bir kısmını örtüşerek tamamladı; aşağıda gerçek durum yazılmıştır.

---

## FAZ 25.2-B — Permission Registry — ✅ TAMAM (B-1…B-5)

| # | Madde | Durum | Kanıt |
|---|-------|-------|-------|
| 1 | `server/security/permissions.ts` | ✅ | 49 kod (37 katalog + 7 resmileştirilmiş + 5 rezerve) |
| 2 | `server/security/roles.ts` | ✅ | ROLE_PERMISSIONS tek kaynak; 5 tenant rolü |
| 3 | Permission registry testleri | ✅ | 31/31 PASS (v3: +boş rol 0, +bilinmeyen slug 0) |
| 4 | Storage seed → registry migrasyonu | ✅ | B-2: seed'de literal tanım 0 |
| 5 | Route referans standardizasyonu | ✅ | B-3: 57/57 çağrı `PERMISSIONS.*` sabiti, literal 0 |
| 6 | Frontend matris eşleme | ✅ | B-4: generatePermissionMap → permission-map.json + §6 güncellik testi |
| 7 | (Ek: rol eşleme kopyaları registry'ye) | ✅ | B-5: authGuards + moduleGate → PLATFORM_ROLE_TO_SLUG / SLUG_TO_PLATFORM_ROLE |

**Kabul:** ✅ Tanımsız permission = 0 · ✅ Duplicate = 0 · ✅ Backend/frontend birebir (§6)

---

## FAZ 25.2-C — Resource Ownership & Tenant Hardening — ✅ TAMAM

| # | Madde | Durum | Not |
|---|-------|-------|-----|
| 1 | 73 IDOR noktası envanter güncellemesi | ✅ | 25 dosya / 73 nokta sınıflandırıldı (25.1 envanteri + taze tarama) |
| 2 | 🔴 Finans (field-collections, bank-matching, pos, payment-links) | ✅ | resolveRequestTenantId swap tamam |
| 3 | 🔴 Muhasebe / mali (document-ai, accountant, billing, client) | ✅ | accountant delegasyon istisnası korunuyor |
| 4 | 🔴 e-belge/belge (documents, approvals, automations, messages) | ✅ | public-share/pay/resolve uçları tenantId'e dokunmuyor |
| 5 | 🟠 Diğer (tasks, visits, devices, onboarding, support-faz8, whitelabel, marketplace, promotions, developer, ai, ai-insights, advanced-reports, activity-logs) | ✅ | 25 dosyada 74 çağrı |
| 6 | 🟡 Rapor / özet uçları | ✅ | advanced-reports, ai-insights, client |
| 7 | Statik kaynak disiplini testi | ✅ | faz252cTenantSourcingTest.mjs — eski desen routes'ta 0 (PASS) |
| 8 | Cross-tenant runtime test suiti (oku 0 + yaz 0) | ✅ | faz25IzolasyonTest.mjs + faz252dRuntimeAuthzSuite ile kanıtlandı |

**Kabul:** ✅ query/body/header tenantId kaynağı routes'ta 0 (statik) · ✅ Cross tenant runtime okuma = 0 (25.2-D kanıtı) · ✅ runtime yazma = 0
**Doğrulama (2026-09-19):** `tools/dogrulama.ps1` ile 59 PASS / 0 FAIL ile doğrulandı.

---

## FAZ 25.2-D — Authorization Test Platformu — ✅ TAMAM

| # | Madde | Durum | Not |
|---|-------|-------|-----|
| 1 | Rol×Endpoint matris jeneratörü | ✅ | `server/tests/faz252dAuthzMatrixGenerator.mjs` — authz-matrix.json üretimi PASS |
| 2 | 8 rol × 60 endpoint ≈ 480 kontrol | ✅ | `server/tests/faz252dRuntimeAuthzSuite.mjs` — 2979 PASS / 0 FAIL |
| 3 | Privilege escalation = 0 suiti | ✅ | 25.2-A kritik escalation + Runtime Authz ile sıfır yetki yükseltme |
| 4 | Frontend MODULE_ROLES ↔ MODULE_ACCESS_MATRIX hizalama testi | ✅ | `server/tests/faz252dFrontendMatrixAlignmentTest.mjs` — PASS |

**Kabul:** ✅ Privilege escalation = 0 · ✅ Runtime Authz 2979 PASS / 0 FAIL

---

## FAZ 25.3 — Payment & External Integration Security — ✅ TAMAM

| # | Madde | Durum | Not |
|---|-------|-------|-----|
| 1 | Mock provider production engeli | ✅ | TEST mod kilidi (`IS_TEST_MODE` + econnecttest URL); canlı QA PASS olmadan açılmaz |
| 2 | Hardcode webhook secret kaldırılması | ✅ | `payments.ts` fallback secret kaldırıldı; secret yoksa 503 fail-closed |
| 3 | Webhook imza zorunlu | ✅ | HMAC-SHA256 tek yol; geçersiz imza 401, eksik secret 503 |
| 4 | Retry mekanizması | ✅ | `electronicDocumentQueue.ts`: exponential backoff (30s × 2^n, 15dk tavan) + isBackoffPending |
| 5 | Idempotency key | ✅ | `idempotencyKey` alanı (tenant:belge:uuid) + engellenen durum filtresi |
| 6 | e-Belge: duplicate belge kontrolü | ✅ | `electronicDocumentService.ts`: find-based kontrol + race-condition kilidi (`queueingInProgress`) |
| 7 | e-Belge: gönderim logları + hata kuyruğu | ✅ | `integrationLogs` (5000 satır tavan) + retry kuyruğu |
| 8 | UtilEncrypt log denetimi | ✅ | Maskeli loglama, hash/token sızıntısı engellendi |

**Kabul:** ✅ Kontör tüketen işlem sadece canlı onayla çalışır · ✅ Webhook fail-closed

---

## FAZ 25.4 — Production Security Layer — ✅ TAMAM

| # | Madde | Durum | Not |
|---|-------|-------|-----|
| 1 | Helmet | ✅ | `server/middleware/productionSecurity.ts`: nosniff, X-Frame-Options DENY, Referrer-Policy, XSS |
| 2 | CORS allowlist | ✅ | `buildCorsOptions()`: CORS_ALLOW_ORIGINS env denetimi |
| 3 | Rate limit | ✅ | In-memory sliding window: `loginRateLimit` (15dk/20), `mobileLoginRateLimit` (15dk/30), `webhookRateLimit` (1dk/60) |
| 4 | Request validation | ✅ | Zod şemaları ve tip korumaları devrede |
| 5 | Payload limit | ✅ | 10MB payload sınırı aktif |
| 6 | moduleGate route montajı | ✅ | Güvenlik kapılarıyla entegre |

**Kabul:** ✅ Brute force / login abuse / webhook abuse kontrolleri çalışıyor (dogrulama.ps1 kanıtlı)

---

## FAZ 25.5 — Backup / Disaster Recovery — ✅ TAMAM

| # | Madde | Durum | Not |
|---|-------|-------|-----|
| 1 | Otomatik backup | ✅ | `data/backups/` zaman damgalı yedekleme mekanizması devrede |
| 2 | Retention politikası | ✅ | `storage.ts pruneBackups()`: BACKUP_RETENTION_COUNT (20) + BACKUP_RETENTION_DAYS (30) |
| 3 | Checksum doğrulama | ✅ | SHA-256 sidecar (.sha256) üretimi ve `verifyBackupChecksum()` doğrulaması (dogrulama.ps1 PASS) |
| 4 | Restore prosedürü | ✅ | `tools/db-restore.mjs` ve yedek doğrulama adımları hazır |

---

## FAZ 18 & 19 — e-Belge & Hızlı Bilişim Entegrasyonu — ✅ TAMAM

| # | Madde | Durum | Kanıt |
|---|-------|-------|-------|
| 1 | FAZ 18 Sandbox UBL Entegrasyonu | ✅ | 65/65 PASS |
| 2 | FAZ 19 Koşu 11 Gerçek Belge Akışı | ✅ | 19/19 PASS (`SendDocument`, `GetDocumentListGUID`, `CancelDocument`, `KalanKontorSorgula`) |
| 3 | Gate #6 (Tedarikçi Satıcı Kimliği & Mühür Kök Nedeni) | ✅ | KAPANDI (`ext:UBLExtensions` test mühür çözümü, `docs/51` §20) |

---

## FAZ 26 — CI/CD ve Build Standardizasyonu — ✅ TAMAM

| # | Madde | Durum | Not |
|---|-------|-------|-----|
| 1 | Test/typecheck pipeline adımı | ✅ | `npm run typecheck` (`tsc -b`) 0 hata; TS 6 `noEmitOnError` kuralına uyumlu |
| 2 | Security scan (npm audit + secret scan) | ✅ | `npm run security-audit` (0 vulnerability) |
| 3 | Build standardizasyonu | ✅ | `npm run build` (tsc -b && vite build) 0 hata (1.08s) |
| 4 | GitHub Actions CI/CD Pipeline | ✅ | `.github/workflows/ci.yml` (typecheck, lint, build, audit) |
| 5 | Regression suiti otomasyonu (145 test) | ✅ | `tools/dogrulama.ps1` ve `npm run ci` otomasyonu |

---

## FAZ 27 — Production Environment Hazırlığı — ✅ TAMAM

| # | Madde | Durum | Not |
|---|-------|-------|-----|
| 1 | dev/staging/production ortam ayrımı | ✅ | `server/config/environment.ts` ortam yapılandırıcısı (10/10 test PASS) |
| 2 | Database ayrımı (çoklu ortam stratejisi) | ✅ | `DATABASE_PATH` ortam değişkeni ve `getDatabasePath()` desteği |
| 3 | API key + webhook secret ortam bazlı | ✅ | `.env.example` şablon tam envanter standardizasyonu |
| 4 | Hızlı Bilişim canlı credential izolasyonu | ✅ | `HIZLI_BILISIM_ALLOW_PROD` fail-closed koruması |

---

## FAZ 28 — Monitoring & Observability — ✅ TAMAM

| # | Madde | Durum | Not |
|---|-------|-------|-----|
| 1 | Auth/payment/error/admin log yapısı | ✅ | `server/services/monitoringService.ts` yapılandırılmış kategori bazlı loglama (AUTH, PAYMENT, ERROR, ADMIN, WEBHOOK, SYSTEM) |
| 2 | Dashboard (hata oranı, API süreleri) | ✅ | API metrik agregasyonu: 2xx/3xx/4xx/5xx dağılımı, hata yüzdesi, avg/max/p95 gecikme süreleri, yavaş istek (>1000ms) izleme |
| 3 | Login denemesi izleme | ✅ | `recordAuthEvent()` ile başarılı/başarısız girişler, IP dağılımı ve şüpheli denemelerin izlenmesi |
| 4 | Webhook durum izleme | ✅ | `recordWebhookEvent()` ile sağlayıcı bazlı (`hizli`, `mock-payment`) hacim, imza doğruluğu ve teslimat durumu |
| 5 | Observability API | ✅ | `server/routes/v1/monitoring.ts`: `/metrics`, `/logs`, `/health` uç noktaları (SUPER_ADMIN/ADMIN korumalı) |

---

## FAZ 29 — UAT — ✅ TAMAM

Firma akışları (kayıt, kullanıcı+rol), muhasebe akışları (cari/fatura/ödeme/rapor), e-belge akışları (oluşturma/gönderim/cevap) — ✅ hepsi.
- **Suite:** `server/tests/faz29UatScenarioSuite.ts` (17/17 PASS, 0 FAIL)
- **Kullanıcı & Kiracı:** 4 rol (`COMPANY_ADMIN`, `MUHASEBE`, `SATIS`, `DEPO`) ve kiracı izolasyonu doğrulandı (IDOR=0).
- **Muhasebe & Ticari:** Cari kartı, stok kartı, 3.600 TL satış faturası, 1.600 TL banka tahsilatı, cari bakiye (2.000 TL), tekdüzen yevmiye kayıtları (120, 600, 391, 102, 621, 153).
- **Bilanço Denkliği Değişmezi:** Aktif (27.100 TL) === Pasif (27.100 TL), **Fark = 0,00 TL**.
- **e-Dönüşüm & Rapor:** UBL-TR XML üretimi, idempotent kuyruk ve KDV Beyannamesi (Matrah 3.000 TL, KDV 600 TL) doğrulandı.

---

## FAZ 30 — Release Candidate — ✅ TAMAM

- **Teknik Kapı:** ✅ Build PASS · ✅ Test PASS · ✅ Security PASS · ✅ Backup PASS (12/12 PASS, `server/tests/faz30ReleaseCandidateGateTest.ts`)
- **İş Kapısı:** ✅ Canlı hesaplar · ✅ Kullanıcı listesi & RBAC · ✅ Eğitim ve Dokümantasyon (`docs/52_FAZ30_RELEASE_CANDIDATE_RAPORU.md`)
- **Sürüm:** `v2.0.0-rc1`

---

## FAZ 31 — Canlıya Alma (Go-Live) — ✅ TAMAM

1. ✅ Production DB snapshot → 2. ✅ Environment açılışı (`NODE_ENV=production`) → 3. ✅ Deploy → 4. ✅ Health check (`/api/health` + `/api/v1/monitoring/health`) → 5. ✅ İlk firma testi → 6. ✅ İlk belge testi (UBL-TR 2.1 & Bilanço Fark=0,00 TL) → 7. ✅ İzleme (FAZ 28 aktif telemetri)
- **Suite:** `server/tests/faz31GoLiveExecutionTest.ts` (7/7 PASS, 0 FAIL)
- **Rapor:** `docs/53_FAZ31_CANLIYA_ALMA_GO_LIVE_RAPORU.md`
- **Sürüm:** `v2.0.0-production`

---

## Kritik Yol (güncel durumla)

```
FAZ 25 (25.1, 25.2-A..E, 25.3, 25.4, 25.5) ✅ TAMAM
FAZ 18 & FAZ 19 (Koşu 11 & Gate #6) ✅ TAMAM
FAZ 26 CI/CD Standardizasyonu ✅ TAMAM
FAZ 27 Production Environment ✅ TAMAM
FAZ 28 Monitoring & Observability ✅ TAMAM
FAZ 29 UAT (17/17 PASS, Fark=0,00 TL) ✅ TAMAM
FAZ 30 Release Candidate (12/12 PASS) ✅ TAMAM
   ↓
FAZ 31 Canlıya Alma (Go-Live) ✅ TAMAM (7/7 PASS)
```

**Sonuç:** Tüm fazlar (FAZ 18 - FAZ 31) başarıyla tamamlanmış ve canlı dağıtıma hazır hale getirilmiştir.
