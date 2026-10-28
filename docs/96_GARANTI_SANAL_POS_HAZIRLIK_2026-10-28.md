# Garanti BBVA paket satın alma hazırlığı

Başvuru yapıldı; test bilgileri bankadan bekleniyor (28 Ekim 2026).

## Tamamlanan hazırlık

- Platform Ayarları > Sanal POS: yalnız platform yöneticilerine açık hazırlık kontrolü. Kimlik bilgisi değerleri/parolalar tarayıcıya gönderilmez; yalnız tanımlı/eksik durumu görünür.
- Müşteri abonelik portalındaki paketler örnek fiyatlar yerine aktif `subscriptionPlans` kataloğundan gelir. Paket ve dönem sunucuda tekrar doğrulanır. Önizleme kaydı, ödeme veya paket değişikliği oluşturmaz.
- Vergi/yıllık tarife anlamı henüz kesinleşmediğinden bu aşamadaki tutar bir tahsilat teklifi değildir. Gerçek ödeme tutarı üretimi ve vergi politikası sonraki aşamadadır. Kupon ve dönem farkı bu önizlemeye uygulanmaz.
- `/api/v1/package-checkout/status`, yönetici `/admin/readiness`, salt okunur hesaplama `/preview` ve kapalı `/start` uçları hazırdır. Başlatma her ortamda 503 döner; doldurulan banka bilgileri bunu açmaz.
- Bankanın ISO-8859-9, SHA1 ve SHA512 istek hash sözleşmesi bağımsız yardımcı olarak hazırdır. Bankaya ağ çağrısı ve bankaya gönderilebilir form üretilmez. Ödeme dönüşü/kayıt/aktivasyon bu aşamada yoktur.
- Eski çevrimiçi paket/kontör satın alma simülasyonları yalnız `NODE_ENV=test` içinde kullanılabilir. Production, staging ve development ortamlarında reddedilir. Eski checkout isteği kimlikten çözülen firmayı değiştiremez. Kart bilgisi olmadan paket açan eski `/subscriptions/change` akışı da kapatılmıştır. Manuel yönetici paket atama işlevi ayrıdır; ödeme alındığı anlamına gelmez.

## Bankadan istenecek bilgiler

1. Üye işyeri ve 8 haneli terminal numarası; terminal için **3D_OOS_PAY / ortak ödeme peşin satış** modelinin açık olduğuna dair teyit.
2. Bankanın ilgili modele uygun provizyon kullanıcı adı, terminal kullanıcı adı, provizyon parolası ve 3D StoreKey. Kullanıcı adları tahmin edilmez.
3. Test hesabı, bankanın test kartları ve modelin test/kabul senaryoları. Gerçek kart kullanılmaz.
4. Sonraki canlı geçiş için terminal/model/alan adı/IP kısıtları, dönüş adresleri, taksit ve para birimi yetkileri. İlk kapsam TL, tek çekimdir; otomatik karttan yenileme kapsam dışıdır.

Bilgiler sohbete, kaynak koda veya yönetim ekranına yazılmaz. Sunucunun özel `.env` dosyasında `.env.example` içindeki `GARANTI_*` alanlarına kaydedilir. Test ve canlı kimlik bilgileri karıştırılmaz. Mevcut `APP_PUBLIC_URL` HTTPS ve kök alan adı olmalıdır.

## Sonraki uygulama / kabul kapısı

Bu hazırlık **entegrasyon tamamlandı** anlamına gelmez. Şunlar bitmeden gerçek ödeme açılmaz:

- Yıllık tarife tek yıllık toplam mı, aylık eşdeğer mi netleştirilir; KDV dahil/hariç, indirim ve varsa dönem farkı politikası onaylanır. Tutar/kuruş yalnız sunucuda belirlenir.
- Kalıcı sipariş, benzersiz işlem/idempotency anahtarı ve süre sonu durumları eklenir. Firma, paket, dönem, tarife sürümü, beklenen tutar ve TRY siparişe bağlanır. Tarayıcı tutarı yetkili kaynak sayılmaz.
- Yalnız sabit banka adresine yönlendirme yapılır: TEST `https://sanalposprovtest.garantibbva.com.tr/servlet/gt3dengine`; canlı `https://sanalposprov.garanti.com.tr/servlet/gt3dengine`. Kart bankanın sayfasında girilir.
- Banka dönüş URL'leri planı: `https://bey360.com/api/v1/package-checkout/garanti/callback`. **Bu URL henüz uygulanmadı; bankaya aktif adres olarak verilmemeli.** Dönüş imzası bankanın sözleşmesine göre doğrulanır; sipariş/tutar/para birimi/terminal/3D sonucu kontrol edilir. Başarılı URL'ye yönlenmek tek başına ödeme kanıtı değildir. Başarı sunucudan işlem sorgusuyla da doğrulanır.
- Banka çağrısı ile yerel aktivasyon arasındaki belirsiz sonuçlar sorgu/mutabakat kuyruğunda bekler; yeniden tahsilat yapılmaz. Başarısız/süresi geçen sipariş paket açmaz. Tekrar/eşzamanlı bildirim tek aktivasyon oluşturur.
- Hostinger'ın çok süreçli JSON depolama sınırı giderilir ya da sipariş/aktivasyon atomikliği kalıcı ortak depoda sağlanır. Süreç içi kilit tek başına yeterli değildir.
- Mevcut manuel ticari abonelik koşulları, tenant/subscription/hizmet kapsamı aynı atomik aktivasyon sözleşmesiyle korunur. Muhasebe/stok/KDV motoru bu hazırlıkla değiştirilmez.
- Banka testi: onay, red, iptal, kullanıcı terk etmesi, timeout sonrası sorgu, sahte/değişmiş callback, tutar farkı, eski callback, tekrar/eşzamanlı callback, farklı firmaya erişim ve kesinti sonrası tekrar işleme. Banka kabulünden sonra ayrıca canlı açılış kararı alınır.

## Kaynaklar

28 Ekim 2026'da resmi Garanti BBVA kaynakları kontrol edildi:

- [Ortak ödeme peşin: model, form alanları, hash ve test/prod](https://dev.garantibbva.com.tr/sanal-pos-ortak-odeme-pesin)
- [Geliştirici portalı](https://dev.garantibbva.com.tr/)
- [Sanal POS başvuru ve destek](https://garantibbvapos.com.tr/sanal-pos)

Hazırlık kapsamı SaaS paket/kontör satın almadır. Saha POS, cari ödeme linkleri, banka mutabakatı ve diğer ödeme sağlayıcılarının tamamı bu çalışmayla canlı entegrasyon yapılmış sayılmaz. Paylaşılan deneme sağlayıcılarının sunucu ortamlarında kapatılması ilgili çağrıları da güvenli biçimde reddeder.
