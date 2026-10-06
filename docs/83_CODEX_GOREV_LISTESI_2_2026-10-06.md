# Codex Görev Listesi #2 — 2026-10-06

**Taban HEAD:** `d7157fc` (üzerinde `d580569` = DocumentConversionService kalıcılık düzeltmesi)
**Hazırlayan:** Claude
**Kapsam onayı:** Kullanıcı, dört işin **hepsini** seçti.

---

## 0. Ölçülen taban (bu liste yazılırken doğrulandı)

| Olgu | Ölçüm |
|---|---|
| CI ve Playwright **ayrı** workflow | `.github/workflows/ci.yml`, `playwright.yml` — biri diğerini etkilemez |
| CI adım sırası | typecheck → lint → build → **security-audit** → **npm test** |
| ⚠️ Sonuç | `security-audit` düşünce **`npm test` HİÇ KOŞMAZ** (adım atlanır). Audit hatası test süitini CI'da maskeliyor. |
| Deploy’un CI’ya bağı | **YOK.** Hostinger hbuilds push’ta ayrı tetikleniyor; workflow’da deploy adımı yok |
| `proxy-addr` | **2.0.7** (`express@5.2.1` bağımlısı) — kritik |
| `source-map-js` | **1.2.1** (vite transitif) — yüksek |
| `TRUST_PROXY` kullanımı | `server/index.ts:139` — **tanımsızsa `trust proxy` açılmaz** (güvenli varsayılan) |

---

## Adım 1 — Bu listeyi `docs/81`’e bağla ve tabanı yeniden ölç

`docs/81` ilk görev listesidir; bu ikincisidir. `docs/81`’in sonuna tek satır
atıf ekle. Sonra `d7157fc` üzerinde şu dördünü ölç ve çıktıyı sakla:

```
npm run typecheck
npm run lint
npm run build
npm test
```

**Bitiş koşulu:** Dördünün exit kodu + PASS/FAIL sayısı raporlandı.
**Kanıt:** Komut çıktıları + `git rev-parse HEAD`.

> Not: `npm test` Windows’ta esbuild/oxlint native binding ister. Claude’un
> Linux VM’inde koşmadı; **senin ortamında koşuyor** (önceki karşı-doğrulamanda
> 39 PASS aldın). Ölçümü sen yap.

---

## Adım 2 — Sunucu geneli bayat-referans taraması  ⟵ EN YÜKSEK BİLİNMEYEN

`documentConversionService.ts`’te 4 public metot bu desenden muzdaripti.
**Aynı deseni sunucunun tamamında ara.** Amaç teşhis; düzeltme değil.

**Aranacak desen — bir fonksiyon gövdesinde ÜÇÜ birden:**

1. `const db = storage.getState()` (veya `getState()` sonucunun bir kısmı) ile
   okuma referansı alınıyor,
2. aynı gövdede **sonradan** `storage.getNextSequence(...)`, `storage.addAuditLog(...)`,
   `storage.update(...)` veya `storage.save()` çağrılıyor
   (hepsi `this.db`’yi YENİ bir klonla değiştirir),
3. ve ardından **1 numaralı referansa** yazılıyor (`db.x.push`, `obj.alan = ...`).

**Taramayı yaparken:** yalnız `storage.getState(` çağrılarının bulunduğu
fonksiyonları çıkar, sonra o fonksiyon gövdesinde (2) ve (3) var mı diye bak.
Kaynak dosya sayısı fazla; sonucu **tablo** olarak ver.

**Bitiş koşulu — tablo şu kolonlarla:**

| Dosya:satır | Fonksiyon | Transaction içinde mi? | Bayat yazım var mı? | Ölçüldü mü? |

**Kritik ayrım — yanlış alarmı önle:** `runTransaction` İÇİNDEKİ kod
etkilenmez. Transaction içindeyken `getState()` draft’ı döndürür ve `update()`
erken çıkar. Bu yüzden **transaction içindeki desenleri "temiz" olarak işaretle**
ve tabloda neden temiz olduğunu belirt.

**Kanıt:** Tablo + en az **3** şüpheli için izole prob çıktısı
(`.verify-tmp/` altında, `NODE_ENV=test`, ayrı `DATABASE_PATH`).
Prob, "fonksiyon ne döndü" değil **"diske ne yazıldı"** sorusunu ölçmeli —
bellekteki duruma bakmak tuzağı gizler, **diskten taze oku**.

**Sınır:** Hiçbir davranış değiştirme. Yalnız liste + ölçüm. Düzeltme ayrı onay.

---

## Adım 3 — Cari defter uyuşmazlığı: karar + düzeltme (KULLANICI KARARI BEKLİYOR)

**Olgu (Claude ve Codex bağımsız ölçtü, aynı sonuç):**
36 TL açık satış faturası → `invoiceGrand=36`, `accountTransactionDebit=36`,
`currentTransactionCount=0`, `persistedCustomerBalance=0`.

