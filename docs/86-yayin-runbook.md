# 86 — YAYIN RUNBOOK (kimlik rotasyonu → backfill → CI → dağıtım)

**Tarih:** 2026-10-20 · **Durum:** hazırlık TAMAM, uygulama BLOKE (kimlik + canlı erişim)
**Dal:** `release/p0-tenant-depo` · **origin/main:** `9c74e69` (kırmızı)

Bu belge sırayla yapılacak işleri, her adımın **kanıtını** ve **geri dönüşünü**
tanımlar. Sıra keyfî değildir: 5. adım (backfill) 8. adım (dağıtım) için
önkoşuldur, çünkü yeni depo kapısı canlıya çıktığı anda Beyoğlu'nun deposu
yoksa gelen e-Fatura onayı `WAREHOUSE_ID_REQUIRED` ile durur. Bu, yerelde
ölçüldü (bkz. §5).

---

## 0. Değişmez kurallar

Kimlik bilgileri sohbete, loga, commit'e veya bu belgeye YAZILMAZ.
Force-push yapılmaz. Finansal kayıtlar test amacıyla değiştirilmez. Gerçek
e-Fatura gönderilmez. Başarısız migration sonrasında yayına devam edilmez.
Kanıtlanmamış bir test başarılı gösterilmez.

---

## 1. Kimlik rotasyonu (KULLANICI işlemi — ajan yapamaz)

İki kez sohbet çıktısında görünen üç kimlik **güvenilmez** durumdadır.

**Kullanıcı yapacak:**
1. Hostinger panelinden bey360.com SSH parolasını değiştir.
2. GitHub → Settings → Developer settings → Personal access tokens:
   `ghp_…` ve `github_pat_11CPLBFEI…` token'larını **revoke** et.
3. Yeni bir **fine-grained** token üret: yalnız `isbeycloud/isbey` deposu,
   yalnız `Contents: Read and write` (+ PR açmak istersen `Pull requests:
   Read and write`). Süre: 30 gün.

**Yeni kimliği bana YAPIŞTIRMA.** Makinede şu komutu çalıştır:

```
node tools/deploy-credentials.mjs set
```

Giriş gizlidir (ekranda görünmez), `~/.isbey-deploy.env` dosyasına `0600`
izniyle yazılır. Doğrulama:

```
node tools/deploy-credentials.mjs status   # yalnız "VAR/YOK" + sha256 parmak izi
node tools/deploy-credentials.mjs test     # push --dry-run ile YAZMA yetkisini sınar
```

`test` çıktısı yalnız "YETKİ VAR / YETKİ YOK" der; token basılmaz. Token URL'e
gömülmez (`GIT_ASKPASS` kullanılır) — böylece `ps` çıktısında da görünmez.

**Kanıt:** `status` çıktısındaki parmak izi + `test` sonucu.
**Geri dönüş:** `node tools/deploy-credentials.mjs clear`.

> Ölçüldü (2026-10-20): sahte token ile `test` → "YETKİ YOK", çıktıda token
> görünmedi, geçici `askpass` dosyası silindi. Gizli giriş PTY altında
> doğrulandı: yazılan değerler ekrana basılmıyor.

> **Windows uyarısı — `0600` GARANTİ DEĞİLDİR.** `chmod 0600` POSIX iznidir;
> Windows'ta Node `fs.chmod` yalnız salt-okunur bayrağını çevirir, DOS ACL
> üretmez. Bu proje Windows 11'de geliştirildiği için `~/.isbey-deploy.env`
> dosyasının gerçek erişim denetimi **doğrulanmamıştır**. Yani:
> - Aracı "güvenli kasa" sayma; **kısa ömürlü token** (30 gün) ve dar kapsam
>   (`Contents: RW`, tek depo) asıl korumadır.
> - Dosyayı diskte tutmak istemiyorsan `clear` ile sil; oturum başına
>   `set` → kullan → `clear` en dar penceredir.
> - Paylaşılan/yedeklenen bir profilde (OneDrive, roaming profile) token
>   senkronize olabilir; o durumda `clear` sonrası bulut sürümünü de sil.
> - `icacls "%USERPROFILE%\.isbey-deploy.env"` ile kimin okuyabildiğini
>   **kendin** kontrol et; aracın `status` çıktısı bunu kanıtlamaz.

