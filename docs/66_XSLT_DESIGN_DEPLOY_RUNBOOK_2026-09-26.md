# XSLT tasarım değişikliği — dağıtım ve geri dönüş runbook'u

**Tarih:** 26 Eylül 2026
**Kapsam:** commit `e16faf4` — fatura tasarımında gerçek XSLT dönüşümü, dosya yükleme, XXE koruması
**Durum:** yerel hazırlık tamamlandı; **canlıya dağıtım YAPILMADI** (kimlik bilgisi bekleniyor)

---

## 1. Dağıtım öncesi doğrulanmış durum

### Canlı sürüm (kanıtlanmış)

Canlıda çalışan sürümün hangi commit olduğu **tahmin edilmedi**, derleme karşılaştırmasıyla kanıtlandı. `dist/` depoda tutulmaz (`.gitignore`), bu yüzden aynı commit'ten derlenen bundle bit düzeyinde aynı çıkar:

| Ölçüm | Değer |
|---|---|
| Canlı bundle | `dist/assets/index-DSAwJL98.js` |
| Canlı sha256 | `43402761dc52e5794fbba4895c9e010d8c2d3098354171acf92bdd68ad14ddbc` |
| `34b9077` kaynağından derleme | `index-DSAwJL98.js` |
| Derleme sha256 | `43402761dc52e5794fbba4895c9e010d8c2d3098354171acf92bdd68ad14ddbc` |
| Sonuç | **EŞLEŞTİ → canlı = `34b9077`** |

Yerel `HEAD` = `origin/main` = `34b9077`; sapma yok. Arayüz dosyalarının yayın zamanı (25 Eyl 18:45 TSİ) pilot faturanın GİB onayıyla (18:47) tutarlı.

> `last-modified` başlığı bu amaçla kullanılamaz: Hostinger/CDN derleme sonrası dosya zaman damgasını **deploy anına** eşitler.

### e-Fatura güvenlik kontrolü (dağıtım öncesi, salt okunur)

- **Canlıda `SENDING` durumunda kayıt YOK.** Toplam 2 fatura:
  - `SAT-2026-000001` → `eInvoiceStatus: SENT`, `status: APPROVED`, ETTN `7e03cd4b-03db-4d36-a389-642af1700927`
  - `SAT-2026-000003` → `eInvoiceStatus: DRAFT`
- 60 saniyelik otomatik gönderim kuyruğu (`ElectronicDocumentQueue.processQueue`) bu durumda **gönderilecek belge bulamaz**.
- Bu kontrol hiçbir kaydı değiştirmedi; hiçbir belge gönderilmedi; kontör tüketilmedi.
- Deploy sırasında **hiçbir test belgesi** Hızlı Bilişim'e gönderilmeyecek.

### Değişikliğin belge gönderimiyle ilişkisi

`git diff` ile doğrulandı: `xsltContent` **gönderim yolunda hiç geçmez** (`hizliConnectService`, `efatura`, `ubl/*`). Değişiklikler yalnız tasarım/önizleme katmanındadır ve canlı fatura gönderimini etkilemez.

### Veri kaybı riski

`seedDefaultDocumentTemplates` yalnız `documentTemplates` listesi **boşsa** çalışır. Canlıda 4 şablon mevcut (`EFATURA`, `EARSIV`, `EIRSALIYE`, `ESMM`, XSLT içerikleriyle) → **seed tetiklenmez, mevcut tasarımlar korunur.**

---

## 2. Dağıtım öncesi kalite kapısı (yerel)

| Adım | Komut | Sonuç |
|---|---|---|
| Typecheck | `npx tsc -b` | **PASS** (0 hata) |
| Lint | `npx oxlint src server` | **PASS** (0 hata, 999 mevcut uyarı) |
| Yerel süitler | `npm test` | **21 PASS / 0 FAIL** (yeni `xsltSecurityTest.ts` dahil) |
| Üretim derlemesi | `vite build` | **PASS** |
| Tarayıcı E2E | giriş + ayarlar + XXE | **PASS** |
| `console.log` denetimi | yeni/değişen dosyalar | temiz (0) |

Yeni test: `server/tests/xsltSecurityTest.ts` — 9 senaryo. XXE reddi, gizleme girişimleri ve **yanlış pozitif kontrolü** (temiz şablon hâlâ geçerli; üretilen 5 varsayılan şablonun tümü hâlâ geçerli).

Bilinen ortam kısıtı: `phase32CreditLifecycleTest.ts` bu Linux VM'de `EPERM: unlink` nedeniyle FAIL görünebilir. Testin mantık doğrulaması geçer, çökme temizlik adımındadır; **gerçek regresyon değildir**. Bu oturumda görülmedi (21/21 PASS).

---

## 3. Yedek adımları

Dağıtımdan **önce** (SSH ile, hiçbiri silme değil — yalnız kopya):

```sh
cd /home/u455582886/isbey-private
TS=$(date -u +%Y%m%dT%H%M%SZ)

# 1. Veritabanı
cp database.prod.json "backups/database.prod.json.$TS"
sha256sum "backups/database.prod.json.$TS" > "backups/database.prod.json.$TS.sha256"

# 2. Ortam dosyası (secret İÇERİR — sohbete yazılmaz, dışa aktarılmaz)
cp .env "backups/env.$TS"
sha256sum "backups/env.$TS" > "backups/env.$TS.sha256"

# 3. Yüklenen XSLT dosyaları
tar czf "backups/xslt-uploads.$TS.tar.gz" -C .  uploads/ 2>/dev/null || true
tar czf "backups/xslt-files.$TS.tar.gz"   -C .  data/xslt data/storage 2>/dev/null || true

# 4. Çalışan kod sürümü (geri dönüş noktası)
git -C /home/u455582886/<uygulama-kökü> rev-parse HEAD > "backups/code-commit.$TS"
```

