import { BrandLogo } from './components/common/BrandLogo';
import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/layout/Header';
import { RibbonBar } from './components/layout/RibbonBar';
import { Sidebar } from './components/layout/Sidebar';
import { StatusBar } from './components/layout/StatusBar';
import { GlobalSearch } from './components/common/GlobalSearch';
import { PrintModal } from './components/common/PrintModal';
import { CollectionPaymentModal } from './components/modules/cari/CollectionPaymentModal';
import { FormDesignerView } from './components/formdesigner/FormDesignerView';
import { AccessDeniedView } from './components/common/AccessDeniedView';

// SaaS Pages & Onboarding
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { SetupWizard } from './components/modules/onboarding/SetupWizard';
import { SupportView } from './components/modules/support/SupportView';

// Modules
import { DashboardView } from './components/modules/dashboard/DashboardView';
import { CustomerListView } from './components/modules/cari/CustomerListView';
import { POSSalesView } from './components/modules/satis/POSSalesView';
import { InvoiceListView } from './components/modules/satis/InvoiceListView';
import { PurchaseInvoiceView } from './components/modules/alis/PurchaseInvoiceView';
import { ProductListView } from './components/modules/stok/ProductListView';
import { CashRegisterView } from './components/modules/kasa/CashRegisterView';
import { BankAccountView } from './components/modules/banka/BankAccountView';
import { CheckNotesView } from './components/modules/ceksenet/CheckNotesView';
import { EmployeeView } from './components/modules/personel/EmployeeView';
import { ReportsView } from './components/modules/raporlar/ReportsView';
import { AIAssistantView } from './components/modules/ai/AIAssistantView';
import { SettingsView } from './components/modules/ayarlar/SettingsView';

// Phase 2 Modules & Modals
import { QuotesOrdersView } from './components/modules/teklif/QuotesOrdersView';
import { WaybillListView } from './components/modules/irsaliye/WaybillListView';
import { ExpenseListView } from './components/modules/gider/ExpenseListView';
import { ImportWizardModal } from './components/common/ImportWizardModal';
import { EInvoicePreviewModal } from './components/common/EInvoicePreviewModal';
import { TenantManagementView } from './components/modules/tenants/TenantManagementView';
import { CompanyManagementView } from './components/modules/companies/CompanyManagementView';
import { AdminPanelView } from './components/modules/yonetim/AdminPanelView';
import { EDonusumView } from './components/modules/edonusum/EDonusumView';
import { EDonusumMerkeziView } from './components/modules/edonusummerkezi/EDonusumMerkeziView';
import { HizliBayiYonetimeView } from './components/modules/hizlibilisim/HizliBayiYonetimeView';
import { RolesPermissionsView } from './components/modules/RolesPermissionsView';
import { AcceptInvitePage } from './pages/AcceptInvitePage';
// FAZ 5: SaaS & Bayi Modülleri
import { ImpersonationBanner } from './components/layout/ImpersonationBanner';

// FAZ 6: Mobil + Saha + POS + Banka + QR + Raporlama
import { FieldCollectionListView } from './components/modules/saha/FieldCollectionListView';
import { MobilePOSView } from './components/modules/pos/MobilePOSView';
import { BankReconciliationView } from './components/modules/banka/BankReconciliationView';
import { PaymentLinksView } from './components/modules/paymentlinks/PaymentLinksView';
import { AdvancedReportsView } from './components/modules/raporlar/AdvancedReportsView';
import { ReportDesignerView } from './components/modules/raporlar/ReportDesignerView';
import { MobileAppView } from './components/modules/mobile/MobileAppView';
import { PublicPaymentPage } from './pages/PublicPaymentPage';

// FAZ 7: AI Muhasebe + OCR + Akıllı Finans + Otomasyon + Mali Müşavir Platformu
import { AIMerkeziView } from './components/modules/ai/AIMerkeziView';
import { DocumentAIView } from './components/modules/ai/DocumentAIView';
import { CashFlowForecastView } from './components/modules/ai/CashFlowForecastView';
import { AccountingAuditDeskView } from './components/modules/ai/AccountingAuditDeskView';
import { AccountantPortalView } from './components/modules/accountant/AccountantPortalView';
import { AutomationStudioView } from './components/modules/automations/AutomationStudioView';

