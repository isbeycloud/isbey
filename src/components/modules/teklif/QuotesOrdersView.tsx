import React, { useState, useEffect } from 'react';
import { DataGrid } from '../../common/DataGrid';
import type { Column } from '../../common/DataGrid';
import type { Quote, Order } from '../../../types';
import { api } from '../../../services/api';
import { useApp } from '../../../context/AppContext';
import { useToast } from '../../../context/ToastContext';
import { QuoteModal } from './QuoteModal';
import { Plus, FileText, ArrowRight, Printer, CheckCircle2, ShoppingCart, Truck } from 'lucide-react';

const QUOTE_STATUS_LABELS: Record<string, { label: string; badge: string }> = {
  DRAFT: { label: 'Taslak', badge: 'badge-secondary' },
  SENT: { label: 'Gönderildi', badge: 'badge-info' },
  WAITING_APPROVAL: { label: 'Onay Bekleniyor', badge: 'badge-warning' },
  ACCEPTED: { label: 'Kabul Edildi', badge: 'badge-success' },
  REJECTED: { label: 'Reddedildi', badge: 'badge-danger' },
  EXPIRED: { label: 'Süresi Doldu', badge: 'badge-danger' },
  CONVERTED: { label: 'Dönüştürüldü', badge: 'badge-success' },
  CANCELLED: { label: 'İptal', badge: 'badge-danger' },
};

const ORDER_STATUS_LABELS: Record<string, { label: string; badge: string }> = {
  PENDING: { label: 'Beklemede', badge: 'badge-warning' },
  CONFIRMED: { label: 'Onaylandı', badge: 'badge-info' },
  PREPARING: { label: 'Hazırlanıyor', badge: 'badge-warning' },
  PARTIALLY_SHIPPED: { label: 'Kısmi Sevk', badge: 'badge-warning' },
  SHIPPED: { label: 'Sevk Edildi', badge: 'badge-success' },
  COMPLETED: { label: 'Tamamlandı', badge: 'badge-success' },
  CANCELLED: { label: 'İptal', badge: 'badge-danger' },
};

