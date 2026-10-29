import React, { useEffect, useRef, useState } from 'react';
import { CreditCard, Plus, RefreshCw, X } from 'lucide-react';
import { api } from '../../../services/api';
import { useApp } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import type { CompanyCard, CompanyCardEntry, CompanyCardInput, CompanyCardEntryInput } from '../../../types/companyCards';
import './CompanyCardsView.css';

const money = (value: number) => value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
const labels = { SPEND: 'Harcama', REFUND: 'İade', REPAYMENT: 'Kart Borcu Ödemesi' };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const emptyCard: CompanyCardInput = { name: '', bankName: '', last4: '', creditLimit: 0, openingBalance: 0, statementDay: 1, dueDay: 10, currency: 'TRY', status: 'ACTIVE' };
const newEntry = (): CompanyCardEntryInput => ({ requestId: crypto.randomUUID(), type: 'SPEND', date: today(), amount: 0, merchant: '', category: '', description: '', receiptNo: '' });

function CardDialog({ title, busy, onClose, children }: { title: string; busy: boolean; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input,select,button')?.focus();
    return () => previous?.focus();
  }, []);
  return <div className="modal-overlay company-card-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div ref={ref} className="modal-dialog company-card-dialog" role="dialog" aria-modal="true" aria-label={title} onKeyDown={e => {
      if (e.key === 'Escape') { e.preventDefault(); if (!busy) onClose(); }
      if (e.key === 'Tab') { const controls = Array.from(ref.current?.querySelectorAll<HTMLElement>('input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled)') || []); const first = controls[0], last = controls.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }
    }}>
      <div className="modal-header"><h3>{title}</h3><button type="button" className="btn btn-secondary" aria-label="Pencereyi kapat" disabled={busy} onClick={onClose}><X size={18} /></button></div>
      {children}
    </div>
  </div>;
}

