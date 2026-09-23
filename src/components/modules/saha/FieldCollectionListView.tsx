import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Printer,
  XCircle,
  MapPin,
  Calendar,
  User,
  Shield,
  RefreshCw,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import type { FieldCollection, FieldCollectionReceipt } from '../../../types';
import { FieldCollectionModal } from './FieldCollectionModal';

export const FieldCollectionListView: React.FC = () => {
  const { showToast } = useToast();
  const [collections, setCollections] = useState<FieldCollection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<FieldCollectionReceipt | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await api.getFieldCollections();
      if (res.success) {
        setCollections(res.collections || []);
      }
    } catch (err: any) {
      showToast(err.message || 'Tahsilatlar yüklenemedi.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      const res = await api.approveFieldCollection(id);
      if (res.success) {
        showToast(res.message, 'success');
        loadData();
      }
    } catch (err: any) {
      showToast(err.message || 'Tahsilat onaylanamadı.', 'error');
    }
  };

  const handleCancel = async (id: string) => {
    const reason = prompt('Lütfen iptal nedenini giriniz:');
    if (!reason) return;
    try {
      const res = await api.cancelFieldCollection(id, { reason });
      if (res.success) {
        showToast(res.message, 'success');
        loadData();
      }
    } catch (err: any) {
      showToast(err.message || 'Tahsilat iptal edilemedi.', 'error');
    }
  };

  const handleViewReceipt = async (collectionId: string) => {
    try {
      const res = await api.getFieldCollectionReceipt(collectionId);
      if (res.success) {
        setSelectedReceipt(res.receipt);
      }
    } catch (err: any) {
      showToast(err.message || 'Makbuz bulunamadı.', 'error');
    }
  };

  const filtered = collections.filter(c => {
    const matchSearch =
      c.customerTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.collectionNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.userName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const today = new Date().toISOString().split('T')[0];
  const todayTotal = collections
    .filter(c => c.collectionDate === today && c.status === 'CONFIRMED')
    .reduce((sum, c) => sum + c.amount, 0);

  const pendingCount = collections.filter(c => c.status === 'PENDING_APPROVAL').length;
  const pendingTotal = collections
    .filter(c => c.status === 'PENDING_APPROVAL')
    .reduce((sum, c) => sum + c.amount, 0);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* 2026-09-13: sayfa kabuğu açık temaya geçti — ikon bloğu marka
                renginin açık tonuna, ikon da marka rengine çekildi. */}
            <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarSign size={24} color="var(--primary)" />
            </div>
            <div>
              <h1 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, margin: 0 }}>
                Saha Tahsilat Masası
              </h1>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>
                Personel saha tahsilatları, GPS konum doğrulama, imza onayları ve cari hareketleri
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={loadData}
              style={{ padding: '10px 14px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-main)', cursor: 'pointer' }}
            >
              <RefreshCw size={16} />
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              style={{ padding: '10px 20px', borderRadius: 'var(--radius-sm, 6px)', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Plus size={18} />
              <span>Yeni Saha Tahsilatı Yap</span>
            </button>
          </div>
        </div>

        {/* KPI Kartları */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 600 }}>Bugünkü Saha Tahsilatı</div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--success)', marginTop: '4px' }}>
              {todayTotal.toLocaleString('tr-TR')} TL
            </div>
            <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '2px' }}>Nakit, Kart ve Havale toplamı</div>
          </div>

          <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 600 }}>Onay Bekleyen Tahsilatlar</div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--warning)', marginTop: '4px' }}>
              {pendingTotal.toLocaleString('tr-TR')} TL
            </div>
            <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--warning)', marginTop: '2px' }}>{pendingCount} adet yüksek tutarlı işlem</div>
          </div>

          <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 600 }}>Toplam Tahsilat Adedi</div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--info)', marginTop: '4px' }}>
              {collections.length}
            </div>
            <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '2px' }}>Kayıtlı saha fişleri</div>
          </div>
        </div>

        {/* Filtre ve Arama */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Müşteri adı, personel veya tahsilat no ara..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ width: '100%', padding: '10px 12px 10px 36px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-sm, 12px)' }}
            />
          </div>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: '10px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-sm, 12px)' }}
          >
            <option value="ALL">Tüm Durumlar</option>
            <option value="CONFIRMED">Kesinleşti (Onaylı)</option>
            <option value="PENDING_APPROVAL">Onay Bekliyor</option>
            <option value="CANCELLED">İptal Edildi</option>
          </select>
        </div>

        {/* Tahsilat Tablosu */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-base, 13px)', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-secondary)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '14px 18px' }}>Tarih</th>
                <th style={{ padding: '14px 18px' }}>Tahsilat No</th>
                <th style={{ padding: '14px 18px' }}>Müşteri</th>
                <th style={{ padding: '14px 18px' }}>Personel</th>
                <th style={{ padding: '14px 18px' }}>Ödeme Yöntemi</th>
                <th style={{ padding: '14px 18px' }}>Tutar</th>
                <th style={{ padding: '14px 18px' }}>Konum & İmza</th>
                <th style={{ padding: '14px 18px' }}>Durum</th>
                <th style={{ padding: '14px 18px' }}>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Kayıtlı saha tahsilatı bulunamadı.
                  </td>
                </tr>
              ) : (
                filtered.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>
                      {new Date(c.collectionDate).toLocaleDateString('tr-TR')}
                    </td>
                    <td style={{ padding: '14px 18px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--info)' }}>
                      {c.collectionNumber}
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--text-main)' }}>
                      {c.customerTitle}
                    </td>
                    <td style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>
                      {c.userName}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span className="badge badge-secondary">
                        {c.paymentMethod}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--success)', fontSize: 'var(--fs-base, 13px)' }}>
                      {c.amount.toLocaleString('tr-TR')} {c.currency}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {c.latitude && (
                          <span title={`GPS: ${c.latitude}, ${c.longitude}`} style={{ color: 'var(--success)', cursor: 'pointer' }}>
                            <MapPin size={16} />
                          </span>
                        )}
                        {c.signatureFileUrl && (
                          <span title="İmzalı" style={{ color: 'var(--info)', fontSize: 'var(--fs-sm, 12px)' }}>
                            İmzalı
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      {/* 2026-09-13: elle yazılan durum rozeti yerine hazır
                          badge sınıfları kullanıldı (açık/koyu tema uyumlu). */}
                      <span className={
                        c.status === 'CONFIRMED'
                          ? 'badge badge-success'
                          : c.status === 'PENDING_APPROVAL'
                          ? 'badge badge-warning'
                          : 'badge badge-danger'
                      }>
                        {c.status === 'CONFIRMED' ? 'Kesinleşti' : c.status === 'PENDING_APPROVAL' ? 'Onay Bekliyor' : 'İptal'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => handleViewReceipt(c.id)}
                          title="Makbuz Görüntüle"
                          style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', color: 'var(--info)', cursor: 'pointer' }}
                        >
                          <Printer size={14} />
                        </button>
                        {c.status === 'PENDING_APPROVAL' && (
                          <button
                            onClick={() => handleApprove(c.id)}
                            title="Onayla"
                            style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--success-bg)', border: '1px solid var(--success)', color: 'var(--success)', cursor: 'pointer', fontWeight: 700 }}
                          >
                            Onayla
                          </button>
                        )}
                        {c.status !== 'CANCELLED' && (
                          <button
                            onClick={() => handleCancel(c.id)}
                            title="İptal Et"
                            style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--danger-bg)', border: '1px solid var(--danger)', color: 'var(--danger)', cursor: 'pointer' }}
                          >
                            İptal
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Field Collection Modal */}
      {isModalOpen && (
        <FieldCollectionModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            setIsModalOpen(false);
            loadData();
          }}
        />
      )}

      {/* Makbuz Önizleme Modalı */}
      {selectedReceipt && (
        <div className="modal-overlay" style={{ zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '90vw', maxWidth: '480px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '24px', color: 'var(--text-main)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Tahsilat Makbuzu</h3>
              <button onClick={() => setSelectedReceipt(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <XCircle size={20} />
              </button>
            </div>

            <div style={{ background: 'var(--bg-surface-secondary)', padding: '18px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', marginBottom: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '10px' }}>
                <span style={{ fontWeight: 700, color: 'var(--info)' }}>{selectedReceipt.receiptNumber}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>{new Date(selectedReceipt.createdAt).toLocaleDateString('tr-TR')}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: 'var(--fs-base, 13px)' }}>
                <div><b>Müşteri:</b> {selectedReceipt.customerTitle}</div>
                <div><b>Tutar:</b> <span style={{ color: 'var(--success)', fontWeight: 700 }}>{selectedReceipt.amount.toLocaleString('tr-TR')} {selectedReceipt.currency}</span></div>
                <div><b>Ödeme Yöntemi:</b> {selectedReceipt.paymentMethod}</div>
                <div><b>Tahsil Eden:</b> {selectedReceipt.collectedBy}</div>
                <div><b>Açıklama:</b> {selectedReceipt.notes || '-'}</div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => window.print()}
                style={{ padding: '8px 16px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Printer size={16} />
                <span>Yazdır</span>
              </button>
              <button
                onClick={() => setSelectedReceipt(null)}
                style={{ padding: '8px 20px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
              >
                Tamam
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
