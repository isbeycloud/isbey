import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Mail, KeyRound, Pencil, RefreshCw, ArrowLeft, X } from 'lucide-react';
import { api } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { FirmMembershipEditor } from './FirmMembershipEditor';
import type { UserAccountProfile, UserAccountReadiness } from '../../types/userAccounts';
import './UserAccountsPanel.css';

type Mode = 'PROFILE' | 'PASSWORD' | 'EMAIL';
const mailLabels = { PENDING: 'Gönderim işleniyor', SENT: 'E-posta sunucusu kabul etti', FAILED: 'Gönderim başarısız', UNKNOWN: 'Gönderim doğrulanamadı' };
export function UserAccountEditor({ initial, readiness, initialMode = 'PROFILE', onClose, onChanged, onBusyChange }: { initial: UserAccountProfile; readiness: UserAccountReadiness; initialMode?: Mode; onClose: () => void; onChanged: (user: UserAccountProfile) => void; onBusyChange?: (value: boolean) => void }) {
 const { user: actor, refreshProfile, logout } = useAuth();
 const [account, setAccount] = useState(initial), [mode, setMode] = useState<Mode>(initialMode);
 const [profile, setProfile] = useState({ fullName: initial.fullName, email: initial.email, phone: initial.phone, department: initial.department, branch: initial.branch });
 const [actingPassword, setActingPassword] = useState(''), [newPassword, setNewPassword] = useState(''), [confirmPassword, setConfirmPassword] = useState('');
 const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [loginRequired, setLoginRequired] = useState(false), [showMembership, setShowMembership] = useState(false);
 const saving = useRef(false), mounted = useRef(true), requestIds = useRef({ PROFILE: crypto.randomUUID(), PASSWORD: crypto.randomUUID(), EMAIL: crypto.randomUUID() });
 useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
 const allowed = mode === 'PROFILE' ? account.canEdit : mode === 'PASSWORD' ? account.canSetPassword : account.canSend && readiness.ready;
 const submit = async (event: React.FormEvent) => {
  event.preventDefault(); if (saving.current || !allowed) return;
  if (!actingPassword) { setError('İşlem için kendi mevcut şifrenizi girin.'); return; }
  if (mode === 'PASSWORD' && (Array.from(newPassword).length < 12 || new TextEncoder().encode(newPassword).length > 72 || newPassword !== confirmPassword)) { setError('Yeni şifre en az 12 karakter olmalı; iki şifre aynı olmalıdır. En fazla 72 UTF-8 baytı kullanılabilir.'); return; }
  saving.current = true; setBusy(true); onBusyChange?.(true); setError(''); setNotice('');
  const base = { expectedRevision: account.revision, actingPassword, requestId: requestIds.current[mode] };
  try {
   const result = mode === 'PROFILE' ? await api.updateUserAccountProfile(account.id, { ...base, ...profile }) : mode === 'PASSWORD' ? await api.setUserAccountPassword(account.id, { ...base, newPassword, confirmPassword }) : await api.sendUserAccountPasswordEmail(account.id, base);
   if (!result.success) throw Error('Hesap işlemi tamamlanamadı.'); if (!mounted.current) return;
   setAccount(result.user); setActingPassword(''); setNewPassword(''); setConfirmPassword(''); requestIds.current[mode] = crypto.randomUUID();
   const requiresLogin = 'requiresLogin' in result && result.requiresLogin === true;
   setLoginRequired(requiresLogin); setNotice(requiresLogin ? 'Hesabınız güncellendi. Güvenlik nedeniyle yeniden giriş yapın.' : mode === 'EMAIL' ? 'Şifre belirleme e-postasını gönderim sunucusu kabul etti. Kullanıcı gelen ve spam klasörünü kontrol edebilir.' : mode === 'PASSWORD' ? 'Yeni şifre kaydedildi. Kullanıcının önceki oturumları geçersiz kılındı.' : 'İletişim bilgileri kaydedildi.');
   onChanged(result.user); if (!requiresLogin && actor?.id === account.id && mode === 'PROFILE') await refreshProfile();
  } catch(e) { if (mounted.current) setError(e instanceof Error ? e.message : 'Hesap işlemi tamamlanamadı.'); }
  finally { saving.current = false; if (mounted.current) { setBusy(false); onBusyChange?.(false); } }
 };
 return <section className="user-account-editor" aria-label="Kullanıcı hesabını düzenle">
  <div className="account-editor-heading"><div><h3>{account.fullName || account.username}</h3><p>@{account.username} · {account.email || 'E-posta tanımlanmamış'}</p></div><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}><ArrowLeft size={15} /> Geri</button></div>
  {notice && <p role="status" className="account-success">{notice}</p>}
  {loginRequired ? <button className="btn btn-primary" onClick={() => { logout(); window.location.assign('/'); }}>Yeniden Giriş Yap</button> : <>
   <div className="account-tabs" aria-label="Hesap işlemleri">{([['PROFILE', 'İletişim Bilgileri', Pencil], ['PASSWORD', 'Yeni Şifre Belirle', KeyRound], ['EMAIL', 'Şifre E-postası', Mail]] as const).map(([id, label, Icon]) => <button key={id} type="button" className={`btn ${mode === id ? 'btn-primary' : 'btn-secondary'}`} disabled={busy} aria-pressed={mode === id} onClick={() => { setMode(id); setActingPassword(''); setNewPassword(''); setConfirmPassword(''); setError(''); setNotice(''); }}><Icon size={15} /> {label}</button>)}</div>
   {account.restrictionReason && <p className="account-note">{account.restrictionReason}</p>}
   {error && <p role="alert" className="account-error">{error} Girdileriniz korunuyor. Hesap değiştiyse yeniden yükleyin; doğrulanamayan e-posta gönderiminde önce alıcının gelen kutusunu kontrol edin.</p>}
   <form onSubmit={submit}>
    <fieldset disabled={busy || !allowed}>
     {mode === 'PROFILE' && <><p className="account-note">Ad, e-posta ve iletişim bilgileri bu kişinin ortak hesabına aittir; yetkili olduğu diğer firmalarda da görünür. Firma rolleri ayrı yönetilir.</p><div className="account-form-grid">
      <label>Ad soyad<input required maxLength={120} value={profile.fullName} onChange={e => setProfile({ ...profile, fullName: e.target.value })} autoComplete="name" /></label>
      <label>E-posta<input required type="email" maxLength={254} value={profile.email} onChange={e => setProfile({ ...profile, email: e.target.value })} autoComplete="email" /></label>
      <label>Telefon<input type="tel" maxLength={40} value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} autoComplete="tel" /></label>
      <label>Departman<input maxLength={80} value={profile.department} onChange={e => setProfile({ ...profile, department: e.target.value })} /></label>
      <label>Şube<input maxLength={80} value={profile.branch} onChange={e => setProfile({ ...profile, branch: e.target.value })} /></label>
     </div></>}
     {mode === 'PASSWORD' && <><p className="account-note">Şifre en az 12 karakter olmalıdır. En fazla 72 UTF-8 baytı kullanılabilir. Boşluklar şifrenin parçasıdır. Kaydedildiğinde önceki oturumlar sonlandırılır.</p><div className="account-form-grid"><label>Yeni şifre<input type="password" required minLength={12} maxLength={72} value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" /></label><label>Yeni şifre tekrar<input type="password" required minLength={12} maxLength={72} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" /></label></div></>}
     {mode === 'EMAIL' && <div className="account-mail-preview"><h4>Şifre belirleme bağlantısı</h4><p><strong>Alıcı:</strong> {account.email || 'E-posta tanımlanmamış'}</p><p>Kullanıcıya 30 dakika geçerli, tek kullanımlık bağlantı gönderilir. Kullanıcı yeni şifresini kendisi belirler; şifre e-postayla paylaşılmaz.</p><p>Yeni bağlantı oluşturulduğunda önceki bağlantı geçersiz olur.</p></div>}
     <label className="account-acting-password">İşlem için kendi mevcut şifreniz<input type="password" required maxLength={72} value={actingPassword} onChange={e => setActingPassword(e.target.value)} autoComplete="current-password" /></label>
    </fieldset>
    {mode === 'EMAIL' && <p role={readiness.ready ? 'status' : 'note'} className="account-note">{readiness.message}</p>}
    {mode === 'EMAIL' && account.lastMail && <p className="account-note">Son gönderim: {mailLabels[account.lastMail.status]} · {new Date(account.lastMail.updatedAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</p>}
    <div className="account-form-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>Vazgeç</button><button type="submit" className="btn btn-primary" disabled={busy || !allowed}>{busy ? 'İşleniyor…' : mode === 'PROFILE' ? 'Bilgileri Kaydet' : mode === 'PASSWORD' ? 'Yeni Şifreyi Kaydet' : 'Şifre Bağlantısını E-postala'}</button></div>
   </form>
   {actor?.id !== account.id && <div className="account-membership"><button className="btn btn-secondary" onClick={() => setShowMembership(!showMembership)}>{showMembership ? 'Firma Yetkilerini Gizle' : 'Firma Yetkilerini Aç'}</button>{showMembership && <FirmMembershipEditor userId={account.id} />}</div>}
  </>}
 </section>;
}

