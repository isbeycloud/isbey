# Kolay kullanım incelemesi ve ilk uygulama

## İnceleme kapsamı

Günlük firma kullanımına odaklanan ilk tur: üst menü, sol menü, genel arama, hızlı işlem, klavye ile gezinme, açık form davranışı ve mobil alan kullanımı. Firma/paket ve mağaza cihaz tanımı ekranlarının mevcut senaryoları da regresyon kapsamındadır. Bu teknik kullanım incelemesidir; gerçek müşterilerle kullanıcı testi veya süre/verimlilik araştırması yapılmış sayılmaz.

## Doğrulanan sorunlar ve uygulanan değişiklikler

| Sorun | Kanıt / etkisi | Yapılan değişiklik |
|---|---|---|
| Ctrl+K iki arama açıyordu | Önceki derlemede gerçek tarayıcıda2 modal katmanı ölçüldü. AppContext ve ayrı komut paleti aynı tuşu dinliyordu. | Tek genel arama; eski bağımsız palet kaldırıldı, komutları ortak aramaya taşındı. |
| Mobil üst menü taşması | 390px görünümde üst menü scrollWidth990px idi; firma/kullanıcı kontrolleri ekran dışında kalıyordu. | Dar ekranlarda iki satırlı üst menü, görünür firma/kullanıcı/bildirim/arama kontrolleri ve sınırlı açılır menüler. |
| Daraltılan menü tekrar açılamıyordu | Açma düğmesinin kendisi daraltılmış durumda display:none oluyordu. | Genişletme düğmesi görünür; aktif menü aria-current ile işaretli. |
| Arama hatası boş sonuç gibi görünüyordu | catch yalnız konsola yazıyordu. | Açık hata, Tekrar Dene; yerel menü sonuçları ağ yanıtını beklemiyor. |
| Geciken eski arama yanıtı yeni sonucu ezebiliyordu | İstek sırası/iptal bağlamı yoktu. | Sorgu, filtre, kullanıcı ve firma bağlamı kontrolü; kapanan/eski istek sonucu gösterilmez. |
| Bazı menü arama hedefleri geçersizdi | Eski sunucu menü verisinde masraf/efatura ve bazı sekme adları AppView/RibbonTab ile uyuşmuyordu. | Arayüzde tip kontrollü güncel menü kataloğu; masraf=>gider, banka=>KASA_BANKA, yazar kasa=>POS. Eski MODULE sonuçları gezinmede kullanılmaz. |
| Genel F tuşları formlarla çakışıyordu | Genel dinleyici odaklanan alanı/açık diyaloğu dikkate almıyordu. | Form veya diyalog açıkken genel ekran değiştirme kısayolları çalışmaz; formun kendi preventDefault kararı korunur. |
| Nerede olunduğu belirsizdi | Birçok ekran üstte yalnız genel ERP başlığı gösteriyordu. | Gider, teklif, irsaliye, gelen belge, arşiv, görev, destek ve diğer ilgili ekranların başlıkları tanımlandı. |
| Cihaz ayarı masaüstünde gereksiz dardı | 1150px istenmesine rağmen genel modal max-width sınırı640px idi. | Cihaz diyaloğuna açık genişlik üst sınırı verildi; masaüstünde iki alan, mobilde tek sütun. |

## Ortak aramanın davranışı

- Üstte **Menü ve kayıt ara**, klavyede Ctrl+K / Cmd+K / F10. Tek pencere, görünür kapatma, Escape, oklar ve Enter; diyalog içinde Tab dolaşımı ve kapatınca odağın geri dönmesi.
- Türkçe karakterlerden bağımsız menü araması: örn. `ŞİRKET`, `musteri`, `yazar kasa`, `masraf`, `banka`.
- Yeni cari/ürün/fatura ve tahsilat/ödeme kısayolları yalnız modül ve ekleme yetkisi bulunan kullanıcıya gösterilir. Mevcut merkezi modül izinleri ve profildeki işlem kodları kullanılır; yeni arama yetki vermez.
- Menü araması cihazda yerel çalışır. **Menüler** filtresi kayıt API'sine istek göndermez. Kayıt arama başarısızsa bu durum ayrı gösterilir.
- Kayıt sonuçları ilgili listeyi açar; tekil kayıt ayrıntısı açıldığı iddia edilmez. Alış faturası sonucu alış listesine, satış sonucu satış listesine gider. Tam kayıt ayrıntısına doğrudan geçiş sonraki çalışmadır.
- Hızlı eylemler form açar; kendiliğinden kayıt veya tahsilat yapmaz. Muhasebe, stok, KDV ve ödeme hesapları bu değişiklikte yoktur.

## Doğrulama

Gezinme sözleşmesi Türkçe eşleme, geçerli hedef/sekme, takma ad ve salt-okunur rol süzmesini ölçer. Yeni tarayıcı senaryoları tek pencere, menü daralt/aç, ağ yokken menü geçişi, mobil kontroller, odağın geri dönmesi, hata/yeniden dene, eski yanıtı yok sayma, formun F tuşlarında korunması ve RAPOR kullanıcısında oluşturma/platform komutlarının gizlenmesini ölçer.

Tam sürüm kapısı ve canlı kontrol sonuçları yayın raporuna kaydedilir. İşlem yapan tarayıcı testleri yalnız izole test veritabanında çalışır; canlı kontrol okuma ve gezinmeyle sınırlıdır.

## Sonraki kullanım çalışmaları

| Öncelik | İş akışı | İncelenecek somut konu |
|---|---|---|
| 1 | Fatura / hızlı satış | Dar ekranlarda ürün seçimi, sepet, toplam ve kaydetme alanına erişim. Hesaplama motorunu değiştirmeden yerleşim. |
| 1 | Yeni cari / ürün / belge formları | Zorunlu alanların tutarlı gösterimi, ilk hataya odak, örnek girişler ve kaydetme sonrası anlaşılır sonuç. |
| 2 | Liste ve detay | İki ayrı arama kutusunun anlamı, filtreleri temizleme, boş sonuç ile servis hatasının ayrımı; aranan tekil kayda doğrudan geçiş. |
| 2 | Yeni kullanıcı başlangıcı | Rolüne göre3–5 günlük işlem ve ilk kullanım açıklamaları; sistemde olmayan örnek bakiye/satış gösterilmemesi. |
| 2 | Yardım / terimler | Cari, kontör, paket, e-hizmet ve cihaz bağlantısının ekran içi kısa açıklamaları; üretici bekleyen hizmetlerin aktif gibi görünmemesi. |

Bu listedeki akışların tamamı bu ilk turda yenilenmiş sayılmaz. Sonraki turlar gerçek firma çalışanıyla görev bazlı kullanım testiyle önceliklendirilmelidir.
