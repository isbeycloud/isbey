import { useEffect, useState } from 'react';
import { api, ApiError } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import type { ServiceApplication } from '../edonusum/EServiceApplications';

type Choice = 'ON_MUHASEBE' | 'E_DONUSUM';

interface ChoiceState {
  choice: Choice | null;
  choiceAt: string | null;
  trial: { state: string; expiresAt: string; daysRemaining: number; decisionRequired: boolean };
}

/**
 * Deneme Kararı Paneli (2026-10-16, kayıt akışı).
 *
 * İş kuralı: kayıtta e-Dönüşüm seçimi SORULMAZ; 14 gün ön muhasebe serbest
 * kullanılır. Deneme bitince seçim ZORUNLUDUR — seçim yapılmadan veri uçları
 * sunucuda 403 döner (kilit istemcide değil `trialGate`'tedir; bu panel yalnız
 * kararı toplar ve sunucuya yazar).
 *
 * Akış:
 *   1. Deneme sürerken → kalan gün bilgisi (pasif banner, seçim YOK).
 *   2. Süre dolunca → iki yol: "Ön muhasebeye devam et" (POST choice) ya da
 *      e-Dönüşüm başvurusu (POST applications → teklif → ödeme onayı).
 *      E_DONUSUM bu ekrandaki butondan VERİLEMEZ — geçiş ücretlidir, karar
 *      başvuru+ödeme yoluyla netleşir (sunucu 400 EDONUSUM_REQUIRES_APPLICATION).
 *   3. Karar verilmişse → karar bilgisi (bir kez, geri alınamaz).
 *
 * Kilitliyken bu panelin uçları AÇIKTIR (sunucu allowlist); karar yetkisi
 * COMPANY_ADMIN ile sınırlıdır (sunucu `requireRole` denetler).
 */