`createInvoiceCore` cari hareketi `accountTransactions`’a yazıyor ve
`customer.balance`’ı elle artırıyor; ama commit’teki `recalculateBalances`
cari bakiyeyi **yalnız `currentTransactions`**’tan türetir. Artırılan bakiye
sıfırlanır. Ekip bunu biliyor (`incomingInvoiceService.ts:873-879`); gelen belge
akışı bu yüzden `currentTransactions`’a da yazıyor.

⚠️ **Bu adıma BAŞLAMA.** İki çözüm yolu var ve ikisi de cari/muhasebe mantığına
dokunur:

- **(A)** `createInvoice`/`convertWaybillToInvoice` de `currentTransactions`’a yazsın
  (legacy + gelen belge akışıyla hizalama — en az sürprizli, kaçınılmaz çift
  yazım var).
- **(B)** `accountTransactions` kaldırılsın, tek yetkili defter `currentTransactions`
  olsun (temiz ama blast radius büyük; `financialTransactionService`,
  `v1/reports.ts:23`, `v1/customers.ts:234` okurları etkilenir).

**Yapılacak şimdilik:** Her iki yolun **dosya/okuyucu envanterini** çıkar ve
tahmini blast radius’ı yaz. Kod değiştirme.

**Bitiş koşulu:** Kullanıcı A/B’den birini seçtiğinde uygulanacak dosya listesi hazır.
**Kanıt:** Okuyucu envanteri (hangi dosya hangi defteri okuyor) + etki notu.

---

## Adım 4 — CI audit açıkları (kritik yol)

`security-audit` düştüğü için CI’da **testler hiç koşmuyor**. İki iş var:

1. **Ölç:** Canlı sunucuda `TRUST_PROXY` ayarlı mı? Ayarlıysa hangi değer?
   (Bunun için sunucuya erişim gerekir; erişemiyorsan **açıkça yaz**, tahmin etme.)
   `proxy-addr` CVE’si yalnız `trust proxy` AÇIKKEN anlamlıdır — kapalıyken
   `req.ip` gerçek socket adresidir.
2. **Düzelt:** `npm audit fix` (veya sürüm yükseltmesi) ile iki açığı kapat.
   `fixAvailable=true` iken bile **lockfile değişir** — bu ortak dosyadır,
   ayrı onay konusu. Zorla upgrade etme; `npm ls proxy-addr source-map-js` ile
   yeni ağacı doğrula.

⚠️ `proxy-addr`’i koparmak `express`’i kırabilir. `npm test` + `npm run build`
yeşil kalmadan bu adımı "bitti" sayma.

**Bitiş koşulu:** `npm audit --audit-level=high` exit 0 **ve** testler yeşil **ve**
lockfile diff’i gözden geçirilmiş.
**Kanıt:** `npm audit` öncesi/sonrası çıktısı + lockfile diff’i.

---

## Adım 5 — Push (yalnız tüm kapılar yeşilse)

Bu adım **en sona** gelir; Adım 2–4’ün çıktısına bağlıdır.

**Push edilecek commit’ler:** `d580569` (kalıcılık) + `d7157fc` (docs) + bu adımda
üretilenler.

**Bitiş koşulu — hepsi:**
- `npm run typecheck` PASS, `npm run lint` PASS, `npm run build` PASS
- `npm test` PASS (regresyon yok)
- `npm audit --audit-level=high` exit 0
- CI **ve** Playwright yeşil (ikisi ayrı workflow, ikisini de kontrol et)

**Sonra Hostinger deploy doğrulaması** (Claude’un yöntemi, hafızada):
`index-<hash>.js` dosyasının yerel ve canlı sha256’sı eşleşmeli. Bundle hash yalnız
istemciyi kanıtlar; sunucu kodu için ayrı kanıt gerekir — bunu **sınır** olarak yaz.

---

## Dosya sahipliği (çakışma önleme)

| Sahip | Dosyalar |
|---|---|
| **Codex** | Adım 2 taramasının dokunduğu server dosyaları (yalnız okuma), Adım 4 için `package.json` + `package-lock.json`, yeni test/prob dosyaları |
| **Claude** | `server/services/documentConversionService.ts`, `server/db/*`, `server/middleware/*`, `docs/*` |
| **Ortak — dokunmadan önce haberleş** | `tools/test-local.mjs`, `tsconfig*.json` |

`package-lock.json` **ortak dosya**: Adım 4’e başlamadan haber ver.
`tsconfig.server.json` **değiştirilmeyecek** (strict açma yasak).

---

## Yasaklar (değişmedi)

- `strict` bayrağını global açma — muhasebe modüllerine dokunur.
- Gerçek e-Fatura gönderimi — kontör tüketir.
- İrsaliye hizmetini açma.
- Canlı Hızlı Bilişim’e belge gönderme.
- API yanıtı uydurma; başarısız testi PASS gösterme.
- Credential’ları kaynak dosyaya yazma.
- Force-push (ayrı onay).
- `docs/81`’deki “bu listede OLMAYAN işler” bölümü hâlâ geçerli.
