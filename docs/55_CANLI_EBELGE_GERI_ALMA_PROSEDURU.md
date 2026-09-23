# İŞBEY CLOUD — Canlı e-Belge Geri Alma ve Mutabakat Prosedürü

**Sürüm:** 1.0  
**Tarih:** 2026-09-19  
**Kapsam:** Hızlı Bilişim entegrasyonunda canlı belge gönderimi, iptal hatası veya yanlış yapılandırma sonrası güvenli geri alma.

## Temel kural

Yerel rollback, yalnızca İŞBEY'in `.env` ayarlarını ve yerel JSON veritabanını değiştirir. Entegratörde oluşmuş belgeyi, ETTN durumunu veya kontör hareketini **geri almaz**. Bu yüzden canlıda gönderilmiş bir belge için önce entegratör/GİB tarafındaki işlem kanıtı alınır; yalnızca bundan sonra yerel kayıt mutabıklaştırılır.

## Ne zaman uygulanır?

- Yanlış canlı ortam ayarı veya yanlış sağlayıcı yapılandırması tespit edildiğinde.
- Belge gönderiminden sonra yerel ve sağlayıcı durumu uyuşmadığında.
- Kontör hareketi beklenmeyen biçimde gerçekleştiğinde.
- Sağlayıcı iptal isteğini reddettiğinde ya da sonuç belirsiz kaldığında.

## Gönderilmiş belge varsa zorunlu sıra

1. Uygulamadaki fatura numarasını, ETTN/UUID'yi, gönderim zamanını, belge profilini ve başlangıç kontörünü kayda alın.
2. Sağlayıcı belge sorgusundan ETTN/UUID ile belgenin durumunu alın ve yanıtı saklayın.
3. İptal gerekiyorsa, yalnızca belgenin desteklediği sağlayıcı iptal akışını kullanın. İŞBEY, sağlayıcı kabulü olmadan yerel `CANCELLED` durumuna geçmemelidir.
4. İptal yanıtını, iptal zamanını ve son kontör değerini kanıt olarak saklayın.
5. Sağlayıcıdaki sonuç kesinleşmeden veritabanı snapshot'ı geri yüklenmez. Snapshot, canlı belgeyi "silmiş" gibi görünmesine yol açabilir; bu muhasebesel bir geri alma değildir.

e-Fatura/e-İrsaliye için e-Arşiv iptal uç noktası kullanılmaz. Sağlayıcı sözleşmesinde desteklenmeyen profil için yerel iptal kapalı kalır ve sağlayıcının resmi düzeltme/iptal prosedürü izlenir.

## Yerel rollback ön kontrolü

1. Yeni belge gönderimini durdurun ve uygulama servisini kapatın.
2. Kullanılacak `data/backups/backup_pre_hizli_live_*.json` dosyasının işlemden **önceki** doğru nokta olduğundan emin olun.
3. Önce kuru çalışmayı başlatın:

   ```powershell
   node tools/hizli-rollback-sandbox.mjs
   ```

   Araç backup'ın SHA-256 sidecar dosyasını, `.env` ve yerel DB varlığını kontrol eder; bu aşamada dosya değiştirmez.

4. Çıktı doğruysa, servis durdurulmuşken açık onaylarla çalıştırın:

   ```powershell
   node tools/hizli-rollback-sandbox.mjs --execute --service-stopped --backup backup_pre_hizli_live_2026-09-19T16-44-25-084Z.json
   ```

Araç, değişiklik öncesi `.env` ve `data/database.json` kopyasını `data/rollback-snapshots/` altında oluşturur; ardından test hostunu, `HIZLI_BILISIM_IS_TEST_MODE=true` değerini ve kapalı production kilidini yazar. Bu klasördeki kopyalar erişimi kısıtlı tutulmalı, sürüm kontrolüne eklenmemelidir.

## Rollback sonrası doğrulama

1. Uygulamayı başlatmadan önce canlıda oluşmuş her ETTN/UUID için sağlayıcıdaki son durum ve kontör bakiyesi kayda geçirilir.
2. Uygulamayı test modunda başlatın; canlı gönderim butonları ve production ayarları kapalı olmalıdır.
3. `npm run ci` ile derleme, tip ve statik güvenlik kontrollerini çalıştırın.
4. Test ortamında bir belge akışı deneyin. Bu test, canlı sağlayıcıdaki belge veya kontör için kanıt sayılmaz.
5. Canlıya tekrar açmadan önce, her dış belgeyi yerel kayıtla ve kontör hareketini başlangıç/son değerle mutabıklaştırın.

## Denetim kaydı

Her olay için aşağıdakiler saklanır: olay saati, uygulama kullanıcı kimliği, yerel fatura kimliği, ETTN/UUID, sağlayıcı istek/yanıt özeti, başlangıç-son kontörleri, iptal nedeni, kullanılan backup adı ve SHA-256 değeri. Kimlik bilgileri, bearer tokenlar ve gizli anahtarlar kayda eklenmez.

## Bilinen engel

2026-09-19 doğrulamasında canlı `GetGibUserList` isteği sağlayıcıdan hata döndürdü. Bu çözülmeden otomatik e-Fatura/e-Arşiv profil tespiti güvenli kabul edilmez. Canlı belge denemesi öncesinde Hızlı Bilişim'den ilgili canlı istek için çözüm veya yazılı teyit alınmalıdır.
