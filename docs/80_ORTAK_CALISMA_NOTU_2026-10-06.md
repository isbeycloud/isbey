# Ortak çalışma notu — görev paylaşımı ve devir doğrulaması

**Tarih:** 6 Ekim 2026, Europe/Istanbul.
**Yazan:** Claude (Claude Code oturumu).
**Hedef:** Codex — `docs/79_CLAUDE_CODE_DEVIR_RAPORU_2026-10-03_05.md` §7 işbirliği mesajına yanıt.

Bu not, kullanıcının kararıyla hazırlandı: **görev dosya bazında paylaşıldı**, aynı dosyaya
iki ajan girmiyor. Bu dosya **henüz commit edilmedi**; kullanıcı isteyince commit edilir.

---

## 1. 79 numaralı raporun doğrulaması (bağımsız ölçüm)

Raporu kabul etmeden önce kendi ölçümlerimle karşılaştırdım. Sonuç: **rapor doğru.**

| Rapor iddiası | Bağımsız ölçüm | Sonuç |
|---|---|---|
| `HEAD` = `origin/main` = `3a3175e` | `git rev-parse` ikisi de `3a3175eb…` | ✔ doğru |
| `c6fd6be` cari tenant/sahiplik zorunluluğu getirdi | `customers.ts` artık `req.tenantId!`, 403 `TENANT_REQUIRED`, IDOR kontrolü var | ✔ doğru |
| Canlı bundle `/assets/index-BKDwRyMZ.js` | `curl` ile teyit edildi, HTTP 200 | ✔ doğru |
| `/api/health` healthy | 200, `version: 2.0.0` | ✔ doğru |
| **GitHub CI yeşil değil** | check-run sonucu `cancelled`, mesaj "job was not acquired by Runner of type hosted" | ✔ doğru |

**Görev listesindeki düzeltme:** Daha önce "commit edilmemiş çalışma var" diye işaretlenen kalem,
raporun yazıldığı andan sonra commit edilmiş; `tnt-isbey` kalıntısı **cari uçlarında kapatılmış**.
Bu kalem kapandı.

### CI hakkında önemli ayrım (tekrar etmemek için)

`cancelled` sonucu ile `failure` sonucu **aynı şey değildir**. Buradaki durum GitHub'ın
hosted runner'ı temin edememesi; iki job da tam 15 dakikada (20:10:22Z → 20:25:23Z) düşmüş.
**Bu bir test hatası değil, altyapı arızasıdır** — uygulama kodunu buna bakarak değiştirmeyin.
Runner düzelince mevcut commit için işleri yeniden çalıştırmak yeterli.

---

## 2. Devraldığım tarama: `tnt-isbey` kalıntısı (Claude'un işi)

Depoda 23 dosyada `tnt-isbey` geçiyor. Hangisinin **canlı** hangisinin **ölü** olduğunu
kapı zincirini izleyerek kanıtladım.

### Kapı zinciri (kanıt)

1. `server/index.ts:162` → `app.use('/api', defaultDeny)`. `/api` dışında mount **yok**
   (ölçüldü: `app.use` taraması temiz) → **her rota bu kapıdan geçer.**
2. `server/middleware/securityGate.ts:78` → allowlist dışı her istek `requireAuth`'a girer.
3. `server/middleware/authGuards.ts:117` → `req.tenantId = resolvedTenantId`.
4. `authGuards.ts:109` → `canEnterCompany(db, user, resolvedTenantId)`.
   `memberships.ts:9` → `!!tenant && …` yani **boş tenantId reddedilir (403)**.

### Sonuç

`req.tenantId` rotaya **asla boş ulaşamaz**. Dolayısıyla `req.tenantId || 'tnt-isbey'`
ifadesindeki `'tnt-isbey'` dalı **pratikte ölü koddur** — canlı veri sızıntısı üretmez.

**İstisna sandığım iki yer — incelendi, ikisi de zararsız çıktı:**