---

## 2. Dalı yayınla (main'e DEĞİL)

```
git status                      # temiz olmalı
git log --oneline -6
git push -u https://github.com/isbeycloud/isbey.git release/p0-tenant-depo
```

`main`'e push YAPILMAZ: Hostinger `hbuilds` webhook'u main'e push'ta otomatik
dağıtım yapar. Dal push'u CI'ı tetikler, canlıyı DEĞİŞTİRMEZ.

**Kanıt:** push çıktısındaki SHA + `git ls-remote` ile uzak SHA eşleşmesi.

---

## 3. CI'ı O SHA için doğrula

```
gh api repos/isbeycloud/isbey/commits/<SHA>/check-runs \
  --jq '.check_runs[] | "\(.name): \(.conclusion)"'
```

İki iş de görülmeli: `Build, Lint, Typecheck & Security Audit` (ci.yml) ve
`test` (playwright.yml). Yalnız birine bakmak kırmızıyı kaçırır — 9c74e69'da
kırmızı olan tam olarak `test` işiydi.

**Kanıt:** iki satırın da `success` olması. `cancelled` = runner altyapısı,
test hatası değildir; yeniden koşturulur.

---

## 4. Canlı DB yedeği + SHA256

Sunucuda (SSH):

```
cp data/database.prod.json data/database.prod.json.bak-$(date +%Y%m%d-%H%M%S)
sha256sum data/database.prod.json data/database.prod.json.bak-*
```

Yerel kopyaya indir, özeti **karşılaştır**. Özetler eşit değilse devam etme.

---

## 5. Backfill — önce kuru koşum

```
python3 tools/backfill-dryrun.py <indirilen-kopya>.json
```

Beklenen (2026-10-20 ölçümü, o günkü canlı kopya):

| Ölçüm | Değer |
|---|---|
| Planlanan değişiklik | **43** (42 alan + 1 yeni kayıt) |
| Belirsiz kayıt | **0** |
| Kalan sahipsiz iş kaydı | **0** |
| Sarkan `warehouseId` | **0** |
| Toplam stok | 903 → 903 |
| Cari bakiye (customers.balance) | −252.924,59 → aynı |
| Koşan bakiye (hareketler toplamı) | −253.500,59 → aynı |
| Fatura toplamı (grandTotal) | 253.404,59 → aynı |
| Beyoğlu depo sayısı | 0 → 1 |

> **Bu değerler GEÇMİŞ ölçümdür.** Canlı veri değiştiyse bu sayıları zorla
> uygulama; güncel gerçeği esas al. Karar ölçütü sayılar değil, **kapılar**:
> belirsiz = 0, değişmezlik = GEÇTİ, sarkan = 0.

Dry-run çıkış kodu 0 değilse (3 = kapı düştü) **DUR**.

### "43 mü, 10 mu?" — aynı veri, iki raporlama

2026-10-20'de iki farklı sayı rapor edildi ve bu bir çelişki gibi göründü.
Ölçüm: **çelişki yok, aynı plan farklı tanelikte raporlanmış.**

Eski dry-run (`f811264:tools/backfill-dryrun.py`, sha256 `daffd44f…`) D4b
adımının 34 kaydını **tek bir özet satırında** topluyordu
(`(products|stockMovements|invoices) 34 kayıt`). O betiğin çıktısı, aynı
`database.prod.json` üzerinde tam olarak **10 satırdır**:

```
1 yeni depo + 4 D1 (2 depo + 2 kasa) + 3 D2 + 1 D3 + 1 özet "34 kayıt"
1 + 4 + 3 + 1 + 34 = 43
```

Yani 10 **satır**, 43 **alan**. Yeni `backfill_lib.py` her kaydı ayrı
raporlar ve `change_accounting()` planı kaynak DB ile alan alan
karşılaştırarak iki sayının eşitliğini **kanıtlar**. Apply artık bunu
**G3b kapısı** olarak zorunlu tutar: raporlanan ≠ ölçülen ise **yazmaz**.

### "−253.500,59 mu, −252.924,59 mu?" — iki farklı para gerçeği

576,00 TL'lik fark bir veri hatası değil, **iki farklı büyüklüğün**
karşılaştırılmasıdır. İkisi de aynı dosyada, aynı anda doğrudur:

