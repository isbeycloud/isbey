# e-Fatura canlı geçiş hazırlığı — 24 Eylül 2026

**Durum: E-FATURA CANLI GEÇİŞİNE HAZIR DEĞİL.** Sağlayıcıya belge gönderilmedi, kontör tüketilmedi, `.env` değiştirilmedi. Kullanıcı onayıyla pilot firmanın yerel vergi kimliği düzeltildi ve pasif entegrasyon hazırlığı yapıldı. Mevcut web yayını ile e-fatura canlı kabulü ayrı izlenir.

## Hazırlanan yazılım

- Hızlı e-Connect servisinin canlı URL seçimi `HIZLI_BILISIM_ALLOW_PROD=true` şartına bağlandı. Firma token önbelleği bu kilidi atlayamaz.
- Firma kimliği eksikse ortak WS hesabına dönüş yalnız gönderici VKN/TCKN ile `HIZLI_BILISIM_VKN` eşleştiğinde mümkündür. Diğer firmalar kendi bağlantı bilgilerini kullanmalıdır.
- Eski hazırlık betiği güvenli geri dönüş betiğinin üzerine yazıyordu. Artık yalnız çevrimdışı kontrol yapar; DB/ortam ayarı değiştirmez veya yedek geri yüklemez. İsteğe bağlı rapor gizli anahtar/parola içermez.
- Dağıtım paketine sunucunun kullandığı ERP menü tanımı, hazırlık komutu ve bu kılavuz eklendi.

## Mevcut yerel bulgular

`npm run efatura:preflight -- --output .verify-tmp/efatura-live-readiness.json` sonucu BLOCKED:

- Yerel ortamda canlı izin zaten açık, test modu kapalı; entegrasyon arka plan işleri kapalı. Bu çalışma bu bayrakları değiştirmedi.
- API ve UtilEncrypt anahtarları mevcut görünüyor; geçerlilikleri dış serviste sınanmadı.
- Ayrı kasa anahtarı tanımlı değil. Mevcut JWT'den türetilmiş anahtar kullanımı araştırılmadan anahtar değiştirilmemeli; aksi halde eski şifreli kayıtlar okunamayabilir.
- Yerel hesaplarda demo/düz metin parola denetimi başarısız.
- Dört Hızlı Bilişim ayar kaydında firma/gönderici kimliği doğrulaması başarısız. Bunların üçünde eski parola saklama biçimi, birinde eksik posta kutusu etiketleri var. Eşleşmeler doğrulanmadan otomatik düzeltme yapılmadı.
- Production ön kontrolünde HTTPS CORS origin eksik ve production veritabanı bulunamadı/geçersiz. Yerel geliştirme verisi production verisi yerine kabul edilmez.
- Önceki canlı protokolde kayıtlı `GetGibUserList` hatasının çözüldüğüne dair yeni kanıt yok. Eski bağlantı başarısı güncel sağlayıcı kabulü değildir.

## Hedef firma belirlendiğinde sıra

### Kullanıcı tarafından bildirilen pilot firma

- Unvan: **Beyoğlu Teknoloji Ltd. Şti.**
- VKN: **1681136628**
- Vergi dairesi: **Ziyapaşa Vergi Dairesi**
- Sağlayıcı müşterisi `HB-1681136628` ile yerel dış müşteri kaydı eşleşiyor.
- İşbey firması `tnt-1788768284315-w41y`, 24 Eylül 2026 tarihinde kullanıcının açık onayıyla VKN **1681136628** ve **Ziyapaşa Vergi Dairesi** olarak düzeltildi. İşlem öncesi finansal hareket bulunmadığı ve yeni VKN'nin başka firmada kullanılmadığı yeniden doğrulandı. Atomik kayıt sonrası sonuç okundu; diğer firmalar, belgeler ve entegrasyon ayarlarının değişmediği doğrulandı. İşlem denetim kaydına eklendi.
- Değişiklik öncesi yedek: `data/backups/before-beyoglu-identity-2026-09-24T18-29-25-680Z.json` (SHA256 doğrulama dosyasıyla).
- Aynı gönderici VKN'yi kullanan diğer üç e-fatura ayarının bağlı olduğu firmalar mevcut; bunlarda sırasıyla 1, 3 ve 3 elektronik belge kaydı bulunuyor. Bunlar hedef firmaya otomatik taşınmamalı/birleştirilmemeli. Ayrı bir test ayarı ise bulunmayan firma kimliğine bağlı.
- Hazırlık kaydı: `deploy/efatura-beyoglu-preparation.json`. Bu dosya bilgi/plan kaydıdır; uygulama tarafından otomatik yüklenmez.
- 24 Eylül 20:06 UTC: yerel dış müşteri `HB-1681136628`, mevcut eşleştirme doğrulayıcısından geçirilerek pilot firmaya bağlandı. Firmaya özel `TEST`, `PENDING_VERIFICATION`, `integrationEnabled=false`, `autoSendToGib=false` ayarı oluşturuldu. Parola, etiket ve seri başka firmadan kopyalanmadı. Yedek: `data/backups/before-beyoglu-integration-2026-09-24T20-06-18-511Z.json`. Diğer firmalar ve finansal koleksiyonlar değişmediği doğrulandı. Bu değişiklik yalnız yerel DB'dedir; Git dağıtımı DB'yi taşımaz.

