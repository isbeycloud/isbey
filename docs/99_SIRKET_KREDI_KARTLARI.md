# Şirket kredi kartları ve harcama takibi

## Kullanım

**Banka Hesapları → Şirket Kredi Kartları** ekranı, firma sahibi/yönetici için manuel takip alanıdır. Genel aramada `kredi kart` yazılarak banka ekranına ulaşılır. Kart tanımı ve hareketler seçili firmaya aittir.

1. **Kart Tanımla:** kart adı, banka, son dört hane, limit, başlangıç borcu, hesap kesim ve son ödeme günlerini girin. Para birimi TL'dir. Tam kart numarası, CVV, PIN veya son kullanma tarihi alınmaz.
2. Kartı seçip **Hareket Ekle:** harcama, iade veya kart borcu ödemesi; tarih, KDV dahil toplam tutar, işyeri/muhatap, kategori, belge ve açıklamayı girin.
3. Kayıtlı borç, limit ve harcama/iade/ödeme toplamlarını izleyin. Tarih/işlem filtreleri yalnız hareket listesini süzer; üst toplamlar tüm geçerli hareketlerindir.
4. Yanlış hareketi gerekçesiyle **İptal Et**. Geçmiş kayıt silinmez; toplamdan çıkarılır. Kartı arşivlemek geçmişi korur, yeni hareketi kapatır; düzenleyerek yeniden aktifleştirmek mümkündür.

Kayıtlı borç = başlangıç borcu + harcama − iade − kart borcu ödemesi. Limit aşımı veya alacak bakiyesi gösterilebilir; banka ekstresiyle karşılaştırılmalıdır. Başlangıç borcu, takibe başlarken var olan borçtur; tekrar harcama olarak girilmez ve ilk hareketten sonra değiştirilemez.

Bu alan **muhasebe gideri, KDV, cari, kasa veya banka hareketi oluşturmaz**. Aynı belgeyi gider ekranında tekrar otomatik işlemez. Kart borcu ödemesi para transferi yapmaz. Banka senkronizasyonu, taksit planı ve otomatik ekstre/son ödeme tarihi hesaplama bu sürümde yoktur; gün alanları bilgi amaçlıdır. Müşteriden kart tahsilatı veya paket satın alma ekranı değildir.

## Erişim ve veri güvenliği

- Kimlik doğrulama, aktif firma üyeliği, firma/paket/banka menüsü ve abonelik kuralları korunur.
- İlk sürüm SUPER_ADMIN, ADMIN ve COMPANY_ADMIN rollerine açıktır. Görüntüleme `bank.view`, yazma `bank.create` gerektirir. Diğer firma kullanıcılarına kart bazlı yetki verilmiş sayılmaz.
- Tanımlar ve hareketler sunucuda doğrulanır; bilinmeyen/sensitive alanlar ve uzun kart numarası biçimleri reddedilir.
- Hareket isteği UUID ile tekrarlandığında ikinci kayıt oluşmaz; aynı UUID farklı veriyle gelirse409 döner. Kart düzenleme ve hareket iptalinde revision çakışması409 döner.
- Firma değişiminde açık kart formu ve kart verileri temizlenir. Hatalı kayıt gönderiminde form korunur; belirsiz bağlantı hatasında liste kontrol edilmelidir.

## Kalıcı dosya ve işletim

Ana mali veritabanı ve şeması değiştirilmez. Kart takip deposu, `getDatabasePath()` sonucunun yanına `.company-cards.json` eklenerek oluşur. Örneğin özel `database.prod.json` için `database.prod.json.company-cards.json`. Bellek önbelleği yoktur; her okumada dosya yenilenir. Okuma boş depoda dosya oluşturmaz; ilk başarılı yazma oluşturur.

Dosya ve kendi denetim kayıtları aynı atomik değiştirmede yazılır. Süreçler arası dışlama için sabit `.lock` dizini, yalnız bir yazıcı;0600 geçici dosya, dosya fsync ve atomik rename kullanılır. Dizin fsync işletim sistemi izin verdiğinde yapılır. Kilit meşgulse503 döner; veri üzerine yazılmaz. Bu yalnız kart deposunun eşzamanlılığını korur; ana mali JSON'un mevcut çoklu süreç önbelleği sorununun çözüldüğü anlamına gelmez.

**Yedekleme:** canlı veri yedekleri ana `DATABASE_PATH` dosyasıyla birlikte kart takip dosyasını da kapsamalıdır. Uygulama sürüm dizinine taşınmamalıdır. Var olmayan takip dosyası boş depo demektir. Yedekler özel dizinde0600 izinle, dosya SHA256 bilgisiyle saklanır. Kart dosyası rename ile değiştirildiğinden tek dosya okuması tam eski/yeni sürümü görür. Geri yüklemeden önce kart yazmaları durdurulmalı ve mali/kart dosyaları uygun yedek çiftinden seçilmelidir; eski sürüme kod dönüşü kart dosyasını silmemelidir.

**Çökme sonrası kilit:** otomatik süre aşımıyla kilit silinmez.503 sürekli ise görevli yönetici önce ilgili dosyaya yazabilecek tüm uygulama süreçlerini durdurmalı, dosya/yedek bütünlüğünü kontrol etmeli; ancak aktif yazıcı kalmadığını doğruladıktan sonra tam yolu doğrulanmış boş `.lock` dizinini kaldırmalıdır. Sonra uygulama açılır ve okuma/kayıt doğrulanır. Rastgele dosya veya veri dizini silinmez.

## Doğrulama kapsamı

İzole sunucu testleri kimlik/rol/tenant-IDOR, banka menüsü/paket/abonelik, hassas alan ve tutar doğrulaması, tekrar istek, revision, kalıcılık, bozuk dosyada hata, kalan kilitte503 ve iki bağımsız süreçte eşzamanlı yazımı sınar. Ana mali dosyanın byte düzeyinde değişmediği ayrıca karşılaştırılır. Tarayıcı senaryoları kart oluşturma, hareket/iade/ödeme, hata sonrası form, yeniden yükleme, filtre, iptal, arşiv ve mobil görünümü sınar. Canlı doğrulama yalnız okuma/gezinmedir; gerçek kart veya harcama eklenmez.
