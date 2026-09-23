/**
 * İŞBEY CLOUD — FAZ 25.2-B PERMISSION REGISTRY (TEK KAYNAK)
 * =========================================================
 * Bu dosya sistemdeki TÜM permission kodlarının tek ve kanonik kaynağıdır.
 *
 * Tüketen katmanlar (hedef mimari):
 *   - Backend guards      → requirePermission(PERMISSIONS.X) / requireRole(ROLES.X)
 *   - Storage seed        → db/storage.ts katalog bu kaynaktan türetilir
 *   - Frontend matris     → üretim hattı ile hizalanır (FAZ 25.2-B B-4)
 *   - Authorization tests → server/tests/faz252bPermissionRegistryTest.ts
 *
 * KURALLAR:
 *  1. Burada olmayan bir kod route'larda KULLANILAMAZ (Registry Consistency Test zorunlu).
 *  2. Kod ekleme/değiştirme bu dosyadan yapılır; duplicate tanım YASAKTIR.
 *  3. Kod biçimi: '<kaynak>.<aksi>' (lowercase.dot) — mevcut konvansiyon korunur.
 *
 * Kapsam notu (FAZ 25.2-B onay kararı):
 *  - 37 mevcut katalog kodu birebir korundu (mevcut davranış değişmez).
 *  - Route'larda kullanılan ama katalogda tanımsız 7 kod resmileştirildi
 *    (bank.view, bank.create, collections.create, collections.cancel,
 *     einvoice.view, warehouses.view, warehouses.update) — docs/12 §6.
 *  - 'accounting.*' ve 'backup.*' onaylı scope listesi uyarınca rezerve eklendi.
 */

/** Permission kodları — kanonik sabitler (string literal birliği türetilir). */
export const PERMISSIONS = {
  // ── Cari (CARI) ─────────────────────────────────────────────────────────
  CUSTOMERS_VIEW: 'customers.view',
  CUSTOMERS_CREATE: 'customers.create',
  CUSTOMERS_UPDATE: 'customers.update',
  CUSTOMERS_DELETE: 'customers.delete',

  // ── Stok (STOK) ─────────────────────────────────────────────────────────
  PRODUCTS_VIEW: 'products.view',
  PRODUCTS_CREATE: 'products.create',
  PRODUCTS_UPDATE: 'products.update',
  PRODUCTS_DELETE: 'products.delete',
  WAREHOUSES_VIEW: 'warehouses.view',
  WAREHOUSES_UPDATE: 'warehouses.update',

  // ── Faturalar (FATURA) ──────────────────────────────────────────────────
  INVOICES_VIEW: 'invoices.view',
  INVOICES_CREATE: 'invoices.create',
  INVOICES_UPDATE: 'invoices.update',
  INVOICES_DELETE: 'invoices.delete',
  INVOICES_SEND: 'invoices.send',

  // ── Teklif & Sipariş (TEKLIF) ───────────────────────────────────────────
  QUOTES_VIEW: 'quotes.view',
  QUOTES_CREATE: 'quotes.create',
  QUOTES_UPDATE: 'quotes.update',
  QUOTES_DELETE: 'quotes.delete',

  // ── İrsaliye (IRSALIYE) ─────────────────────────────────────────────────
  WAYBILLS_VIEW: 'waybills.view',
  WAYBILLS_CREATE: 'waybills.create',
  WAYBILLS_UPDATE: 'waybills.update',
  WAYBILLS_DELETE: 'waybills.delete',

  // ── Finans: Kasa & Banka (FINANS) ───────────────────────────────────────
  CASH_VIEW: 'cash.view',
  CASH_CREATE: 'cash.create',
  CASH_UPDATE: 'cash.update',
  CASH_DELETE: 'cash.delete',
  BANK_VIEW: 'bank.view',
  BANK_CREATE: 'bank.create',
  COLLECTIONS_CREATE: 'collections.create',
  COLLECTIONS_CANCEL: 'collections.cancel',

  // ── Gider (GIDER) ───────────────────────────────────────────────────────
  EXPENSES_VIEW: 'expenses.view',
  EXPENSES_CREATE: 'expenses.create',
  EXPENSES_UPDATE: 'expenses.update',
  EXPENSES_DELETE: 'expenses.delete',

  // ── Raporlar & AI (RAPORLAR) ────────────────────────────────────────────
  REPORTS_VIEW: 'reports.view',

  // ── Kullanıcılar & Roller (YONETIM) ─────────────────────────────────────
  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_DELETE: 'users.delete',

  // ── Firma Ayarları (AYARLAR) ────────────────────────────────────────────
  COMPANY_VIEW: 'company.view',
  COMPANY_UPDATE: 'company.update',

  // ── Platform (PLATFORM) ─────────────────────────────────────────────────
  TENANTS_MANAGE: 'tenants.manage',

  // ── e-Dönüşüm (EDONUSUM) — FAZ 25.2-B: route'larda kullanılıyordu, resmileştirildi ──
  EINVOICE_VIEW: 'einvoice.view',

  // ── Muhasebe (MUHASEBE) — FAZ 25.2-B rezerve: docs/11 onaylı kontrol alanları ──
  // NOT: Şu an hiçbir route'a bağlı değildir (rezerve set). Bağlama kararı
  // 25.2-C/25.2-B-B3'te verilir; kodlar registry'de tek nüsha olarak yaşar.
  ACCOUNTING_VIEW: 'accounting.view',
  ACCOUNTING_CREATE: 'accounting.create',
  ACCOUNTING_APPROVE: 'accounting.approve',
  ACCOUNTING_DELETE: 'accounting.delete',

  // ── Yedekleme (BACKUP) — FAZ 25.2-A kararı: yalnızca SUPER_ADMIN (rezerve) ──
  BACKUP_MANAGE: 'backup.manage',
} as const;

