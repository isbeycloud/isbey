# Tenant yapısı incelemesi — 21 Eylül 2026

> 22 Eylül güncellemesi: Aşağıdaki bulgular inceleme tarihindeki durumu anlatır. Üyelik/rol düzeltmeleri ve kalan canlıya geçiş başlıkları [60 numaralı uygulama raporunda](60_FIRMA_UYELIK_ROLLERI_2026-09-22.md) kayıtlıdır.

## Sonuç: tenant izolasyonu için canlıya geçiş engeli var

Önceki dar kapsamlı sürüm testleri bu uçları kapsamıyordu. Bu incelemede dört güvenlik sorunu izole test veritabanında gerçek HTTP çağrılarıyla yeniden üretildi. Önceki dağıtım arşivi bu bulgular düzeltilip yeniden test edilmeden kullanılmamalıdır. Bu çalışma incelemedir; üretim kodu ve gerçek müşteri kayıtları değiştirilmedi.

## Portal erişimi

Kullanıcının belirttiği Hızlı Teknoloji ManagementPanel adresi uygulama içi tarayıcıda `net::ERR_BLOCKED_BY_CLIENT` hatasıyla açılamadı. Kullanılabilir başka bağlı tarayıcı bulunmadı. Giriş yapılmadı; portal ekranları veya gerçek hesabın müşteri hiyerarşisi gözlenmedi. Aşağıdaki değerlendirme yerel projeye aittir, portalın doğrulanmış davranışı değildir. Kullanıcının verdiği giriş bilgileri bu rapora veya test dosyasına yazılmadı.

## Mevcut model

- `Tenant`: firma, VKN/TCKN, plan, hizmetler, lisans, limitler ve dış sağlayıcı müşteri kimliği.
- `User`: platform rolü, ana `companyId` ve `allowedCompanyIds`.
- `TenantUser`: kullanıcı-firma üyeliği, tenant rolü, active/passive/pending durumu ve deletedAt.
- `Role`: sistem genelinde veya tenant'a özel izin kümesi.
- `TenantEinvoiceSettings`: tenant + sağlayıcı + TEST/PRODUCTION bağlamında şifreli kimlik bilgileri ve gönderici tanımları.
- JWT `tenantId` istek bağlamını taşıyor. Bunun yanında `db.activeTenantId` ve `db.company` şeklinde bütün kullanıcılara ortak bir aktif firma durumu da var.
- Hızlı Bilişim eşleştirmesinde `Tenant.externalCustomerId` ile dış müşteri kaydındaki `isbeyCompanyId` bağlantısı tutuluyor. `/match-company` iki kaydı eşliyor; handler içinde VKN eşitliği ve mevcut farklı eşleştirmeye karşı kontrol görülmedi. Bunun portal kimlik modeliyle uyumu erişim sağlanınca doğrulanmalı.

## HTTP ile doğrulanan bulgular

| Öncelik | Bulgu | Kanıt |
| --- | --- | --- |
| P1 | Başka firmanın detaylarına erişim ve kullanıcı parola alanı sızıntısı | Kendi firması dışına yetkisi olmayan COMPANY_ADMIN ile `GET /api/admin/companies/:otherId` 200 verdi. Diğer tenant döndü; `details.users` içinde `passwordHash` alanı vardı. |
| P1 | Yetkisiz firma değiştirme ve ortak aktif firma durumunun değiştirilmesi | Aynı kullanıcıyla `POST /api/admin/companies/:otherId/switch` 200 verdi; `db.activeTenantId` hedef firmaya değişti. |
| P1 | Başka tenant'ın özel rolünün değiştirilmesi | `PUT /api/roles/:otherRoleId` 200 verdi ve diğer firmaya ait test rolünün adı değişti. |
| P1 | Pasif/silinmiş tenant üyeliğinin erişimi durdurmaması | Test kullanıcısının üyeliği `status=passive` ve `deletedAt` dolu olmasına rağmen kimlik kapısı isteği kabul etti. |

Kaynaklar:

- `server/routes/companies.ts`: detay handler'ı yalnız requireAuth kullanıyor; tenant sahipliği kontrol etmiyor, kullanıcı nesnelerini süzmeden döndürüyor. Depo/kasa/banka listeleri de tenant filtresiz. Router hem `/api/admin/companies` hem `/api/companies` altında bağlı.
- Aynı dosyanın switch handler'ı yalnız requireAuth ve hedef firmanın askıda olma kontrolünü yapıyor; üyelik/allowedCompanyIds kontrolü yok. Ortak `db.company` de değişiyor. JWT yenilenmiyor.
- `server/routes/roles.ts`: PUT rolü sadece ID ile buluyor; özel rolün tenantId'sini çağıranın tenantId'siyle karşılaştırmıyor. DELETE handler'ında bu kontrol mevcut, PUT'ta eksik.
- `server/middleware/authGuards.ts`: requireAuth üyeliğin status/deletedAt değerlerini kontrol etmiyor. Token tenant'ına üyeliği doğrulamıyor; role çözümlemesi yalnız slug üzerinden yapılıyor. Tenant kimliği eksik tokenlarda ortak aktif tenant'a dönüş var.

Test `.verify-tmp/tenant-review.mjs` ile, yeni oluşturulan `.verify-tmp/tenant-review-*` veritabanında çalıştı. Gerçek Express router'ları ve defaultDeny/requireAuth middleware'leri kullanıldı. Dış ağ veya entegratör çağrısı yapılmadı. Test kasten gözlenen hatalı davranışı kaydeder; güvenli davranışa PASS veren regresyon süiti değildir.

## Önerilen hedef yapı ve düzeltme sırası

1. Firma yönetim listesi/detay uçlarını platform yöneticisi ile sınırlandırın veya firma kullanıcısı için ayrı tenant kapsamlı görünüm verin. Parola hash'i, oturum kimliği ve entegrasyon sırlarını API DTO'larından çıkarın. Depo/kasa/banka koleksiyonlarını da tenant bazında süzün.
2. Firma geçişini tek uçta birleştirin: mevcut kullanıcı ve aktif üyeliği doğrulansın; yeni JWT üretilebilsin. Firma geçişi ortak `db.company` veya `db.activeTenantId` değiştirmesin. Firma profili istek tenant'ından çözülsün.
3. Her istekte aktif üyelik ve tenant durumu doğrulansın. Platform yöneticisi istisnası açık ve merkezi olsun. Eksik tenant kimliği reddedilsin. Özel roller roleId + tenantId ile çözülsün.
4. Özel rol değiştirmede sahiplik ve atanabilir izin sınırı uygulansın; başka tenant'ın rolü değiştirilemesin.
5. Sağlayıcı hesabını ERP kimliklerinden ayırın: yerel tenant kimliği, sağlayıcı müşteri kimliği, VKN/TCKN ve TEST/PRODUCTION ortamı açık eşleştirilsin. Bayi hesabı altında görünen müşterilerin tümü otomatik olarak ERP kullanıcısının erişim yetkisi sayılmasın.
6. A/B tenant izolasyonu, çoklu firma geçişi, üyelik iptali, özel rol sahipliği ve response secret süzme testleri sürüm kapısına eklensin. Ardından yeni dağıtım paketi üretip doğrulayın.

Portal karşılaştırmasını tamamlamak için ManagementPanel, firma/müşteri listesi, kullanıcı yetkileri ve firma geçişi ekranlarının erişilebilir olması gerekir. Portal şifresi ekran görüntülerinde görünmemelidir.
