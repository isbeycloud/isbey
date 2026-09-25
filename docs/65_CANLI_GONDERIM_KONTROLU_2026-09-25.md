# Canlı gönderim hazırlığı — 25 Eylül 2026

Beyoğlu Teknoloji için BTF seçimi kayıtlıdır. Hostinger üzerinde, uygulamanın
kalıcı firma kimliğiyle yapılan salt okunur kontrol 08:43 UTC'de başarılı oldu:
PK/GB etiketleri eşleşti; son numara BTF2026000000141, sıradaki numara
BTF2026000000142 olarak döndü. Numara rezerve edilmedi. Uygulama ortamı TEST,
canlı gönderim kilidi kapalı ve entegrasyon işleri devre dışı kaldı.

Gönderim incelemesinde ERP nesnesinin doğrudan sağlayıcıya iletildiği ve HTTP
200 yanıtının belge reddini gizleyebildiği görüldü. Gönderim artık kayıtlı
sağlayıcı modelini, firmanın seçili serisini ve firma bazlı token'ı kullanır.
Gönderici/alıcı kimliği eşleşmeden veya kayıtlı model olmadan çağrı yapılmaz.
JSON ve XML gönderim cevaplarında her belgenin IsSucceeded değeri doğrulanır.
HTTP kabulü, GİB teslimi olarak sunulmaz.

Tekil ve toplu model gönderimlerinde SENDING durumu ağ çağrısından önce
kalıcılaştırılır. Eşzamanlı, tamamlanmış veya belirsiz gönderim tekrarları
engellenir. Yanıt alınamaması veya kısmi/bozuk yanıt halinde kayıt SENDING
kalır; sağlayıcı mutabakatı yapılmadan otomatik yeniden gönderilmez.

Doğrulama: sahte HTTP taşıyıcısıyla sözleşme testleri (gerçek belge göndermez),
firma izolasyonu, eşzamanlı gönderim ve belirsiz yanıt sonrası tekrar engeli.
Yerel 17 test paketi geçti. Bu, gerçek belge kabul testi yerine geçmez.

Kalan canlı kabul: gerçek taslağın alıcı, satır, KDV, profil, posta kutusu ve
numaralandırma bilgilerinin kontrolü; belgenin sağlayıcıda kabulü ve son durum
mutabakatı. Kullanıcıdan taslak numarası veya fatura bilgileri istendi.
Bu çalışma sırasında hiçbir belge gönderilmedi ve canlı gönderim açılmadı.
