# Faturaya çoklu ürün ekleme

30 Ekim 2026: Satış ve alış faturasında Ürünler Penceresi çoklu seçimi destekler.

- Satır kutuları ürünleri işaretler. Arama ve filtre değişiminde işaretler korunur. Seçilenleri Ekle düğmesi tümünü tek seferde faturaya aktarır.
- Üstteki toplu seçim kutusu yalnız listelenen varyantsız ürünleri seçer; varyantlı ürün için kullanıcı açıkça varyant seçer. Aynı ürünün farklı varyantları ayrı seçimlerdir. Tekrar işaretleme aynı ürün/varyantı çoğaltmaz.
- Seçilenler açılır özetinden tek tek kaldırılabilir veya tüm seçim temizlenebilir. Kapat düğmesi henüz aktarılmamış seçimleri faturaya yazmaz; yeniden açılışta seçim sıfırlanır.
- Toplu aktarma tek işlevsel React güncellemesiyle mevcut satırlar üzerinden yapılır. Var olan ürün/varyantın miktarı artar; düzenlenmiş fiyatı korunur ve aynı grupta eklenen diğer satırlar kaybolmaz. Yeni satırlar mevcut satış/alış ve fiyat listesi çözümlemesini kullanır.
- Çoklu seçim yalnız fatura çağrısında etkinleştirilir. Tekli seçim, teklif ve irsaliye çağrılarının mevcut arayüzü korunur.

Doğrulama: `23-invoice-multi-product.spec.ts` satış/alışta fiyatlar, aramalar arasında seçim, mevcut ürünle birlikte toplu ekleme, elle düzenlenmiş fiyat, iptal/yeniden açma, mobil düğme erişimi, filtreli toplu seçim ve farklı varyantları kapsayan 6 senaryoyu sınar. Önceki ürün seçiminin 7 senaryosu da doğrulandı. İzole fiyat listesi sözleşmesi 20, varyant sözleşmesi 19 kontrolden geçti. Gerçek belge kaydı veya gönderimi yapılmadı.
