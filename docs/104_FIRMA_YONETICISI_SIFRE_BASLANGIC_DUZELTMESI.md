# Firma yöneticisi şifrelerinin güvenli oluşturulması

Hızlı Bilişim'den firmaya dönüştürme sırasında aktivasyon bekleyen yöneticiye boş `passwordHash` atanıyordu. Canlı başlangıç denetimi tüm kullanıcılar için güvenli şifre özeti istediğinden, bu kayıt uygulamanın sonraki açılışını engelliyordu. Aktivasyon bekleyen hesap artık bağımsız, rastgele ve saklanmayan bir değerin bcrypt özetiyle oluşturulur. Kullanıcı kendi şifresini mevcut aktivasyon akışında belirler; aktivasyon anahtarı giriş şifresi olarak kullanılmaz.

Doğrudan firma oluşturma yolundaki düz metin ve varsayılan `123` şifresi de kaldırıldı. Yönetici oluşturulacaksa açıkça en az 12 karakter, en fazla 72 UTF-8 baytlık şifre istenir ve bcrypt ile saklanır. Yönetici oluşturulmayacaksa şifre gerekmez. Firma sihirbazı boş, maskeli şifre alanıyla başlar ve aynı sınırları doğrular.

Başlangıç güvenlik denetimi gevşetilmez. Mali hesaplamalar, aktivasyon anahtarları ve veri şeması değiştirilmez. Gerçek giriş yolu, hatalı istekte kayıt oluşmaması, bcrypt doğrulaması ve aktivasyon bekleyen hesabın başlangıç denetiminden geçmesi izole testlerle doğrulanır.

Yayın kontrolünde profil yenileme yanıtının çıkıştan sonra ekrana eski kullanıcıyı geri getirebildiği de doğrulandı. Profil yanıtı yalnız isteğin başladığı oturum anahtarı hâlâ geçerliyse uygulanır. Çıkıştan sonra dönen başarılı eski yanıtın oturumu geri getirmediği geciktirilmiş yanıtla tarayıcı testinde kontrol edilir.
