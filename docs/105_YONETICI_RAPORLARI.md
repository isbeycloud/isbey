# Yönetici raporları

Raporlar ekranı yönetici raporlarıyla açılır. Önce tarih aralığı ve para birimi seçilip rapor alınır. Bu ay, son 90 gün ve bu yıl kısayolları dönem seçimini kolaylaştırır. Para birimleri birbirine eklenmez veya otomatik çevrilmez.

Yeni merkez yedi bölüm içerir:

- Özet: seçilen dönemin satış, alış ve giderleri; ayrıca güncel alacak, borç, kasa ve banka bakiyeleri.
- Borç–alacak: cari kartın güncel bakiyesi ve seçilen dönemin doğrulanabilen borç/alacak hareketleri.
- Ürünler: ürün, varyant ve birim bazında satış, satış iadesi ve net satış hareketleri.
- Tahmini brüt kâr: kayıtlardaki satış tutarları ile ürünün güncel alış maliyetinden üretilen tahmin ve maliyet bilgisi eksik satırlar.
- Aylık seyir: seçilen dönemdeki satış, alış ve iadelerin aylık karşılaştırması.
- Giderler: gider kayıtlarının kategori bazında KDV hariç tutarı, KDV'si ve toplamı.
- Stok riskleri: güncel kritik ve hareketsiz stoklar; farklı birimler bir araya toplanmaz.

Tablo araması, CSV indirme ve yazdırma rapor incelemesini destekler. CSV metinlerinde elektronik tablo formülü çalıştırabilecek önekler etkisizleştirilir. Yazdırmada birim ve para birimi açıkça belirtilir.

## Sonuçların anlamı

Tarih filtresi dönem hareketlerini sınırlar. Cari kart, kasa, banka ve stok bakiyeleri mevcut durumdur; geçmiş dönem sonu bakiyesi olarak gösterilmez. Rapor tarihi ekranda belirtilir.

Tahmini brüt kâr, tarihsel stok maliyeti veya resmî muhasebe net kârı değildir. Maliyet para birimi/birimi doğrulanamayan ya da maliyeti eksik satır için maliyet uydurulmaz. Veri kapsamı ve eksikler ayrıca gösterilir. Satış–alış farkı tek başına kâr olarak adlandırılmaz; gider kaydıyla kasa/banka hareketi ikinci kez gider yazılmaz.

Finansal kayıt durumu ile e-belgenin gönderim durumu farklıdır. Taslak, iptal ve silinmiş kayıtlar rapora yanlışlıkla tamamlanmış işlem olarak eklenmez. İadeler uygulamanın mevcut satış/alış yönüyle değerlendirilir.

## Teknik sınırlar

Yeni `GET /api/reports/management` ucu oturum, firma erişimi ve rapor görüntüleme izni gerektirir. Her istekte kalıcı veri dosyasının güncel, salt okunur görüntüsü kullanılır. Firma değişiminde önceki firmanın verileri gizlenir; gecikmiş yanıt eski raporu geri getiremez. Okuma hatası boş/başarılı rapor gibi gösterilmez.

Muhasebe, stok, KDV, cari, kasa ve banka yazma mantığı ile ana veri şeması değiştirilmez. Rapor alma, CSV ve yazdırma belge göndermez; tahsilat, fatura veya mali hareket oluşturmaz. Önceki rapor ekranları ayrı düğmeyle erişilebilir kalır.
