# İŞBEY — FAZ 25.2-C Doğrulama Protokolü (beklemede)

**Tarih:** 2026-09-09 · **Durum:** KOD TAMAM — koşu kanıtı bekleniyor
**Kesinti sebebi:** Linux çalışma alanı (VM) oturum boyunca ayağa kalkmadı (Plan9 mount hatası, 5 deneme → bash kullanılamadı). Derleme/test koşusu yapılamadı; bu yüzden 25.2-C PASS İLAN EDİLEMEZ.

---

## Yapılan Kod Değişiklikleri (koşusuz)

| Dosya | Değişiklik |
|-------|-----------|
| `server/security/policies.ts` | +`resolveRequestTenantId(req)` (fail-closed) + `TenantResolutionError` + `TenantBearerRequest` — TEK kaynak tanım |
| `server/routes/v1/` 25 dosya | 73 güvensiz nokta + marketplace `/test-connection` body-default'u → `resolveRequestTenantId(req)` = **74 çağrı** |
| `server/tests/faz252cTenantSourcingTest.mjs` | YENİ statik suit (6 bölüm) |
| `docs/18` | 25.2-C durumu güncellendi |

**Swap edilen 25 dosya:** accountant, activity-logs, advanced-reports, ai, ai-insights, approvals, automations, bank-matching, billing, client, developer, devices, document-ai, documents, field-collections, marketplace, messages, onboarding, payment-links, pos, promotions, support-faz8, tasks, visits, whitelabel.

**Statik grep kanıtı (dosya araçlarıyla, koşusuz):**
- Eski desen (`req.query|body.tenantId as string` / `'x-tenant-id'` yetki kaynağı) routes altında **0 eşleşme** (kalan 5 referansın tamamı kuralı anlatan YORUM).
- `resolveRequestTenantId(req)` = 25 dosyada 74 çağrı.
- mobile.ts FAZ 25.1 deseninden (tenantFromToken) dokunulmadı.
- accountant `/clients/:id/monthly-report` (path + `isAccountantAuthorizedForTenant`) dokunulmadı.
- documents/public-share, payment-links/resolve|pay (public uçlar) tenantId'e zaten dokunmuyor.
- Frontend `?tenantId=` göndermiyor (src/ genelinde grep 0) → normal akış davranışı korunur.

## Bilinçli Davranış Notları