export function TrialDecisionPanel() {
  const { activeTenant, refreshProfile, user, trial: profileTrial } = useAuth();
  // Aktif denemede kalan gün ve paket hatırlatması açılmaz. Süre dolunca
  // mevcut karar kapısı ve gerçek işlem hataları görünür kalır.
  const quiet = profileTrial?.state === 'ACTIVE' && profileTrial.daysRemaining > 0;
  const canDecide = (user?.effectiveRoles || [user?.role]).some(r => ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'].includes(r || ''));
  const [state, setState] = useState<ChoiceState | null>(null);
  const [applications, setApplications] = useState<ServiceApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [showApplicationForm, setShowApplicationForm] = useState(false);
  const [form, setForm] = useState({ contactName: user?.fullName || '', email: '', phone: '', services: [] as string[], consent: false });

  const load = async () => {
    const choice = await api.getEDonusumChoice();
    setState({ choice: choice.choice, choiceAt: choice.choiceAt, trial: choice.trial });
    // Başvurular kilitliyken de GÖRÜLEBİLİR (karar yerine GEÇMEZ — kilit sürer).
    try {
      const apps = await api.getEDonusumApplications();
      setApplications(apps.applications);
    } catch {
      // Başvuru listesi okunamazsa karar paneli BOZULMAZ (liste ikincildir).
      setApplications([]);
    }
  };

  useEffect(() => {
    if (quiet) { setLoading(false); return; }
    let current = true;
    load()
      .catch(e => { if (current) setError((e as Error).message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [quiet]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try {
      await fn();
      await load();
      await refreshProfile();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      // Sunucu kodu korunur; kullanıcıya mesaj AYNEN taşınır (uydurma yok).
      setError((e as Error).message + (code ? ` (${code})` : ''));
      if (code === 'EDONUSUM_REQUIRES_APPLICATION') setShowApplicationForm(true);
    } finally {
      setBusy(false);
    }
  };

  if (quiet) return null;
  if (loading) return <section aria-label="Deneme durumu"><p>Deneme durumu yükleniyor…</p></section>;
  if (!state) return <section aria-label="Deneme durumu">{error && <p role="alert">{error}</p>}</section>;

  const { choice, trial } = state;
  const serviceLabels: Record<string, string> = { EFATURA: 'e-Fatura', EARSIV: 'e-Arşiv', EIRSALIYE: 'e-İrsaliye', ESMM: 'e-SMM', EDEFTER: 'e-Defter' };

  return (
    <section aria-label="Deneme ve e-Dönüşüm kararı" style={{ border: '1px solid var(--border-color)', borderRadius: 12, padding: 20, background: 'var(--bg-surface)', marginBottom: 24 }}>
      <h3 style={{ marginTop: 0 }}>Deneme ve e-Dönüşüm Kararı</h3>
      <p>{activeTenant?.name} · deneme {trial.state === 'ACTIVE' ? `sürüyor (${trial.daysRemaining} gün kaldı)` : trial.state === 'DECISION_REQUIRED' ? 'süresi doldu — kararınız bekleniyor' : 'tamamlandı'}.</p>
      {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
      {message && <p role="status">{message}</p>}

      {/* 1. Karar verilmişse: bilgi, tekrar seçim YOK */}
      {choice && (
        <p role="status">
          Tercihiniz kaydedildi: {choice === 'ON_MUHASEBE' ? 'ön muhasebeye devam' : 'e-Dönüşüm (e-Fatura / e-Belge)'}.
          Tercih bir kez verilir ve değiştirilemez; değişiklik için destek ile iletişime geçin.
        </p>
      )}

      {/* 2. Deneme sürerken: seçim SORULMAZ */}
      {!choice && !trial.decisionRequired && (
        <p>Deneme süreniz devam ediyor. e-Dönüşüm tercihi deneme bitiminde alınır; şimdi seçim yapmanız gerekmez.</p>
      )}

      {/* 3. Süre dolmuş + karar yok: iki yol */}
      {!choice && trial.decisionRequired && (
        <>
          <p role="alert" style={{ fontWeight: 700 }}>
            Deneme süreniz doldu. Kullanmaya devam etmek için tercihinizi seçmelisiniz. Seçim yapmadan diğer ekranlardaki verileriniz açılmaz.
          </p>
          {!canDecide && <p>Tercihi vermek için firma yöneticinizle iletişime geçin.</p>}
          {canDecide && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
              <button className="btn btn-primary" disabled={busy} onClick={() => run(async () => {
                await api.submitEDonusumChoice('ON_MUHASEBE');
                setMessage('Tercihiniz kaydedildi: ön muhasebe kullanımına devam edebilirsiniz.');
              })}>
                Ön muhasebeye devam et
              </button>
              <button className="btn btn-secondary" disabled={busy} onClick={() => setShowApplicationForm(v => !v)}>
                {showApplicationForm ? 'Başvuru formunu gizle' : 'e-Fatura / e-Belge sürecine geç'}
              </button>
            </div>
          )}
          {showApplicationForm && canDecide && (
            <form onSubmit={e => {
              e.preventDefault();
              void run(async () => {
                await api.submitEDonusumApplication(form);
                setMessage('Başvurunuz kaydedildi. Teklif hazırlanıp size iletilecek; ödeme onayı sonrası e-Dönüşüm tercihiniz netleşir.');
                setForm(f => ({ ...f, services: [], consent: false }));
                setShowApplicationForm(false);
              });
            }}>
              <fieldset disabled={busy} style={{ border: 0, padding: 0, display: 'grid', gap: 12 }}>
                <legend>e-Dönüşüm başvurusu</legend>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <label>Yetkili adı<input className="form-input" required maxLength={120} value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })} /></label>
                  <label>E-posta<input className="form-input" type="email" required maxLength={254} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
                  <label>Telefon<input className="form-input" type="tel" required minLength={10} maxLength={30} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                  {Object.entries(serviceLabels).map(([key, label]) => (
                    <label key={key}>
                      <input type="checkbox" checked={form.services.includes(key)} onChange={e => setForm({ ...form, services: e.target.checked ? [...form.services, key] : form.services.filter(s => s !== key) })} /> {label}
                    </label>
                  ))}
                </div>
                <label><input type="checkbox" required checked={form.consent} onChange={e => setForm({ ...form, consent: e.target.checked })} /> Seçili firma adına başvuru yapmaya yetkili olduğumu ve bilgilerin doğruluğunu onaylıyorum.</label>
                <div><button className="btn btn-primary" disabled={!form.services.length || busy}>Başvuruyu gönder</button></div>
              </fieldset>
            </form>
          )}
          {!!applications.length && (
            <div style={{ marginTop: 12 }}>
              <h4>Başvurularım</h4>
              <ul>
                {applications.map(a => (
                  <li key={a.id}>
                    {a.services.map(s => serviceLabels[s] || s).join(', ')} · {a.status === 'SUBMITTED' ? 'İncelemede' : a.status === 'QUOTED' ? 'Ödeme bekleniyor' : 'Ödendi'} · {new Date(a.createdAt).toLocaleDateString('tr-TR')}
                  </li>
                ))}
              </ul>
              <p>Başvuru tek başına kilidi AÇMAZ — ödeme onayı sonrası tercihiniz netleşir.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