/** Tüm permission kodlarının string literal birliği. */
export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Kanonik kod listesi (tekrarsız, tanım sırasına göre). */
export const ALL_PERMISSION_CODES: readonly PermissionCode[] =
  Object.values(PERMISSIONS);

/** Duplicate tanım denetimi — build/test anında ihlal varsa hata fırlatır. */
export function assertNoDuplicatePermissions(): void {
  const seen = new Set<string>();
  for (const code of ALL_PERMISSION_CODES) {
    if (seen.has(code)) {
      throw new Error(`Duplicate permission tanımı: "${code}" (permissions.ts)`);
    }
    seen.add(code);
  }
}

/**
 * FAZ 25.2-B: Rezerve (henüz route'a bağlı olmayan) kodlar.
 * Registry Consistency Test bunları istisna sayar; route taraması
 * yalnızca REZERVE dışındaki kodların route'larda kullanılmasını doğrular.
 */
export const RESERVED_PERMISSION_CODES: readonly PermissionCode[] = [
  PERMISSIONS.ACCOUNTING_VIEW,
  PERMISSIONS.ACCOUNTING_CREATE,
  PERMISSIONS.ACCOUNTING_APPROVE,
  PERMISSIONS.ACCOUNTING_DELETE,
  PERMISSIONS.BACKUP_MANAGE,
];

/**
 * Kodun geçerli (registry'de tanımlı) olup olmadığı.
 */
export const isKnownPermission = (code: string): boolean =>
  (ALL_PERMISSION_CODES as readonly string[]).includes(code);

// ─── FAZ 25.3-E (B-2): Seed katalog meta'sı — TEK KAYNAK buraya taşındı ────
/**
 * storage.ts seedDefaultRolesAndPermissions içindeki 37 katalog girdisinin
 * birebir meta kopyası (module/action/name/description + sıra). db.permissions
 * seed'i bu diziden türetilir; id şeması `perm-<sıra>` aynı kalır.
 * NOT: Yalnızca 37 katalog kodu DB'ye yazılır (mevcut davranış korunur) —
 * resmileştirilen 7 ve rezerve 5 kod meta'sız katalog üyesi olarak yaşar.
 */
