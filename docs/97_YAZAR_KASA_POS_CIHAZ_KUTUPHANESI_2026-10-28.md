# Mağaza yazar kasa/POS entegrasyon kütüphanesi — çalışma sürümü

Kapsam: müşterinin mevcut fiziksel yazar kasa/POS cihazını BEY360'a bağlayacak çok markalı yazılım hazırlığı. Paket ücretlerinin Garanti sanal POS ile ödenmesi ayrı iş akışıdır. Kullanıcının Beko cihazı şu anda bağlı değildir; model kesinleşmemiştir.

## Hazır olanlar

- `packages/fiscal-device-kit`: bağımlılıksız, dağıtılabilir TypeScript/JavaScript kütüphanesi; marka kataloğu, cihaz tanımı ve collect/query/cancel sonuç sözleşmesi. Tüm mevcut bağdaştırıcılar hazırlık durumundadır; işlem çağrıları açık hata verir. Bilinmeyen markaya simülasyon geçişi yapılmaz.
- Beko TokenX kablolu ve bulut ayrı katalog kayıtlarıdır. Kablolu resmi referans modeller300TR veX30TR. Ingenico, Hugin, Verifone, Pavo ve diğer markalar üretici bekleyen kayıtlar olarak ayrılmıştır. **Katalogda görünmek çalışan/satışa hazır entegrasyon anlamına gelmez.** Diğer marka bağlantı seçenekleri cihaz yeteneği iddiası değil, kurulum talebidir.
- Hızlı Satış (POS) > Yazar Kasa / POS Bağlantıları ve Mobil POS > Cihaz Bağlantıları aynı ayar bileşenini açar. Firma yöneticisi mevcut cihazın modelini, sicilini, şubesini, kasa bilgisayarını ve planlanan bağlantısını kaydeder. Mağaza kurulum programı indirme düğmesi yoktur; henüz installer üretilmedi.
- Tanım oluşturma/düzenleme, tekrar seri numarası kontrolü, sürüm çakışması kontrolü ve devre dışı bırakma. Firma izolasyonu, rol, menü ve hizmet kapsamı sunucuda uygulanır. Başka firmanın cihazı görülemez/değiştirilemez. Her tanım taslaktır; kullanıcı `connected`/`ACTIVE` gönderemez.
- Kurulum durumu donanıma/ağa erişmez; yalnız tanım ve beklenen kurulum işlerini gösterir. Hiçbir cihaz çevrimiçi kabul edilmez. Kaydetmek tahsilat veya fiş oluşturmaz.
- Eski `/api/v1/pos/charge` gerçek cihaz olmadan başarılı tahsilat üretiyordu; artık yetki kontrolünden sonra bütün ortamlarda503 verir. Doğrudan POS simülatörü de test dışı ortamlarda kapalıdır. Eski deneme işlem kayıtları ekranda deneme olarak gösterilir.

## Paketleme

Depo kökünde `npm run devices:kit:pack`. `.verify-tmp/bey360-fiscal-device-kit-0.1.0.tgz` geliştirici kütüphane paketidir; müşteriye kurulan bir Windows uygulaması değildir. Üretici DLL/SDK dosyası, sürücü, parola veya örnek gerçek kart içermez. Üretim derlemesi kütüphaneyi ayrıca derler.

## Sonraki aşama: mağaza bağlantı yazılımı

1. Her üreticiden yazılım firması entegrasyon sözleşmesi/SDK dağıtım hakkı, desteklenen model/firmware, lisans ve test cihazı koşulları alınır. Beko ile başlanır; bu çalışma lisans satın almaz veya üreticiye başvuru göndermez.
2. Beko kablolu için üreticinin resmi sürücüsü ve SDK'sını kullanan imzalı yerel bağlantı uygulaması geliştirilir. Sunucudan müşterinin USB portuna doğrudan bağlanıldığı iddia edilmez. Bulut yolunda üretici client kimlikleri, şube ve terminal kaydı ayrı sunucu kasasında tutulur.
3. Yerel bileşen dışarıya açık port açmadan kimlikli HTTPS bağlantısı üzerinden çalışacak şekilde tasarlanır. Kayıt/eşleşme anahtarları kısa ömürlü ve tek kullanımlık; firma, şube, kasa ve cihaza bağlı olacak. Tarayıcıda veya genel cihaz tanımında üretici parolası tutulmayacak. Bu sürümde bu ajan/anahtar akışı uygulanmamıştır.
4. Kasa cihazı için gelen tutar ve ürün/fiş komutları sunucudaki belgeye bağlanır. Kart/PIN/CVV BEY360'a girilmez. Üreticinin kısım/ürün eşlemesi ve fiş türleri cihaz/üretici dokümanıyla doğrulanır; mevcut KDV/muhasebe motoruna müdahale edilmez.
5. Kalıcı operasyon kimliği, belirsiz sonuç sorgulama, tekrar/eşzamanlı bildirimde tek tahsilat, fiş doğrulaması ve iptal/iade mutabakatı tamamlanır. Gerçek sonuç doğrulanmadan satış veya cari tahsilat kapanmaz. Bu hazırlık mali kayıt oluşturmaz.
6. Mevcut çok süreçli JSON depolama sınırı tahsilat açılmadan giderilir ya da operasyonlar atomik ortak depoda tutulur. Süreç içi kilit tek başına yeterli değildir.
7. Üretici ve cihaz üstü kabul testleri: bağlı değil, hatalı kasa eşlemesi, izin yok, meşgul cihaz, müşteri red/iptal, kablo kopması, güç kesintisi, ödeme sonrası sunucuya dönüşün kaybolması, tekrar sorgu ve aynı işleme ikinci çekim yapılmaması. İlk pilot onayından sonra ilgili marka/model açılır.

## Resmi kaynaklar

28 Ekim2026 tarihinde kontrol edildi:

- [TokenX kablolu dokümanları](https://developer.tokeninc.com/token-developer-portal-1/x-platform/token-x-connect-wire): model referansları ve entegrasyon kütüphanesi yolu.
- [TokenX kablolu hızlı başlangıç](https://developer.tokeninc.com/token-developer-portal-1/x-platform/token-x-connect-wire/hizli-baslangic): Windows sürücüsü ve test uygulaması gereksinimleri.
- [TokenX bulut geliştirici dokümanı](https://developer.tokeninc.com/token-developer-portal-1/x-platform/token-x-connect-cloud/tokenx-api-integration-en): kimlik, sepet ve bildirim akışı.
- [Hugin resmi ürün/destek sayfası](https://www.hugin.com.tr/tr/home): üretici iletişim yolu; BEY360 SDK desteği henüz yok.

Diğer markalar için teknik protokol doğrulanmadan örnek soket komutu veya evrensel GMP3 sürücüsü uydurulmadı. Üretici programı otomatik indirilmedi/kurulmadı. Canlı müşteri cihazına veya mali kayda deneme yapılmadı.
