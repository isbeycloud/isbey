# İŞBEY CLOUD ERP — FAZ 24: PRODUCTION READINESS REVIEW

**Rapor Tarihi:** 07 Eylül 2026
**Kapsam:** Build pipeline, environment yapılandırması, deployment riskleri, yedekleme stratejisi, monitoring
**Yöntem:** Yalnızca inceleme — **hiçbir kod değiştirilmedi.** Tüm bulgular kaynak koddan doğrulanmıştır.
**Genel Durum:** ⚠️ **KOŞULLU HAZIR** — Muhasebe motoru, rol/izin mimarisi ve Hızlı Bilişim sandbox hazırlığı sağlam. Ancak canlıya alma öncesi aşağıdaki KRİTİK bulgular kapatılmalıdır.

---

## 1. BUILD PIPELINE

### Mevcut Durum
`package.json` script'leri: `dev` (concurrently: tsx watch + vite), `build` (`tsc -b && vite build`), `lint` (oxlint), `preview`. Kök `tsconfig.json` proje referanslarıyla (`tsconfig.app.json` + `tsconfig.node.json`) düzenli. Frontend tip kontrolü ve server derlemesi FAZ 22'de 0 hata ile doğrulandı.

| # | Bulgu | Şiddet |
|---|-------|--------|
| 1.1 | **Server production build'i yok.** `server` script'i `tsx watch server/index.ts` — geliştirme aracı. Canlıda TS kodu her istekte JIT derlenir; `watch` modu bellek/performans maliyeti ve kazara dosya izleme riski taşır. | KRİTİK |
| 1.2 | **CI/CD yok.** `.github/workflows` yok; build/test dağıtımdan önce otomatik koşmuyor. Test paketleri (FAZ 23'te tümü PASS) ancak elle çalıştırılabiliyor — `test` script'i bile `package.json`'da tanımlı değil. | YÜKSEK |
| 1.3 | **Static serving yok.** Server `dist/` klasörünü serve etmiyor; frontend ayrı süreç (vite dev proxy → :4000) ile çalışıyor. Tek makine deploy'u için ek yapı (nginx veya express static) gerekli. | ORTA |
| 1.4 | `tsc -b` yalnızca frontend'i derler (`tsconfig.node.json` sadece `vite.config.ts` kapsar); server derlemesi hiçbir script'e bağlı değil. | ORTA |
| 1.5 | Container (Dockerfile/docker-compose) veya PM2/systemd süreç tanımı yok. | ORTA |

**Öneri:** `build:server` (tsc → `server-dist/`) ve `start` (node server-dist/index.js) script'leri; `test` script'i; basit bir GitHub Actions (lint + tsc + test paketleri) tanımlanmalı.

---

## 2. ENVIRONMENT CONFIGURATION

### Mevcut Durum
`.env` yalnızca Hızlı Bilişim credential'ları + `JWT_SECRET` içeriyor; `.gitignore` doğru (`.env*` hariç tutulmuş, git repo olmasa da koruma mevcut). `.env.example` şablonu güncel ve gerçek değerler içermiyor. `JWT_SECRET` fallback'i FAZ 9'da kaldırıldı — secret yoksa sunucu açılmıyor (doğru davranış).

| # | Bulgu | Şiddet |
|---|-------|--------|
| 2.1 | **Hardcode fallback secret:** `server/routes/v1/payments.ts:16` → `process.env.PAYMENT_WEBHOOK_SECRET \|\| 'isbey-webhook-secret-key-2026'`. Env tanımsızsa ödeme webhook'u BİLİNEN bir anahtarla doğrulanır. CLAUDE.md "fallback şifresi YASAK" kuralı ihlali. | **KRİTİK** |
| 2.2 | **Env-config sapması:** `.env.example` → `PORT=3001, NODE_ENV=development`; kod → `PORT \|\| 4000`, `NODE_ENV` yalnızca request logger'da kullanılıyor. Production'da `NODE_ENV=production` hiçbir davranışı değiştirmiyor. | ORTA |
| 2.3 | **Eksik env değişkenleri:** Kod `HIZLI_BILISIM_PORTAL_USERNAME/PASSWORD`, `PAYMENT_WEBHOOK_SECRET`, `WEBHOOK_SECRET` okuyor; hiçbiri `.env`/`.env.example` içinde tanımlı değil → portal tabanlı işlemler sessizce alternatif yola düşer, webhook imza kontrolü (bkz. 3.2) devre dışı kalır. | YÜKSEK |
| 2.4 | **`app.use(cors())` tamamen açık:** Her origin kabul ediliyor. Canlıda belirli domain'lere kısıtlanmalı. | YÜKSEK |
| 2.5 | `.env` gerçek credential'ları içeriyor ve şu an sandbox'a işaret ediyor — doğru. Canlıya geçişte bu değerlerin rotasyonu gerekir (raporun sonunda onay maddesi). | BİLGİ |

---

## 3. DEPLOYMENT RISKLERİ

### 3.1 Guard'sız Route'lar — EN KRİTİK BULGU

`requireAuth`/`requireRole`/`requirePermission` veya alternatif herhangi bir auth deseni (inline `jwt.verify`, `Authorization` başlığı, API key kontrolü) **hiçbirini içermeyen** route dosyaları taraması sonucu:

**Ana routes (16 dosya):** `ai.ts`, `checks.ts`, `cost-centers.ts`, `employees.ts`, `expenses.ts`, `form-designs.ts`, `import.ts`, `quotes.ts`, `reports.ts`, `search.ts`, `settings.ts`, `sync.ts`, `tenants.ts`, `users.ts`, `waybills.ts` + (`auth.ts` — login/register hariç, normal)

**v1 routes (29 dosya):** `activity-logs`, `advanced-reports`, `ai`, `ai-insights`, `approvals`, `automations`, `bank-matching`, `billing`, `client`, `dealer`, `developer`, `devices`, `document-ai`, `documents`, `field-collections`, `integrations`, `marketplace`, `messages`, `mobile`, `onboarding`, `payment-links`, `plans`, `platform-admin`, `pos`, `promotions`, `support-faz8`, `tasks`, `visits`, `whitelabel`

Örnek doğrulama: `GET /api/users` tüm kullanıcı listesini (rol, e-posta, son giriş) **token'sız** döndürüyor; `GET /api/tenants` tüm tenant verilerini; `POST /api/settings/backup` yedek üretimi için kimlik doğrulaması istemiyor. Bu, CLAUDE.md'deki "Backend'de her route requireAuth + requireRole/requirePermission ile korunur" kuralının geneline aykırı. FAZ 19 negatif testleri yalnızca auth/authGuards zincirine sahip route'ları kapsıyordu; bu dosyalar o zincirin dışında.

| # | Bulgu | Şiddet |
|---|-------|--------|
| 3.1 | 45 route dosyası tamamen korumasız — tenant izolasyonu ve RBAC bu yollarda uygulanmıyor. | **KRİTİK** |
| 3.2 | `POST /api/v1/integrations/:provider/webhook`: imza kontrolü yalnızca `provider==='hizli'` **ve** `WEBHOOK_SECRET` tanımlıysa yapılır. Env boşsa **herkes** e-belge statüsü manipüle edebilir. | **KRİTİK** |
| 3.3 | `MockPaymentProvider` gerçek ödeme webhook yolunda (`v1/payments.ts`) kullanılıyor — mock sağlayıcı production akışına girmiş durumda. | YÜKSEK |
| 3.4 | **Rate limit yok** (hiçbir endpoint'te). Login brute-force ve API kötüye kullanımı açık. Security.md "Rate limiting on all endpoints" maddesi karşılanmıyor. `helmet` güvenlik başlıkları da yok. | YÜKSEK |
| 3.5 | `express.json({ limit: '10mb' })` tek başına makul, ancak rate limit olmadan 10MB gövde DoS yüzeyi. | ORTA |
| 3.6 | **Graceful shutdown / global handler yok:** `uncaughtException`, `unhandledRejection`, `SIGTERM/SIGINT` işlenmiyor. Süreç duruşunda bellek-içi DB tam yazılmamış olabilir (bkz. 4.3). | YÜKSEK |
| 3.7 | Global error handler `err.message`'i istemciye döndürüyor — iç hatalarda bilgi sızıntısı potansiyeli. | ORTA |

---

## 4. BACKUP STRATEJİSİ

### Mevcut Durum
`storage.backup()` mevcut; `data/backups/` altında 7 manuel yedek var (20 Ağu – 3 Eyl). `saveDatabase` atomik (tmp + rename) — iyi. Audit log 5.000 kayıtta budanıyor.

| # | Bulgu | Şiddet |
|---|-------|--------|
| 4.1 | **Zamanlanmış yedekleme yok.** Sunucuda yalnızca Hızlı Connect token yenileme `setInterval`'i var. Yedek yalnızca elle (`POST /api/settings/backup`) alınabiliyor — o da guard'sız (3.1). | **KRİTİK** |
| 4.2 | **`backup()` atomik değil:** Doğrudan `writeFileSync` kullanıyor (`saveDatabase`'in aksine). Yedek yazımı yarıda kesilirse bozuk yedek oluşabilir. | YÜKSEK |
| 4.3 | **Retention/politika yok:** Yedekler sınırsız birikir, aynı diskin `data/` klasöründe tutulur. Disk arızası = veri + yedek kaybı. Uzak depolama (S3 vb.) entegrasyonu yok. | YÜKSEK |
| 4.4 | **Restore mekanizması yok:** Yedekten geri yükleme kodu/komutu bulunmuyor — yedek almak tek başına RTO sağlamaz. | YÜKSEK |
| 4.5 | Veri tek `database.json` (≈15MB) — dosya tabanlı mimarinin doğal riski: tek bozulma noktası. Atomic write bu riski azaltıyor ama ortadan kaldırmıyor. | ORTA |
| 4.6 | Kullanıcıya sunulan `database.json` backup'larından biri (180KB, 20 Ağu) diğerlerinden belirgin küçük — manuel alınan erken yedek. Politika tanımlanınca temizlenmeli. | BİLGİ |

---

## 5. MONITORING GEREKSİNİMLERİ

### Mevcut Durum
Request logger (method/path/status/süre, `console.log`), `console.error`/`warn` (68 çağrı), `/api/health` (statik), audit log (DB içinde, 5.000 kayıt cap). Loglama/metrik/alert kütüphanesi **yok** (pino/winston/morgan/sentry/prometheus hiçbiri kurulu değil).

| # | Bulgu | Şiddet |
|---|-------|--------|
| 5.1 | **Health endpoint yüzeysel:** Her zaman `healthy` döner; DB yazılabilirliğini, Hızlı Bilişim token durumunu, disk alanını kontrol etmez. Load balancer/orkestratör gerçek sağlığı göremez. | YÜKSEK |
| 5.2 | **Yapılandırılmış loglama yok:** `console.log` tabanlı, JSON formatında değil, istek-ID/korelasyon yok. Üretimde olay takibi fiilen imkânsız. CLAUDE.md `console.log` yasağı yalnızca request logger'a istisna tutularak bile tam uyumlu değil (server'da 19 `console.log` çağrısı). | YÜKSEK |
| 5.3 | **Metrik yok:** İstek gecikmesi dağılımı, hata oranı, bellek/heap, aktif tenant sayısı — hiçbiri toplanmıyor. FAZ 12 performans testleri ölçebiliyor ama canlı gözlemlenebilirlik sıfır. | ORTA |
| 5.4 | **Hızlı Bilişim token yenileme hatası yalnızca `console.warn`** — alarm yok. Token süresi biterse e-Belge akışı sessizce durur; ancak 23.00'te kimse bakmıyorsa sabaha kadar fark edilmez. | YÜKSEK (canlıda kritik) |
| 5.5 | Audit log DB'nin içinde — DB bozulursa denetim izi de kaybolur. Yedeklerle birlikte saklanmalı. | ORTA |
| 5.6 | Disk doluluk izleme yok: JSON growth + sınırsız backup klasörü diski doldurabilir; dolu diskte atomic write hata verir ama süreç yaşamaya devam eder. | ORTA |

---

## 6. ÖNCELİKLİ EYLEM PLANI (Kod değişikliği gerektirenler — ayrı onay fazı)

### Kilit (Canlıya almadan önce zorunlu)

1. **45 guard'sız route'a `requireAuth` + rol/izin guard'ları eklenmesi** (3.1) — RBAC mimarisi zaten mevcut (`authGuards.ts`); uygulama mekanik ama kapsamlı.
2. **`PAYMENT_WEBHOOK_SECRET` fallback'inin kaldırılması** (2.1) — env yoksa açık hata, mock provider'ın prod yoldan çıkarılması (3.3).
3. **Webhook imza kontrolünün koşulsuz hale getirilmesi** (3.2) — secret tanımsızsa isteği reddet.
4. **Rate limit + helmet + CORS kısıtlama** (3.4, 2.4).
5. **Server build + start script'i** (1.1) ve `npm run build`'in hedef makinede doğrulanması.

### Yüksek (İlk hafta)

6. Zamanlanmış backup (saatlik) + atomik backup yazımı + retention (örn. günlük 7, haftalık 4 kopya) + restore prosedürü dokümanı (4.1–4.4).
7. Graceful shutdown handler'ları (3.6) + `/api/health`'i DB/token kontrollü hale getirme (5.1).
8. Eksik env değişkenlerinin `.env.example`'a eklenmesi, `NODE_ENV` davranışlarının tanımlanması (2.2, 2.3).
9. Hızlı Bilişim token hatası için alarm yolu (5.4) — canlıya geçişte zorunlu.

### Orta (İlk ay)

10. Yapılandırılmış loglama (pino gibi) + request-ID, console.log'ların migrate edilmesi (5.2).
11. Metrik toplama ve log shipped (Loki/Sentry vb.) (5.3), disk doluluk uyarısı (5.6).
12. CI pipeline (lint + tsc + mevcut test paketleri) (1.2), static serve veya reverse-proxy yapılandırması (1.3).

---

## 7. SONUÇ

Muhasebe doğruluğu, rol/izin mimarisi, tenant izolasyon mantığı ve Hızlı Bilişim sandbox güvenliği (FAZ 1–23) sağlam ve test edilmiş durumda. Ancak **canlıya alma (production) bu raporun Kilit maddeleri (§6.1–6.5) kapatılana kadar önerilmez** — özellikle 45 guard'sız route ve webhook fallback secret, FAZ 23 QA raporundaki "tüm testler PASS" sonucunu geçersiz kılacak düzeyde deployment-spesifik açıklardır (testler korumalı kod yollarını doğruladı; bu route'lar o yolların dışındaydı). Canlı Hızlı Bilişim geçişi zaten ayrı onay fazına bağlı; bu rapor o onayı vermez.

**Pozitif notlar:** JWT fallback yasağı uygulanıyor, atomic DB write mevcut, credential'lar kaynakta yok, .gitignore doğru, seed/test verileri temiz, tüm QA test paketleri PASS.

---
*Bu inceleme salt okunur yapılmıştır; §6'daki maddelerin uygulanması ayrı bir çalışma planı ve onayı gerektirir.*
