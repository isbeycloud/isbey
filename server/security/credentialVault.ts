/**
 * İŞBEY CLOUD — KİMLİK BİLGİSİ KASASI (credential vault)
 * ======================================================
 * NEDEN VAR:
 * Hızlı Bilişim bayilik duyurusu (2026-09-14) güvenlik notunda açıkça şunu ister:
 *
 *   "secretKey, username ve password bilgileri localde, uygulama dosyalarında,
 *    istemci tarafında veya log kayıtlarında saklanmamalıdır."
 *
 * Öncesinde:
 *   - `TenantEinvoiceSettings.encryptedPassword` / `apiKeyEncrypted` /
 *     `apiSecretEncrypted` alanları isimlerine rağmen ŞİFRELEME değil,
 *     YALNIZCA base64 kodlama yapıyordu (`Buffer.from(x).toString('base64')`).
 *     base64 geri döndürülebilir bir KODLAMADIR — gizlilik sağlamaz.
 *   - `DealerCustomer.portalCredentials.wsPassword` ise DÜZ METİN saklanıyordu.
 *
 * Yani `data/database.json` ele geçtiğinde (yedek dosyası, erişim hatası) tüm
 * firma web servis şifreleri tek satırla düz metne dönüyordu.
 *
 * TASARIM:
 *   - AES-256-GCM (kimlik doğrulamalı şifreleme; CBC değil — GCM bozulmayı da
 *     yakalar, yani kripto metin kurcalanırsa çözme HATA verir, sessizce yanlış
 *     düz metin üretmez).
 *   - Açık/kapalı ayrımı DEĞİL, TAKMA-ÇIKAR ayrımı: `enc:v1:<iv>:<tag>:<ct>`
 *     biçiminde etiketlenir. Etiketsiz (eski) değerler "legacy" sayılır ve
 *     okunabilir — mevcut kurulum tek satır veri kaybetmez.
 *   - Anahtar: `CREDENTIAL_ENCRYPTION_KEY` (32 bayt, base64/hex) →
 *     yoksa `JWT_SECRET`'ten HKDF ile TÜRETİLİR. Böylece yeni env gerektirmeden
 *     çalışır; ama ayrı anahtar vermek (prod'da önerilir) rotasyonu kolaylaştırır.
 *   - Anahtar hiç yoksa: JWT_SECRET de yoksa zaten authGuards açılışta hata
 *     fırlatır. Bu modülde anahtar yoksa `encrypt` DÜZ METİN yazmaz — açık hata
 *     fırlatır (fail-closed). `decrypt` ise etiketsiz değeri legacy kabul eder.
 *
 * UYUMLULUK:
 *   - Yeni yazılan değerler `enc:v1:` etiketlidir.
 *   - Eski `enc:*` olmayan değerler önce "gizli anahtar karışımı var mı" diye
 *     denenir; yoksa legacy kabul edilir. Bu, gerçek bir şifreleme değeri
 *     ile base64'ü birbirinden ayıramaz — bu yüzden `isEncrypted()` ile
 *     DURUM RAPORLANABİLİR (kaç kayıt hâlâ legacy).
 *
 * GÜVENLİK: Bu dosya anahtarı yalnızca bellekte tutar; log'a hiçbir kimlik
 * bilgisi veya anahtar materyali yazmaz.
 */

import crypto from 'crypto';

// ─── Etiket ve sabitler ──────────────────────────────────────────────────────

/** Kripto metin öneki — sürüm ile birlikte. Etiketsiz her değer legacy'dir. */
const PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;  // GCM için önerilen 96 bit
const KEY_LENGTH = 32; // AES-256
const TAG_LENGTH = 16;

/** HKDF info etiketi — JWT_SECRET'ten türetimde alan ayrımı için */
const HKDF_INFO = 'isbey-credential-vault-v1';
const HKDF_SALT = 'isbey-credential-vault-salt-v1';

// ─── Anahtar yönetimi ────────────────────────────────────────────────────────

