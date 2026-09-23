import React from 'react';
import {
  Home,
  Users,
  ShoppingCart,
  ShoppingBag,
  Package,
  Landmark,
  FileCheck,
  BarChart3,
  Sparkles,
  Settings,
  PlusCircle,
  DollarSign,
  CreditCard,
  Printer,
  Search,
  RefreshCw,
  ArrowRightLeft,
  Barcode,
  TrendingUp,
  AlertTriangle,
  FileText,
  Database,
  Sliders,
  ShieldCheck,
  Truck,
  Receipt,
  Upload,
  LayoutTemplate,
  Building,
} from 'lucide-react';

import { useApp } from '../../context/AppContext';
import type { RibbonTab, AppView } from '../../context/AppContext';

export const RibbonBar: React.FC = () => {
  const {
    activeRibbonTab,
    setActiveRibbonTab,
    setActiveView,
    setIsFastCollectionOpen,
    setIsFastPaymentOpen,
    setIsNewCustomerModalOpen,
    setIsNewProductModalOpen,
    setIsNewInvoiceModalOpen,
    setNewInvoiceType,
    setIsNewQuoteModalOpen,
    setIsNewWaybillModalOpen,
    setIsNewExpenseModalOpen,
    setIsImportModalOpen,
    setImportType,
    setIsGlobalSearchOpen,
    triggerRefresh,
    openFormDesigner,
  } = useApp();

  // 2026-09-13 (tasarım sadeleştirmesi): Sekme etiketleri ALL-CAPS idi
  // ("ANA SAYFA"). Şeritte her sekme bağırıyordu; başlık durumu (title case)
  // daha sakin ve Office şeridinin güncel diline daha yakın.
  const tabs: { id: RibbonTab; label: string; view: AppView; icon: React.ReactNode }[] = [
    { id: 'ANASAYFA', label: 'Ana Sayfa', view: 'dashboard', icon: <Home size={14} /> },
    { id: 'CARI', label: 'Cari', view: 'cari', icon: <Users size={14} /> },
    { id: 'TEKLIF', label: 'Teklif & Sipariş', view: 'teklif', icon: <FileText size={14} /> },
    { id: 'IRSALIYE', label: 'İrsaliye', view: 'irsaliye', icon: <Truck size={14} /> },
    { id: 'SATIS', label: 'Satış', view: 'satis', icon: <ShoppingCart size={14} /> },
    { id: 'ALIS', label: 'Alış', view: 'alis', icon: <ShoppingBag size={14} /> },
    { id: 'GIDER', label: 'Gider', view: 'gider', icon: <Receipt size={14} /> },
    { id: 'STOK', label: 'Stok', view: 'stok', icon: <Package size={14} /> },
    { id: 'KASA_BANKA', label: 'Kasa & Banka', view: 'kasa', icon: <Landmark size={14} /> },
    { id: 'CEK_SENET', label: 'Çek & Senet', view: 'ceksenet', icon: <FileCheck size={14} /> },
    { id: 'RAPORLAR', label: 'Raporlar', view: 'raporlar', icon: <BarChart3 size={14} /> },
    { id: 'AI_ASISTAN', label: 'AI Asistan', view: 'ai', icon: <Sparkles size={14} /> },
    { id: 'AYARLAR', label: 'Yönetim', view: 'ayarlar', icon: <Settings size={14} /> },
  ];


  const handleTabClick = (tab: RibbonTab, view: AppView) => {
    setActiveRibbonTab(tab);
    setActiveView(view);
  };

  return (
    <div className="ribbon-container">
      {/* Ribbon Tabs Row */}
      <div className="ribbon-tabs-row">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`ribbon-tab ${activeRibbonTab === tab.id ? 'active' : ''}`}
            onClick={() => handleTabClick(tab.id, tab.view)}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              {tab.icon}
              {tab.label}
            </span>
          </button>
        ))}
      </div>

      {/* Ribbon Content Row with Functional Groups */}
      <div className="ribbon-content-row">
        {/* TAB: ANASAYFA */}
        {activeRibbonTab === 'ANASAYFA' && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-items">
                <button
                  className="ribbon-btn-large primary"
                  onClick={() => { setActiveView('pos'); setActiveRibbonTab('SATIS'); }}
                >
                  <ShoppingCart size={20} />
                  <span>POS Satış (F6)</span>
                </button>
                <button className="ribbon-btn-large" onClick={() => setIsFastCollectionOpen(true)}>
                  <DollarSign size={20} />
                  <span>Tahsilat (F8)</span>
                </button>
                <button className="ribbon-btn-large" onClick={() => setIsFastPaymentOpen(true)}>
                  <CreditCard size={20} />
                  <span>Ödeme (F9)</span>
                </button>
              </div>
              <div className="ribbon-group-title">Hızlı Eylemler</div>
            </div>

            <div className="ribbon-group">
              <div className="ribbon-group-items">
                <button className="ribbon-btn-large" onClick={() => setIsGlobalSearchOpen(true)} title="Global Arama Penceresi (F10)">
                  <Search size={20} />
                  <span>Ara (F10)</span>
                </button>
                <button className="ribbon-btn-large" onClick={triggerRefresh}>
                  <RefreshCw size={20} />
                  <span>Yenile</span>
                </button>
              </div>
              <div className="ribbon-group-title">Görünüm & Araçlar</div>

            </div>
          </>
        )}

        {/* TAB: CARİ */}
        {activeRibbonTab === 'CARI' && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-items">
                <button className="ribbon-btn-large primary" onClick={() => setIsNewCustomerModalOpen(true)}>
                  <PlusCircle size={20} />
                  <span>Yeni Cari Kart</span>
                </button>
              </div>
              <div className="ribbon-group-title">Tanımlama</div>
            </div>

            <div className="ribbon-group">
              <div className="ribbon-group-items">
                <button className="ribbon-btn-large" onClick={() => setIsFastCollectionOpen(true)}>
                  <DollarSign size={20} />
                  <span>Tahsilat Al</span>
                </button>
                <button className="ribbon-btn-large" onClick={() => setIsFastPaymentOpen(true)}>
                  <CreditCard size={20} />
                  <span>Ödeme Yap</span>
                </button>
              </div>
              <div className="ribbon-group-title">Finansal Hareket</div>
            </div>

            <div className="ribbon-group">
              <div className="ribbon-group-items">
                <button
                  className="ribbon-btn-large"
                  onClick={() => {
                    setImportType('CUSTOMERS');
                    setIsImportModalOpen(true);
                  }}
                >
                  <Upload size={20} />
                  <span>Excel Cari İçe Aktar</span>
                </button>
              </div>
              <div className="ribbon-group-title">Dış Veri Aktarımı</div>
            </div>
          </>
        )}

        {/* TAB: TEKLİF & SİPARİŞ */}
        {activeRibbonTab === 'TEKLIF' && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-items">
                <button className="ribbon-btn-large primary" onClick={() => setIsNewQuoteModalOpen(true)}>
                  <PlusCircle size={20} />
                  <span>Yeni Teklif Hazırla</span>
                </button>
              </div>
              <div className="ribbon-group-title">Teklif İşlemleri</div>
            </div>

            <div className="ribbon-group">
              <div className="ribbon-group-items">
                <button className="ribbon-btn-large" onClick={() => setActiveView('teklif')}>
                  <FileText size={20} />
                  <span>Teklif & Sipariş Listesi</span>
                </button>
              </div>
              <div className="ribbon-group-title">Sipariş & Sevkiyat</div>
            </div>
          </>
        )}

        {/* TAB: İRSALİYE */}
        {activeRibbonTab === 'IRSALIYE' && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-items">
                <button className="ribbon-btn-large primary" onClick={() => setIsNewWaybillModalOpen(true)}>
                  <Truck size={20} />
                  <span>Yeni İrsaliye Düzenle</span>
                </button>
              </div>
              <div className="ribbon-group-title">İrsaliye & Sevk</div>
            </div>

            <div className="ribbon-group">
              <div className="ribbon-group-items">
                <button className="ribbon-btn-large" onClick={() => setActiveView('irsaliye')}>
                  <FileText size={20} color="#10b981" />
                  <span>Tüm İrsaliyeler</span>
                </button>
              </div>
              <div className="ribbon-group-title">Faturalaştırma</div>
            </div>
          </>
        )}

        {/* TAB: GİDER */}
        {activeRibbonTab === 'GIDER' && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-items">
                <button className="ribbon-btn-large primary" onClick={() => setIsNewExpenseModalOpen(true)}>
                  <PlusCircle size={20} />
                  <span>Yeni Masraf Fişi</span>
                </button>
              </div>
              <div className="ribbon-group-title">Masraf & Gider</div>
            </div>

            <div className="ribbon-group">
              <div className="ribbon-group-items">
                <button className="ribbon-btn-large" onClick={() => setActiveView('gider')}>
                  <Receipt size={20} />
                  <span>Gider Raporu</span>
                </button>
              </div>
              <div className="ribbon-group-title">Masraf Merkezleri</div>
            </div>
          </>
        )}


        {/* TAB: SATIŞ */}
        {activeRibbonTab === 'SATIS' && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-items">
                <button
                  className="ribbon-btn-large primary"
                  onClick={() => {
                    setNewInvoiceType('SALES');
                    setIsNewInvoiceModalOpen(true);
                  }}
                >
                  <PlusCircle size={20} />
                  <span>Satış Faturası</span>
                </button>
                <button
                  className="ribbon-btn-large"
                  onClick={() => { setActiveView('pos'); setActiveRibbonTab('SATIS'); }}
                >
                  <Barcode size={20} />
                  <span>Hızlı POS Satış</span>
                </button>
              </div>
              <div className="ribbon-group-title">Yeni Satış</div>
            </div>

            <div className="ribbon-group">
              <div className="ribbon-group-items">
                <button className="ribbon-btn-large" onClick={() => { setActiveView('satis'); }}>
                  <FileText size={20} />
                  <span>Tüm Faturalar</span>
                </button>
              </div>
              <div className="ribbon-group-title">Fatura Listesi</div>
            </div>
          </>
        )}

        {/* TAB: ALIŞ */}
        {activeRibbonTab === 'ALIS' && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-items">
                <button
                  className="ribbon-btn-large primary"
                  onClick={() => {
                    setNewInvoiceType('PURCHASE');
                    setIsNewInvoiceModalOpen(true);
                  }}
                >
                  <PlusCircle size={20} />
                  <span>Yeni Alış Faturası</span>
                </button>
              </div>
              <div className="ribbon-group-title">Tedarik & Giriş</div>
            </div>
          </>
        )}

        {/* TAB: STOK */}
        {activeRibbonTab === 'STOK' && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-items">
                <button className="ribbon-btn-large primary" onClick={() => setIsNewProductModalOpen(true)}>
                  <PlusCircle size={20} />
                  <span>Yeni Stok Kartı</span>
                </button>
              </div>
              <div className="ribbon-group-title">Tanımlamalar</div>
            </div>

            <div className="ribbon-group">
              <div className="ribbon-group-items">
                <button className="ribbon-btn-large" onClick={() => setActiveView('stok')}>
                  <ArrowRightLeft size={20} />
                  <span>Depo Transferi</span>
                </button>
                <button className="ribbon-btn-large" onClick={() => setActiveView('stok')}>
                  <AlertTriangle size={20} />
                  <span>Kritik Stoklar</span>
                </button>
              </div>
              <div className="ribbon-group-title">Hareketler & Depo</div>
            </div>
          </>
        )}

        {/* TAB: KASA & BANKA */}
        {activeRibbonTab === 'KASA_BANKA' && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-items">
                <button className="ribbon-btn-large primary" onClick={() => setActiveView('kasa')}>
                  <DollarSign size={20} />
                  <span>Kasa Listesi</span>
                </button>
                <button className="ribbon-btn-large" onClick={() => setActiveView('banka')}>
                  <Landmark size={20} />
                  <span>Banka Hesapları</span>
                </button>
              </div>
              <div className="ribbon-group-title">Hesaplar</div>
            </div>

            <div className="ribbon-group">
              <div className="ribbon-group-items">
                <button className="ribbon-btn-large" onClick={() => setIsFastCollectionOpen(true)}>
                  <PlusCircle size={20} color="#10b981" />
                  <span>Kasa Giriş</span>
                </button>
                <button className="ribbon-btn-large" onClick={() => setIsFastPaymentOpen(true)}>
                  <CreditCard size={20} />
                  <span>Kasa Çıkış</span>
                </button>
              </div>
              <div className="ribbon-group-title">Virman & Transfer</div>
            </div>
          </>
        )}

        {/* TAB: ÇEK & SENET */}
        {activeRibbonTab === 'CEK_SENET' && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-items">
                <button className="ribbon-btn-large primary" onClick={() => setActiveView('ceksenet')}>
                  <PlusCircle size={20} />
                  <span>Yeni Çek / Senet</span>
                </button>
              </div>
              <div className="ribbon-group-title">Portföy</div>
            </div>
          </>
        )}

        {/* TAB: RAPORLAR */}
        {activeRibbonTab === 'RAPORLAR' && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-items">
                <button className="ribbon-btn-large primary" onClick={() => setActiveView('raporlar')}>
                  <BarChart3 size={20} />
                  <span>Kâr / Zarar Raporu</span>
                </button>
                <button className="ribbon-btn-large" onClick={() => setActiveView('raporlar')}>
                  <TrendingUp size={20} />
                  <span>Stok Değerleme</span>
                </button>
              </div>
              <div className="ribbon-group-title">Mali Analizler</div>
            </div>
          </>
        )}

        {/* TAB: AI ASİSTAN */}
        {activeRibbonTab === 'AI_ASISTAN' && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-items">
                <button className="ribbon-btn-large primary" onClick={() => setActiveView('ai')}>
                  <Sparkles size={20} />
                  <span>Akıllı AI Analizi</span>
                </button>
              </div>
              <div className="ribbon-group-title">Yapay Zeka & Tahmin</div>
            </div>
          </>
        )}

        {/* TAB: AYARLAR */}
        {activeRibbonTab === 'AYARLAR' && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-group-items">
                <button className="ribbon-btn-large primary" onClick={() => openFormDesigner()}>
                  <LayoutTemplate size={20} />
                  <span>Form Tasarımcısı</span>
                </button>
                <button className="ribbon-btn-large" onClick={() => setActiveView('ayarlar')}>
                  <Sliders size={20} />
                  <span>Firma & Numaratör</span>
                </button>
              </div>
              <div className="ribbon-group-title">Tasarım & Yapılandırma</div>
            </div>

            <div className="ribbon-group">
              <div className="ribbon-group-items">
                <button className="ribbon-btn-large" onClick={() => setActiveView('tenants')}>
                  <Building size={20} />
                  <span>Şirket & Tenant</span>
                </button>
                <button className="ribbon-btn-large" onClick={() => setActiveView('ayarlar')}>
                  <Database size={20} />
                  <span>Yedek Al & Dön</span>
                </button>
                <button className="ribbon-btn-large" onClick={() => setActiveView('ayarlar')}>
                  <ShieldCheck size={20} />
                  <span>Audit Loglar</span>
                </button>
              </div>
              <div className="ribbon-group-title">Multi-Tenant & Güvenlik</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
