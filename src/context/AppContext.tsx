import { useAuth } from './AuthContext';
import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Tenant, OperationalStatus } from '../types';

export type AppView = 
  | 'hizmetler'
  | 'dashboard'
  | 'cari'
  | 'stok'
  | 'faturalar'
  | 'finans'
  | 'muhasebe'
  | 'personel'
  | 'vergi'
  | 'raporlar'
  | 'ayarlar'
  | 'satis'
  | 'alis'
  | 'edonusum'
  | 'edonusummerkezi'
  | 'gelen-belgeler'
  | 'irsaliye'
  | 'teklif'
  | 'gider'
  | 'kasa'
  | 'banka'
  | 'ceksenet'
  | 'pos'
  | 'companies'
  | 'tenants'
  | 'hizlibilisim'
  | 'admin'
  | 'ai'
  | 'form-designer'
  | 'support'
  | 'roles-permissions'
  | 'subscription'
  | 'dealers'
  | 'saas-admin'
  | 'saha-tahsilat'
  | 'mobil-pos'
  | 'banka-mutabakat'
  | 'odeme-linkleri'
  | 'gelismis-raporlar'
  | 'rapor-tasarimci'
  | 'mobil-uygulama'
  | 'ai-merkezi'
  | 'document-ai'
  | 'nakit-tahmin'
  | 'muhasebe-kontrol'
  | 'mali-musavir'
  | 'otomasyon'
  | 'client-portal'
  | 'documents'
  | 'tasks'
  | 'approvals'
  | 'collaboration'
  | 'support-center'
  | 'device-security'
  | 'activity-logs'
  | 'platform-admin'
  | 'dealer-portal'
  | 'developer-portal'
  | 'marketplace-store'
  | 'customer-billing'
  | 'whitelabel-settings';

export type RibbonTab = 
  | 'ANASAYFA' 
  | 'CARI' 
  | 'SATIS' 
  | 'TEKLIF'
  | 'IRSALIYE'
  | 'GIDER'
  | 'ALIS' 
  | 'STOK' 
  | 'KASA_BANKA' 
  | 'CEK_SENET' 
  | 'RAPORLAR' 
  | 'AI_ASISTAN' 
  | 'AYARLAR';

interface AppContextType {
  activeView: AppView;
  setActiveView: (view: AppView) => void;
  activeRibbonTab: RibbonTab;
  setActiveRibbonTab: (tab: RibbonTab) => void;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
  // FAZ 25.3-F: mobil sidebar overlay aç/kapa
  isMobileSidebarOpen: boolean;
  setIsMobileSidebarOpen: (open: boolean) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  
  // Modals & Omnibox
  isGlobalSearchOpen: boolean;
  setIsGlobalSearchOpen: (open: boolean) => void;
  isFastCollectionOpen: boolean;
  setIsFastCollectionOpen: (open: boolean) => void;
  isFastPaymentOpen: boolean;
  setIsFastPaymentOpen: (open: boolean) => void;
  isNewCustomerModalOpen: boolean;
  setIsNewCustomerModalOpen: (open: boolean) => void;
  isNewProductModalOpen: boolean;
  setIsNewProductModalOpen: (open: boolean) => void;
  isNewInvoiceModalOpen: boolean;
  setIsNewInvoiceModalOpen: (open: boolean) => void;
  newInvoiceType: 'SALES' | 'PURCHASE';
  setNewInvoiceType: (type: 'SALES' | 'PURCHASE') => void;

  // New Modals
  isNewQuoteModalOpen: boolean;
  setIsNewQuoteModalOpen: (open: boolean) => void;
  isNewWaybillModalOpen: boolean;
  setIsNewWaybillModalOpen: (open: boolean) => void;
  isNewExpenseModalOpen: boolean;
  setIsNewExpenseModalOpen: (open: boolean) => void;
  isImportModalOpen: boolean;
  setIsImportModalOpen: (open: boolean) => void;
  importType: 'CUSTOMERS' | 'PRODUCTS';
  setImportType: (type: 'CUSTOMERS' | 'PRODUCTS') => void;
  isEInvoiceModalOpen: boolean;
  setIsEInvoiceModalOpen: (open: boolean) => void;
  selectedEInvoiceInvoiceId: string | null;
  setSelectedEInvoiceInvoiceId: (id: string | null) => void;

  // Print modal
  printData: { open: boolean; type: 'A4_INVOICE' | 'THERMAL_80MM' | 'STATEMENT' | 'QUOTE' | 'WAYBILL' | 'REPORT'; title: string; payload: any } | null;
  openPrintModal: (type: 'A4_INVOICE' | 'THERMAL_80MM' | 'STATEMENT' | 'QUOTE' | 'WAYBILL' | 'REPORT', title: string, payload: any) => void;
  closePrintModal: () => void;

