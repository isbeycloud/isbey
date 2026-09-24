import { useState } from 'react';
import './EServicePanels.css';
import { useAuth } from '../../../context/AuthContext';
import { api } from '../../../services/api';

export interface HistoryDocument { uuid: string; number: string; date: string; receiver: string; status: string }
export function InvoiceHistory() {
  const { activeTenant } = useAuth();
  const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [documents, setDocuments] = useState<HistoryDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [queried, setQueried] = useState(false);
  return <section className="e-service-panel" style={{ padding: 20, background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 12 }}>
    <h2>Geçmiş e-Faturalar</h2><p>{activeTenant?.name} · Hızlı Bilişim üzerinden kesilen faturalar</p>
    <form style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 12 }} onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError(''); setDocuments([]); setQueried(false);
      try { const result = await api.getCompanyInvoiceHistory(startDate, endDate); setDocuments(result.documents); setQueried(true); }
      catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }}>
      <label>Başlangıç<input className="form-input" required type="date" value={startDate} max={endDate} onChange={e => setStartDate(e.target.value)} /></label>
      <label>Bitiş<input className="form-input" required type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} /></label>
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Sorgulanıyor…' : 'Faturaları getir'}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {queried && !documents.length && <p>Bu tarih aralığında fatura bulunamadı.</p>}
    {documents.length > 0 && <div style={{ overflowX: 'auto', marginTop: 16 }}><table className="data-table" style={{ width: '100%' }}>
      <thead><tr><th>Fatura No / ETTN</th><th>Tarih</th><th>Alıcı</th><th>Durum</th></tr></thead>
      <tbody>{documents.map((d, i) => <tr key={`${d.uuid}-${i}`}><td>{d.number || '—'}<small style={{ display: 'block' }}>{d.uuid}</small></td><td>{d.date || '—'}</td><td>{d.receiver || '—'}</td><td>{d.status || 'Bilinmiyor'}</td></tr>)}</tbody>
    </table></div>}
  </section>;
}
