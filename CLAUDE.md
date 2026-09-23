# İŞBEY CLOUD ERP — Claude Proje Talimatları

Bu dosya, [ECC-main](computer://D:\İŞBEY\ECC-main\CLAUDE.md) koleksiyonundan (affaan-m/ECC) uyarlanan kuralları İŞBEY projesine uygular. Eski referans: everything-claude-code (arşiv).

## Proje Yapısı

```
İŞBEY/
├── src/           → React 19 + TypeScript + Vite frontend (SPA)
├── server/        → Express 5 + TypeScript backend (tsx watch)
├── .claude/       → Claude Code yapılandırması (bu entegrasyon)
├── .env           → Gerçek credential'lar (ASLA commit etme)
├── .env.example   → Şablon
├── everything-claude-code/ → Eski referans repo (arşiv)
└── ECC-main/      → AKTİF referans koleksiyon (agents 68 / commands 93 / rules 122 / skills 286)
```

## Kritik Proje Kuralları

### 1. Hızlı Bilişim Entegrasyonu (EN KRİTİK)
- **Canlı (production) Hızlı Bilişim kullanımı, tüm QA testleri PASS olmadan AÇILMAZ.**
- Credential'lar SADECE `.env`'den okunur — kaynak koda asla yazılmaz.
- API hatasında asla sahte/simüle başarılı response üretilmez; gerçek hata döndürülür.
- Test modu (`HIZLI_BILISIM_IS_TEST_MODE=true` + `econnecttest` URL) korunur; production (`econnect`) kullanımı ayrı bir onay fazından sonra olur.
- Kontör tüketen işlemler (belge gönderimi) test aşamasında çalıştırılmaz.

### 2. RBAC / Tenant İzolasyonu
- Tüm modül erişim kararları `src/utils/modulePermissions.ts` üzerinden alınır.
- Backend'de her route `requireAuth` + `requireRole`/`requirePermission` ile korunur; "sadece Sidebar gizlemek güvenlik değildir."
- Tenant A verisi Tenant B'ye sızmaz — IDOR koruması (`resolveTenant`, `isAccountantAuthorizedForTenant`) zorunludur.
- `requireAuth` içindeki `db.users[0]` fallback'i gibi "token yoksa ilk kullanıcı" mantığı YASAKTIR.

### 3. Muhasebe Mantığı Dokunulmaz
- Accounting / Stock / VAT / Cari / Cash / Bank mantığı ve DB şeması değiştirilmez.
- Dönem sonu bilanço değişmez: Aktif = Pasif + Öz Kaynak, Fark = 0,00 TL.

### 4. Güvenlik (repo rules/security.md uyarınca, İŞBEY uyarlaması)
- Commit öncesi: hardcode secret yok, input doğrulama var, auth/authz doğrulanmış, hata mesajları hassas bilgi sızmıyor.
- Secret'lar: `process.env` kullan; eksikse açıkça hata ver (fallback şifresi YASAK — bkz. `JWT_SECRET` fallback'i düzeltilmeli).
- `console.log` kullanma; `console.warn/error` geliştirme uyarıları için kabul edilebilir.

###  CLAUDE.md devam

## Çalışma Akışı (repo workflow'u uyarınca)

1. **Önce incele → planla → uygula → test et → raporla.** Hiçbir şeyin çalıştığını varsayma; gerçek çıktıyı gör.
2. Planlama: `.claude/agents/planner.md`, mimari kararlar: `architect.md`.
3. Kod incelemesi: `/code-review` komutu + `code-reviewer.md`; güvenlik incelemesi: `security-reviewer.md`.
4. Test: mevcut test dosyaları `server/tests/` altında; yeni testler aynı kalıbı izler.
5. Bir test başarısızsa raporda FAIL olarak işaretle — asla PASS diye gösterme.

## Komutlar (.claude/commands/)

| Komut | Amaç | Kaynak |
|-------|------|--------|
| /plan | Uygulama planı çıkar | everything-claude-code |
| /tdd | Test-önceli geliştirme | everything-claude-code |
| /code-review | Kalite + güvenlik incelemesi | everything-claude-code |
| /verify | Doğrulama döngüsü çalıştır | everything-claude-code |
| /build-fix | Build hatalarını çöz | everything-claude-code |
| /checkpoint | İlerleme durumunu kaydet | everything-claude-code |
| /security-scan | Secret/tenant/auth taraması + düzeltme planı | ECC-main (uyarlama) |
| /quality-gate | Değişen dosyalarda kalite kapısı kararı | ECC-main (uyarlama) |
| /pr | PR oluştur (template + analiz + güvenlik ön kontrolü) | ECC-main (uyarlama) |

## Agent Tanımları (.claude/agents/)

planner, architect, code-reviewer, security-reviewer, tdd-guide, build-error-resolver, e2e-runner, refactor-cleaner, doc-updater (everything-claude-code kökenli) · typescript-reviewer, react-reviewer, silent-failure-hunter, performance-optimizer, database-reviewer (ECC-main uyarlaması)

## Kurallar (.claude/rules/)

- `security.md` — hardcode secret yasak, auth zorunlu
- `testing.md` — TDD, kapsama hedefi
- `coding-style.md` — immutability, dosya organizasyonu
- `git-workflow.md` — commit formatı, PR süreci
- `performance.md` — model seçimi, bağlam yönetimi
- `agents.md` — alt-ajana ne zaman devredilir

## Dil & İletişim

Kullanıcıyla Türkçe konuş. Kod, değişken adları ve yorumlar İŞBEY'deki mevcut stile uysun (Türkçe açıklama satırları yaygın).

## Yasaklar

- Canlı Hızlı Bilişim'e belge göndermek (onay fazından önce)
- API response'u uydurmak / simüle etmek
- Mevcut muhasebe/stok/KDV mantığını değiştirmek
- Credential'ları kaynak koda yazmak
- Başarısız testi PASS göstermek
