import { useEffect, useState } from 'react';
import { api } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import type { SubscriptionPlan } from '../../../types';
import { EServiceApplications } from '../edonusum/EServiceApplications';

export function ServiceCatalogView() {
  const { user, activeTenant, refreshProfile } = useAuth();
  const [selection, setSelection] = useState<string[]>(activeTenant?.selectedServicePlanIds || []);
  const canSelect = (user?.effectiveRoles || [user?.role]).some(r => ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'].includes(r || ''));
  const canOrder = (user?.effectiveRoles || [user?.role]).some(r => ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE'].includes(r || ''));
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [requested, setRequested] = useState<string[]>([]);
  const [requests, setRequests] = useState<{ id: string; tenantId: string; companyName: string; planId: string; planName: string; period: string; status: string }[]>([]);
  const loadRequests = async () => {
    const result = await api.getServicePlanRequests();
    setRequests(result.requests); setRequested(result.requests.filter(r => r.tenantId === activeTenant?.id).map(r => r.planId));
  };
  useEffect(() => {
    let current = true;
    api.getSubscriptionPlans().then(r => { if (current) setPlans(r.plans.filter(p => p.status === 'ACTIVE')); })
      .catch(e => { if (current) setError(e.message); }).finally(() => { if (current) setLoading(false); });
    if (canOrder) loadRequests().catch(e => { if (current) setError(e.message); });
    return () => { current = false; };
  }, []);
  return <div className="view-content-container" style={{ overflowY: 'auto', padding: 24 }}>
    <section className="e-service-panel">
      <h2>Hizmetler ve Paketler</h2>
      <p>{activeTenant?.name} için ERP paketlerini ve e-dönüşüm hizmetlerini inceleyin.</p>
      <p>Paketlerinizi seçerek hizmetleri hemen açabilirsiniz. Birden fazla paketin hizmetleri birlikte kullanılabilir. Seçim, mevcut üyelik sürenizi değiştirmez.</p>
      {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
      <label>Faturalama dönemi <select className="form-select" value={period} onChange={e => setPeriod(e.target.value as typeof period)}><option value="MONTHLY">Aylık</option><option value="YEARLY">Yıllık</option></select></label>
      {loading && <p>Paketler yükleniyor…</p>}
      {!loading && !plans.length && <p>Henüz satışa açık ERP paketi bulunmuyor. Aşağıdan e-hizmet başvurusu oluşturabilirsiniz.</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16, margin: '20px 0 28px' }}>
        {plans.map(p => <article key={p.id} style={{ border: '1px solid var(--border-color)', borderRadius: 12, padding: 20, background: 'var(--bg-surface)' }}>
          <h3 style={{ marginTop: 0 }}>{p.name}</h3><p>{p.description}</p>
          {canSelect && <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 12 }}><input type="checkbox" disabled={busy} checked={selection.includes(p.id)} onChange={e => setSelection(ids => e.target.checked ? [...ids, p.id] : ids.filter(id => id !== p.id))} /> <span>{p.name} paketini seç</span></label>}
          <strong style={{ fontSize: 24 }}>{(period === 'MONTHLY' ? p.monthlyPrice : p.yearlyPrice).toLocaleString('tr-TR', { style: 'currency', currency: p.currency })}</strong><span> / {period === 'MONTHLY' ? 'ay' : 'yıl'}</span>
          <p>{p.maxUsers} kullanıcı · {p.maxCompanies} firma<br />Aylık {p.maxInvoicesPerMonth} fatura · {p.includedCredits} kontör</p>
          {!!p.features?.length && <ul>{p.features.map(f => <li key={f}>{f}</li>)}</ul>}
          <button className="btn btn-primary" disabled={!canOrder || busy || requested.includes(p.id)} onClick={async () => {
            setBusy(true); setError(''); setMessage('');
            try { await api.requestServicePlan(p.id, period); await loadRequests(); setMessage(`${p.name} paket talebiniz kaydedildi. Henüz ödeme alınmadı.`); }
            catch (e) { setError((e as Error).message); } finally { setBusy(false); }
          }}>{requested.includes(p.id) ? 'Talep kaydedildi' : 'Paket talebi oluştur'}</button>
        </article>)}
      </div>
      {canSelect && <button className="btn btn-primary" disabled={busy || !selection.length} onClick={async () => {
        setBusy(true); setError(''); setMessage('');
        try { const r = await api.selectServicePlans(selection); await refreshProfile(); setMessage(r.message); }
        catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }}>Seçtiğim paketleri etkinleştir</button>}
      {!!requests.length && <section><h3>Paket talepleri</h3><ul>{requests.map(r => <li key={r.id}>{r.companyName} — {r.planName} · {r.period === 'MONTHLY' ? 'Aylık' : 'Yıllık'} · İncelemede</li>)}</ul></section>}
      <h3>e-Dönüşüm hizmetleri</h3>
      <p>e-Fatura, e-Arşiv, e-İrsaliye, e-SMM ve e-Defter hizmetleri için başvuru yapabilirsiniz. Fiyat, başvurunuza hazırlanacak teklifte gösterilir.</p>
      {canOrder ? <EServiceApplications /> : <p>Satın alma başvurusu için firma yöneticinizle iletişime geçin.</p>}
    </section>
  </div>;
}