- `customers[].balance` → carinin **güncel** bakiyesi. Toplam: **−252.924,59**
- `currentTransactions[].balance` → **koşan** bakiye; her satır "o ana
  kadarki" bakiyeyi taşır. Toplamı cari bakiye değildir: **−253.500,59**

**Tam kimlik** (200 rastgele senaryoda doğrulandı, 200/200):

```
Σ koşan − Σ cari = Σ(her carinin SON satırı HARİÇ bakiyeleri)
```

Sebep: bir carinin koşan bakiyeleri son satırın bakiyesine (=cari bakiyesi)
kadar birikir; son satır dışındaki her satır toplama **fazladan** girer.

Canlıda fazlalığı üreten tek satır `ALI-2026-000001` (bakiye −576).
`SAT-2026-000005` o carinin **son satırı** olduğu için fazlalık üretmiyor —
ilk yazdığım "fark 0 tutarlı belgeden gelir" açıklaması bu yüzden yanlıştı;
tesadüfen örtüşen iki özellik karıştırılmıştı.

```
Σ borç = 0,00 | Σ alacak = 252.924,59 | net = −252.924,59  ✓ (cari ile aynı)
```

**Yapılmaması gereken:** eski bakiyeyi "düzeltmek" için zorla geri yazmak.
Ortada düzeltilecek bir şey yok; backfill bu iki sayıyı da değiştirmez ve
`invariants()` ikisini de ayrı ayrı ölçer.

### Cari defter tutarlılığı — `tools/cari-tutarlilik.py`

Farkın **nedenini** açıklamak, defterin **doğru** olduğunu kanıtlamaz. Bunun
için ayrı, salt okunur bir denetçi var:

```
python3 tools/cari-tutarlilik.py <db.json>
```

| Kapı | Ne kanıtlar | 2026-10-20 canlı ölçümü |
|---|---|---|
| C1 | cari.balance = Σborç − Σalacak | 4/4 tutarlı |
| C2 | koşan bakiye kuralı her satırda | 5/5 tutarlı |
| C3 | son satır bakiyesi = cari bakiye | tüm carilerde eşit |
| C4 | iki para gerçeği kimliği | −576,00 = −576,00 |
| C5 | yürürlükteki fatura ↔ cari hareket | **1 İHLAL** (aşağıda) |
| C5b | iptal faturada hareket kalmamış | temiz |

**BULGU (C5 + C9): `SAT-2026-000001`.** Yürürlükte (`APPROVED`), e-Fatura
**SENT**, 120,00 TL — ama `customerId` **boş** ve cari hareketi **yok**.
Yani 120 TL'lik bir satış ne cari bakiyede ne koşan bakiyede görünüyor:
canlıda hiçbir yerde. Backfill'in sebep olmadığı, backfill'in de
düzeltmediği bir kayıt. İptal edilen 3 kardeşi (000002–000004) de aynı
şekilde carisiz doğmuş; onlarda hareket silindiği için defter etkilenmiyor.

Otomatik düzeltme **yapılmaz** (mali kayıt). Karar kullanıcınındır: ya
backfill'den ayrı bir iş emri olarak cari bağlantısı kurulur, ya da geçmiş
dönem kaydı olarak belgelenir. Geçmek için gerekçe zorunlu:

```
python3 tools/cari-tutarlilik.py <db.json> \
  --kabul C5="cari kaydi hic olusmamis; ayri is emri, backfill kapsami disinda"
```

Gerekçesiz (10 karakterden kısa) onay **reddedilir**; onaylar raporda
gerekçesiyle birlikte "KABUL" olarak basılır.

**Uyarılar (kapı değil, inceleme konusu):**

- **C6** `SAT-2026-000005`: 0 TL ama 3 stok hareketi (3 adet mal çıkmış).
- **C7** 13/13 ürünün `salePrice` alanı **0**. Satış faturası ürünün satış
  fiyatını kullanır (`invoices.ts:259`), dolayısıyla bu ürünlerle kesilen
  her satış faturası 0 TL çıkar. C6'nın kök nedeni budur; rastgele bir hata
  değil, **veri eksikliği**. Backfill bunu değiştirmez ve değiştirmemeli.

### Neden sıra kritik — ölçülmüş kanıt

Aynı kod, iki farklı DB ile:

