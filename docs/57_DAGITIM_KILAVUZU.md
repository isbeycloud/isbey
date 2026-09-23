# İŞBEY dağıtım kılavuzu

## Paket kapsamı

Node.js 24 üzerinde çalışan tek sunucu: Express API ve `dist` içindeki derlenmiş arayüz aynı porttan sunulur. Veritabanı JSON dosyası ve yüklenen belgeler kalıcı yerel diskte tutulur. **Tek uygulama süreci kullanın.** Birden fazla worker/replica mevcut bellek ve JSON saklama modeliyle desteklenmez.

Paket yalnız uygulama kodu, derlenmiş arayüz, bağımlılık kilidi, ortam şablonu ve bu kılavuzu içerir. `.env`, veritabanı, müşteri dosyaları ve `node_modules` dahil edilmez. `manifest.sha256.json` her paket dosyasının hash'ini, arşivin yanındaki `.sha256` ise arşiv hash'ini içerir.

## Geliştirme bilgisayarında

```sh
npm run release:check
npm run release:package
```

İlk E2E kurulumu için `npx playwright install chromium` gerekir. CI Linux üzerinde tarayıcıyı sistem bağımlılıklarıyla kurar. Release kontrolü gerçek uygulamaya karşı HTTP ve Chromium testleri, izole yerel süitler, derleme, lint ve bağımlılık güvenlik taraması çalıştırır. Lint uyarıları mevcut durumda engelleyici değildir.

## Hedef sunucuda

1. Node.js 24 ve HTTPS ters proxy hazırlayın. Arşivi uygulama dizinine açın; hash'lerini doğrulayın.
2. `npm ci --omit=dev` çalıştırın. Çalışma zamanındaki TypeScript yükleyicisi `tsx`, production bağımlılığıdır.
3. `deploy/production.env.example` dosyasını `.env` olarak kopyalayın. Gerçek alan adını `CORS_ALLOW_ORIGINS` içine HTTPS origin olarak yazın. JWT ve webhook anahtarlarını parola yöneticisinde üretip hedef sunucuda doldurun; boş şablonla uygulama başlamaz.
4. Önceden doğrulanmış production verisini `DATABASE_PATH` konumuna yerleştirin. `data/database.json` geliştirme verisini doğrudan üretime kopyalamayın. Kullanıcıların benzersiz bcrypt parolaları olmalı; demo ve düz metin parolalar başlangıçta reddedilir. Finansal kayıtlar, firma bilgileri ve belge dosyaları ayrıca işletme tarafından doğrulanmalıdır.
5. Şifreli kayıtlarla birlikte mevcut `CREDENTIAL_ENCRYPTION_KEY` anahtarını koruyun. Eski kurulum JWT üzerinden anahtar türetiyorsa JWT değişikliği kayıtları okunamaz hale getirebilir; önce mevcut migrasyon prosedürünü uygulayın. Paketleme hiçbir anahtarı döndürmez veya değiştirmez.
6. Veritabanı ve `data/storage` için kalıcı disk, günlük dış ortam yedeği ve geri yükleme tatbikatı hazırlayın. `.env` ve anahtarları ayrıca güvenli biçimde yedekleyin. Yazma yetkisini yalnız uygulama servis hesabına verin.
7. `npm run preflight` çalıştırın. Başarılıysa `npm start` ile başlatın ve işletim sisteminin servis yöneticisine **tek süreç** olarak kaydedin. Başlangıçta aynı preflight yeniden uygulanır.
8. Varsayılan dinleme `127.0.0.1:4000` üzerindedir. HTTPS ters proxy tüm uygulama yollarını buraya aktarmalı; `Host`, `X-Forwarded-Proto`, `X-Forwarded-For` başlıklarını doğru üretmelidir. Aynı makinedeki proxy için `TRUST_PROXY=loopback`; başka mimaride yalnız gerçek güvenilen proxy adreslerini belirtin. API portunu internete doğrudan açmayın.
9. Dış HTTPS adresinde `/api/health`, giriş/çıkış, yetkisiz erişimde 401, yetki sınırları, dosya görüntüleme ve yedekten geri dönüşü doğrulayın. Bu hedef ortam kontrolleri yerel testlerle ikame edilmez.

Arayüz dosyaları aynı sunucudan sunulduğu için ayrı Vite geliştirme sunucusu gerekmez. Bilinmeyen API yolları HTML yerine JSON 404 döner. SPA adresleri `index.html` ile açılır.

## e-Belge etkinleştirme

Dağıtım şablonunda `INTEGRATION_JOBS_ENABLED=false`, `HIZLI_BILISIM_ALLOW_PROD=false` ve test modu açıktır. Bu ayarlar arka plan oturum açma, yenileme ve belge kuyruğunu durdurur; canlı gönderimi etkinleştirmez. Hedef ortam, sağlayıcı sözleşmesi ve gerçek belge kabulü doğrulandıktan sonra entegratör geçiş prosedürünü ayrı uygulayın. Yerel kontör testi sağlayıcının kontör düşüm/iade kanıtı değildir.

## Geri alma

Servisi durdurun, çalışan sürümün kodunu ve veri/dosya yedeğini saklayın. Önceki sürüm kodunu geri koyun. Veri geri yüklemesi gerekiyorsa yalnız doğrulanmış yedeği kullanın; başarısız dağıtım sonrasında oluşmuş kayıtların kaybını değerlendirin. Anahtarları koruyun, `npm run preflight` ve sağlık/giriş kontrollerini yeniden çalıştırın. `tools/db-restore.mjs` geliştirme veritabanına yönelik olduğundan production geri dönüşü için doğrudan kullanılmamalıdır.

## Yayına geçiş için henüz gerekenler

22 Eylül sürümünde kullanıcı–firma üyelikleri, firma kapsamlı ayar/seri saklama, ERP süre denetimi ve sağlayıcı müşteri eşleştirme kontrolleri eklendi. Geçiş öncesi yedek alın; gerçek firma/VKN bağlantılarını ve ERP tarihlerini doğrulayın. Eski sürüme dönüş yalnız kod değiştirerek yapılmamalı: eski kod yeni firma izolasyonunu uygulamaz. Ayrıntılar `docs/61_CANLI_ONCESI_TAMAMLAMA_2026-09-22.md` içindedir.

Sunucu/alan adı ve TLS, temiz production verisi ve hesaplar, anahtarlar, servis kurulumu, dış ortam yedeği/geri yükleme kanıtı ve hedef ortam kabul testi. Bu bilgiler belirlenmeden yerel paket için “canlıya alındı” sonucu verilemez.
