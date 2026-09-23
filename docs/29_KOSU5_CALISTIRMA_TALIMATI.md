# İŞBEY — Koşu #5 Çalıştırma Talimatı (2026-09-12)

**Amaç:** Build/tip kontrolü ve kalan Hızlı Bilişim QA kalemlerini tek komutla,
kanıtlı biçimde koşturmak. Bu belge, "test edilebilirliği çözme" adımının
çalıştırma tarafıdır.

> **Neden bu belge var:** Claude'un çalıştığı sanal makinenin kabuğu bu oturumda
> 16 kez Plan9 mount hatasıyla açılamadı (`... is under Plan9 share "c" which is
> not mounted`). Bu nedenle derleme/test **Claude tarafında koşulamıyor**.
> Aşağıdaki paket, koşuyu sizin makinenizde tek komuta indirir ve çıktıyı
> Claude'a geri gönderilebilir hâle getirir. **Hiçbir kalem Claude tarafından
> PASS ilan edilmemiştir.**

---

## 1. Tek komut

```powershell
cd D:\İŞBEY
powershell -ExecutionPolicy Bypass -File .\tools\dogrulama.ps1
```

Çıktı: `.verify-tmp\dogrulama-raporu.txt` — bu dosyayı Claude'a geri gönderin.

### Ön koşullar

| Koşul | Neden |
|-------|-------|
| `npm run dev` **durdurulmuş** olmalı | Koşu kendi sunucularını başlatır; iki süreç aynı `data\database.json`'a yazarsa veri ezilir |
| Port `4000` boş | Sunucu #1 / #2 bu portta ayağa kalkar |
| `npm install` yapılmış | `node_modules\.bin` yoksa TSC/BUILD kalemleri `BLOCKED` verir |
| `.env` dolu | Hızlı Bilişim credential'ları; eksikse FAZ 18 `BLOCKED`'a düşer |

### İsteğe bağlı anahtarlar

```powershell
# Rate-limit bütçesini doldurmadan hızlı koşu (RATE-001/002/003 atlanır)
.\tools\dogrulama.ps1 -SkipRateLimit

# Muhasebe suitelerini atla (uzun sürer)
.\tools\dogrulama.ps1 -SkipHeavy
```

> **Not:** `RATE-003` (XFF bypass) kanıtı **yalnızca `-SkipRateLimit`
> verilmediğinde** üretilir. Tam QA için anahtarsız koşun.

---

## 2. Bu sürümde pakete eklenen kalemler

| Kalem | Ne ölçer | Neden eklendi |
|-------|----------|---------------|
| `TSC-SERVER` | `tsc -p tsconfig.server.json --noEmit` | Root `tsconfig.json` yalnız `src` + `vite.config.ts` referanslar; **`server/` hiç tip kontrolünden geçmiyordu** (docs/28 §6) |
| `BUILD` | `npm run build` (`tsc -b && vite build`) | Pakette **hiç koşulmuyordu** |
| `SEC-006` | `/api/hizli-bayi/customers` yanıtında `wsPassword`/`portalCredentials`/`secretKey`/`apiKey` anahtarı aranır | WS şifresi sızıntısı düzeltmesinin regresyon kilidi (docs/28 §11.1) |
| `FAZ 18` | Hızlı Bilişim sandbox `UtilEncrypt` → `Login` | Pakette **hiç koşulmuyordu**; gerçek API akışı bu |
| `KAPI` | Canlı e-Fatura/e-Arşiv belge gönderimi | Kural koruması: kapı **kasıtlı olarak kapalı** raporlanır |

### Değerlendirme kuralları (dürüstlük)

**`TSC-SERVER`** — `server/` için ~141 **bilinen** hata vardır (şema/kod
uyumsuzluğu). "0 hata" beklenmez:

- hata ≤ 141 → **PASS** (yeni regresyon yok)
- hata > 141 → **FAIL** (yeni tip hatası eklendi)
- `tsc` hiç koşmadı → **BLOCKED**

