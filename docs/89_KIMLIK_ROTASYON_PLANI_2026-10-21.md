# 89 — KİMLİK GÜVENLİĞİ: ROTASYON PLANI VE KANITI

**Tarih:** 2026-10-21 · **Durum:** PLAN HAZIR, ROTASYON **YAPILMADI**
**Ölçüm:** `node tools/rotate-verify.mjs dogrula` → çıkış **3** (tamamlanmadı)

Bu belge rotasyonun *yapıldığını* değil, **nasıl yapılacağını ve nasıl
kanıtlanacağını** tanımlar. "İptal ettim" bir inanç değil, ölçüm olmalıdır.

---

## 1. Sızıntının kapsamı — ÖLÇÜLDÜ

| Kimlik | Nerede açığa çıktı | Git geçmişinde? | Bugün geçerli mi? |
|---|---|---|---|
| SSH parolası (bey360.com, Hostinger) | Sohbet çıktısı (2026-10-19, iki kez) + `hostinger.txt` + `host.txt` | **HAYIR** | Sınanmadı (aşağıya bakın) |
| GitHub token `ghp_…` (40 kr) | Aynı | **HAYIR** | **EVET — HÂLÂ GEÇERLİ** |
| GitHub token `github_pat_…` (93 kr) | Aynı | **HAYIR** | **EVET — HÂLÂ GEÇERLİ** |

**Yöntem:** her iki token için `GET https://api.github.com/user` — salt okunur,
tek çağrı, yazma/kapsam değişikliği yok. İkisi de `HTTP 200` döndü.
Değerler hiçbir çıktıya basılmadı; yalnız sınıflandırma yazıldı.

**Git geçmişi temiz:** üç yüksek entropili değer (`ssh_pass`, iki token) için
`git grep -F` (tüm ağaç) ve `git log --all -S` (silinmiş dosyalar dahil)
**0 eşleşme** verdi. Yani sızıntı **sohbet + disk** düzleminde; depo geçmişinde
değil. **Force-push / geçmiş yeniden yazma GEREKMEZ.**

> Not: Aynı tarama `host` (IP) ve `ssh_user` değerlerini geçmişte buldu. Bunlar
> parola/token değildir ve tek başına kimlik doğrulaması sağlamaz; rotasyon
> kapsamı dışındadır (yine de `docs/86` §1'deki kullanıcı adı maskeleme işi
> ayrı bir kalem olarak açıktır).

---

## 2. Neden bu bir "yapılacaklar" maddesi değil, P1

Bu kimliklerle bugün:
- **canlı sunucuya** girilebilir (dosya okuma/yazma, DB, `.env`),
- **depoya** yazılabilir (kod değiştirme → bir sonraki dağıtımda canlıya iner).

Depo PUBLIC. Token'lardan biri 93 karakterlik fine-grained token; kapsamı
daraltılmış olsa bile **iptal edilene kadar geçerlidir**. Sızıntının üzerinden
2 gün geçti ve bu süre boyunca kimse iptal etmedi — bu, riskin *teorik*
olmadığını gösterir.

---

## 3. Rotasyon adımları (KULLANICI işlemi — ajan yapamaz)

Sıra önemli: **önce yeniyi üret, sonra eskiyi iptal et.** Tersi yapılırsa
arada kalınır ve acil bir düzeltme gerekirse erişim kalmaz.

### 3.1 GitHub token'ları

1. GitHub → Settings → Developer settings → **Personal access tokens**.
2. **Önce yenisini üret** (fine-grained): yalnız `isbeycloud/isbey`,
   `Contents: Read and write` (+ PR için `Pull requests: Read and write`),
   süre **30 gün**. Klasik token üretme.
3. Yeni token'ı **sohbete YAPIŞTIRMA**. Makinede:
   ```
   node tools/deploy-credentials.mjs set
   node tools/deploy-credentials.mjs test     # "YETKİ VAR" görmeli
   ```
