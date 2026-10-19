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
 * NOT (2026-10-17 DÜZELTME): Bu modülün ilk sürümü "depo kayıtlarında
 * `tenantId` alanı ŞEMADA YOKTUR" diyordu — **YANLIŞ**. `Warehouse` arayüzü
 * `tenantId?: string` taşır (bkz. `db/schema.ts`, `interface Warehouse`).
 * Aynı şekilde `StockMovement.tenantId` de şemada VARDIR. Alanın şemada
 * olduğu hâlde yazma yollarında ATANMAMASI, sahipsiz kayıt birikmesinin
 * kaynağıdır. Depo sahipliği artık bu modülün KAPSAMINDADIR (aşağıdaki
 * `isWarehouseOwnedBy` / `requireOwnedWarehouse`).
 */
import type { DatabaseState, Warehouse } from '../db/schema';

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
    warehouses: filterOwned(db.warehouses, tenantId),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DEPO SAHİPLİĞİ VE YAZMA KAPISI (2026-10-17)
// ─────────────────────────────────────────────────────────────────────────────
//
// ÖLÇÜLEN AÇIK: 20 stok-hareketi yazma noktasının HİÇBİRİNDE depo sahipliği
// doğrulanmıyordu. Üç ayrı sessiz-yanlış-yazma yolu vardı:
//
//   1. `draft.warehouses.find(w => w.id === warehouseId) || draft.warehouses[0]`
//      → `warehouseId` boş/geçersizse BAŞKA firmanın deposuna yazar.
//   2. `warehouseId || 'wh-default'` / `'wh-1'` → var olmayan kimliğe yazar
//      (hareket sahipsiz depo kimliği taşır; raporlar çözülmemiş referans görür).
//   3. `StockMovement` nesnesine `tenantId` ATANMAMASI → yeni kayıt sahipsiz
//      doğar; `recalculateBalances` tenant'a bakmadığı için (storage.ts) bu
//      hareket ürün stoğunu YİNE değiştirir.
//
// Bu üç yolun her biri AYRI AYRI hata döndürür; hiçbiri sessizce düşmez.
// "Kullanıcı yanlış depoya yazdı" sonucu bu fonksiyon kullanıldığı sürece
// üretilemez — çünkü seçim yoksa hata verilir, varsayılan seçilmez.

/**
 * Depo yazma kapısının hata sebebi (route katmanı HTTP kodunu buna göre seçer).
 *
 * NOT: Tek `interface` olarak tanımlıdır (üç ayrı nesne türünün birleşimi
 * DEĞİL) — aksi hâlde `!result.ok` ile ayrımlı birleşim daraltması
 * çalışmıyor ve çağıran kod `result.code` okuyamıyordu.
 */
export interface WarehouseGateFailure {
  ok: false;
  code: 'WAREHOUSE_ID_REQUIRED' | 'WAREHOUSE_NOT_FOUND' | 'WAREHOUSE_FORBIDDEN';
  message: string;
}

export interface WarehouseGateSuccess {
  ok: true;
  warehouse: Warehouse;
}

export type WarehouseGateResult = WarehouseGateSuccess | WarehouseGateFailure;

/** Bir depo kaydı verilen tenant'a mı ait? (Okuma yolu.) */
export function isWarehouseOwnedBy(warehouse: Warehouse | null | undefined, tenantId: string): boolean {
  return isOwnedBy(warehouse, tenantId);
}

/** Tenant'ın YAZABİLECEĞİ depolar (okuma listesiyle aynı kural). */
export function writableWarehouses(warehouses: Warehouse[] | undefined, tenantId: string): Warehouse[] {
  return filterOwned(warehouses, tenantId);
}