let cachedKey: Buffer | null = null;

/**
 * Base64 veya hex olarak verilen bir anahtar dizesini 32 bayta normalize eder.
 * Uzunluk uymuyorsa `null` döner (sessizce kırpılmaz — kırpma anahtarı zayıflatır).
 */
function parseKeyMaterial(raw: string): Buffer | null {
  const value = raw.trim();
  if (!value) return null;

  // Önce base64, sonra hex dene — ikisi de 32 bayta çözülmeli.
  const candidates: Buffer[] = [];
  try {
    const b = Buffer.from(value, 'base64');
    if (b.length === KEY_LENGTH) candidates.push(b);
  } catch { /* base64 değil */ }
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    candidates.push(Buffer.from(value, 'hex'));
  }
  return candidates.length > 0 ? candidates[0] : null;
}

/**
 * Kasa anahtarını çözer.
 *   1) CREDENTIAL_ENCRYPTION_KEY (32 bayt base64/hex) — tercih edilen
 *   2) JWT_SECRET'ten HKDF-SHA256 türetimi — kurulum kolaylığı
 * Döner: 32 baytlık anahtar veya `null` (hiçbir kaynak yoksa).
 */
function getVaultKey(): Buffer | null {
  if (cachedKey) return cachedKey;

  const explicit = process.env.CREDENTIAL_ENCRYPTION_KEY || '';
  const parsed = parseKeyMaterial(explicit);
  if (parsed) {
    cachedKey = parsed;
    return cachedKey;
  }

  if (explicit && !parsed) {
    // Anahtar verilmiş ama 32 bayta çözülmüyor → sessizce JWT_SECRET'e DÜŞÜLMEZ.
    // Düşülseydi, yanlış yapılandırılmış bir anahtar fark edilmeden eski anahtarla
    // şifreleme yapılır ve sonraki düzeltmede kayıtlar okunamaz hâle gelirdi.
    throw new Error(
      'CREDENTIAL_ENCRYPTION_KEY tanımlı ancak 32 bayta çözümlenemedi. ' +
      'Değer base64 (44 karakter) ya da hex (64 karakter) olmalıdır.'
    );
  }

  const jwtSecret = process.env.JWT_SECRET || '';
  if (jwtSecret) {
    cachedKey = Buffer.from(
      crypto.hkdfSync('sha256', Buffer.from(jwtSecret, 'utf8'), Buffer.from(HKDF_SALT, 'utf8'), Buffer.from(HKDF_INFO, 'utf8'), KEY_LENGTH)
    );
    return cachedKey;
  }

  return null;
}

/**
 * Test/diagnostik: kasa kullanılabilir mi? Anahtar materyali İÇERMEZ.
 *
 * ⚠️ Bu bir TEŞHİS fonksiyonudur ve HİÇBİR KOŞULDA HATA FIRLATMAZ. Bozuk bir
 * `CREDENTIAL_ENCRYPTION_KEY` durumunda `getVaultKey()` hata fırlatır (ki
 * şifreleme/çözme yollarında bu doğrudur — sessizce yanlış anahtara düşmesini
 * istemiyoruz); ancak teşhis çağıran taraf bu hatayı yakalayamazsa "kasa durumu
 * nedir?" sorusu uygulamayı çökertirdi. Bu yüzden burada yutulur ve
 * `keySource: 'misconfigured'` ile AÇIKÇA raporlanır — 'none' demek yanıltıcı
 * olurdu (anahtar VAR, yalnız geçersiz).
 */
