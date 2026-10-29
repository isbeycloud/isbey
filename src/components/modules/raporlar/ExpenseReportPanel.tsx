import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, Printer, RefreshCw } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { api } from '../../../services/api';
import type { ExpenseReportFilters, ExpenseReportPaymentMethod, ExpenseReportRow, ExpenseReportsResponse } from '../../../types/expenseReports';
import './ExpenseReportPanel.css';

const tabs = [['TRANSACTIONS', 'İşlem Dökümü'], ['CATEGORIES', 'Masraf Kalemleri'], ['CENTERS', 'Maliyet Merkezleri']] as const;
type Tab = typeof tabs[number][0];
type Draft = Omit<ExpenseReportFilters, 'paymentMethod'> & { paymentMethod: ExpenseReportPaymentMethod | '' };
type Cell = string | number;
type Column = { title: string; numeric?: 'money' | 'count' };
type ReportTable = { columns: Column[]; rows: Cell[][] };
const paymentLabels: Record<ExpenseReportPaymentMethod, string> = { CASH: 'Nakit', BANK: 'Banka', OTHER: 'Diğer' };
const dateLabel = (date: string) => date ? date.split('-').reverse().join('.') : 'Belirtilmemiş';
const money = (value: number, currency: string) => `${value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency === 'TRY' ? 'TL' : currency}`;
function today() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-');
}
function defaultDraft(): Draft {
  const endDate = today();return { startDate: endDate.slice(0, 7) + '-01', endDate, currency: 'TRY', categoryId: '', costCenterId: '', paymentMethod: '', account: '', search: '' };
}
function toQuery(draft: Draft): ExpenseReportFilters {
  return { startDate: draft.startDate, endDate: draft.endDate, currency: draft.currency,
    ...(draft.categoryId ? { categoryId: draft.categoryId } : {}), ...(draft.costCenterId ? { costCenterId: draft.costCenterId } : {}),
    ...(draft.paymentMethod ? { paymentMethod: draft.paymentMethod } : {}), ...(draft.account ? { account: draft.account } : {}), ...(draft.search?.trim() ? { search: draft.search.trim() } : {}),
  };
}
function safeCsv(value: Cell): string {
  let text = String(value);
  if (typeof value === 'string' && (/^\s*[=+@-]/u.test(text) || /^[\t\r]/.test(text))) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
const moneyColumn = (title: string): Column => ({ title, numeric: 'money' });
const countColumn: Column = { title: 'Gider sayısı', numeric: 'count' };
function groupsTable(data: ExpenseReportsResponse, tab: Exclude<Tab, 'TRANSACTIONS'>): ReportTable {
  return { columns: [{ title: tab === 'CATEGORIES' ? 'Masraf kalemi' : 'Maliyet merkezi' }, countColumn, moneyColumn('KDV hariç'), moneyColumn('KDV'), moneyColumn('KDV dahil')],
    rows: (tab === 'CATEGORIES' ? data.byCategory : data.byCostCenter).map(group => [group.name, group.count, group.netAmount, group.vatAmount, group.grossAmount]),
  };
}
function transactionExport(data: ExpenseReportsResponse): ReportTable {
  return { columns: [{ title: 'Tarih' }, { title: 'Gider fişi' }, { title: 'Açıklama' }, { title: 'Masraf kalemi' }, { title: 'Maliyet merkezi' }, { title: 'Ödeme yöntemi' }, { title: 'Kasa / banka hesabı' }, moneyColumn('KDV hariç'), moneyColumn('KDV'), moneyColumn('KDV dahil'), { title: 'Fiş / belge no' }, { title: 'Tedarikçi' }, { title: 'Notlar' }],
    rows: data.rows.map(row => [dateLabel(row.date), row.documentNo, row.title, row.categoryName, row.costCenterName || 'Atanmamış', paymentLabels[row.paymentMethod], row.accountName || 'Belirtilmemiş', row.netAmount, row.vatAmount, row.grossAmount, row.receiptNo, row.supplierTitle, row.notes]),
  };
}

export const ExpenseReportPanel: React.FC = () => {
  const { activeTenantId } = useApp();return <ExpenseReportContent key={activeTenantId} />;
};
function ExpenseReportContent() {
  const { refreshKey, openPrintModal } = useApp();
  const [draft, setDraft] = useState(defaultDraft);
  const [query, setQuery] = useState<ExpenseReportFilters>(() => toQuery(defaultDraft()));
  const [data, setData] = useState<ExpenseReportsResponse | null>(null);
  const [options, setOptions] = useState<ExpenseReportsResponse['options']>({ currencies: ['TRY'], categories: [], costCenters: [], accounts: [], paymentMethods: ['CASH', 'BANK', 'OTHER'] });
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [validation, setValidation] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('TRANSACTIONS');
  const [expanded, setExpanded] = useState<string | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    const n = ++generation.current;let cancelled = false;setLoading(true);setData(null);setError('');setExpanded(null);
    api.getExpenseTransactionReport(query).then(result => {
      if (cancelled || generation.current !== n) return;
      if (!result.success) throw Error('Gider raporu alınamadı.');
      setData(result);setOptions({ ...result.options, currencies: [...new Set([result.filters.currency, ...result.options.currencies])] });
    }).catch(failure => { if (!cancelled && generation.current === n) { setData(null);setError(failure instanceof Error ? failure.message : 'Gider raporu alınamadı.'); } })
      .finally(() => { if (!cancelled && generation.current === n) setLoading(false); });
    return () => { cancelled = true;generation.current++; };
  }, [query, refreshKey]);
  const applyDraft = (next: Draft) => {
    if (!next.startDate || !next.endDate || next.startDate > next.endDate) { setValidation('Başlangıç ve bitiş tarihlerini kontrol edin.');return; }
    setValidation('');setQuery(toQuery(next));
  };
  const preset = (type: 'MONTH' | '90D' | 'YEAR') => {
    const endDate = today();let startDate = endDate.slice(0, 7) + '-01';
    if (type === 'YEAR') startDate = endDate.slice(0, 4) + '-01-01';
    if (type === '90D') { const date = new Date(endDate + 'T12:00:00Z');date.setUTCDate(date.getUTCDate() - 89);startDate = date.toISOString().slice(0, 10); }
    const next = { ...draft, startDate, endDate };setDraft(next);applyDraft(next);
  };
  const draftQuery = toQuery(draft);
  const dirty = data && (['startDate', 'endDate', 'currency', 'categoryId', 'costCenterId', 'paymentMethod', 'account', 'search'] as const).some(key => (draftQuery[key] || '') !== (data.filters[key] || ''));
  const currency = data?.filters.currency || query.currency;
  const period = data ? `${dateLabel(data.filters.startDate)} – ${dateLabel(data.filters.endDate)}` : '';
  const tabLabel = tabs.find(([id]) => id === activeTab)![1];
  const reportTable = data ? activeTab === 'TRANSACTIONS' ? transactionExport(data) : groupsTable(data, activeTab) : null;
  const metadata: Cell[][] = data ? [
    ['Rapor', tabLabel], ['Dönem', period], ['Para birimi', currency],
    ['Masraf kalemi', data.filters.categoryId ? data.options.categories.find(item => item.id === data.filters.categoryId)?.name || 'Seçili masraf kalemi' : 'Tümü'],
    ['Maliyet merkezi', data.filters.costCenterId ? data.options.costCenters.find(item => item.id === data.filters.costCenterId)?.name || 'Seçili maliyet merkezi' : 'Tümü'],
    ['Ödeme yöntemi', data.filters.paymentMethod ? paymentLabels[data.filters.paymentMethod] : 'Tümü'],
    ['Kasa / banka hesabı', data.filters.account ? data.options.accounts.find(item => item.value === data.filters.account)?.label || 'Seçili hesap' : 'Tümü'],
    ['Arama', data.filters.search || 'Yok'], ['Filtrelenmiş gider sayısı', data.summary.count], ['Hesaba alınmayan kayıt', data.excludedCount],
    ['Kontrol notları', data.warnings.map(warning => `${warning.message} (${warning.count})`).join(' · ') || 'Yok'],
    ['Rapor alındı', new Date(data.snapshotAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) + ' İstanbul'],
  ] : [];
  const cellText = (value: Cell, column: Column) => typeof value === 'number' ? column.numeric === 'money' ? money(value, currency) : value.toLocaleString('tr-TR') : value;
  const exportCsv = () => {
    if (!data || !reportTable?.rows.length) return;
    const content = [...metadata, [], reportTable.columns.map(column => column.title), ...reportTable.rows];
    const blob = new Blob(['\ufeff' + content.map(row => row.map(safeCsv).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');link.href = url;link.download = `gider-${activeTab.toLowerCase()}-${currency}-${data.filters.endDate}.csv`;link.click();window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const print = () => {
    if (!data || !reportTable?.rows.length) return;
    const scope = metadata.map(row => `${row[0]}: ${row[1]}`).join(' · ');
    const printRows = activeTab === 'TRANSACTIONS' ? data.rows.map(row => ({
      'Rapor kapsamı': scope, 'Gider': `${dateLabel(row.date)} · ${row.documentNo} · ${row.title}`, 'Kalem / merkez': `${row.categoryName} · ${row.costCenterName || 'Atanmamış'}`, 'Ödeme / hesap': `${paymentLabels[row.paymentMethod]} · ${row.accountName || 'Belirtilmemiş'}`,
      'KDV hariç': money(row.netAmount, currency), 'KDV': money(row.vatAmount, currency), 'KDV dahil': money(row.grossAmount, currency),
      'Belge / tedarikçi / not': [row.receiptNo, row.supplierTitle, row.notes].filter(Boolean).join(' · ') || 'Belirtilmemiş',
    })) : reportTable.rows.map(row => Object.fromEntries([['Rapor kapsamı', scope], ...reportTable.columns.map((column, i) => [column.title, cellText(row[i], column)])]));
    openPrintModal('REPORT', `Gider ${tabLabel} · ${currency}`, { rows: printRows });
  };
  const shownAccounts = options.accounts.filter(item => !draft.paymentMethod || item.kind === draft.paymentMethod);
  const selectedCategoryMissing = !!draft.categoryId && !options.categories.some(item => item.id === draft.categoryId);
  const selectedCenterMissing = !!draft.costCenterId && !options.costCenters.some(item => item.id === draft.costCenterId);
  const selectedAccountMissing = !!draft.account && !shownAccounts.some(item => item.value === draft.account);
  const transactionColumns: Column[] = [{ title: 'Tarih / fiş' }, { title: 'Gider açıklaması' }, { title: 'Masraf kalemi / merkez' }, { title: 'Ödeme / hesap' }, moneyColumn('KDV hariç'), moneyColumn('KDV'), moneyColumn('KDV dahil'), { title: 'İşlem' }];
  const detail = (row: ExpenseReportRow) => <div role="region" aria-label={`Gider ayrıntısı ${row.documentNo}`} className="expense-report-detail"><h3>{row.documentNo} · Gider ayrıntısı</h3><dl>
    <div><dt>Fiş / belge no</dt><dd>{row.receiptNo || 'Belirtilmemiş'}</dd></div><div><dt>Tedarikçi</dt><dd>{row.supplierTitle || 'Belirtilmemiş'}</dd></div><div><dt>KDV oranı</dt><dd>{row.vatRate === null ? 'Belirtilmemiş' : `%${row.vatRate.toLocaleString('tr-TR')}`}</dd></div><div><dt>Para birimi</dt><dd>{row.currency}</dd></div><div className="expense-report-notes"><dt>Notlar</dt><dd>{row.notes || 'Not girilmemiş'}</dd></div>
  </dl></div>;
  return <section className="expense-report-panel" role="region" aria-label="Gider işlem dökümü">
    <header className="expense-report-heading"><div><span>MASRAF YÖNETİMİ</span><h2>Gider İşlem Dökümü</h2><p>Gider kayıtlarını, masraf kalemlerini ve maliyet merkezlerini birlikte inceleyin.</p></div><div className="expense-report-actions"><button className="btn btn-secondary" onClick={exportCsv} disabled={loading || !data || !reportTable?.rows.length}><Download size={16} /> CSV İndir</button><button className="btn btn-secondary" onClick={print} disabled={loading || !data || !reportTable?.rows.length}><Printer size={16} /> Yazdır</button></div></header>
    <form className="expense-report-filters" onSubmit={event => { event.preventDefault();applyDraft(draft); }}>
      <div className="expense-report-main-filters"><label>Başlangıç tarihi<input type="date" required min="1900-01-01" max="2199-12-31" value={draft.startDate} onChange={event => setDraft({ ...draft, startDate: event.target.value })} /></label><label>Bitiş tarihi<input type="date" required min="1900-01-01" max="2199-12-31" value={draft.endDate} onChange={event => setDraft({ ...draft, endDate: event.target.value })} /></label><label>Para birimi<select aria-label="Para birimi" value={draft.currency} onChange={event => setDraft({ ...draft, currency: event.target.value, categoryId: '', costCenterId: '', account: '' })}>{options.currencies.map(option => <option key={option} value={option}>{option === 'TRY' ? 'TRY · Türk lirası' : option}</option>)}</select></label><label className="expense-report-search">Gider ara<input type="search" maxLength={200} placeholder="Açıklama, belge veya tedarikçi" value={draft.search || ''} onChange={event => setDraft({ ...draft, search: event.target.value })} /></label><button type="submit" className="btn btn-primary" disabled={loading}><RefreshCw size={16} /> Raporu Getir</button></div>
      <details className="expense-report-advanced"><summary>Diğer filtreler <small>Masraf kalemi, maliyet merkezi ve ödeme hesabı</small></summary><div>
        <label>Masraf kalemi<select aria-label="Masraf kalemi" value={draft.categoryId || ''} onChange={event => setDraft({ ...draft, categoryId: event.target.value })}><option value="">Tüm kalemler</option>{selectedCategoryMissing && <option value={draft.categoryId}>Seçili kalem (bu dönemde kayıt yok)</option>}{options.categories.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
        <label>Maliyet merkezi<select aria-label="Maliyet merkezi" value={draft.costCenterId || ''} onChange={event => setDraft({ ...draft, costCenterId: event.target.value })}><option value="">Tüm merkezler</option>{selectedCenterMissing && <option value={draft.costCenterId}>Seçili merkez (bu dönemde kayıt yok)</option>}{options.costCenters.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
        <label>Ödeme yöntemi<select aria-label="Ödeme yöntemi" value={draft.paymentMethod} onChange={event => { const method = event.target.value as Draft['paymentMethod'];setDraft({ ...draft, paymentMethod: method, account: '' }); }}><option value="">Tüm yöntemler</option>{(['CASH', 'BANK', 'OTHER'] as const).map(method => <option key={method} value={method}>{paymentLabels[method]}</option>)}</select></label>
        <label>Kasa / banka hesabı<select aria-label="Kasa / banka hesabı" value={draft.account || ''} onChange={event => setDraft({ ...draft, account: event.target.value })} disabled={draft.paymentMethod === 'OTHER'}><option value="">Tüm hesaplar</option>{selectedAccountMissing && <option value={draft.account}>Seçili hesap (bu dönemde kayıt yok)</option>}{shownAccounts.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      </div></details>
      <div className="expense-report-presets" aria-label="Gider raporu dönemleri"><button type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={() => preset('MONTH')}>Bu ay</button><button type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={() => preset('90D')}>Son 90 gün</button><button type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={() => preset('YEAR')}>Bu yıl</button><button type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={() => { const next = defaultDraft();setDraft(next);applyDraft(next); }}>Filtreleri Temizle</button></div>
    </form>
    {validation && <p role="alert" className="expense-report-error">{validation}</p>}
    {dirty && <p className="expense-report-note">Filtreler değişti. Yeni sonuçlar için Raporu Getir düğmesine basın. Gösterilen tutarlar aşağıdaki rapor kapsamına aittir.</p>}
    <div className="expense-report-tabs" role="tablist" aria-label="Gider raporu türleri">{tabs.map(([id, label], index) => <button key={id} id={`expense-report-tab-${id}`} role="tab" aria-selected={activeTab === id} aria-controls="expense-report-content" tabIndex={activeTab === id ? 0 : -1} onClick={() => setActiveTab(id)} onKeyDown={event => {
      let next = index;if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;else if (event.key === 'Home') next = 0;else if (event.key === 'End') next = tabs.length - 1;else return;
      event.preventDefault();setActiveTab(tabs[next][0]);document.getElementById(`expense-report-tab-${tabs[next][0]}`)?.focus();
    }}>{label}</button>)}</div>
    {loading ? <p role="status" className="expense-report-empty">Gider raporu hazırlanıyor…</p> : error ? <div role="alert" className="expense-report-error">{error} <button className="btn btn-secondary" onClick={() => setQuery({ ...query })}>Tekrar Dene</button></div> : data && <div id="expense-report-content" role="tabpanel" aria-labelledby={`expense-report-tab-${activeTab}`}>
      <p className="expense-report-scope"><strong>{period} · {currency}</strong><span>Yalnız seçili filtrelere uyan giderler · {new Date(data.snapshotAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })} İstanbul</span></p>
      <div className="expense-report-totals"><div><span>Gider sayısı</span><strong data-testid="expense-report-count">{data.summary.count.toLocaleString('tr-TR')}</strong><small>Filtrelenmiş kayıt</small></div><div><span>KDV hariç</span><strong>{money(data.summary.netAmount, currency)}</strong><small>Net gider</small></div><div><span>KDV</span><strong>{money(data.summary.vatAmount, currency)}</strong><small>Kayıtlı vergi</small></div><div><span>KDV dahil</span><strong data-testid="expense-report-gross">{money(data.summary.grossAmount, currency)}</strong><small>Toplam gider</small></div></div>
      {data.warnings.length > 0 && <details className="expense-report-warnings"><summary>{data.warnings.length} kontrol notu</summary><ul>{data.warnings.map((warning, i) => <li key={`${warning.code}-${i}`}>{warning.message}{warning.count > 0 ? ` (${warning.count} kayıt)` : ''}</li>)}</ul></details>}
      {data.excludedCount > 0 && <p className="expense-report-note">{data.excludedCount} kayıt doğrulanamadığı için rapora alınmadı. Gösterilen toplamlar yalnız geçerli, filtrelenmiş kayıtlardır.</p>}
      <p className="expense-report-note">Her satır bir gider kaydını gösterir. Masraf kalemleri ve maliyet merkezleri bu kayıtların özetidir; ayrı ürün veya fatura satırları değildir. KDV hariç ve KDV dahil tutarlar ayrı gösterilir.</p>
      <p className="expense-report-filter-caption">{metadata.slice(3, 8).map(item => `${item[0]}: ${item[1]}`).join(' · ')}</p>
      {activeTab === 'TRANSACTIONS' ? data.rows.length ? <div className="expense-report-table-wrap"><table><thead><tr>{transactionColumns.map(column => <th key={column.title} scope="col">{column.title}{column.numeric === 'money' && <small>{currency}</small>}</th>)}</tr></thead><tbody>{data.rows.map(row => <React.Fragment key={row.id}><tr>
        <td>{dateLabel(row.date)}<small>{row.documentNo}</small></td><td><strong>{row.title}</strong></td><td>{row.categoryName}<small>{row.costCenterName || 'Maliyet merkezi atanmamış'}</small></td><td>{paymentLabels[row.paymentMethod]}<small>{row.accountName || 'Hesap belirtilmemiş'}</small></td><td className="expense-report-number">{money(row.netAmount, currency)}</td><td className="expense-report-number">{money(row.vatAmount, currency)}</td><td className="expense-report-number">{money(row.grossAmount, currency)}</td><td><button className="btn btn-secondary btn-sm" aria-expanded={expanded === row.id} aria-controls={`expense-detail-${row.id}`} aria-label={`Ayrıntılar: ${row.documentNo}`} onClick={() => setExpanded(expanded === row.id ? null : row.id)}><ChevronDown size={14} /> {expanded === row.id ? 'Kapat' : 'Ayrıntılar'}</button></td>
      </tr>{expanded === row.id && <tr className="expense-report-detail-row"><td colSpan={transactionColumns.length} id={`expense-detail-${row.id}`}>{detail(row)}</td></tr>}</React.Fragment>)}</tbody></table></div> : <p className="expense-report-empty">Bu filtrelere uyan gider kaydı yok. Tarih, para birimi veya diğer filtreleri kontrol edin.</p> : reportTable && reportTable.rows.length ? <div className="expense-report-table-wrap"><table><thead><tr>{reportTable.columns.map(column => <th key={column.title} scope="col">{column.title}{column.numeric === 'money' && <small>{currency}</small>}</th>)}</tr></thead><tbody>{reportTable.rows.map((row, i) => <tr key={i}>{row.map((value, cellIndex) => <td key={cellIndex} className={reportTable.columns[cellIndex].numeric ? 'expense-report-number' : undefined}>{cellText(value, reportTable.columns[cellIndex])}</td>)}</tr>)}</tbody></table></div> : <p className="expense-report-empty">Bu filtrelere uyan masraf özeti yok.</p>}
    </div>}
  </section>;
}