/**
 * YAZMA KAPISI — stok hareketi/irsaliye/fatura yazan her yol bunu kullanır.
 *
 * Sözleşme:
 *   - `warehouseId` boş → `WAREHOUSE_ID_REQUIRED` (sessiz varsayılan YASAK).
 *   - `warehouseId` var ama depo yok → `WAREHOUSE_NOT_FOUND`.
 *   - Depo başka firmanın → `WAREHOUSE_FORBIDDEN` (varlık sızdırılmaz: 404 de
 *     dönebilirdi ama açık 403, istemciye "depo tanımlayın" yolunu açar).
 *
 * `warehouseId` verildiğinde **hiçbir koşulda** başka depoya düşülmez.
 */
export function requireOwnedWarehouse(
  warehouses: Warehouse[] | undefined,
  warehouseId: unknown,
  tenantId: string
): WarehouseGateResult {
  if (typeof warehouseId !== 'string' || warehouseId.trim() === '') {
    return {
      ok: false,
      code: 'WAREHOUSE_ID_REQUIRED',
      message: 'Depo seçimi zorunludur. Lütfen önce bir depo tanımlayın.',
    };
  }
  const id = warehouseId.trim();
  const warehouse = (warehouses || []).find(w => w.id === id);
  if (!warehouse) {
    return {
      ok: false,
      code: 'WAREHOUSE_NOT_FOUND',
      message: 'Seçilen depo bulunamadı. Lütfen depo listesini yenileyin.',
    };
  }
  if (!isWarehouseOwnedBy(warehouse, tenantId)) {
    return {
      ok: false,
      code: 'WAREHOUSE_FORBIDDEN',
      message: 'Seçilen depo bu firmaya ait değil.',
    };
  }
  return { ok: true, warehouse };
}

/**
 * Yazma kapısı sonucunu HTTP durumuna çevirir (route katmanı için).
 * Kapı kullanıldığı her yerde aynı durum kodu üretilsin diye tek kaynak.
 */
export function warehouseGateStatus(failure: WarehouseGateFailure): number {
  return failure.code === 'WAREHOUSE_FORBIDDEN' ? 403 : 400;
}

/**
 * Depo kapısı hatası — `code` ve `statusCode` taşır ki route katmanı
 * `catch (err: any)` içinde `err.statusCode`/`err.code` okuyabilsin.
 */
export class WarehouseGateError extends Error {
  readonly code: WarehouseGateFailure['code'];
  readonly statusCode: number;
  constructor(failure: WarehouseGateFailure) {
    super(failure.message);
    this.name = 'WarehouseGateError';
    this.code = failure.code;
    this.statusCode = warehouseGateStatus(failure);
  }
}

/**
 * Kapıyı çalıştırır ve başarısızsa `WarehouseGateError` FIRLATIR.
 *
 * Route katmanı bunu tercih eder: dönüş tipi `Warehouse` olduğu için çağıran
 * kodda tip daraltma (narrowing) gerekmez ve hata yolu tek biçimde işler.
 */
export function assertOwnedWarehouse(
  warehouses: Warehouse[] | undefined,
  warehouseId: unknown,
  tenantId: string
): Warehouse {
  const result = requireOwnedWarehouse(warehouses, warehouseId, tenantId);
  // NOT: Bu depoda `strict` KAPALIDIR; boolean ayırt edicili birleşim
  // daraltması güvenilir çalışmadığı için `result.ok` ile daraltma yerine
  // açık tip kontrolü yapılır (davranış aynı, derleyici bağımlılığı yok).
  if (result.ok === false) throw new WarehouseGateError(result);
  return (result as WarehouseGateSuccess).warehouse;
}

/**
 * Yeni yazılan stok hareketlerine konacak sahiplik + depo alanları.
 *
 * `StockMovement` nesnesi 20 noktada elle kuruluyor ve çoğunda `tenantId`
 * unutuluyordu. Bu yardımcı, sahipliği ve depo adını TEK yerden verir.
 */
export function stockMovementOwnedFields(tenantId: string, warehouse: Pick<Warehouse, 'id' | 'name'>) {
  return { tenantId, warehouseId: warehouse.id, warehouseName: warehouse.name };
}