### Belirlenen yayın adresi

Kullanıcı yayın adresini `https://bey360.com`, dağıtım yöntemini Git üzerinden otomatik dağıtım olarak bildirdi. 24 Eylül 20:05 UTC tarihinde HTTPS yanıtı 200, `/api/health` yanıtı `healthy`, sistem adı İşbey ve sürüm `2.0.0` olarak doğrulandı. Yanıt başlıkları Hostinger barındırmasını gösteriyor. Bu kontrol e-fatura hesabının doğrulandığını veya yerel değişikliklerin yayınlandığını göstermez. Yerel origin `isbeycloud/isbey`, dal `main`; uzak main kontrol anında yerel HEAD ile aynıydı. Canlı DB, kasa anahtarı ve provider hesabı henüz incelenmedi.


1. İlk geçilecek firma unvanı, VKN/TCKN ve sunucu/HTTPS alan adı belirlenir. Yetkili kişinin WS hesabı ve etiketleri güvenli ayar ekranında doğrulanır; anahtarlar mesajlara yazılmaz.
2. Hedef production veritabanı ve benzersiz yönetici parolası hazırlanır. Kasa anahtarı migrasyonu önce izole kopyada doğrulanır. Firma eşleştirmeleri, posta kutusu etiketleri, belge serileri ve sayaçlar karşılaştırılır; sayaç geriye alınmaz.
3. Tek uygulama süreci, TLS/proxy, kalıcı disk ve uygulama servis hesabı hazırlanır. Veritabanı, belge dosyaları ve anahtarlar güvenli biçimde yedeklenir; geri yükleme tatbikatı yapılır. Yerel yedek geri yüklemek sağlayıcıdaki belgeyi iptal etmez.
4. `npm run preflight` hedef ortamda geçmelidir. `npm run efatura:preflight` yapılandırma bulguları kapatılır. Sağlayıcı ve hedef ortam kabul maddeleri insan tarafından doğrulanması gerektiği için çevrimdışı rapor otomatik canlı onayı vermez.
5. Hızlı Bilişim desteğiyle GİB mükellef sorgusu, etiketler, seri, sözleşme ve başlangıç kontörü doğrulanır. Eski global bağlantı kullanan `/efatura/hizli/*` yolları çoklu firma için ayrıca incelenmeli; firma kapsamlı servis kullanılmalıdır.
6. Gerçek ve onaylı fatura taslağı seçilir. Alıcı, satırlar, vergi, tarih ve toplamlar kontrol edilir. Canlı gönderim için ayrı iş onayı alınır; aynı belge tekrar gönderilmez. ETTN/UUID, sağlayıcı kabulü ve kontör değişimi kaydedilir.
7. Gönderim sonrası sağlayıcı belgesi, yerel durum ve kontör mutabakatı tamamlanır. İptal gerekiyorsa sağlayıcı kabulü kanıtlanmadan yerelde iptal edilmiş sayılmaz. Arka plan kuyruğu ancak bu kabul sonrası açılır.

## Doğrulama

Yeni izole test: `server/tests/eInvoiceLivePreparationTest.ts`. Canlı kilit, önbellekteki tokenın kilidi atlayamaması, yanlış firma hesabına düşüşün reddi, hazırlık betiğinin dosyaları değiştirmemesi ve raporun sır içermemesi doğrulanır. Test gerçek API'ye gitmez. Tam yerel regresyon: 15 paket geçti. Derleme geçti; bağımlılık taraması 0 açık buldu. Production ön kontrolü yukarıdaki eksikler nedeniyle başarısızdır.

Son yayın doğrulaması: `npm run release:check` başarılı; 15 yerel paket, 8 Chromium senaryosu, derleme/lint ve 0 bağımlılık açığı. Fatura geçmişinde firma VKN/gönderici uyuşmazlığının sağlayıcı çağrısından önce reddedildiği ek testle doğrulandı: e-hizmet paketi 39 HTTP kontrolü geçti. Kullanıcı Hostinger dağıtımının `main` dalına bağlı olduğunu doğruladı. Bu testler izole yerel veriye karşıdır; canlı firma hesabının kabul testi yerine geçmez.

Referanslar: [Dağıtım](57_DAGITIM_KILAVUZU.md), [sağlayıcı kabul protokolü](54_HIZLI_BILISIM_CANLI_API_GECIS_PROTOKOLU.md), [geri alma ve mutabakat](55_CANLI_EBELGE_GERI_ALMA_PROSEDURU.md).
