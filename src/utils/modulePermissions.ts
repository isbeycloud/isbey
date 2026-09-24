/**
 * İŞBEY CLOUD — FAZ 17
 * Merkezi Modül Yetki Kontrol Sistemi
 *
 * Bu dosya tüm modül erişim kararlarının tek noktadan yönetilmesini sağlar.
 * Hiçbir component kendi kafasına göre user.role === 'admin' yapmamalı.
 * Bunun yerine: canAccessModule(user, 'platform-admin') kullanılmalı.
 */

import type { AppView } from '../context/AppContext';

// ─── Kullanıcı Tipi / Çalışma Alanı ────────────────────────────────────────

export type UserWorkspace = 'ERP' | 'MUHASEBE' | 'ADMIN';

const MEMBERSHIP_MODULE_RESOURCES: Record<string, string[]> = {
  cari: ['customers'], stok: ['products'], satis: ['invoices'], alis: ['invoices'],
  faturalar: ['invoices'], kasa: ['cash'], banka: ['bank'], finans: ['cash', 'bank'],
  irsaliye: ['waybills'], teklif: ['quotes'], gider: ['expenses'], raporlar: ['reports'],
  edonusum: ['einvoice'], muhasebe: ['accounting'],
};

export function canAccessMembershipModule(roles: string[], codes: string[] | undefined, moduleId: string): boolean {
  if (moduleId === 'hizmetler') return true;
  if (roles.some(role => canAccessModule(role, moduleId))) return true;
  if (['dashboard', 'support', 'support-center'].includes(moduleId)) return true;
  return (MEMBERSHIP_MODULE_RESOURCES[moduleId] || []).some(resource =>
    (codes || []).some(code => code === `${resource}.view` || code === `${resource}.*`));
}

export function getMembershipSidebar(roles: string[], codes?: string[]): SidebarGroup[] {
  const groups = new Map<string, AppView[]>();
  const seen = new Set<AppView>();
  for (const role of roles) {
    for (const group of getSidebarModulesForRole(role)) {
      const ids = group.moduleIds.filter(id => !seen.has(id) && canAccessMembershipModule(roles, codes, id));
      ids.forEach(id => seen.add(id));
      groups.set(group.groupLabel, [...(groups.get(group.groupLabel) || []), ...ids]);
    }
  }
  const additional = ['dashboard', ...Object.keys(MEMBERSHIP_MODULE_RESOURCES)].filter(id => !seen.has(id as AppView) && canAccessMembershipModule(roles, codes, id)) as AppView[];
  if (additional.length) groups.set('FİRMA MODÜLLERİ', additional);
  return [...groups].map(([groupLabel, moduleIds]) => ({ groupLabel, moduleIds })).filter(group => group.moduleIds.length);
}

/**
 * Kullanıcının birincil çalışma alanını belirler.
 * Login sonrası yönlendirme ve Header badge için kullanılır.
 */
export function getUserWorkspace(role: string): UserWorkspace {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return 'ADMIN';
  if (role === 'MUHASEBE') return 'MUHASEBE';
  return 'ERP';
}

// ─── Modül Erişim Matrisi ───────────────────────────────────────────────────

/**
 * Her modül için hangi rollerin erişebileceğini tanımlar.
 * 'ALL' → tüm roller erişebilir
 * Dizi → sadece belirtilen roller erişebilir
 */