4. **Sonra** eski ikisini **revoke** et:
   - `ghp_…` (klasik, 40 kr)
   - `github_pat_…` (fine-grained, 93 kr)

### 3.2 SSH parolası

1. Hostinger paneli → bey360.com → SSH parolasını değiştir.
2. Yeni parolayı `node tools/deploy-credentials.mjs set` ile gir.
3. **Eski parolayla bağlanmayı DENE** — reddedilmelidir. Bu adım atlanırsa
   "değiştirdim" kanıtlanmamış kalır.
   > Araç bu denemeyi KENDİSİ yapmaz: başarısız SSH denemeleri hesabı
   > kilitleyebilir ve log gürültüsü üretir. Karar kullanıcıya bırakıldı.

### 3.3 Diskteki kopyalar

```
# host.txt ve hostinger.txt rotasyon SONRASI silinmeli (içlerinde ESKİ değerler var)
node tools/deploy-credentials.mjs clear       # ~/.isbey-deploy.env
```
Silmeden önce parmak izleri zaten kaydedildi:
`tools/.eski-kimlik-parmak-izleri.json` (git dışı, yalnız sha256 ilk 16).

---

## 4. Rotasyon sonrası KANIT

```
node tools/rotate-verify.mjs dogrula
```

Beklenen çıktı ve anlamı:

| Satır | Anlamı |
|---|---|
| `✓ <iz> GEÇERSİZ (iptal edilmiş)` | Eski token gerçekten öldü |
| `❌ <iz> HÂLÂ GEÇERLİ` | **Rotasyon yapılmamış** — çıkış 3 |
| `⚠️ <iz> HÂLÂ DİSKTE` | Değer silinmemiş; yeni bir ifşa riski sürüyor |
| `? <iz> değeri diskte yok → sınanamadı` | Dosya silinmiş; iptal **varsayılmaz** |

**Tam başarı:** çıkış kodu `0` — hiçbir token geçerli değil, hiçbir eski değer
diskte değil. SSH parolası ayrıca elle teyit edilir (§3.2/3).

### Bugünkü ölçüm (2026-10-21) — KIRMIZI

```
⚠️  ssh_pass   HÂLÂ DİSKTE
⚠️  token(40)  HÂLÂ DİSKTE
⚠️  token(93)  HÂLÂ DİSKTE
❌ token(40)  HÂLÂ GEÇERLİ — rotasyon YAPILMAMIŞ
❌ token(93)  HÂLÂ GEÇERLİ — rotasyon YAPILMAMIŞ
SONUÇ: ROTASYON TAMAMLANMADI  (çıkış 3)
```

---

## 5. Ajan tarafında alınan önlem (bu oturumda uygulandı)

Bu oturumda GitHub'a yazma ve SSH erişimi **gerekmedi**; gereken tek şey
canlı sistemin salt-okunur doğrulamasıydı ve o **kimliksiz** yapıldı:

- `/api/health` · ana sayfa · bundle adı · korumalı ucun `401` davranışı
- Hiçbir token/parola kullanılmadı, hiçbir yazma yapılmadı.

**Kural (bundan sonrası için):** bu iki token ve SSH parolası, kullanıcı
rotasyonu teyit edene kadar **kullanılmaz**. Yeni bir dağıtım gerekirse
`tools/deploy-credentials.mjs set` ile girilen **yeni** kimlik kullanılır.

---

## 6. Açık kalan risk (rotasyon sonrası da)

- `host.txt` ve `hostinger.txt` silinmedikçe eski değerler diskte durur.
- Windows'ta `~/.isbey-deploy.env` için `0600` **gerçek bir ACL değildir**
  (`docs/86` §1). Asıl koruma kısa ömür + dar kapsamdır.
- Sohbet geçmişi: değerler 2026-10-19'da iki kez basıldı. Rotasyon, sohbet
  geçmişindeki değerleri **değersiz** kılar — bu yüzden zorunludur.

---

**İlgili:** `docs/86-yayin-runbook.md` §1 · `tools/rotate-verify.mjs` ·
`tools/deploy-credentials.mjs`
