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
| Planlanan değişiklik | 10 |
| Belirsiz kayıt | **0** |
| Kalan sahipsiz iş kaydı | **0** |
| Sarkan `warehouseId` | **0** |
| Toplam stok | 903 → 903 |
| Cari bakiye (customers.balance) | −252.924,59 → aynı |
| Fatura toplamı (grandTotal) | 253.404,59 → aynı |
| Beyoğlu depo sayısı | 0 → 1 |

> **Bu değerler GEÇMİŞ ölçümdür.** Canlı veri değiştiyse bu sayıları zorla
> uygulama; güncel gerçeği esas al. Karar ölçütü sayılar değil, **kapılar**:
> belirsiz = 0, değişmezlik = GEÇTİ, sarkan = 0.

Dry-run çıkış kodu 0 değilse (3 = kapı düştü) **DUR**.

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
| G4 | Kalan sahipsiz iş kaydı = 0 |
| G5 | `--confirm APPLY` verilmeli |
| G6 | Yapılacak değişiklik olmalı (idempotent) |

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

---

## 10. Açık kalan gerçek engeller (2026-10-20)

| # | Engel | Kim çözer |
|---|---|---|
| 1 | SSH + 2 GitHub token rotasyonu | **Kullanıcı** |
| 2 | Push kimliği (bu VM'de yok: remote https, `~/.ssh` yok, helper yok) | Kullanıcı → §1 |
| 3 | Canlı DB erişimi (yedek + uygulama) | Kullanıcı |
| 4 | `SAT-2026-000001` çelişkisi (DB "gönderilmedi", eski kayıt 1300 diyor) | Sağlayıcı teyidi — teyit gelmeden "onaylı" DENMEZ |

Bunlar çözülmeden 2–9 arası adımlar **teknik olarak imkânsızdır**; kod
tarafında beklenecek bir iş kalmadı.
