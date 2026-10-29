# Masraf kalemleri ve gider işlem dökümü

Rapor, **Raporlar → Gider İşlem Dökümü** veya **Giderler → İşlem Dökümü ve Masraf Raporu** düğmesinden açılır. Gider listesine dönüş düğmesi mevcut kayıt ekranına döndürür.

## Kullanım

Tarih aralığı ve para birimi seçilir. Kategori, maliyet merkezi, ödeme yöntemi, kasa/banka hesabı ve arama alanlarıyla sonuç daraltılır. Arama fiş, açıklama, belge ve tedarikçi gibi kayıt bilgilerini kapsar. Gösterilen toplamlar yalnız uygulanan filtrelerin sonucudur; farklı para birimleri toplanmaz.

- **İşlem Dökümü:** Her gider kaydı için tarih, fiş, açıklama, masraf kategorisi, ödeme hesabı, KDV hariç tutar, KDV ve genel toplam.
- **Masraf Kalemleri:** Aynı gider kayıtlarının kategori bazında adet ve tutar toplamları.
- **Maliyet Merkezleri:** Giderlerin kayıtlı maliyet merkezlerine dağılımı.

Satır detayı, kayıtta bulunan tedarikçi, makbuz/belge numarası ve notları gösterir. Mevcut şemada gider kaydı tek masraf kaydıdır; ayrı fatura kalemleri varmış gibi alt satırlar üretilmez.

CSV ve yazdırma çıktısı seçilen kapsamı ve para birimini taşır. CSV metinlerinin elektronik tablo formülü gibi çalışması engellenir. Eksik/verisi doğrulanamayan kayıtlar uyarıyla ayrıca belirtilir.

## Veri ve erişim

Yeni `GET /api/reports/expense-transactions` ucu her istekte güncel kalıcı veri görüntüsünü salt okunur alır. Yalnız yetkili firmanın giderleri ve kullanıcıya açık hesaplarla ilişkili kayıtlar değerlendirilir. Para birimi yalnız kayıt veya doğrulanabilen ödeme hesabından belirlenir; bilinmeyen para birimi TRY varsayılmaz. Silinmiş kayıtlar ve geçersiz tutarlar rapor toplamına girmez.

Kasa/banka hareketleri veya alış faturaları tekrar gider sayılmaz. KDV hariç tutar, KDV ve genel toplam ayrı tutulur. Rapor alma mali hareket oluşturmaz ve mevcut muhasebe hesaplama formüllerini değiştirmez.

Gider kaydının mevcut hesaplamasından gelen kuruş altı KDV hassasiyeti yalnız rapor görünümünde kuruşa yuvarlanır. Bu durum uyarıda belirtilir; kaynak net/KDV/toplam tutarları ve hesaplama formülleri değiştirilmez. Yönetici raporunun gider özeti de aynı gösterim ilkesini kullanır.

Mevcut gider işlemlerindeki firma ve hesap kontrolleri de uygulanır: başka firmanın gideri listelenemez, kullanılamayan hesaba gider işlenemez ve yabancı gider silinemez. Silme kontrolü ilgili hesap ve gider hareketiyle sınırlıdır; aynı belge numarasını kullanan diğer firma hareketleri korunur. Eksik veya çelişen iade bağlantısında işlem durur.
