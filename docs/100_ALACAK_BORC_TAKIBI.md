# Alacak / Borç Takibi

## Kullanım

Firma sahibi/yönetici için **Alacak / Borç Takibi** yan menüsü ve Cari ekranındaki aynı adlı düğme kullanılır. Genel aramada borç, alacak, takip veya hatırlatma yazılabilir.

- **Alacağımız:** pozitif cari net bakiyesi. **Borcumuz:** negatif cari net bakiyesi. Cari tipi yerine net bakiyenin yönü kullanılır; müşteri/tedarikçi aynı kart olabilir.
- **Takip Güncelle:** takip tarihi, ödeme sözü tarihi, sonraki hatırlatma, takip durumu ve görüşme notunu kaydedin. Ödeme sözü durumunda söz tarihi zorunludur. Not sınırı500 karakterdir; çok satır desteklenir.
- Geçen takipler, bugün, yedi gün içinde, tarihsiz kayıtlar, alacak/borç ve cari adı/kodu ile süzün. Üst tutarlar filtrelerden bağımsız tüm doğrulanmış açık cari bakiyeleri kapsar.
- Bildirim zilindeki takip bölümü, ilgilenilmesi gereken ve yaklaşan takip sayısını gösterir. Ödeme sözü tarihi geçtiğinde ve hatırlatma günü geldiğinde de uyarı oluşur. Aynı cari birden fazla nedenden uyarı alsa bile toplamda bir kez sayılır.
- Uyarılar İstanbul takvim tarihine göre hesaplanır; bugün gecikmiş sayılmaz. Sonraki yedi güne kadar takip tarihi yaklaşanlara dahildir. Uygulama açık/görünürken her60 saniyede ve yeniden odaklandığında güncellenir. Arka plan yenilemesi açık geçmişi/klavye odağını kaldırmaz.

Takip tarihi, fatura/sözleşme vadesinin yerine geçmez. Tarih yoksa kayıt **Takip tarihi yok** görünür; fatura düzenleme günü vade sayılmaz. Bu sürüm cari bazında takip içindir; fatura bazlı tahsilat dağılımı, FIFO, taksit planı veya yasal gecikme hesabı değildir.

## Mali kaynak ve sınırlar

Tutar kaynağı diskteki güncel `customer.balance` değeridir. Fatura tutarları, banka/kasa hareketleri ve ikinci eski `accountTransactions` akışı ayrıca eklenmez. Böylece aynı borç iki kez sayılmaz. Genel tahsilatların belirli faturayı kapattığı varsayılmaz.

Takip kaydı **tahsilat, ödeme veya mali düzeltme yapmaz**. Ödeme/tahsilat mevcut Cari ekranından kaydedilir. Bakiye sıfırsa güncel uyarılar kapanır, geçmiş korunur. Alacak/borç yönü değişirse eski tarihler yeni yöne kendiliğinden uygulanmaz; takip yeniden belirlenir. Takip kaydından sonra tutar değişirse arayüz tarihlerin kontrol edilmesini belirtir.

Takip müşteri/yön bazındadır; ayrı borç dönemleri kendiliğinden tespit edilmez. Bakiye kapanıp daha sonra aynı yönde tekrar açılırsa önceki takip bilgileri tekrar görünebilir. Yeni borç için tarihleri kontrol edip güncelleyin. Bu sınırlama banka/fatura bazlı mahsuplaşma icat edilerek gizlenmez.

Eski hareketler döviz para birimini her zaman taşımadığından ilk sürümde dövizli, para birimleri karışık, geçersiz tutarlı veya tekrarlanan kimlikli cariler **Kontrol gerekli** olarak ayrılır. Tutarları toplama/uyarılara katılmaz; TL'ye otomatik çevrilmez. Bu kontroller mali veriyi düzeltmez. Kredi kartı takip deposu bu cari ekranının parasal toplamına eklenmez; kart harcamaları Banka → Şirket Kredi Kartları alanında izlenir.

Uyarılar **uygulama içindedir**. Uygulama kapalıyken gönderim, SMS, WhatsApp, e-posta veya işletim sistemi bildirimi bu sürümde yoktur. Kullanıcı adına dışarıya mesaj gönderilmez.

## Yetki ve saklama

- Aktif firma üyeliği, SUPER_ADMIN/ADMIN/COMPANY_ADMIN rolü, `customers.view`; yazma için `customers.update`. Cari menüsü ve paket/abonelik sınırları hem ekranda hem API'de korunur. Çalışanlara tüm cari verisine yeni yetki verilmez.
- `GET /api/debt-tracking` ve kişisel veri içermeyen `/summary`; `PUT /api/debt-tracking/:customerId` yalnız takip bilgisi yazar.
- Güncel mali kaynak her istekte diskten taze okunur; ana mali JSON veya şema değiştirilmez. Takip geçmişi ve kendi denetim izi `DATABASE_PATH + '.debt-tracking.json'` dosyasında saklanır.
- Firma kimliği istemciden kabul edilmez. İstek UUID'si tekrarında mükerrer görüşme oluşmaz. Güncelleme anında revision, bakiye ve yön yeniden denetlenir; değişmişse409 ve yenileme mesajı gösterilir. Firma değişince açık form ve eski veri temizlenir.
- Süreçler arası özel `.lock` dizini,0600 geçici dosya, dosya fsync ve atomik rename kullanılır. Kilit meşgulse503; çökme sonrası kilit otomatik silinmez. Yedekler bu dosyayı da kapsamalıdır. Kurtarma için önce yazabilecek tüm süreçler durdurulmalı, dosya/yedek doğrulanmalı; ancak aktif yazıcı kalmadığında doğrulanmış boş kilit dizini kaldırılmalıdır.
- Bu ayrı dosyanın taze okunması ana mali JSON'un mevcut süreç başına önbelleği ve yazma mimarisini değiştirmez.

## Doğrulama

Sunucu senaryoları kimlik/rol/tenant/menu/paket/abonelik, İstanbul gün sınırı ve7 gün, eksik tarih, ödeme sözü, yön değişimi/kapanma, döviz/karışık veri, taze bakiye, revision/tekrar istek, çok satırlı not ve iki bağımsız süreçle kalıcılığı ölçer. Ana mali dosyanın byte düzeyinde değişmediği doğrulanır. Tarayıcı senaryoları tarih/not kaydetme, hata sonrası form, zil bağlantısı, yeniden yükleme, filtre, mobil görünüm ve gerçek kaydet düğmesi tıklama alanını kapsar. Canlı doğrulama okuma/gezinme ile sınırlıdır; gerçek cari için takip tarihi veya görüşme oluşturulmaz.
