# İŞBEY CLOUD — SİSTEM MİMARİSİ, GÜVENLİK VE GELİŞTİRİCİ API DOKÜMANI
**Sürüm:** 2026.1  
**Doküman Kodu:** DOC-SYS-2026-03  
**Hedef Kitle:** Yazılım Mimarları, Sistem Yöneticileri, Güvenlik Denetçileri ve API Entegratörleri

---

## 1. Mimari Genel Bakış ve Multi-Tenant SaaS Yapısı

İŞBEY CLOUD, modern kurumsal SaaS standartlarında geliştirilmiş, yüksek erişilebilirliğe (High Availability - %99.9 Uptime) sahip mikro-modüler bir mimariye sahiptir.

```
┌─────────────────────────────────────────────────────────────┐
│                       KULLANICI KATMANI                     │
│   Web Tarayıcıları (Desktop/Mobile)  │  Tablet POS & Kiosk  │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS / WSS / TLS 1.3
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 GÜVENLİK & REVERSE PROXY KATMANI            │
│   Cloudflare WAF / DDoS Koruması / Hız Sınırlayıcı (Rate)  │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   İŞBEY API & UYGULAMA MOTORU               │
│  ┌──────────────────────┐  ┌─────────────────────────────┐  │
│  │ Subscription State   │  │ Atomic Credit Wallet Engine │  │
│  │ Machine & Proration  │  │ (2-Phase Commit e-Document) │  │
│  └──────────────────────┘  └─────────────────────────────┘  │
│  ┌──────────────────────┐  ┌─────────────────────────────┐  │
│  │ Multi-Level Dealer & │  │ GİB UBL-TR 1.2 XML Pipeline │  │
│  │ Commission Engine    │  │ & XSLT Rendering Core       │  │
│  └──────────────────────┘  └─────────────────────────────┘  │
│  ┌──────────────────────┐  ┌─────────────────────────────┐  │
│  │ Tokenized Payment &  │  │ AI Financial Forecasting    │  │
│  │ Webhook Idempotency  │  │ Engine                      │  │
│  └──────────────────────┘  └─────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│               VERİ TABANI & VERİ GÜVENLİĞİ KATMANI          │
│   Tenant Isolation (Firma Bazlı Veri Ayrımı)                │
│   AES-256 Veri Tabanı Şifreleme (At-Rest)                   │
│   Günlük Çoklu Coğrafi Snapshot Yedekleme                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Güvenlik Standartları ve Uyumluluk

### 2.1. ISO 27001 & Bilgi Güvenliği Yönetimi
* Tüm uygulama ve veri tabanı sunucuları ISO/IEC 27001:2022 sertifikalı Tier-3 veri merkezlerinde barındırılmaktadır.
* Veriler iletim anında (In-Transit) TLS 1.3 ve 256-bit şifreleme ile; saklama anında (At-Rest) AES-256 standardı ile korunur.

### 2.2. KVKK (Kişisel Verilerin Korunması Kanunu) Uyumu
* Müşteri ve personel kişisel verileri maskeleme ve rol bazlı erişim kısıtlaması ile korunur.
* Sistemde kullanıcıların gerçekleştirdiği her işlem (oturum açma, fatura silme, cari değiştirme, ekstre indirme) değiştirilemez **Denetim İzi (Audit Log Stream)** kütüğüne IP adresi ve cihaz bilgisi ile kaydedilir.

### 2.3. Cihaz Güvenliği & Çok Faktörlü Doğrulama (2FA)
* TOTP tabanlı (Google Authenticator, Microsoft Authenticator) veya SMS tabanlı iki aşamalı doğrulama.
* Bilinmeyen yeni bir cihazdan giriş yapıldığında hesap sahibine anlık bildirim ve doğrulama kodu gönderimi.
* Şüpheli oturumları tek tıkla tüm cihazlardan sonlandırma (Remote Session Kill).

---

## 3. REST API Mimarisi ve Uç Noktaları

İŞBEY CLOUD, işletmenizin e-ticaret siteleri (WooCommerce, Shopify, Ideasoft, Ticimax vb.), pazaryeri entegratörleri ve özel ERP yazılımlarıyla konuşabilmesi için kapsamlı bir REST API sunar.

### Kimlik Doğrulama (Authentication):
Tüm istekler HTTP başlığında Bearer Token ile iletilmelidir:
```http
Authorization: Bearer isb_live_sec_xxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
X-Tenant-Id: ten_01H8X9A7BC12
```

### Temel API Uç Noktaları:

#### 1. Müşteri / Cari Hesaplar
* `GET /api/v1/customers`: Cari listesi ve anlık borç/alacak bakiyeleri.
* `POST /api/v1/customers`: Yeni cari kartı oluşturma (VKN e-Fatura kontrolü dahil).
* `GET /api/v1/customers/{id}/statement`: Cari hesap ekstresi (JSON / PDF).

#### 2. Ürün & Stok Yönetimi
* `GET /api/v1/products`: Ürün listesi, birim fiyatlar ve depo stok miktarları.
* `POST /api/v1/products`: Yeni ürün veya varyant ekleme.
* `PUT /api/v1/products/{id}/stock`: Anlık stok artırma / azaltma.

#### 3. Faturalar & e-Belge Gönderimi
* `POST /api/v1/invoices`: Satış faturası oluşturma.
* `POST /api/v1/invoices/{id}/send-einvoice`: Faturayı GİB'e iletme ve e-Fatura / e-Arşiv üretme.
* `GET /api/v1/invoices/{id}/pdf`: Resmi GİB onaylı faturanın PDF formatını alma.

#### 4. B2B Ödeme & Tahsilat
* `POST /api/v1/payments/create-link`: Müşteriye özel güvenli kredi kartı tahsilat linki üretme.
* `GET /api/v1/payments/{token}/status`: Tahsilatın başarı durumunu sorgulama.

---

## 4. Webhook Altyapısı ve Idempotency

Dış sistemleri anlık bilgilendirmek için İŞBEY CLOUD Webhook motoru devreye girer:
* **Desteklenen Olaylar:** `invoice.created`, `einvoice.approved`, `einvoice.rejected`, `payment.received`, `stock.low_threshold`.
* **Güvenlik & İmza (HMAC-SHA256):** Gelen her webhook isteğinin İŞBEY'den geldiğini doğrulamak için `X-Isbey-Signature` başlığı kullanılır.
* **Idempotency:** Ağ hatalarında tekrar gönderilen webhook'lar aynı işlem ID'si (Idempotency Key) ile kontrol edilir ve mükerrer kayıt oluşumu %100 engellenir.
