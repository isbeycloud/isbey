# Pakete göre sade menü

30 Ekim 2026: Etkin paket kapsamına göre iş menülerini gösterme ve mükerrer girişleri azaltma.

- Menü görünürlüğü mevcut sunucu yanıtındaki `serviceMenuIds`, üyelik/rol yetkileri, menü izinleri ve müşavir kapsamının kesişimini kullanır. Bu değişiklik paket satın alma, ödeme, üyelik süresi veya sunucu erişim kurallarını değiştirmez.
- `packageSidebar` yalnız yetkili hizmetleri toplar. Paket kapsamında olup eski rol menülerinde eksik kalan POS, personel, gider ve teklif gibi girişler eklenir; paket dışındaki hizmetler eklenmez. Boş gruplar ve tekrar eden girişler kaldırılır.
- Alış/satış, e-belge ve irsaliye girişleri, ilgili yetkili sekmeler mevcutsa Faturalar altında toplanır. Yalnız e-belge paketi olan kullanıcıya bağımsız e-belge girişi gösterilir. Kasa yanında ikinci Finans girişine yer verilmez.
- Faturalar çalışma alanı sekmeleri ve içerikleri paket/rol denetiminden geçer. Yetkisi kaldırılan sekmenin içeriği bağlanmaz; ilk yetkili sekme gösterilir.
- Üst şeritteki ikinci modül menüsü ve sağ alttaki ikinci hızlı işlem düğmesi kaldırılır. Açık modüle ait araçlar ve üst başlıktaki Hızlı İşlem menüsü korunur. İşlem olmayan paketlerde boş Hızlı İşlem menüsü gösterilmez.
- Alt çubuktaki tekrar firma/kullanıcı bilgileri kaldırılır; bağlantı kesilmesi bildirimi korunur.
- Ayarlar içindeki entegrasyon, tasarım, numaratör ve fiyat listesi sekmeleri ilgili hizmet kapsamına göre gösterilir ve bağlanır.
- Paket ekranındaki işaretli seçim firma ve sunucudaki paket kimlikleri değiştiğinde eşitlenir. Etkin paketler ayrıca belirtilir. Etkinleştirme sonrası mevcut profil yenileme akışı menüleri günceller; açık ekranın erişimi kaldırılmışsa yetkili başlangıç ekranına dönülür.

Doğrulama: `packageNavigationTest.ts` tek modül ve birleşik paketler, üyelik kısıtlamaları, rol denetimi, bağımsız e-belge girişi ve tekrarları sınar. `21-package-navigation.spec.ts` beş paket türünü, ayarlardaki kapsamı, mobil görünümü, paket değiştirmeyi ve yenileme kalıcılığını sınar. Mevcut ilk paket açılışı ve belge görüntüleme testleri de çalıştırılır. Testler izole veritabanında yürür; gerçek ödeme veya belge gönderimi yapılmaz.