// FAZ 8: Müşteri Portalı + Belge Merkezi + Görev & Onay + İletişim + Güvenlik
import { ClientPortalDashboardView } from './components/modules/client/ClientPortalDashboardView';
import { DocumentCenterView } from './components/modules/documents/DocumentCenterView';
import { TaskManagementView } from './components/modules/tasks/TaskManagementView';
import { ApprovalCenterView } from './components/modules/approvals/ApprovalCenterView';
import { CollaborationMessengerView } from './components/modules/messaging/CollaborationMessengerView';
import { SupportKnowledgeCenterView } from './components/modules/support/SupportKnowledgeCenterView';
import { DeviceSecurityView } from './components/modules/devices/DeviceSecurityView';
import { ActivityAuditStreamView } from './components/modules/audit/ActivityAuditStreamView';
import { CommandPaletteModal } from './components/common/CommandPaletteModal';
import { QuickActionFab } from './components/common/QuickActionFab';
import { PublicDocumentSharePage } from './pages/PublicDocumentSharePage';

// FAZ 9: SaaS Platform + Bayi + Marketplace + API Platformu + White-Label (Consolidated Master Views)
import { PlatformAdminView } from './components/modules/platform/PlatformAdminView';
import { DealerPortalView } from './components/modules/dealer/DealerPortalView';
import { DeveloperPortalView } from './components/modules/developer/DeveloperPortalView';
import { MarketplaceStoreView } from './components/modules/marketplace/MarketplaceStoreView';
import { CustomerBillingPortalView } from './components/modules/billing/CustomerBillingPortalView';
import { WhiteLabelSettingsView } from './components/modules/whitelabel/WhiteLabelSettingsView';

// Consolidated Core Hub Views
import { FaturalarHubView } from './components/modules/faturalar/FaturalarHubView';
import { FinansHubView } from './components/modules/finans/FinansHubView';
import { MuhasebeDefterView } from './components/modules/muhasebe/MuhasebeDefterView';
import { VergiBeyannameView } from './components/modules/vergi/VergiBeyannameView';

