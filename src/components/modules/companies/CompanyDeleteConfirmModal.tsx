import React, { useState } from 'react';
import { Modal } from '../../common/Modal';
import { AlertTriangle, Trash2, ShieldAlert } from 'lucide-react';
import type { Tenant } from '../../../types';

interface CompanyDeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  company: Tenant | null;
  onConfirm: (confirmCode: string, hardDelete: boolean) => Promise<void>;
}

export const CompanyDeleteConfirmModal: React.FC<CompanyDeleteConfirmModalProps> = ({
  isOpen,
  onClose,
  company,
  onConfirm,
}) => {
  const [confirmInput, setConfirmInput] = useState('');
  const [hardDelete, setHardDelete] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!company) return null;

  const targetCode = company.companyCode || company.name;
  const isMatch = confirmInput.trim() === targetCode || confirmInput.trim() === company.name;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMatch) return;
    setLoading(true);
    try {
      await onConfirm(confirmInput.trim(), hardDelete);
      onClose();
    } finally {
      setLoading(false);
      setConfirmInput('');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Firma Silme / Arşivleme Güvenlik Doğrulaması"
      size="medium"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1.5px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '10px',
          padding: '16px',
          display: 'flex',
          gap: '12px',
          alignItems: 'flex-start',
        }}>
          <ShieldAlert size={26} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <div style={{ fontWeight: 800, color: '#ef4444', fontSize: '14px' }}>
              DİKKAT: Firma Kaldırma İşlemi
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-main)', marginTop: '4px', lineHeight: 1.5 }}>
              <strong>{company.name}</strong> ({company.companyCode || company.slug}) firmasını kaldırmak üzeresiniz.
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '6px' }}>
              Varsayılan olarak verileriniz silinmez; firma <strong>Arşivlenir / Pasife Alınır</strong> ve kullanıcı girişleri engellenir.
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-surface-secondary)', padding: '12px 14px', borderRadius: '8px', fontSize: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={hardDelete}
              onChange={e => setHardDelete(e.target.checked)}
              style={{ width: '16px', height: '16px' }}
            />
            <span style={{ color: hardDelete ? '#dc2626' : 'var(--text-main)' }}>
              Kalıcı olarak tamamen sil (Tüm veriler, cariler, faturalar geri getirilemez şekilde silinir)
            </span>
          </label>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--text-main)' }}>
            Doğrulama için lütfen firma kodunu (<code style={{ color: 'var(--primary)', fontWeight: 800 }}>{targetCode}</code>) yazınız:
          </label>
          <input
            type="text"
            className="form-input"
            value={confirmInput}
            onChange={e => setConfirmInput(e.target.value)}
            placeholder={targetCode}
            autoFocus
            style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.5px' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
            İptal
          </button>
          <button
            type="submit"
            className="btn btn-danger"
            disabled={!isMatch || loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Trash2 size={14} />
            <span>{hardDelete ? 'Firmayı Kalıcı Olarak Sil' : 'Firmayı Pasife Al / Arşivle'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
