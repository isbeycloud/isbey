# Yeni üye paket açılışı

30 Ekim 2026 kullanıcı isteği: Yeni üye ilk açılışta paket seçer, kayıtla başlayan 14 günlük deneme boyunca paket/deneme uyarıları gösterilmez.

Her iki self-servis kayıt yolu seçili paketleri boş bırakır. Sunucu login/me/kayıt yanıtında `trial.packageSelectionRequired` üretir: gerçek deneme, geçerli ve henüz dolmamış bitiş, açıkça boş paket listesi. Eski kayıtlardaki eksik alan ve önceden seçilmiş paketler yeniden seçim zorlamaz; platform yöneticileri muaftır. Yeni veri alanı veya mali şema değişikliği yoktur.

İlk seçim ekranı mevcut yetkili `POST /api/e-services/select-plans` yolunu kullanır. Seçim sonrası profil yenilenir; kullanıcının yetkili ilk çalışma ekranı açılır. Seçim tekrar girişte ve yenilemede korunur. Seçim ödeme, satın alma talebi veya e-Dönüşüm kararı oluşturmaz; ilk deneme bitişi korunur.

Aktif denemede kalan gün/karar paneli yüklenmez. Süre dolduğunda mevcut e-Dönüşüm karar kapısı ve abonelik kısıtları çalışmaya devam eder. İşlem/kayıt hataları gizlenmez. Hizmetler ekranı menüden isteğe bağlı açılabilir.

Doğrulama: `memberPackageOpeningTest.ts` iki kayıt yolu, login/me, seçim kalıcılığı, tarih/ödeme korunması, firma ayrımı, eski/ücretli/platform hesapları ve tam bitiş sınırını sınar. `20-member-package-opening.spec.ts` ilk ekran, başarısız kaydı tekrar deneme, seçimin ardından yetkili iş ekranı, yenileme ve deneme içinde/süre sonunda uyarı görünürlüğünü sınar. Tüm yazmalar izole test veritabanında; sağlayıcı ve SMTP çağrıları yapılmaz.
