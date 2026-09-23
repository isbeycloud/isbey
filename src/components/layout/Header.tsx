import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Bell,
  Building,
  ChevronDown,
  ShieldCheck,
  Settings,
  LogOut,
  Command,
  HelpCircle,
  ExternalLink,
  Layers,
  Sparkles,
  UserCheck,
  Plus,
  FileText,
  ShoppingCart,
  ShoppingBag,
  DollarSign,
  CreditCard,
  Users,
  Package,
  Receipt,
  Truck,
  Menu,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { CompanyLogoModal } from '../common/CompanyLogoModal';
import { UserManagementModal } from '../common/UserManagementModal';
import { UserInvitationModal } from '../common/UserInvitationModal';
import type { Company } from '../../types';

export const Header: React.FC = () => {
  const {
    activeView,
    setIsGlobalSearchOpen,
    isOnline,
    refreshKey,
    setActiveView,
    setActiveRibbonTab,
    tenants,
    activeTenant,
    switchTenant,
    setIsFastCollectionOpen,
    setIsFastPaymentOpen,
    setIsNewCustomerModalOpen,
    setIsNewProductModalOpen,
    setIsNewInvoiceModalOpen,
    setNewInvoiceType,
    setIsNewQuoteModalOpen,
    setIsNewWaybillModalOpen,
    setIsNewExpenseModalOpen,
    // FAZ 25.3-F: mobil sidebar kontrolü
    isMobileSidebarOpen,
    setIsMobileSidebarOpen,
  } = useApp();
  const { user, logout, userWorkspace } = useAuth();

  const [company, setCompany] = useState<Company | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showTenantMenu, setShowTenantMenu] = useState(false);
  const [showQuickActionMenu, setShowQuickActionMenu] = useState(false);
  const quickActionRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (quickActionRef.current && !quickActionRef.current.contains(event.target as Node)) {
        setShowQuickActionMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Modals
  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);
  const [isUserMgmtModalOpen, setIsUserMgmtModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

  useEffect(() => {
    loadHeaderData();
  }, [refreshKey]);

  const loadHeaderData = async () => {
    try {
      const [compRes, dashRes]: any[] = await Promise.all([
        api.getCompany().catch(() => ({ success: false })),
        api.getDashboardSummary().catch(() => ({ success: false })),
      ]);
      if (compRes && compRes.success && compRes.company) {
        setCompany(compRes.company);
      }
      if (dashRes && dashRes.success && dashRes.data) {
        setNotifications(dashRes.data.notifications || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getModuleTitle = (view: string): { title: string; category: string } => {
    switch (view) {
      case 'dashboard': return { title: 'Yönetim Paneli & KPI', category: 'Dashboard' };
      case 'companies':
      case 'tenants': return { title: 'Firma & Şirketler', category: 'Ayarlar' };
      case 'cari': return { title: 'Cari Hesaplar & Müşteriler', category: 'Cari İşlemleri' };
      case 'stok': return { title: 'Stok & Depo Yönetimi', category: 'Stok İşlemleri' };
      case 'alis': return { title: 'Alış Faturaları & Giderler', category: 'Alış İşlemleri' };
      case 'satis': return { title: 'Satış Faturaları & e-Arşiv', category: 'Satış İşlemleri' };
      case 'pos': return { title: 'Hızlı POS Satış Masası', category: 'Satış İşlemleri' };
      case 'kasa': return { title: 'Nakit Kasa Defteri', category: 'Kasa & Banka' };
      case 'banka': return { title: 'Banka Hesapları & POS', category: 'Kasa & Banka' };
      case 'muhasebe': return { title: 'Genel Muhasebe & Mizan', category: 'Muhasebe' };
      case 'edonusum': return { title: 'e-Belge & GİB Merkezi', category: 'e-Dönüşüm' };
      case 'raporlar': return { title: 'Finansal Raporlar & Bilanço', category: 'Raporlar' };
      case 'vergi': return { title: 'Vergi & Beyanname Takvimi', category: 'Maliye & Vergi' };
      case 'ayarlar': return { title: 'Sistem Parametreleri & Roller', category: 'Ayarlar' };
      case 'mali-musavir': return { title: 'Mali Müşavir Portalı', category: 'SMMM Masası' };
      case 'platform-admin':
      case 'admin': return { title: 'Süper Admin & SaaS Paneli', category: 'Yönetim' };
      case 'customer-billing':
      case 'subscription': return { title: 'Abonelik & Kontör Cüzdanı', category: 'SaaS Masası' };
      case 'dealers':
      case 'dealer-portal': return { title: 'Bayi & Partner Masası', category: 'Bayi Ağı' };
      default: return { title: 'İŞBEY Kurumsal ERP', category: 'ERP' };
    }
  };

  const { title, category } = getModuleTitle(activeView);

  // M3 ghost ikon düğmesi — tekrar eden stil bloklarını tek yerde toplar
  const iconBtnStyle: React.CSSProperties = {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-md, 8px)',
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-muted, #5f6779)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    position: 'relative',
    transition: 'background 140ms ease',
  };

  const ghostHover = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = 'var(--bg-surface-hover, #f0f4f9)';
  };
  const ghostLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = 'transparent';
  };

  return (
    <>
      <header
        className="top-header"
        style={{
          height: 'var(--header-height, 56px)',
          background: 'var(--color-surface, #ffffff)',
          borderBottom: '1px solid var(--color-border, #e1e7ef)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        {/* ─── Sol: Breadcrumb & Aktif Modül Başlığı ─── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* FAZ 25.3-F: mobil hamburger — sidebar overlay'ini açar */}
          <button
            className="sidebar-hamburger"
            onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            aria-label="Menüyü aç/kapat"
            style={{
              display: 'none',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              background: 'transparent',
              border: 'none',
              borderRadius: 'var(--radius-md, 8px)',
              cursor: 'pointer',
              color: 'var(--color-text, #1a1f2e)',
            }}
          >
            <Menu size={18} />
          </button>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 'var(--fs-xs, 11px)', fontWeight: 600, color: 'var(--color-text-muted, #5f6779)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>İŞBEY CLOUD</span>
              <span style={{ color: 'var(--color-text-light, #8b93a5)' }}>/</span>
              <span>{category}</span>
            </div>
            <div style={{ fontSize: 'var(--fs-md, 14px)', fontWeight: 600, color: 'var(--color-text, #1a1f2e)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
              {title}
            </div>
          </div>
        </div>

        {/* ─── Orta: Global Arama (CTRL+K / F10) — M3 search surface ─── */}
        <div style={{ flex: 1, maxWidth: '440px', margin: '0 24px' }}>
          <button
            onClick={() => setIsGlobalSearchOpen(true)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 14px',
              background: 'var(--bg-surface-secondary, #f5f7fa)',
              border: '1px solid var(--border-color, #e1e7ef)',
              borderRadius: 'var(--radius-sm, 6px)',
              color: 'var(--text-muted, #5f6779)',
              fontSize: 'var(--fs-sm, 12px)',
              cursor: 'pointer',
              transition: 'border-color 150ms ease, background-color 150ms ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong, #c9d3e0)'; e.currentTarget.style.background = 'var(--bg-surface, #fff)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color, #e1e7ef)'; e.currentTarget.style.background = 'var(--bg-surface-secondary, #f5f7fa)'; }}
            title="Menüde ara... (Ctrl + K)"
          >
            <Search size={15} />
            <span>Menüde ara... (Ctrl + K)</span>
            <span className="kbd-badge">Ctrl K</span>
          </button>
        </div>

        {/* ─── + Hızlı İşlem (M3 tonal filled button) ─── */}
        <div style={{ position: 'relative', marginRight: '14px' }} ref={quickActionRef}>
          <button
            onClick={() => setShowQuickActionMenu(!showQuickActionMenu)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              fontSize: 'var(--fs-sm, 12px)',
              fontWeight: 600,
              background: 'var(--primary, #d12131)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-sm, 6px)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'background 140ms ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--primary-hover, #b81423)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--primary, #d12131)'; }}
            title="Hızlı Eylem Menüsü"
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>Hızlı İşlem</span>
            <ChevronDown size={14} style={{ transform: showQuickActionMenu ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
          </button>

          {showQuickActionMenu && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 10px)',
                right: 0,
                width: '320px',
                background: 'var(--bg-surface, #ffffff)',
                borderRadius: 'var(--radius-md, 8px)',
                boxShadow: 'var(--shadow-lg, 0 6px 20px rgba(23, 32, 51, 0.10))',
                border: '1px solid var(--border-color, #e1e7ef)',
                padding: '8px 6px',
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              <div style={{ padding: '4px 10px 8px', borderBottom: '1px solid var(--border-light, #edf1f7)', fontSize: 'var(--fs-xs, 11px)', fontWeight: 600, color: 'var(--text-light, #8b93a5)' }}>
                Yeni belge
              </div>

              <button
                onClick={() => {
                  setShowQuickActionMenu(false);
                  setActiveView('satis');
                  setActiveRibbonTab('SATIS');
                  setNewInvoiceType('SALES');
                  setIsNewInvoiceModalOpen(true);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-sm, 6px)',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: 'var(--text-main, #1a1f2e)',
                  fontSize: 'var(--fs-sm, 12px)',
                  fontWeight: 600,
                  transition: 'background 120ms',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface-hover, #f0f4f9)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ width: '30px', height: '30px', borderRadius: 'var(--radius-md, 8px)', background: 'var(--primary-light, rgba(209,33,49,.08))', color: 'var(--primary, #d12131)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ShoppingCart size={15} />
                </div>
                <div>
                  <div>Yeni Satış Faturası</div>
                  <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted, #5f6779)', fontWeight: 400 }}>e-Fatura / e-Arşiv Satış Düzenle</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setShowQuickActionMenu(false);
                  setActiveView('alis');
                  setActiveRibbonTab('ALIS');
                  setNewInvoiceType('PURCHASE');
                  setIsNewInvoiceModalOpen(true);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-sm, 6px)',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: 'var(--text-main, #1a1f2e)',
                  fontSize: 'var(--fs-sm, 12px)',
                  fontWeight: 600,
                  transition: 'background 120ms',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface-hover, #f0f4f9)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ width: '30px', height: '30px', borderRadius: 'var(--radius-md, 8px)', background: 'var(--info-bg, rgba(59,130,246,.1))', color: 'var(--info, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ShoppingBag size={15} />
                </div>
                <div>
                  <div>Yeni Alış Faturası</div>
                  <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted, #5f6779)', fontWeight: 400 }}>Tedarikçi Gelen Alış Kaydet</div>
                </div>
              </button>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', padding: '4px 6px' }}>
                <button
                  onClick={() => {
                    setShowQuickActionMenu(false);
                    setIsFastCollectionOpen(true);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '9px 10px',
                    borderRadius: 'var(--radius-sm, 6px)',
                    border: '1px solid var(--border-color, #e1e7ef)',
                    background: 'var(--bg-surface, #ffffff)',
                    cursor: 'pointer',
                    color: 'var(--success, #1ea97c)',
                    fontSize: 'var(--fs-xs, 11px)',
                    fontWeight: 600,
                    transition: 'all 120ms',
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--success, #1ea97c)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color, #e1e7ef)'}
                >
                  <DollarSign size={15} />
                  <span>Tahsilat (F8)</span>
                </button>

                <button
                  onClick={() => {
                    setShowQuickActionMenu(false);
                    setIsFastPaymentOpen(true);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '9px 10px',
                    borderRadius: 'var(--radius-sm, 6px)',
                    border: '1px solid var(--border-color, #e1e7ef)',
                    background: 'var(--bg-surface, #ffffff)',
                    cursor: 'pointer',
                    color: 'var(--danger, #ef5350)',
                    fontSize: 'var(--fs-xs, 11px)',
                    fontWeight: 600,
                    transition: 'all 120ms',
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--danger, #ef5350)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color, #e1e7ef)'}
                >
                  <CreditCard size={15} />
                  <span>Ödeme (F9)</span>
                </button>
              </div>

              <div style={{ height: '1px', background: 'var(--border-light, #edf1f7)', margin: '4px 0' }} />

              {[
                {
                  icon: <Users size={15} color="var(--text-secondary, #444a5a)" />,
                  label: 'Yeni Müşteri / Tedarikçi (Cari)',
                  action: () => { setShowQuickActionMenu(false); setActiveView('cari'); setActiveRibbonTab('CARI'); setIsNewCustomerModalOpen(true); },
                },
                {
                  icon: <Package size={15} color="var(--text-secondary, #444a5a)" />,
                  label: 'Yeni Ürün / Stok Kartı',
                  action: () => { setShowQuickActionMenu(false); setActiveView('stok'); setActiveRibbonTab('STOK'); setIsNewProductModalOpen(true); },
                },
                {
                  icon: <Receipt size={15} color="var(--text-secondary, #444a5a)" />,
                  label: 'Yeni Gider / Masraf Fişi',
                  action: () => { setShowQuickActionMenu(false); setActiveView('gider'); setActiveRibbonTab('GIDER'); setIsNewExpenseModalOpen(true); },
                },
              ].map((row, i) => (
                <button
                  key={i}
                  onClick={row.action}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm, 6px)',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: 'var(--text-main, #1a1f2e)',
                    fontSize: 'var(--fs-sm, 12px)',
                    fontWeight: 600,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface-hover, #f0f4f9)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  {row.icon}
                  <span>{row.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ─── Sağ: Bildirim, Firma Seçici & Kullanıcı Profili ─── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Çevrimiçi Rozeti */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: 'var(--radius-full, 9999px)',
              background: isOnline ? 'var(--success-bg, rgba(30, 169, 124, 0.1))' : 'var(--danger-bg, rgba(239, 83, 80, 0.1))',
              color: isOnline ? 'var(--success-text, #147a58)' : 'var(--danger-text, #c63431)',
              fontSize: 'var(--fs-xs, 11px)',
              fontWeight: 600,
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isOnline ? 'var(--success, #1ea97c)' : 'var(--danger, #ef5350)' }} />
            <span>{isOnline ? 'Online' : 'Offline'}</span>
          </div>

          {/* Bildirim Merkezi */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowNotifMenu(!showNotifMenu)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                position: 'relative',
                width: '40px',
                height: '40px',
                borderRadius: 'var(--radius-sm, 6px)',
                color: 'var(--text-main, #1a1f2e)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 140ms ease',
              }}
              onMouseEnter={ghostHover}
              onMouseLeave={ghostLeave}
              title="Bildirimler"
            >
              <Bell size={20} />
              {/* 2026-09-13 (uydurma temizliği): Önceden bildirim yokken rozet
                  sabit '3' gösteriyordu — kullanıcıya var olmayan 3 bildirim
                  vaat ediyordu. Sayı YALNIZ gerçek bildirim varsa gösterilir;
                  yoksa rozet hiç render edilmez. */}
              {notifications.length > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '6px',
                    right: '6px',
                    minWidth: '16px',
                    height: '16px',
                    padding: '0 4px',
                    borderRadius: 'var(--radius-full, 9999px)',
                    background: 'var(--danger, #ef5350)',
                    color: '#ffffff',
                    fontSize: 'var(--fs-2xs, 10px)',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid var(--bg-surface, #ffffff)',
                  }}
                >
                  {notifications.length}
                </span>
              )}
            </button>

            {/* FAZ 25.3-F: Bildirim açılır paneli — dashboard bildirimlerini listeler */}
            {showNotifMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '8px',
                  width: '300px',
                  maxHeight: '360px',
                  overflowY: 'auto',
                  background: 'var(--bg-surface, #ffffff)',
                  border: '1px solid var(--border-light, #edf1f7)',
                  borderRadius: 'var(--radius-md, 8px)',
                  boxShadow: 'var(--shadow-xl, 0 12px 32px rgba(23, 32, 51, 0.13))',
                  zIndex: 1100,
                }}
              >
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-light, #edf1f7)', fontWeight: 600, fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-main, #1a1f2e)' }}>
                  Bildirimler {notifications.length > 0 && `(${notifications.length})`}
                </div>
                {notifications.length === 0 ? (
                  <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--text-muted, #5f6779)', fontSize: '0.8rem' }}>
                    <Bell size={22} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.5 }} />
                    Yeni bildiriminiz yok. Her şey yolunda görünüyor.
                  </div>
                ) : (
                  notifications.map((n, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '10px 16px',
                        borderBottom: idx < notifications.length - 1 ? '1px solid var(--border-light, #edf1f7)' : 'none',
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'flex-start',
                      }}
                    >
                      <span
                        style={{
                          width: '8px', height: '8px', borderRadius: '50%', marginTop: '5px', flexShrink: 0,
                          background:
                            n.severity === 'ERROR' ? 'var(--danger, #ef5350)'
                            : n.severity === 'WARNING' ? 'var(--warning, #e8a23d)'
                            : n.severity === 'SUCCESS' ? 'var(--success, #1ea97c)'
                            : 'var(--info, #3b82f6)',
                        }}
                      />
                      <div style={{ lineHeight: 1.4 }}>
                        <div style={{ fontSize: 'var(--fs-xs, 11px)', fontWeight: 600, color: 'var(--text-main, #1a1f2e)' }}>
                          {n.title || 'Bildirim'}
                        </div>
                        {n.message && (
                          <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted, #5f6779)' }}>{n.message}</div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Firma / Tenant Seçici */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowTenantMenu(!showTenantMenu)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                background: 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-md, 8px)',
                color: 'var(--text-main, #1a1f2e)',
                fontSize: 'var(--fs-sm, 12px)',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 140ms ease',
              }}
              onMouseEnter={ghostHover}
              onMouseLeave={ghostLeave}
            >
              <Building size={15} color="var(--text-muted, #5f6779)" />
              {/* 2026-09-13 (uydurma temizliği): Önceden kiracı yoksa
                  'Demo Şirket' yazıyordu — var olmayan bir firma adı.
                  Artık nötr 'Şirket seçilmedi' gösterilir. */}
              <span style={{ maxWidth: '140px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {activeTenant?.name || 'Şirket seçilmedi'}
              </span>
              <ChevronDown size={14} color="var(--text-light, #8b93a5)" />
            </button>
          </div>

          {/* Kullanıcı Profili & Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              aria-label="Kullanıcı menüsü"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-sm, 6px)',
                cursor: 'pointer',
                padding: '4px 8px',
                transition: 'background 140ms ease',
              }}
              onMouseEnter={ghostHover}
              onMouseLeave={ghostLeave}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: 'var(--primary)',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: 'var(--fs-sm, 12px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {/* KURAL: Kullanıcı bilgisi yoksa UYDURMA isim/baş harf gösterilmez. */}
                {user?.fullName
                  ? user.fullName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
                  : (user?.username ? user.username.slice(0, 2).toUpperCase() : '?')}
              </div>
              <div style={{ textAlign: 'left', lineHeight: 1.25 }}>
                <div style={{ fontSize: 'var(--fs-sm, 12px)', fontWeight: 600, color: 'var(--text-main, #1a1f2e)' }}>
                  {user?.fullName || user?.username || 'Kullanıcı'}
                </div>
                <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted, #5f6779)' }}>
                  {user?.role === 'ADMIN' || user?.role === 'COMPANY_ADMIN' || user?.role === 'SUPER_ADMIN'
                    ? 'Yönetici'
                    : (user?.role || '—')}
                </div>
              </div>
              <ChevronDown size={14} color="var(--text-muted, #5f6779)" />
            </button>

            {showUserMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '8px',
                  width: '220px',
                  background: 'var(--bg-surface, #ffffff)',
                  border: '1px solid var(--border-light, #edf1f7)',
                  borderRadius: 'var(--radius-md, 8px)',
                  boxShadow: 'var(--shadow-xl, 0 12px 32px rgba(23, 32, 51, 0.13))',
                  padding: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  zIndex: 100,
                }}
              >
                <button
                  onClick={() => { setShowUserMenu(false); setActiveView('ayarlar'); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', background: 'transparent', border: 'none', borderRadius: 'var(--radius-md, 8px)', fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-main, #1a1f2e)', cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface-hover, #f0f4f9)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <Settings size={14} color="var(--text-muted, #5f6779)" />
                  <span>Sistem Ayarları</span>
                </button>
                <button
                  onClick={() => { setShowUserMenu(false); setIsUserMgmtModalOpen(true); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', background: 'transparent', border: 'none', borderRadius: 'var(--radius-md, 8px)', fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-main, #1a1f2e)', cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface-hover, #f0f4f9)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <UserCheck size={14} color="var(--text-muted, #5f6779)" />
                  <span>Kullanıcı Yönetimi</span>
                </button>
                {/* FAZ 25.3-F: Yardım & Destek erişimi (Bilgi Merkezi'ne yönlendirir) */}
                <button
                  onClick={() => { setShowUserMenu(false); setActiveView('support-center'); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', background: 'transparent', border: 'none', borderRadius: 'var(--radius-md, 8px)', fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-main, #1a1f2e)', cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface-hover, #f0f4f9)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <HelpCircle size={14} color="var(--text-muted, #5f6779)" />
                  <span>Yardım &amp; Destek</span>
                </button>
                <div style={{ height: '1px', background: 'var(--border-light, #edf1f7)', margin: '4px 0' }} />
                <button
                  onClick={() => { setShowUserMenu(false); logout(); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', background: 'transparent', border: 'none', borderRadius: 'var(--radius-md, 8px)', fontSize: 'var(--fs-sm, 12px)', color: 'var(--danger, #ef5350)', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--danger-bg, rgba(239, 83, 80, 0.1))'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <LogOut size={14} color="var(--danger, #ef5350)" />
                  <span>Güvenli Çıkış</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Modals */}
      {isLogoModalOpen && <CompanyLogoModal isOpen={isLogoModalOpen} onClose={() => setIsLogoModalOpen(false)} />}
      {isUserMgmtModalOpen && <UserManagementModal isOpen={isUserMgmtModalOpen} onClose={() => setIsUserMgmtModalOpen(false)} />}
      {isInviteModalOpen && <UserInvitationModal isOpen={isInviteModalOpen} onClose={() => setIsInviteModalOpen(false)} />}
    </>
  );
};
