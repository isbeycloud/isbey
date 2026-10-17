# Claude Code devir raporu — İŞBEY / BEY360

**Dönem:** 3 Ekim 2026 Cumartesi–5 Ekim 2026 Pazartesi, Europe/Istanbul (UTC+03:00).

**Depo:** `D:\İŞBEY` — `https://github.com/isbeycloud/isbey`.

**Canlı uygulama:** `https://bey360.com`.

**Rapor hazırlanırken uygulama HEAD / origin/main:** `3a3175eb7e8093c707e403e7fcb7c2b1fbdb7d9e`.

## 1. Kapsam ve kaynak güvenilirliği

Bu rapor Git geçmişi, bu sohbetin uygulama ve canlı doğrulama kayıtları, ilgili İŞBEY sohbetleri, test çıktıları ve mevcut kaynak dosyalarından hazırlanmıştır. Tarih aralığında mevcut main zincirinde **18 commit** bulunmaktadır.

Git yazarlığı `Claude`, `isbeycloud` ve `İŞBEY` olarak kayıtlıdır. Özellikle paket yetkileri ve bayi portföyü çalışmasının bir bölümü başka oturumdan devralınmış, incelenmiş, test edilmiş ve daha sonra yayınlanmıştır. Dolayısıyla aşağıdaki döküm ekip/depo çalışmalarının birleşik devir kaydıdır; bütün değişikliklerin tek ajan tarafından ilk kez yazıldığı iddia edilmez.

Başka projelere ait e-ticaret tasarım talepleri bu depoda yapılmış iş olarak sayılmamıştır. İncelenen “Modernize Beyoğlu Teknoloji mağazası” sohbetinde desteklenmeyen model nedeniyle başarısız başlangıç vardı; tamamlanmış tasarım veya yayın kanıtı bulunmadığından bu raporun tamamlanan işler listesine alınmadı.

Rapor; parola, API anahtarı, oturum token'ı, doğrulama kodu, müşteri TCKN/VKN'si veya özel XML/XSLT içeriği içermez.

## 2. Günlük commit dökümü

Saatler commit kaydından alınmıştır ve İstanbul saatidir. Commit saati bütün çalışmanın başlangıç zamanı değildir.

### 3 Ekim Cumartesi — 5 commit

| Saat | Commit | Tamamlanan değişiklik |
|---|---|---|
| 10:13 | `b61db00` | Boş filtrelerin `search=undefined` olarak gönderilmesi ve listeleri boşaltması düzeltildi. |
| 11:38 | `091698e` | Gelen dövizli fatura için kur kontrolü, ayrı döviz kasası ve içeri alma bilgileri eklendi. |
| 18:23 | `d6149b3` | Eksik cari risk limitinin cari ekranını çökertmesi önlendi. |
| 18:36 | `3f25c33` | Cari tarayıcı testi giriş hız sınırı testinden önce çalışacak şekilde sıralandı. |
| 19:05 | `e129cd6` | Entegratörün TCMB yanıtındaki gerçek `Kuru` alanı okunarak dövizli belge içeri alma hatası düzeltildi. |

### 4 Ekim Pazar — 3 commit

| Saat | Commit | Tamamlanan değişiklik |
|---|---|---|
| 18:41 | `fe8c62e` | Firma kimliğinde `randomUUID()`, aktivasyon token'ında `randomBytes(32)` kullanıldı; boş telefon korundu. |
| 18:41 | `e4a6ab6` | Paket seçiminin hizmet kapsamını belirlemesi ve bayi portföyünden üyelik aktarımı tamamlandı. |
| 23:12 | `5f6ce2c` | `/api/customers` aramasında null telefonun neden olduğu 500 hatası giderildi. |

### 5 Ekim Pazartesi — 10 commit

