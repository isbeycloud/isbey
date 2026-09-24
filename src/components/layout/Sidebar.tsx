import { BrandLogo } from '../common/BrandLogo';
import React from 'react';
// 2026-09-13 (ölü kod temizliği): LayoutDashboard, Wallet, Calendar, Sparkles
// burada içe aktarılıyordu ama hiçbir modül meta verisinde kullanılmıyordu.
import {
  Home,
  Users,
  ShoppingCart,
  ShoppingBag,
  Package,
  Landmark,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Building,
  Zap,
  Crown,
  Briefcase,
  ShieldAlert,
  BookOpen,
  LogOut,
  FileText,
  CreditCard,
  Store,
  Code,
  Receipt,
  ClipboardList,
  TrendingUp,
  Bot,
  Workflow,
  Users2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import type { AppView, RibbonTab } from '../../context/AppContext';
import { getMembershipSidebar } from '../../utils/modulePermissions';
import { menuAllowsView } from '../../data/erpMenus';

interface ModuleMeta {
  id: AppView;
  ribbonTab: RibbonTab;
  label: string;
  orderNumber: string;
  icon: React.ReactNode;
  badge?: string;
  badgeColor?: string;
}

// ─── Tüm Modüllerin Meta Verisi (SÖZLEŞME: değişmedi — M3 reskin yalnız görsel) ──
const MODULE_META: Record<string, ModuleMeta> = {
  hizmetler: { id: 'hizmetler', ribbonTab: 'AYARLAR', orderNumber: '0', label: 'Hizmetler ve Paketler', icon: <CreditCard size={18} /> },
  dashboard:          { id: 'dashboard',          ribbonTab: 'ANASAYFA',    orderNumber: '1',  label: 'Ana Sayfa',            icon: <Home size={18} /> },
  cari:               { id: 'cari',               ribbonTab: 'CARI',        orderNumber: '2',  label: 'Cari',                 icon: <Users size={18} /> },
  stok:               { id: 'stok',               ribbonTab: 'STOK',        orderNumber: '3',  label: 'Stok',                 icon: <Package size={18} /> },
  alis:               { id: 'alis',               ribbonTab: 'ALIS',        orderNumber: '4',  label: 'Alış Faturaları',      icon: <ShoppingBag size={18} /> },
  satis:              { id: 'satis',              ribbonTab: 'SATIS',       orderNumber: '5',  label: 'Satış Faturaları',     icon: <ShoppingCart size={18} /> },
  faturalar:          { id: 'faturalar',          ribbonTab: 'SATIS',       orderNumber: '5',  label: 'Faturalar',            icon: <Receipt size={18} /> },
  kasa:               { id: 'kasa',               ribbonTab: 'KASA_BANKA',  orderNumber: '6',  label: 'Nakit / Banka',        icon: <Landmark size={18} /> },
  banka:              { id: 'banka',              ribbonTab: 'KASA_BANKA',  orderNumber: '7',  label: 'Banka Hesapları',      icon: <Landmark size={18} /> },
  ceksenet:           { id: 'ceksenet',           ribbonTab: 'CEK_SENET',   orderNumber: '8',  label: 'Çek & Senet',          icon: <ClipboardList size={18} /> },
  irsaliye:           { id: 'irsaliye',           ribbonTab: 'IRSALIYE',    orderNumber: '9',  label: 'İrsaliyeler',          icon: <FileText size={18} /> },
  teklif:             { id: 'teklif',             ribbonTab: 'TEKLIF',      orderNumber: '10', label: 'Teklif & Sipariş',     icon: <ClipboardList size={18} /> },
  gider:              { id: 'gider',              ribbonTab: 'GIDER',       orderNumber: '11', label: 'Giderler',             icon: <CreditCard size={18} /> },
  pos:                { id: 'pos',                ribbonTab: 'SATIS',       orderNumber: '12', label: 'Hızlı Satış (POS)',    icon: <Store size={18} /> },
  personel:           { id: 'personel',           ribbonTab: 'ANASAYFA',    orderNumber: '13', label: 'Personel',             icon: <Users2 size={18} /> },
  muhasebe:           { id: 'muhasebe',           ribbonTab: 'RAPORLAR',    orderNumber: '14', label: 'Muhasebe',             icon: <BookOpen size={18} /> },
  edonusum:           { id: 'edonusum',           ribbonTab: 'SATIS',       orderNumber: '15', label: 'e-Belge & GİB',        icon: <Zap size={18} />,         badge: 'GİB',     badgeColor: '#d97706' },
  edonusummerkezi:    { id: 'edonusummerkezi',    ribbonTab: 'SATIS',       orderNumber: '15', label: 'e-Dönüşüm Merkezi',   icon: <Zap size={18} />,         badge: 'e-D',     badgeColor: '#d97706' },
  vergi:              { id: 'vergi',              ribbonTab: 'RAPORLAR',    orderNumber: '16', label: 'KDV / Beyanname',      icon: <FileText size={18} /> },
  raporlar:           { id: 'raporlar',           ribbonTab: 'RAPORLAR',    orderNumber: '17', label: 'Raporlar',             icon: <BarChart3 size={18} /> },
  'rapor-tasarimci':  { id: 'rapor-tasarimci',    ribbonTab: 'RAPORLAR',    orderNumber: '17', label: 'Rapor Tasarım Merkezi', icon: <BarChart3 size={18} />, badge: 'NEW',  badgeColor: '#059669' },
  ayarlar:            { id: 'ayarlar',            ribbonTab: 'AYARLAR',     orderNumber: '18', label: 'Ayarlar',              icon: <Settings size={18} /> },
  companies:          { id: 'companies',          ribbonTab: 'AYARLAR',     orderNumber: '19', label: 'Firma & Şirketler',    icon: <Building size={18} /> },
  tenants:            { id: 'tenants',            ribbonTab: 'AYARLAR',     orderNumber: '19', label: 'Tenant Yönetimi',      icon: <Building size={18} /> },
  'roles-permissions':{ id: 'roles-permissions',  ribbonTab: 'AYARLAR',     orderNumber: '20', label: 'Roller & Yetkiler',    icon: <ShieldAlert size={18} /> },
  admin:              { id: 'admin',              ribbonTab: 'AYARLAR',     orderNumber: '21', label: 'Yönetim Paneli',       icon: <Crown size={18} />,       badge: 'ADMIN',   badgeColor: '#7c3aed' },
  'mali-musavir':     { id: 'mali-musavir',       ribbonTab: 'AYARLAR',     orderNumber: '22', label: 'Mali Müşavir Portalı', icon: <Briefcase size={18} />,   badge: 'SMMM',    badgeColor: '#4f46e5' },
  'muhasebe-kontrol': { id: 'muhasebe-kontrol',   ribbonTab: 'RAPORLAR',    orderNumber: '23', label: 'Muhasebe Kontrol',     icon: <TrendingUp size={18} /> },
  'platform-admin':   { id: 'platform-admin',     ribbonTab: 'AYARLAR',     orderNumber: '1',  label: 'Admin & SaaS Paneli',  icon: <ShieldAlert size={18} />, badge: 'SUPER',   badgeColor: '#dc2626' },
  'saas-admin':       { id: 'saas-admin',         ribbonTab: 'AYARLAR',     orderNumber: '1',  label: 'SaaS Yönetimi',        icon: <ShieldAlert size={18} />, badge: 'SAAS',    badgeColor: '#dc2626' },
  hizlibilisim:       { id: 'hizlibilisim',       ribbonTab: 'AYARLAR',     orderNumber: '2',  label: 'Müşteri İşlemleri',        icon: <Users size={18} />,         badge: 'HB',     badgeColor: '#059669' },
  dealers:            { id: 'dealers',            ribbonTab: 'AYARLAR',     orderNumber: '3',  label: 'Bayi Yönetimi',        icon: <Users size={18} />,       badge: 'BAYİ',    badgeColor: '#0369a1' },
  subscription:       { id: 'subscription',       ribbonTab: 'AYARLAR',     orderNumber: '4',  label: 'Abonelik & SaaS',      icon: <CreditCard size={18} /> },
  'customer-billing': { id: 'customer-billing',   ribbonTab: 'AYARLAR',     orderNumber: '5',  label: 'Faturalama',           icon: <Receipt size={18} /> },
  'whitelabel-settings':{ id: 'whitelabel-settings', ribbonTab: 'AYARLAR',  orderNumber: '6',  label: 'White Label',          icon: <Store size={18} /> },
  'developer-portal': { id: 'developer-portal',   ribbonTab: 'AYARLAR',     orderNumber: '7',  label: 'Geliştirici API',      icon: <Code size={18} /> },
  'marketplace-store':{ id: 'marketplace-store',  ribbonTab: 'AYARLAR',     orderNumber: '8',  label: 'Marketplace',          icon: <Store size={18} /> },
  'activity-logs':    { id: 'activity-logs',      ribbonTab: 'AYARLAR',     orderNumber: '9',  label: 'Audit & Loglar',       icon: <ClipboardList size={18} /> },
  ai:                 { id: 'ai',                 ribbonTab: 'AI_ASISTAN',  orderNumber: '10', label: 'AI Asistan',           icon: <Bot size={18} />,         badge: 'AI',      badgeColor: '#6366f1' },
  'ai-merkezi':       { id: 'ai-merkezi',         ribbonTab: 'AI_ASISTAN',  orderNumber: '10', label: 'AI Merkezi',           icon: <Bot size={18} />,         badge: 'AI',      badgeColor: '#6366f1' },
  otomasyon:          { id: 'otomasyon',          ribbonTab: 'AYARLAR',     orderNumber: '11', label: 'Otomasyon Stüdyosu',   icon: <Workflow size={18} /> },
  documents:          { id: 'documents',          ribbonTab: 'AYARLAR',     orderNumber: '12', label: 'Belge Merkezi',        icon: <FileText size={18} /> },
  support:            { id: 'support',            ribbonTab: 'ANASAYFA',    orderNumber: '99', label: 'Destek',               icon: <Briefcase size={18} /> },
};

// 2026-09-13 (ölü kod temizliği): Burada bir WORKSPACE_COLORS paleti tanımlıydı
// ama tek kullanımı `const wsColors = ...` ile atanıp HİÇ render edilmiyordu.
// Ölü veri kaldırıldı; modül erişim kararı zaten getSidebarModulesForRole ile
// veriliyor (yan yana çalışan iki yetki kaynağı yanıltıcıydı).

export const Sidebar: React.FC = () => {
  const {
    activeView,
    setActiveView,
    setActiveRibbonTab,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    isMobileSidebarOpen,
    setIsMobileSidebarOpen,
    activeTenant,
  } = useApp();
  const { user, logout } = useAuth();

  const userRole = user?.role || 'employee';

  // FAZ 17: Role-based sidebar modüllerini al (SÖZLEŞME: aynen korunur)
  const sidebarGroups = getMembershipSidebar(user?.effectiveRoles || [userRole], user?.permissionCodes).map(g => ({ ...g, moduleIds: g.moduleIds.filter(id => menuAllowsView(user?.allowedMenuIds, id)) }));
  sidebarGroups.push({ groupLabel: 'HİZMETLER', moduleIds: ['hizmetler'] });

  const handleNav = (id: AppView, ribbonTab: RibbonTab) => {
    setActiveView(id);
    setActiveRibbonTab(ribbonTab);
    // FAZ 25.3-F: mobilde menüden seçim yapılınca overlay kapansın
    setIsMobileSidebarOpen(false);
  };

  return (
    <>
      {/* FAZ 25.3-F: mobil overlay arka plan */}
      {isMobileSidebarOpen && (
        <div
          className="sidebar-mobile-overlay"
          onClick={() => setIsMobileSidebarOpen(false)}
          style={{
            /* 2026-09-13 (tasarım sadeleştirmesi): Mobil karartma .modal-overlay
               ile aynı tona çekildi; bulanık arka plan kaldırıldı. */
            position: 'fixed', inset: 0, background: 'rgba(10, 15, 30, 0.55)',
            zIndex: 45,
          }}
        />
      )}
      <aside
      className={`app-sidebar ${isSidebarCollapsed ? 'collapsed' : ''} ${isMobileSidebarOpen ? 'mobile-open' : ''}`}
      style={{
        width: isSidebarCollapsed ? 'var(--sidebar-collapsed-width, 60px)' : 'var(--sidebar-width, 250px)',
        background: 'var(--bg-sidebar, #fbfcfe)',
        color: 'var(--text-sidebar, #444a5a)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        borderRight: '1px solid var(--border-color, #e1e7ef)',
        transition: 'width 200ms cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden',
        zIndex: 50,
        userSelect: 'none',
      }}
    >
      {/* ─── MARKA / HEADER (M3: açık yüzey) ─── */}
      <div
        style={{
          height: '64px',
          padding: isSidebarCollapsed ? '0 8px' : '0 18px',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isSidebarCollapsed ? 'center' : 'space-between',
        }}
      >
        <BrandLogo compact={isSidebarCollapsed} width={175} />

        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          style={{
            background: 'transparent',
            border: 'none',
            borderRadius: '8px',
            color: 'var(--text-muted)',
            width: '26px',
            height: '26px',
            display: isSidebarCollapsed ? 'none' : 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'background 150ms',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          title={isSidebarCollapsed ? 'Menüyü Genişlet' : 'Menüyü Daralt'}
        >
          {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* ─── MODÜL LİSTESİ (SÖZLEŞME: getSidebarModulesForRole aynen korunur) ─── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: isSidebarCollapsed ? '12px 6px' : '16px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
        className="erp-sidebar-scroll"
      >
        {sidebarGroups.map((group, gIdx) => {
          const moduleItems = group.moduleIds
            .map(id => MODULE_META[id])
            .filter(Boolean);

          if (moduleItems.length === 0) return null;

          return (
            <div key={gIdx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {!isSidebarCollapsed && sidebarGroups.length > 1 && (
                <div
                  style={{
                    /* 2026-09-13 (tasarım sadeleştirmesi): Grup başlıkları
                       ALL-CAPS + geniş harf aralıklıydı ve marka dilinde
                       "AI-üretimi etiket" izlenimi veriyordu. Sakin başlık
                       durumuna çevrildi. */
                    fontSize: 'var(--fs-xs, 11px)',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    padding: '8px 12px 2px',
                  }}
                >
                  {group.groupLabel}
                </div>
              )}

              {moduleItems.map((item, idx) => {
                const isActive = activeView === item.id;
                return (
                  <button
                    key={`${item.id}-${idx}`}
                    onClick={() => handleNav(item.id, item.ribbonTab)}
                    title={isSidebarCollapsed ? item.label : undefined}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: isSidebarCollapsed ? 'center' : 'flex-start',
                      gap: '12px',
                      width: '100%',
                      padding: isSidebarCollapsed ? '10px 0' : '10px 14px',
                      borderRadius: 'var(--radius-sm, 6px)',
                      border: 'none',
                      background: isActive ? 'var(--primary-light)' : 'transparent',
                      color: isActive ? 'var(--primary)' : 'var(--text-main)',
                      fontWeight: isActive ? 600 : 500,
                      fontSize: 'var(--fs-base, 13px)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background-color 140ms ease',
                      position: 'relative',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-surface-hover)'; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                    className="erp-sidebar-item"
                  >
                    <span
                      style={{
                        color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {item.icon}
                    </span>

                    {!isSidebarCollapsed && (
                      <>
                        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.label}
                        </span>

                        {item.badge ? (
                          <span
                            style={{
                              fontSize: 'var(--fs-2xs, 10px)',
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: 'var(--radius-xs, 4px)',
                              background: item.badgeColor || 'var(--bg-surface-secondary)',
                              /* 2026-09-13: Rozet zemini renkli (badgeColor) olduğu
                                 için beyaz metin bilinçli olarak korundu. */
                              color: '#ffffff',
                              lineHeight: 1.4,
                              flexShrink: 0,
                            }}
                          >
                            {item.badge}
                          </span>
                        ) : (
                          !isActive && (
                            <ChevronRight size={14} color="var(--text-light)" />
                          )
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* ─── ALT SİSTEM DURUMU ───
          2026-09-13 (dürüstlük + tasarım düzeltmesi):
          Önceden burada YEŞİL bir nokta ve "Sistem Aktif" yazısı vardı — ama
          arkasında hiçbir sağlık kontrolü yoktu; sabit yeşildi. Kullanıcıya
          var olmayan bir güvence veriyordu (aynı hata StatusBar'da da vardı).
          Ayrıca üç satırlık mikro kart, kenar çubuğunun altını gereksiz
          dolduruyordu. Artık YALNIZ gerçek bilgi olan tarih gösterilir. */}
      {!isSidebarCollapsed && (
        <div style={{ padding: '10px 18px 12px', marginTop: 'auto' }}>
          <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-light)' }}>
            {new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}
          </div>
        </div>
      )}

      {/* ─── ALT KULLANICI PANELİ (M3: açık yüzey + çıkış) ─── */}
      <div
        style={{
          borderTop: '1px solid var(--border-light)',
          padding: isSidebarCollapsed ? '10px 6px' : '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isSidebarCollapsed ? 'center' : 'space-between',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              /* 2026-09-13 (tasarım düzeltmesi): Avatar önce MOR (marka dışı,
                 gerekçesiz renk) ve 800 kalınlıktaydı. Marka rengine ve
                 normal ağırlığa çekildi. */
              background: 'var(--primary-light)',
              color: 'var(--primary)',
              fontWeight: 600,
              fontSize: 'var(--fs-sm, 12px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              border: '1px solid var(--primary-border, rgba(209, 33, 49, 0.25))',
            }}
          >
            {user?.fullName?.charAt(0) || 'U'}
          </div>

          {!isSidebarCollapsed && (
            <div style={{ overflow: 'hidden', lineHeight: 1.2 }}>
              <div style={{ fontSize: 'var(--fs-sm, 12px)', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.fullName || 'Kullanıcı'}
              </div>
              <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {/* 2026-09-13 (uydurma temizliği): fallback zinciri şirket adı
                    yoksa 'İŞBEY' yazıyordu — kullanıcının firması gibi okunan
                    var olmayan bir ad. Nötr ifadeye çevrildi. */}
                {activeTenant?.name || user?.companyName || 'Şirket seçilmedi'}
              </div>
            </div>
          )}
        </div>

        {!isSidebarCollapsed && (
          <button
            onClick={() => logout()}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: 'var(--radius-xs, 4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-bg)'; e.currentTarget.style.color = 'var(--danger)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
            title="Güvenli Çıkış Yap"
          >
            <LogOut size={16} />
          </button>
        )}
      </div>
    </aside>
    </>
  );
};