**`BUILD`** — temiz olması beklenir: `exit=0` → PASS, aksi **FAIL**.

**`FAZ 18`** — özel özet biçimi (`PASS/FAIL/WARN/SKIP`):

- `FAIL > 0` → **FAIL**
- `PASS = 0` → **BLOCKED** (hiç kanıt üretilmedi — credential eksik veya test modu kapalı)
- `FAIL = 0, WARN = 0` → **PASS**
- `FAIL = 0, WARN > 0` → **WARN** (tam yeşil denemez)

Test modu kapalıysa canlı auth adımları atlanır; bu **açıkça** rapora yazılır.

**`KAPI`** — canlı belge gönderimi. Ön koşullardan biri eksikse **BLOCKED**;
hepsi sağlansa bile bu script **belge göndermez** (kontör yakar). Ayrı onay fazı gerekir.

---

## 3. Kullanıcının 9 adımı → paketteki karşılığı

| # | Adım | Paketteki kalem(ler) |
|---|------|----------------------|
| 1 | `npx tsc -p tsconfig.server.json` | **`TSC-SERVER`** *(bu sürümde eklendi)* |
| 2 | `npm run build` | **`BUILD`** *(bu sürümde eklendi)* |
| 3 | Hızlı Bilişim güvenlik testleri | `FAZ 25.1 security gate`, `FAZ 25.2-E auth/users`, `SEC-006` |
| 4 | Tenant izolasyon testleri | `FAZ 25.1 izolasyon`, `FAZ 25.2-C tenant sourcing`, `FAZ 25.2-D #2 runtime authz` |
| 5 | `SEC-006` credential leakage | **`SEC-006`** *(bu sürümde eklendi)* |
| 6 | `RATE-003` XFF | `RATE-003` *(mevcut, korundu)* |
| 7 | Test ortamında gerçek Login/UtilEncrypt | **`FAZ 18`** *(bu sürümde eklendi)* |
| 8 | e-Fatura/e-Arşiv gerçek API akışı | **`KAPI`** — kapı **kapalı** raporlanır |
| 9 | Son QA → production hazırlığı | `SONUC` bölümü; tüm kalemler PASS olmadan açılmaz |

---

## 4. Koşu sonrası doğru okuma

Raporun `SONUC` bölümünde beş durum vardır. **Anlamları farklıdır:**

| Durum | Anlamı | PASS sayılır mı? |
|-------|--------|------------------|
| `PASS` | Koşuldu ve geçti | ✅ Evet |
| `FAIL` | Koşuldu ve **başarısız** | ❌ Hayır |
| `BLOCKED` | Ortam nedeniyle **koşulamadı** (credential yok, sunucu yok) | ❌ **Hayır — bu bir geçiş değildir** |
| `WARN` | Koşuldu, geçti ama incelenmesi gereken uyarı var | ⚠️ Şartlı |
| `SKIP` | Kapsam dışı / anahtarla atlandı | ❌ Hayır |

**Kritik:** `BLOCKED` ve `SKIP`, "sorun yok" demek **değildir**. Özellikle
`-SkipRateLimit` ile koşarsanız `RATE-003` kanıtı üretilmez ve XFF düzeltmesi
**kanıtlanmamış** kalır.

Production hazırlığı için gereken: **`FAIL = 0`, `BLOCKED = 0`** (FAZ 19 izole
sunucu testi ve belge gönderimi kapsam dışı — bunlar ayrı fazdır).

---

## 5. Bu koşuda ne YAPILMAZ (kural koruması)

- **Canlı Hızlı Bilişim'e belge gönderilmez** (kontör tüketen işlem yok).
- **Production endpoint'e (`econnect`) geçilmez** — test base
  (`econnecttest`) korunur. FAZ 18, URL production'a işaret ediyorsa uyarı verir.
- Hızlı Bilişim API'sinde **karşılığı olmayan hiçbir işlem uydurulmaz**
  (bkz. "tüm mükellefleri listele" ucu — mevcut değildir, çağrılmaz).