| Saat | Commit | Tamamlanan değişiklik |
|---|---|---|
| 09:13 | `d5f9252` | Gelen/giden fatura ve irsaliye için oturumlu XML/XSLT görüntüleme akışı kuruldu. |
| 12:05 | `c6fd6be` | Cari uçlarında doğrulanmış tenant ve kayıt sahipliği zorunlu hale getirildi. |
| 12:07 | `1e9f05d` | BOM içeren XML/XSLT ve cari kart bağlantısı olmayan belge görüntülemesi düzeltildi. |
| 15:43 | `014ade4` | Kayıtlı fatura tarafları, kişiler, adresler ve vergi bilgileri önizlemeye taşındı. |
| 15:57 | `05a5508` | Gönderilmiş faturanın özgün UBL içeriği ve güvenli karekod görüntülemesi eklendi. |
| 18:55 | `ffa57ea` | Doğrulanmış özgün XML'in değişmez arşivinden gerçek fatura görüntüsü üretildi. |
| 21:13 | `7baea00` | Taslak faturaya kırmızı TASLAKTIR damgası eklendi; konumu sonraki commit'te düzeltildi. |
| 21:19 | `f4a1a9c` | Kullanıcının düzeltmesiyle damga yalnız **gönderen cari alanına** taşındı. |
| 22:41 | `121deeb` | Giden e-Fatura indirmesindeki yanlış entegratör tür kodu ve belge indirme token hatası düzeltildi. |
| 23:10 | `3a3175e` | Taslak oluşturma ve gönderim öncesi zorunlu alıcı mükellefiyet sorgusu uygulandı. |

## 3. İşlerin ayrıntısı ve son davranış

### 3.1. Boş liste ve cari ekranı sorunları

- `src/services/api.ts` içindeki sorgu oluşturma, `undefined`, `null` ve boş metni URL'ye koymayacak şekilde düzeltildi. `0` ve `false` korunuyor. Hatalı kalıp 30 sorgu çağrısında temizlendi.
- Hızlı Bilişim müşteri listesinde KPI doluyken listenin boş görünmesi giderildi. Sunucu da `"undefined"` / `"null"` metinlerini gerçek arama terimi saymıyor.
- Cari risk limitinin eksik olması ekranı çökertmiyor.
- Null telefon bulunan cariler arama sırasında 500 üretmiyor.
- Cari listeleme, güncelleme ve ekstre erişiminde firma/kayıt sahipliği kontrolleri güçlendirildi. Bu çalışma bütün depodaki tüm eski tenant fallback'lerinin temizlendiği anlamına gelmez; ilgili cari uçları kapsamındadır.

**Başlıca dosyalar:** `src/services/api.ts`, `src/components/modules/cari/CustomerListView.tsx`, `server/routes/customers.ts`, `server/middleware/authGuards.ts`.

### 3.2. Gelen dövizli faturalar

- Gelen USD/EUR/GBP belgelerinin içeri alma aşamasında kur ve kullanılacak döviz kasası gösteriliyor.
- Belge tutarları mevcut muhasebe motoruna TL karşılığı ile aktarılıyor; özgün para birimi/tutar ve kullanılan kur bilgisi korunuyor.
- Aynı para biriminin kasası tekrar tekrar açılmıyor; varsayılan TRY kasası korunuyor.
- Kur alınamadığında arayüz ve sunucu içeri almayı durduruyor; kur tahmin edilmiyor.
- Entegratörün ölçülen yanıtındaki **`Kuru`** alanı ve **`IsSucceeded`** iş başarı bayrağı birlikte değerlendiriliyor.
- Muhasebe hesap motoru yeniden yazılmadı; mevcut belge dönüştürme akışı kullanıldı.

**Başlıca dosyalar:** `server/services/currencyCashRegister.ts`, `server/services/incomingInvoiceService.ts`, `server/services/ubl/incomingDocumentMapper.ts`, `server/services/hizliConnectService.ts`, `src/components/modules/edonusum/IncomingMatchModal.tsx`.

### 3.3. Paket yetkileri ve bayi portföyü

- Yeni firma kayıtları iş hizmetleri açık şekilde başlamıyor. Firma yöneticisinin seçtiği paketlerin modül birleşimi hizmet kapsamını belirliyor.
- Kapsam yalnız menüde değil, sunucu isteklerinde de uygulanıyor. Menü, ribbon, hızlı işlemler ve kısayollar ortak kapsamı kullanıyor.
- Paket seçimi `/api/e-services/select-plans` üzerinden doğrulanıyor; genel tenant güncellemesiyle paket kapsamı değiştirilemiyor.
- Mevcut hesapların eski erişimleri paket seçimine kadar korunuyor. Paket seçimi mevcut abonelik süresini koruyor; bu akış ödeme almıyor.
- Bayi portalının gerçek yönetim paneli liste servisine göre portföy okuma ve en fazla 25 kayıt aktarımı hazırlandı. Her aktarılan VKN/TCKN sağlayıcıdan yeniden doğrulanıyor.
- Portal cookie/CSRF ve giriş bilgileri sunucu belleğinde kalıyor. Portföy okuması tek başına firma oluşturmuyor.
- Aktivasyon bağlantıları kriptografik güvenli token kullanıyor; telefon null olduğunda dönüşüm çökmez.

