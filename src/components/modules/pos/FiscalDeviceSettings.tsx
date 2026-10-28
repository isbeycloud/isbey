import { useEffect, useState } from 'react';
import { api } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import type { FiscalDeviceInput, FiscalDeviceProfile, FiscalAdapterManifest, FiscalDeviceReadiness, DeviceTransport } from '../../../types/fiscalDevices';
import './FiscalDeviceSettings.css';

const empty: FiscalDeviceInput = { name: '', adapterId: 'beko-tokenx-wire', model: '', serialNumber: '', branchLabel: '', workstationName: '', transport: 'USB', connectionHint: '' };
const transportNames: Record<DeviceTransport, string> = { USB: 'USB / kablolu', TCP_IP: 'Yerel ağ', SERIAL: 'Seri bağlantı', CLOUD: 'Üretici bulut bağlantısı' };

export function FiscalDeviceSettings() {
  const { activeTenant } = useAuth();
  return <DeviceSettingsContent key={activeTenant?.id} />;
}

function DeviceSettingsContent() {
  const [devices, setDevices] = useState<FiscalDeviceProfile[]>([]);
  const [adapters, setAdapters] = useState<FiscalAdapterManifest[]>([]);
  const [form, setForm] = useState<FiscalDeviceInput>({ ...empty });
  const [editing, setEditing] = useState<FiscalDeviceProfile | null>(null);
  const [readiness, setReadiness] = useState<FiscalDeviceReadiness | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = async () => { const result = await api.getFiscalDevices(); setDevices(result.devices); setAdapters(result.adapters); };
  useEffect(() => {
    let active = true;
    api.getFiscalDevices().then(result => { if (active) { setDevices(result.devices); setAdapters(result.adapters); } })
      .catch(err => { if (active) setError(err.message || 'Cihaz listesi alınamadı.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const manifest = adapters.find(a => a.id === form.adapterId);
  const changeAdapter = (id: string) => { const adapter = adapters.find(a => a.id === id); setForm({ ...form, adapterId: id, transport: adapter?.transports[0] || 'USB', host: undefined, port: undefined, connectionHint: '' }); };
  const action = async (work: () => Promise<void>) => { setBusy(true); setError(''); setMessage(''); try { await work(); } catch (err) { setError(err instanceof Error ? err.message : 'İşlem tamamlanamadı.'); } finally { setBusy(false); } };
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    void action(async () => {
      const saved = await api.saveFiscalDevice(form, editing?.id); await load(); setForm({ ...empty }); setEditing(null); setReadiness(null);
      setMessage(saved.device.status === 'DISABLED' ? 'Devre dışı cihaz tanımı güncellendi. Bağlantı kurulmadı ve tahsilat yapılmadı.' : 'Cihaz tanımı taslak olarak kaydedildi. Bağlantı kurulmadı ve tahsilat yapılmadı.');
    });
  };
  const edit = (device: FiscalDeviceProfile) => {
    setEditing(device); setReadiness(null); setError(''); setMessage('');
    setForm({ name: device.name, adapterId: device.adapterId, model: device.model, serialNumber: device.serialNumber,
      branchLabel: device.branchLabel, workstationName: device.workstationName, transport: device.transport,
      connectionHint: device.connectionHint, host: device.host, port: device.port, expectedRevision: device.revision });
  };
  return <section className="fiscal-settings" aria-label="Yazar kasa ve POS cihaz bağlantıları">
    <header><h2>Yazar Kasa / POS Bağlantıları</h2><p>Müşterinin mağazasındaki cihazı firma, şube ve kasa bilgisayarıyla tanımlayın.</p></header>
    <div className="fiscal-notice" role="status"><strong>Kurulum hazırlığı — gerçek tahsilat kapalı.</strong> Marka kataloğu cihaz desteğinin tamamlandığı anlamına gelmez. Üretici bağlantısı ve cihaz üzerindeki testler tamamlanmadan ödeme gönderilmez.</div>
    {error && <p role="alert" className="fiscal-error">{error}</p>}
    {message && <p role="status">{message}</p>}
    {loading ? <p>Cihaz tanımları yükleniyor…</p> : <div className="fiscal-settings-grid">
      <form onSubmit={save} className="fiscal-card" aria-label="Cihaz tanımı">
        <h3>{editing ? 'Cihaz Tanımını Düzenle' : 'Yeni Cihaz Tanımı'}</h3>
        <fieldset disabled={busy}>
          <label>Bağlantı kütüphanesi<select required value={form.adapterId} onChange={e => changeAdapter(e.target.value)}>{adapters.map(a => <option key={a.id} value={a.id}>{a.name} — {a.stage === 'DOCUMENTATION_REVIEWED' ? 'Hazırlık' : 'Üretici bekleniyor'}</option>)}</select></label>
          {manifest?.referenceModels.length ? <small>Resmi dokümandaki referans modeller: {manifest.referenceModels.join(', ')}. BEY360 cihaz testi henüz yapılmadı.</small> : <small>Model ve bağlantı uygunluğu üreticiyle doğrulanacak.</small>}
          <label>Cihaz adı<input required maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Örn. Mağaza ön kasa" /></label>
          <label>Model<input required maxLength={60} value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} placeholder="Cihaz üzerindeki model" /></label>
          <label>Sicil / seri numarası<input required maxLength={60} value={form.serialNumber} onChange={e => setForm({ ...form, serialNumber: e.target.value })} /></label>
          <label>Şube / mağaza<input required maxLength={100} value={form.branchLabel} onChange={e => setForm({ ...form, branchLabel: e.target.value })} /></label>
          <label>Kasa bilgisayarı<input required maxLength={100} value={form.workstationName} onChange={e => setForm({ ...form, workstationName: e.target.value })} /></label>
          <label>Bağlantı yöntemi<select value={form.transport} onChange={e => setForm({ ...form, transport: e.target.value as DeviceTransport, host: undefined, port: undefined })}>{manifest?.transports.map(t => <option key={t} value={t}>{transportNames[t]}</option>)}</select></label>
          {form.transport === 'TCP_IP' ? <><label>Yerel cihaz IP adresi<input required placeholder="192.168.1.50" value={form.host || ''} onChange={e => setForm({ ...form, host: e.target.value })} /></label><label>Cihaz portu<input required type="number" min={1} max={65535} value={form.port ?? ''} onChange={e => setForm({ ...form, port: e.target.value ? Number(e.target.value) : undefined })} /></label></> : null}
          <label>Bağlantı notu<input maxLength={64} placeholder="Örn. USB kasa bağlantısı; parola yazmayın" value={form.connectionHint} onChange={e => setForm({ ...form, connectionHint: e.target.value })} /></label>
          <div className="fiscal-actions"><button type="submit" className="btn btn-primary">{busy ? 'Kaydediliyor…' : 'Cihaz Tanımını Kaydet'}</button>{editing && <button type="button" className="btn btn-secondary" onClick={() => { setEditing(null); setForm({ ...empty }); }}>Vazgeç</button>}</div>
        </fieldset>
      </form>
      <div className="fiscal-device-list">
        <div className="fiscal-actions"><h3>Firma Cihazları ({devices.length})</h3><button className="btn btn-secondary" disabled={busy} onClick={() => action(load)}>Listeyi Yenile</button></div>
        {!devices.length && <div className="fiscal-card">Henüz cihaz tanımı yok. Soldaki formdan mevcut mağaza cihazını ekleyebilirsiniz.</div>}
        {devices.map(device => <article className="fiscal-card" key={device.id} aria-label={device.name}>
          <h3>{device.name}</h3><p>{adapters.find(a => a.id === device.adapterId)?.name} · {device.model}</p>
          <p>{device.branchLabel} · {device.workstationName} · {transportNames[device.transport]}</p>
          <p>Sicil / seri: {device.serialNumber}</p><strong>{device.status === 'DISABLED' ? 'Devre dışı' : 'Taslak — cihaz bağlantısı doğrulanmadı'}</strong>
          <div className="fiscal-actions"><button className="btn btn-secondary" disabled={busy} onClick={() => edit(device)}>Düzenle</button><button className="btn btn-secondary" disabled={busy} onClick={() => action(async () => { setReadiness((await api.inspectFiscalDevice(device.id)).readiness); })}>Kurulum Durumu</button><button className="btn btn-secondary" disabled={busy || device.status === 'DISABLED'} onClick={() => action(async () => { await api.disableFiscalDevice(device.id, device.revision); await load(); setReadiness(null); if (editing?.id === device.id) { setEditing(null); setForm({ ...empty }); } setMessage('Cihaz tanımı devre dışı bırakıldı.'); })}>Devre Dışı Bırak</button></div>
        </article>)}
        {readiness && <section className="fiscal-card" aria-label="Cihaz kurulum durumu"><h3>Kurulum Durumu</h3><p>{readiness.message}</p><ul>{readiness.checks.map(c => <li key={c.label}>{c.label}: {({ SAVED: 'Tanımlandı', DISABLED: 'Devre dışı', PENDING: 'Bekleniyor', UNVERIFIED: 'Doğrulanmadı' } as Record<string, string>)[c.state] || c.state}</li>)}</ul><button className="btn btn-primary" disabled>Cihazdan Tahsilat — Hazır Değil</button></section>}
        <div className="fiscal-card"><h3>Müşteri Kurulum Adımları</h3><ol><li>Cihazın modelini, üretici lisansını ve bağlantı seçeneğini doğrulayın.</li><li>Kablolu cihaz için mağaza bilgisayarında üreticinin sürücüsü ve BEY360 bağlantı bileşeni gerekecek.</li><li>Şube, kasa ve cihaz eşleşmesini doğrulayın.</li><li>Üretici testi tamamlandıktan sonra gerçek tahsilat ayrıca açılacak.</li></ol><p>Henüz indirilebilir mağaza kurulum programı yoktur. Bu ekran tanım ve hazırlık içindir. Kart numarası, PIN veya CVV girilmez.</p></div>
      </div>
    </div>}
  </section>;
}
