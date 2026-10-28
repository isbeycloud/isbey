import { useState } from 'react';
import type { Tenant } from '../../../types';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { Modal } from '../../common/Modal';
import { useAuth } from '../../../context/AuthContext';

export function CompanySupportAccessModal({ company, onClose }: { company: Tenant | null; onClose: () => void }) {
  const { showToast } = useToast();
  const { refreshProfile } = useAuth();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  return <Modal isOpen={!!company} onClose={() => { if (!busy) onClose(); }} title="Gerekçeli Destek Erişimi" size="small">
    <p>{company?.name} hesabına destek amacıyla geçiş gerekçeniz denetim kaydına yazılır.</p>
    <form onSubmit={async e => {
      e.preventDefault(); if (!company || busy) return;
      if (!reason.trim()) { showToast('Destek erişimi gerekçesini yazın.', 'error'); return; }
      setBusy(true);
      try {
        const result = await api.impersonateTenant(company.id, reason.trim());
        if (result.success) {
          localStorage.setItem('isbey_token', result.token);
          await refreshProfile();
          window.location.reload();
        }
      } catch (error) { showToast((error as Error).message || 'Destek erişimi başlatılamadı.', 'error'); }
      finally { setBusy(false); }
    }}>
      <label className="form-label" htmlFor="company-support-reason">Destek erişimi gerekçesi</label>
      <textarea id="company-support-reason" className="form-input" value={reason} required disabled={busy} onChange={e => setReason(e.target.value)} rows={3} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>İptal</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Açılıyor…' : 'Destek Erişimini Başlat'}</button>
      </div>
    </form>
  </Modal>;
}
