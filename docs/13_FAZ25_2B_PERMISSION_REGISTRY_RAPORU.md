# FAZ 25.2-B — PERMISSION REGISTRY (TEK KAYNAK) SPRINT RAPORU

**Tarih:** 2026-09-08
**Kapsam:** Onaylı B-1 — registry oluşturma + test altyapısı (mevcut davranış DEĞİŞMEDİ)
**Durum:** ✅ B-1 TAMAMLANDI — 131/131 test PASS, canlı veri bütünlüğü korundu

---

## 1. Yönetici Özeti

Onaylı uygulama modeline göre B-1 tamamlandı: `server/security/` altında tek kaynak
registry kuruldu (permissions.ts + roles.ts + policies.ts iskeleti + index.ts barrel),
mevcut storage seed / route / frontend davranışı **hiç değiştirilmeden** tutarlılık
testi ile kanıtlandı. Sprint sonunda durum:

> ✅ yeni sistem kaynak oldu (eski sistem henüz kaldırılmadı — migration onay bekliyor)

---

## 2. Oluşturulan Dosyalar

```
server/security/
├── permissions.ts   → TEK KAYNAK: 49 permission kodu (PERMISSIONS sabitleri)
├── roles.ts         → Rol matrisi: 5 tenant rolü ↔ izin listeleri (seed ile birebir)
├── policies.ts      → 25.2-C altyapısı: AuthContext + tenantOwnsResource +
│                      canAssignPlatformRole + canManageUserRecord (BAĞLI DEĞİL — iskelet)
└── index.ts         → Barrel + assertRegistryConsistency()

server/tests/
├── faz252bPermissionRegistryTest.mjs → Registry Consistency Test (17 test, YENİ)
├── faz25SecurityGateTest.mjs         → FAZ 25.1 gate suiti (43) — proje içine kalıcı taşındı*
├── faz25IzolasyonTest.mjs            → FAZ 25.1 izolasyon suiti (7) — kalıcı taşındı*
├── faz252aAuthorizationTest.mjs      → FAZ 25.2-A suiti (19) (önceki sprint)
└── testServer19.mjs                  → FAZ 19 izole test sunucusu (4719) — kalıcı taşındı*
```

\* VM ortam sıfırlaması nedeniyle /tmp'de kaybolan test altyapısı oturum kaydından
kurtarıldı ve **proje içine kalıcı** olarak taşındı — bundan sonra VM resetlerinden
bağımsız sürüm kontrollü test suitleri kullanılacak.

---

## 3. Registry İçeriği

**49 permission kodu** = 37 mevcut katalog + 7 resmileştirilen + 5 rezerve:

| Grup | Kodlar | Not |
|------|--------|-----|
| Mevcut katalog (37) | customers.*, products.*, invoices.*, quotes.*, waybills.*, cash.*, expenses.*, reports.view, users.*, company.*, tenants.manage | birebir korundu |
| **Resmileştirilen (7)** | bank.view, bank.create, collections.create, collections.cancel, einvoice.view, warehouses.view, warehouses.update | Route'larda kullanılıyordu, katalogda TANIMSIZDI (envanter bulgusu) → artık resmi |
| Rezerve (5) | accounting.view/create/approve/delete, backup.manage | Onaylı kapsam listesi; hiçbir route'a BAĞLI DEĞİL |

**Rol matrisi (storage seed ile birebir):** platform_admin = tüm izinler;
company_admin = tüm − tenants.manage; accountant = 20 izin; employee = 11 izin;
viewer = 9 izin. Kodun `PLATFORM_ADMIN` diye ayrı rolü olmadığı (= SUPER_ADMIN/ADMIN)
belgelenmiş durumda; `PLATFORM_ROLE_TO_SLUG` eşlemesinin tek kaynağı roles.ts oldu.

---

## 4. Test Sonuçları — 131/131 PASS

| Suit | Test | Sonuç |
|------|------|-------|
| FAZ 25.2-B Registry Consistency (YENİ) | 17 | ✅ 17/17 |
| FAZ 25.1 Security Gate (regresyon) | 43 | ✅ 43/43 |
| FAZ 25.1 İzolasyon (regresyon) | 7 | ✅ 7/7 |
| FAZ 25.2-A Authorization (regresyon) | 19 | ✅ 19/19 |
| FAZ 19 Negatif Erişim (regresyon, 4719) | 45 | ✅ 45/45 |
| **TOPLAM** | **131** | **✅ 131/131 PASS** |

**Registry Consistency Test'in doğruladıkları (kabul kriterleri karşılığı):**

| Kabul kriteri | Kanıt |
|---------------|-------|
| Permission tek kaynak | permissions.ts tek katalog; seed'in 37 kodu registry alt kümesi |
| Duplicate permission tanımı | 0 (assertRegistryConsistency) |
| Route registry uyumu | %100 — routes/ altındaki 29 unique requirePermission kodunun tamamı tanımlı |
| Frontend uyumu | Matris hizalaması B-4'te (registry'den üretim hattı planlı) |
| Tanımsız permission | 0 (7 eski tanımsız kod resmileştirildi) |
| Rezerve set | 5 kod; hiçbir route'a bağlı değil (test zorunlu tutuyor) |

**Canlı veri bütünlüğü:** `data/database.json` md5 = `36322a81e3b1519cfafc1ad674df03b3`
(değişiklik YOK — registry yalnızca yeni dosya ekledi).

---

## 5. Mimari Kararlar

1. **"Yeni sistem kaynak oldu" ilkesi:** Eski seed/route/frontend dokunulmadı.
   Registry var ve tutarlılığı testle kanıtlı; migration ayrı onayla yapılacak.
2. **policies.ts iskeleti:** 25.2-C'deki "bu kullanıcı bu kayda gerçekten sahip mi?"
   sorusu için AuthContext + tenantOwnsResource + canAssignPlatformRole +
   canManageUserRecord tanımlandı — saf değerlendiriciler, hiçbir router'a bağlı değil.
3. **Rezerve kod mekanizması:** accounting.*/backup.manage katalogda yaşamaya başladı
   ama Consistency Test bunların route'lara bağlanmasını ŞU ANDA İHLAL sayıyor —
   bağlama kararı bilinçli adımda verilir.
4. **moduleGate.ts** taslak statüsünde kaldı (runtime etkisi yok) — registry
   tamamlandığı için artık gerçek enforcement katmanına dönüştürülmeye hazır.

---

## 6. Kalan İşler / Sonraki Adım

| Adım | İçerik | Durum |
|------|--------|-------|
| B-2 | storage.ts seed'ini registry'den türetme (dublicate tanımın sıfırlanması) | ⏳ onay bekliyor (task #36) |
| B-3 | Route requirePermission çağrıları → PERMISSIONS sabitleri (57 nokta/14 dosya); authGuards PLATFORM_ROLE_TO_SLUG bağlantısı | ⏳ onay bekliyor |
| B-4 | Frontend matrisinin registry'den üretimi (generate-permission-map hattı) | ⏳ onay bekliyor |
| 25.2-C | Resource Ownership Hardening (74 IDOR noktası) — policies.ts'i route'lara bağlama | sırada |
