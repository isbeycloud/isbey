# İçe aktarılan faturalarda birim adları

29 Ekim 2026

Gelen belge detayında, eşleştirme ekranında, fatura kalemlerinde ve uygulamanın kendi önizleme/baskı çıktılarında bilinen birim kodları okunabilir adlarla gösterilir.

| Kod | Görünen birim |
| --- | --- |
| NIU, C62, NAR | Adet |
| MTR | Metre |
| KGM | Kg |
| GRM | Gram |
| LTR | Litre |
| MTK / MTQ | m² / m³ |

Diğer tanımlı birimler aynı ortak eşleyiciden gelir. Bilinmeyen kod için ad tahmin edilmez; kod olduğu gibi gösterilir. Eksik birim, ilgili ekranın mevcut boş değer davranışını korur. HTML hücrelerindeki bilinmeyen kodlar da kaçıştan geçirilir.

UBL çözümleyicisi ham `unitCode` alanını korur, okunabilir `unitName` alanını ortak eşleyiciyle üretir. Böylece sonraki aktarımlarda NIU adı da Adet olarak çözülür. Önceden kaydedilmiş ham kodlu birimler, kayıtlar değiştirilmeden gösterim sırasında çevrilir; toplu veri düzeltmesi yapılmaz. Miktar, birim fiyat, KDV ve toplam hesaplamaları değişmez.

Uygulamanın standart ve üretilen XSLT şablonları aynı eşlemeyi kullanır. Tedarikçinin gömülü XSLT tasarımı, özgün XML ve entegratöre giden ham kodlar değiştirilmez. Ürün adı/kodu içinde geçen NIU gibi metinlerde genel bul/değiştir uygulanmaz. İndirilen XML özgün birim kodlarını içerir.

Kontroller, ham kodların korunmasını, eski kodlu kayıtların ekranda ve baskıda doğru görünmesini, bilinmeyen kodun korunmasını ve miktar/tutarların değişmemesini kapsar. Canlı kontrol salt okunurdur; yeni fatura aktarılmaz ve belge gönderilmez.