export function vaultStatus(): {
  available: boolean;
  keySource: 'CREDENTIAL_ENCRYPTION_KEY' | 'JWT_SECRET-derived' | 'misconfigured' | 'none';
} {
  try {
    const derived = getVaultKey();
    if (!derived) return { available: false, keySource: 'none' };
    return {
      available: true,
      keySource: parseKeyMaterial(process.env.CREDENTIAL_ENCRYPTION_KEY || '')
        ? 'CREDENTIAL_ENCRYPTION_KEY'
        : 'JWT_SECRET-derived',
    };
  } catch {
    // Tek fırlatma noktası: `CREDENTIAL_ENCRYPTION_KEY` tanımlı ama 32 bayta
    // çözümlenemiyor. "Hiç kaynak yok" durumu yukarıda `!derived` ile yakalanır,
    // buraya DÜŞMEZ — yani 'misconfigured' gerçekten "var ama geçersiz" demektir.
    return { available: false, keySource: 'misconfigured' };
  }
}

// ─── Şifreleme / çözme ───────────────────────────────────────────────────────

/**
 * Bir kimlik bilgisini şifreler: `enc:v1:<iv b64>:<tag b64>:<ct b64>`.
 *
 * Boş/undefined girdi olduğu gibi döner (boş şifre şifrelenmez — "tanımsız"
 * ile "boş" ayrımı korunur; aksi hâlde base64'lenmiş boş dize yazılırdı).
 *
 * ⚠️ Anahtar yoksa AÇIK HATA fırlatır. Düz metne düşmek kasıtlı olarak
 * engellenmiştir — sessiz düz metin yazımı tam da bu modülün önlemek istediği
 * şeydir.
 */
export function encryptSecret(plaintext: string | undefined | null): string | undefined {
  if (plaintext === undefined || plaintext === null || plaintext === '') return undefined;

  const key = getVaultKey();
  if (!key) {
    throw new Error(
      'Kimlik bilgisi şifrelenemez: kasa anahtarı yok. ' +
      'CREDENTIAL_ENCRYPTION_KEY tanımlayın veya JWT_SECRET (zorunlu) mevcut olsun.'
    );
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/** Değer bu kasanın ürettiği biçimde mi? */
export function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/**
 * Etiketsiz (eski) bir kaydın hangi biçimde yazıldığına dair ipucu.
 *
 *   'base64'    → alan eskiden `Buffer.from(x).toString('base64')` ile yazılıyordu
 *                 (`encryptedPassword`, `apiKeyEncrypted`, `apiSecretEncrypted`)
 *   'plaintext' → alan eskiden DÜZ METİN yazılıyordu
 *                 (`DealerCustomer.portalCredentials.wsPassword`)
 *   'auto'      → sezgisel (bkz. aşağıdaki uyarı) — varsayılan
 *
 * ⚠️ 'auto' VARSAYILANI TEHLİKELİDİR ve yalnızca biçimi bilinmeyen kayıtlar
 * içindir. Neden: tamamen base64 alfabesinden oluşan, uzunluğu 4'ün katı olan ve
 * base64 çözümü GEÇERLİ UTF-8 veren DÜZ METİN bir şifre sezgisel yolda base64
 * sanılıp çözülür. Örnek: `TWFu` → `Man`. Bu, gerçek şifreyi KALICI olarak
 * değiştirir. (Her değer etkilenmez: `Test2024`'ün base64 çözümü geçersiz UTF-8
 * olduğu için tur kontrolüne takılır ve korunur — tuzak dardır ama gerçektir.)
 * Bu yüzden alanın eski biçimini BİLEN her çağrı ipucunu AÇIKÇA geçmelidir.
 */
export type LegacyEncodingHint = 'auto' | 'base64' | 'plaintext';

/**
 * Bir kimlik bilgisini çözer. Üç yol:
 *   1) `enc:v1:` etiketli → gerçek AES-256-GCM çözme.
 *      - Anahtar yoksa veya tag doğrulanamazsa AÇIK HATA (sessiz '' DÖNMEZ —
 *        yanlış anahtarla boş şifre üretip kimlik doğrulamasını "başarısız
 *        giriş" gibi göstermek hata ayıklamayı imkânsız kılardı).
 *   2) Etiketsiz → legacy kabul edilir; `hint`'e göre çözülür (bkz. LegacyEncodingHint).
 *   3) Boş/undefined → `''`.
 */
export function decryptSecret(
  value: string | undefined | null,
  hint: LegacyEncodingHint = 'auto'
): string {
  if (value === undefined || value === null || value === '') return '';

  if (isEncrypted(value)) {
    const key = getVaultKey();
    if (!key) {
      throw new Error(
        'Şifreli kimlik bilgisi çözülemez: kasa anahtarı yok ' +
        '(CREDENTIAL_ENCRYPTION_KEY veya JWT_SECRET gerekli).'
      );
    }
    const parts = value.slice(PREFIX.length).split(':');
    if (parts.length !== 3) {
      throw new Error('Şifreli kimlik bilgisi biçimi bozuk (beklenen iv:tag:ciphertext).');
    }
    const [ivB64, tagB64, ctB64] = parts;
    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
      const plain = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]);
      return plain.toString('utf8');
    } catch {
      // GCM kimlik doğrulaması başarısız → yanlış anahtar VEYA kurcalanmış kayıt.
      // Sessizce '' dönmek yerine açık hata: aksi hâlde "şifre boş" gibi görünür.
      throw new Error(
        'Şifreli kimlik bilgisi çözülemedi (yanlış kasa anahtarı veya kayıt bozulmuş).'
      );
    }
  }

  // Legacy yol — etiketsiz kayıtlar
  return decodeLegacy(value, hint);
}