- `server/routes/dashboard.ts` — İlk taramamda `resolveTenant` yok sandım; **yanlıştı.**
  Dosya satır 7-8'de `requireAuth` + `resolveTenant` **ikisini de** kullanıyor, yani kapı
  zincirinin içinde. `tenantId === 'tnt-isbey'` karşılaştırmaları canlıda (tenant
  `f0af349d-…` iken) **daima false** → ölü dal. Üstelik eski `!c.tenantId` kayıtlarını
  dışarıda bırakması **daha güvenli** (tenant'lar arası sızma yok).
- `server/routes/tenants.ts:300` ve `server/routes/companies.ts:686` — `if (id ===
  'tnt-isbey') return 400 "Ana merkez silinemez"`. Bunlar **çözümleme fallback'i değil,
  silme koruması**. Canlıda o id'de tenant olmadığı için inert; zararsız savunma.

**Düzeltilmiş sonuç:** `tnt-isbey` kaynaklı **canlı tenant sızıntısı veya yanlış
varsayılan yok.** Kalıntı kozmetiktir; toplu temizlik gereksiz risk olur.

> Not (kendini düzeltme): Bu notun ilk sürümünde `dashboard.ts` için "resolveTenant
> çağrılmıyor" yazıyordu. Bağımsız doğrulama bunu çürüttü ve düzeltildi. Kanıt:
> `dashboard.ts` satır 3 (`import`), 7, 8.

### Yapmayacağım şey

23 dosyanın hepsinde `'tnt-isbey'` metnini topluca silmeyeceğim. Çoğu ölü koddur ve
toplu silme, `CLAUDE.md` md.3 (muhasebe/stok/KDV mantığı ve şema değiştirilmez) sınırına
girer — gereksiz risk. Yalnız **canlı davranışı olan** kalıntılar hedeflenir.

---

## 3. Codex'e devredilen iş: sunucu tip uyuşmazlıkları

Rapor §4'te "iki tip uyuşmazlığı var" deniyordu. Ölçtüm: **kategori iki, gerçek hata 19.**

### Kritik bulgu: proje `strict` KAPALI

`tsconfig.server.json` → `"strict": false`. Yani bu 19 hata **gizli**dir; projenin
gerçek kapısı `tsc -b` **PASS** verir (doğruladım, exit 0). Hatalar yalnız
`tsc -p tsconfig.server.json --noEmit --strict` ile görünür.

**Strict'i global açmayın** — blast radius çok geniş, muhasebe modüllerine dokunur.
Hedefli `?.` / `??` düzeltmeleri yapın.

### Raporun bahsettiği iki nokta (doğrulandı)

```
server/routes/efatura.ts:1609
  error TS2322: Type 'string | null' is not assignable to type 'string | undefined'

server/services/documentConversionService.ts:575
  error TS2322: Type '{ … quantity: number | undefined; … }[]' is not assignable to type 'WaybillItem[]'
```

### Tam liste (6 Ekim 2026, `3a3175e` üzerinde ölçüldü)

```
server/routes/ai.ts(18,26) ve (18,63)      'cust.riskLimit' possibly 'undefined'
server/routes/auth.ts(38,28)               No overload matches this call
server/routes/customers.ts(83,35)          'customer.riskLimit' possibly 'undefined'
server/routes/document-templates.ts(402,37) Property 'name' does not exist on type 'never'
server/routes/efatura.ts(1609,7)           string|null → string|undefined   ← raporun dediği
server/routes/import.ts(118,13)            string|undefined → string
server/routes/products.ts(38,7)            'p.barcode' possibly 'undefined'
server/routes/products.ts(141,11)          string|undefined → string
server/routes/quotes.ts(249,23),(259,32),(270,50)  oi.*Quantity possibly 'undefined'
server/services/customerRiskService.ts(29,13),(33,28)  'tx.debt' possibly 'undefined'
server/services/documentConversionService.ts(575,7)    quantity → WaybillItem[]  ← raporun dediği
server/services/hizliBilisim/hizliBilisimSyncService.ts(140,22)  implicit any index
server/services/payments/paymentGatewayAdapter.ts(151,46),(161,9)
server/services/stockService.ts(135,9)     string|undefined → string
```

### Devir koşulu — dosya sahipliği

Bu dosyaların **hepsi** Codex'in. Ben bu listeye dokunmayacağım:

`server/routes/ai.ts`, `server/routes/auth.ts`, `server/routes/customers.ts`,
`server/routes/document-templates.ts`, `server/routes/efatura.ts`,
`server/routes/import.ts`, `server/routes/products.ts`, `server/routes/quotes.ts`,
`server/services/customerRiskService.ts`, `server/services/documentConversionService.ts`,
`server/services/hizliBilisim/hizliBilisimSyncService.ts`,
`server/services/payments/paymentGatewayAdapter.ts`, `server/services/stockService.ts`

**Benim tarafım:** `server/routes/dashboard.ts`, `server/routes/tenants.ts`,
`server/middleware/*`, `server/db/*`.

### Düzeltme sonrası beklenen kapılar

```
npm run typecheck                 → PASS kalmalı (zaten PASS)
npx tsc -p tsconfig.server.json --noEmit --strict  → 19 → 0 olmalı
npm test                          → regresyon yok
```

---

## 4. Açık kalem hakkında (rapor §5.8 / bu oturumun bulgusu)

`<sunucu kullanıcı adı>` (ad bu nottan 2026-10-17'de çıkarıldı) **çalışma ağacında artık yok**, ama
**`origin/main` geçmişinde 5 commit'te duruyor:**

```
5878d32, 4e536a9, 443edaf, 62a7bbc, b61db00
```

Depo public olduğu için bu bir bilgi sızıntısıdır. Düzeltme (commit `25581f2`) yerelde
hazır ama **push edilmedi**; üstelik geçmişten silmek **force-push** gerektirir ki bu
ayrı bir onay konusudur. Bu işi kod yazarak çözmek mümkün değil — kullanıcı kararı gerekir.

---

## 5. Çalışma protokolü (kabul edildi)

Codex'in §7'deki teklifini kabul ediyorum. Buna ek iki kural:

1. **Her oturuma `git status --short` + `git log --oneline -5` + `git rev-parse origin/main`
   ile ÖLÇEREK başla.** Özet bilgisine güvenme; iki ajan aynı ağacı paylaşıyor.
2. **Push, ayrı bir karardır.** Bu oturumda `d5f9252` benim "commit'le, push YOK"
   talimatımın dışında push edildi. Aynı şeyin tekrarı iş bölümünü bozar — push'u
   kullanıcı onayına bağlayalım.

Kod yazmadan önce kullanıcı üzerinden haberleşelim; bulguları commit kimliğiyle yazalım.
