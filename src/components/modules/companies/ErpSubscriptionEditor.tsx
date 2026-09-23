import { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { api } from '../../../services/api';

export function ErpSubscriptionEditor({ company, onSaved }: { company: any; onSaved: () => void }) {
  const { user } = useAuth();
  const [startDate, setStartDate] = useState(company.erpSubscription?.startDate || company.license?.startDate || company.createdAt?.slice(0, 10) || '');
  const [endDate, setEndDate] = useState(company.erpSubscription?.endDate || company.license?.endDate || company.expiresAt?.slice(0, 10) || '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const canEdit = ['SUPER_ADMIN', 'ADMIN'].includes(user?.role || '');
  const save = async () => {
    setBusy(true); setMessage('');
    try { const result = await api.updateErpSubscription(company.id, { startDate, endDate }); setMessage(result.message); onSaved(); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  };
  return <section aria-label="ERP aboneliği" className="card-panel" style={{ padding: 16 }}>
    <h4>ERP abonelik süresi</h4>
    <p>Türkiye saatine göre bitiş günü sonuna kadar geçerlidir. Süre dolduğunda görüntüleme açık kalır; yeni kayıt ve değişiklik kapanır. Hızlı Bilişim hizmetleri ayrı yönetilir.</p>
    <div className="form-grid-2">
      <label>ERP başlangıç tarihi<input aria-label="ERP başlangıç tarihi" className="form-input" type="date" value={startDate} disabled={!canEdit || busy} onChange={e => setStartDate(e.target.value)} /></label>
      <label>ERP bitiş tarihi<input aria-label="ERP bitiş tarihi" className="form-input" type="date" value={endDate} min={startDate} disabled={!canEdit || busy} onChange={e => setEndDate(e.target.value)} /></label>
    </div>
    {canEdit && <button type="button" className="btn btn-primary" disabled={busy || !startDate || !endDate || endDate < startDate} onClick={save}>{busy ? 'Kaydediliyor…' : 'ERP Aboneliğini Kaydet / Yenile'}</button>}
    {message && <p role="status">{message}</p>}
  </section>;
}
