import React, { useState } from 'react';
import { Modal } from '../../common/Modal';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import type { Tenant } from '../../../types';
import { Mail, Plus, Sparkles, CheckCircle, RefreshCw } from 'lucide-react';

interface AddCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: Tenant | null;
  onCreditsAdded: (updatedTenant: Tenant) => void;
}

const CREDIT_PACKAGES = [
  { amount: 100, label: '100 Kontör', price: '250 ₺', badge: 'Başlangıç' },
  { amount: 250, label: '250 Kontör', price: '550 ₺', badge: 'Popüler' },
  { amount: 500, label: '500 Kontör', price: '950 ₺', badge: 'KOBİ Avantaj' },
  { amount: 1000, label: '1.000 Kontör', price: '1.750 ₺', badge: 'Ekonomik' },
  { amount: 5000, label: '5.000 Kontör', price: '7.500 ₺', badge: 'Kurumsal Havuz' },
];

export const AddCreditsModal: React.FC<AddCreditsModalProps> = ({
  isOpen,
  onClose,
  tenant,
  onCreditsAdded,
}) => {
  const { showToast } = useToast();
  const { triggerRefresh } = useApp();

  const [selectedAmount, setSelectedAmount] = useState<number>(500);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [notes, setNotes] = useState<string>('Manuel SuperAdmin Kontör Yüklemesi');
  const [submitting, setSubmitting] = useState<boolean>(false);

  if (!tenant) return null;

  const currentCredits = tenant.eInvoiceCredits || 0;
  const effectiveAmount = customAmount ? Number(customAmount) : selectedAmount;
  const newTotal = currentCredits + (effectiveAmount || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveAmount || effectiveAmount <= 0) {
      showToast('Lütfen geçerli bir kontör miktarı seçin veya girin.', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.addTenantCredits(tenant.id, effectiveAmount, notes);
      if (res.success && res.tenant) {
        showToast(res.message, 'success');
        onCreditsAdded(res.tenant);
        triggerRefresh();
        onClose();
      }
    } catch (err: any) {
      showToast(err.message || 'Kontör yüklenirken hata oluştu.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`✉️ e-Fatura Kontör Yükle — ${tenant.name}`}
      size="medium"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Mevcut Bakiye Kartı */}
        <div style={{
          // 2026-09-13 (tasarım sadeleştirmesi): dekoratif gradyan yerine düz başarı token'ı (bakiye kartı).
          background: 'var(--success-bg)',
          border: '1.5px solid #86efac',
          borderRadius: '8px',
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: '11px', color: '#166534', fontWeight: 600 }}>Mevcut e-Fatura Kontör Bakiyesi</div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#15803d', fontFamily: 'var(--font-mono)' }}>
              {currentCredits.toLocaleString('tr-TR')} Kontör
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Yükleme Sonrası Bakiye</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>
              {newTotal.toLocaleString('tr-TR')}
            </div>
          </div>
        </div>

        {/* Hazır Paketler */}
        <div>
          <label className="form-label" style={{ fontWeight: 700 }}>Hızlı Kontör Paketleri</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '4px' }}>
            {CREDIT_PACKAGES.map((pkg) => {
              const isSelected = !customAmount && selectedAmount === pkg.amount;
              return (
                <div
                  key={pkg.amount}
                  onClick={() => {
                    setSelectedAmount(pkg.amount);
                    setCustomAmount('');
                  }}
                  style={{
                    border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '10px 8px',
                    background: isSelected ? 'var(--primary-light)' : 'var(--bg-surface)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '2px',
                    transition: 'all 0.12s ease',
                  }}
                >
                  <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--primary)' }}>{pkg.badge}</span>
                  <span style={{ fontSize: '14px', fontWeight: 900 }}>+{pkg.amount}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{pkg.price}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Özel Miktar Girişi */}
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Veya Özel Kontör Miktarı Girin</label>
          <input
            type="number"
            className="form-input"
            placeholder="örn: 750"
            value={customAmount}
            onChange={e => setCustomAmount(e.target.value)}
            min="1"
          />
        </div>

        {/* Yükleme Notu */}
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">İşlem Açıklaması / Not</label>
          <input
            type="text"
            className="form-input"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Fatura No, Tahsilat Dekontu vb."
          />
        </div>

        {/* Alt Butonlar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            İptal
          </button>
          <button
            type="submit"
            className="btn btn-success"
            disabled={submitting || effectiveAmount <= 0}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {submitting ? <RefreshCw size={14} className="spin" /> : <Plus size={15} />}
            <span>+{effectiveAmount} Kontörü Anında Yükle</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
