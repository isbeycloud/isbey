# Tanıtım sayfası, SEO ve AI arama

30 Ekim 2026. Kullanıcının onayladığı ana adres: **https://isbey.com.tr/**.

## Sayfa ve içerik

Tanıtım sayfası yeniden düzenlendi: marka kimliğini koruyan sade başlık, etkileşimli temsili ürün ekranı, altı işlev alanı, üç adımlı başlangıç, çözüm grupları ve yedi SSS yanıtı. Masaüstü, 390 px ve 320 px genişlikler kontrol edilir. Menü, gerçek giriş/kayıt akışları, klavyeyle ürün önizleme sekmeleri ve JavaScript gerektirmeyen SSS açma davranışı çalışır.

Eski sabit fiyat tabloları birbiriyle uyuşmuyordu. Doğrulanmamış kullanıcı yorumları, puanlar, indirimler, sertifika, doğrudan özel entegratörlük, pazaryeri/banka senkronizasyonu ve yerel mobil uygulama iddiaları kaldırıldı. Gönderim yapmadan başarı gösteren demo formu ve örnek telefon/WhatsApp bilgileri de kaldırıldı. Sağlanan marka logosu değiştirilmedi. e-Belge sağlayıcısı Hızlı Bilişim olarak açıklandı; 14 günlük ön muhasebe denemesi ve ayrı e-Dönüşüm başvuru süreci ayrıştırıldı. Güncel ticari kapsam ve fiyatlar mevcut hesap içi paket kataloğunda kalır.

## Teknik SEO

- `marketingContent.ts`: Sayfa, JSON-LD ve AI ürün özetinin ortak bilgi kaynağı.
- `tools/prerender-landing.mjs`: Derleme sonunda aynı React tanıtım bileşenini HTML'e işler. Tüm ziyaretçilere aynı içerik verilir; bot algılama, gizli SEO metni veya özel veri yoktur. Sadece `noscript` içine kopya içerik koymak yerine gerçek sayfa HTML'de bulunur.
- Başlık, açıklama, canonical, Open Graph ve Twitter paylaşım verileri `isbey.com.tr` ile tutarlıdır. 1200 × 630 paylaşım görseli `public/brand/isbey-social.png` dosyasındadır.
- Organization, WebSite, SoftwareApplication ve görünür yanıtlarla aynı FAQPage verisi oluşturulur. Doğrulanmamış değerlendirme, fiyat teklifi veya çalışmayan SearchAction yoktur.
- Site haritasında yalnız gerçek ana sayfa URL'si vardır. Bölüm çapaları ayrı sayfa gibi eklenmez.
- Robot grupları aynı özel alan kısıtlarını paylaşır. OAI-SearchBot ve diğer arama botları kamuya açık içeriğe erişebilir. Hesap, paylaşım ve ödeme yolları hem robots kapsamına hem HTTP `X-Robots-Tag: noindex, nofollow` yanıtına tabidir.
- `llms.txt` yalnız açık, doğrulanmış ürün bilgisinin isteğe bağlı özetidir; sıralama sağlayan özel bir standart veya indeksleme garantisi olarak sunulmaz.

Derleme: `npm run build`. SEO varlıkları normal derlemede `dist/` içine oluşturulur. İzlenen `public/robots.txt`, `public/sitemap.xml`, `public/llms.txt` kopyalarını aynı kaynakla eşitlemek için başarılı derlemeden sonra `node tools/prerender-landing.mjs --sync-public` kullanılır. Pazarlama bilgisi değiştiğinde tam derleme yeniden yapılmalıdır.

## Açılış performansı

Anonim ana sayfa ERP uygulamasından ayrıldı. Önceki ana JavaScript çıktısı yaklaşık 2.960 KB iken yeni ilk JavaScript çıktısı yaklaşık 213 KB (gzip yaklaşık 68 KB). ERP, giriş/kayıt istendiğinde veya mevcut oturum/özel bağlantı bulunduğunda yüklenir. Yalnız ilk paketin dosya boyutu ölçülmüştür; bu rakam PageSpeed veya Core Web Vitals puanı değildir.

## Doğrulama ve yayın

`24-marketing-seo.spec.ts`: JavaScript kapalı okuma, tek H1, görünür SSS/JSON-LD eşleşmesi, canonical, sitemap, robots, ürün özeti, özel URL'lerin noindex yanıtı, gerçek giriş/kayıt, mobil taşma, klavye sekmeleri ve ERP'nin ertelenmiş yüklenmesini sınar. Kayıt/paket ve oturumdan çıkış testleri de çalıştırılır. Genel test sonuçları `.verify-tmp/landing-all-browser.log` ve `.verify-tmp/landing-all-local.log` içinde tutulur.

Bu çalışma yerel proje değişikliğidir. Canlı dağıtım, DNS/alan adı yönlendirmesi, Search Console/Bing sahiplik doğrulaması ve arama motorlarına site haritası gönderimi yapılmış sayılmaz. Yayında alan adının aynı uygulamaya hizmet verdiği ve HTTP/WWW varyantlarının tek canonical adrese yönlendiği kontrol edilmelidir. Hesap erişimi olmadan ölçüm veya indeksleme sonucu raporlanmaz.

## Birincil kaynaklar

- [Google: AI özellikleri ve web siteniz](https://developers.google.com/search/docs/appearance/ai-features): Temel SEO, metin olarak erişilebilir içerik ve görünür içerikle tutarlı yapılandırılmış veri; özel AI işaretlemesi gerekmiyor.
- [Google: Canonical URL](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls).
- [OpenAI: Yayıncılar için SSS](https://help.openai.com/en/articles/12627856): Arama görünürlüğü için OAI-SearchBot; eğitim taraması ayrı bir kontroldür.
- [Bing: Webmaster yönergeleri](https://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a).
