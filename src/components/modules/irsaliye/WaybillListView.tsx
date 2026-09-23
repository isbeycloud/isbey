import React, { useState, useEffect } from 'react';
import { DataGrid } from '../../common/DataGrid';
import type { Column } from '../../common/DataGrid';
import type { Waybill } from '../../../types';
import { api } from '../../../services/api';
import { useApp } from '../../../context/AppContext';
import { useToast } from '../../../context/ToastContext';
import { WaybillModal } from './WaybillModal';
import { Plus, Truck, ArrowRight, CheckCircle2, FileText, Printer } from 'lucide-react';

export const WaybillListView: React.FC = () => {
  const { isNewWaybillModalOpen, setIsNewWaybillModalOpen, refreshKey, triggerRefresh, openPrintModal } = useApp();
  const { showToast } = useToast();

  const [waybills, setWaybills] = useState<Waybill[]>([]);
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'SALES_DESPATCH' | 'PURCHASE_DESPATCH'>('ALL');
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => {
    loadWaybills();
  }, [typeFilter, refreshKey]);

  const loadWaybills = async () => {
    setLoading(true);
    try {
      const res = await api.getWaybills({ type: typeFilter });
      if (res.success) {
        setWaybills(res.waybills);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleConvertToInvoice = async (waybill: Waybill) => {
    try {
      const res = await api.convertWaybillToInvoice(waybill.id);
      if (res.success) {
        showToast(res.message, 'success');
        triggerRefresh();
      }
    } catch (err: any) {
      showToast(err.message || 'Faturalaştırılamadı.', 'error');
    }
  };

  const handleBulkInvoice = async () => {
    if (selectedIds.length < 2) {
      showToast('Toplu faturalaştırma için en az 2 irsaliye seçin.', 'warning');
      return;
    }
    setBulkLoading(true);
    try {
      const res = await api.bulkWaybillToInvoice(selectedIds);
      if (res.success) {
        showToast(res.message, 'success');
        setSelectedIds([]);
        triggerRefresh();
      }
    } catch (err: any) {
      showToast(err.message || 'Toplu faturalaştırma başarısız.', 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const pendingWaybills = waybills.filter(w => w.status === 'PENDING');

  const columns: Column<Waybill>[] = [
    {
      key: 'waybillNo',
      title: '',
      width: '40px',
      sortable: false,
      render: w => w.status === 'PENDING' ? (
        <input
          type="checkbox"
          checked={selectedIds.includes(w.id)}
          onChange={() => toggleSelect(w.id)}
          onClick={e => e.stopPropagation()}
          style={{ cursor: 'pointer', width: '16px', height: '16px' }}
        />
      ) : null,
    },
    {
      key: 'waybillNo',
      title: 'İrsaliye No',
      width: '130px',
      render: w => <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{w.waybillNo}</span>,
    },
    {
      key: 'type',
      title: 'Tür',
      width: '120px',
      render: w => (
        <span className={`badge ${w.type === 'SALES_DESPATCH' ? 'badge-info' : 'badge-warning'}`}>
          {w.type === 'SALES_DESPATCH' ? 'Sevk İrsaliyesi' : 'Alış İrsaliyesi'}
        </span>
      ),
    },
    { key: 'date', title: 'Düzenleme', width: '100px' },
    { key: 'shipmentDate', title: 'Fiili Sevk', width: '100px' },
    {
      key: 'customerTitle',
      title: 'İlgili Cari / Müşteri',
      render: w => (
        <div>
          <div style={{ fontWeight: 600 }}>{w.customerTitle}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {w.sourceOrderNo ? `← Sipariş: ${w.sourceOrderNo}` : w.carrierTitle ? `${w.carrierTitle} - ${w.plateNumber || ''}` : w.notes || '-'}
          </div>
        </div>
      ),
    },
    {
      key: 'items',
      title: 'Sevk Miktarı',
      width: '110px',
      render: w => (
        <span>
          {w.items.reduce((s, it) => s + it.quantity, 0)} Adet ({w.items.length} Kalem)
        </span>
      ),
    },
    {
      key: 'status',
      title: 'Durum',
      width: '130px',
      render: w => {
        if (w.status === 'INVOICED') return (
          <div>
            <span className="badge badge-success">Faturalandı</span>
            {w.invoiceNo && <div style={{ fontSize: '10px', color: 'var(--primary)', marginTop: '2px' }}>{w.invoiceNo}</div>}
          </div>
        );
        if (w.status === 'CANCELLED') return <span className="badge badge-danger">İptal</span>;
        return <span className="badge badge-warning">Beklemede</span>;
      },
    },
    {
      key: 'actions',
      title: 'İşlemler',
      sortable: false,
      width: '170px',
      render: w => (
        <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
          <button className="btn btn-secondary btn-sm" title="Yazdır / PDF" onClick={() => openPrintModal('WAYBILL', `İrsaliye - ${w.waybillNo}`, w)}>
            <Printer size={13} />
          </button>
          {w.status === 'PENDING' ? (
            <button className="btn btn-success btn-sm" title="Faturalandır" onClick={() => handleConvertToInvoice(w)}>
              <ArrowRight size={13} />
              <span>Faturalandır</span>
            </button>
          ) : w.status === 'INVOICED' ? (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '2px' }}>
              <CheckCircle2 size={12} color="#10b981" /> Faturalandı
            </span>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="view-content-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className={`btn ${typeFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setTypeFilter('ALL')}>
            Tüm İrsaliyeler ({waybills.length})
          </button>
          <button className={`btn ${typeFilter === 'SALES_DESPATCH' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setTypeFilter('SALES_DESPATCH')}>
            Sevk İrsaliyeleri
          </button>
          <button className={`btn ${typeFilter === 'PURCHASE_DESPATCH' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setTypeFilter('PURCHASE_DESPATCH')}>
            Alış İrsaliyeleri
          </button>
          {selectedIds.length >= 2 && (
            <button
              className="btn btn-success btn-sm"
              onClick={handleBulkInvoice}
              disabled={bulkLoading}
              // 2026-09-13 (tasarım sadeleştirmesi): dekoratif gradyan yerine düz başarı token'ı.
              style={{ background: 'var(--success)', color: '#fff', border: 'none' }}
            >
              <FileText size={14} />
              <span>{bulkLoading ? 'Faturalandırılıyor...' : `Toplu Faturalandır (${selectedIds.length})`}</span>
            </button>
          )}
        </div>

        <button className="btn btn-primary" onClick={() => setIsNewWaybillModalOpen(true)}>
          <Plus size={16} />
          <span>Yeni İrsaliye Düzenle</span>
        </button>
      </div>

      {selectedIds.length > 0 && (
        <div style={{ padding: '8px 12px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', border: '1px solid #10b981', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
          <FileText size={14} color="#10b981" />
          <span style={{ color: '#10b981', fontWeight: 600 }}>{selectedIds.length} irsaliye seçildi</span>
          <span style={{ color: 'var(--text-muted)' }}>— Toplu faturalandırma için en az 2 irsaliye seçin, aynı cariye ait olmaları gerekir.</span>
          <button className="btn btn-secondary btn-sm" onClick={() => setSelectedIds([])} style={{ marginLeft: 'auto' }}>Seçimi Temizle</button>
        </div>
      )}

      <DataGrid
        columns={columns}
        data={waybills}
        searchPlaceholder="İrsaliye no, cari veya taşıyıcı firma ile ara..."
      />

      <WaybillModal
        isOpen={isNewWaybillModalOpen}
        onClose={() => setIsNewWaybillModalOpen(false)}
      />
    </div>
  );
};