**Önemli sınır:** Bayi portalı doğrulama formunun e-posta/SMS kanalı alanı ve üç dakikalık kod süresi incelendi/düzeltildi. Yerel test başarılı olsa da sohbet kayıtlarında **gerçek bayi portalı girişinin ve portföy okumasının tamamlandığı kanıtlanmadı**. Sağlayıcı kodu hatalı/süresi dolmuş olarak reddetti ve yeni oturum kodu beklendi. Bu durumu “canlı bayi portföyü doğrulandı” diye raporlamayın.

**Mevcut ayrıntılı belge:** [78_PAKET_YETKILERI_BAYI_PORTFOYU.md](78_PAKET_YETKILERI_BAYI_PORTFOYU.md).

### 3.4. Fatura ve irsaliye XML/XSLT görüntüleme

- Kimlik doğrulanmış API isteğiyle XML ve XSLT alınıp tarayıcıda gerçek XSLT dönüşümü yapılıyor. Doğrudan oturumsuz iframe isteği kaynaklı boş/bozuk görünüm giderildi.
- Gelen belgenin kendi gömülü XSLT'si tercih ediliyor. Giden belgede gömülü şablon yoksa firmanın şablonu, gerektiğinde standart şablon kullanılıyor.
- XML/XSLT başındaki BOM temizleniyor. Cari kart bağlantısı yoksa faturada kayıtlı alıcı bilgileri kullanılıyor.
- Faturada kayıtlı gönderen/alıcı, şahıs, adres, iletişim ve vergi bilgileri önizlemeye taşındı.
- XSLT içindeki betikler çalıştırılmıyor. Dönüşüm çıktısı temizleniyor; karekod güvenli biçimde `qrcode-generator` ile üretiliyor.
- XML indirme ve yazdırma mevcut görüntüleme ekranında çalışıyor. Özgün belge numarası varsa ekran başlığı ve XML dosya adı onu kullanıyor.

**Başlıca dosyalar:** `server/services/documentVisualService.ts`, `server/services/ubl/standardDocumentXslt.ts`, `src/utils/documentVisual.ts`, `src/utils/xsltTransform.ts`, `src/components/modules/edonusum/OfficialEInvoiceViewerModal.tsx`, `src/components/modules/irsaliye/WaybillViewerModal.tsx`.

### 3.5. Özgün fatura arşivi ve entegratörden indirme

- Kullanıcının verdiği **BTF2026000000144** PDF/XML/XSLT referansları kullanıldı. Özel referans dosyaları kaynak koda veya Git'e eklenmedi.
- Özgün XML yüklemede belge türü, ETTN, satıcı, tarih, para birimi ve ödenecek toplam doğrulanıyor. İlgisiz belge başka faturaya arşivlenemiyor.
- Tenant/ETTN bazlı özgün XML arşivi değişmez; başka içerikle üstüne yazılamıyor.
- Normal görüntüleme arşivi öncelikli kullanıyor. `?source=provider` açık salt okunur entegratör indirmesini seçiyor.
- Gerçek ölçümde giden e-Fatura için `GetDocumentFile` **AppType=1** “belge bulunamadı” veriyordu; **AppType=2** ile özgün belge indirildi. Gerçek gelen fatura için **1** çalıştı, **2** çalışmadı.
- İndirilen BTF XML'i kullanıcının özgün dosyasıyla hash üzerinden birebir eşleşti.
- e-Arşiv için 3, giden irsaliye için 4 indirme eşlemesi kodda kullanılıyor. Bu iki türe ait gerçek belgeyle canlı indirme bu çalışmada doğrulanmadı; e-Fatura için ölçülen sonucu diğer uçlara genellemeyin.
- HTTP 401 ve iş yanıtındaki geçersiz token artık hata olarak sınıflanıyor; sonraki istekte ilgili tenant token'ının yenilenmesini destekliyor. Belge gönderiminde sessiz otomatik retry eklenmedi.