| DB | "Depo seçmeden ürün ekle" | "Yeni depo ile ürün ekle" |
|---|---|---|
| backfill ÖNCESİ | `WAREHOUSE_ID_REQUIRED` | `WAREHOUSE_NOT_FOUND` |
| backfill SONRASI | `WAREHOUSE_ID_REQUIRED` | **201 oluşturuldu** |

Yani yeni güvenlik kodu, depo yokken çalışmayı **durdurur**. Backfill önce
yapılmalıdır.

---

## 6. Backfill — uygula

```
SHA=$(sha256sum <kopya>.json | cut -d' ' -f1)
python3 tools/backfill-apply.py <kopya>.json --expect-sha256 $SHA --confirm APPLY
```

Kapılar (biri düşerse **hiçbir şey yazılmaz**):

| Kapı | Kural |
|---|---|
| G1 | `--expect-sha256` eşleşmeli (yanlış/bayat dosyayı engeller) |
| G2 | Belirsiz kayıt = 0 (sahipliği kanıtlanamayan kayıt TAŞINMAZ) |
| G3 | Değişmezlik geçmeli |
| **G3b** | **Değişiklik muhasebesi tutmalı** — raporlanan sayı, planın kaynak DB ile alan alan karşılaştırmasından ölçülen sayıya eşit; silinen kayıt 0 |
| G4 | Kalan sahipsiz iş kaydı = 0 |
| G5 | `--confirm APPLY` verilmeli |
| G6 | Yapılacak değişiklik olmalı (idempotent) |

