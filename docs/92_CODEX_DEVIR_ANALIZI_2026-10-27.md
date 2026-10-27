# İŞBEY / BEY360 — kaldığı yerden devam incelemesi

Tarih: 27 Ekim 2026, Europe/Istanbul.

## Gerçek yayın durumu

Yerel `origin/main` kaydı `9c74e69` üzerinde kalmıştı. GitHub API ve
kimliksiz fetch ile uzak main'in aslında `818bfa87e8dbe2882d7a1c540fe0645b63d6831f`
olduğu doğrulandı. Bu nedenle eski raporlardaki “yayın bekliyor” bilgisi
bugünün sonucu olarak kullanılamaz.

Uzak commit, 20 Ekim'deki P0 tenant/depo yayın birleştirmesidir. Commit mesajı
backfill'in canlıya uygulandığını ve 8/8 doğrulama geçtiğini bildiriyor.
Bu oturumda canlı veritabanına erişilmedi; migration sonucu yeniden ölçülmedi.

- [CI Pipeline](https://github.com/isbeycloud/isbey/actions/runs/39488336933): success.
- [Playwright Tests](https://github.com/isbeycloud/isbey/actions/runs/39488337028): success.
- `https://bey360.com/`: HTTP 200.
- `https://bey360.com/api/health`: HTTP 200, healthy, version 2.0.0.
- Canlı ana bundle: `assets/index-BE3Qsb1K.js`.
- Yerelde mevcut bağımlılıklarla üretilen aynı bundle ile canlı dosya SHA256'sı
  birebir eşleşti: `2c4c5b25edb6a3d91fe78e410abadf6d6a2e099f376e4a9e5cd4ef7ebfed291b`.

Bu kanıt arayüzün dağıtıldığını gösterir. Sağlık ucunda backend commit kimliği
bulunmadığı için sunucudaki bütün kaynakların SHA eşitliğini kanıtlamaz.

## Önceki çalışmalar

Git geçmişi ve kaynak farklarında şu çalışmalar mevcut:

- Firma/depo sahipliği ve çapraz firma erişim korumaları.
- Sipariş, teklif, irsaliye ve kasa kayıtlarında diske kalıcılık düzeltmeleri.
- Fiyat listeleri, varyantlar ve ürün görselleri.
- VKN ile kayıt, 14 günlük deneme ve hizmet seçimi akışı.
- Rapor filtreleri, detay raporları ve rapor oluşturucu.
- e-Belge sorgulama, özgün XML/XSLT görüntüleme ve alıcı sorgusu.
- Depo/tenant verisi hazırlama, cari defter denetimi ve kontrollü mali düzeltme araçları.

Çalışma ağacı başlangıçta temizdi. Aktif dal `release/p0-tenant-depo`, HEAD
`75303f9`. Uzak main ile ortak atadan sonra yerelde altı ek commit bulunuyor:

| Commit | Yayına girmemiş çalışma |
|---|---|
| 9700e89 | Bedelsiz satışta yönetici yetkisi, mali düzeltme kusurları, rotasyon aracı |
| 6888cfb | Yetki kapısının HTTP 403/400/200-201 sözleşme testleri |
| 5056c26 | Erişim dosyası yolu ve rotasyonda yanlış başarı sonucunun önlenmesi |
| 2234d50 | Rotasyon önkoşullarının belgelendirilmesi |
| 22fd018 | Gizli girişte soru metninin görünmesi |
| 75303f9 | Panodan token alma desteği |

Uzak main'deki `818bfa8` merge commit'i yerel dalda bulunmuyor. Yayın öncesi
güncel main geçmişi birleştirilmeli; eski main referansına zorla push yapılmamalı.

## Bu oturumda giderilen eksikler

1. Workflow'lar yalnız main/master push'unda çalışıyordu. Runbook'un yayın dalı
   push'uyla CI doğrulama adımı bu nedenle işlemiyordu. İki workflow'a
   `release/**`, `codex/**` ve elle başlatma eklendi. Bu değişiklik dağıtım yapmaz.
2. CI'a cari ve mali düzeltme sözleşmeleri eklendi.
3. Windows'ta `python3` Store takma adı ve cp1254 kodlaması testleri bozuyordu.
   Gerçek Python yorumlayıcısını seçen, alt süreçlerde de UTF-8 kullanan ortak
   çalıştırıcı eklendi. Finansal hesaplama mantığı değiştirilmedi.
4. Bağımlılık taramasında 3 yüksek ve 1 kritik açık görüldü. Sürüm kilidi
   güncellendi: body-parser 2.4.0, DOMPurify 3.4.17, multer 2.5.0, Vite 8.3.5
   ve bunların gerekli alt bağımlılıkları. Ana sürüm yükseltmesi yapılmadı.
5. Yerel yayın kapısına bağımlılık güvenlik taraması eklendi.

## İşletme kararı ve erişim gerektiren işler

- Kullanıcının gösterdiği erişim dosyasında eski ve yeni kimlikler birlikteydi.
  Parmak iziyle yeni anahtar ayrıldı; GitHub kullanıcı doğrulaması ve depo yazma
  yetkisi başarılı. İki eski GitHub anahtarı salt okunur doğrulamada HTTP 401
  verdi; iptal edildikleri ölçüldü. Yeni SSH parolasıyla bağlantı başarılı.
  Dosya biçimi kontrolünde parola içeren bir satır araç çıktısına karıştı;
  kullanıcıya bildirildi ve ayrıştırma düzeltildi. Kimlikler rapora eklenmedi.
- `SAT-2026-000001` için cari bağlantısı / 120 TL defter düzeltmesi önceki
  raporlarda açık. Bugünkü canlı durum ölçülmeden eski kopyaya göre uygulanmamalı.
- Ürün satış fiyatları önceki ölçümde sıfırdı; güncel fiyatlar işletmeden
  alınmalı. Alış fiyatından tahmini satış fiyatı üretilmemeli.
- İrsaliye hizmetinin aktivasyonu ve gerçek bayi portalı oturumu önceki
  raporlarda açık. Yeni sağlayıcı kanıtı olmadan tamamlandı sayılmaz.

Canlı mali kayıt değiştirilmedi, gerçek e-Fatura gönderilmedi.

## Güncel doğrulama

Güncellenmiş bağımlılıklarla `npm run release:check`: **8/8 adım PASS**.
Typecheck, lint, build, güvenlik taraması, 55/55 yerel paket, 18/18 cari
sözleşmesi, 28/28 mali düzeltme sözleşmesi ve 50/50 Chromium testi başarılı.
Lint'te mevcut uyarılar, build'de paket boyutu uyarıları var; hata yok.

Sunucunun etkin kaynak dizini ve son kaynak dizini `818bfa8` commit'ini
gösteriyor. Canlı DB'nin geçerli JSON kopyası alındı; uzak yedeğin SHA256'sı
yerel kopyayla eşleşti. Yedek 2.493.577 bayt;
SHA256 `1463f0c0883a7f1c1f042658e9b9725f7f204e70ff55482c3fc73dc1d5bd53e0`.

Canlı kopyada 5 firma / 5 depo / 13 ürün / 9 fatura mevcut. Depo varlığı,
sarkan referans, çapraz firma bağlantısı, sahipsiz kayıt, firma başına depo ve
isim tutarlılığı kontrollerinin altısı geçti. `backfill-verify` eski bir
migration öncesi kopya verilmediği için finansal değişmezlik kontrolünü
kanıtlanamadı sayıp çıkış 3 verdi; bunu 7/7 başarı olarak raporlamıyoruz.
Bu oturumda migration yapılmadı; güncel kod değişiklikleri migration gerektirmiyor.

Loglar `.verify-tmp/codex-20261027-*` altında, Git dışında tutulur.
