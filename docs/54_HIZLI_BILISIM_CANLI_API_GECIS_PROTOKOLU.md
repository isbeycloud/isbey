# İŞBEY CLOUD — FAZ 32: Hızlı Bilişim Canlı (Production) API Geçiş Protokolü

**Tarih:** 2026-09-19  
**Durum:** ⚠️ CANLI API BAĞLANTISI DOĞRULANDI — e-Belge yaşam döngüsü kanıtı bekliyor  
**Proje:** `D:\İŞBEY`  
**Canlı API Endpoint:** `https://econnect.hizliteknoloji.com.tr`  
**Firma:** BEYOĞLU TEKNOLOJİ LTD. ŞTİ. (VKN: 1681136628)  
**Kalan Canlı Kontör:** 189,00 Kontör  

---

## 1. Yönetici Özeti ve Gelinen Nokta

İŞBEY CLOUD e-Dönüşüm sistemi, `.env` içinde tutulan canlı kimlik bilgileriyle **canlı (production) API ortamına (`https://econnect.hizliteknoloji.com.tr`)** bağlanabildi. Kimlik bilgileri dokümana veya kaynak koda yazılmaz.

1. **Pre-Live Snapshot & Güvenlik:** `data/database.json` zaman damgalı snapshot ve `.sha256` sidecar oluşturuldu.
2. **Acil Geri Alma (Rollback):** Önce kuru çalışma yapan, servis durdurma onayı ve geri alınabilir yerel snapshot gerektiren `tools/hizli-rollback-sandbox.mjs` hazırlandı.
3. **Canlı UtilEncrypt Doğrulaması:** Canlı sunucuda şifreleme başarıyla yapıldı (`IsSucceeded: true`).
4. **Canlı Login & Bearer Token:** Canlı JWT token başarıyla alındı (`BEYOĞLU TEKNOLOJİ LTD. ŞTİ.`, VKN: `1681136628`).
5. **Canlı Bakiye Okuma:** Canlı API'den kalan bakiye **189,00 Kontör** olarak başarıyla teyit edildi.
6. **Sıfır Belge Tüketim Sözleşmesi:** Doğrulama sırasında hiçbir fatura iletilmedi, kontör tüketilmedi.
7. **Henüz tamamlanmayan kanıt:** Kontrollü gerçek belge gönderimi, ETTN ile sorgulama, iptal sonucu ve canlı kontör hareketi gözlemlenmedi; bunlar resmi belge verisiyle ayrıca doğrulanacak.

---

## 2. Canlı Doğrulama Adımları Tablosu

| Adım | Kontrol | Durum | Açıklama |
|---|---|:---:|---|
| **ADIM 1** | **Canlı Ortam & Güvenlik Parametreleri** | ✅ PASS | Host: `econnect.hizliteknoloji.com.tr`, `IS_TEST_MODE=false`, `ALLOW_PROD=true`. |
| **ADIM 2** | **Canlı Host Egress & TLS Erişimi** | ✅ PASS | Canlı API HTTPS bağlantısı ve SSL sertifikası doğrulandı. |
| **ADIM 3** | **Canlı UtilEncrypt REST Şifrelemesi** | ✅ PASS | Canlı SecretKey ile şifrelendi (`IsSucceeded: true`). |
| **ADIM 4** | **Canlı Login & Bearer Token (24h)** | ✅ PASS | 24 saatlik canlı Bearer token alındı (Firma: BEYOĞLU TEKNOLOJİ LTD. ŞTİ.). |
| **ADIM 5** | **Canlı GİB Mükellef Sorgusu (`checkGibUser`)** | ⛔ BLOCKED | Hızlı Bilişim `GetGibUserList` çağrısı "An error has occurred" döndürüyor. Bu, e-Fatura/e-Arşiv profilini otomatik seçmek için yeterli değildir; sağlayıcıdan yanıt/çözüm beklenir. |
| **ADIM 6** | **Canlı Kontör & Kredi Bakiyesi Teyidi** | ✅ PASS | **189,00 Kalan Kontör** canlı olarak okundu (`Message: Başarılı`). |
| **ADIM 7** | **Sıfır Belge & Kontör Güvencesi** | ✅ PASS | Doğrulama sürecinde 0 fatura iletildi, 0 kontör harcandı. |

---

## 3. Kontrollü Canlı Belge İçin Gerekli İş Bilgileri

Canlı bağlantı hazırdır; ancak resmi belge sadece gerçek, yetkilendirilmiş bir işlemden üretilebilir. Test alıcısı, uydurma VKN/TCKN, tutar veya seri ile canlı belge gönderilmez.

### 1. Onaylı Fatura Taslağı
- Gönderilecek taslağın İŞBEY fatura kimliği veya eksiksiz fatura verisi.
- Gerçek ve yetkili alıcı bilgisi (VKN/TCKN, unvan, gerekli adres/iletişim alanları).
- Doğru belge serisi, tarih, mal/hizmet satırları, KDV/tevkifat ve toplamlar.
- Bu belgenin canlıda kesilmesi ve gerektiğinde iptal testinde kullanılmasına ilişkin iş onayı.

### 2. Sağlayıcı Ön Koşulu
- `GetGibUserList` hatası çözülmeden otomatik e-Fatura/e-Arşiv ayrımı güvenilir değildir. Hızlı Bilişim desteğinden canlı istek/yanıt kaydıyla çözüm teyidi alınmalıdır.

---

## 4. Ön Koşullar Sağlandığında Doğrulama Akışı

Ön koşullar sağlandığında:
1. `npm run ci` ile derleme ve güvenlik doğrulaması tamamlanır.
2. `node --import tsx server/tests/phase32LiveApiVerificationTest.ts` ile bağlantı ve başlangıç kontörü kaydedilir. Sağlayıcı hatası sürerse sonuç `PASS=6, BLOCKED=1` kabul edilir; bu adım yapay olarak PASS yapılmaz.
3. Onaylı taslak bir kez gönderilir; dönen ETTN/UUID ile sağlayıcının belge sorgusu kaydedilir.
4. Aynı belgenin sağlayıcıda iptal kabulü kanıtlanır; yerel durum yalnızca bu kabulden sonra `CANCELLED` olur.
5. Kontör; gönderim öncesi, gönderim sonrası ve iptal/iade sonrası okunur. Her değer ve sağlayıcı yanıtı denetim kaydına eklenir.

Geri alma ve mutabakat adımları için [canlı e-Belge geri alma prosedürüne](55_CANLI_EBELGE_GERI_ALMA_PROSEDURU.md) bakın.
