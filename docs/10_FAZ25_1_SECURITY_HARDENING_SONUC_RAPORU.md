# İŞBEY CLOUD — FAZ 25.1 SECURITY HARDENING SONUÇ RAPORU

**Tarih:** 2026-09-07
**Sprint:** 25.1 (Default Deny + Public Allowlist + IDOR Düzeltmeleri)
**Kapsam dışı (onay gereği):** Payment imza katmanı, Rate limiting, Helmet — Sprint 25.2-25.4
**Canlı deployment:** YAPILMADI (tüm testler izole ortamda koşuldu; canlı DB md5 bütünlüğü doğrulandı)

---

## 1. Uygulanan Değişiklikler

### 1.1 YENİ: `server/middleware/securityGate.ts`
DEFAULT DENY güvenlik kapısı. Allowlist dışındaki HER `/api/*` isteği `requireAuth`'tan geçer.

**Onaylı public allowlist (12 desen):**
| # | Yol | Gerekçe |
|---|-----|---------|
| P1 | POST /api/auth/login | Kimlik doğrulama girişi |
| P2 | POST /api/auth/register | Deneme kaydı (prod: invitation-code planı) |
| P3 | GET /api/health | LB/monitör |
| P4 | GET /api/v1/plans (+/:id) | Read-only fiyat listesi |
| P5 | POST /api/v1/mobile/auth/login | Mobil cihaz girişi |
| P6 | GET /api/v1/support-faz8/knowledge | Public yardım makaleleri (firma verisi içermez) |
| W1 | POST /api/v1/payments/webhook | İmza katmanı Sprint 25.3'te zorunlu olacak |
| W2 | POST /api/v1/integrations/:id/webhook | Aynı |
| T1 | GET /api/v1/documents/public-share/:token | Handler içinde token doğrulaması |
| T2 | GET /api/v1/payment-links/resolve/:token | Aynı |
| T3 | POST /api/v1/payment-links/pay | Aynı |

**Kritik teknik not:** `app.use('/api', gate)` mount'unda Express `req.path`'i öneksiz
verir (`/health`). İlk test koşumunda bu nedenle public yollar da 401 döndü
(43 testin 18'i FAIL). Eşleştirme `req.originalUrl` üzerinden tam yola yapılarak
düzeltildi — bu hata sınıfı için test suitinde kalıcı pozitif kontrol var.

### 1.2 `server/index.ts`
- `app.use('/api', defaultDeny)` — cors/json'dan SONRA, tüm router mount'larından ÖNCE.

### 1.3 `server/routes/v1/mobile.ts` (tam yeniden yazım)
- Sahte `mob-jwt-*` token KALDIRILDI → gerçek JWT (JWT_SECRET imzalı, 30 gün, type:'mobile').
- `runTransaction` sonucu artık `await` ediliyor (önceki kodda Promise beklenmeden
  `.device` okunuyordu → her mobil login 500/403 döndürebilirdi — gerçek hata bulundu).
- Pasif kullanıcı mobil login'de 403.
- **IDOR düzeltmesi:** tenantId yalnızca `req.tenantId` (token). `?tenantId=` ve
  `x-tenant-id` istek parametreleri KALDIRILDI.
- Cihaz revoke: yalnızca cihaz sahibi veya SUPER_ADMIN/ADMIN/COMPANY_ADMIN;
  `revokedBy` token'dan gelir (istek gövdesinden DEĞİL).

### 1.4 `server/routes/auth.ts`
- `GET/POST /auth/users` → `requireAuth + requireRole(SUPER_ADMIN, ADMIN, COMPANY_ADMIN)`.
- **`switch-company` fallback yasağı:** `db.users[0]` fallback'i kaldırıldı (CLAUDE.md
  açık yasağı). Geçersiz token → 401.
- Login girdi tipi doğrulaması: string olmayan `username` (NoSQL payload) → 400
  (önceden 500 + Express hata sayfası).

### 1.5 `server/routes/users.ts` (önemli RBAC + izolasyon)
- Router seviyesi: `requireAuth + requireRole(SUPER_ADMIN, ADMIN, COMPANY_ADMIN)`.
- **Tenant izolasyonu:** COMPANY_ADMIN yalnızca kendi şirketinin kullanıcılarını
  listeler/düzenler/siler; SUPER_ADMIN/ADMIN tümünü görür.
- **Yetki yükseltme yasağı:** platform admin olmayan SUPER_ADMIN/ADMIN rolü atayamaz;
  COMPANY_ADMIN kendi rolünü yükseltemez.
- Şifreler bcrypt ile hashlenir (önceden `passwordHash: password` DÜZ METİN — kritik bulgu).
- Yanıtlarda `passwordHash` alanı sızmaz.
- Kullanıcı oluşturmada hedef şirket: platform admin `companyId` seçebilir; diğerleri
  otomatik kendi şirketine atanır.

### 1.6 `server/routes/tenants.ts`
- Router seviyesi `requireRole('SUPER_ADMIN', 'ADMIN')` → tenant yönetimi INTERNAL.

