# İŞBEY CLOUD — FAZ 25.3-G/H Performans Denetimi ve Prod Hazırlık Raporu

**Tarih:** 2026-09-08
**Kapsam:** 25.3-G Performans denetimi + 25.3-H Prod hazırlık kontrol listesi
**Önceki rapor:** [docs/15_FAZ25_3_SISTEM_FINALIZASYON_RAPORU.md](15_FAZ25_3_SISTEM_FINALIZASYON_RAPORU.md)

---

## Yönetici Özeti

Bu denetim yalnızca **inceleme + riskli olmayan eklemeler** içerir. Muhasebe/stok/KDV mantığına, RBAC yapısına ve mevcut davranışlara dokunulmamıştır. Denetim boyunca tespit edilen eksiklerden biri (eksik health endpoint) araştırıldığında endpoint'in zaten mevcut olduğu (index.ts:244) doğrulanmış ve yanlış ikinci tanım geri alınmıştır.

**Bu oturumda yapılan kalıcı değişiklikler:**

| # | Değişiklik | Dosya | Risk |
|---|-----------|-------|------|
| 1 | Bildirim dropdown paneli (boş durum + severity renkleri, gerçek `SystemNotification` şemasıyla) | `src/components/layout/Header.tsx` | Düşük |
| 2 | Kullanıcı menüsüne "Yardım & Destek" bağlantısı (`support-center` görünümü zaten mevcut) | `src/components/layout/Header.tsx` | Düşük |
| 3 | Kullanıcı dostu HTTP hata mesajları (`humanizeHttpError` — sunucu mesajı varsa AYNEN korunur) | `src/services/api.ts` | Düşük |
| 4 | Banka/Kasa görünümlerinde boş durum kartları (hesap yoksa yönlendirici mesaj) | `BankAccountView.tsx`, `CashRegisterView.tsx` | Düşük |
| 5 | Kullanılmayan ölü import temizliği (`v1PaymentsRouter` — TS2724 üretiyordu) | `server/index.ts` | Düşük |

**Geri alınan değişiklik:** `/api/health` için yeni handler eklenmişti; mevcut health endpoint'inin (index.ts:244, `{"status":"healthy",...,"version":"2.0.0"}` yanıtı) üzerine binmesi Expression ilk-kazanır davranışla mevcut yanıt formatını değiştireceğinden geri alındı. Canlı smoke ile mevcut formatın korunduğu doğrulandı (200 OK).

---

## 25.3-G — Performans Denetimi

### G.1 Frontend

| Bulgu | Durum | Detay |
|-------|-------|-------|
| Code splitting (React.lazy/Suspense) | **YOK** | `src/App.tsx` tüm modülleri statik import ediyor. SPA tek bundle'a derleniyor. |
| Ağır bağımlılıklar | **Bilinen yük** | `jspdf` + `html2canvas` (yalnız PrintModal), `chart.js` (Dashboard/ReportDesigner), `canvas-confetti` (SetupWizard/POS) statik importlu — açılış bundle'ında taşııyorlar. |
| Vite chunking ayarı | **Varsayılan** | `vite.config.ts` minimal (proxy + port). `manualChunks` yok. |
| Mobil uyum | ✅ 25.3-F tamam | Responsive CSS + hamburger + grid collapse. |
| DataGrid loading skeleton | ✅ 5 görünümde aktif | Cari/Kasa/Banka/Fatura/Stok. |

**Bundle boyut ölçümü:** VM'de tamamlanamadı (Vite 8/rolldown, Linux native binding `@rolldown/binding-linux-x64-gnu` Windows node_modules'ında yok). Build, kullanıcının Windows ortamında çalışmaktadır; ölçüm için kullanıcı ortamında `npm run build` çıktısındaki chunk tablosu yeterlidir.

**Öneri (uygulanmadı — onay gerektirir):** Sadece PrintModal için `jspdf`/`html2canvas` dinamik import (`await import(...)`), route seviyesinde `React.lazy` ile Dashboard/POS/RaporTasarımcı ayrıştırması. Tahmini ilk yükleme kazancı: ağır bağımlılıklar açılıştan çıkarsa belirgin düşüş. Bu, bileşen yükleme davranışını değiştirdiği için tek başına onay konusudur.

### G.2 Backend

| Bulgu | Durum | Detay |
|-------|-------|-------|
| Veri saklama | JSON dosya (atomic write) | `saveDatabase()` tmp+rename ile güvenli yazım; boyut ~1.4 MB (canlı). |
| Transaction deseni | Tam klon + commit | Her işlemde `JSON.parse(JSON.stringify(db))` — küçük veri hacminde kabul edilebilir; veri büyürse (10 MB+) yazım gecikmesi izlenmeli. |
| Backup | ✅ `data/backups/` | Otomatik zaman damgalı yedekler (son: 2026-09-05). |
| Rate limiting | **Kısmi** | Yalnız developer API platform katmanında (`server/services/faz9/apiPlatformService.ts`). `/api/auth/login` ve `/api/v1/mobile/auth/login` için ayrı limiter YOK — securityGate P5 notunda 25.4'e bırakılmış. |
| JWT secret | ✅ Fail-fast | `JWT_SECRET` yoksa boot'ta açık hata (fallback yok — kural uyumlu). |