export const CompanyCardsView: React.FC = () => {
  const { activeTenant } = useApp();
  const { user } = useAuth();
  const codes = user?.permissionCodes || [];
  const writable = codes.includes('*') || codes.includes('bank.*') || codes.includes('bank.create') || user?.role === 'SUPER_ADMIN';
  const [data, setData] = useState<{ cards: CompanyCard[]; entries: CompanyCardEntry[] }>({ cards: [], entries: [] });
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [cardForm, setCardForm] = useState<CompanyCardInput | null>(null);
  const [editing, setEditing] = useState<CompanyCard | null>(null);
  const [entryForm, setEntryForm] = useState<CompanyCardEntryInput | null>(null);
  const [voiding, setVoiding] = useState<CompanyCardEntry | null>(null);
  const [reason, setReason] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [includeVoided, setIncludeVoided] = useState(false);
  const [notice, setNotice] = useState('');
  const generation = useRef(0);
  const mounted = useRef(true);
  const saving = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const load = async () => {
    const n = ++generation.current; setLoading(true); setError('');
    try { const result = await api.getCompanyCards(); if (n !== generation.current) return; if (!result.success) throw Error('Kart kayıtları alınamadı.'); setData(result); setSelected(old => result.cards.some(c => c.id === old) ? old : result.cards[0]?.id || ''); }
    catch (e) { if (n === generation.current) { setData({ cards: [], entries: [] }); setError(e instanceof Error ? e.message : 'Kart kayıtları alınamadı.'); } }
    finally { if (n === generation.current) setLoading(false); }
  };
  useEffect(() => { void load(); return () => { generation.current++; }; }, [activeTenant?.id]);
  const card = data.cards.find(c => c.id === selected);
  const hasEntries = data.entries.some(e => e.cardId === selected);
  const entries = data.entries.filter(e => e.cardId === selected && (filter === 'ALL' || e.type === filter) && (includeVoided || e.status !== 'VOID') && (!startDate || e.date >= startDate) && (!endDate || e.date <= endDate)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const close = () => { if (busy) return; setCardForm(null); setEntryForm(null); setVoiding(null); setFormError(''); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (saving.current) return; saving.current = true; setBusy(true); setFormError(''); setNotice('');
    try {
      if (cardForm) { const result = editing ? await api.updateCompanyCard(editing.id, { ...cardForm, expectedRevision: editing.revision }) : await api.createCompanyCard(cardForm); if (!result.success) throw Error('Kart kaydedilemedi.'); setSelected(result.card.id); }
      if (entryForm && card) { const result = await api.createCompanyCardEntry(card.id, entryForm); if (!result.success) throw Error('Hareket kaydedilemedi.'); }
      if (voiding && card) { const result = await api.voidCompanyCardEntry(card.id, voiding.id, voiding.revision, reason); if (!result.success) throw Error('İptal kaydedilemedi.'); }
      if (!mounted.current) return;
      setCardForm(null); setEntryForm(null); setVoiding(null); setNotice('Kayıt kaydedildi.'); await load();
    } catch (e) { if (mounted.current) setFormError(e instanceof Error ? e.message : 'Kayıt tamamlanamadı. Listeyi kontrol edip tekrar deneyin.'); }
    finally { saving.current = false; if (mounted.current) setBusy(false); }
  };
  const openCard = (value?: CompanyCard) => { setEditing(value || null); setCardForm(value ? { name: value.name, bankName: value.bankName, last4: value.last4, creditLimit: value.creditLimit, openingBalance: value.openingBalance, statementDay: value.statementDay, dueDay: value.dueDay, currency: 'TRY', status: value.status } : { ...emptyCard }); setFormError(''); };
  return <section className="company-cards" aria-label="Şirket kredi kartı takibi">
    <header className="company-cards-heading"><div><h2><CreditCard size={22} /> Şirket Kredi Kartları</h2><p>Kartlarınızı ve karttan yapılan harcamaları tek yerde takip edin.</p></div><div className="company-cards-actions"><button className="btn btn-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> Yenile</button>{writable && <button className="btn btn-primary" onClick={() => openCard()} disabled={loading || !!error}><Plus size={16} /> Kart Tanımla</button>}</div></header>
    <p className="company-cards-note">Manuel takip alanıdır. Muhasebe gideri veya banka hareketi oluşturmaz. Bankadan otomatik veri çekmez; kayıtlı borç banka ekstresiyle karşılaştırılmalıdır. Tam kart numarası ve güvenlik kodu girilmez.</p>
    {notice && <p role="status" className="company-cards-notice">{notice}</p>}
    {error ? <div role="alert" className="company-cards-error">{error} <button className="btn btn-secondary" onClick={() => void load()}>Tekrar Dene</button></div> : loading ? <p role="status">Kart kayıtları yükleniyor…</p> : <>
      {!data.cards.length ? <div className="company-cards-empty"><CreditCard size={32} /><h3>Henüz şirket kredi kartı tanımlanmadı</h3><p>İlk kartı tanımlayıp harcamaları, iadeleri ve borç ödemelerini kaydedin.</p></div> : <>
        <div className="company-cards-list">{data.cards.map(c => <button key={c.id} className={`company-card-tile ${c.id === selected ? 'selected' : ''}`} aria-pressed={c.id === selected} onClick={() => { setSelected(c.id); setFilter('ALL'); setStartDate(''); setEndDate(''); }}><strong>{c.name}</strong><span>{c.bankName} · •••• {c.last4}</span><span>{c.status === 'ARCHIVED' ? 'Arşivde' : 'Aktif'}</span><b>{money(c.balance)}</b><small>Kayıtlı borç</small></button>)}</div>
        {card && <>
          <div className="company-cards-heading"><div><h3>{card.name}</h3><p>Hesap kesim günü: {card.statementDay} · Son ödeme günü: {card.dueDay} <small>(Ayın günleri; ekstre hesaplanmaz.)</small></p></div><div className="company-cards-actions">{writable && <><button className="btn btn-secondary" onClick={() => openCard(card)}>Kartı Düzenle</button><button className="btn btn-primary" disabled={card.status !== 'ACTIVE'} onClick={() => { setEntryForm(newEntry()); setFormError(''); }}><Plus size={16} /> Hareket Ekle</button></>}</div></div>
          <div className="company-cards-summary"><div><span>Kayıtlı borç</span><strong data-testid="card-balance">{money(card.balance)}</strong></div><div><span>Kart limiti</span><strong>{money(card.creditLimit)}</strong></div><div><span>Kayıtlı kullanılabilir limit</span><strong>{money(card.availableLimit)}</strong></div><div><span>Toplam harcama / iade / ödeme</span><strong>{money(card.totalSpent)} / {money(card.totalRefunded)} / {money(card.totalRepaid)}</strong></div></div>
          {card.availableLimit < 0 && <p role="status" className="company-cards-error">Kayıtlı borç, tanımlı kart limitini aşıyor.</p>}
          {card.balance < 0 && <p className="company-cards-note">Kayıtlı kart bakiyesi alacak durumunda. Ekstrenizle kontrol edin.</p>}
          <div className="company-cards-filters"><label>İşlem filtresi<select value={filter} onChange={e => setFilter(e.target.value)}><option value="ALL">Tüm işlemler</option>{Object.entries(labels).map(([v, l]) => <option value={v} key={v}>{l}</option>)}</select></label><label>Başlangıç tarihi<input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></label><label>Bitiş tarihi<input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></label><label className="company-cards-check"><input type="checkbox" checked={includeVoided} onChange={e => setIncludeVoided(e.target.checked)} /> İptalleri göster</label><button className="btn btn-secondary" onClick={() => { setFilter('ALL'); setStartDate(''); setEndDate(''); setIncludeVoided(false); }}>Filtreleri Temizle</button></div>
          {startDate && endDate && startDate > endDate && <p role="alert">Başlangıç tarihi bitiş tarihinden sonra olamaz.</p>}
          <p className="company-cards-caption">{entries.length} hareket gösteriliyor. Yukarıdaki toplamlar kartın tüm geçerli kayıtlarını kapsar.</p>
          <div className="company-cards-table-wrap"><table className="company-cards-table"><thead><tr><th>Tarih</th><th>İşlem</th><th>İşyeri / açıklama</th><th>Kategori / belge</th><th>Tutar</th><th>Durum / işlem</th></tr></thead><tbody>{entries.map(entry => <tr key={entry.id} className={entry.status === 'VOID' ? 'voided' : ''}><td>{entry.date.split('-').reverse().join('.')}</td><td>{labels[entry.type]}</td><td>{entry.merchant || '—'}{entry.description && <small>{entry.description}</small>}</td><td>{entry.category || '—'}{entry.receiptNo && <small>{entry.receiptNo}</small>}</td><td className="amount">{entry.type === 'SPEND' ? '+' : '−'}{money(entry.amount)}</td><td>{entry.status === 'VOID' ? <span>İptal edildi<small>{entry.voidReason}</small></span> : writable ? <button className="btn btn-secondary btn-sm" onClick={() => { setVoiding(entry); setReason(''); setFormError(''); }}>İptal Et</button> : 'Geçerli'}</td></tr>)}</tbody></table></div>
          {!entries.length && <p className="company-cards-empty">Bu seçimde hareket yok. Filtreleri kontrol edebilir veya yeni hareket ekleyebilirsiniz.</p>}
        </>}
      </>}
    </>}
    {(cardForm || entryForm || voiding) && <CardDialog title={cardForm ? editing ? 'Kredi Kartını Düzenle' : 'Kredi Kartı Tanımla' : entryForm ? 'Kart Hareketi Ekle' : 'Kart Hareketini İptal Et'} busy={busy} onClose={close}>
      <form onSubmit={save}>
        <div className="modal-body company-card-form"><fieldset disabled={busy} className="company-card-fields">
          {formError && <div role="alert" className="company-cards-error">{formError} Değişiklikleriniz formda korunuyor. Bağlantı hatasında yeniden kaydetmeden önce listeyi kontrol edin.</div>}
          {cardForm && <><p>Yalnız son dört haneyi girin. Tam kart numarası, CVV veya şifre kaydedilmez.</p><div className="company-card-form-grid">
            <label>Kart adı<input required maxLength={80} value={cardForm.name} onChange={e => setCardForm({ ...cardForm, name: e.target.value })} /></label>
            <label>Banka<input required maxLength={80} value={cardForm.bankName} onChange={e => setCardForm({ ...cardForm, bankName: e.target.value })} /></label>
            <label>Son 4 hane<input required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={cardForm.last4} onChange={e => setCardForm({ ...cardForm, last4: e.target.value })} autoComplete="off" /></label>
            <label>Kart limiti (TL)<input required type="number" min="0" max="1000000000" step="0.01" value={cardForm.creditLimit} onChange={e => setCardForm({ ...cardForm, creditLimit: Number(e.target.value) })} /></label>
            <label>Başlangıç borcu (TL)<input aria-label="Başlangıç borcu (TL)" aria-describedby="card-opening-help" required type="number" min="0" max="1000000000" step="0.01" disabled={!!editing && hasEntries} value={cardForm.openingBalance} onChange={e => setCardForm({ ...cardForm, openingBalance: Number(e.target.value) })} /><small id="card-opening-help">Takibe başladığınız günün borcu; tekrar harcama olarak girmeyin. Hareket eklendikten sonra değişmez.</small></label>
            <label>Hesap kesim günü<input required type="number" min="1" max="31" value={cardForm.statementDay} onChange={e => setCardForm({ ...cardForm, statementDay: Number(e.target.value) })} /></label>
            <label>Son ödeme günü<input required type="number" min="1" max="31" value={cardForm.dueDay} onChange={e => setCardForm({ ...cardForm, dueDay: Number(e.target.value) })} /></label>
            <label>Kart durumu<select value={cardForm.status} onChange={e => setCardForm({ ...cardForm, status: e.target.value as CompanyCard['status'] })}><option value="ACTIVE">Aktif</option><option value="ARCHIVED">Arşivde</option></select></label>
          </div></>}
          {entryForm && <><p>{card?.name} · •••• {card?.last4}. Tutar KDV dahil toplamdır; bu kayıt ayrıca muhasebe gideri oluşturmaz.</p><div className="company-card-form-grid">
            <label>İşlem türü<select value={entryForm.type} onChange={e => setEntryForm({ ...entryForm, type: e.target.value as CompanyCardEntry['type'] })}>{Object.entries(labels).map(([v, l]) => <option value={v} key={v}>{l}</option>)}</select></label>
            <label>Tarih<input required type="date" min="1900-01-01" max="2199-12-31" value={entryForm.date} onChange={e => setEntryForm({ ...entryForm, date: e.target.value })} /></label>
            <label>Tutar (TL)<input required type="number" min="0.01" max="1000000000" step="0.01" value={entryForm.amount || ''} onChange={e => setEntryForm({ ...entryForm, amount: Number(e.target.value) })} /></label>
            <label>İşyeri / muhatap<input maxLength={120} value={entryForm.merchant} onChange={e => setEntryForm({ ...entryForm, merchant: e.target.value })} /></label>
            <label>Kategori<input maxLength={60} placeholder="Örn. akaryakıt, ofis, seyahat" value={entryForm.category} onChange={e => setEntryForm({ ...entryForm, category: e.target.value })} /></label>
            <label>Belge / fiş no<input maxLength={80} value={entryForm.receiptNo} onChange={e => setEntryForm({ ...entryForm, receiptNo: e.target.value })} /></label>
          </div><label>Açıklama<textarea maxLength={300} value={entryForm.description} onChange={e => setEntryForm({ ...entryForm, description: e.target.value })} /></label>{entryForm.type === 'REPAYMENT' && <p className="company-cards-note">Bu kayıt kartın takip borcunu azaltır; banka hesabından para göndermez. Banka ödemenizi ayrıca mevcut banka işleminizde izleyin.</p>}</>}
          {voiding && <><p>{labels[voiding.type]} · {money(voiding.amount)} · {voiding.date}. Hareket geçmişte kalır, kart toplamlarından çıkarılır.</p><label>İptal gerekçesi<textarea required maxLength={200} value={reason} onChange={e => setReason(e.target.value)} /></label></>}
        </fieldset></div>
        <div className="modal-footer"><button type="button" className="btn btn-secondary" disabled={busy} onClick={close}>Vazgeç</button><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Kaydediliyor…' : cardForm ? 'Kartı Kaydet' : entryForm ? 'Hareketi Kaydet' : 'İptali Kaydet'}</button></div>
      </form>
    </CardDialog>}
  </section>;
};