`<uygulama-kökü>` dağıtımın açıldığı dizindir (public_html değil). Yedek dizini uygulama kökünün dışında olmalıdır.

**Geri dönüş noktası:** canlı kod `34b9077`. Geri dönmek için o commit'e geri push edilir (Hostinger otomatik dağıtımı yeniden kurar) veya `hPanel → Yeniden Dağıt` ile önceki sürüm seçilir.

---

## 4. Dağıtım

`main` dalına push = canlı dağıtım (Hostinger GitHub otomatik dağıtımı). `.github/workflows/ci.yml` yalnız test çalıştırır, dağıtımı etkilemez.

```sh
git push origin main          # 34b9077..e16faf4
```

Push sonrası Hostinger ~1 dakikada yeni sürümü kurar; gerekirse `hPanel → Yeniden Dağıt` ile tetiklenir.

**Push için gereken:** GitHub kimlik bilgisi (PAT veya SSH anahtarı). Depoda kayıtlı kimlik yoktur (`credential.helper` boş, `~/.git-credentials` yok, `gh` CLI kurulu değil). **Token sohbete yazılmamalıdır** — kullanıcı kendi terminalinden push etmeli ya da kimliği güvenli biçimde sağlamalıdır.

### Dağıtımın doğrulanması

```sh
# 1. Yeni bundle hash'i (34b9077'ninkinden FARKLI olmalı)
curl -s https://bey360.com/ | grep -o 'index-[A-Za-z0-9_-]*\.js'

# 2. Arayüz değişikliği kanıtı: yeni bileşenin metni bundle'da bulunmalı
curl -s https://bey360.com/assets/index-<yeni-hash>.js | grep -c "XSLT"

# 3. Sunucu tarafı
curl -s https://bey360.com/api/health
```

> Uyarı: "Yetkisiz istek 401 dönerse uç var" çıkarımı **geçersizdir** — global auth ara katmanı olmayan uçlar için de 401 döner. Dağıtımı bundle içeriğinden doğrulayın.

---

## 5. Dağıtım sonrası smoke test

Tarayıcıda, canlı adreste:

1. Giriş (yönetici hesabı)
2. Gösterge paneli yükleniyor
3. Cari, Stok, Satış/Alış faturaları listeleri
4. **Ayarlar → Belge & Fatura Tasarımları** — 4 şablon listelenmeli
5. Bir şablonun **XSLT Kaynak Kodu** panelini aç
6. **Doğrula** — `version="2.0"` uyarısı + otomatik uyumlulaştırma mesajı görünmeli
7. **Dosya Yükle** sekmesi — sürükle-bırak alanı görünmeli
8. **Canlı Önizleme** — gerçek UBL XML ile A4 çıktısı, QR görselleri
9. Geçersiz uzantı (ör. `.txt`) reddedilmeli
10. XXE denemesi (`<!DOCTYPE ... SYSTEM ...>`) **reddedilmeli** ("Güvenlik:" mesajı)
11. Sürüm geçmişi açılıyor; "Sürüme Geri Dön" çalışıyor

**Kritik:** smoke test sırasında **hiçbir belge gönderilmez, hiçbir durum değiştirilmez.** Yalnız okuma ve tasarım önizlemesi.

---

## 6. Geri dönüş

Belirti: giriş çalışmıyor, şablon listesi boş, önizleme hata veriyor veya 5xx.

```sh
# Kod geri dönüşü — önceki commit'i main'e geri getir
git revert --no-commit e16faf4 && git commit -m "revert: XSLT tasarım değişikliği geri alındı"
git push origin main
# veya: git push origin 34b9077:main --force-with-lease   (yalnız gerekirse)
```

Veri geri yükleme **normalde gerekmez**: bu commit şema değiştirmez ve şablon listesi boş değilse seed tetiklenmez. Yalnız tasarım verisi bozulduysa yedekten dönülür:

```sh
cp backups/database.prod.json.<TS> database.prod.json    # servis DURDURULMUŞKEN
```

**Dikkat:** yedekten geri dönmek, yedek anından sonra oluşan gerçek iş kayıtlarını (fatura, tahsilat) kaybettirir. Kod geri dönüşü bunu gerektirmez — önce **kod** geri alınmalı, veri en son seçenek olmalıdır.

`tools/db-restore.mjs` geliştirme veritabanı içindir; production geri dönüşünde **kullanılmamalıdır**.

---

## 7. Bilinen açık işler

- **Görsel tasarım editörü** (sürükle-bırak A4, Monaco sekmeleri) henüz yapılmadı. Kullanıcının açık talimatı: bu geliştirme **production dağıtımını bloke etmemeli**. Bu runbook yalnız mevcut XSLT işini canlıya çıkarır.
- `SAT-2026-000001.gibStatusDescription` alanı eski "bu ETTN için kayıt bulunamadı" metnini taşır (serbest bırakma anından). Kayıt `SENT` + ETTN durmaktadır; açıklama alanı sonraki başarılı gönderimde güncellenmemiştir. **Yanlış okunmamalıdır.**
