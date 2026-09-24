# Müşteri işlemleri, firma portföyü ve e-hizmetler

## ERP menü erişimi ve yeni kayıtlar

Yönetim → Kullanıcı Yönetimi → kullanıcı düzenle → Firma Üyelikleri bölümünde **Erişebileceği ERP menüleri** bulunur. Varsayılan, rolün izin verdiği tüm menülerdir. Bu seçenek kaldırıldığında ERP menüleri tek tek seçilebilir. Seçimler firma üyeliğine yazılır; diğer firma üyeliklerini değiştirmez. Boş seçim ERP modüllerini kapatır. Ana sayfa, yardım, rolün izin verdiği yönetim ekranları ve hizmet kataloğu korunur. Rol izinleri yine geçerlidir; menü seçmek yeni işlem yetkisi kazandırmaz. Platform yöneticileri bu kısıtın dışındadır. Firma yöneticisi kendi menü sınırını aşan atama yapamaz.

Sol menü ve modül ekranı aynı seçimleri kullanır. Kimlik doğrulama katmanı ilgili eski/yeni API yollarını da kapatır; ortak arama, aktarım ve senkronizasyon yolları kısıtlı üyeliklerde engellenir. Kısıt değişimi mevcut token ile yapılan yeni isteklerde de uygulanır.

Doğrudan kayıt olan kullanıcı **Hizmetler ve Paketler** ekranına yönlenir. Ekran aktif paketleri veritabanından aylık/yıllık fiyatlarıyla gösterir. Paket talepleri sunucudaki fiyat ve aktif firmayla kalıcı kaydedilir; mükerrer açık talep reddedilir. Kullanıcı kendi firma taleplerini, platform yöneticisi tüm talepleri aynı ekranda görür. Talep oluşturmak satın alma veya ödeme değildir. e-hizmetler için mevcut başvuru/teklif akışı kullanılır; canlı ödeme sağlayıcısı halen ayrıca bağlanmalıdır.

Müşteri İşlemleri menüsü mevcut Hızlı Bilişim müşteri aktarım ekranını doğrudan açar. Bağlanmış müşterinin işlem listesinden firmasına veya e-Belge ekranına geçilir. e-Belge ekranındaki Geçmiş e-Faturalar bölümü tarih aralığıyla seçili firmanın Hızlı Bilişim bağlantısını sorgular. Bağlantısı kapalı veya tanımsız firmalarda sorgu durdurulur; başka firmanın token'ı kullanılmaz. Bu liste salt okunurdur; fatura aktarımı veya yeniden kesimi yapmaz.

Üst çubuktaki Firma seç / değiştir, `/auth/me` yanıtındaki yetkili firmaları kullanır. Firma değişiminde modül bileşenleri yeniden açılır ve açık işlem formları kapanır. Yeni token seçilen firmadaki rolleri taşır. Kullanıcı yönetimindeki Firma Üyelikleri bölümünde platform yöneticisi aynı hesabı farklı firmalara bağlayabilir, her firmaya farklı roller atayabilir ve firma sahibi işaretleyebilir. Sahiplik için firma yöneticisi rolü gerekir. Üyelik sayısı bir firmayla sınırlandırılmaz.

Mali müşavir portföyü aktif `accountant` rolü bulunan firma üyeliklerinden türetilir. Eski `accountantClients` veya `allowedCompanyIds` kayıtları tek başına erişim vermez. Eski portföy kayıtları için kullanıcı yönetiminden ilgili firma üyeliği atanmalıdır. Portföydeki Firmaya geç / İşlem yap düğmesi mevcut yetkilerle muhasebe alanını açar.

## Başvuru ve ödeme

e-Belge ekranında e-Hizmet Başvuru ve Ödeme bölümü bulunur. Platform yöneticisi tüm başvuruları Müşteri İşlemleri altındaki başvuru bölümünde görebilir; firma kullanıcıları yalnızca aktif firma başvurularını görür.

- Firma kimliği ve vergi numarası sunucudaki aktif firmadan alınır.
- Yetkili iletişim bilgileri, seçilen hizmetler ve yetkililik onayı kalıcı kaydedilir.
- Aynı hizmete açık mükerrer başvuru reddedilir.
- Platform yöneticisi KDV dahil toplam teklif tutarını girer. Tutar kuruş cinsinden saklanır; sipariş kimliği sunucuda üretilir.
- Ödeme siparişi ve tutarı tarayıcıdan değiştirilemez. Başarılı ödeme entegratör hizmetini otomatik açmaz.

## Canlı ödeme bağlantısı için kalan entegrasyon

Bu sürümde canlı ödeme sağlayıcısı bağlanmamıştır. Kart tahsilatı yapılmaz; checkout 503 döner ve arayüz bunu açıkça gösterir. `EServicePaymentProvider` sözleşmesine uygun sağlayıcı adaptörü hazırlanıp `createEServicesRouter(adapter)` ile bağlanmalıdır. Adaptör sipariş kimliğini idempotency anahtarı olarak kullanmalı, sunucunun verdiği tutarla HTTPS barındırılmış ödeme sayfası üretmelidir. Kart verileri İŞBEY'e alınmaz.

Sağlayıcıya özgü webhook doğrulama ve alan eşlemesi adaptör/gateway katmanında yapılır. Aşağıdaki sözleşme İŞBEY'e aittir; belirli bir bankanın veya ödeme kuruluşunun API sözleşmesi değildir.

`POST /api/e-services/payment-callback` gövdesi: `orderId`, `amountMinor`, `currency` (`TRY`), `reference`, `timestamp` (Unix milisaniye). Gateway yalnızca sağlayıcı tarafından doğrulanmış başarılı tahsilatları göndermelidir.

`x-payment-signature`: `E_SERVICE_WEBHOOK_SECRET` (en az 32 karakter) ile `JSON.stringify([orderId, amountMinor, currency, reference, timestamp])` üzerinde HMAC-SHA256 hex. Bildirim beş dakika içinde olmalıdır. Tutar/para birimi/sipariş eşleşmesi ve referans tekilliği denetlenir; aynı bildirim tekrarlandığında aynı sonuç korunur. Tarayıcı dönüş sayfası ödeme onayı değildir. Anahtar kaynak koduna veya tarayıcıya verilmemelidir.

## Doğrulama

`npm test` yeni e-hizmet HTTP regresyonlarını da çalıştırır: firma izolasyonu, mükerrer başvuru, fiyat yetkisi, kapalı checkout, imza ve tutar doğrulaması, tekrar bildirim, portföy üyeliği iptali ve firma bazlı Hızlı Bilişim token seçimi. Testler geçici veritabanı ve sahte sağlayıcı kullanır, canlı müşterilere veya tahsilata dokunmaz.