const MODULE_ACCESS_MATRIX: Record<string, 'ALL' | string[]> = {
  // ── Herkesin görebildiği modüller
  dashboard: 'ALL',
  raporlar: 'ALL',
  support: 'ALL',
  // ── ERP Modülleri (firma kullanıcıları + company_admin + muhasebe + admin)
  // NOT: 'employee' bir TENANT SLUG'ıdır, PLATFORM ROLÜ değildir. canAccessModule
  // doğrudan platform rolü karşılaştırdığı için bu girdi ölü kayıttı (PERSONEL
  // cari modülünü göremiyordu). Doğru platform rolü: PERSONEL.
  cari: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE', 'SATIS', 'KASA', 'RAPOR', 'PERSONEL'],
  stok: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE', 'SATIS', 'RAPOR'],
  alis: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE', 'SATIS', 'RAPOR'],
  satis: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE', 'SATIS', 'RAPOR'],
  faturalar: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE', 'SATIS', 'RAPOR'],
  finans: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE', 'KASA', 'RAPOR'],
  kasa: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE', 'KASA', 'RAPOR'],
  banka: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE', 'KASA', 'RAPOR'],
  ceksenet: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE', 'KASA', 'RAPOR'],
  irsaliye: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE', 'SATIS', 'RAPOR'],
  teklif: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'SATIS', 'RAPOR'],
  gider: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE', 'KASA', 'RAPOR'],
  pos: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'SATIS'],
  personel: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'],
  // ── Muhasebe Modülleri (company_admin + muhasebe + admin)
  muhasebe: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE'],
  vergi: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE'],
  edonusum: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE'],
  edonusummerkezi: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE'],
  // ── Firma Yönetimi (company_admin + admin)
  ayarlar: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'],
  companies: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'],
  tenants: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'],
  'roles-permissions': ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'],
  admin: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'],
  // ── Mali Müşavir Modülleri (muhasebe + admin)
  'mali-musavir': ['SUPER_ADMIN', 'ADMIN', 'MUHASEBE'],
  'muhasebe-kontrol': ['SUPER_ADMIN', 'ADMIN', 'MUHASEBE'],
  // ── Gelişmiş & Ek Modüller
  ai: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE'],
  'ai-merkezi': ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE'],
  'document-ai': ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE'],
  'nakit-tahmin': ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE'],
  otomasyon: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'],
  'client-portal': ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'],
  documents: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE'],
  tasks: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE', 'SATIS', 'KASA'],
  approvals: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'],
  collaboration: ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE', 'SATIS', 'KASA'],
  'support-center': 'ALL',
  'device-security': ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'],
  'activity-logs': ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'],
  'saha-tahsilat': ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'SATIS', 'KASA'],
  'mobil-pos': ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'SATIS'],
  'banka-mutabakat': ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE', 'KASA'],
  'odeme-linkleri': ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'SATIS', 'KASA'],
  'gelismis-raporlar': ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE', 'RAPOR'],
  'mobil-uygulama': ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'],
  // ── SADECE PLATFORM ADMIN (SUPER_ADMIN / ADMIN)
  'platform-admin': ['SUPER_ADMIN', 'ADMIN'],
  'saas-admin': ['SUPER_ADMIN', 'ADMIN'],
  'dealer-portal': ['SUPER_ADMIN', 'ADMIN'],
  dealers: ['SUPER_ADMIN', 'ADMIN'],
  'developer-portal': ['SUPER_ADMIN', 'ADMIN'],
  'marketplace-store': ['SUPER_ADMIN', 'ADMIN'],
  'customer-billing': ['SUPER_ADMIN', 'ADMIN'],
  'whitelabel-settings': ['SUPER_ADMIN', 'ADMIN'],
  subscription: ['SUPER_ADMIN', 'ADMIN'],
  hizlibilisim: ['SUPER_ADMIN', 'ADMIN'],
};

// ─── Sidebar Grup Tipi ───────────────────────────────────────────────────────

export interface SidebarGroup {
  groupLabel: string;
  moduleIds: AppView[];
}

/**
 * Kullanıcı rolüne göre sidebar'da gösterilecek modülleri döndürür.
 * Sıralama kasıtlı — iş akışı önceliğine göre.
 */
export function getSidebarModulesForRole(role: string): SidebarGroup[] {
  const isPlatformAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
  const isCompanyAdmin = role === 'COMPANY_ADMIN';
  const isAccountant = role === 'MUHASEBE';
  const isSales = role === 'SATIS';
  const isCash = role === 'KASA';
  const isViewer = role === 'RAPOR';

  if (isPlatformAdmin) {
    return [
      {
        groupLabel: 'PLATFORM YÖNETİM',
        moduleIds: ['platform-admin', 'hizlibilisim', 'companies', 'dealers', 'subscription', 'customer-billing', 'whitelabel-settings', 'developer-portal', 'marketplace-store', 'activity-logs'] as AppView[],
      },
      {
        groupLabel: 'İŞBEY ERP',
        moduleIds: ['dashboard', 'cari', 'stok', 'alis', 'satis', 'kasa', 'banka', 'muhasebe', 'edonusum', 'raporlar', 'vergi', 'ayarlar'] as AppView[],
      },
      {
        groupLabel: 'PORTALLAR',
        moduleIds: ['mali-musavir', 'ai-merkezi', 'otomasyon'] as AppView[],
      },
    ];
  }

  if (isAccountant) {
    return [
      {
        groupLabel: 'MALİ MÜŞAVİR',
        moduleIds: ['mali-musavir', 'dashboard'] as AppView[],
      },
      {
        groupLabel: 'MUHASEBECİ İŞ AKIŞI',
        moduleIds: ['cari', 'alis', 'satis', 'muhasebe', 'edonusum', 'vergi', 'raporlar'] as AppView[],
      },
      {
        groupLabel: 'BELGELER',
        moduleIds: ['documents', 'activity-logs'] as AppView[],
      },
    ];
  }

  if (isCompanyAdmin) {
    return [
      {
        groupLabel: 'İŞBEY ERP',
        moduleIds: ['dashboard', 'cari', 'stok', 'alis', 'satis', 'kasa', 'banka', 'muhasebe', 'edonusum', 'raporlar', 'vergi'] as AppView[],
      },
      {
        groupLabel: 'FİRMA YÖNETİMİ',
        moduleIds: ['admin', 'roles-permissions', 'ayarlar', 'activity-logs'] as AppView[],
      },
      {
        groupLabel: 'EK MODÜLLER',
        moduleIds: ['ai', 'otomasyon', 'documents'] as AppView[],
      },
    ];
  }

  if (isSales) {
    return [
      {
        groupLabel: 'SATIŞ AKIŞI',
        moduleIds: ['dashboard', 'cari', 'stok', 'satis', 'teklif', 'irsaliye', 'raporlar'] as AppView[],
      },
    ];
  }

  if (isCash) {
    return [
      {
        groupLabel: 'KASA & BANKA',
        moduleIds: ['dashboard', 'kasa', 'banka', 'ceksenet', 'cari', 'raporlar'] as AppView[],
      },
    ];
  }

  if (isViewer) {
    return [
      {
        groupLabel: 'RAPORLAR',
        moduleIds: ['dashboard', 'raporlar', 'cari', 'stok', 'satis', 'alis'] as AppView[],
      },
    ];
  }

  // Varsayılan ERP kullanıcısı
  return [
    {
      groupLabel: 'İŞBEY ERP',
      moduleIds: ['dashboard', 'cari', 'stok', 'alis', 'satis', 'kasa', 'banka', 'raporlar'] as AppView[],
    },
  ];
}

