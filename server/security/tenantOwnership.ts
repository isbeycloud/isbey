/**
 * İŞBEY CLOUD — TENANT SAHİPLİĞİ TEK KAYNAK (2026-10-17)
 * =====================================================
 * Neden var: `cash.ts`, `banks.ts`, `dashboard.ts` ve `products.ts` içindeki
 * sahiplik filtreleri kayıt KİMLİĞİ dizesine bakıyordu:
 *
 *   c.id.includes(tenantId) || tenantId === 'tnt-isbey' || c.isDefault
 *   !t.cashRegisterId.startsWith('cash-tnt-')
 *
 * Bu iki nedenle YANLIŞ:
 *   1. `id.includes(tenantId)` yalnız bootstrap kasa/deposunda
 *      (`cash-<tenantId>-default`) doğru çalışır. `POST /api/v1/cash`
 *      (`cash-<Date.now()>`) veya `companies.ts` (`cash-<Date.now()>`) ile
 *      açılan kayıt kimlikte tenant taşımaz → sahiplik kaybolur.
 *   2. `!id.startsWith('cash-tnt-')` bir "eski veri" varsayımıdır. Bu önek
 *      TAŞIMAYAN her kayıt "eski veri" sayılır ve HER firmaya görünür — yani
 *      yeni firmaların kendi kasaları da dâhil tüm firmalara açılır.
 *   Sonuç: A firmasının kasa/banka hareketleri B firmasının token'ı ile
 *   okunabiliyordu (IDOR) ve `POST /api/cash/transaction` yabancı kasanın
 *   bakiyesini değiştirebiliyordu (yazma IDOR'u).
 *
 * Kural (tek doğru kaynak): sahiplik AÇIK ALANDAN okunur.
 *   tenantId DOLU  → yalnız o tenant
 *   tenantId BOŞ   → yalnız varsayılan `tnt-isbey` (eski veri ana firmada kalır)
 * Kimlik dizesi ASLA sahiplik kanıtı değildir.
 *
 * NOT: Depo (`warehouse`) kayıtlarında `tenantId` alanı ŞEMADA YOKTUR (bkz.
 * `Warehouse`); depo sahipliği ayrı bir iştir ve bu modülün kapsamı dışındadır.
 */
import type { DatabaseState } from '../db/schema';

/** Eski (tenantId alanı boş) verinin ait olduğu varsayılan firma. */
export const DEFAULT_TENANT_ID = 'tnt-isbey';

/** Sahiplik alanı taşıyan her kayıt için ortak biçim. */
export interface TenantOwned {
  id?: string;
  tenantId?: string;
  companyId?: string;
}

/**
 * GEÇİŞ (2026-10-17): `tenantId` alanı eklenmeden ÖNCE üretilmiş bootstrap
 * kayıtlarının kimlik biçimleri. Bunlar `tenantId` alanı boş olduğu için
 * "varsayılan firma" sayılırdı ve kendi firmasının kullanıcısı kendi kasasını
 * kaybederdi. Kimlik TAM EŞLEŞME ile okunur — `includes()` DEĞİL: tam eşleşme
 * başka firmaya sızamaz (kritik fark).
 */
const LEGACY_BOOTSTRAP_ID = /^(cash|bnk|wh)-(.+?)-(default|usd|eur)$/;

/** Geçiş kaydının sahibi tenant kimliği (yoksa null). */
function legacyBootstrapOwner(id: string | undefined): string | null {
  const match = id ? LEGACY_BOOTSTRAP_ID.exec(id) : null;
  return match ? match[2] : null;
}

/**
 * Kayıt verilen tenant'a mı ait?
 *
 * Sıra: `tenantId` → `companyId` → geçiş bootstrap kimliği → varsayılan firma.
 * Kimlik dizesi YALNIZ tam eşleşmeli geçiş kalıbında dikkate alınır; genel
 * `includes()`/`startsWith()` asla sahiplik kanıtı sayılmaz.
 */
