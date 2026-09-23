# GitHub ve FTP aktarımı — 23 Eylül 2026

## FTP'de tamamlananlar

- Derlenmiş arayüz ve SPA yönlendirmesi `/public_html` içine yüklendi.
- `https://bey360.com/index.html` ve `/login`, yerel `dist/index.html` ile birebir eşleşiyor.
- Ana JavaScript ve CSS dosyaları HTTPS üzerinden indirildi; SHA-256 değerleri yerel derlemeyle eşleşti.
- Ana sayfanın sorgu parametresiz adresinde eski içerik CDN önbelleğinden gelebiliyor. Hosting panelinden alan adı önbelleği temizlenmeli.
- Node.js sunucu arşivi `/nodejs/isbey-release-2026-09-23T06-34-15-310Z.tar.gz` konumunda. FTP üzerinden geri okunarak SHA-256 doğrulandı; yanındaki `.sha256` dosyası kontrol değerini içerir.
- `.env`, gerçek veritabanı, müşteri belgeleri ve `node_modules` yüklenmedi.

## Henüz tamamlanmayan sunucu kurulumu

Bu yayın şu anda statik arayüzdür. `/api/health` bilinçli olarak HTTP 503 döner; giriş, kayıt ve ERP işlemleri kullanıma hazır değildir.

Hosting paneli veya SSH erişimiyle:

1. Node.js 24 ve kalıcı disk kullanan tek uygulama sürecini hazırlayın.
2. Arşivi web kökü dışında açın; bağımlılıkları `npm ci --omit=dev` ile kurun.
3. `deploy/production.env.example` temelinde hedef ortam değişkenlerini oluşturun. Gerçek HTTPS origin `https://bey360.com` olmalı; `www` kullanılacaksa onu da açıkça ekleyin.
4. İşletme tarafından doğrulanmış temiz production verisini ve benzersiz kullanıcı hesaplarını hazırlayın. Yerel geliştirme veritabanını kullanmayın. Mevcut şifreli kayıt taşınacaksa şifreleme anahtarını koruyun.
5. `npm run preflight` başarılı olduktan sonra `npm start` çalıştırın ve servis yöneticisine kaydedin.
6. HTTPS ters proxyyi Express uygulamasına yönlendirin. Statik önizlemeye ait `.htaccess` dosyasındaki API 503 kuralı API'ye yönlendirmeden önce kaldırılmalıdır. Node.js uygulaması bütün alan adını sunacaksa statik önizleme yönlendirmesini devreden çıkarın.
7. CDN önbelleğini temizleyin; dışarıdan sağlık, giriş/çıkış, yetki ve firma izolasyonu kontrollerini uygulayın.

Ayrıntılar: [Dağıtım kılavuzu](57_DAGITIM_KILAVUZU.md). E-belge üretim entegrasyonu kapalı kalır; ayrı kabul sürecine tabidir.

## Yerel doğrulama

- Production derleme: başarılı.
- Yerel regresyon: 12 süit başarılı.
- Chromium E2E: 6 test başarılı.
- Bağımlılık taraması: 0 güvenlik açığı.
- Lint: başarılı, mevcut uyarılar var.
- Bir entegrasyon testine gömülü servis kimlik bilgileri kaldırıldı; kontrol artık ortam değişkenleriyle çalışıyor. Sonrasında typecheck ve lint tekrar başarılı oldu.
- GitHub'a hazırlanmış dosyalarda mevcut ortam sırları ve yaygın özel anahtar/token kalıpları tarandı; bulgu yok.

## GitHub

Hedef: https://github.com/isbeycloud/isbey — `main`.
Kaynaklar `main` dalına gönderildi. `git ls-remote` sonucu yerel commit ile eşleşerek doğrulandı. Gizli ortam dosyaları, veritabanı, bağımlılık klasörü ve çalışma arşivleri depoya alınmadı.
