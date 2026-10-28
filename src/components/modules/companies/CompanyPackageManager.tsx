import { useCallback, useEffect, useState } from 'react';
import { Crown, RefreshCw } from 'lucide-react';
import { api } from '../../../services/api';
import type { AuditLog, SubscriptionPlan, Tenant } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { Modal } from '../../common/Modal';

const modeLabels = { FREE: 'Ücretsiz', PAID: 'Ücretli', TRIAL: 'Deneme' };
export function CompanyPackageBadge({ company }: { company: Tenant }) {
  const value = company.commercialSubscription;
  return <span className={`badge ${value?.billingMode === 'PAID' ? 'badge-info' : 'badge-secondary'}`}>
    {value ? modeLabels[value.billingMode] : company.status === 'TRIAL' ? 'Deneme' : company.plan === 'FREE' ? 'Ücretsiz' : 'Ücret türü belirtilmemiş'}
  </span>;
}

export function CompanyPackagePanel({ companyId, onSaved }: { companyId: string; onSaved: () => void }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [company, setCompany] = useState<Tenant | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [history, setHistory] = useState<AuditLog[]>([]);
  const [planIds, setPlanIds] = useState<string[]>([]);
  const [mode, setMode] = useState<'FREE' | 'PAID' | 'TRIAL'>('PAID');
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [amount, setAmount] = useState('');
  const [customPrice, setCustomPrice] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [autoRenew, setAutoRenew] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canManage = ['SUPER_ADMIN', 'ADMIN'].includes(user?.role || '');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await api.getCompanyPackage(companyId);
      const c = result.tenant, commercial = c.commercialSubscription;
      setCompany(c); setPlans(result.plans); setHistory(result.history);
      setPlanIds(c.selectedServicePlanIds ?? (result.subscription ? [result.subscription.planId] : result.plans.filter(p => p.slug.toUpperCase() === c.plan).map(p => p.id)));
      setMode(commercial?.billingMode ?? (c.status === 'TRIAL' ? 'TRIAL' : c.plan === 'FREE' ? 'FREE' : 'PAID'));
      setCycle(commercial?.billingCycle ?? result.subscription?.billingCycle ?? 'monthly');
      setAmount(commercial ? String(commercial.amount) : ''); setCustomPrice(!!commercial);
      setStart(c.erpSubscription?.startDate || c.license?.startDate?.slice(0, 10) || c.createdAt?.slice(0, 10));
      setEnd(c.erpSubscription?.endDate || c.license?.endDate?.slice(0, 10) || c.expiresAt?.slice(0, 10));
      setAutoRenew(result.subscription?.autoRenew ?? false); setReason('');
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [companyId]);
  useEffect(() => { if (canManage) void load(); else setLoading(false); }, [load, canManage]);
  const selected = plans.filter(p => planIds.includes(p.id));
  const catalogPrice = selected.reduce((sum, p) => sum + (cycle === 'yearly' ? p.yearlyPrice : p.monthlyPrice), 0);
  const currency = selected[0]?.currency || 'TRY';
  const effectiveAmount = mode === 'PAID' ? customPrice ? Number(amount) : catalogPrice : 0;
  const oldPlans = plans.filter(p => company?.selectedServicePlanIds?.includes(p.id));
  const oldPrice = oldPlans.reduce((sum, p) => sum + p.monthlyPrice, 0);
  const newPrice = selected.reduce((sum, p) => sum + p.monthlyPrice, 0);
  const change = oldPlans.length && newPrice > oldPrice ? 'Paket yükseltme' : oldPlans.length && newPrice < oldPrice ? 'Paket düşürme' : 'Paket değişikliği';
  const missingPlans = planIds.filter(id => !plans.some(p => p.id === id));
  if (!canManage) return <p className="text-muted">Paket ve ücret koşullarını platform yöneticisi düzenleyebilir.</p>;
  if (loading) return <p role="status">Paket bilgileri yükleniyor…</p>;
  if (!company) return <div><p role="alert">{error}</p><button className="btn btn-secondary" onClick={load}>Tekrar dene</button></div>;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const result = await api.updateCompanyPackage(companyId, { planIds, billingMode: mode, billingCycle: cycle,
        amount: effectiveAmount, startDate: start, endDate: end, autoRenew: mode === 'PAID' && autoRenew, reason,
        expectedUpdatedAt: company.updatedAt });
      showToast(result.message, 'success'); onSaved(); await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <section className="card-panel" aria-label="Müşteri paket yönetimi" style={{ padding: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <div><h4 style={{ margin: 0 }}><Crown size={17} /> Paket ve kullanım koşulları</h4>
        <p>{company.name} · Mevcut paket: {oldPlans.map(p => p.name).join(' + ') || company.plan} · <CompanyPackageBadge company={company} /></p></div>
      <button type="button" className="btn btn-secondary btn-sm" aria-label="Paket bilgilerini yenile" disabled={busy} onClick={load}><RefreshCw size={14} /></button>
    </div>
    <form onSubmit={submit} style={{ display: 'grid', gap: 16 }}>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="form-label">Kullanım türü</legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>{Object.entries(modeLabels).map(([id, label]) =>
          <label key={id} style={{ display: 'flex', gap: 6 }}><input type="radio" name={`billing-mode-${companyId}`} checked={mode === id} onChange={() => setMode(id as typeof mode)} />{label}</label>)}</div>
      </fieldset>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="form-label">Hizmet paketleri</legend>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
          {plans.map(p => <label key={p.id} style={{ padding: 12, border: `1px solid ${planIds.includes(p.id) ? 'var(--primary)' : 'var(--border-color)'}`, borderRadius: 8, background: planIds.includes(p.id) ? 'var(--primary-light)' : 'var(--bg-surface)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={planIds.includes(p.id)} onChange={() => setPlanIds(ids => ids.includes(p.id) ? ids.filter(id => id !== p.id) : [...ids, p.id])} /><strong>{p.name}</strong></div>
            <p style={{ margin: '8px 0', fontSize: 12 }}>{p.description}</p>
            <div style={{ fontSize: 12 }}>{(cycle === 'yearly' ? p.yearlyPrice : p.monthlyPrice).toLocaleString('tr-TR')} {p.currency} / {cycle === 'yearly' ? 'yıl' : 'ay'}</div>
            <small>{p.maxUsers} kullanıcı · {p.maxInvoicesPerMonth.toLocaleString('tr-TR')} belge/ay · {p.storageLimitMb} MB</small>
          </label>)}
        </div>
        {missingPlans.map(id => <label key={id} style={{ display: 'block', marginTop: 8 }}><input type="checkbox" checked onChange={() => setPlanIds(ids => ids.filter(x => x !== id))} /> Satışa kapalı paket ({id}) — değiştirmek için seçimi kaldırın</label>)}
        {!plans.length && <p>Satışa açık paket bulunamadı. Önce platform paketlerini tanımlayın.</p>}
      </fieldset>
      <div className="form-grid-2">
        <label className="form-label">Faturalama dönemi<select className="form-select" value={cycle} disabled={busy} onChange={e => setCycle(e.target.value as typeof cycle)}><option value="monthly">Aylık</option><option value="yearly">Yıllık</option></select></label>
        <div><span className="form-label">Dönem bedeli</span><div style={{ fontSize: 20, fontWeight: 700 }}>{Number.isFinite(effectiveAmount) ? effectiveAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '—'} {currency}</div>
          {mode === 'PAID' && <><label style={{ display: 'block', marginTop: 6 }}><input type="checkbox" checked={customPrice} disabled={busy} onChange={e => { setCustomPrice(e.target.checked); if (!amount) setAmount(String(catalogPrice)); }} /> Anlaşmalı bedel kullan</label>
            {customPrice && <label className="form-label">Anlaşmalı dönem bedeli<input className="form-input" type="number" min="0.01" step="0.01" value={amount} disabled={busy} required onChange={e => setAmount(e.target.value)} /></label>}</>}
        </div>
        <label className="form-label">Başlangıç tarihi<input className="form-input" type="date" value={start} disabled={busy} required onChange={e => setStart(e.target.value)} /></label>
        <label className="form-label">Bitiş tarihi<input className="form-input" type="date" min={start} value={end} disabled={busy} required onChange={e => setEnd(e.target.value)} /></label>
      </div>
      <label><input type="checkbox" disabled={busy || mode !== 'PAID'} checked={mode === 'PAID' && autoRenew} onChange={e => setAutoRenew(e.target.checked)} /> Otomatik yenileme tercihi</label>
      <label className="form-label">Değişiklik gerekçesi<textarea className="form-input" minLength={10} maxLength={1000} value={reason} disabled={busy} required onChange={e => setReason(e.target.value)} placeholder="Örn. Müşteri talebiyle yıllık kurumsal pakete geçiş" /></label>
      <div style={{ background: 'var(--bg-surface-secondary)', borderRadius: 8, padding: 12 }}>
        <strong>{change}</strong> · {modeLabels[mode]} · {cycle === 'monthly' ? 'Aylık' : 'Yıllık'}
        <p style={{ marginBottom: 0 }}>Seçilen paketlerin hizmetleri ve kotaları hemen uygulanır. Dönem bedeli kaydedilir; bu işlem ödeme çekmez veya tahsilat kaydı oluşturmaz.</p>
      </div>
      {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy || !planIds.length || !!missingPlans.length || reason.trim().length < 10 || !start || !end || end < start || !Number.isFinite(effectiveAmount) || (mode === 'PAID' && effectiveAmount <= 0)}>{busy ? 'Kaydediliyor…' : 'Paket Değişikliğini Kaydet'}</button>
    </form>
    <details style={{ marginTop: 16 }}><summary>Son paket değişiklikleri ({history.length})</summary>
      {!history.length && <p>Henüz yönetim ekranından paket değişikliği yapılmamış.</p>}
      {history.map(item => { let detail: any; try { detail = JSON.parse(item.details); } catch { detail = {}; }
        return <p key={item.id}><strong>{new Date(item.timestamp).toLocaleString('tr-TR')}</strong> · {item.username}<br /><span>{detail.reason || item.details}</span></p>; })}
    </details>
  </section>;
}

export function CompanyPackageModal({ companyId, onClose, onSaved }: { companyId: string | null; onClose: () => void; onSaved: () => void }) {
  return <Modal isOpen={!!companyId} onClose={onClose} size="large" title="Müşteri Paket Yönetimi">
    {companyId && <CompanyPackagePanel key={companyId} companyId={companyId} onSaved={onSaved} />}
  </Modal>;
}
