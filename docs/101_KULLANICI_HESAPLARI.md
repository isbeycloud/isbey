# Kullanıcı bilgileri ve şifre yönetimi

29 Ekim 2026

## Kullanım

- **Kullanıcı Hesapları**: aktif firmanın kullanıcılarını ad, kullanıcı adı veya e-posta ile arayın; **Hesabı Aç** düğmesiyle iletişim, şifre ve e-posta işlemlerine ulaşın. Ayarlar kullanıcı sekmesi ve firma kullanıcı düzenleme ekranı aynı hesabı açar. Başka firmadaki kullanıcı için önce ilgili firmaya geçilir.
- Profil menüsündeki **Hesabım ve Şifrem** tüm oturum açmış kullanıcıların kendi bilgilerine erişmesini sağlar.
- **İletişim Bilgileri**: ad soyad, e-posta, telefon, departman ve şube. Kullanıcı adı ve firma rolleri bu formdan değişmez. Bu bilgiler kişinin ortak hesabına aittir; diğer yetkili firmalarda da görünür.
- **Yeni Şifre Belirle**: en az 12 karakter, en fazla 72 UTF-8 baytı; boşluklar korunur. Şifre iki kez yazılır. İşlem yapan kişi kendi mevcut şifresini doğrular. Şifre değiştiğinde önceki oturumlar geçersiz olur; kendi hesabını değiştiren kişi yeniden giriş yapar.
- **Şifre E-postası**: kayıtlı adrese 30 dakika geçerli tek kullanımlık bağlantı gönderilir. Yeni bağlantı eskisini iptal eder. Ekran alıcıyı ve son gönderim durumunu gösterir; posta sunucusunun kabulü gelen kutusuna teslim garantisi değildir.

## Yetki ve veri güvenliği

Liste firma üyeliği, yönetici rolü ve users.view izniyle sınırlıdır. Başkasının hesabına müdahale users.update ve mevcut şifre doğrulaması gerektirir. Firma yöneticisi ortak/platform/sahip hesaplarını değiştiremez. Platform yönetimi de aktif firma kapsamına uyar. Kendi hesabını düzenleme ayrı doğrulanır. Eski profil/şifre yolları yeni doğrulamayı atlayamaz.

Değişiklikler ana mali JSON'a yazılmaz. Ayrı özel `.user-accounts.json` dosyası süreçler arası kilit, güncel okuma, revision kontrolü, atomik 0600 yazma ve kendi işlem kaydı kullanır. Şifreler hash olarak tutulur. Bağlantının yalnız SHA-256 özeti diske yazılır; açık bağlantı, yeni şifre ve posta gövdesi outbox veya işlem geçmişine yazılmaz. Bağlantı 32 rastgele baytın 43 karakter base64url karşılığıdır; e-postadan `/reset-password#token=...` açılır. Ekran parçayı bellek içinde alıp adres çubuğundan temizler, depolamaya yazmaz ve otomatik oturum açmaz.

Web, mobil ve davet doğrulamalarında güncel kimlik sürümü kontrol edilir. Var olan JSON üyelik/cihaz önbelleği ve ana kullanıcı oluşturmadaki süreçler arası tekilleştirme sınırları bu çalışmada çözülmez; belirsiz e-posta/kullanıcı adı girişleri kapalı kalır. Eski VKN kayıt posta/outbox akışı bu yeni şifre akışından ayrıdır ve değiştirilmemiştir.

## E-posta yapılandırması ve yedek

Özel ortam dosyasında SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS ve MAIL_FROM tanımlanır. PUBLIC_APP_URL veya APP_PUBLIC_URL yalnız HTTPS uygulama origin'i olmalıdır (ör. https://bey360.com). Eksik yapılandırmada gönderim düğmesi kapalıdır, API 503 döndürür; sahte başarılı gönderim veya bağlantı içeren bekleyen outbox kaydı üretilmez. SMTP doğrulaması teslim testini içermez; gerçek kullanıcıya gönderim ayrıca seçilmelidir.

Yayın/geri dönüş yedeğine ana JSON ile birlikte varsa `.user-accounts.json`, `.company-cards.json` ve `.debt-tracking.json` eklenmelidir. Dosyalar ve yedekler özel alanda 0600 tutulur. Yeni kimlik dosyası oluştuğunda önceki sürüme kör geri dönüş eski şifreleri yeniden geçerli kılabilir; kimlik sürümü doğrulaması korunmadan eski kod açılmamalıdır.

## Kontrol kapsamı

İzole hizmet/HTTP testleri yetki, firma sınırı, eski endpointler, yeniden doğrulama, oturum iptali, tek kullanımlık/süreli bağlantı, yinelenen istek, sahte SMTP sonuçları ve süreçler arası eşzamanlı yazmayı kapsar. Tarayıcı testleri hata sonrası formun korunması, kayıt sonrası yeniden yükleme, mobil düğmeler ve şifre bağlantısı ekranını kapsar. Canlı doğrulama salt okunurdur; gerçek hesap şifresi/iletişim bilgisi değiştirilmez ve e-posta gönderilmez.