export const PERMISSION_CATALOG: ReadonlyArray<{
  module: string;
  action: string;
  code: PermissionCode;
  name: string;
  description: string;
}> = [
  // Cari
  { module: 'CARI', action: 'view', code: PERMISSIONS.CUSTOMERS_VIEW, name: 'Carileri Görüntüle', description: 'Müşteri ve tedarikçi listesini ve ekstrelerini görüntüler' },
  { module: 'CARI', action: 'create', code: PERMISSIONS.CUSTOMERS_CREATE, name: 'Cari Oluştur', description: 'Yeni müşteri ve tedarikçi kartı açabilir' },
  { module: 'CARI', action: 'update', code: PERMISSIONS.CUSTOMERS_UPDATE, name: 'Cari Düzenle', description: 'Cari hesap bilgilerini güncelleyebilir' },
  { module: 'CARI', action: 'delete', code: PERMISSIONS.CUSTOMERS_DELETE, name: 'Cari Sil', description: 'Cari kartları silebilir veya arşivleyebilir' },
  // Stok
  { module: 'STOK', action: 'view', code: PERMISSIONS.PRODUCTS_VIEW, name: 'Stokları Görüntüle', description: 'Ürün, hizmet ve depo stok miktarlarını görüntüler' },
  { module: 'STOK', action: 'create', code: PERMISSIONS.PRODUCTS_CREATE, name: 'Ürün Oluştur', description: 'Yeni ürün veya hizmet kartı açabilir' },
  { module: 'STOK', action: 'update', code: PERMISSIONS.PRODUCTS_UPDATE, name: 'Ürün Düzenle', description: 'Ürün fiyat, barkod ve detaylarını günceller' },
  { module: 'STOK', action: 'delete', code: PERMISSIONS.PRODUCTS_DELETE, name: 'Ürün Sil', description: 'Ürün kartlarını silebilir' },
  // Faturalar & Satış
  { module: 'FATURA', action: 'view', code: PERMISSIONS.INVOICES_VIEW, name: 'Faturaları Görüntüle', description: 'Satış ve alış faturalarını görüntüler' },
  { module: 'FATURA', action: 'create', code: PERMISSIONS.INVOICES_CREATE, name: 'Fatura Oluştur', description: 'Yeni satış/alış faturası düzenleyebilir' },
  { module: 'FATURA', action: 'update', code: PERMISSIONS.INVOICES_UPDATE, name: 'Fatura Düzenle', description: 'Taslak faturaları güncelleyebilir' },
  { module: 'FATURA', action: 'delete', code: PERMISSIONS.INVOICES_DELETE, name: 'Fatura İptal/Sil', description: 'Faturayı iptal edebilir veya silebilir' },
  { module: 'FATURA', action: 'send', code: PERMISSIONS.INVOICES_SEND, name: 'GİB e-Fatura Gönder', description: 'e-Fatura / e-Arşiv belgelerini GİB sistemine iletir' },
  // Teklif & Sipariş
  { module: 'TEKLIF', action: 'view', code: PERMISSIONS.QUOTES_VIEW, name: 'Teklif/Sipariş Görüntüle', description: 'Teklif ve sipariş belgelerini görüntüler' },
  { module: 'TEKLIF', action: 'create', code: PERMISSIONS.QUOTES_CREATE, name: 'Teklif/Sipariş Oluştur', description: 'Yeni teklif veya sipariş hazırlar' },
  { module: 'TEKLIF', action: 'update', code: PERMISSIONS.QUOTES_UPDATE, name: 'Teklif/Sipariş Düzenle', description: 'Teklif ve siparişleri günceller/onaylar' },
  { module: 'TEKLIF', action: 'delete', code: PERMISSIONS.QUOTES_DELETE, name: 'Teklif/Sipariş Sil', description: 'Teklif veya sipariş kaydını siler' },
  // İrsaliye
  { module: 'IRSALIYE', action: 'view', code: PERMISSIONS.WAYBILLS_VIEW, name: 'İrsaliyeleri Görüntüle', description: 'Sevk ve alış irsaliyelerini görüntüler' },
  { module: 'IRSALIYE', action: 'create', code: PERMISSIONS.WAYBILLS_CREATE, name: 'İrsaliye Oluştur', description: 'Yeni sevk veya alış irsaliyesi düzenler' },
  { module: 'IRSALIYE', action: 'update', code: PERMISSIONS.WAYBILLS_UPDATE, name: 'İrsaliye Düzenle', description: 'İrsaliye detaylarını günceller' },
  { module: 'IRSALIYE', action: 'delete', code: PERMISSIONS.WAYBILLS_DELETE, name: 'İrsaliye Sil', description: 'İrsaliye kaydını siler' },
  // Finans: Kasa & Banka & Çek-Senet
  { module: 'FINANS', action: 'view', code: PERMISSIONS.CASH_VIEW, name: 'Kasa/Banka Görüntüle', description: 'Kasa, banka ve çek/senet bakiyelerini ve hareketlerini görüntüler' },
  { module: 'FINANS', action: 'create', code: PERMISSIONS.CASH_CREATE, name: 'Tahsilat/Ödeme Ekle', description: 'Nakit, havale veya çek/senet tahsilatı ve ödemesi işler' },
  { module: 'FINANS', action: 'update', code: PERMISSIONS.CASH_UPDATE, name: 'Finansal Hareket Düzenle', description: 'Kasa ve banka hareketlerini günceller' },
  { module: 'FINANS', action: 'delete', code: PERMISSIONS.CASH_DELETE, name: 'Finansal Hareket Sil', description: 'Kasa ve banka kayıtlarını iptal eder' },
  // Masraf / Gider
  { module: 'GIDER', action: 'view', code: PERMISSIONS.EXPENSES_VIEW, name: 'Giderleri Görüntüle', description: 'Masraf ve işletme giderlerini görüntüler' },
  { module: 'GIDER', action: 'create', code: PERMISSIONS.EXPENSES_CREATE, name: 'Gider Kaydı Ekle', description: 'Yeni masraf/gider fişi girer' },
  { module: 'GIDER', action: 'update', code: PERMISSIONS.EXPENSES_UPDATE, name: 'Gider Düzenle', description: 'Gider kayıtlarını günceller' },
  { module: 'GIDER', action: 'delete', code: PERMISSIONS.EXPENSES_DELETE, name: 'Gider Sil', description: 'Gider kaydını siler' },
  // Raporlar & AI
  { module: 'RAPORLAR', action: 'view', code: PERMISSIONS.REPORTS_VIEW, name: 'Finansal Raporları Görüntüle', description: 'KDV, mizan, gelir tablosu ve kârlılık raporlarına erişir' },
  // Kullanıcılar & Roller
  { module: 'YONETIM', action: 'view', code: PERMISSIONS.USERS_VIEW, name: 'Kullanıcıları Görüntüle', description: 'Firma kullanıcı ve personel listesini görüntüler' },
  { module: 'YONETIM', action: 'create', code: PERMISSIONS.USERS_CREATE, name: 'Kullanıcı Davet Et / Ekle', description: 'Yeni personel veya muhasebeci ekler' },
  { module: 'YONETIM', action: 'update', code: PERMISSIONS.USERS_UPDATE, name: 'Kullanıcı Rolü Düzenle', description: 'Kullanıcı rol ve yetkilerini değiştirir' },
  { module: 'YONETIM', action: 'delete', code: PERMISSIONS.USERS_DELETE, name: 'Kullanıcı Sil / Pasife Al', description: 'Kullanıcı hesabını devre dışı bırakır' },
  // Firma Ayarları
  { module: 'AYARLAR', action: 'view', code: PERMISSIONS.COMPANY_VIEW, name: 'Firma Ayarlarını Görüntüle', description: 'Firma ve entegrasyon ayarlarını görüntüler' },
  { module: 'AYARLAR', action: 'update', code: PERMISSIONS.COMPANY_UPDATE, name: 'Firma Ayarlarını Güncelle', description: 'Firma bilgileri, logo ve e-Dönüşüm ayarlarını günceller' },
  // Platform Süper Admin
  { module: 'PLATFORM', action: 'manage', code: PERMISSIONS.TENANTS_MANAGE, name: 'Tüm Şirketleri Yönet', description: 'Platform Admin: Tüm şirketleri, paketleri ve bayi ağını yönetir' },
];

/** Seed kataloğunun kodları (sıra korunur — db perm-1..37 id şeması buna bağlı). */
export const SEED_CATALOG_CODES: readonly PermissionCode[] =
  PERMISSION_CATALOG.map(p => p.code);
