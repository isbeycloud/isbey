# Ortak müşteri ve firma yönetimi

Yan menüdeki **Müşteri & Firmalar**, firma listesi, Hızlı Bilişim müşteri havuzu ve platform ayarlarını **Müşteri & Firma Yönetimi** ekranında toplar.

## Bölümler

- **Firmalar:** tek firma listesi, arama ve durum/paket/ücret türü filtreleri. Firma Detayı üzerinden bilgiler, kullanıcılar, hizmetler ve diğer firma ayarları; Paket / Ücret üzerinden mevcut paket yönetimi açılır. Platform yöneticisinin gerekçeli destek erişimi firma satırında bulunur.
- **Müşteri Havuzu:** sağlayıcıdan müşteri seçme, aktarma, firma eşleştirme, sağlayıcı bağlantıları, entegrasyon kayıtları ve e-hizmet başvuruları korunur. Sağlayıcı müşteri kayıtları otomatik olarak firma veya cari kayıtlarıyla birleştirilmez.
- **Platform Ayarları:** platform özeti, paket tarifeleri, kontör paketleri, bayi ağı ve duyurular. Firma Listesini Aç aynı ortak firma listesine döner; ikinci bir firma tablosu tutulmaz.

## Yetki ve uyumluluk

Eski `companies`, `tenants`, `platform-admin`, `saas-admin` ve `hizlibilisim` ekran kimlikleri korunur. Ortak ekran yalnız kullanıcının mevcut modül izinlerine uygun bölümleri gösterir. Yan menü yalnız izin/scope filtresinden zaten geçmiş girişleri birleştirir.

Firma yöneticisinin mevcut `companies` erişimi yan menüden görünür hale getirilir; yalnız kendi firma listesine erişir. Müşteri havuzu ve platform ayarları, paket düzenleme, yeni firma oluşturma ve gerekçeli destek erişimi platform yöneticilerine açık kalır. Ortak ekran testiyle bulunan platform API erişim eksikliği giderilir: `/api/v1/platform-admin` rotasının tamamı kimlik ve ADMIN/SUPER_ADMIN kontrolüyle korunur. Destek geçişinin yöneticisi istek gövdesinden değil gerçek oturumdan alınır; eski tenant yanıtı da gizli alanları maskeler. Mevcut firma izolasyonu korunur.

Platformdaki eski firma tablosu kaldırıldığı için liste, durum, paket/ücret ve firma detayında tek bileşen ve aynı şirket API'si kullanılır. Destek erişimi mevcut denetimli `/api/admin/impersonate` akışına bağlanır; gerçek firma bağlamı değiştirilir ve mevcut geri dönüş bandı kullanılır. Destek uçlarının firma yanıtlarında gizli alanlar maskelenir. Platform özetindeki sabit örnek gelir/firma/bayi/sağlık rakamları kaldırılmıştır; yüklenemeyen metrik “Alınamadı” olarak gösterilir.

## Doğrulama kapsamı

`tests/06-customer-management-hub.spec.ts` tek yan menü girişi, ortak firma listesine dönüş, firma kullanıcıları, destek erişimi formu, müşteri havuzu, paket tarifeleri, mobil taşma ve firma yöneticisinin yalnız kendi firmasını görebilmesini denetler. Bu dolaşım testinde API yazma isteği olmamalıdır.

Mevcut müşteri aktarımı, paket değiştirme, lisans tarihi yenileme ve muhasebeci menü kısıtlaması senaryoları yeni ortak girişe uyarlanmıştır. Paket kaydetme doğrulaması ve sunucu iş kuralları korunur. Bu düzenleme veritabanı, muhasebe motoru veya gerçek sağlayıcı gönderim akışını değiştirmez.
