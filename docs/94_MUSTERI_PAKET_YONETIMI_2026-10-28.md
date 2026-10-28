# Müşteri paket ve ücret yönetimi

Firma & Şirketler ve Platform Yönetimi → Firmalar / Tenants listelerinde **Paket / Ücret** düğmesi bulunur. Firma detayındaki **Paket / Lisans** sekmesi aynı formu kullanır. Düzenleme platform ADMIN / SUPER_ADMIN yetkisi gerektirir.

## Kullanım

- Satışa açık hizmet paketlerini seçerek paket yükseltilebilir veya değiştirilebilir.
- Ücretsiz, ücretli ve deneme kullanım türleri seçilebilir.
- Aylık/yıllık dönem, katalog bedeli veya anlaşmalı dönem bedeli, başlangıç/bitiş ve otomatik yenileme tercihi kaydedilir.
- Her kayıtta gerekçe zorunludur; son 10 değişiklik, yapan kişi ve tarih görüntülenir.
- Kaydetme, paket hizmetlerini ve kotalarını hemen uygular. Tahsilat, ödeme veya fatura oluşturmaz. Otomatik yenileme alanı bir tercih kaydıdır; ödeme entegrasyonu değildir.

## Veri kuralları

Mevcut firmalar otomatik olarak ücretli/ücretsiz sınıflandırılmaz. Eski ücretsiz paketler ve deneme durumları gösterilir; diğer eski kayıtlarda “Ücret türü belirtilmemiş” yazılır. Ticari koşullar yalnız yönetici kaydettiğinde oluşur.

Ücretsiz ve deneme bedeli sıfırdır; otomatik yenileme kapalıdır. Ücretli bedel pozitiftir. Birlikte seçilen paketlerin para birimi aynı olmalıdır. Kotalar mevcut hizmet kataloğu kuralıyla seçilen paketlerin en yüksek limitinden alınır. Etkin kullanıcı, bu ayki belge veya kullanılan depolama kotayı aşıyorsa değişiklik reddedilir.

Firma ve abonelik tarihleri, hizmetler, kotalar, lisans durumu, tek abonelik kaydı ve denetim kaydı tek işlemde güncellenir. Askıya alınmış/pasif firma paket değişikliğiyle etkinleştirilmez. Süresi geçmiş paket yenilendiğinde lisans durumu güncellenir. Deneme e-belge hizmetlerini açmaz.

Eşzamanlı düzenlemelerde eski ekranın kaydı 409 ile reddedilir. Başka firmanın mali verileri değiştirilmez. Yönetilen TRY ücretli paketlerde aylık gelir yıllık bedel / 12 veya aylık anlaşmalı bedelden hesaplanır; ücretsiz, deneme, süresi dolmuş ve askıya alınmış kayıtlar gelir oluşturmaz. Farklı para birimleri TRY toplamına çevrim yapılmadan eklenmez.

## Doğrulama

`server/tests/companyPackageManagementTest.ts` gerçek HTTP istekleriyle yetki, firma izolasyonu, hatalı giriş, eşzamanlı değişiklik, kota kontrolü, ücretsiz/ücretli/deneme geçişi, yenileme, kayıt kalıcılığı ve mali veri değişmezliğini denetler.

`tests/05-company-packages.spec.ts` gerçek tarayıcıdan her iki yönetim ekranındaki ücretsiz ve yıllık ücretli geçişi, bedelin yeniden açıldığında korunmasını ve değişiklik geçmişini denetler. `tests/application.spec.ts` firma detayından kullanım tarihlerini yeniler ve sunucudan tekrar okur.