**Başlıca uçlar:**

```text
GET  /api/v1/e-documents/erp-invoices/:id/visual
GET  /api/v1/e-documents/erp-invoices/:id/visual?source=provider
POST /api/v1/e-documents/erp-invoices/:id/original-xml
GET  /api/v1/e-documents/erp-waybills/:id/visual
GET  /api/v1/e-documents/incoming-despatches/:id/visual
```

### 3.6. Taslak damgası

Son karar: kırmızı **TASLAKTIR** yalnız **gönderen/satıcı cari bilgilerinin üzerinde** gösteriliyor. Alıcı cari alanına veya belgenin bütününe uygulanmıyor.

İlk konum alıcı alanıydı; kullanıcı “gönderen cari” diye düzeltti ve `f4a1a9c` ile son davranış değişti. Önceki konuma geri dönmeyin.

Taslak satış faturasında gösteriliyor; gönderilmiş veya kuyruktaki belgede gösterilmiyor. Özgün XML dosyası damga için değiştirilmez; damga görsel katmanda uygulanır.

### 3.7. Taslak ve gönderim öncesi alıcı mükellefiyeti

Kullanıcı isteği: fatura oluşturulmadan ve gönderilmeden önce karşı tarafın e-Fatura kaydını sorgulayıp taslak ve gönderilecek gerçek belgeyi buna göre hazırlamak.

- Yeni ortak servis: `server/services/invoiceRecipientService.ts`.
- VKN/TCKN uzunluğundan mükellefiyet tahmini kaldırıldı. Başarısız sorgu “kayıtlı değil” veya e-Arşiv olarak kabul edilmiyor.
- Taslak kaydı öncesinde ve gönderimde güncel sorgu yapılıyor; bu noktalarda 24 saatlik önbellek sorguyu atlatmıyor.
- Kayıtlı e-Fatura alıcısında uygun e-Fatura senaryosu korunuyor; e-Arşiv seçilmişse e-Fatura senaryosuna düzeltiliyor. Kayıtlı olmayan alıcı e-Arşiv olarak hazırlanıyor.
- Kayıtlı alıcının tekil PK posta kutusu doğrulanmazsa işlem duruyor. Önceki alıcının alias'ı e-Arşiv belgesine taşınmıyor.
- Sorgu hatası provider katmanında artık sessiz `isEInvoiceUser:false` sonucuna dönüşmüyor.
- Sorgu, kontör rezervasyonundan önce yapılıyor. Kuyrukta bekleyen fatura da gönderim denemesinde yeniden kontrol ediliyor; profil değişmişse önceki XML yeniden hazırlanıyor.
- Gönderimde kullanılan doğrulanmış profil, kayıtlı fatura/modelle uyumlu hale getiriliyor.
- İki fatura oluşturma ekranında alıcı sorgu durumu ve hata görünür. Tekrar sorgulama var; eski alıcının geç dönen sonucu yeni alıcıyı değiştirmiyor.
- Hızlı model taslak kaydı firma ve `INVOICES_CREATE` yetkisiyle korunuyor. V1 oluşturmada istemcinin `tenantId` alanı oturumdaki firmayı ezemiyor.
- Canlı örnek faturanın alıcısı gerçekten e-Fatura kayıtlı ve PK hazır olarak doğrulandı. Test sırasında gerçek fatura gönderilmedi.

**Kapsanan yollar:** Hızlı model taslağı, klasik `/api/invoices` satış kaydı, V1 satış kaydı, Hızlı doğrudan gönderim ve e-belge kuyruğu. Alış faturası girişine satış alıcısı sorgusu zorlanmadı.

**Başlıca dosyalar:** `server/routes/efatura.ts`, `server/routes/invoices.ts`, `server/routes/v1/invoices.ts`, `server/services/electronicDocumentService.ts`, `server/services/electronicDocumentQueue.ts`, `server/services/hizliConnectService.ts`, `server/services/hizliInvoiceDispatch.ts`, `src/components/modules/edonusum/HizliInvoiceCreateModal.tsx`, `src/components/modules/satis/NewInvoiceModal.tsx`.

## 4. Doğrulama ve yayın durumu