---

## 25.3-H — Prod Hazırlık Kontrol Listesi

### H.1 Güvenlik

- [x] DEFAULT DENY security gate tüm /api/* üzerinde aktif (canlı smoke: korunabilir route 401)
- [x] Permission registry tek kaynak; 57 route noktası kanonik sabitlere bağlı (26/26 test)
- [x] Frontend permission-map üretim hattı + güncellik testi
- [x] `.env` `.gitignore` içinde (satır 16-19)
- [x] JWT_SECRET fallback yok; eksikse fail-fast
- [x] Hızlı Bilişim: TEST mod (`econnecttest`) + `IS_TEST_MODE` kilidi korunuyor; canlı açılmaz (QA onayına kadar — değimez kural)
- [x] Health endpoint bilgi sızdırmıyor (yalnız status/version/timestamp)
- [ ] **AÇIK — Rate limit**: login ve mobile login uçlarında hız sınırı yok (Sprint 25.4 planı — securityGate P5 notu ile uyumlu)
- [ ] **AÇIK — CORS**: `app.use(cors())` tamamen açık (origin kısıtı yok). İç network/same-origin dağıtımda risk düşük, public dağıtımda kapatılmalı.
- [ ] **AÇIK — Webhook imza doğrulaması**: payments/integrations webhook'ları securityGate notunda 25.3'te zorunlu hale gelmesi bekleniyordu; hâlâ imza kontrolü yok (P1-P6 listesinde "Sprint 25.4'e" düzeltilmeli).

### H.2 Operasyon

- [x] Health endpoint mevcut (LB/monitör için P3 allowlist'inde) — canlı smoke 200 OK
- [x] Otomatik backup dizini aktif (`data/backups/`)
- [x] Atomic DB write (tmp+rename) — yarım yazım bozulması riski kapalı
- [ ] **AÇIK — console.log envanteri**: sunucu kaynak kodunda 19 adet (index.ts request logger + HIZLI_CONNECT akışları). Plan: `NODE_ENV=production` altında sessize alacak küçük bir logger yardımcı davranış değişikliği sayılmaz ama tek başına onaylı sprint konusu yapılmalı. Not: `hizliBilisimClient.ts:109` UtilEncrypt verisini logluyor — **canlıya geçmeden ÖNCE** bu satırın hassas veri sızdırmadığı ayrıca incelenmelidir (şifreli veri loglanıyor olsa da doğrulanmalı).
- [ ] **AÇIK — Log rotasyonu / izleme**: FAZ 24.5'te tanımlanan monitoring gereksinimleri (upstream alert, disk doluluk) henüz kurulmadı.
- [x] Node v22 ortamı; `npm run build` pipeline tanımlı

### H.3 Veri & Muhasebe

- [x] Dönem sonu bilanço değişmedi: Aktif = Pasif + Öz Kaynak, Fark = 0,00 TL (FAZ 19 suiti 45/45 PASS ile korunuyor)
- [x] Tenant izolasyonu testleri PASS (İzolasyon 7/7)
- [x] data/database.json üretim verisi test kopyalarına DOKUNULMADAN kullanıldı (yalnız /tmp kopyada değişiklik)

---

## Doğrulama Kanıtları

| Doğrulama | Sonuç |
|-----------|-------|
| Frontend tsc (Header, api, BankAccount, CashRegister) | 0 hata |
| Backend tsc index.ts (ölü import sonrası, index.ts kapsamı) | index.ts hatasız (diğer dosyalar: bilinen baseline hataları değişmedi) |
| Sunucu boot + canlı smoke (test kopya, port 4000) | 18 sn'de hazır; `/api/health` 200 + mevcut format; `/api/customers` 401 |
| Registry testi (repo kökünden) | 26/26 PASS |

**VM kısıtı notu:** `npm run build` (Vite 8) VM'de Linux rolldown binding'i olmadan koşmuyor; bu kısıt yalnızca ölçüm içindir, kod etkisi yoktur.

---

## Kalan Açık Kalemler (onaylı sprint konuları)

1. **25.2-B kalanı**: moduleGate'in registry'ye bağlanması (frontend modül erişim kararı — #33)
2. **25.2-C**: Resource Ownership Hardening (74 IDOR noktası → policies.ts bağlama)
3. **25.4**: login/mobile-login rate limit + webhook imza doğrulaması (securityGate notlarıyla hizalı)
4. **Code splitting onayı**: PrintModal dinamik import + route lazy loading (G.1 önerisi)
5. **console.log azaltma + UtilEncrypt log denetimi** (H.2)
6. **CORS origin kısıtı** (dağıtım topolojisi netleşince)
