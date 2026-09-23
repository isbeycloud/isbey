# İŞBEY CLOUD — FAZ 30: RELEASE CANDIDATE (RC) RAPORU
**Tarih:** 2026-09-19  
**Durum:** ✅ ONAYLANDI (TEKNİK KAPI: 12/12 PASS)  
**Sürüm:** `v2.0.0-rc1`  

---

## 1. Yönetici Özeti
FAZ 26 (CI/CD), FAZ 27 (Production Environment), FAZ 28 (Monitoring & Observability) ve FAZ 29 (UAT - 17/17 PASS, Bilanço Denkliği Fark=0,00 TL) başarıyla tamamlanmasının ardından, **FAZ 30 Release Candidate (RC)** kapısı işletilmiştir.

Sistem, üretim ortamına dağıtıma hazır olduğunu 4 ana teknik sütun ve iş hazırlık kriterleriyle kanıtlamıştır.

---

## 2. Teknik Doğrulama Kapısı Sonuçları (12 / 12 PASS)

| Sütun | Test ID | Senaryo | Sonuç | Kanıt |
|-------|---------|---------|-------|-------|
| **BUILD** | `RC-BLD-001` | Vite Production Bundle Mevcudiyeti | ✅ PASS | `dist/index.html` ve `dist/assets` mevcut |
| **BUILD** | `RC-BLD-002` | Production JS/CSS Minified Varlıklar | ✅ PASS | JS bundle (2.46 MB gzip 584 KB) + CSS (39.4 KB) üretildi |
| **BUILD** | `RC-BLD-003` | Veritabanı Şema Yükleme ve Bellek Bütünlüğü | ✅ PASS | Tüm koleksiyonlar eksiksiz ve tip güvenli yüklendi |
| **TEST** | `RC-TST-001` | Sistem Health Check Sözleşmesi & Metrikler | ✅ PASS | `/api/health` + `/api/v1/monitoring/health` sözleşme formatı korundu |
| **TEST** | `RC-TST-002` | Bilanço Denkliği Değişmezi (Tekdüzen Hesap Planı) | ✅ PASS | Aktif === Pasif, **Fark = 0,00 TL** |
| **TEST** | `RC-TST-003` | Kiracı İzolasyonu & Sıfır IDOR Veri Sızıntısı | ✅ PASS | Kullanıcılar kiracı sınırları içinde korumalı, yetkisiz sızıntı yok |
| **SECURITY**| `RC-SEC-001` | Ortam Güvenlik Yapılandırması (Fail-Closed) | ✅ PASS | JWT secret gücü (>=32 karakter) ve webhook secret doğrulaması |
| **SECURITY**| `RC-SEC-002` | Hızlı Bilişim Canlı İzolasyonu (Sandbox Lock) | ✅ PASS | Non-prod ortamda canlı kredansiyel koruması devrede |
| **SECURITY**| `RC-SEC-003` | RBAC Platform Admin İzin Hiyerarşisi | ✅ PASS | `tenants.manage` vb. sistem izinleri alt rollere sızmıyor |
| **BACKUP** | `RC-BAK-001` | Atomic JSON Snapshot Yedekleme | ✅ PASS | `storage.backup()` ile zaman damgalı dump üretildi |
| **BACKUP** | `RC-BAK-002` | SHA-256 Checksum Sidecar Doğrulaması | ✅ PASS | `.sha256` sidecar hash doğrulaması byte-for-byte eşleşti |
| **BACKUP** | `RC-BAK-003` | Yedek Veri Bütünlüğü ve Restore Edilebilirlik | ✅ PASS | Snapshot dosyasının JSON şeması ve kayıtları doğrulandı |

---

## 3. İş Hazırlık Kontrol Listesi

### 3.1. Canlı Hesaplar ve Entegratör Hazırlığı
- **Hızlı Bilişim Entegratörü:** FAZ 18 ve FAZ 19 Koşu 11 ile uçtan uca doğrulanmıştır. Canlıya geçiş anında `HIZLI_BILISIM_ALLOW_PROD=true` ve canlı API kredansiyelleri `production` ortamına enjekte edilecektir.
- **Kredi / Kontör Yönetimi:** Kontör düşüm ve iade mekanizmaları atomik işlem garantisi altındadır.

### 3.2. Kullanıcı Listesi ve Rol Matrisi
- **Süper Yönetici:** `admin` (`SUPER_ADMIN` platform rolü, sistem geneli ve yedekleme yetkisi).
- **Firma Yöneticisi:** `COMPANY_ADMIN` (kendi firmasında tam yetkili, çapraz firma erişimi engelli).
- **Mali Müşavir / Muhasebe:** `MUHASEBE` (yevmiye, defter-i kebir, mizan, bilanço, KDV beyannamesi, fatura mutabakatı).
- **Satış / Ön Muhasebe:** `SATIS` (cari açılış, teklif, sipariş, satış faturası, tahsilat).
- **Kasa / Depo:** `KASA` / `DEPO` (nakit kasa, stok hareketleri, irsaliye giriş/çıkış).

### 3.3. Dokümantasyon ve Eğitim Kiti
- **Kullanım Kılavuzları:** `docs/` altında e-belge, muhasebe akışları ve kullanıcı yetkilendirme kılavuzları mevcuttur.
- **Canlı QA Test Ekranı:** `/api/test-screen` ve frontend entegrasyonu operasyonel destek için hazırdır.

---

## 4. FAZ 31 (Canlıya Alma / Go-Live) Eylem Planı
1. **Adım 1: Production DB Snapshot:** Canlıya alma anındaki mevcut veri tabanının SHA-256 imzalı snapshot yedeğinin alınması.
2. **Adım 2: Environment Yapılandırması:** `NODE_ENV=production`, güçlü `JWT_SECRET`, `WEBHOOK_SECRET` ve canlı portal ayarlarının aktif edilmesi.
3. **Adım 3: Deploy & Dağıtım:** Vite üretim varlıkları ve Node.js sunucusunun yayına alınması.
4. **Adım 4: Canlı Health Check:** `/api/health` ve `/api/v1/monitoring/health` uçlarının izlenmesi.
5. **Adım 5: İlk Pilot Firma & İlk Belge:** Kontrollü canlı test belgesinin oluşturulması ve izleme dashboard'undan doğrulanması.
