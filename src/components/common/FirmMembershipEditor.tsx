import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { ERP_MENUS } from '../../data/erpMenus';

interface Membership { tenantId: string; roleIds: string[]; status: string; isOwner?: boolean; allowedMenuIds?: string[] | null }
interface Role { id: string; name: string; tenantId?: string; isSystem: boolean }
export function FirmMembershipEditor({ userId, initialTenantId }: { userId: string; initialTenantId?: string }) {
  const { showToast } = useToast();
  const { activeTenant, user } = useAuth();
  const platform = ['SUPER_ADMIN', 'ADMIN'].includes(user?.role || '');
  const [isOwner, setIsOwner] = useState(false);
  const [allowedMenuIds, setAllowedMenuIds] = useState<string[] | null>(null);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [status, setStatus] = useState('active');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = async () => {
    const result = await api.getUserMemberships(userId);
    setCompanies(result.companies); setRoles(result.roles); setMemberships(result.memberships);
    return result;
  };
  const select = (id: string, list = memberships) => {
    const membership = list.find(m => m.tenantId === id);
    setIsOwner(!!membership?.isOwner);
    setAllowedMenuIds(membership?.allowedMenuIds ?? null);
    setTenantId(id); setRoleIds(membership?.roleIds || []); setStatus(membership?.status || 'active');
  };
  useEffect(() => {
    let current = true;
    setBusy(true); setError('');
    api.getUserMemberships(userId).then(result => {
      if (!current) return;
      setCompanies(result.companies); setRoles(result.roles); setMemberships(result.memberships);
      const preferred = initialTenantId || activeTenant?.id;
      select(result.companies.some(c => c.id === preferred) ? preferred! : result.memberships[0]?.tenantId || result.companies[0]?.id || '', result.memberships);
    }).catch(err => { if (current) setError(err.message); }).finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [userId]);
  const save = async (remove = false) => {
    if (remove && !window.confirm('Yalnızca seçili firma üyeliği kaldırılsın mı?')) return;
    setBusy(true); setError('');
    try {
      const result = remove ? await api.deleteUserMembership(userId, tenantId)
        : await api.saveUserMembership(userId, tenantId, { roleIds, status, allowedMenuIds, ...(platform ? { isOwner } : {}) });
      const refreshed = await load(); select(tenantId, refreshed.memberships);
      showToast(result.message, 'success');
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  return <section aria-label="Firma üyelikleri" style={{ borderTop: '1px solid var(--border-color)', paddingTop: 16, marginTop: 16 }}>
    <h3>Firma Üyelikleri</h3>
    <p>Aynı hesap birden fazla firmaya bağlanabilir. Mali müşavir portföyü için ilgili firmalarda Muhasebe rolünü seçin.</p>
    {platform && <label><input type="checkbox" checked={isOwner} disabled={busy} onChange={e => setIsOwner(e.target.checked)} /> Bu firmanın sahibi</label>}
    <p>Roller ve aktiflik durumu seçili firmaya özeldir. ERP abonelik süresi firma üzerinden yönetilir.</p>
    {error && <p role="alert" style={{ color: 'var(--danger, #dc2626)' }}>{error}</p>}
    <label className="form-label" htmlFor="membership-company">Firma</label>
    <select id="membership-company" className="form-select" value={tenantId} disabled={busy} onChange={e => select(e.target.value)}>
      <option value="">Firma seçin</option>
      {companies.map(c => <option key={c.id} value={c.id}>{c.name}{memberships.some(m => m.tenantId === c.id) ? ' — Üye' : ''}</option>)}
    </select>
    <fieldset disabled={busy || !tenantId} style={{ border: 0, padding: '12px 0', display: 'grid', gap: 8 }}>
      <legend>Bu firmadaki roller</legend>
      {roles.filter(r => r.isSystem || r.tenantId === tenantId).map(r => <label key={r.id}>
        <input type="checkbox" checked={roleIds.includes(r.id)} onChange={e => setRoleIds(e.target.checked ? [...roleIds, r.id] : roleIds.filter(id => id !== r.id))} /> {r.name}
      </label>)}
    </fieldset>
    <fieldset disabled={busy || !tenantId} style={{ padding: 16, border: '1px solid var(--border-color)', borderRadius: 8, margin: '16px 0' }}>
      <legend>Erişebileceği ERP menüleri</legend>
      <p>Seçimler yalnızca bu firmada geçerlidir. İşlem yetkileri seçilen rollerle belirlenir; menü seçmek ilave yetki vermez.</p>
      <label><input type="checkbox" checked={allowedMenuIds === null} onChange={e => setAllowedMenuIds(e.target.checked ? null : ERP_MENUS.map(m => m.id))} /> Rolün izin verdiği tüm menüler</label>
      {allowedMenuIds !== null && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 12 }}>{ERP_MENUS.map(m => <label key={m.id}><input type="checkbox" checked={allowedMenuIds.includes(m.id)} onChange={e => setAllowedMenuIds(e.target.checked ? [...allowedMenuIds, m.id] : allowedMenuIds.filter(id => id !== m.id))} /> {m.label}</label>)}</div>}
      <p>Ana sayfa, yardım ve hizmet kataloğu açık kalır. Kapalı menülerin API istekleri de engellenir.</p>
    </fieldset>
    <label className="form-label" htmlFor="membership-status">Üyelik durumu</label>
    <select id="membership-status" className="form-select" value={status} disabled={busy} onChange={e => setStatus(e.target.value)}>
      <option value="active">Aktif</option><option value="passive">Pasif</option>
    </select>
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      <button type="button" className="btn btn-primary" disabled={busy || !tenantId || !roleIds.length} onClick={() => save()}>{busy ? 'İşleniyor…' : 'Firma Üyeliğini Kaydet'}</button>
      {memberships.some(m => m.tenantId === tenantId) && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => save(true)}>Üyeliği Kaldır</button>}
    </div>
  </section>;
}