---

## 2. Değişen Dosya Listesi

| Dosya | İşlem | Satır etkisi |
|-------|-------|--------------|
| server/middleware/securityGate.ts | YENİ | +95 |
| server/index.ts | 2 satır ekleme | +2 |
| server/routes/v1/mobile.ts | Yeniden yazım | ~330 satır |
| server/routes/auth.ts | 3 düzeltme | ~+25/-15 |
| server/routes/users.ts | RBAC + izolasyon + bcrypt | ~+55/-8 |
| server/routes/tenants.ts | 2 satır ekleme | +3 |

**Dokunulmayan:** muhasebe/stok/KDV/cari/kasa/banka mantığı ve DB şeması (kural #3).
**Canlı veri:** `data/database.json` md5 `36322a81...` değişmedi (testler /tmp izole data'da).

---

## 3. Test Sonuçları

| Suit | Ortam | Sonuç |
|------|-------|-------|
| FAZ 25.1 Security Gate Testi (43 test: public allowlist, default deny, RBAC, IDOR, mobil JWT, pasif kullanıcı, webhook) | İzole sunucu :4000 | **43/43 PASS** |
| FAZ 25.1 Tenant İzolasyon Doğrulaması (7 test: COMPANY_ADMIN kapsamı, rol yükseltme yasağı, hedef şirket ataması, hash sızıntısı) | İzole sunucu :4000 | **7/7 PASS** |
| FAZ 19 Negatif Erişim Regresyonu (45 test: rol izolasyonu, izin matrisi, tenant geçişi, sızıntı kontrolleri) | İzole test sunucusu :4719 | **45/45 PASS** |

**Toplam: 95/95 PASS (0 FAIL)**

Süreçte yakalanan ve düzeltilen hatalar:
1. Mount-path uyumsuzluğu → public yollar bloklanıyordu (originalUrl düzeltmesi).
2. `mobile.ts` `runTransaction` await edilmemesi → mobil login kırık olurdu.
3. `users.ts` düz metin şifre saklama + passwordHash yanıt sızıntısı.
4. `users.ts` `companyId` destructure eksikliği (SUPER_ADMIN hedef şirket senaryosu 400 dönüyordu).
5. Login'de string olmayan identifier → 500 (input doğrulama eklendi).

---

## 4. Kabul Kapısı Değerlendirmesi (Sprint 25.1)

| Kriter | Durum |
|--------|-------|
| Korumasız route sayısı = 0 (AUTH düzeyinde) | ✅ defaultDeny tüm /api/* kapsıyor |
| IDOR = 0 (mobil bootstrap tenant kaynağı) | ✅ yalnızca token |
| Public endpoint yalnızca onaylı listede | ✅ 12 desen, kod review'lı |
| Tenant bypass = 0 (kullanıcı yönetimi) | ✅ COMPANY_ADMIN kendi şirketiyle sınırlı |
| Hardcoded secret = 0 (değişen dosyalar) | ✅ tarama temiz |
| Mock payment prod'da | ⏸ Sprint 25.2-25.3 konusu (kapsam dışı) |
| Security test PASS | ✅ 43/43 + 7/7 |
| Regression PASS | ✅ 45/45 |

**SONUÇ: Sprint 25.1 kabul kriterleri KARŞILANDI.**

---

## 5. Kalan Riskler / Bilinen Sınırlar (ertelenenler)

1. **Webhook imza katmanı (YÜKSEK):** `/api/v1/payments/webhook` public; handler
   fallback secret (`isbey-webhook-secret-key-2026`) ve boş imzada geçen
   `mock-valid-signature` default'u içeriyor. Sprint 25.3'te: zorunlu HMAC imzası +
   PAYMENT_WEBHOOK_SECRET boot-time doğrulaması (fallback YASAK).
2. **Salt-AUTH dosyalar (ORTA):** 41 route dosyası yalnızca global AUTH korumalı;
   modül-bazlı RBAC yok. Sprint 25.2'de modül matrisine göre sarılacak
   (öncelik: settings/backup, platform-admin, billing, developer keys).
3. **Rate limit yok (ORTA):** login/mobil-login/register uçları brute-force'a açık.
   Sprint 25.4.
4. **CORS açık (ORTA):** `app.use(cors())` herkese açık. Prod'da origin allowlist
   gerekli. Sprint 25.2/25.4.
5. **Helmet yok (DÜŞÜK):** güvenlik başlıkları eksik. Sprint 25.4.
6. **JSON-file storage:** backup route atomik değil (FAZ 24 bulgusu; ayrı iş kalemi).

## 6. Sonraki Adımlar

- **Sprint 25.2:** Salt-AUTH 41 dosyaya modül RBAC + CORS origin allowlist.
- **Sprint 25.3:** Payment webhook imza katmanı + MockPaymentProvider prod kilidi.
- **Sprint 25.4:** Rate limiting + Helmet + audit log iyileştirmeleri.
- Hepsinden sonra FAZ 24 kriterleri yeniden değerlendirilecek → GO/NO-GO.
