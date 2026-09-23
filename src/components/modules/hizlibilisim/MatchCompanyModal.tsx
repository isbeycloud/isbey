import React, { useState, useEffect } from 'react';
import { Modal } from '../../common/Modal';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import type { ExternalCustomer, Tenant } from '../../../types';
import { Link2, Building, Check, Search, AlertCircle } from 'lucide-react';

interface MatchCompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: ExternalCustomer | null;
  onSuccess: () => void;
}

export const MatchCompanyModal: React.FC<MatchCompanyModalProps> = ({
  isOpen,
  onClose,
  customer,
  onSuccess,
}) => {
  const { showToast } = useToast();
  const { triggerRefresh } = useApp();

  const [companies, setCompanies] = useState<Tenant[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadCompanies();
    }
  }, [isOpen]);

  const loadCompanies = async () => {
    setLoading(true);
    try {
      const res = await api.getCompanies();
      if (res.success && res.companies) {
        setCompanies(res.companies);
        // Pre-select if VKN matches
        if (customer?.taxNumber) {
          const match = res.companies.find(c => c.taxNumber === customer.taxNumber);
          if (match) setSelectedCompanyId(match.id);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!customer) return null;

  const filteredCompanies = companies.filter(c =>
    (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.companyCode || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.taxNumber || '').includes(search)
  );

  const handleMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompanyId) {
      showToast('Lütfen eşleştirilecek İŞBEY firmasını seçiniz.', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.matchHizliCompany({
        customerId: customer.id,
        companyId: selectedCompanyId,
      });

      if (res.success) {
        showToast(res.message, 'success');
        triggerRefresh();
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      showToast(err.message || 'Eşleştirme yapılamadı.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="🔗 Hızlı Bilişim Müşterisini İŞBEY Firmasıyla Eşleştir"
      size="medium"
    >
      <form onSubmit={handleMatch} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Müşteri Kartı */}
        <div style={{
          background: 'var(--bg-surface-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          fontSize: '13px',
        }}>
          <div style={{ fontWeight: 700, color: 'var(--primary)' }}>
            Hızlı Bilişim: {customer.companyName}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            VKN: <strong>{customer.taxNumber}</strong> · Yetkili: {customer.contactName} · Tel: {customer.phone}
          </div>
        </div>

        {/* Firma Arama & Seçim */}
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label required">Eşleştirilecek İŞBEY Firması</label>
          <div style={{ position: 'relative', marginBottom: '8px' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Firma adı, kod (ISB-XXXX) veya Vergi No ara..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: '32px' }}
            />
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
          </div>

          <div style={{
            maxHeight: '180px',
            overflowY: 'auto',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            background: 'var(--bg-surface-secondary)',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            padding: '4px',
          }}>
            {filteredCompanies.map(c => {
              const isSelected = selectedCompanyId === c.id;
              const isVknMatch = c.taxNumber === customer.taxNumber;
              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedCompanyId(c.id)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '4px',
                    background: isSelected ? 'rgba(26,86,219,0.1)' : 'transparent',
                    border: isSelected ? '1px solid var(--primary)' : '1px solid transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.1s ease',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '12.5px', fontWeight: isSelected ? 700 : 500, color: isSelected ? 'var(--primary)' : 'var(--text-main)' }}>
                      {c.name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {c.companyCode} · VKN: {c.taxNumber} · Paket: {c.plan}
                    </div>
                  </div>
                  {isVknMatch && (
                    <span className="badge badge-success" style={{ fontSize: '10px' }}>
                      VKN Eşleşti
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Butonlar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            İptal
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting || !selectedCompanyId} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Link2 size={15} />
            <span>{submitting ? 'Eşleştiriliyor...' : 'Mevcut Firmayla Eşleştir'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