> **G3b neden var (2026-10-20'de bulunan gerçek kusur):** D4b raporlaması
> yeniden düzenlenirken `r['warehouseId'] = NEW_WAREHOUSE_ID` ataması
> düşmüştü. Plan 42 değişiklik **raporluyordu**, gerçekte 9 alan değişiyordu
> ve hiçbir kayıt bağlanmıyordu. Değişmezlik kapıları bunu görmez — çünkü
> değişmezlik "bir şey değişmesin" der, "plan eksik uygulanmasın" demez.
> `change_accounting()` ikisini karşılaştırır; G3b düşünce yazım olmaz.
> Negatif kontrolle doğrulandı (muhasebe bozulunca rc=3, dosya değişmiyor).

Yazım **atomiktir**: aynı dizinde geçici dosya + `fsync` + `os.replace`.
Ölçüldü: yazma sırasında süreç `SIGKILL` ile öldürüldüğünde DB **sağlam**
kaldı, JSON geçerli kaldı; yalnız geçici dosya artta kaldı ve bir sonraki
koşumda otomatik temizleniyor.

Üretilenler:
- `<db>.pre-backfill-<zaman>.bak` — tam yedek (sha256'sı basılır)
- `<db>.pre-backfill-<zaman>.beads.json` — cerrahi geri alma tohumu
- `<db>.backfill-<zaman>.report.json` — yapılan değişiklikler + değişmezlik

Bu üç dosya **tam DB kopyası / müşteri verisi** içerir; `.gitignore`'a eklendi.

---

## 7. Doğrula

```
python3 tools/backfill-verify.py <db>.json --before <db>.pre-backfill-*.bak
```

8 kontrol: Beyoğlu deposu, sarkan referans, çapraz-tenant bağlantı, sahipsiz
kayıt, her firmanın deposu, finansal değişmezlik, depo sayısı yönü, ad
tutarlılığı. Hepsi GEÇTİ olmalı.

> **Sıra notu:** `cari-tutarlilik.py` hem **yedek üzerinde** (backfill'den
> önce, taban çizgisi) hem **backfill sonrası** koşulmalı. Taban çizgisi
> alınmadan sonuç yorumlanamaz: C5 gibi bulgular backfill'den ÖNCE de vardı
> ve backfill onları ne düzeltir ne bozar. Kanıt, iki koşumun **aynı**
> sonucu vermesidir.

Ardından **gerçek API** kontrolü (kendi kendine yeten, canlıya dokunmaz):
sunucuyu bu DB ile ayağa kaldır, `admin` ile giriş yap, kendi deposuna ürün
ekle (201), yabancı depoya ekle (`WAREHOUSE_FORBIDDEN`).

> Ölçüldü (2026-10-20): kendi depo → 201; yabancı depo → `WAREHOUSE_FORBIDDEN`;
> `/api/products/adjust` yabancı depoya → `WAREHOUSE_FORBIDDEN`; diskte
> `CROSS-1` ürünü YOK, stok değişmedi.

**Geri dönüş:**
```
cp <db>.pre-backfill-*.bak <db>                              # tam
python3 tools/backfill-apply.py <db> rollback <…beads.json>  # cerrahi
```
Her iki durumda da sunucu **yeniden başlatılmalıdır** (`restart.txt`).
Ölçüldü: cerrahi rollback sonrası DB, yedekle **birebir eşit** (`a == b`).

---

## 8. Dağıtım (yalnız 3, 4, 6, 7 geçtikten sonra)

`main`'e merge → Hostinger webhook. Ya da hazır paket:
`npm run release:package`. Dağıtımdan önce `git config core.hooksPath .githooks`
aktif olmalı (main'e push'ta `release:gate` koşar, force-push reddedilir).

---

## 9. Canlı sürümün gerçekten değiştiğini kanıtla

- `GET /api/health` → sürüm + uptime
- Ana sayfa bundle adı (`assets/index-*.js`) + sha256'sı öncekiyle farklı olmalı
- Dağıtım öncesi/sonrası bundle adını **yaz**, "değişti" demeden önce karşılaştır

**Dağıtım ÖNCESİ taban (2026-10-20 ölçümü):**

| Ölçüm | Değer |
|---|---|
| `/api/health` | 200 · `version 2.0.0` |
| Ana sayfa | 200 |
| Bundle | `assets/index-5x-VFNsU.js` |

Dağıtım sonrası bu üçü **karşılaştırılır**; bundle adı değişmediyse istemci
kodu dağıtılmamış demektir.

---

## 10. Açık kalan gerçek engeller (2026-10-20)

| # | Engel | Kim çözer |
|---|---|---|
| 1 | SSH + 2 GitHub token rotasyonu | **Kullanıcı** |
| 2 | Push kimliği (bu VM'de yok: remote https, `~/.ssh` yok, helper yok) | Kullanıcı → §1 |
| 3 | Canlı DB erişimi (yedek + uygulama) | Kullanıcı |
| 4 | `SAT-2026-000001` çelişkisi (DB "gönderilmedi", eski kayıt 1300 diyor) | Sağlayıcı teyidi — teyit gelmeden "onaylı" DENMEZ |
| 5 | `SAT-2026-000001` carisi oluşmamış (120 TL defterde yok) — C5/C9 | Kullanıcı kararı: ayrı iş emri ya da belgeleme |

Bunlar çözülmeden 2–9 arası adımlar **teknik olarak imkânsızdır**; kod
tarafında beklenecek bir iş kalmadı.

### Hazır bekleyen komut sırası (kimlik geldiğinde)

```
# 1) kimlik
node tools/deploy-credentials.mjs set
node tools/deploy-credentials.mjs test          # YETKİ VAR mı

# 2) dal push + o SHA'nın CI'ı
git push -u origin release/p0-tenant-depo
gh api repos/isbeycloud/isbey/commits/<SHA>/check-runs \
  --jq '.check_runs[] | "\(.name): \(.conclusion)"'

# 3) taze canlı yedek + ölç
sha256sum database.prod.json

# 4) taban çizgisi (yedek üzerinde — DEĞİŞTİRMEZ)
python3 tools/cari-tutarlilik.py <yedek>.json
python3 tools/backfill-dryrun.py <yedek>.json

# 5) uygula (kapılar düşerse YAZMAZ)
SHA=$(sha256sum <kopya>.json | cut -d' ' -f1)
python3 tools/backfill-apply.py <kopya>.json --expect-sha256 $SHA --confirm APPLY

# 6) doğrula
python3 tools/backfill-verify.py <kopya>.json --before <yedek>.bak
python3 tools/cari-tutarlilik.py <kopya>.json    # taban ile AYNI sonucu vermeli

# 7) sunucuyu yeniden başlat (DB yalnız açılışta okunur) → canlı API kontrolü
```

**DUR noktaları:** belirsiz sahiplik > 0 · değişmezlik ihlali · plan–uygulama
uyuşmazlığı (G3b) · C1–C5b kapısı düşük · CI kırmızı. Herhangi biri varsa
ilerlenmez; yeni depo güvenlik kodu production'a **dağıtılmaz**.