export const QuotesOrdersView: React.FC = () => {
  const { isNewQuoteModalOpen, setIsNewQuoteModalOpen, refreshKey, triggerRefresh, openPrintModal } = useApp();
  const { showToast } = useToast();

  const [activeSubTab, setActiveSubTab] = useState<'QUOTES' | 'ORDERS'>('QUOTES');
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [activeSubTab, refreshKey]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeSubTab === 'QUOTES') {
        const res = await api.getQuotes();
        if (res.success) setQuotes(res.quotes);
      } else {
        const res = await api.getOrders();
        if (res.success) setOrders(res.orders);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleConvertToOrder = async (quote: Quote) => {
    if (converting) return;
    setConverting(quote.id);
    try {
      const deliveryDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
      const res = await api.convertQuoteToOrder(quote.id, { deliveryDate });
      if (res.success) {
        showToast(res.message || 'Teklif başarıyla siparişe dönüştürüldü!', 'success');
        triggerRefresh();
      }
    } catch (err: any) {
      showToast(err.message || 'Siparişe dönüştürülemedi.', 'error');
    } finally {
      setConverting(null);
    }
  };

  const handleConvertToInvoice = async (quote: Quote) => {
    if (converting) return;
    setConverting(quote.id);
    try {
      const res = await api.convertQuoteToInvoice(quote.id);
      if (res.success) {
        showToast(res.message || 'Teklif başarıyla faturaya dönüştürüldü!', 'success');
        triggerRefresh();
      }
    } catch (err: any) {
      showToast(err.message || 'Faturaya dönüştürülemedi.', 'error');
    } finally {
      setConverting(null);
    }
  };

  const handleConvertOrderToWaybill = async (order: Order) => {
    if (converting) return;
    setConverting(order.id);
    try {
      const res = await api.convertOrderToWaybill(order.id);
      if (res.success) {
        showToast(res.message || 'Sipariş başarıyla irsaliyeye dönüştürüldü!', 'success');
        triggerRefresh();
      }
    } catch (err: any) {
      showToast(err.message || 'İrsaliyeye dönüştürülemedi.', 'error');
    } finally {
      setConverting(null);
    }
  };

  const quoteColumns: Column<Quote>[] = [
    {
      key: 'quoteNo',
      title: 'Teklif No',
      width: '130px',
      render: q => <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{q.quoteNo}</span>,
    },
    { key: 'date', title: 'Tarih', width: '100px' },
    {
      key: 'validUntil',
      title: 'Geçerlilik',
      width: '100px',
      render: q => {
        const expired = new Date(q.validUntil) < new Date();
        return <span style={{ color: expired ? '#ef4444' : 'var(--text-muted)' }}>{q.validUntil}</span>;
      },
    },
    {
      key: 'customerTitle',
      title: 'Muhatap Cari',
      render: q => (
        <div>
          <div style={{ fontWeight: 600 }}>{q.customerTitle}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{q.notes || '-'}</div>
        </div>
      ),
    },
    {
      key: 'grandTotal',
      title: 'Genel Toplam',
      numeric: true,
      width: '130px',
      render: q => (
        <span style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '13px' }}>
          {q.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
        </span>
      ),
    },
    {
      key: 'status',
      title: 'Durum',
      width: '130px',
      render: q => {
        const s = QUOTE_STATUS_LABELS[q.status] || { label: q.status, badge: 'badge-secondary' };
        return <span className={`badge ${s.badge}`}>{s.label}</span>;
      },
    },
    {
      key: 'actions',
      title: 'İşlemler',
      sortable: false,
      width: '220px',
      render: q => (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
          <button className="btn btn-secondary btn-sm" title="Yazdır / PDF" onClick={() => openPrintModal('QUOTE', `Teklif - ${q.quoteNo}`, q)}>
            <Printer size={13} />
          </button>
          {q.status !== 'CONVERTED' && q.status !== 'CANCELLED' && q.status !== 'REJECTED' && (
            <>
              <button
                className="btn btn-warning btn-sm"
                title="Siparişe Dönüştür"
                disabled={converting === q.id}
                onClick={() => handleConvertToOrder(q)}
                // 2026-09-13 (tasarım sadeleştirmesi): dekoratif gradyan yerine düz uyarı token'ı.
                style={{ background: 'var(--warning)', color: '#fff', border: 'none' }}
              >
                <ShoppingCart size={13} />
                <span>Siparişe</span>
              </button>
              <button
                className="btn btn-success btn-sm"
                title="Faturaya Dönüştür"
                disabled={converting === q.id}
                onClick={() => handleConvertToInvoice(q)}
              >
                <ArrowRight size={13} />
                <span>Fatura</span>
              </button>
            </>
          )}
          {q.status === 'CONVERTED' && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '2px' }}>
              <CheckCircle2 size={12} color="#10b981" /> Dönüştürüldü
            </span>
          )}
        </div>
      ),
    },
  ];

  const orderColumns: Column<Order>[] = [
    {
      key: 'orderNo',
      title: 'Sipariş No',
      width: '130px',
      render: o => <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{o.orderNo}</span>,
    },
    { key: 'date', title: 'Sipariş Tarihi', width: '110px' },
    {
      key: 'deliveryDate',
      title: 'Teslim Tarihi',
      width: '110px',
      render: o => {
        const overdue = new Date(o.deliveryDate) < new Date() && o.status !== 'COMPLETED';
        return <span style={{ color: overdue ? '#ef4444' : 'inherit' }}>{o.deliveryDate}</span>;
      },
    },
    {
      key: 'customerTitle',
      title: 'Müşteri / Cari',
      render: o => (
        <div>
          <div style={{ fontWeight: 600 }}>{o.customerTitle}</div>
          {o.sourceQuoteNo && <div style={{ fontSize: '11px', color: 'var(--primary)' }}>← {o.sourceQuoteNo}</div>}
        </div>
      ),
    },
    {
      key: 'grandTotal',
      title: 'Tutar',
      numeric: true,
      width: '130px',
      render: o => <span style={{ fontWeight: 800 }}>{o.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>,
    },
    {
      key: 'status',
      title: 'Durum / İlerleme',
      width: '160px',
      render: o => {
        const s = ORDER_STATUS_LABELS[o.status] || { label: o.status, badge: 'badge-secondary' };
        const shippedQty = o.items.reduce((acc, i) => acc + (i.shippedQuantity || 0), 0);
        const totalQty = o.items.reduce((acc, i) => acc + (i.orderedQuantity || 0), 0);
        const progress = totalQty > 0 ? Math.round((shippedQty / totalQty) * 100) : 0;
        return (
          <div>
            <span className={`badge ${s.badge}`}>{s.label}</span>
            {(o.status === 'PARTIALLY_SHIPPED' || o.status === 'CONFIRMED' || o.status === 'PREPARING') && (
              <div style={{ marginTop: '4px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                  {shippedQty}/{totalQty} sevk edildi
                </div>
                <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: `${progress}%`, height: '100%', background: '#10b981', borderRadius: '2px', transition: 'width 0.3s' }} />
                </div>
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'actions',
      title: 'İşlemler',
      sortable: false,
      width: '180px',
      render: o => (
        <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
          {o.status !== 'COMPLETED' && o.status !== 'CANCELLED' && o.status !== 'SHIPPED' && (
            <button
              className="btn btn-primary btn-sm"
              title="İrsaliye Oluştur"
              disabled={converting === o.id}
              onClick={() => handleConvertOrderToWaybill(o)}
            >
              <Truck size={13} />
              <span>İrsaliye</span>
            </button>
          )}
          {(o.status === 'SHIPPED' || o.status === 'COMPLETED') && (
            <span style={{ fontSize: '11px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '2px' }}>
              <CheckCircle2 size={12} /> Sevk Tamam
            </span>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="view-content-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn ${activeSubTab === 'QUOTES' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setActiveSubTab('QUOTES')}
          >
            <FileText size={14} />
            <span>Teklifler ({quotes.length})</span>
          </button>
          <button
            className={`btn ${activeSubTab === 'ORDERS' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setActiveSubTab('ORDERS')}
          >
            <ShoppingCart size={14} />
            <span>Siparişler ({orders.length})</span>
          </button>
        </div>

        <button className="btn btn-primary" onClick={() => setIsNewQuoteModalOpen(true)}>
          <Plus size={16} />
          <span>Yeni Teklif</span>
        </button>
      </div>

      {activeSubTab === 'QUOTES' ? (
        <DataGrid
          columns={quoteColumns}
          data={quotes}
          loading={loading}
          searchPlaceholder="Teklif no, muhatap cari veya proje notu ile ara..."
          showTotals={true}
          totalColumns={['grandTotal']}
        />
      ) : (
        <DataGrid
          columns={orderColumns}
          data={orders}
          loading={loading}
          searchPlaceholder="Sipariş no veya cari adı ile ara..."
          showTotals={true}
          totalColumns={['grandTotal']}
        />
      )}

      <QuoteModal
        isOpen={isNewQuoteModalOpen}
        onClose={() => setIsNewQuoteModalOpen(false)}
      />
    </div>
  );
};
