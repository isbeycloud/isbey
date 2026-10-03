import type { CashRegister, DatabaseState } from '../db/schema';

/**
 * DÖVİZ KASASI YARDIMCISI (2026-10-03)
 * ═══════════════════════════════════════════════════════════════════════════
 * Döviz para biriminde düzenlenmiş alış faturaları için AYRI bir kasa tutar.
 *
 * ⚠️ NEDEN AYRI KASA: TRY dışı bir belgeyi TL kasasına bağlamak, kasa
 * bakiyesine "1.000 USD" ile "1.000 TL"yi aynı sayı olarak yazmak demektir —
 * iki farklı para birimi aynı toplamda erir. Her para biriminin kendi kasası
 * olursa bakiye karşılaştırması anlamlı kalır.
 *
 * ⚠️ ŞEMA DEĞİŞMEZ: `CashRegister.currency` alanı ZATEN VAR
 * (`db/schema.ts` — `currency: string`). Bu modül yeni alan açmaz, yeni tablo
 * yaratmaz; yalnız var olan alanı doğru kullanır. CLAUDE.md md.3 korunur.
 *
 * ⚠️ SALT YARDIMCI, YAN ETKİSİ AÇIK: `ensureCurrencyCashRegister` gerekirse
 * kasa OLUŞTURUR ve draft'a yazar. Çağıran taraf bunu bir `storage
 * .runTransaction` içinde yapmak zorundadır; aksi hâlde yazım diske düşmez.
 */

/** Desteklenen döviz para birimleri — belgede okunan kodlarla aynı küme. */
const DESTEKLENEN_DOVIZLER = ['USD', 'EUR', 'GBP'] as const;

/** Para birimini karşılaştırmaya hazırlar: `usd` / `USD` / `$` → `USD`. */
export function normalizeCurrency(raw: string | undefined): string {
  const t = (raw || '').trim().toUpperCase();
  if (t === '₺' || t === 'TL' || t === 'TRY' || t === '') return 'TRY';
  if (t === '$' || t === 'USD') return 'USD';
  if (t === '€' || t === 'EUR') return 'EUR';
  if (t === '£' || t === 'GBP') return 'GBP';
  return t;
}

/** TRY dışı ve kasa gerektiren bir para birimi mi? */
export function isForeignCurrency(raw: string | undefined): boolean {
  const c = normalizeCurrency(raw);
  return c !== 'TRY' && (DESTEKLENEN_DOVIZLER as readonly string[]).includes(c);
}

/** Kasa kodunda kullanılacak kısa para birimi etiketi. */
function currencyCode(currency: string): string {
  return normalizeCurrency(currency);
}

/**
 * Tenant'ın belirtilen para birimindeki kasasını döndürür; YOKSA OLUŞTURUR.
 *
 * Arama sırası:
 *   1. Aynı tenant + aynı para birimi + aktif kasa → varsa o kullanılır.
 *   2. Yoksa yeni kasa açılır (`isDefault: false` — varsayılan kasa TRY kalır).
 *
 * ⚠️ `isDefault` ASLA `true` OLMAZ: varsayılan kasa, döviz bilgisi olmayan tüm
 * eski çağrıların düştüğü yerdir. Döviz kasasını varsayılan yapmak, TRY
 * bekleyen akışları sessizce dövize kaydırırdı.
 *
 * TRY için yeni kasa AÇILMAZ — mevcut varsayılan/tenant kasası döner.
 */