  // Data refresh trigger
  refreshKey: number;
  triggerRefresh: () => void;

  // Online status
  isOnline: boolean;

  // Form Designer
  formDesignerId: string | null;
  openFormDesigner: (id?: string) => void;

  // Multi-Tenant
  tenants: Tenant[];
  activeTenant: Tenant | null;
  activeTenantId: string;
  switchTenant: (id: string) => Promise<boolean>;
  loadTenants: () => Promise<void>;

  /**
   * GELEN BELGELER'E ÖN SÜZGEÇLE GİT (2026-09-29).
   *
   * Pano kartları "3 fatura eşleştirme bekliyor" der ve kullanıcı tıkladığında
   * listeyi TAM O KOVADA açmalıdır. Aksi hâlde kullanıcı 300 belgelik listeye
   * düşer ve az önce gördüğü 3 belgeyi elle arar.
   *
   * `nonce` her çağrıda artar: kullanıcı aynı karta iki kez bastığında da
   * süzgecin yeniden uygulanması gerekir (önceki süzgeci elle değiştirmiş
   * olabilir).
   */
  incomingPreset: { tur: 'INVOICE' | 'DESPATCH'; durum: OperationalStatus | 'ALL'; nonce: number } | null;
  openIncomingDocuments: (preset?: { tur?: 'INVOICE' | 'DESPATCH'; durum?: OperationalStatus | 'ALL' }) => void;
}


