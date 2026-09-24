import { useEffect, useState } from 'react';
import './EServicePanels.css';
import { useAuth } from '../../../context/AuthContext';
import { api } from '../../../services/api';

export interface ServiceApplication {
  id: string; tenantId: string; companyName: string; taxNumber: string; services: string[];
  status: 'SUBMITTED' | 'QUOTED' | 'PAID'; createdAt: string; amountMinor?: number;
  currency: string; orderId?: string;
}
const services = { EFATURA: 'e-Fatura', EARSIV: 'e-Arşiv', EIRSALIYE: 'e-İrsaliye', ESMM: 'e-SMM', EDEFTER: 'e-Defter' };
const statuses = { SUBMITTED: 'İncelemede', QUOTED: 'Ödeme bekleniyor', PAID: 'Ödendi · Hizmet onayı bekleniyor' };

export function EServiceApplications() {
  const { user, activeTenant } = useAuth();
  const platform = ['SUPER_ADMIN', 'ADMIN'].includes(user?.role || '');
  const [applications, setApplications] = useState<ServiceApplication[]>([]);
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ contactName: user?.fullName || '', email: '', phone: '', services: [] as string[], consent: false });
  const load = async () => {
    const result = await api.getEServiceApplications();
    setApplications(result.applications); setAvailable(result.checkoutAvailable);
  };
  useEffect(() => { load().catch(e => setError(e.message)); }, []);
  const action = async (run: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try { await run(); await load(); } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <section className="e-service-panel" style={{ padding: 20, border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-surface)' }}>
    <h2>e-Hizmet Başvuru ve Ödeme</h2>
    <p>{activeTenant?.name} · {activeTenant?.taxNumber}</p>
    <p>Başvurunuz incelenir, hizmet teklifi hazırlanır. Ödeme sonrasında entegratör aktivasyonu ayrıca tamamlanır.</p>
    {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
    {message && <p role="status">{message}</p>}
    <form onSubmit={e => { e.preventDefault(); void action(async () => {
      await api.submitEServiceApplication(form); setMessage('Başvurunuz kaydedildi.'); setForm(f => ({ ...f, services: [], consent: false }));
    }); }}>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, display: 'grid', gap: 12 }}>
        <legend>Yeni başvuru</legend>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <label>Yetkili adı<input className="form-input" required maxLength={120} value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })} /></label>
          <label>E-posta<input className="form-input" type="email" required maxLength={254} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
          <label>Telefon<input className="form-input" type="tel" required minLength={10} maxLength={30} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>{Object.entries(services).map(([key, label]) => <label key={key}><input type="checkbox" checked={form.services.includes(key)} onChange={e => setForm({ ...form, services: e.target.checked ? [...form.services, key] : form.services.filter(s => s !== key) })} /> {label}</label>)}</div>
        <label><input type="checkbox" required checked={form.consent} onChange={e => setForm({ ...form, consent: e.target.checked })} /> Seçili firma adına başvuru yapmaya yetkili olduğumu ve bilgilerin doğruluğunu onaylıyorum.</label>
        <button className="btn btn-primary" disabled={!form.services.length || busy}>Başvuruyu gönder</button>
      </fieldset>
    </form>
    <h3>{platform ? 'Firma başvuruları' : 'Başvurularım'}</h3>
    {!available && <p role="status">Online ödeme henüz etkin değil. Canlı ödeme sağlayıcısı bağlantısı bekleniyor.</p>}
    {!applications.length && <p>Henüz başvuru bulunmuyor.</p>}
    <div style={{ overflowX: 'auto' }}><table className="data-table" style={{ width: '100%', marginTop: 12 }}>
      <thead><tr><th>Firma</th><th>Hizmetler</th><th>Tarih</th><th>Durum</th><th>Tutar / İşlem</th></tr></thead>
      <tbody>{applications.map(a => <tr key={a.id}>
        <td>{a.companyName}<small style={{ display: 'block' }}>{a.taxNumber}</small></td>
        <td>{a.services.map(s => services[s as keyof typeof services] || s).join(', ')}</td>
        <td>{new Date(a.createdAt).toLocaleDateString('tr-TR')}</td><td>{statuses[a.status]}</td>
        <td>{a.amountMinor !== undefined ? (a.amountMinor / 100).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' }) : 'Teklif hazırlanıyor'}
          {platform && a.status === 'SUBMITTED' && <form onSubmit={e => { e.preventDefault(); void action(async () => { await api.quoteEServiceApplication(a.id, Math.round(Number(amounts[a.id]) * 100)); setMessage('Teklif kaydedildi.'); }); }}>
            <input aria-label={`${a.companyName} teklif tutarı (TL)`} type="number" min="0.01" max="1000000" step="0.01" required value={amounts[a.id] || ''} onChange={e => setAmounts({ ...amounts, [a.id]: e.target.value })} placeholder="KDV dahil TL" />
            <button className="btn btn-secondary" disabled={busy}>Teklif ver</button>
          </form>}
          {a.status === 'QUOTED' && a.tenantId === activeTenant?.id && <button className="btn btn-primary" disabled={busy || !available} onClick={() => action(async () => { const result = await api.checkoutEServiceApplication(a.id); window.location.assign(result.url); })}>Ödeme sayfasına git</button>}
        </td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}
