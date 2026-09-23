# Kullanıcı–firma üyelikleri — 22 Eylül 2026

> Sonraki çalışma: Burada kalan olarak listelenen firma ayarları, ERP süresi ve sağlayıcı eşleştirmesi [61 numaralı raporda](61_CANLI_ONCESI_TAMAMLAMA_2026-09-22.md) ele alındı. Aşağıdaki kapsam notları bu üyelik çalışmasının tamamlandığı anı anlatır.

## Uygulanan davranış

- Kullanıcı ortak hesaptır; firma rolü `TenantUser` üyeliğine bağlıdır. Üyelik `roleIds` ile birden fazla sistem veya o firmaya ait özel rol taşır. İzinler bu rollerin birleşimidir.
- Aynı kişi A firmasında yönetici, B firmasında muhasebeci olabilir. Firma değişimi yeni JWT üretir; ortak `db.company` veya `db.activeTenantId` değiştirilmez. Üç eski geçiş adresi aynı handler'ı kullanır.
- Her korumalı istekte aktif kullanıcı, token'ın firma kimliği, aktif/silinmemiş üyelik ve erişilebilir firma doğrulanır. Roller ve izinler veritabanından yeniden hesaplanır; token içindeki eski rol beyanı yetki kaynağı değildir.
- Pasif/pending/silinmiş üyelik erişemez. Silinmiş veya rolü kaldırılmış üyelik eski token ile erişim sağlayamaz. Bir üyelik kaldırıldığında hesap ve diğer üyelikler korunur.
- SUPER_ADMIN/ADMIN platform hesapları ayrı istisnadır. Firma üyeliklerine platform rolü atanamaz. Firma yöneticisi yalnız aktif firmasındaki mevcut üyelikleri yönetir; başka firmaya üyelik ekleyemez ve ortak hesabın şifresini/bilgilerini değiştiremez.
- Platform yöneticisi kullanıcı düzenleme ekranından farklı firmaya üyelik ekleyebilir. Ortak hesap bilgileri ile firma üyelikleri ayrı kaydedilir. Kendine ait üyeliği değiştirme/kaldırma reddedilir.
- Firma detayları ve kullanıcı listeleri aktif firma sınırına göre süzülür. Parola hash'leri ve oturum kimlikleri firma detay yanıtından çıkarılır; entegrasyon sırları maskelenir.
- Özel roller başka firmadan atanamaz veya değiştirilemez. Rol düzenleme, tanımlı ve yöneticinin atamaya yetkili olduğu izinlerle sınırlıdır.
- Firma seçicisi, rol denetimleri ve menüler üyelik rollerini kullanır. Çoklu roller menüde birleştirilir.

## Ekran ve API

Kullanıcı Yönetimi, Ayarlar/Kullanıcılar ve firma içindeki kullanıcı düzenleme ekranlarına **Firma Üyelikleri** bölümü eklendi: firma, rol kutuları, aktif/pasif durumu, üyelik kaydetme ve kaldırma.

- `GET /api/users/:id/memberships`
- `PUT /api/users/:id/memberships/:tenantId` — `roleIds`, `status`
- `DELETE /api/users/:id/memberships/:tenantId` — üyeliği pasife alır ve silinme işareti koyar.

`/api/auth/users` aynı kullanıcı router'ına yönlendirilir. Eski `/api/users/:id` rol alanı firma yetkisini değiştirmez; rol düzenleme üyelik endpoint'ine taşındı. Global hesap yönetimi endpoint'leri platform yöneticisine ayrıldı.

## Mevcut kayıtların geçişi

Yükleme sırasında mevcut firma bağlantıları üyelik kaydına dönüştürülür. Var olan üyelik durumu ve rol atamaları korunur. `roleId`/`roleSlug` eski kayıt desteği sürer; açık `roleIds` dizisi varsa yalnız bu dizi kullanılır. Eski satış/kasa/depo/personel/saha rolünün arayüz karşılığı üyelikte `legacyRole` ile korunur; her istekte genel kullanıcı rolüne geri dönülmez.

Kaldırılan üyelik fiziksel olarak silinmez; böylece yeniden başlatma/geçiş sırasında eski `allowedCompanyIds` listesi bu üyeliği yeniden etkinleştiremez. Muhasebe, stok ve bakiye hesaplamaları değiştirilmedi.

Gerçek müşteri veritabanında geçiş çalıştırılmadı. Üretimde uygulamayı başlatmadan önce veritabanı yedeği alınmalı; uygulama eski sürüme döndürülürse eski kodun üyelik kurallarını uygulamayacağı dikkate alınmalı.

## Doğrulama

`server/tests/membershipIsolationTest.ts`: ayrı geçici veritabanıyla gerçek HTTP üzerinden A/B yetki farkı, izin birleşimi, firma geçişleri, paralel eski token bağlamı, pasife alma, üyelik kaldırma/yeniden ekleme, boş roller, askıya alınmış firma, özel rol kapsamı, yetki yükseltme ve kullanıcı listesi sınırları.

`tests/application.spec.ts`: gerçek tarayıcıda kullanıcı düzenleme ekranından ikinci firmaya iki rol atama ve üyeliği pasife alma; ilk firma rolünün korunduğunu API ile doğrulama.

Son `npm run release:check` başarılı (22 Eylül):

- İstemci ve sunucu TypeScript kontrolü + üretim derlemesi geçti. Sunucu tsconfig'i de artık ana build/typecheck kapsamındadır.
- Üyelik izolasyonu: **41 HTTP kontrolü geçti**; ek menü/izin birleşimi kontrolleri geçti.
- Yerel testler: **11 süit geçti, 0 başarısız**.
- Chromium: **5 test geçti**, firma üyeliği düzenleme senaryosu dahil.
- Bağımlılık denetimi: **0 güvenlik açığı**.
- Lint engelleyici hata üretmedi; uyarılar sürüyor. Büyük istemci paketi için derleme uyarısı devam ediyor.

Test ekran görüntüsü: `.verify-tmp/membership-editor.png`. Kontrol çıktısı: `.verify-tmp/release-final-check.log`. Testler yalnız izole geçici veritabanlarını kullandı.

## Canlıya geçiş kapsamı

Bu çalışma üyelik ve rol düzenlemesidir; tüm ürün için canlıya hazır onayı değildir. Önceki 21 Eylül dağıtım arşivi bu değişiklikleri içermez ve kullanılmamalıdır.

ERP aboneliği firmaya aittir. Hızlı Bilişim hizmetleri ile ERP kullanım süresi birleştirilmedi; bu çalışmada yeni abonelik/yenileme veya süre sonu işlem politikası uygulanmadı.

Önceki incelemenin dört HTTP bulgusu için regresyon kontrolleri eklendi. Ayrı kalan başlıklar: `settings.ts` içindeki ortak firma/ayar/seri kayıtlarının tüm kullanım yerlerinde tenant kapsamına taşınması ve sağlayıcı müşteri eşleştirmesinde VKN/çakışma doğrulaması. Bu başlıklar tamamlanmadan genel canlıya hazır değerlendirmesi yapılmamalı. Hızlı Bilişim portalına yazma veya canlı belge gönderimi yapılmadı.