| Kontrol | Sonuç / sınır |
|---|---|
| Son yerel regresyon çalıştırması | **37 test paketi PASS / 0 FAIL**. |
| Son tam Playwright çalıştırması | **50 test PASS**, Chromium, yaklaşık 2,4 dakika. |
| Frontend TypeScript ve Vite build | Başarılı. Büyük bundle uyarısı mevcut; build hatası değil. |
| Değişen dosyalarda lint | Hata yok; bazı mevcut uyarılar var. Bütün deponun uyarısız olduğu iddia edilmez. |
| Güvenlik taraması | Alıcı sorgusu değişikliğinden önce alınan son `npm audit --audit-level=high` sonucu 0 açık; alıcı sorgusu commit'inde bağımlılık değişmedi. |
| Ek, tüm backend'e yayılan strict TypeScript denemesi | Önceden mevcut iki tip uyuşmazlığı görüldü: efatura rota alanında null/undefined ve irsaliye kalemi quantity. Geniş backend denetimi tamamen temiz diye raporlanmaz. Son sorgu servisi/gönderim dosyalarının odaklı kontrolü ve normal proje typecheck geçti. |
| Git | Uygulama commit'i `3a3175e` main'e push edildi; HEAD ve origin/main eşit. Rapor dosyası oluşturulmadan önce ağaç temizdi. |
| Canlı sağlık | `/api/health` HTTP 200, healthy. |
| Canlı arayüz | Son uygulama bundle'ı `/assets/index-BKDwRyMZ.js`, HTTP 200; yerel son build ile eşleşti. |
| Canlı alıcı sorgusu | Oturumlu `force=true` sorguları başarılı, kayıt/PK doğrulandı; fatura sayısı ve liste toplamları değişmedi. |
| Canlı özgün XML | BTF2026000000144 entegratörden indirildi, özgün kullanıcı dosyasıyla birebir eşleşti. |

### GitHub CI için güncel düzeltme

Önceki sohbet mesajlarında son iki iş “sırada” olarak bildirilmişti. Rapor hazırlanırken tekrar kontrol edildi:

- [CI Pipeline](https://github.com/isbeycloud/isbey/actions/runs/37368069930): workflow sonucu `failure`, job sonucu `cancelled`.
- [Playwright Tests](https://github.com/isbeycloud/isbey/actions/runs/37368069667): workflow sonucu `failure`, job sonucu `cancelled`.
- GitHub açıklaması: **“The job was not acquired by Runner of type hosted even after multiple attempts”**.

Bu iki uzaktaki iş test adımlarını çalıştıramadı. **GitHub CI yeşil değildir.** Yerelde geçen 37 paket / 50 tarayıcı testiyle bu sonuç karıştırılmamalıdır. Canlı yayın ve sağlık doğrulaması ayrıca yapılmıştır. Runner sorunu giderilince mevcut commit için işleri yeniden çalıştırıp sonuçlarını doğrulayın.

Yerel kanıt dosyaları `.verify-tmp/recipient-release-tests.log`, `.verify-tmp/recipient-full-browser.log` ve ilgili doğrulama loglarıdır. Bunlar Git dışındadır; başka makinede yeniden test etmek gerekebilir.

## 5. Açık kalan işler ve uygulanacak sınırlar

1. **İrsaliye hizmeti aktif değil.** Kullanıcı bunu açıkça bildirdi. Hizmeti kendiliğinden açmayın veya boş listeyi arıza saymayın. Hizmet etkinleştikten ve gerçek belge geldikten sonra gelen/giden XML indirme ve XSLT görüntüsünü doğrulayın.
2. Son 90 günlük salt okunur entegratör kontrolünde 279 gelen fatura vardı; irsaliye sorguları boş döndü. Bu, pasif irsaliye hizmetinin çalıştığını kanıtlamaz.
3. e-Arşiv ve giden irsaliye indirmesinin gerçek belgeyle uç bazlı AppType doğrulaması tamamlanmadı. `GetDocumentFile`, `GetDocumentListGUID`, `SendInvoiceModel` ve gelen liste uçlarının numaralandırmasını aynı kabul etmeyin.
4. Bayi portalında gerçek OTP oturumu ve portföy okuması tamamlanmış sayılmıyor. Geçerli sağlayıcı oturumunda kullanıcıyla doğrulanması gerekiyor. Yeni kodlar oluşturarak eski kodla tekrar tekrar denemeyin.
5. GitHub hosted runner işleri çalıştıramadı. Önce bu altyapı durumunu çözün; “test hatası” diye uygulamayı rastgele değiştirmeyin.
6. Gerçek e-Fatura gönderimi/kontör tüketimi bir test adımı olarak yapılmadı. Test için gerçek fatura göndermeyin. Yeniden gönderimde mevcut SENDING/idempotency korumalarını kaldırmayın.
7. Özgün XML arşivini, kullanıcı şablonlarını veya gönderilmiş belge kimliğini tahmini bilgilerle ezmeyin. Taslak damgasını yalnız görsel katmanda tutun.
8. `.env`, `.verify-tmp`, portal oturumları ve kullanıcı XML/PDF/XSLT dosyalarını Git'e eklemeyin. Rapor için kullanılan geçici canlı oturum token dosyaları önceki çalışmalar sonunda kaldırıldı.
9. Muhasebe hesapları, stok/KDV kuralları ve mevcut veritabanı şemasını yeni iş gerekçesi olmadan değiştirmeyin. Son alıcı sorgusu değişikliği mevcut fatura metadata alanlarını kullanır.

## 6. Claude Code için başlangıç adımları

Bu bölüm bir devir önerisidir; yeni yayın veya gerçek belge gönderim yetkisi değildir.

```powershell
Set-Location -LiteralPath 'D:\İŞBEY'
git status --short
git log -n 20 --oneline
git rev-parse HEAD origin/main
```

Önce `CLAUDE.md` ve bu raporu okuyun. Mevcut çalışma ağacını incelemeden `reset`, `clean`, `stash`, force-push veya yeni clone kullanmayın. Bu rapor dosyası henüz commit edilmemiş olabilir; kod değişikliği sanıp silmeyin.

İhtiyaç olduğunda mevcut normal kontroller:

```powershell
npm run typecheck
npm run build
npm run lint
npm test
npm run test:e2e
```

Regresyon açısından özellikle `invoiceRecipientContractTest.ts`, `hizliRegistryContractTest.ts`, `hizliInvoiceNumberContractTest.ts`, `hizliSendContractTest.ts`, `documentVisualTest.ts`, `tests/03-document-visual.spec.ts` ve `tests/04-invoice-recipient.spec.ts` önemlidir.

Windows ortamında bazı native test/lint bağımlılıkları önceki oturumda yerel yardımcı runtime ile çalıştırıldı. Runtime sorunu varsa uygulama kaynak kodunu değiştirmeden bağımlılık/çalıştırıcı yolunu inceleyin. Test veritabanlarını izole tutun; canlı JSON verisi üzerinde yerel test çalıştırmayın.

**Devir anındaki sonuç:** Son uygulama sürümü canlıda; özgün fatura görseli/indirmesi ve güncel alıcı sorgusu doğrulanmış; 37 yerel paket ve 50 tarayıcı testi geçmiş. İrsaliye hizmeti pasif, gerçek bayi portalı doğrulaması ve GitHub hosted runner kontrolleri açık kalmıştır.

## 7. Claude Code'a işbirliği mesajı

Claude Code, ben Codex. Kullanıcının isteğiyle İŞBEY / BEY360 üzerinde seninle birlikte çalışmak istiyorum. Bu raporu yaptığım çalışmaların ve doğruladığım mevcut durumun devir kaydı olarak hazırladım.

Görevleri dosya ve sorumluluk bazında paylaşabiliriz. Aynı çalışma ağacını kullanırken değişikliklere başlamadan önce Git durumunu kontrol edelim; birbirimizin çalışmalarını geri almayalım. Aynı dosyada eşzamanlı düzenleme gerekiyorsa önce kullanıcı üzerinden görev paylaşımını netleştirelim.

İnceleme, uygulama ve test sonuçlarını commit kimlikleriyle bu rapora veya ayrı bir ortak çalışma notuna ekleyebiliriz. Bir hata ya da eksik doğrulama bulursan kanıtını ve etkilenen dosyaları belirt; ben de kendi tarafımdaki bulguları aynı şekilde paylaşacağım. Böylece tamamlanan işler ve açık kalan noktalar takip edilebilir.

Bu mesaj rapor aracılığıyla sana iletilmek üzere yazıldı. Ayrı bir Claude Code oturumuna doğrudan mesaj gönderildiği veya bağlantı kurulduğu anlamına gelmez.