1. **accountant /requests** artık token tenant'ına sabit. Eski kod query ile cross-tenant listelemeye izin veriyordu (IDOR). Meşru mali müşavir cross-tenant senaryosu (portföy) 25.2-D'de delegasyon modeliyle ele alınacak.
2. **Fail-closed:** `req.tenantId` yoksa `TenantResolutionError` → Express 5 sync throw'u global error middleware'e (index.ts:242) taşır → 500 + `TENANT_UNRESOLVED` mesajı. securityGate.defaultDeny tüm /api/*'ı requireAuth'a soktuğu için bu yol pratikte yalnızca yapısal hatada tetiklenir.
3. public uçlar (login, webhook, plans, knowledge, public-share, resolve, pay) requireAuth'tan geçmez ama bunların handler'ları zaten tenantId çözümlemiyor.

## VM Döndüğünde Koşulacak Doğrulama Zinciri (sırayla)

```bash
# 1) rsync + CJS derleme (noEmitOnError: false — TS 6 tuzağı; bkz. docs/17 VM notu)
rsync -a --exclude node_modules --exclude dist --exclude data "/mnt/işbey/server" /tmp/f25c/
#    → /tmp/f25c/tsconfig.server.json: files=[server/index.ts, server/middleware/moduleGate.ts], noEmitOnError:false
cd /tmp/f25c && (package.json'dan "type":"module" sil) && cp .env && tsc -p tsconfig.server.json > /tmp/c.log 2>&1
# Emit kanıtı:
grep -c resolveRequestTenantId dist/server/security/policies.js        # ≥1
grep -c resolveRequestTenantId dist/server/routes/v1/field-collections.js  # ≥1
grep -c "req.headers\['x-tenant-id'\]" dist/server/routes/v1/*.js      # 0 (yorumlar dahil olabilir — kaynak testi mjs'te)

# 2) Yeni statik suit (repo kökünden)
node server/tests/faz252cTenantSourcingTest.mjs          # 6 bölüm PASS beklenir

# 3) Tam regresyon (140): Registry 31 + Gate 43 + İzolasyon 7 + 25.2-A 19 (temiz data!) + FAZ19 45
#    + health + login + bir auth'lu GET (field-collections) + cross-tenant negatif
```

**Koşu sonrası karar kuralı:** 140/140 + yeni suit PASS → 25.2-C PASS ilan edilir, docs/18'deki 🔄 işareti ✅ olur. Herhangi bir FAIL → raporlanır, PASS gösterilmez.

## Sonraki Adım

25.2-D Authorization Test Platformu (rol×endpoint matrisi + MODULE_ROLES↔MODULE_ACCESS_MATRIX hizalama + accountant delegasyon testleri).

---

## EK (2026-09-09, oturum 2) — VM Döndüğünde Koşulacak Tüm Yeni Kalemler

25.2-C zincirinin YANINA bu oturumda yazılan koşusuz kodlar da eklendi (hepsi koşu kanıtı bekliyor):

```bash
# 4) FAZ 25.2-D jeneratör + hizalama testi (repo kökünden)
node server/tests/faz252dAuthzMatrixGenerator.mjs        # authz-matrix.json üretir; unknown guard ~0 beklenir
node server/tests/faz252dFrontendMatrixAlignmentTest.mjs # 'employee' slug düzeltmesi sonrası tüm bölümler PASS beklenir

# 5) FAZ 25.3 #2 fail-closed webhook regresyonu
#    faz25SecurityGateTest.mjs §7 güncellendi: imzasız webhook → 401/503 beklenir (eski beklenti "!= 401" idi)
#    NOT: .env artık PAYMENT_WEBHOOK_SECRET + WEBHOOK_SECRET içeriyor → fail-closed yolu 401 (imzasız) üretir.
#    503 yolunu ayrıca test etmek isterseniz .env'deki PAYMENT_WEBHOOK_SECRET'ı boşaltıp koşun.

# 6) Bey360 firma bazlı token registry — tsc emit + statik kanıt
grep -c ensureTenantToken dist/server/services/providers/hizliTeknoloji.js   # ≥1
grep -c "tokenStore" dist/server/services/providers/hizliTeknoloji.js        # 0 beklenir (bağımlılık kaldırıldı)
grep -c "resolveTenantWsCredentials" dist/server/services/hizliTenantCredentialRegistry.js  # ≥1
grep -c "mock-valid-signature" dist/server/routes/v1/payments.js             # 0 beklenir
grep -c "isbey-webhook-secret-key-2026" dist/server -r                       # 0 beklenir
grep -c "UtilEncrypt Data" dist/server/services/hizliBilisim/hizliBilisimClient.js  # 0 beklenir (log sızıntısı kapandı)

# 7) FAZ 25.4 Production Security — kanıt komutları (sunucu koşarken)
#    a) Security headers:
curl -sI http://127.0.0.1:4000/api/health | grep -Ei "x-content-type-options|x-frame-options|referrer-policy"
#    beklenen üç satır: nosniff / DENY / no-referrer
#    b) Login rate limit (21. istek 429 olmalı):
for i in $(seq 1 21); do curl -s -o /dev/null -w "%{http_code} " -X POST http://127.0.0.1:4000/api/auth/login -H "Content-Type: application/json" -d '{"username":"yok","password":"yok"}'; done; echo
#    beklenen: 20×401 ardından 1×429
#    c) Webhook rate limit (1 dk / 60) — imzasız istekler 401 döner ama bucket dolar:
for i in $(seq 1 61); do curl -s -o /dev/null -w "%{http_code} " -X POST http://127.0.0.1:4000/api/v1/payments/webhook -H "Content-Type: application/json" -d '{}'; done; echo
#    beklenen: 60×401 ardından 1×429
#    d) CORS allowlist (CORS_ALLOW_ORIGINS .env'e yazıldıysa):
curl -sI -X OPTIONS http://127.0.0.1:4000/api/health -H "Origin: https://yabanci-site.example" | grep -i access-control-allow-origin
#    allowlist aktifken boş dönmeli; allowlist boşken (mevcut davranış) origin yansır

# 8) FAZ 25.2-D #2 runtime authz suiti (sunucu koşarken, repo kökünden)
node server/tests/faz252dRuntimeAuthzSuite.mjs
#    önce authz-matrix.json üretir (yoksa), sonra 9 rol × tüm uçlar taraması yapar.
#    Çıktı: server/tests/output/runtime-authz-results.json — FAIL=0 hedefi.
#    SKIP satırları iki nedenden gelir: yan etkili yazma uçları (ALLOW tarafı)
#    ve handler-içi rol kontrolü olan dosyalarda belirsiz sonuçlar — manuel inceleme listesi.

# 9) FAZ 25.5 backup retention + checksum kanıtları (sunucu koşarken)
#    a) SUPER_ADMIN login ile backup al → checksum self-doğrulaması dönsün:
TOKEN=$(curl -s -X POST http://127.0.0.1:4000/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).token")
curl -s -X POST http://127.0.0.1:4000/api/settings/backup -H "Authorization: Bearer $TOKEN"
#    beklenen: success:true, checksumVerified:true, filename backup_*.json
#    b) sidecar varlığı + checksum bütünlüğü (repo kökünden):
ls data/backups/*.sha256 | tail -1
node -e "const fs=require('fs'),crypto=require('crypto');const f=fs.readdirSync('data/backups').filter(x=>x.endsWith('.json')).sort().pop();const h=crypto.createHash('sha256').update(fs.readFileSync('data/backups/'+f)).digest('hex');const exp=fs.readFileSync('data/backups/'+f+'.sha256','utf8').trim().split(/\\s+/)[0];console.log(f, h===exp?'CHECKSUM MATCH':'CHECKSUM MISMATCH');"
#    beklenen: CHECKSUM MATCH
#    c) retention: BACKUP_RETENTION_COUNT=3 ile 5 backup al → klasörde ≤3 json kalır
```

**Bu oturumda değişen dosyalar (koşusuz, oturum 2–4 toplamı):** hizliBilisimClient.ts (log sızıntısı + TTL), payments.ts (webhook secret + rate limit), mockPaymentProvider.ts, integrations.ts (fail-closed imza + rate limit), index.ts (securityHeaders + CORS allowlist), middleware/productionSecurity.ts (YENİ), routes/auth.ts + routes/v1/mobile.ts (login rate limit), electronicDocumentService.ts (race kilidi + idempotency durum listesi birleşimi + setImmediate .catch), electronicDocumentQueue.ts (exponential backoff), db/storage.ts (crypto import + backup checksum sidecar + pruneBackups + verifyBackupChecksum), routes/settings.ts (backup self-doğrulama + audit), tests/productionFinalGateTest.ts (DB-BACKUP-002), faz25SecurityGateTest.mjs (§7), .env/.env.example (webhook secret + 25.4 + 25.5 env'leri), modulePermissions.ts ('employee'→'PERSONEL'), hizliTenantCredentialRegistry.ts (YENİ), hizliTeknolojiProvider.ts (firma bazlı token sürümü), e-invoice-settings.ts (invalidateTenant), faz252dAuthzMatrixGenerator.mjs (YENİ; dosya-genel requireRole okuması), faz252dFrontendMatrixAlignmentTest.mjs (YENİ), faz252dRuntimeAuthzSuite.mjs (YENİ), docs/18, docs/20, docs/21, docs/22.