const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode; initialView?: AppView }> = ({ children, initialView }) => {
  const [activeView, setActiveView] = useState<AppView>(initialView || 'dashboard');
  const [activeRibbonTab, setActiveRibbonTab] = useState<RibbonTab>('ANASAYFA');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  // FAZ 25.3-F: mobil sidebar overlay
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('isbey_theme');
    return saved === 'dark' ? 'dark' : 'light';
  });

  // Multi-Tenant State
  const { allowedTenants: tenants, activeTenant, switchCompany: switchAuthenticatedCompany, refreshProfile, canAccessModule } = useAuth();
  const activeTenantId = activeTenant?.id || '';
  
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [isFastCollectionOpen, setIsFastCollectionOpen] = useState(false);
  const [isFastPaymentOpen, setIsFastPaymentOpen] = useState(false);
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false);
  const [isNewProductModalOpen, setIsNewProductModalOpen] = useState(false);
  const [isNewInvoiceModalOpen, setIsNewInvoiceModalOpen] = useState(false);
  const [newInvoiceType, setNewInvoiceType] = useState<'SALES' | 'PURCHASE'>('SALES');

  // Phase 2 Modals
  const [isNewQuoteModalOpen, setIsNewQuoteModalOpen] = useState(false);
  const [isNewWaybillModalOpen, setIsNewWaybillModalOpen] = useState(false);
  const [isNewExpenseModalOpen, setIsNewExpenseModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importType, setImportType] = useState<'CUSTOMERS' | 'PRODUCTS'>('CUSTOMERS');
  const [isEInvoiceModalOpen, setIsEInvoiceModalOpen] = useState(false);
  const [selectedEInvoiceInvoiceId, setSelectedEInvoiceInvoiceId] = useState<string | null>(null);

  const [printData, setPrintData] = useState<{ open: boolean; type: 'A4_INVOICE' | 'THERMAL_80MM' | 'STATEMENT' | 'QUOTE' | 'WAYBILL' | 'REPORT'; title: string; payload: any } | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [formDesignerId, setFormDesignerId] = useState<string | null>(null);

  /** Gelen Belgeler'e ön süzgeçle gitme isteği (bkz. `openIncomingDocuments`). */
  const [incomingPreset, setIncomingPreset] = useState<
    { tur: 'INVOICE' | 'DESPATCH'; durum: OperationalStatus | 'ALL'; nonce: number } | null
  >(null);

  const openIncomingDocuments = (preset?: { tur?: 'INVOICE' | 'DESPATCH'; durum?: OperationalStatus | 'ALL' }) => {
    // `nonce` her çağrıda artar: aynı karta ikinci kez basıldığında da hedef
    // süzgeç yeniden uygulanır. Sabit bir değer olsaydı React state'i
    // değişmediği için ikinci tıklama hiçbir şey yapmazdı.
    setIncomingPreset(prev => ({
      tur: preset?.tur ?? prev?.tur ?? 'INVOICE',
      durum: preset?.durum ?? 'ALL',
      nonce: (prev?.nonce ?? 0) + 1,
    }));
    setActiveView('gelen-belgeler');
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    localStorage.setItem('isbey_theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  const triggerRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  const openPrintModal = (type: 'A4_INVOICE' | 'THERMAL_80MM' | 'STATEMENT' | 'QUOTE' | 'WAYBILL' | 'REPORT', title: string, payload: any) => {
    setPrintData({ open: true, type, title, payload });
  };


  const closePrintModal = () => {
    setPrintData(null);
  };

  const openFormDesigner = (id?: string) => {
    setFormDesignerId(id || null);
    setActiveView('form-designer');
    setActiveRibbonTab('AYARLAR');
  };

  const loadTenants = async () => {
    await refreshProfile();
  };

  const switchTenant = async (tenantId: string): Promise<boolean> => {
    try {
      const success = await switchAuthenticatedCompany(tenantId);
      if (success) {
        setIsFastCollectionOpen(false);
        setIsFastPaymentOpen(false);
        setIsNewCustomerModalOpen(false);
        setIsNewProductModalOpen(false);
        setIsNewInvoiceModalOpen(false);
        setIsNewQuoteModalOpen(false);
        setIsNewWaybillModalOpen(false);
        setIsNewExpenseModalOpen(false);
        setIsImportModalOpen(false);
        setIsEInvoiceModalOpen(false);
        setPrintData(null);
        triggerRefresh();
        return true;
      }
      return false;
    } catch (err) {
      console.error('[TENANT] Error switching tenant:', err);
      return false;
    }
  };

  useEffect(() => {
    loadTenants();
  }, [refreshKey]);

  // Keyboard Shortcuts Listener (CTRL+K, F4, F6, F8, F9, ESC)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Global Search: F10 or Ctrl+K or Cmd+K
      if ((e.key === 'F10' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) && canAccessModule('dashboard')) {
        e.preventDefault();
        setIsGlobalSearchOpen(prev => !prev);
      }

      // F4: Cari Modülüne veya Hızlı Tahsilata git
      if (e.key === 'F4' && canAccessModule('cari')) {
        e.preventDefault();
        setActiveView('cari');
        setActiveRibbonTab('CARI');
      }
      // F6: Stok Modülüne veya POS Arama
      if (e.key === 'F6' && canAccessModule('pos')) {
        e.preventDefault();
        setActiveView('pos');
        setActiveRibbonTab('SATIS');
      }
      // F8: Hızlı Tahsilat
      if (e.key === 'F8' && canAccessModule('kasa')) {
        e.preventDefault();
        setIsFastCollectionOpen(true);
      }
      // F9: Hızlı Ödeme
      if (e.key === 'F9' && canAccessModule('kasa')) {
        e.preventDefault();
        setIsFastPaymentOpen(true);
      }
      // ESC: Açık olan modalları kapat
      if (e.key === 'Escape') {
        setIsGlobalSearchOpen(false);
        setIsFastCollectionOpen(false);
        setIsFastPaymentOpen(false);
        setIsNewCustomerModalOpen(false);
        setIsNewProductModalOpen(false);
        setIsNewInvoiceModalOpen(false);
        setIsNewQuoteModalOpen(false);
        setIsNewWaybillModalOpen(false);
        setIsNewExpenseModalOpen(false);
        setIsImportModalOpen(false);
        setIsEInvoiceModalOpen(false);
        closePrintModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canAccessModule]);

  return (
    <AppContext.Provider
      value={{
        activeView,
        setActiveView,
        activeRibbonTab,
        setActiveRibbonTab,
        isSidebarCollapsed,
        setIsSidebarCollapsed,
        isMobileSidebarOpen,
        setIsMobileSidebarOpen,
        theme,
        toggleTheme,
        isGlobalSearchOpen,
        setIsGlobalSearchOpen,
        isFastCollectionOpen,
        setIsFastCollectionOpen,
        isFastPaymentOpen,
        setIsFastPaymentOpen,
        isNewCustomerModalOpen,
        setIsNewCustomerModalOpen,
        isNewProductModalOpen,
        setIsNewProductModalOpen,
        isNewInvoiceModalOpen,
        setIsNewInvoiceModalOpen,
        newInvoiceType,
        setNewInvoiceType,
        isNewQuoteModalOpen,
        setIsNewQuoteModalOpen,
        isNewWaybillModalOpen,
        setIsNewWaybillModalOpen,
        isNewExpenseModalOpen,
        setIsNewExpenseModalOpen,
        isImportModalOpen,
        setIsImportModalOpen,
        importType,
        setImportType,
        isEInvoiceModalOpen,
        setIsEInvoiceModalOpen,
        selectedEInvoiceInvoiceId,
        setSelectedEInvoiceInvoiceId,
        printData,
        openPrintModal,
        closePrintModal,
        refreshKey,
        triggerRefresh,
        isOnline,
        formDesignerId,
        openFormDesigner,
        tenants,
        activeTenant,
        activeTenantId,
        switchTenant,
        loadTenants,
        incomingPreset,
        openIncomingDocuments,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};


export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};
