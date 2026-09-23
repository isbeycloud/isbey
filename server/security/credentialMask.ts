/**
 * İŞBEY CLOUD — Kimlik bilgisi maskeleme (response sanitizasyonu)
 * ===============================================================
 *
 * NEDEN VAR:
 *   2026-09-15 tespiti: `server/routes/hizli-bilisim.ts` içinde birkaç uç,
 *   `db.hizliBilisimSettings` nesnesini ya da `apiKey` alanını OLDUĞU GİBİ
 *   frontend'e döndürüyordu. Guard'lar yerinde olduğu için bu bir yetkisiz
 *   erişim değildi; ama her yetkili yanıt, canlı entegratör anahtarını düz
 *   metin olarak tarayıcıya taşıyordu. Frontend bu değere ihtiyaç duymuyor
 *   ("ayarlı mı?" bilgisi yeterli). Gereksiz secret dağıtımı; XSS, tarayıcı
 *   eklentisi, log ve telemetri ile sızabilir.
 *
 * TASARIM İLKESİ — İKİ TARAFLI OLMAK ZORUNDA:
 *   Maskeleme tek başına yapılırsa YENİ bir hata doğurur: GET maskeli döner,
 *   frontend aynı nesneyi PUT ile geri gönderirse `'****'` gibi bir sentinel
 *   gerçek anahtarın ÜZERİNE YAZILIR ve anahtar SİLİNİR. Bu yüzden bu dosya
 *   iki yönlü çalışır: `maskSecretField` (çıkış) ve `resolveSecretField`
 *   (giriş). İkisi birlikte kullanılmalıdır.
 *
 * KASADAN FARKI:
 *   Bu modül şifreleme yapmaz. `credentialVault` veriyi DİSKTE korur; bu
 *   modül AĞDA korur. İkisi birbirinin yerine geçmez, birlikte gerekir.
 */

/** Maskeleme yerine geçen sentinel. Frontend bu değeri geri gönderirse
 *  "değiştirme" olarak yorumlanır — gerçek anahtar korunur. */
export const MASKED_SECRET = '****';

/**
 * Bir secret alanını çıkış için maskeler.
 *
 * @param value     Gerçek değer (varsa).
 * @returns         Değer varsa `MASKED_SECRET`, yoksa `''`.
 *                  Değerin kendisi veya uzunluğu ASLA dönmez.
 */
export function maskSecretField(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return '';
  return MASKED_SECRET;
}

/**
 * Gelen (PUT/POST) değeri yorumlar ve yazılacak gerçek değeri döndürür.
 *
 * Karar tablosu:
 *   - `undefined`            → alan hiç gönderilmedi  → `undefined` (mevcut korunur)
 *   - `MASKED_SECRET`        → kullanıcı dokunmadı    → `undefined` (mevcut korunur)
 *   - `''` / boşluk          → açıkça temizleme       → `undefined` (mevcut korunur)
 *     (boş string'i "sıfırla" saymak, kaydetmeyi unutan bir formun anahtarı
 *      silmesine yol açardı; güvenli taraf mevcut değeri korumaktır)
 *   - başka bir string       → yeni değer             → değerin kendisi
 *
 * @param incoming  İstek gövdesinden gelen değer.
 * @param current   DB'deki mevcut değer (korunacak).
 * @returns         Yazılacak gerçek değer.
 */
export function resolveSecretField(incoming: unknown, current: unknown): string | undefined {
  const mevcut = typeof current === 'string' && current.length > 0 ? current : undefined;

  // Alan hiç gönderilmedi → dokunma
  if (incoming === undefined || incoming === null) return mevcut;

  // Sentinelsiz string
  if (typeof incoming !== 'string') return mevcut;

  // "Değiştirmedim" sinyali → mevcut korunur
  if (incoming === MASKED_SECRET) return mevcut;

  // Boş değer → mevcut korunur (yanlışlıkla silmeye karşı güvenli taraf)
  if (incoming.trim().length === 0) return mevcut;

  // Gerçek yeni değer
  return incoming;
}

/**
 * Bir nesnedeki secret alanlarını çıkış için maskeler; nesneyi MUTASYONA
 * UĞRATMAZ (yeni nesne döner — coding-style.md immutability kuralı).
 *
 * @param source  Kaynak nesne (ör. `db.hizliBilisimSettings`).
 * @param fields  Maskelenecek alan adları (ör. `['apiKey','apiSecret']`).
 * @param extras  Maskelenen her alan için eklenecek boolean alanlar.
 *                Örn. `apiKey` → `hasApiKey: true/false` (frontend "ayarlı mı"
 *                bilgisini bundan alır; değeri görmez).
 */
export function maskSecretFields<T extends Record<string, any>>(
  source: T | undefined | null,
  fields: string[],
  extras: Record<string, (has: boolean) => unknown> = {},
): Record<string, any> {
  if (!source || typeof source !== 'object') return {};

  const sonuc: Record<string, any> = { ...source };
  for (const alan of fields) {
    const varMi = typeof source[alan] === 'string' && source[alan].length > 0;
    sonuc[alan] = maskSecretField(source[alan]);
    for (const [ekAlan, uret] of Object.entries(extras)) {
      // Ek alan adı, maskelenen alanın kendisinden türetilir: apiKey → hasApiKey
      if (ekAlan.toLowerCase().includes(alan.toLowerCase())) {
        sonuc[ekAlan] = uret(varMi);
      }
    }
  }
  return sonuc;
}

/** `hizliBilisimSettings` için hazır maskeleme — çağrı yerlerinde tutarlılık. */
export function maskHizliBilisimSettings(settings: Record<string, any> | undefined | null): Record<string, any> {
  return maskSecretFields(settings, ['apiKey', 'apiSecret', 'wsPassword', 'password'], {
    hasApiKey: (has) => has,
    hasApiSecret: (has) => has,
    hasWsPassword: (has) => has,
  });
}

/** Tarayıcıya dönmemesi gereken alan adları — genel amaçlı süzgeç. */
const YASAKLI_ALANLAR = [
  'apikey', 'apisecret', 'apisecretkey', 'secretkey', 'wsPassword', 'password',
  'passwordhash', 'token', 'accesstoken', 'refreshtoken', 'authorization',
  'clientsecret', 'privatekey', 'credential', 'credentials',
].map(a => a.toLowerCase());

/**
 * Bir nesneyi DERİN olarak tarayıp secret alanlarını maskeler.
 *
 * Neden derin: iç içe `edonusumConfig`, `portalCredentials`, `portalConfig`
 * gibi yapılar tek seviyeli maskelemeden kaçar. Beyaz liste yerine kara liste
 * kullanılır; yeni bir secret alanı eklenirse süzgeç onu da yakalar.
 *
 * DİKKAT: Diziler körlemesine korunur (kullanıcı listeleri, faturalar vb.
 * bozulmasın diye) ancak elemanları da taranır.
 */
export function redactSecretsDeep(input: any, derinlik = 0): any {
  if (derinlik > 8) return input; // döngü/derinlik güvenliği
  if (input === null || input === undefined) return input;
  if (Array.isArray(input)) return input.map(x => redactSecretsDeep(x, derinlik + 1));
  if (typeof input !== 'object') return input;

  const cikti: Record<string, any> = {};
  for (const [k, v] of Object.entries(input)) {
    if (YASAKLI_ALANLAR.includes(k.toLowerCase()) && typeof v === 'string' && v.length > 0) {
      cikti[k] = MASKED_SECRET;
    } else {
      cikti[k] = redactSecretsDeep(v, derinlik + 1);
    }
  }
  return cikti;
}