export function isOwnedBy(record: TenantOwned | null | undefined, tenantId: string): boolean {
  if (!record) return false;
  const explicit = record.tenantId || record.companyId;
  if (explicit) return explicit === tenantId;
  const legacyOwner = legacyBootstrapOwner(record.id);
  if (legacyOwner) return legacyOwner === tenantId;
  return tenantId === DEFAULT_TENANT_ID;
}

/** Kayıt kümesini tenant'a göre süzer (yalnız sahiplik — kapsam filtresi AYRI iştir). */
export function filterOwned<T extends TenantOwned>(records: T[] | undefined, tenantId: string): T[] {
  return (records || []).filter(r => isOwnedBy(r, tenantId));
}

/**
 * Yazma yolunda kasa/banka gibi bir kaynağın HEDEFLENEBİLİR olduğunu doğrular.
 *
 * IDOR koruması: istek sahibi yalnız KENDİ firmasının kaynağına yazabilir.
 * Kayıt yoksa ve başka firmanın kaydı ise aynı 404 döner (varlık sızdırılmaz).
 */
export function isWritableBy(record: TenantOwned | null | undefined, tenantId: string): boolean {
  return isOwnedBy(record, tenantId);
}

/**
 * Yeni yazılan kayıtlara konacak sahiplik alanları.
 *
 * Yazma yollarının `tenantId` ATAMAMASI bu açığın ikinci yarısıydı: alan boş
 * kalan kayıt "eski veri" sayılıp varsayılan firmada birikiyordu. Yeni kayıtlar
 * her zaman açık sahiplikle yazılır.
 */
export function ownedFields(tenantId: string): { tenantId: string; companyId: string } {
  return { tenantId, companyId: tenantId };
}

/**
 * Hareket kayıtlarında sahiplik EBEVEYN üzerinden de çözülebilir.
 *
 * Neden: `POST /api/cash/transaction` geçmişte `tenantId` ATAMIYORDU; bu
 * kayıtların sahipliği yalnız bağlı oldukları kasa/banka hesabından
 * anlaşılabilir. Yalnız `tenantId` alanına bakılsaydı kendi hareketler
 * "eski veri" sayılıp yanlış firmaya düşerdi.
 *
 * Öncelik yine AÇIK ALANDADIR; ebeveyn yalnız alan boşken devreye girer.
 */
export function isOwnedByParent<T extends TenantOwned>(
  record: TenantOwned | null | undefined,
  tenantId: string,
  parents: T[] | undefined,
  parentIdOf: (record: TenantOwned) => string | undefined
): boolean {
  if (!record) return false;
  if (record.tenantId || record.companyId) return isOwnedBy(record, tenantId);
  const parentId = parentIdOf(record);
  if (parentId) {
    const parent = (parents || []).find(p => p.id === parentId);
    if (parent) return isOwnedBy(parent, tenantId);
  }
  return isOwnedBy(record, tenantId);
}

/** Kasa hareketinin bağlı olduğu kasa kimliği. */
export const cashRegisterIdOf = (t: TenantOwned): string | undefined =>
  (t as { cashRegisterId?: string }).cashRegisterId;

/** Banka hareketinin bağlı olduğu hesap kimliği. */
export const bankAccountIdOf = (t: TenantOwned): string | undefined =>
  (t as { bankAccountId?: string }).bankAccountId;

/**
 * Tenant doğrulaması yapılmış veritabanı durumu için kısayol okuyucular.
 * Route katmanında `resolveRequestTenantId(req)` sonucu ile kullanılır.
 */
export function ownedSlice(db: DatabaseState, tenantId: string) {
  return {
    cashRegisters: filterOwned(db.cashRegisters, tenantId),
    bankAccounts: filterOwned(db.bankAccounts, tenantId),
    cashTransactions: (db.cashTransactions || []).filter(t =>
      isOwnedByParent(t, tenantId, db.cashRegisters, cashRegisterIdOf)),
    bankTransactions: (db.bankTransactions || []).filter(t =>
      isOwnedByParent(t, tenantId, db.bankAccounts, bankAccountIdOf)),
    customers: filterOwned(db.customers, tenantId),
    products: filterOwned(db.products, tenantId),
    expenses: filterOwned(db.expenses, tenantId),
  };
}
