# Hızlı Bilişim tam birim kataloğu

29 Ekim 2026

Hızlı Bilişim'in `GET /HizliApi/RestApi/GetCodeList?type=BIRIM` yanıtı yetkili firma kimliğiyle salt okunur alındı. Bu işlemde belge gönderilmedi, kontör tüketen bir belge işlemi yapılmadı ve canlı veri/ortam dosyaları değiştirilmedi.

Yanıt **96 satır, 95 farklı kod** içeriyordu. `src/data/hizliUnitCatalog.ts` dosyası doğrulanan kod/açıklamaları ve kaynak URL, alınma zamanı, satır sayısı ve normalize edilmiş kod/ad verisinin SHA-256 özetini içerir; erişim bilgisi içermez. Referans verisi uygulamayla paketlenir; temel birim gösterimi için her ekran açılışında sağlayıcıya bağlanılmaz.

- Sağlayıcıdaki `CEN` kodunun sonundaki satır sonu temizlendi. Ham faturaların birim kodları bu işlemden etkilenmez.
- `MWH` iki açıklamayla dönüyordu. Seçim listesinde kod tek kez bulunur; ikinci açıklama `alternativeNames` içinde korunur. Kod çoğaltılmaz ve rastgele bir `BirimId` üretilmez.
- Açıklamalar sağlayıcıdan geldiği biçimde saklanır. Ekranlarda yerleşik Adet, Metre, Kg gibi kısa adlar korunur; eski `NAR` kodu da okunmaya devam eder. Birim miktarları dönüştürülmez: örneğin Yüz Adet kodundaki miktar 100 ile çarpılmaz.
- Hızlı fatura oluşturma ekranında 95 kod seçilebilir. Gelen fatura, eşleştirme, baskı ve uygulamanın ürettiği XSLT görünümleri ortak katalogdan yararlanır. Özgün sağlayıcı XML/XSLT'si korunur.

Ürün seçildiğinde ürünün Kg, Metre, Kilometre gibi tanımlı birimi doğru kodla satıra alınır; Adet dışındaki her birimi NIU yapma hatası kaldırıldı. Geçerli bir kod zaten varsa korunur. Tanınmayan ürün biriminde kullanıcıdan listeden seçim istenir; otomatik Adet varsayılmaz ve eksik seçimle kayıt başlatılmaz. Birim adı belirsizse bilinen eşanlamlılar dışındaki bir kod tahmin edilmez.

Mevcut kod-listesi bağlantısı seri listesindeki `Prefix` alanını bekliyordu. Resmî sözleşmedeki `Codes: [{Code, Explanation, Percent?}]` alanı doğrulanıp `code/name` biçimine çevrilir. Sağlayıcı başarısızlığı, bozuk/boş satırlar ve çelişkili sayısal oranlar sahte başarıya çevrilmez. Kodlar XSLT koşuluna girdiğinden BIRIM için güvenli kod biçimi doğrulanır; açıklamalar HTML/React metni olarak kaçışlanır.

Testler kod-listesi yanıt sözleşmesini, CEN temizliğini, MWH açıklamalarının korunmasını, katalog/seçim listesinin tamamını, nadir birimlerin gösterimini ve miktar/tutarların değişmemesini kapsar. Dağıtım paketi hem ortak gösterim yardımcısını hem katalog dosyasını içerir. Canlı kontrol salt okunurdur; fatura kaydı/aktarımı veya e-posta gönderimi yapılmaz.
