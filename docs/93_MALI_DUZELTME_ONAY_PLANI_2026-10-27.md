# SAT-2026-000001 — uygulanmaya hazır mali düzeltme

27 Ekim 2026. Durum: kullanıcı onayıyla canlıya uygulandı, canlı API üzerinden doğrulandı.

## Kanıt

Sağlayıcıya salt okunur yeni sorgu yapıldı: belge bulundu, zarf kodu 1300,
GİB'e iletim başarılı, belge numarası BTF2026000000144, tutar 120 TRY.
Alıcı kimliği ve ETTN mevcut faturayla düzeltme aracının K4 kapısında eşleşti.
Bu, sağlayıcı yanıtıdır; bağımsız GİB portalı sorgusu değildir.

Güncel alınmış canlı kopyada aynı firma ve alıcı kimliğiyle cari kartı yok.
Faturanın `customerId` alanı boş; belgeye bağlı cari hareketi yok.

## Canlıda yapılması önerilen işlem

1. Faturadaki doğrulanmış alıcı için CUSTOMER türünde cari kartı aç:
   ABDULLAH KARADUMAN - KAREN TEKNOLOJİ, VKN/TCKN 15512014278.
   İlk bakiye 0; iletişim veya fiyat bilgisi tahmin edilmez.
2. SAT-2026-000001 faturasını bu karta bağla.
3. Belge tarihi 25 Eylül 2026 olan tek bir 120,00 TL borç / 0,00 TL alacak
   hareketi oluştur. Düzeltmenin yapıldığı zaman ayrıca denetim kaydına yazılır.
4. Cari/koşan bakiyeleri mevcut hesaplama kuralıyla üret; defter kontrollerini
   ve tekrar çalıştırmada ikinci hareket oluşmadığını doğrula.

İşlem tahsilat kaydı oluşturmaz; yeni caride 120,00 TL alacak bakiyesi doğurur.
Fatura tutarı, belge tarihi, satırlar, stok, ürünler ve e-belge durumu korunur.
Belge yeniden gönderilmez.

## Ölçülen prova

Prova yalnız `.verify-tmp/codex-20261027-finance-preview.json` üzerinde yapıldı.
Canlı veritabanına yazılmadı.

| Kontrol | Sonuç |
|---|---|
| Yeni cari | 1 |
| Yeni cari hareketi | 1; borç 120,00 / alacak 0,00 |
| Defter denetimi | 6/6 başarılı; geçici istisna kullanılmadı |
| İkinci çalıştırma | Değişiklik gerekmiyor; dosya yazılmadı |
| Stok hareketleri / ürünler | Birebir aynı |
| Toplam cari bakiye | −252.924,59 → −252.804,59 TL |
| Değişen koleksiyonlar | customers, invoices, currentTransactions, auditLogs |

19 iş kuralı uyarısı sürüyor; özellikle 13 ürünün sıfır satış fiyatı bu
düzeltmenin kapsamında değil. Defterin altı kapısının geçmesi bu uyarıları çözmez.

## Uygulama öncesi

Önceki mali iş emrinin docs/90 §6 maddesi yeni cari kartı için açık onay
istiyor. Kullanıcı bu sohbette “Bu mali düzeltmeyi canlıda uygula” yanıtıyla
önerilen cari ve tek hareket işlemini açıkça onayladı.

Canlı uygulamadan hemen önce taze yedek, kaynak özeti ve kayıt eşleşmeleri
yeniden doğrulanmalı. Çalışan sürecin bellekte tuttuğu veritabanı eski kopyayla
ezilmemeli; işlem boyunca eşzamanlı yazma engellenmeli ve yeniden başlatma
sonrasında API üzerinden kayıt doğrulanmalı. SHA uyuşmazlığında işlem durmalı.

Kanıt/prova dosyaları müşteri bilgisi içerdiğinden Git dışında tutulur.

## Canlı uygulama sonucu

Uygulama zamanı: **27 Ekim 2026 21:12:13, Europe/Istanbul**.

Kısa bakım aralığında dış isteklerin 503 aldığı doğrulandı. Aynı uygulama
dizininde çalışan iki Node süreci duraklatıldı; çalışan belleğin eski DB'yi
geri yazması önlendi. Veri önce sunucudaki ayrı aday dosyada düzeltildi;
bütün kapılar ve kapsam kontrolleri geçince atomik olarak yerine kondu.
İki eski süreç sonlandırıldı; bakım kaldırıldıktan sonra uygulama **tek süreçle**
yeniden açıldı.

- Yeni cari: **CAR-005**, CUSTOMER, bakiye **120,00 TL**.
- Yeni hareket: **1**, 25 Eylül 2026 belge tarihi, borç 120,00 / alacak 0,00 TL.
- Fatura bağlantısı: SAT-2026-000001 → CAR-005.
- Stok, ürünler, diğer faturalar, önceki cari kartları ve önceki hareketler
  kayıt bazında karşılaştırıldı; değişmedi.
- Kullanıcı onaylı cari açma ve fatura düzeltme için iki denetim kaydı yazıldı.
- Canlı defter denetimi **6/6**; istisna kullanılmadı.
- Canlıda ikinci düzeltme çalıştırması: değişiklik gerekmiyor, yazım yok.
- Canlı cari / ekstre / fatura API'leri: **200**, ekstrede **tek hareket**,
  bakiye **120**, fatura doğru cariye bağlı.
- Ana sayfa ve sağlık: **200 / healthy**.

Canlı API doğrulaması mevcut yetkili kullanıcıya bağlı, bellekte üretilen
60 saniyelik token ile salt okunur yapıldı. Token veya ortam anahtarları
çıktıya veya dosyaya yazılmadı; yeni kalıcı oturum oluşturulmadı.

Yedek SHA256:
`1463f0c0883a7f1c1f042658e9b9725f7f204e70ff55482c3fc73dc1d5bd53e0`.
Uygulama sonrası SHA256:
`c0703ea694403e40c3ab8a7ba55df98f4c3cf9272d5ee03c276cf1ba7ec869af`.
Uzak yedek özeti yeniden doğrulandı. Canlı son denetimler dosya özetini değiştirmedi.

19 uyarı ve 13 üründeki sıfır satış fiyatı devam ediyor; bunlar bu onayın
kapsamı dışında. Güvenlik kodunun yeni sürümü bu işlem sırasında dağıtılmadı.