export const UserAccountsPanel: React.FC = () => { const { activeTenant } = useApp(); const { user } = useAuth(); return <UserAccountsContent key={`${activeTenant?.id}:${user?.id}`} />; };
function UserAccountsContent() {
 const [users, setUsers] = useState<UserAccountProfile[]>([]), [readiness, setReadiness] = useState<UserAccountReadiness>({ ready: false, message: 'E-posta yapılandırması kontrol ediliyor.' }), [loading, setLoading] = useState(true), [error, setError] = useState(''), [selected, setSelected] = useState<UserAccountProfile | null>(null), [search, setSearch] = useState('');
 const mounted = useRef(true), generation = useRef(0);
 const load = async () => { const n = ++generation.current; setLoading(true); setError(''); try { const result = await api.getUserAccounts(); if (!mounted.current || n !== generation.current) return; if (!result.success) throw Error('Kullanıcı hesapları alınamadı.'); setUsers(result.users); setReadiness(result.mailReadiness); } catch(e) { if (mounted.current && n === generation.current) { setUsers([]); setError(e instanceof Error ? e.message : 'Kullanıcı hesapları alınamadı.'); } } finally { if (mounted.current && n === generation.current) setLoading(false); } };
 useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; generation.current++; }; }, []);
 return <section className="user-accounts-panel" aria-label="Kullanıcı hesapları" data-testid="user-accounts-panel">
  {selected ? <UserAccountEditor key={selected.id} initial={selected} readiness={readiness} onClose={() => setSelected(null)} onChanged={next => { setUsers(old => old.map(u => u.id === next.id ? next : u)); }} /> : <>
   <header className="account-panel-heading"><div><h2>Kullanıcı Hesapları</h2><p>Aktif firmanın kullanıcı iletişim bilgileri ve şifre yönetimi.</p></div><button className="btn btn-secondary" disabled={loading} onClick={() => void load()}><RefreshCw size={15} /> Yenile</button></header>
   <p className="account-note">{readiness.message}</p>
   {error ? <p role="alert" className="account-error">{error} <button className="btn btn-secondary" onClick={() => void load()}>Tekrar Dene</button></p> : loading ? <p role="status">Kullanıcı hesapları yükleniyor…</p> : <>
    <label className="account-search">Kullanıcı ara<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Ad, kullanıcı adı veya e-posta" /></label>
    <div className="account-table-wrap"><table><thead><tr><th>Kullanıcı</th><th>İletişim</th><th>Durum / gönderim</th><th>İşlem</th></tr></thead><tbody>{users.filter(u => `${u.fullName} ${u.username} ${u.email}`.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR'))).map(u => <tr key={u.id}><td><strong>{u.fullName}</strong><small>@{u.username}</small></td><td>{u.email || 'E-posta tanımlanmamış'}<small>{u.phone || 'Telefon tanımlanmamış'}</small><small>{[u.department, u.branch].filter(Boolean).join(' · ')}</small></td><td>{u.active ? 'Aktif' : 'Pasif'}<small>{u.lastMail ? mailLabels[u.lastMail.status] : 'Gönderim kaydı yok'}</small>{u.restrictionReason && <small>{u.restrictionReason}</small>}</td><td><button className="btn btn-primary btn-sm" onClick={() => setSelected(u)}>Hesabı Aç</button></td></tr>)}</tbody></table></div>
    {!users.length && <p className="account-empty">Bu firmada görüntülenebilir kullanıcı bulunmuyor.</p>}
   </>}
  </>}
 </section>;
}

export function UserAccountDialog({ userId, isOpen, onClose, initialMode = 'PROFILE' }: { userId?: string; isOpen: boolean; onClose: () => void; initialMode?: Mode }) {
 const { activeTenant } = useApp(); const { user } = useAuth();
 if (!isOpen) return null;
 return <UserAccountDialogContent key={`${activeTenant?.id}:${user?.id}:${userId || 'me'}`} userId={userId} onClose={onClose} initialMode={initialMode} />;
}
function UserAccountDialogContent({ userId, onClose, initialMode }: { userId?: string; onClose: () => void; initialMode: Mode }) {
 const [account, setAccount] = useState<UserAccountProfile | null>(null), [readiness, setReadiness] = useState<UserAccountReadiness>({ ready: false, message: '' }), [error, setError] = useState('');
 const ref = useRef<HTMLDivElement>(null);
 const [dialogBusy, setDialogBusy] = useState(false);
 useEffect(() => { let cancelled = false; const previous = document.activeElement as HTMLElement | null;
  const load = async () => { try { const result = userId ? await api.getUserAccounts() : await api.getMyUserAccount(); if (cancelled) return; const target = 'users' in result ? result.users.find(u => u.id === userId) : result.user; if (!result.success || !target) throw Error('Kullanıcı aktif firma kapsamında bulunamadı. İlgili firmaya geçip yeniden deneyin.'); setAccount(target); setReadiness(result.mailReadiness); } catch(e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Hesap bilgisi alınamadı.'); } };
  void load(); ref.current?.focus(); return () => { cancelled = true; previous?.focus(); };
 }, [userId]);
 return createPortal(<div className="modal-overlay user-account-overlay"><div className="modal-dialog user-account-dialog" role="dialog" aria-modal="true" aria-label="Kullanıcı Hesabı" tabIndex={-1} ref={ref} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!dialogBusy) onClose(); } if (e.key === 'Tab') { const all = Array.from(ref.current?.querySelectorAll<HTMLElement>('input:not(:disabled),textarea:not(:disabled),select:not(:disabled),button:not(:disabled),summary') || []), first = all[0], last = all.at(-1); if (!first) { e.preventDefault(); ref.current?.focus(); } else if (document.activeElement === ref.current || !ref.current?.contains(document.activeElement)) { e.preventDefault(); (e.shiftKey ? last : first)?.focus(); } else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } } }}><div className="modal-header"><h3>Kullanıcı Hesabı</h3>{!account && <button className="btn btn-secondary" aria-label="Hesap penceresini kapat" onClick={onClose}><X size={18} /></button>}</div><div className="modal-body">{error ? <p role="alert" className="account-error">{error}</p> : account ? <UserAccountEditor key={account.id} initial={account} readiness={readiness} initialMode={initialMode} onClose={onClose} onChanged={setAccount} onBusyChange={setDialogBusy} /> : <p role="status">Hesap bilgileri yükleniyor…</p>}</div></div></div>, document.body);
}
