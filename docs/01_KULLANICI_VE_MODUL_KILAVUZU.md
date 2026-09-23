# İŞBEY CLOUD — KAPSAMLI KULLANICI VE MODÜL KILAVUZU
**Sürüm:** 2026.1 (Bulut SaaS Sürümü)  
**Doküman Kodu:** DOC-USR-2026-01  
**Hedef Kitle:** İşletme Sahipleri, Ön Muhasebe Uzmanları, Satış Temsilcileri ve Yöneticiler

---

## 1. Giriş ve Sisteme Genel Bakış

**İŞBEY CLOUD**, KOBİ'ler, toptancılar, perakendeciler, e-ticaret işletmeleri ve kurumsal şirketler için geliştirilmiş, **yeni nesil bulut tabanlı Ön Muhasebe, ERP ve e-Dönüşüm yönetim platformudur**. 

Hiçbir yerel sunucu, karmaşık kurulum veya lisans anahtarı gerektirmeden; internete bağlı herhangi bir masaüstü bilgisayar, tablet veya akıllı telefon tarayıcısı üzerinden 7/24 kesintisiz çalışır.

### Temel Sistem Özellikleri:
* **Çoklu Şirket & Şube Desteği:** Tek bir hesaptan birden fazla ticari işletmeyi veya şubeyi bağımsız yönetebilme.
* **GİB Canlı Entegratörü:** Hızlı Teknoloji ve Gelir İdaresi Başkanlığı ile doğrudan entegre e-Fatura, e-Arşiv, e-İrsaliye, e-Müstahsil ve e-SMM yönetimi.
* **Rol ve Yetki Tabanlı Güvenlik (RBAC):** Personelinize sadece kendi yetki alanına giren modülleri gösterme (örneğin sadece POS satışı yapabilen kasiyer veya sadece cari ekstresi görebilen muhasebe yardımcısı).
* **Anlık Senkronizasyon:** Çok kullanıcılı çalışma ortamında aynı anda yapılan satışlar, stok hareketleri ve tahsilatlar saniyeler içinde tüm ekranlara yansır.

---

## 2. Sisteme Giriş ve İlk Kurulum Sihirbazı (Onboarding)

1. **Giriş Ekranı (`/login`):**
   * Kullanıcı adı (e-posta) ve şifrenizle giriş yapınız.
   * Şifrenizi unuttuysanız *"Şifremi Unuttum"* bağlantısını kullanarak kayıtlı e-postanıza anında sıfırlama bağlantısı gönderilmesini sağlayabilirsiniz.
   * Güvenlik için opsiyonel **İki Adımlı Doğrulama (2FA - SMS/Authenticator)** aktif edilebilir.

2. **İlk Kurulum Sihirbazı (Setup Wizard):**
   * Yeni bir hesap açtığınızda sistem sizi 3 adımlı sihirbaz ile karşılar:
     * **Adım 1: Şirket Bilgileri:** Ticari unvan, vergi dairesi, VKN/TCKN, iletişim ve adres bilgileri.
     * **Adım 2: Faaliyet ve Para Birimi:** Ana faaliyet kolunuz, varsayılan para birimi (TRY, USD, EUR, GBP) ve KDV oranları.
     * **Adım 3: e-Dönüşüm & İlk Stok/Cari:** e-Fatura entegratör bilgileri veya Excel şablonu ile toplu cari/ürün yükleme.

---

## 3. Modül Kullanım Rehberi

### 3.1. Dashboard (Yönetici Kontrol Paneli)
* **Özet Finansal Metrikler:** Günlük ciro, bu ayki toplam satışlar, toplam tahsilatlar ve vadesi yaklaşan alacaklar.
* **Kasa & Banka Anlık Durumu:** Kasalardaki nakit para ve banka hesap bakiyelerinin canlı özeti.
* **Kritik Stok Uyarıları:** Minimum stok seviyesinin altına düşen ürünlerin anlık listesi.
* **Hızlı Aksiyon Butonları:** Tek tıkla *Hızlı Fatura Kes*, *Yeni Cari Ekle*, *Tahsilat Yap (F8)* veya *Ödeme Yap (F9)*.

---

### 3.2. Cari Hesap Yönetimi (Müşteri & Tedarikçiler)
1. **Yeni Cari Kartı Tanımlama:**
   * *Cari -> Yeni Cari Ekle* butonuna tıklayın.
   * Unvan, Cari Türü (*Müşteri, Tedarikçi, Hem Müşteri Hem Tedarikçi*), Vergi No ve Adres girin.
   * **Otomatik VKN Sorgulama:** VKN/TCKN girdiğinizde sistem GİB e-Fatura mükellefiyetini otomatik sorgular ve cari kartını *"e-Fatura Mükellefi"* olarak işaretler.
   * Vade günü, iskonto oranı ve risk limiti belirleyebilirsiniz.
2. **Cari Ekstresi ve Bakiye Takibi:**
   * Herhangi bir carinin satırına tıklayarak tüm fatura, tahsilat, ödeme ve çek hareketlerini kronolojik olarak görün.
   * Tek tıkla **PDF veya Excel Cari Ekstresi** oluşturup müşterinize WhatsApp veya E-posta ile gönderin.
3. **B2B Online Tahsilat Linki:**
   * Müşteriye özel tek kullanımlık veya kalıcı güvenli ödeme linki oluşturarak kredi kartıyla anında tahsilat yapın.

