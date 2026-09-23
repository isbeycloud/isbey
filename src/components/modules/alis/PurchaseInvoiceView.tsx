import React, { useState, useEffect } from 'react';
import { DataGrid } from '../../common/DataGrid';
import type { Column } from '../../common/DataGrid';
import type { Invoice } from '../../../types';
import { api } from '../../../services/api';
import { useApp } from '../../../context/AppContext';
import { useToast } from '../../../context/ToastContext';
import { NewInvoiceModal } from '../satis/NewInvoiceModal';
import { OfficialEInvoiceViewerModal } from '../edonusum/OfficialEInvoiceViewerModal';
import {
  Plus,
  Printer,
  Trash2,
  Eye,
  ShoppingBag,
  ArrowDownLeft,
  Copy,
  RotateCcw,
  RefreshCw,
  CheckCircle2,
  DownloadCloud,
} from 'lucide-react';

export const PurchaseInvoiceView: React.FC = () => {
  const {
    isNewInvoiceModalOpen,
    setIsNewInvoiceModalOpen,
    newInvoiceType,
    setNewInvoiceType,
    openPrintModal,
    refreshKey,
    triggerRefresh,
  } = useApp();
  const { showToast } = useToast();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  // Official Viewer Modal
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [isViewerModalOpen, setIsViewerModalOpen] = useState(false);

  // Incoming e-Invoice Import Modal
  const [isIncomingModalOpen, setIsIncomingModalOpen] = useState(false);
  const [incomingList, setIncomingList] = useState<Invoice[]>([]);
  const [importingId, setImportingId] = useState<string | null>(null);

  useEffect(() => {
    loadInvoices();
  }, [refreshKey]);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const res = await api.getInvoices({ type: 'PURCHASE' });
      if (res.success) {
        setInvoices(res.invoices);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = (inv: Invoice) => {
    openPrintModal('A4_INVOICE', `Alış Faturası - ${inv.invoiceNo}`, inv);
  };

  const handleDelete = async (inv: Invoice) => {
    if (!window.confirm(`${inv.invoiceNo} nolu alış faturasını iptal etmek istediğinize emin misiniz?`)) {
      return;
    }
    try {
      const res = await api.deleteInvoice(inv.id);
      if (res.success) {
        showToast(res.message, 'success');
        triggerRefresh();
      }
    } catch (err: any) {
      showToast(err.message || 'Fatura iptal edilemedi.', 'error');
    }
  };

  const handleDuplicate = async (inv: Invoice) => {
    try {
      const res = await api.duplicateInvoice(inv.id);
      if (res.success) {
        showToast(res.message, 'success');
        triggerRefresh();
      }
    } catch (err: any) {
      showToast(err.message || 'Fatura kopyalanamadı.', 'error');
    }
  };

  const handleConvertReturn = async (inv: Invoice) => {
    if (!window.confirm(`${inv.invoiceNo} nolu alış faturası için İade Çıkış Faturası oluşturulsun mu?`)) return;
    try {
      const res = await api.convertInvoiceToReturn(inv.id);
      if (res.success) {
        showToast(res.message, 'success');
        triggerRefresh();
      }
    } catch (err: any) {
      showToast(err.message || 'İade faturası oluşturulamadı.', 'error');
    }
  };

  const handleOpenIncomingModal = async () => {
    setIsIncomingModalOpen(true);
    try {
      const res = await api.getIncomingEInvoices();
      if (res.success) {
        setIncomingList(res.incomingInvoices);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleImportIncoming = async (inv: Invoice) => {
    setImportingId(inv.id);
    try {
      const res = await api.convertIncomingToPurchase(inv.id, { updateStock: true });
      if (res.success) {
        showToast(res.message, 'success');
        triggerRefresh();
        setIsIncomingModalOpen(false);
      }
    } catch (err: any) {
      showToast(err.message || 'Gelen fatura aktarılamadı.', 'error');
    } finally {
      setImportingId(null);
    }
  };

  const handleOpenViewer = (inv: Invoice) => {
    setViewingInvoice(inv);
    setIsViewerModalOpen(true);
  };

  const columns: Column<Invoice>[] = [
    {
      key: 'invoiceNo',
      title: 'Fatura No',
      width: '130px',
      render: inv => (
        <div>
          <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{inv.invoiceNo}</span>
          {inv.invoiceCategory === 'IADE' && (
            <span className="badge badge-danger" style={{ marginLeft: '4px' }}>
              İADE
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'date',
      title: 'Tarih',
      width: '100px',
    },
    {
      key: 'customerTitle',
      title: 'Tedarikçi Firma',
      render: inv => (
        <div>
          <div style={{ fontWeight: 600 }}>{inv.customerTitle}</div>
          <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>
            {inv.customerCode} {inv.recipientTaxNumber ? `| VKN: ${inv.recipientTaxNumber}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'itemsCount',
      title: 'Kalem',
      numeric: true,
      width: '70px',
      render: inv => <span>{inv.items?.length || 0} Adet</span>,
    },
    {
      key: 'subTotal',
      title: 'Ara Toplam (Net)',
      numeric: true,
      width: '120px',
      render: inv => <span>{(inv.subTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>,
    },
    {
      key: 'totalVat',
      title: 'KDV',
      numeric: true,
      width: '100px',
      render: inv => <span>{(inv.totalVat || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>,
    },
    {
      key: 'grandTotal',
      title: 'Genel Toplam',
      numeric: true,
      width: '140px',
      render: inv => (
        <span style={{ fontWeight: 700, color: 'var(--danger)', fontSize: 'var(--fs-md, 14px)' }}>
          {(inv.grandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
        </span>
      ),
    },
    {
      key: 'paymentStatus',
      title: 'Ödeme Durumu',
      width: '120px',
      render: inv => (
        <span className={`badge ${inv.paymentStatus === 'PAID' ? 'badge-success' : 'badge-danger'}`}>
          {inv.paymentStatus === 'PAID' ? 'Ödendi' : 'Borçlu / Açık'}
        </span>
      ),
    },
    {
      key: 'actions',
      title: 'İşlemler',
      sortable: false,
      width: '180px',
      render: inv => (
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
          <button
            className="btn btn-secondary btn-sm"
            title="GİB Görselini İncele"
            style={{ color: 'var(--info)', padding: '4px 6px' }}
            onClick={() => handleOpenViewer(inv)}
          >
            <Eye size={14} />
          </button>
          <button
            className="btn btn-secondary btn-sm"
            title="Faturayı Çoğalt"
            style={{ padding: '4px 6px' }}
            onClick={() => handleDuplicate(inv)}
          >
            <Copy size={13} />
          </button>
          <button
            className="btn btn-secondary btn-sm"
            title="İade Çıkış Faturası Oluştur"
            style={{ color: 'var(--warning)', padding: '4px 6px' }}
            onClick={() => handleConvertReturn(inv)}
          >
            <RotateCcw size={13} />
          </button>
          <button
            className="btn btn-secondary btn-sm"
            title="A4 Yazdır"
            style={{ padding: '4px 6px' }}
            onClick={() => handlePrint(inv)}
          >
            <Printer size={13} />
          </button>
          <button
            className="btn btn-secondary btn-sm"
            title="İptal Et"
            style={{ padding: '4px 6px' }}
            onClick={() => handleDelete(inv)}
          >
            <Trash2 size={13} color="var(--danger)" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="view-content-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Alış Faturaları ve Mal Girişleri</h2>
          <p style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>Tedarikçi faturaları ve stok giriş kayıtları</p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleOpenIncomingModal}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <DownloadCloud size={16} color="var(--info)" />
            <span>Gelen e-Faturalardan Aktar</span>
          </button>

          <button
            className="btn btn-primary"
            onClick={() => {
              setNewInvoiceType('PURCHASE');
              setIsNewInvoiceModalOpen(true);
            }}
          >
            <Plus size={16} />
            <span>Yeni Alış Faturası Girişi</span>
          </button>
        </div>
      </div>

      <DataGrid
        columns={columns}
        data={invoices}
        searchPlaceholder="Alış fatura no veya tedarikçi adı ile ara..."
        onRowClick={inv => handleOpenViewer(inv)}
        showTotals={true}
        totalColumns={['subTotal', 'totalVat', 'grandTotal']}
      />

      <NewInvoiceModal
        isOpen={isNewInvoiceModalOpen}
        onClose={() => setIsNewInvoiceModalOpen(false)}
        invoiceType="PURCHASE"
      />

      <OfficialEInvoiceViewerModal
        isOpen={isViewerModalOpen}
        onClose={() => setIsViewerModalOpen(false)}
        invoice={viewingInvoice}
      />

      {/* Gelen e-Fatura Aktarım Penceresi */}
      {isIncomingModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(23, 32, 51, 0.45)',
            // 2026-09-13 (tasarım sadeleştirmesi): backdropFilter: blur(3px) kaldırıldı
            // (glassmorphism yasak). Düz karartma perde olarak korunuyor.
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderRadius: 'var(--radius-lg, 10px)',
              maxWidth: '850px',
              width: '100%',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <DownloadCloud size={20} color="var(--info)" />
                <h3 style={{ margin: 0, fontSize: 'var(--fs-base, 13px)', fontWeight: 700 }}>Gelen e-Faturaları İçe Aktar</h3>
              </div>
              <button
                onClick={() => setIsIncomingModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--fs-lg, 16px)', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
              {incomingList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                  Henüz gelen kutusunda aktarılmamış fatura bulunmuyor.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {incomingList.map(item => (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md, 8px)',
                        background: 'var(--bg-surface-secondary)',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--primary)' }}>{item.invoiceNo}</div>
                        <div style={{ fontSize: 'var(--fs-sm, 12px)', fontWeight: 600 }}>{item.customerTitle}</div>
                        <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>
                          Tarih: {item.date} | Kalem: {item.items?.length || 0} Adet
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 'var(--fs-md, 14px)', fontWeight: 700, color: 'var(--text-main)' }}>
                            {(item.grandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                          </div>
                          <span className="badge badge-success">
                            e-Fatura
                          </span>
                        </div>

                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={importingId === item.id}
                          onClick={() => handleImportIncoming(item)}
                        >
                          {importingId === item.id ? <RefreshCw size={13} className="animate-spin" /> : <ArrowDownLeft size={13} />}
                          <span>Stoğa ve Alışa Aktar</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