const MainLayout: React.FC = () => {
  const {
    activeView,
    isFastCollectionOpen,
    setIsFastCollectionOpen,
    isFastPaymentOpen,
    setIsFastPaymentOpen,
    isImportModalOpen,
    setIsImportModalOpen,
    importType,
    isEInvoiceModalOpen,
    setIsEInvoiceModalOpen,
    selectedEInvoiceInvoiceId,
    formDesignerId,
    setActiveView,
    setActiveRibbonTab,
  } = useApp();

  const { showOnboardingWizard, setShowOnboardingWizard, canAccessModule } = useAuth();

  // FAZ 17: Guard helper — erişim yoksa AccessDenied döndür
  const guard = (moduleId: string, component: React.ReactNode): React.ReactNode => {
    if (!canAccessModule(moduleId)) {
      return <AccessDeniedView moduleId={moduleId} />;
    }
    return component;
  };

  const renderActiveView = () => {
    switch (activeView) {
      case 'dashboard': return <DashboardView />;
      case 'cari': return guard('cari', <CustomerListView />);
      case 'pos': return guard('pos', <POSSalesView />);
      case 'teklif': return guard('teklif', <QuotesOrdersView />);
      case 'faturalar': return guard('faturalar', <FaturalarHubView />);
      case 'finans': return guard('finans', <FinansHubView />);
      case 'muhasebe': return guard('muhasebe', <MuhasebeDefterView />);
      case 'vergi': return guard('vergi', <VergiBeyannameView />);
      case 'irsaliye': return guard('irsaliye', <WaybillListView />);
      case 'satis': return guard('satis', <InvoiceListView />);
      case 'alis': return guard('alis', <PurchaseInvoiceView />);
      case 'gider': return guard('gider', <ExpenseListView />);
      case 'stok': return guard('stok', <ProductListView />);
      case 'kasa': return guard('kasa', <CashRegisterView />);
      case 'banka': return guard('banka', <BankAccountView />);
      case 'ceksenet': return guard('ceksenet', <CheckNotesView />);
      case 'personel': return guard('personel', <EmployeeView />);
      case 'raporlar': return <ReportsView />;
      case 'ai': return guard('ai', <AIAssistantView />);
      case 'ayarlar': return guard('ayarlar', <SettingsView />);
      case 'subscription':
      case 'customer-billing': return guard('customer-billing', <CustomerBillingPortalView />);
      case 'dealers':
      case 'dealer-portal': return guard('dealers', <DealerPortalView />);
      case 'saas-admin':
      case 'platform-admin': return guard('platform-admin', <PlatformAdminView />);
      case 'saha-tahsilat': return guard('saha-tahsilat', <FieldCollectionListView />);
      case 'mobil-pos': return guard('mobil-pos', <MobilePOSView />);
      case 'banka-mutabakat': return guard('banka-mutabakat', <BankReconciliationView />);
      case 'odeme-linkleri': return guard('odeme-linkleri', <PaymentLinksView />);
      case 'gelismis-raporlar': return guard('gelismis-raporlar', <AdvancedReportsView />);
      case 'rapor-tasarimci': return guard('rapor-tasarimci', <ReportDesignerView />);
      case 'mobil-uygulama': return guard('mobil-uygulama', <MobileAppView />);
      case 'ai-merkezi': return guard('ai-merkezi', <AIMerkeziView />);
      case 'document-ai': return guard('document-ai', <DocumentAIView />);
      case 'nakit-tahmin': return guard('nakit-tahmin', <CashFlowForecastView />);
      case 'muhasebe-kontrol': return guard('muhasebe-kontrol', <AccountingAuditDeskView />);
      case 'mali-musavir': return guard('mali-musavir', <AccountantPortalView />);
      case 'otomasyon': return guard('otomasyon', <AutomationStudioView />);
      case 'client-portal': return guard('client-portal', <ClientPortalDashboardView />);
      case 'documents': return guard('documents', <DocumentCenterView />);
      case 'tasks': return guard('tasks', <TaskManagementView />);
      case 'approvals': return guard('approvals', <ApprovalCenterView />);
      case 'collaboration': return guard('collaboration', <CollaborationMessengerView />);
      case 'support-center': return <SupportKnowledgeCenterView />;
      case 'device-security': return guard('device-security', <DeviceSecurityView />);
      case 'activity-logs': return guard('activity-logs', <ActivityAuditStreamView />);
      case 'developer-portal': return guard('developer-portal', <DeveloperPortalView />);
      case 'marketplace-store': return guard('marketplace-store', <MarketplaceStoreView />);
      case 'whitelabel-settings': return guard('whitelabel-settings', <WhiteLabelSettingsView />);
      case 'companies':
      case 'tenants': return guard('companies', <CompanyManagementView />);
      case 'roles-permissions': return guard('roles-permissions', <RolesPermissionsView />);
      case 'hizlibilisim': return guard('hizlibilisim', <HizliBayiYonetimeView />);
      case 'admin': return guard('admin', <AdminPanelView />);
      case 'edonusum': return guard('edonusum', <EDonusumView />);
      case 'edonusummerkezi': return guard('edonusummerkezi', <EDonusumMerkeziView />);
      case 'support': return <SupportView />;
      case 'form-designer': return (
        <FormDesignerView
          designId={formDesignerId}
          onBack={() => {
            setActiveView('ayarlar');
            setActiveRibbonTab('AYARLAR');
          }}
        />
      );
      default: return <DashboardView />;
    }
  };

  // Hide header+ribbon+sidebar in form-designer for full-screen experience
  const isFormDesigner = activeView === 'form-designer';

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Platform Admin Impersonation Denetim Banner */}
      <ImpersonationBanner />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sol Akıllı Menü */}
        {!isFormDesigner && <Sidebar />}

        {/* Ana Uygulama Gövdesi */}
        <div className="app-main">
          {/* Üst Başlık */}
          {!isFormDesigner && <Header />}

          {/* Fluent Office Ribbon Bar (Modüllerde aktif, Dashboard'da ferah M3 düzeni) */}
          {!isFormDesigner && activeView !== 'dashboard' && <RibbonBar />}

          {/* Aktif Modül İçeriği */}
          <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {renderActiveView()}
          </main>

          {/* Alt Durum Çubuğu */}
          {!isFormDesigner && activeView !== 'dashboard' && <StatusBar />}
        </div>
      </div>

      {/* Global Modallar & Arama */}
      <GlobalSearch />
      <PrintModal />

      {/* Hızlı Tahsilat / Ödeme Modalları (F8 & F9) */}
      <CollectionPaymentModal
        isOpen={isFastCollectionOpen}
        onClose={() => setIsFastCollectionOpen(false)}
        mode="COLLECTION"
      />
      <CollectionPaymentModal
        isOpen={isFastPaymentOpen}
        onClose={() => setIsFastPaymentOpen(false)}
        mode="PAYMENT"
      />

      {/* Toplu Excel / CSV İçe Aktarma Sihirbazı */}
      <ImportWizardModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        importType={importType}
      />

      {/* E-Fatura & GİB Karekod Önizleme Modalı */}
      <EInvoicePreviewModal
        isOpen={isEInvoiceModalOpen}
        onClose={() => setIsEInvoiceModalOpen(false)}
        invoiceId={selectedEInvoiceInvoiceId}
      />

      {/* Desktop Ctrl+K Hızlı Komut Paleti */}
      <CommandPaletteModal />

      {/* FAZ 25.3-E: Sağ alt "+Yeni" Hızlı İşlem FAB */}
      <QuickActionFab />

      {/* Yeni Kayıt İlk Kurulum Sihirbazı (Onboarding Wizard) */}
      {showOnboardingWizard && (
        <SetupWizard onComplete={() => setShowOnboardingWizard(false)} />
      )}
    </div>
  );
};

