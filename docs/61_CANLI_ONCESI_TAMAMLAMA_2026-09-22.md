# Canlı öncesi yazılım hazırlığı — 22 Eylül 2026

## Tamamlananlar

### Firma ayarları ve belge serileri

Firma profili, sistem ayarları ve belge serileri `tenantConfigurations[tenantId]` altında tutulur. Doğrulanan oturumun tenant kimliği AsyncLocalStorage ile istek boyunca korunur. Mevcut servislerin `company/settings/sequences` erişimi merkezi saklama katmanında bu firmaya yönlendirilir. Platform yönetimi başka firmaya geçerken ortak aktif firma veya şirket profilini değiştirmez.

Eski belge sayaçlarının yüksek değerleri korunur; geçiş numaraları sıfırlamaz. Aynı yıl içinde sayaç geriye alınamaz. İşlemler sırayla kaydedilir; işlem içindeki seri ve denetim kaydı aynı taslakta tutulur. İstek dışından çağrılan mobil/tahsilat işlemleri açık tenant kimliği kullanır. e-Belge gönderici bilgileri açık tenant kimliğinden okunur.

Firma oluşturma ve sağlayıcıdan kullanıcı aktarımında üyelik kaydı da oluşturulur. Firma yönetiminde başka firmanın ID'sini kullanarak değişiklik denemesi reddedilir.

### ERP aboneliği

Firma → Paket / Lisans ekranına ERP başlangıç/bitiş tarihi ve yenileme eklendi. Yalnız platform yöneticisi değiştirebilir. Geçersiz tarihler ve başlangıçtan önce bitiş reddedilir.

Varsayılan süre sonu politikası: görüntüleme/GET ile yapılan dışa aktarmalar açık, yeni kayıt ve değişiklik kapalı. Türkiye saatine göre bitiş günü sonu kullanılır. Henüz başlamamış veya tarihleri eksik abonelik de yazmaya kapalıdır. Oturumdaki firma geçişi yapılabilir. Yenileme eski token ile yapılan sonraki isteğe yansır.

Politika tercihi çalışma sırasında soruldu; yanıt gelmediği için önerilen salt okunur varsayımı uygulanacağı kullanıcıya bildirildi. Yeni `erpSubscription` yoksa mevcut `license`/`expiresAt` tarihleri değerlendirilir. ERP tarihi değiştirmek Hızlı Bilişim hizmetlerini/kontrlarını iptal etmez; canlı sağlayıcıya işlem göndermez. Otomatik ücret çekme veya otomatik sözleşme uzatma uygulanmadı.

### Hızlı Bilişim eşleştirmesi

Manuel eşleştirme, otomatik eşleştirme ve firmaya dönüştürme aynı doğrulamayı işlem içinde kullanır. 10/11 haneli VKN/TCKN biçimi ve tam eşitliği, mevcut firma bağlantısı, sağlayıcı müşteri kimliği, mükerrer vergi numarası ve çakışan bağlantılar kontrol edilir. Bağlanmış firmada VKN/TCKN değişikliği engellenir. Bu kontrol GİB kaydını veya kimlik numarasının resmî geçerliliğini sorgulamaz.

## Kanıtlar

- `npm run release:check`: istemci/sunucu TypeScript, derleme, lint, 12 yerel süit, 6 Chromium testi ve bağımlılık taraması geçti.
- Üyelik izolasyonu: 41 HTTP kontrolü.
- Firma ayarları/seriler/abonelik/eşleştirme: son hedefli koşuda 32 HTTP kontrolü. Eşzamanlı sekiz seri isteğinin benzersizliği, başka firmanın ayrı sayacı, diskte kalıcılık ve Türkiye saatinde bitiş sınırı da doğrulandı.
- Tarayıcıda ikinci firma için çoklu rol kaydı, üyelik pasife alma ve ERP abonelik yenileme denendi. Ekran görüntüleri `.verify-tmp/membership-editor.png` ve `.verify-tmp/erp-subscription.png`.
- Bağımlılık denetimi: 0 güvenlik açığı. Lint uyarıları ve büyük istemci paketi uyarısı devam ediyor.
- Testler geçici veritabanları kullandı; gerçek müşteri veritabanı değiştirilmedi. Muhasebe hesaplama kuralları değiştirilmedi.

## Dağıtım ve kalan işler

Güncel paket: `releases/isbey-release-2026-09-22T10-11-08-956Z.tar.gz` ve yanındaki SHA-256 dosyası. 233 dosyanın manifest hash'i, üretim modunda açılış, sağlık uç noktası, SPA ve oturumsuz API isteğinin reddi geçti. Test rastgele anahtarlar ve ayrı geçici veritabanı kullandı. Paket testi bu bilgisayarın mevcut bağımlılıklarıyla yapıldı; hedef sunucuda temiz `npm ci --omit=dev` kurulumu ayrıca yapılmalıdır. 21 Eylül arşivi bu değişiklikleri içermez ve kullanılmamalıdır.

Hedef sunucu/alan adı henüz seçilmedi. HTTPS, servis hesabı, tek uygulama süreci, kalıcı disk, gerçek üretim verisi ve benzersiz hesaplar, anahtarlar, otomatik dış ortam yedeği/geri yükleme tatbikatı ve hedef sunucuda iş akışı kabulü gerekiyor. Temiz hedef sunucuda bağımlılık kurulumu bu bilgisayardaki testin yerine geçmez.

Mevcut JSON saklama modeli tek süreç içindir; çoklu worker/replica desteklenmez. Yerel testlerin geçmesi bütün iş modüllerinin veya canlı entegratörün kabulü anlamına gelmez. Canlı e-belge açılışı ayrı sağlayıcı kabulü ve kullanıcı onayı gerektirir.