// ─── Yetki Kontrol Fonksiyonları ─────────────────────────────────────────────

/**
 * Belirli bir kullanıcının belirli bir modüle erişip erişemeyeceğini kontrol eder.
 * Bu, frontend'deki tüm yetki kontrollerinin merkezi noktasıdır.
 *
 * @param userRole Kullanıcının rolü (örn: 'COMPANY_ADMIN', 'MUHASEBE', 'SATIS')
 * @param moduleId Kontrol edilecek modül ID (örn: 'platform-admin', 'muhasebe')
 * @param userPermissions Opsiyonel: Kullanıcının bireysel permission'ları
 * @returns true → erişim var, false → erişim yok
 */
export function canAccessModule(
  userRole: string,
  moduleId: string,
  userPermissions?: string[]
): boolean {
  if (!userRole) return false;

  // SUPER_ADMIN her şeye erişebilir
  if (userRole === 'SUPER_ADMIN') return true;

  const rule = MODULE_ACCESS_MATRIX[moduleId];

  // Tanımlanmamış modül → varsayılan olarak erişim yok (güvenli varsayılan)
  if (rule === undefined) return false;

  // 'ALL' → herkes erişebilir
  if (rule === 'ALL') return true;

  // Bireysel permission kontrolü (overrides role check)
  if (userPermissions) {
    if (userPermissions.includes('*')) return true;
    if (userPermissions.includes(`module.${moduleId}`)) return true;
  }

  // Rol bazlı kontrol
  return (rule as string[]).includes(userRole);
}

/**
 * Kullanıcının belirli bir action için izni var mı kontrol eder.
 * Mevcut can() fonksiyonunun daha semantik versiyonu.
 *
 * @param userRole Kullanıcının rolü
 * @param action İzin türü
 * @param module Modül adı
 */
export function hasPermission(
  userRole: string,
  action: string,
  module: string
): boolean {
  if (!userRole) return false;

  if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN' || userRole === 'COMPANY_ADMIN')
    return true;

  if (userRole === 'MUHASEBE') {
    if (module === 'SETTINGS' && (action === 'delete' || action === 'edit')) return false;
    return true;
  }

  if (userRole === 'SATIS') {
    if (module === 'POS' || module === 'SALES' || module === 'CUSTOMERS') {
      return action !== 'delete';
    }
    if (module === 'STOCK' || module === 'DASHBOARD') return action === 'view';
    return false;
  }

  if (userRole === 'KASA') {
    if (module === 'CASH' || module === 'COLLECTIONS' || module === 'POS')
      return action !== 'delete';
    return action === 'view';
  }

  if (userRole === 'RAPOR') {
    return action === 'view' || action === 'print' || action === 'export';
  }

  return true;
}

/**
 * Login sonrası kullanıcıyı hangi view'a yönlendireceğimizi belirler.
 */
export function getInitialViewForRole(role: string): AppView {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return 'platform-admin';
  if (role === 'MUHASEBE') return 'mali-musavir';
  return 'dashboard';
}