const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading, getInitialView } = useAuth();
  const [authScreen, setAuthScreen] = useState<'LANDING' | 'LOGIN' | 'REGISTER'>('LANDING');
  const [initialViewSet, setInitialViewSet] = useState(false);

  // Check if landing on public payment link (/pay/:token)
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/pay/')) {
    const token = window.location.pathname.replace('/pay/', '').trim();
    if (token) {
      return <PublicPaymentPage token={token} />;
    }
  }

  // Check if landing on public document share link (/share/:token)
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/share/')) {
    const token = window.location.pathname.replace('/share/', '').trim();
    if (token) {
      return <PublicDocumentSharePage token={token} />;
    }
  }

  // Check if landing on accept-invite URL
  if (typeof window !== 'undefined' && (window.location.pathname === '/accept-invite' || window.location.search.includes('token='))) {
    return <AcceptInvitePage />;
  }

  if (isLoading) {
    return (
      // 2026-09-13 (tasarım düzeltmesi): Açılış (yükleniyor) ekranı koyu bir
      // zeminde ve açık mavi metinle çiziliyordu; uygulama kabuğu açık temaya
      // geçtiği için bu ekran "başka bir program" gibi görünüyordu. Açık yüzey
      // token'larına ve normal başlık ağırlığına çevrildi.
      <div style={{ minHeight: '100vh', background: 'var(--bg-surface-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--info)', fontFamily: 'system-ui' }}>
        <div style={{ textAlign: 'center' }}>
          <BrandLogo width={280} style={{ marginBottom: 16 }} />
          <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-base, 13px)' }}>Yükleniyor...</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (authScreen === 'LOGIN') {
      return (
        <LoginPage
          onRegisterClick={() => setAuthScreen('REGISTER')}
          onLandingClick={() => setAuthScreen('LANDING')}
          onSuccessLogin={() => setInitialViewSet(false)}
        />
      );
    }
    if (authScreen === 'REGISTER') {
      return (
        <RegisterPage
          onLoginClick={() => setAuthScreen('LOGIN')}
          onLandingClick={() => setAuthScreen('LANDING')}
          onSuccessRegister={() => setInitialViewSet(false)}
        />
      );
    }
    return (
      <LandingPage
        onLoginClick={() => setAuthScreen('LOGIN')}
        onRegisterClick={() => setAuthScreen('REGISTER')}
      />
    );
  }

  return (
    <AppProvider initialView={!initialViewSet ? (() => { setInitialViewSet(true); return getInitialView(); })() : undefined}>
      <MainLayout />
    </AppProvider>
  );
};

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
