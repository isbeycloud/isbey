# İŞBEY CLOUD — FAZ 25.2-B B-5: authGuards/moduleGate Registry Bağlama Raporu

**Tarih:** 2026-09-08
**Kapsam:** Task #33 kalan kısmı — rol eşleme kopyalarının security registry'ye bağlanması (B-5)
**Önceki raporlar:** [docs/13](13_FAZ25_2B_PERMISSION_REGISTRY_RAPORU.md) · [docs/16](16_FAZ25_3_PERFORMANS_VE_PROD_HAZIRLIK_DENETIMI.md)

---

## Amaç

Registry (server/security/{permissions,roles,policies}.ts) B-2/B-3/B-4 ile storage seed, route izinleri ve frontend snapshot'ın tek kaynağı olmuştu. Bu fazda kalan son iki **rol eşleme kopyası** da registry'ye bağlandı:

| Bağlama | Dosya | Eski durum | Yeni durum |
|---------|-------|-----------|------------|
| Platform rol → tenant slug | `server/middleware/authGuards.ts` (requireAuth) | Inline if-else zinciri (`SUPER_ADMIN/ADMIN→platform_admin`, `COMPANY_ADMIN→company_admin`, `MUHASEBE→accountant`, `RAPOR→viewer`, diğer→`employee`) | `PLATFORM_ROLE_TO_SLUG[resolvedUser.role] \|\| 'employee'` (registry import) |
| Tenant slug → platform rol | `server/middleware/moduleGate.ts` (effectiveRoles) | Yerel `ROLE_SLUG_MAP` sabiti (platform_admin→SUPER_ADMIN, company_admin→COMPANY_ADMIN, accountant→MUHASEBE, viewer→RAPOR) | `SLUG_TO_PLATFORM_ROLE` (registry import, `RoleSlug` cast) |

## Davranış Eşdeğerliği Analizi (değişiklik öncesi kanıt)

B-5 **davranışı değiştirmez**; yalnızca kopyayı tek kaynağa taşır:

1. **authGuards:** `PLATFORM_ROLE_TO_SLUG` eşlemesi eski if-else zinciriyle birebir aynıdır (`SUPER_ADMIN→platform_admin`, `ADMIN→platform_admin`, `COMPANY_ADMIN→company_admin`, `MUHASEBE→accountant`, `RAPOR→viewer`). Bilinmeyen roller her iki tarafta da `employee` fallback'ine düşer.
2. **moduleGate:** `SLUG_TO_PLATFORM_ROLE` ile eski yerel map arasındaki tek fark `employee→PERSONEL` girdisidir. Bu fark **nötrdür** çünkü (a) `MODULE_ROLES` kurallarının hiçbirinde `PERSONEL` rolü yer almaz — eşleme yalnızca red/yoluna düşen aday kümesini etkiler ve sonuç aynıdır; (b) `platform_admin→SUPER_ADMIN` farkı da nötrdür çünkü her `MODULE_ROLES` kuralı `SUPER_ADMIN` ve `ADMIN`'i birlikte içerir ve zaten adım 1'de platform admin kısa devre ile geçer.
3. Frontend permission-map snapshot'ı (B-4) bu değişiklikten **etkilenmez** — rol matrisleri (ROLE_PERMISSIONS) değişmedi; registry testi §6 güncellik denetimi PASS ile doğrulandı.

## Değişen Dosyalar

- `server/middleware/authGuards.ts` — import + requireAuth eşleme bloğu (5 satır → 3 satır, tek kaynak)
- `server/middleware/moduleGate.ts` — import + yerel `ROLE_SLUG_MAP` kaldırıldı + `effectiveRoles` registry üzerinden

## Doğrulama Kanıtları (tam regresyon, B-5 kodu üzerinde)

| Suit | Sonuç |
|------|-------|
| Permission Registry (§1-§6, snapshot güncellik dahil) | **26/26 PASS** |
| SecurityGate (FAZ 25.1) | **43/43 PASS** |
| Tenant İzolasyonu | **7/7 PASS** |
| 25.2-A Authorization (temiz data) | **19/19 PASS** |
| FAZ 19 Negatif Erişim | **45/45 PASS** |
| **TOPLAM** | **140/140 PASS** (değişiklik öncesi baseline ile aynı) |

Derleme doğrulaması: moduleGate+authGuards birlikte tsc strict → 0 hata. Emit kanıtı: `dist/server/middleware/authGuards.js` içinde `PLATFORM_ROLE_TO_SLUG` (2 referans) mevcut, eski inline zincir 0 referans; `dist/server/middleware/moduleGate.js` içinde `SLUG_TO_PLATFORM_ROLE` (2 referans).

**VM derleme notu:** TS 6.0'da projedeki bilinen baseline hatalar (174 adet — schema/seed/storage kaynaklı) `noEmitOnError` varsayılanı yüzünden emit'i engelliyordu. Test kopyasında `noEmitOnError: false` içeren `tsconfig.server.json` ile emit gerçekleştirildi ve testler gerçek B-5 çıktısı üzerinde koşuldu. Bu, repo tsconfig'ine bir değişiklik DEĞİLDİR.

## Bilinçli Olarak Yapılmayan Şey (onay konusu)

**moduleGate route'lara montaj edilmedi.** `moduleGate('ayarlar')` gibi bağlamalar router'lara eklendiğinde YENİ 403 yanıtları üretmeye başlar (COMPANY_ADMIN'in bazı uçlara erişimi kapanabilir) — bu mevcut davranış değişikliğidir ve ayrı onay fazı gerektirir. Middleware, registry'ye bağlı ve kullanıma hazır taslak hâlindedir (`Kullanım` başlığındaki deseni izlemelidir). Ayrıca `MODULE_ROLES` ↔ frontend `MODULE_ACCESS_MATRIX` hizalama testi de bu fazın parçası olmalıdır.

## Kalan Açık Kalemler

1. moduleGate enforcement montajı + MODULE_ROLES↔MODULE_ACCESS_MATRIX hizalama testi (**onay gerekli** — davranış değiştirir)
2. 25.2-C: Resource Ownership Hardening (74 IDOR noktası → policies.ts)
3. 25.4: login/mobile-login rate limit + webhook imza doğrulaması
4. Code splitting (PrintModal dinamik import + route lazy) — onay gerekli
