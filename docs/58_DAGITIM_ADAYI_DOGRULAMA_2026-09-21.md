# Dağıtım adayı doğrulaması — 21 Eylül 2026

## Sonuç

Yerel dağıtım paketi üretildi ve production modunda izole test verisiyle başlatıldı. Hedef sunucu henüz seçilmediği için canlı yayın yapılmadı. Gerçek veritabanı ve `.env` değiştirilmedi; entegratöre canlı belge gönderilmedi.

Arşiv: `releases/isbey-release-2026-09-21T08-01-00-168Z.tar.gz`. Yanındaki `.sha256` arşiv bütünlüğünü, paket içindeki `manifest.sha256.json` 226 uygulama dosyasını doğrular. Gerçek veri, müşteri dosyaları, `.env`, test kaynakları ve `node_modules` arşive dahil değildir.

## Tamamlanan doğrulamalar

- `npm run release:check`: başarılı. TypeScript ve Vite derlemesi, lint, yerel testler, E2E ve npm audit çalıştı.
- 10 yerel süit: başarılı. Önceki 164 sayımlı kontrolün yanında kontör yaşam döngüsü, production preflight ve hata enjeksiyonlu saklama regresyonu geçti.
- 4 gerçek HTTP/Chromium senaryosu: başarılı. Token yok/geçersiz token, kullanıcı verisinde parola gizleme, tenant sınırı, yetki yükseltme reddi, web/mobil girişte hash'in parola olarak reddi, normal mobil giriş, güvenlik başlıkları, CORS, SPA/404, hatalı ve doğru parola, oturum yenileme, çıkış ve sahte XFF ile hız sınırı denemesi kapsandı.
- Son mobil değişiklikten sonra sunucu TypeScript kontrolü ayrıca başarılı.
- npm audit: 0 güvenlik açığı.
- `tools/verify-release.mjs`: 226 dosya hash'i, production başlatma, sağlık kontrolü, HTML arayüzü ve korumalı API'de 401 başarılı. Geçici DB ve rastgele test anahtarları kullanıldı; entegrasyon işleri kapalıydı.
- Arşiv SHA-256 ve içerik listesi kontrol edildi.

## Düzeltmeler

Production/staging artık geliştirme DB'sine geri dönmüyor. Production açılışında eksik DB, demo/düz metin kullanıcı parolası, uygunsuz CORS ve tüm proxy'lere güvenen ayar reddediliyor. Uygulama aynı porttan API ve derlenmiş arayüz sunuyor. `npm start`, `npm run preflight`, sürüm kontrolü ve paketleme komutları eklendi. CI Node.js 24'e ve gerçek proje testlerine geçirildi.

Demo giriş düğmesi production arayüzünden kaldırıldı. Web/mobil parola denetiminde saklanan hash'in doğrudan parola olarak kabul edilmesi düzeltildi; geçersiz parola türü 400 döndürüyor. Production genel 5xx yanıtında iç hata ayrıntısı gizleniyor.

İlk toplu testte Windows rename kilidi ve yutulan yazma hatası görüldü. Atomik değiştirme için geçici EPERM/EACCES/EBUSY hatalarında toplam en fazla 150 ms beklemeli sınırlı deneme eklendi. Kalıcı hata artık çağırana iletiliyor; `update` ve `runTransaction` diske yazma başarılı olmadan yeni belleği yayımlamıyor. Hata enjeksiyonunda önceki disk/bellek korunması doğrulandı. Son E2E koşusunda beklenmedik saklama hatası görülmedi. Yerel regresyon logundaki `Injected permanent lock` satırları bu negatif testin beklenen çıktılarıdır.

## Sınırlar ve hedef ortam işi

Lint uyarıları ve büyük JS paket boyutu uyarısı devam ediyor. Bu koşu bütün iş modüllerinin uçtan uca kabulü veya bağımsız güvenlik denetimi değildir. Release smoke testi mevcut bilgisayarın bağımlılıklarıyla çalıştı; temiz hedef sunucuda `npm ci --omit=dev` ve kabul testi ayrıca uygulanmalıdır.

Hedef sunucu/alan adı/TLS, gerçek production veri ve hesapları, anahtarlar, servis yöneticisi, kalıcı disk, dış ortam yedeği ve geri yükleme tatbikatı henüz kurulmadı. JSON saklama modeli tek uygulama süreci gerektirir. Canlı entegratör geçişi ve gerçek sağlayıcı kabulü ayrıca gereklidir. Bu nedenle sonuç “dağıtım adayı yerelde doğrulandı”; “canlıya alındı” değildir.

Uygulama adımları: [Dağıtım kılavuzu](57_DAGITIM_KILAVUZU.md).
