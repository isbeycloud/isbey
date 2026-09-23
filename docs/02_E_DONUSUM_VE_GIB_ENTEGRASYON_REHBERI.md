# İŞBEY CLOUD — e-DÖNÜŞÜM VE GİB ENTEGRASYON REHBERİ
**Sürüm:** 2026.1  
**Doküman Kodu:** DOC-EDN-2026-02  
**Mevzuat Uyumu:** Gelir İdaresi Başkanlığı (GİB) 509 Sıra No.lu VUK Genel Tebliği

---

## 1. e-Dönüşüm Nedir ve Neden İŞBEY CLOUD?

e-Dönüşüm; ticari işletmelerin kağıt ortamında düzenledikleri fatura, irsaliye, serbest meslek makbuzu, müstahsil makbuzu ve defterlerin Gelir İdaresi Başkanlığı (GİB) standartlarına uygun olarak dijital ortamda düzenlenmesi, iletilmesi, saklanması ve raporlanması sürecidir.

**İŞBEY CLOUD**, lisanslı özel entegratör altyapısı (Hızlı Teknoloji / GİB Doğrudan Web Servisleri) üzerinden hiçbir aracı programa veya karmaşık donanıma ihtiyaç duymadan resmi e-Belgelerinizi tek tıkla üretir ve yasal 10 yıllık güvenli arşivleme sağlar.

---

## 2. Desteklenen e-Belge Türleri

1. **e-Fatura (Ticari & Temel Fatura):**
   * e-Fatura mükellefi olan işletmeler arasındaki faturalaşma standardıdır.
   * *Temel Fatura:* Alıcının doğrudan kabul ettiği senaryo.
   * *Ticari Fatura:* Alıcının 7 gün içinde GİB üzerinden "Kabul" veya "Red" cevabı verebildiği senaryo.
2. **e-Arşiv Fatura (B2C & Son Kullanıcı / Vergi Mükellefi Olmayanlar):**
   * e-Fatura mükellefi olmayan kurumlara veya nihai tüketicilere düzenlenen resmi faturalardır.
   * Alıcıya SMS ve E-posta ile anında iletilir; GİB 5.000 TL / 30.000 TL zorunlu portallarına gerek kalmadan doğrudan sistemden kesilir.
3. **e-İrsaliye:**
   * Mal sevkiyatlarında kağıt sevk irsaliyesi yerine geçen, sevkiyat öncesi GİB'e iletilen ve üzerinde karekod bulunan resmi taşıma belgesidir.
   * Şoför ve araç plaka bilgileri, taşıyıcı VKN/TCKN bilgileri eksiksiz işlenir.
4. **e-Serbest Meslek Makbuzu (e-SMM):**
   * Avukat, doktor, mühendis, mali müşavir ve serbest danışmanların düzenlediği stopaj ve tevkifat hesaplamalı resmi makbuz.
5. **e-Müstahsil Makbuzu (e-MM):**
   * Tarımsal ve hayvansal ürün alımlarında çiftçilere düzenlenen tevkifatlı belge.
6. **e-Defter:**
   * Yevmiye ve Kebir defterlerinin GİB formatında elektronik olarak hazırlanıp beratlarının alınması.

---

## 3. İlk Geçiş ve Aktivasyon Adımları

### Adım 1: Mali Mühür veya e-İmza Temini
* **Tüzel Kişiler (LTD, A.Ş.):** TÜBİTAK KamuSM üzerinden şirket adına *Mali Mühür* temin edilmelidir.
* **Şahıs Şirketleri:** Şahıs adına alınmış geçerli bir Nitelikli Elektronik Sertifika (*e-İmza*) yeterlidir.

### Adım 2: İŞBEY CLOUD Özel Entegratör Aktivasyonu
1. İŞBEY panelinizde *Ayarlar -> e-Dönüşüm Ayarları* ekranına gidin.
2. Özel Entegratör Kullanıcı Adı ve Şifrenizi girin veya *"Entegratör Aktivasyon Başvurusu Yap"* butonuna tıklayın.
3. Şirket logonuzu (PNG formatında yüksek çözünürlüklü) ve imza kaşenizi sisteme yükleyin.
4. Sistem tarafından otomatik oluşturulan resmi XSLT fatura şablonunu önizleyin.

---

## 4. e-Fatura Düzenleme ve Gönderim Süreci

```
[İŞBEY Satış Faturası Girişi] 
       │
       ▼
[Otomatik GİB VKN/TCKN Mükellefiyet Kontrolü]
       │
 ┌─────┴────────────────┐
 │                      │
 ▼ (Mükellef İse)       ▼ (Mükellef Değilse)
[e-Fatura Modu]       [e-Arşiv Fatura Modu]
       │                      │
       ▼                      ▼
[Atomik Kontör Rezervasyonu (1 Kontör Kilitlenir)]
       │
       ▼
[GİB Schematron / UBL-TR 1.2 XML Doğrulaması]
       │
       ▼
[GİB Özel Entegratör API İletimi & Dijital İmzalama]
       │
       ▼
[GİB Durum Kodu: 1300 (Başarıyla İletildi)]
       │
 ┌─────┴────────────────┐
 │                      │
 ▼ (Başarılı)           ▼ (Hata Oluştuysa)
[Kontör Kalıcı Düşülür] [Kontör Anında İade Edilir (Rollback)]
[GİB Karekod & PDF]    [Hata Açıklaması Kullanıcıya Bildirilir]
```

---

## 5. Atomik Kontör Cüzdanı Çalışma Mantığı

İŞBEY CLOUD, e-belge gönderimlerinizde kontör kaybını tamamen önleyen **2 Aşamalı Atomik Rezervasyon (Two-Phase Commit)** mimarisi kullanır:

1. **Rezervasyon (Hold):** Faturayı gönder dediğinizde cüzdanınızdan 1 kontör harcanmaz; sadece `reservedBalance` alanına aktarılır.
2. **Doğrulama (Validation):** Fatura GİB UBL standartlarına göre doğrulanır.
3. **Commit (Kalıcı Düşüş):** Entegratör faturayı başarıyla imzalayıp GİB'e ilettiğinde kontör kesin olarak düşülür.
4. **Rollback (Otomatik İade):** GİB sunucularında kesinti, hatalı VKN veya geçersiz XML tespit edilirse rezerve edilen kontör **0 saniye gecikmeyle anında cüzdanınıza iade edilir**.

---

## 6. Gelen Faturaların (Gelen Kutusu) Yönetimi

* Tedarikçilerinizin firmanıza kestiği tüm e-Faturalar doğrudan İŞBEY CLOUD *Gelen e-Faturalar* kutusuna düşer.
* **Tek Tıkla Alış Faturasına Dönüştürme:** Gelen e-Faturayı açıp *"Stoklara İşle"* dediğinizde faturadaki ürünler ve fiyatlar otomatik olarak sisteminize işlenir, manuel veri girişine gerek kalmaz.
* **Ticari Fatura Kabul / Red:** 7 günlük yasal süre içinde faturayı panel üzerinden tek tuşla kabul edebilir veya red gerekçesi yazarak reddedebilirsiniz.

---

## 7. Yasal Saklama ve Arşivleme Güvencesi

* Kesilen ve gelen tüm e-Faturalar, e-Arşivler ve e-İrsaliyeler **GİB onaylı 10 yıllık güvenli bulut arşivinde** saklanır.
* Olası vergi denetimlerinde istenen faturalar tarih, cari unvanı veya GİB Fatura No (`GIB2026000000001`) kriterleriyle saniyeler içinde taranıp toplu ZIP / PDF olarak indirilebilir.