export function ensureCurrencyCashRegister(
  draft: DatabaseState,
  tenantId: string,
  currency: string
): CashRegister {
  const hedef = normalizeCurrency(currency);

  if (!draft.cashRegisters) draft.cashRegisters = [];

  const tenantKaslari = draft.cashRegisters.filter(
    k => !k.tenantId || k.tenantId === tenantId
  );

  // ── TRY: mevcut varsayılan kasayı kullan, yeni kasa açma ────────────────
  if (hedef === 'TRY') {
    const mevcut =
      tenantKaslari.find(k => k.isDefault && k.active !== false) ||
      tenantKaslari.find(k => normalizeCurrency(k.currency) === 'TRY' && k.active !== false) ||
      tenantKaslari[0];
    if (mevcut) return mevcut;
    // Hiç kasa yoksa buraya düşülür — aşağıdaki döviz dalı TRY için de
    // kasa açar; TRY'de varsayılan işaretlenir.
  }

  // ── Aynı para biriminde kasa zaten var mı? ─────────────────────────────
  const varOlan = tenantKaslari.find(
    k => normalizeCurrency(k.currency) === hedef && k.active !== false
  );
  if (varOlan) return varOlan;

  // ── Yoksa aç ───────────────────────────────────────────────────────────
  const tenant = (draft.tenants || []).find(t => t.id === tenantId);
  const sirketAdi = tenant?.name || 'Şirket';
  const kod = currencyCode(hedef);
  const now = new Date().toISOString();

  // Kod çakışmasın: aynı tenant'ta KAS-USD varsa sonuna sayı eklenir.
  let finalCode = `KAS-${kod}`;
  let n = 2;
  while (tenantKaslari.some(k => k.code === finalCode)) {
    finalCode = `KAS-${kod}-${n}`;
    n += 1;
  }

  const yeni: CashRegister = {
    id: `cash-${tenantId}-${kod.toLowerCase()}`,
    tenantId,
    name: `${sirketAdi} ${kod} Kasası`,
    code: finalCode,
    isDefault: false,
    openingBalance: 0,
    balance: 0,
    currency: hedef,
    description: `${kod} para biriminde döviz kasası — ${kod} faturaları bu kasada izlenir.`,
    status: 'ACTIVE',
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  draft.cashRegisters.push(yeni);
  return yeni;
}

/**
 * Var olan döviz kasasını SALT-OKUNUR biçimde bulur; YOKSA OLUŞTURMAZ.
 *
 * ⚠️ NEDEN AYRI: `buildIngestionPlan` sözleşmesi gereği hiçbir şey yazmaz
 * (test bunu doğrular). Onay ekranı kullanıcıya "içeri alınırsa hangi kasaya
 * gider" bilgisini göstermek ZORUNDA — ama bunun için kasa açmak yan etki
 * olurdu. Bu fonksiyon tahmini künyeyi üretir; gerçek kasa ancak onayda,
 * transaction içinde açılır.
 */
export function previewCurrencyCashRegister(
  cashRegisters: CashRegister[],
  tenantId: string,
  currency: string
): { id: string; name: string; code: string; currency: string; exists: boolean } {
  const hedef = normalizeCurrency(currency);
  const tenantKaslari = (cashRegisters || []).filter(
    k => !k.tenantId || k.tenantId === tenantId
  );

  if (hedef === 'TRY') {
    const mevcut =
      tenantKaslari.find(k => k.isDefault && k.active !== false) ||
      tenantKaslari.find(k => normalizeCurrency(k.currency) === 'TRY' && k.active !== false) ||
      tenantKaslari[0];
    if (mevcut) {
      return {
        id: mevcut.id, name: mevcut.name, code: mevcut.code,
        currency: normalizeCurrency(mevcut.currency), exists: true,
      };
    }
  }

  const varOlan = tenantKaslari.find(
    k => normalizeCurrency(k.currency) === hedef && k.active !== false
  );
  if (varOlan) {
    return {
      id: varOlan.id, name: varOlan.name, code: varOlan.code,
      currency: hedef, exists: true,
    };
  }

  // Henüz yok — onayda otomatik açılacak. Ad, açılacak kasanın adıyla AYNI
  // kalıptan üretilir ki kullanıcı onaydan sonra farklı bir ad görmesin.
  const kod = currencyCode(hedef);
  return {
    id: '',
    name: `${kod} Kasası`,
    code: `KAS-${kod}`,
    currency: hedef,
    exists: false,
  };
}
