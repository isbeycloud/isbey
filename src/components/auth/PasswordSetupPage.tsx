import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import './PasswordSetupPage.css';

function readFragmentToken(): string {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const values = fragment.getAll('token');
  return values.length === 1 && /^[A-Za-z0-9_-]{43}$/.test(values[0]) ? values[0] : '';
}

export const PasswordSetupPage: React.FC = () => {
  const [token, setToken] = useState(readFragmentToken);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const mounted = useRef(true);
  const firstInput = useRef<HTMLInputElement>(null);
  const result = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mounted.current = true;
    window.history.replaceState(window.history.state, '', window.location.pathname);
    const meta = document.createElement('meta');
    meta.name = 'referrer'; meta.content = 'no-referrer';
    document.head.appendChild(meta);
    firstInput.current?.focus();
    return () => { mounted.current = false; meta.remove(); };
  }, []);
  useEffect(() => { if (success) result.current?.focus(); }, [success]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || saving.current) return;
    setError('');
    if (Array.from(password).length < 12) {
      setError('Yeni parola en az 12 karakter olmalıdır.'); return;
    }
    if (new TextEncoder().encode(password).length > 72) {
      setError('Parola en fazla 72 bayt olabilir. Türkçe karakterler ve emojiler bu sınıra daha hızlı ulaşabilir.'); return;
    }
    if (password !== confirmation) {
      setError('Parolalar eşleşmiyor. İki alana da aynı parolayı yazın.'); return;
    }
    saving.current = true; setBusy(true);
    try {
      const response = await api.completePasswordSetup({ token, newPassword: password, confirmPassword: confirmation });
      if (!response.success) throw new Error(response.message || 'Parola oluşturulamadı. Lütfen tekrar deneyin.');
      if (!mounted.current) return;
      setToken(''); setPassword(''); setConfirmation(''); setRevealed(false);
      setSuccess(response.message || 'Parolanız oluşturuldu. Giriş ekranından oturum açabilirsiniz.');
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Parola oluşturulamadı. Lütfen tekrar deneyin.');
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return <main className="password-setup-page">
    <section className="password-setup-panel" aria-labelledby="password-setup-title">
      <span className="password-setup-brand">BEY360</span>
      <h1 id="password-setup-title">Parolanızı oluşturun</h1>
      {success ? <div ref={result} tabIndex={-1} className="password-setup-result">
        <p role="status">{success}</p>
        <a href="/">Giriş ekranına dön</a>
      </div> : !token ? <>
        <p role="alert" className="password-setup-error">Parola oluşturma bağlantısı eksik veya geçersiz. Firma yöneticinizden yeni bir bağlantı isteyin.</p>
        <a href="/">Giriş ekranına dön</a>
      </> : <>
        <p className="password-setup-intro">Hesabınıza giriş yapmak için yeni bir parola belirleyin.</p>
        <p id="password-setup-help" className="password-setup-help">En az 12 karakter kullanın. Parola en fazla 72 bayt olabilir; Türkçe karakterler ve emojiler birden fazla bayt kullanabilir.</p>
        <form onSubmit={submit}>
          {error && <p role="alert" className="password-setup-error">{error}</p>}
          <fieldset disabled={busy}>
            <label htmlFor="password-setup-new">Yeni parola</label>
            <input ref={firstInput} id="password-setup-new" type={revealed ? 'text' : 'password'} autoComplete="new-password" required minLength={12} maxLength={72} value={password} onChange={event => setPassword(event.target.value)} aria-describedby="password-setup-help" spellCheck={false} autoCapitalize="none" />
            <label htmlFor="password-setup-confirm">Yeni parola tekrar</label>
            <input id="password-setup-confirm" type={revealed ? 'text' : 'password'} autoComplete="new-password" required minLength={12} maxLength={72} value={confirmation} onChange={event => setConfirmation(event.target.value)} spellCheck={false} autoCapitalize="none" />
            <label className="password-setup-reveal"><input type="checkbox" checked={revealed} onChange={event => setRevealed(event.target.checked)} /> Parolaları göster</label>
            <button type="submit">{busy ? 'Kaydediliyor…' : 'Parolayı Oluştur'}</button>
          </fieldset>
        </form>
        <a className="password-setup-back" href="/">Giriş ekranına dön</a>
      </>}
    </section>
  </main>;
};