/**
 * Etiketsiz (eski) kayıt çözümü. Şifreleme DEĞİL, yalnız geriye dönük okuma.
 *
 * `hint` alanın eski biçimini AÇIKÇA söyler; 'auto' sezgiseldir ve yalnızca
 * biçim bilinmiyorken kullanılmalıdır (bkz. LegacyEncodingHint uyarısı).
 */
function decodeLegacy(value: string, hint: LegacyEncodingHint): string {
  if (hint === 'plaintext') return value;

  if (hint === 'base64') {
    // Çağıran biçimi biliyor — sezgiye gerek yok.
    try {
      const decoded = Buffer.from(value, 'base64').toString('utf8');
      // Değer geçerli base64 DEĞİLSE (yorumlayıcı çöp ürettiyse) kaydı bozmak
      // yerine olduğu gibi döndür: eksik veri, kayıp veriden iyidir.
      if (Buffer.from(decoded, 'utf8').toString('base64').replace(/=+$/, '') === value.replace(/=+$/, '')) {
        return decoded;
      }
    } catch { /* base64 değil */ }
    return value;
  }

  // 'auto' — sezgisel. Base64 alfabesi: A-Z a-z 0-9 + / =
  // Bunun dışında karakter varsa düz metin kabul edilir.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    return value;
  }
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    // Base64 çözümü geçerli UTF-8 ürettiyse onu kullan; aksi hâlde düz metin kabul et.
    if (decoded && Buffer.from(decoded, 'utf8').toString('base64').replace(/=+$/, '') === value.replace(/=+$/, '')) {
      return decoded;
    }
  } catch { /* düz metin */ }
  return value;
}

/**
 * Tek seferlik migrasyon: etiketsiz bir değeri yeni şifreli biçime çevirir.
 * Zaten şifreliyse dokunmaz (idempotent). Boşsa `undefined` döner.
 *
 * ⚠️ `hint` MUTLAKA doğru verilmelidir — yanlış ipucu kaydı bozar. Bu yüzden
 * varsayılanı 'auto' bile değil, AÇIKÇA istenir.
 */
export function migrateLegacyValue(
  value: string | undefined | null,
  hint: LegacyEncodingHint
): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (isEncrypted(value)) return value;
  return encryptSecret(decodeLegacy(value, hint));
}

/** Bir değerin hâlâ legacy (etiketsiz) olup olmadığını söyler — rapor için. */
export function isLegacyValue(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0 && !isEncrypted(value);
}

/** Test amaçlı: anahtar önbelleğini boşalt (env değişikliğinden sonra). */
export function resetVaultKeyCache(): void {
  cachedKey = null;
}