---

### 3.3. Stok ve Depo Yönetimi
1. **Ürün/Hizmet Tanımlama:**
   * Barkod, Ürün Adı, Kategori, Alış Fiyatı, Satış Fiyatı ve KDV oranını (%1, %10, %20) belirleyin.
   * Varyantlı ürün desteği (Renk, Beden, Numara vb.).
   * Hizmet/Masraf kartları açarak danışmanlık, nakliye veya işçilik kalemlerini stoksuz takip edin.
2. **Kritik Stok Seviyesi & Sayım:**
   * Ürün bazında asgari stok miktarı tanımlayın. Stok bu adedin altına düştüğünde sistem otomatik sipariş önerisi üretir.
   * Depo sayım fişi ile fiziki ve program sayımı arasındaki farkları tek tuşla dengeleyin.
3. **Barkod Basımı:**
   * EAN-13, CODE-128 veya QR formatında etiket çıktısı alarak raf ve ürün etiketleri yazdırın.

---

### 3.4. Satış, Teklif, Sipariş ve İrsaliye
1. **Teklif & Sipariş Yönetimi:**
   * Müşterinize şık tasarımlı kurumsal teklif hazırlayın.
   * Teklif kabul edildiğinde tek tuşla **Siparişe**, ardından **İrsaliyeye** veya doğrudan **e-Faturaya** dönüştürün.
2. **e-Fatura / e-Arşiv Fatura Kesme:**
   * *Faturalar -> Yeni Satış Faturası* ekranını açın.
   * Cariyi seçin; sistem carinin e-Fatura mükellefi olup olmadığını anında tespit eder ve belge türünü (e-Fatura ya da e-Arşiv) otomatik belirler.
   * Ürünleri barkod okutarak veya listeden aratarak ekleyin.
   * Tevkifat, istisna veya özel matrah gerekiyorsa GİB kodunu seçin.
   * **Önizle ve Gönder:** Faturanın resmi XSLT şablonunu ve GİB karekodunu inceleyin, ardından *"GİB'e Gönder"* butonuna basarak saniyeler içinde alıcısına iletin.

---

### 3.5. Hızlı POS Satış Ekranı (Perakende & Barkodlu Satış)
* Dokunmatik ekran ve barkod tabancası ile uyumlu tam ekran satış arayüzü.
* **Çoklu Tahsilat:** Aynı fiş tutarını Nakit, Kredi Kartı ve Cari Açık Hesap arasında anında paylaştırma.
* **Parka Alma:** Müşteri ürün seçmeye devam ederken satışı beklemeye alma ve diğer müşteriye geçme.
* 80mm ve 58mm termal fiş yazıcıları ile anında otomatik fiş basımı.

---

### 3.6. Kasa, Banka ve Finans Merkezi
1. **Kasa İşlemleri:**
   * Merkez kasa, mağaza kasası veya döviz kasaları açma.
   * Nakit tahsilat, ödeme, virman ve gün sonu kasa devri.
2. **Banka Hesapları & POS Hesapları:**
   * Banka hesap bakiyeleri, havale/EFT giriş-çıkışları.
   * Kredi kartı POS blokeli bakiyeleri ve hesaba geçiş gün takipleri.
3. **Çek ve Senet Portföyü:**
   * Alınan ve verilen çeklerin vade, keşideci, banka ve tutar bilgileri.
   * Çek cirolama, tahsile verme, karşılıksız ve iade durumlarının tam otomasyonu.

---

### 3.7. Yapay Zeka Finans Asistanı (AI Analytics)
* **Akıllı Nakit Akış Tahmini:** Gelecek 30 günlük alacak ve borç vadelerini analiz ederek işletmenizin nakit açığı yaşayıp yaşamayacağını öngörür.
* **Kârlılık Analizi:** En çok kâr bırakan ve kârlılığı düşen ürün ve müşteri segmentlerini tespit eder.
* **Kayıp Müşteri Tespiti (Churn Warning):** Düzenli alışveriş yapıp son 60 gündür sipariş vermeyen müşterileri listeler ve kampanya önerir.

---

## 4. Kısayol Tuşları (Hızlı İşlem Rehberi)

| Kısayol | İşlev |
|---|---|
| **Ctrl + K** | Global Akıllı Arama & Komut Paleti |
| **F8** | Hızlı Tahsilat Ekle (Nakit / Kredi Kartı / Havale) |
| **F9** | Hızlı Ödeme Ekle (Tedarikçiye / Masraf) |
| **F2** | Yeni Satış Faturası Oluştur |
| **F4** | Hızlı POS Satış Ekranına Geç |
| **Esc** | Açık olan modal pencereyi veya formu kapat |

---

## 5. Güvenlik, Yedekleme ve Destek

* **Veri Güvenliği:** Tüm veriler 256-bit SSL şifreleme ve izole veritabanı tenant yapısıyla saklanır.
* **Günlük Otomatik Yedekleme:** Verileriniz günde 3 kez farklı coğrafi yedekleme merkezlerine kopyalanır.
* **Teknik Destek:** Çalışma saatleri içinde panel içi canlı destek, bilet sistemi veya `destek@isbey.cloud` adresi üzerinden 15 dakika içinde yanıt garantisi.
