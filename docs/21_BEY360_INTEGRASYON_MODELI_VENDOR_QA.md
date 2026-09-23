# İŞBEY — Bey360 (Hızlı Teknoloji) Entegrasyon Modeli — Satıcı Q&A Kaydı

**Tarih:** 2026-09-09 · **Kaynak:** Hızlı Teknoloji destek yazışması (Bey360 web servis) · **Durum:** RESMİ ÇERÇEVE — entegrasyon mimarisi buna göre sabitlenmiştir

---

## 1. Satıcının Resmi Cevapları (birebir özet)

| # | Soru | Satıcı Cevabı (özet) | İŞBEY Mimari Kararı |
|---|------|----------------------|---------------------|
| 1 | ApiKey ERP/iş ortağı seviyesinde tek mi? | **Evet.** `--apikey` Bey360 kullanan her firma için sabit/değişmez. | Tek ApiKey, `.env` → `HIZLI_BILISIM_API_KEY`. Kaynak koda yazılmaz. |
| 2 | SecretKey ne için? | **Yalnızca UtilEncrypt için 1 kez.** WS kullanıcı adı/şifre değişmediği sürece tekrar çağrılmaz. | UtilEncrypt sonucu (hashed username/password) cache'lenir; WS kimliği değişirse yeniden çağrılır. |
| 3 | Her mükellef/firma için ayrı WS kullanıcı adı/şifre mi? | **Evet.** portal.hizliteknoloji.com.tr → Ayarlar → Veritabanı Ayarları (en alt) → WS kullanıcı adı/şifre oluşturulur. | Firma bazlı WS kimliği: firma başına (tenant/company) ayrı WS kullanıcı adı + şifre saklanır. |
| #4 | Login'den dönen token firma bazlı mı? | **Evet.** Token, onu üreten kullanıcı adı+şifreye bağlıdır. | Firma bazlı token yönetimi zorunlu. |
| 5 | Aynı Bey360 hesabı altında birden fazla firma/şube? | **Encrypted username/password İŞBEY tarafında tekil** (firma için), şube için değişmez. | Firma başına 1 encrypted kimlik seti; şube ayrımı token içinde |
| 6 | Çok kullanıcılı firmada log sahipliği? | Log tercihi İŞBEY'e ait; kullanıcı bazlı log olabilir. | Bey360 işlem logları İŞBEY audit log'unda kullanıcı bazlı tutulur. |
| 7 | Token süresi? | **Şu an 1 gün (24 saat).** Yenileme için tekrar Login yeterli; 24 saat üzerinden kurgulayın. | Token 24h TTL + süre bitiminde yeniden Login (UtilEncrypt tekrar EDİLMEZ — hashed creds cache'ten). |
| 8 | Canlı ortam farkı? | **Yalnızca base URL**: `econnecttest` → `econnect` (4 harf). ApiKey/SecretKey yapısı aynı. | Mevcut `getBaseUrl(isTest)` tasarımı doğru. TEST mod kilidi korunur (CLAUDE.md değişmez kuralı). |
| 9 | e-Fatura mükellefiyeti başlatma? | Beyoğlu Teknoloji altında e-Fatura/e-Arşiv hizmet sözleşmesi imzalanması entegratör + GİB açılışını başlatır. | Onboarding akışına "hizmet sözleşmesi imza" adımı notu. |
| 10 | Çoklu mükellef için önerilen model? | **Her firmanın token'ı değişken olarak saklanmalı**; token firma bazlıdır. | Firma bazlı token registry (bkz. §3). |

## 2. Doğrulanan Mimari Karar (Plan ↔ Satıcı Uyumu)

Planladığımız yapı satıcı tarafından **doğrulandı**:

```
ApiKey                  → ERP/iş ortağı (Bey360) seviyesinde, TANIM
SecretKey               → yalnızca backend, yalnızca UtilEncrypt (ilk kurulum / WS kimliği değişince)
Encrypted username/pw   → MÜKELLEF/FİRMA bazlı (şube fark etmez)
JWT token               → MÜKELLEF/FİRMA bazlı (24h TTL)
İşlem logları           → İŞBEY tarafında kullanıcı bazlı
```

## 3. Kod Etkisi (mevcut durum → hedef)

**GÜNCELLEME 2026-09-09 (oturum 2):** 🔴 kalemler uygulandı; aşağıda güncel durum.

| Konu | Eski kod | Uygulanan çözüm | Durum |
|------|-----------|----------------|-------|
| Token deposu | `hizliConnectService.ts` tek global `tokenStore` | **`server/services/hizliTenantCredentialRegistry.ts`** — firma bazlı hashed-cred + token cache (24h TTL, 20h proaktif yenileme, fail-closed kimlik çözümleme) | ✅ KOD TAMAM |
| Provider zinciri | `hizliTeknolojiProvider` global ensureToken kullanıyordu | Tüm metodlar `ensureTenantToken(settings)` ile kendi firmasının token'ını kullanıyor; ayrıca latent alan-uyumsuzlukları düzeltildi (`checkGibUser` → `isEInvoiceUser/aliasPk/aliasGb`; XML gönderimleri tutarlı `sendDocument` yoluna alındı) | ✅ KOD TAMAM |
| WS kimliği kaynağı | yalnızca env | `resolveTenantWsCredentials`: 1) TenantEinvoiceSettings.username+encryptedPassword (firma bazlı), 2) env fallback (kendi firmamız), 3) yoksa HATA — sahte kimlik yok | ✅ KOD TAMAM |
| UtilEncrypt cache | her authenticate'te tekrar | Parmak izi (SHA-256) ile WS kimliği değişmedikçe ATLANIR (satıcı: "1 kez yeterli"); ayar güncellemesinde `invalidateTenant` tetiklenir | ✅ KOD TAMAM |
| Token TTL | 24h (JWT exp) | Aynı + 20h proaktif yenileme tamponu; başarısız login'de bayat token cache'ten silinir | ✅ KOD TAMAM |
| efatura.ts (kendi firmamız) | global tokenStore | **Dokunulmadı** — env kaynağı tokenStore'u senkronize ettiği için mevcut akış aynı davranışı sürdürür | 🟡 Davranış korunuyor |
| Base URL | econnecttest/econnect ✅ | Aynı (yalnız 4 harf fark) | ✅ UYUM |
| Test modu kilidi | `HIZLI_BILISIM_IS_TEST_MODE=true` + QA kapısı | Aynı — canlıya geçiş ayrı onay fazı; cache anahtarı test/prod'u ayırır (`tenantId:test` / `tenantId:prod`) | ✅ UYUM (değişmez kural) |
| Log sahipliği | audit log userId | Kullanıcı bazlı audit log (mevcut altyapı yeterli) | 🟢 DÜŞÜK |

