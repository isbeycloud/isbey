# Beyoğlu sağlayıcı doğrulaması — 24 Eylül 2026

Canlı İşbey firma kimliği: `f0af349d-da17-419c-b9e4-1fde66beec3d`, VKN `1681136628`.

Saat 20:54 UTC salt okunur e-Connect kontrolünde giriş hesabının VKN ve unvanı doğrulandı. Belge gönderme, iptal, seri oluşturma veya kontör yükleme çağrısı yapılmadı.

- GİB kaydı: e-fatura mükellefi.
- PK: `urn:mail:defaultpk@beyogluteknoloji.com`.
- GB: `urn:mail:defaultgb@beyogluteknoloji.com`.
- Kontör: 162,00; `KalanKontorSorgula` yanıtı ve müşteri VKN'si doğrulandı. Eski `GetCredits` ucu 404 dönüyor; o uç başarılı sayılmadı.
- Seriler: `BTE`, `BTF`.
- BTE2026 son belge: `BTE2026000000137`, sonraki: `BTE2026000000138`.
- BTF2026 son belge: `BTF2026000000141`, sonraki: `BTF2026000000142`.

Bu numaralar anlık gözlemdir; rezerve edilmedi ve ERP sayacı değiştirilmedi. Seri kullanıcı tarafından seçilmeli, gerçek gönderim öncesi tekrar sorgulanmalıdır.

Önceki GİB hatasının sebebi sorgudaki `Type=VKN_TCKN` değeriydi. `Type=PK` ve `Type=GB` sorguları başarılı oldu. Kod `gibUserLists` yanıtını okur, `IsSucceeded` bayrağını denetler ve farklı VKN/bozuk yanıtı reddeder. Birden fazla etiket varsa ilkini otomatik seçmez. Seri listesi `Prefix` dizisinden okunur; son fatura sorgusunda HTTP 200 içindeki iş hatası başarı sayılmaz. Sözleşme kaynağı: [Hızlı Teknoloji Swagger](https://econnect.hizliteknoloji.com.tr/swagger/ui/index).

Doğrulama geliştirme bilgisayarından canlı sağlayıcıya yapılmıştır; Hostinger kaynaklı sağlayıcı erişim kabulünün yerine geçmez. Canlı uygulamada TEST ortamı, kapalı entegrasyon ve kapalı otomatik gönderim korunur. Gerçek fatura kabulü yapılmadı.
