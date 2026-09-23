# İŞBEY CLOUD ERP

React + TypeScript arayüz ve Express API. Node.js 24 kullanın.

## Geliştirme

```sh
npm ci
npm run dev
```

`.env.example` geliştirme ortamı içindir. Gerçek anahtarları kaynak koduna eklemeyin.

## Test ve sürüm paketi

```sh
npx playwright install chromium
npm run release:check
npm run release:package
```

`npm test` izole veritabanlarıyla yerel regresyon süitlerini çalıştırır. `npm run test:e2e` derlenmiş uygulamayı geçici veritabanıyla 4317 portunda açar; HTTP yetkilendirmesi, giriş/çıkış, oturum ve hız sınırını doğrular. Öncesinde `npm run build` çalışmış olmalıdır.

## Production

[Dağıtım kılavuzu](docs/57_DAGITIM_KILAVUZU.md) ve `deploy/production.env.example` dosyasını kullanın. Hedef sunucuda `npm ci --omit=dev`, `npm run preflight`, `npm start` sırasını izleyin. Production veritabanı, benzersiz hesap parolaları, alan adı ve anahtarlar ayrıca hazırlanır. Eksik veritabanı geliştirme verisine dönmez; demo parolalar production başlangıcında reddedilir.

JSON veritabanı nedeniyle tek uygulama süreci ve kalıcı disk gerekir. Canlı e-belge etkinleştirmesi ayrı sağlayıcı kabul ve geçiş prosedürüne tabidir.