**Kalan notlar:** (1) Registry koşusuz yazıldı — VM döndüğünde tsc + regresyon kanıtı zorunlu. (2) `efatura.ts`'in kendi-firmamız akışı ileride aynı registry'ye taşınabilir (tek giriş noktası için).

## 4. Güvenlik Notları (değişmez kurallarla uyum)

1. **WS kullanıcı adı/şifresi yalnızca `.env` / DB (şifreli)** — kaynak koda yazılmaz. (CLAUDE.md §1)
2. UtilEncrypt/Login hata durumunda **sahte başarılı response üretilmez** (CLAUDE.md §1).
3. Kontör tüketen işlemler (belge gönderimi) test aşamasında **çalıştırılmaz**.
4. Canlı `econnect` URL'i, tüm QA PASS + onay fazından önce **açılmaz**.
5. Token, firma A adına firma B verisi çekmek için kullanılamaz — her belge gönderimi firma bazlı token ile imzalanır (tenant izolasyonu).

## 5. Kullanıcı Tarafından Paylaşılan Kimlik Bilgileri (HASSAS — commit YASAK)

Kullanıcı yazışmada WS kimlik bilgilerini paylaşmıştır (WS Kullanıcı Adı: admin_008632...). Bu bilgiler:
- **YALNIZCA `.env` dosyasına** yazılacaktır (kaynak koda, dokümana, commit'e ASLA).
- docs/21'e ve hiçbir repo dosyasına kopyalanmaz.
- Bu satırın altında kimlik bilgisi saklanmaz.
