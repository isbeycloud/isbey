import React, { useState, useEffect } from 'react';
import { DataGrid } from '../../common/DataGrid';
import type { Column } from '../../common/DataGrid';
import type { Invoice } from '../../../types';
import { api } from '../../../services/api';
import { useApp } from '../../../context/AppContext';
import { useToast } from '../../../context/ToastContext';
import { NewInvoiceModal } from './NewInvoiceModal';
import { OfficialEInvoiceViewerModal } from '../edonusum/OfficialEInvoiceViewerModal';
import {
  Plus,
  Printer,
  Trash2,
  Eye,
  CheckCircle2,
  Clock,
  AlertCircle,
  QrCode,
  Send,
  Zap,
  RefreshCw,
  Copy,
  RotateCcw,
  CheckSquare,
  Square,
  FileSpreadsheet,
  Layers,
  Sparkles,
} from 'lucide-react';

export const InvoiceListView: React.FC = () => {
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
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PAID' | 'PARTIAL' | 'UNPAID'>('ALL');
  const [eInvoiceFilter, setEInvoiceFilter] = useState<'ALL' | 'SENT' | 'DRAFT' | 'MOCK'>('ALL');

  // Multi-select & Batch
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBatchSending, setIsBatchSending] = useState(false);

  // Official GİB Viewer Modal
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [isViewerModalOpen, setIsViewerModalOpen] = useState(false);

  useEffect(() => {
    loadInvoices();
  }, [statusFilter, refreshKey]);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const res = await api.getInvoices({ type: 'SALES', status: statusFilter });
      if (res.success) {
        setInvoices(res.invoices);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = (inv: Invoice, type: 'A4' | 'POS') => {
    if (type === 'POS') {
      openPrintModal('THERMAL_80MM', `POS Satış Fişi - ${inv.invoiceNo}`, inv);
    } else {
      openPrintModal('A4_INVOICE', `Satış Faturası - ${inv.invoiceNo}`, inv);
    }
  };

  const handleDelete = async (inv: Invoice) => {
    if (
      !window.confirm(
        `${inv.invoiceNo} nolu faturayı iptal etmek istediğinize emin misiniz? Faturaya ait tüm cari ve stok hareketleri geri alınacaktır!`
      )
    ) {
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

  const handleSendHizliInvoice = async (inv: Invoice) => {
    try {
      showToast(`${inv.invoiceNo} nolu fatura GİB'e iletiliyor...`, 'info');
      const res = await api.sendHizliInvoice(inv.id);
      if (res.success) {
        showToast(
          res.uuid
            ? `✓ Fatura GİB'e başarıyla iletildi! ETTN: ${res.uuid}`
            : '✓ Belge entegratöre iletildi (ETTN entegratör yanıtında dönmedi).',
          'success'
        );
        triggerRefresh();
      } else {
        showToast(res.message || 'Gönderim başarısız.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'GİB gönderimi sırasında hata oluştu.', 'error');
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
    if (!window.confirm(`${inv.invoiceNo} nolu fatura için İade Faturası oluşturulsun mu?`)) return;
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

  // Batch actions
  const handleToggleSelectAll = () => {
    if (selectedIds.length === filteredInvoices.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredInvoices.map(i => i.id));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const handleBatchSend = async () => {
    if (selectedIds.length === 0) return;
    setIsBatchSending(true);
    try {
      showToast(`${selectedIds.length} adet fatura GİB'e toplu olarak iletiliyor...`, 'info');
      const res = await api.batchSendEInvoices(selectedIds);
      if (res.success) {
        showToast(`✓ ${res.message}`, 'success');
        setSelectedIds([]);
        triggerRefresh();
      }
    } catch (err: any) {
      showToast(err.message || 'Toplu gönderim başarısız.', 'error');
    } finally {
      setIsBatchSending(false);
    }
  };

  const handleBatchSyncStatus = async () => {
    try {
      showToast('GİB durumları sorgulanıyor...', 'info');
      const res = await api.batchSyncEInvoiceStatus(selectedIds.length > 0 ? selectedIds : undefined);
      if (res.success) {
        showToast(`✓ ${res.message}`, 'success');
        triggerRefresh();
      }
    } catch (err: any) {
      showToast(err.message || 'Durum sorgulama hatası.', 'error');
    }
  };

  const handleOpenViewer = (inv: Invoice) => {
    setViewingInvoice(inv);
    setIsViewerModalOpen(true);
  };

  // Filter by E-Invoice status
  //
  // 2026-09-16 (`docs/47` §6/C): 'MOCK_SENT' hiçbir dala girmiyordu; bu kayıtlar
  // "GİB İletilenler" ve "Taslaklar" filtrelerinin İKİSİNDE DE listeden DÜŞÜYORDU.
  // Kullanıcı belgeyi arayıp bulamıyordu. Kendi dalına alındı: gönderilmedi,
  // ama taslak da değil — test sağlayıcısından geçmiş bir kayıt.
  const filteredInvoices = invoices.filter(inv => {
    if (eInvoiceFilter === 'SENT') return inv.eInvoiceStatus === 'SENT' || inv.eInvoiceStatus === 'DELIVERED';
    if (eInvoiceFilter === 'DRAFT') return inv.eInvoiceStatus === 'DRAFT' || !inv.eInvoiceStatus;
    if (eInvoiceFilter === 'MOCK') return inv.eInvoiceStatus === 'MOCK_SENT';
    return true;
  });

  const columns: Column<Invoice>[] = [
    {
      key: 'select',
      title: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <input
            type="checkbox"
            checked={filteredInvoices.length > 0 && selectedIds.length === filteredInvoices.length}
            onChange={handleToggleSelectAll}
            style={{ cursor: 'pointer' }}
          />
        </div>
      ),
      width: '40px',
      sortable: false,
      render: inv => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selectedIds.includes(inv.id)}
            onChange={() => handleToggleSelect(inv.id)}
            style={{ cursor: 'pointer' }}
          />
        </div>
      ),
    },
    {
      key: 'invoiceNo',
      title: 'Fatura No',
      width: '130px',
      render: inv => (
        <div>
          <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{inv.invoiceNo}</span>
          {inv.invoiceCategory === 'IADE' && (
            <span style={{ marginLeft: '4px', fontSize: '10px', background: '#fee2e2', color: '#b91c1c', padding: '1px 4px', borderRadius: '3px', fontWeight: 700 }}>
              İADE
            </span>
          )}
          {inv.invoiceCategory === 'TEVKIFAT' && (
            <span style={{ marginLeft: '4px', fontSize: '10px', background: '#ffedd5', color: '#c2410c', padding: '1px 4px', borderRadius: '3px', fontWeight: 700 }}>
              TEVKİFAT
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'date',
      title: 'Tarih',
      width: '95px',
    },
    {
      key: 'customerTitle',
      title: 'Müşteri / Cari',
      render: inv => (
        <div>
          <div style={{ fontWeight: 600 }}>{inv.customerTitle}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {inv.customerCode} {inv.recipientTaxNumber ? `| VKN: ${inv.recipientTaxNumber}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'eInvoiceStatus',
      title: 'GİB Durumu',
      width: '140px',
      render: inv => {
        const isSent = inv.eInvoiceStatus === 'SENT' || inv.eInvoiceStatus === 'DELIVERED' || inv.eInvoiceStatus === 'ACCEPTED';
        // 2026-09-16 (`docs/46` §3): 'MOCK_SENT' = yalnız test sağlayıcısından geçti,
        // GİB'e gönderilmedi. Önceden bu kayıtlar "1200 Başarılı" görünüyordu.
        const isMockSent = inv.eInvoiceStatus === 'MOCK_SENT';
        return (
          <div>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 700,
                backgroundColor: isSent ? '#dcfce7' : '#fef3c7',
                color: isSent ? '#15803d' : '#b45309',
              }}
            >
              {isSent ? <CheckCircle2 size={12} /> : <Clock size={12} />}
              {isSent ? '1200 Başarılı' : isMockSent ? 'GİB\'e Gönderilmedi (Test)' : 'Taslak (GİB)'}
            </span>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {inv.invoiceProfile || 'TICARIFATURA'}
            </div>
          </div>
        );
      },
    },
    {
      key: 'itemsCount',
      title: 'Kalem',
      numeric: true,
      width: '65px',
      render: inv => <span>{inv.items?.length || 0} Ad.</span>,
    },
    {
      key: 'subTotal',
      title: 'Ara Toplam',
      numeric: true,
      width: '110px',
      render: inv => <span>{(inv.subTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>,
    },
    {
      key: 'totalVat',
      title: 'KDV',
      numeric: true,
      width: '90px',
      render: inv => <span>{(inv.totalVat || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>,
    },
    {
      key: 'grandTotal',
      title: 'Genel Toplam',
      numeric: true,
      width: '130px',
      render: inv => (
        <span style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '13px' }}>
          {(inv.grandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
        </span>
      ),
    },
    {
      key: 'paymentStatus',
      title: 'Tahsilat',
      width: '100px',
      render: inv => {
        const isPaid = inv.paymentStatus === 'PAID';
        const isPartial = inv.paymentStatus === 'PARTIAL';
        return (
          <span className={`badge ${isPaid ? 'badge-success' : isPartial ? 'badge-warning' : 'badge-danger'}`}>
            {isPaid ? 'Ödendi' : isPartial ? 'Kısmi' : 'Açık Hesap'}
          </span>
        );
      },
    },
    {
      key: 'actions',
      title: 'İşlemler',
      sortable: false,
      width: '210px',
      render: inv => (
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
          <button
            className="btn btn-secondary btn-sm"
            title="Resmi GİB Görselini İncele (HTML / XSLT)"
            style={{ color: '#0284c7', padding: '4px 6px' }}
            onClick={() => handleOpenViewer(inv)}
          >
            <Eye size={14} />
          </button>

          {inv.eInvoiceStatus !== 'SENT' && inv.eInvoiceStatus !== 'DELIVERED' && (
            <button
              className="btn btn-primary btn-sm"
              title="Hızlı Teknoloji e-Connect ile GİB'e Gönder"
              style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '4px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px' }}
              onClick={() => handleSendHizliInvoice(inv)}
            >
              <Zap size={12} color="#fef08a" />
              <span>GİB</span>
            </button>
          )}

          <button
            className="btn btn-secondary btn-sm"
            title="Faturayı Klonla / Çoğalt"
            style={{ padding: '4px 6px' }}
            onClick={() => handleDuplicate(inv)}
          >
            <Copy size={13} />
          </button>

          <button
            className="btn btn-secondary btn-sm"
            title="İade Faturasına Dönüştür"
            style={{ color: '#ea580c', padding: '4px 6px' }}
            onClick={() => handleConvertReturn(inv)}
          >
            <RotateCcw size={13} />
          </button>

          <button
            className="btn btn-secondary btn-sm"
            title="A4 Fatura Yazdır"
            style={{ padding: '4px 6px' }}
            onClick={() => handlePrint(inv, 'A4')}
          >
            <Printer size={13} color="var(--primary)" />
          </button>

          <button
            className="btn btn-secondary btn-sm"
            title="Faturayı İptal Et"
            style={{ padding: '4px 6px' }}
            onClick={() => handleDelete(inv)}
          >
            <Trash2 size={13} color="#ef4444" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="view-content-container">
      {/* Top Header & Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className={`btn ${statusFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setStatusFilter('ALL')}
          >
            Tüm Satışlar ({invoices.length})
          </button>
          <button
            className={`btn ${statusFilter === 'PAID' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setStatusFilter('PAID')}
          >
            Ödenenler
          </button>
          <button
            className={`btn ${statusFilter === 'UNPAID' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setStatusFilter('UNPAID')}
          >
            Açık Hesaplar
          </button>

          <div style={{ width: '1px', height: '20px', backgroundColor: 'var(--border-color)', margin: '0 4px' }} />

          <select
            className="form-select form-select-sm"
            value={eInvoiceFilter}
            onChange={e => setEInvoiceFilter(e.target.value as any)}
            style={{ width: '150px', fontSize: '11px' }}
          >
            <option value="ALL">Tüm E-Faturalar</option>
            <option value="SENT">GİB İletilenler (1200)</option>
            <option value="DRAFT">Taslaklar (Gönderilmedi)</option>
            {/* 2026-09-16 (`docs/47` §6/C): bu kayıtlar önceden iki filtreden de
                düşüyordu; artık kendi dalında görünür. */}
            <option value="MOCK">GİB'e Gönderilmeyenler (Test)</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleBatchSyncStatus}
            title="GİB'deki son durumları sorgula ve güncelle"
          >
            <RefreshCw size={14} />
            <span>GİB Durum Yenile</span>
          </button>

          <button
            className="btn btn-primary"
            onClick={() => {
              setNewInvoiceType('SALES');
              setIsNewInvoiceModalOpen(true);
            }}
          >
            <Plus size={16} />
            <span>Yeni Satış Faturası</span>
          </button>
        </div>
      </div>

      {/* Batch Action Bar (if any selected) */}
      {selectedIds.length > 0 && (
        <div
          style={{
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '8px',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1e40af', fontWeight: 600, fontSize: '13px' }}>
            <Layers size={16} />
            <span>{selectedIds.length} adet fatura seçildi</span>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={isBatchSending}
              onClick={handleBatchSend}
              // 2026-09-13 (tasarım sadeleştirmesi): dekoratif gradyan yerine düz birincil token.
              style={{ background: 'var(--primary)', border: 'none' }}
            >
              {isBatchSending ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
              <span>Seçilenleri GİB'e Gönder</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setSelectedIds([])}
            >
              Seçimi Temizle
            </button>
          </div>
        </div>
      )}

      <DataGrid
        columns={columns}
        data={filteredInvoices}
        loading={loading}
        searchPlaceholder="Fatura no, müşteri adı veya VKN ile ara..."
        onRowClick={inv => handleOpenViewer(inv)}
        showTotals={true}
        totalColumns={['subTotal', 'totalVat', 'grandTotal']}
      />

      <NewInvoiceModal
        isOpen={isNewInvoiceModalOpen}
        onClose={() => setIsNewInvoiceModalOpen(false)}
        invoiceType={newInvoiceType}
      />

      <OfficialEInvoiceViewerModal
        isOpen={isViewerModalOpen}
        onClose={() => setIsViewerModalOpen(false)}
        invoice={viewingInvoice}
        onInvoiceSent={() => triggerRefresh()}
      />
    </div>
  );
};
