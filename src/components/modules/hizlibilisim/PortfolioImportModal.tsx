import { useState, useEffect, useCallback } from 'react';
import { Modal } from '../../common/Modal';
import { api } from '../../../services/api';
import type { ExternalCustomer } from '../../../types';

type Preview = { taxId: string; success: boolean; durum: string; message: string; musteri?: ExternalCustomer; mevcutKayit?: boolean };

export function PortfolioImportModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [source, setSource] = useState<'dealer' | 'vkn'>('dealer');
  const [start, setStart] = useState(0);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [connect, setConnect] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [verify, setVerify] = useState(false);
  const [code, setCode] = useState('');
  const [input, setInput] = useState('');
  const [rows, setRows] = useState<Preview[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [outcomes, setOutcomes] = useState<string[]>([]);
  const loadDealer = useCallback(async (offset = 0, query = '') => {
    setBusy(true); setError('');
    try {
      const r = await api.getHizliDealerPortfolio(offset, query); setStart(offset); setTotal(r.filtered); setConnect(false);
      setRows(r.customers.map(c => ({ taxId: c.taxNumber, success: true, durum: 'BULUNDU', message: c.existing ? 'Portföyünüzde kayıtlı.' : `${c.city} · ${c.dealerName}`, musteri: { companyName: c.companyName } as ExternalCustomer, mevcutKayit: c.existing })));
    } catch (e) { setError((e as Error).message); setConnect(true); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void loadDealer(); }, [loadDealer]);
  return <Modal isOpen onClose={() => { if (!busy) onClose(); }} title="Hızlı Bilişim portföyünden müşteri seç" size="large">
    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
      <button className="btn btn-secondary" disabled={busy} onClick={() => { setSource('dealer'); setSelected([]); setRows([]); void loadDealer(); }}>Bayi portföyü</button>
      <button className="btn btn-secondary" disabled={busy} onClick={() => { setSource('vkn'); setRows([]); setSelected([]); setError(''); }}>VKN listesiyle sorgula</button>
    </div>
    {source === 'dealer' ? <>
      <p>Bayi hesabınızın müşteri listesini çekin ve İŞBEY’e aktarılacak müşterileri seçin. Listeyi görmek üyelik oluşturmaz.</p>
      <button className="btn btn-secondary" disabled={busy} onClick={() => setConnect(true)}>Bayi portalına bağlan</button>
      {connect && <form onSubmit={async e => {
        e.preventDefault(); setBusy(true); setError('');
        try {
          const r = verify ? await api.verifyHizliPortal(code) : await api.connectHizliPortal(username, password);
          setPassword(''); setCode(''); setVerify(r.verificationRequired);
          if (!r.verificationRequired) { setConnect(false); await loadDealer(0, search); }
        } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
      }} style={{ display: 'grid', gap: 8, padding: 16 }}>
        {verify ? <label>Doğrulama kodu<input className="form-input" value={code} required autoComplete="one-time-code" onChange={e => setCode(e.target.value)} /></label> : <>
          <label>Bayi kullanıcı adı<input className="form-input" value={username} required autoComplete="off" onChange={e => setUsername(e.target.value)} /></label>
          <label>Bayi şifresi<input type="password" className="form-input" value={password} required autoComplete="off" onChange={e => setPassword(e.target.value)} /></label>
        </>}
        {verify && <p>Hızlı Bilişim’in gönderdiği en son doğrulama kodunu girin.</p>}
        <button className="btn btn-primary" disabled={busy}>{verify ? 'Kodu doğrula' : 'Bağlan'}</button>
        {verify && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setVerify(false)}>Girişi yeniden başlat</button>}
        <small>Sunucu yeniden başlarsa tekrar bağlanmanız gerekir. Şifre ve doğrulama kodu kalıcı olarak kaydedilmez.</small>
      </form>}
      <label>Firma adı<input className="form-input" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <button className="btn btn-primary" disabled={busy} onClick={() => { setSelected([]); void loadDealer(0, search); }}>Bayi portföyünü çek</button>
      <p>{total} müşteri · Sayfa {Math.floor(start / 50) + 1}</p>
      <button className="btn btn-secondary" disabled={busy || start === 0} onClick={() => void loadDealer(start - 50, search)}>Önceki sayfa</button>
      <button className="btn btn-secondary" disabled={busy || start + 50 >= total} onClick={() => void loadDealer(start + 50, search)}>Sonraki sayfa</button>
    </> : <label>VKN/TCKN listesi (en fazla 50)
      <textarea className="form-input" rows={5} value={input} disabled={busy} onChange={e => { setInput(e.target.value); setRows([]); setSelected([]); setOutcomes([]); }} placeholder="Her satıra bir numara yazın; virgül de kullanabilirsiniz." />
    </label>}
    {error && <p role="alert">{error}</p>}
    {source === 'vkn' && <button className="btn btn-primary" disabled={busy || !input.trim()} onClick={async () => {
      setBusy(true); setError(''); setRows([]); setSelected([]); setOutcomes([]);
      try { const r = await api.previewHizliPortfolio(input.trim().split(/[\s,;]+/)); setRows(r.results); }
      catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }}>{busy ? 'İşlem sürüyor…' : 'Hızlı Bilişim’den sorgula'}</button>}
    {!!rows.length && <table className="data-table"><thead><tr><th>Seç</th><th>VKN/TCKN</th><th>Firma</th><th>Sonuç</th></tr></thead><tbody>
      {rows.map(r => <tr key={r.taxId}><td><input type="checkbox" aria-label={`${r.taxId} müşterisini seç`} disabled={busy || !r.success || r.mevcutKayit || (selected.length >= 25 && !selected.includes(r.taxId))} checked={selected.includes(r.taxId)} onChange={e => setSelected(ids => e.target.checked ? [...ids, r.taxId] : ids.filter(id => id !== r.taxId))} /></td><td>{r.taxId}</td><td>{r.musteri?.companyName || '—'}</td><td>{r.message}</td></tr>)}
    </tbody></table>}
    {!!rows.length && <button className="btn btn-primary" disabled={busy || !selected.length} onClick={async () => {
      setBusy(true); setError(''); const messages: string[] = []; const added: string[] = [];
      if (source === 'dealer') {
        try { const r = await api.importHizliDealerCustomers(selected); for (const row of r.results) { messages.push(`${row.taxId}: ${row.message}`); if (row.success) added.push(row.taxId); } }
        catch (e) { setError((e as Error).message); }
      } else {
        for (const taxId of selected) {
          try { const r = await api.ekleHizliMukellef(taxId); messages.push(`${taxId}: ${r.message}`); if (r.success) added.push(taxId); }
          catch (e) { messages.push(`${taxId}: ${(e as Error).message}`); }
        }
      }
      setRows(prev => prev.map(r => added.includes(r.taxId) ? { ...r, mevcutKayit: true, message: 'Portföyünüzde kayıtlı.' } : r));
      setSelected(prev => prev.filter(id => !added.includes(id))); setOutcomes(messages); setBusy(false); onSuccess();
    }}>Seçilenleri portföye ekle ({selected.length})</button>}
    {!!outcomes.length && <div role="status"><ul>{outcomes.map(m => <li key={m}>{m}</li>)}</ul><p>Üyelik için listeden müşterilerinizi seçip “İŞBEY’e Aktar” düğmesini kullanın. Paket ve yetkili bilgileri her müşteri için seçilir.</p></div>}
  </Modal>;
}
