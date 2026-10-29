import React, { useEffect, useRef, useState } from 'react';
import { Download, Printer, RefreshCw } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { api } from '../../../services/api';
import { formatUnitLabel, resolveHizliUnitCode } from '../../../utils/unitDisplay';
import { normalizeNavigationSearch } from '../../../data/navigationSearch';
import type { ManagementReportFilters, ManagementReportsResponse } from '../../../types/managementReports';
import './ManagementReportsPanel.css';

const tabs = [
  ['OVERVIEW', 'Özet'], ['BALANCES', 'Borç / Alacak'], ['PRODUCTS', 'Ürünler'],
  ['PROFIT', 'Tahmini Brüt Kâr'], ['MONTHLY', 'Aylık Seyir'], ['EXPENSES', 'Giderler'], ['STOCK', 'Stok Riskleri'],
] as const;
type Tab = typeof tabs[number][0];
type Cell = string | number | null;
type Column = { title: string; kind?: 'money' | 'number' };
type Table = { columns: Column[]; rows: Cell[][] };
const amount = (title: string): Column => ({ title, kind: 'money' });
const quantity = (title: string): Column => ({ title, kind: 'number' });
const number = (value: number) => value.toLocaleString('tr-TR', { maximumFractionDigits: 4 });
const money = (value: number | null, currency: string) => value === null ? 'Bilinmiyor' : `${value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency === 'TRY' ? 'TL' : currency}`;
const unitLabel = (value: string) => {
  const code = resolveHizliUnitCode(value);
  const label = formatUnitLabel(value, '—');
  return code && ['PA', 'PK', '26', 'TNE'].includes(code) ? `${label} (${code})` : label;
};
const dateLabel = (value: string | null) => value ? value.split('-').reverse().join('.') : 'Kayıt yok';
function istanbulToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-');
}
function initialFilters(): ManagementReportFilters {
  const endDate = istanbulToday();return { startDate: endDate.slice(0, 7) + '-01', endDate, currency: 'TRY' };
}
function cellLabel(value: Cell, column: Column, currency: string): string {
  if (value === null) return 'Bilinmiyor';
  if (typeof value === 'number') return column.kind === 'money' ? money(value, currency) : number(value);
  return value;
}
// User-controlled text must never become a spreadsheet formula, including after whitespace.
function csvCell(value: Cell): string {
  let text = value === null ? 'Bilinmiyor' : String(value);
  if (typeof value === 'string' && (/^\s*[=+@-]/u.test(text) || /^[\t\r]/.test(text))) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
function reportTables(data: ManagementReportsResponse): Record<Tab, Table> {
  return {
    OVERVIEW: { columns: [{ title: 'Gösterge' }, { title: 'Kapsam' }, amount('Tutar')], rows: [
      ['Net satış', 'Seçili dönem · KDV hariç', data.overview.netSales], ['Net alış', 'Seçili dönem · KDV hariç', data.overview.netPurchases],
      ['Gider', 'Seçili dönem · KDV hariç', data.overview.expenseNet], ['Alacağımız', 'Anlık bakiye', data.overview.receivable], ['Borcumuz', 'Anlık bakiye', data.overview.payable],
      ...data.cashBank.map(row => [row.name, `${row.kind === 'CASH' ? 'Kasa' : 'Banka'} · Anlık bakiye${row.needsReview ? ' · Kontrol gerekli' : ''}`, row.balance] as Cell[]),
    ] },
    BALANCES: { columns: [{ title: 'Cari kodu' }, { title: 'Cari' }, amount('Güncel alacak'), amount('Güncel borç'), amount('Dönem borç hareketi'), amount('Dönem alacak hareketi'), { title: 'Kontrol' }], rows: data.balances.rows.map(row => [row.code, row.name, row.receivable, row.payable, row.periodDebit, row.periodCredit, row.needsReview ? row.reviewReason || 'Kontrol gerekli' : 'Geçerli']) },
    PRODUCTS: { columns: [{ title: 'Ürün kodu' }, { title: 'Ürün' }, { title: 'Varyant' }, { title: 'Birim' }, quantity('Satılan miktar'), quantity('İade miktarı'), quantity('Net miktar'), amount('Net satış'), amount('Güncel birim maliyet'), amount('Tahmini maliyet')], rows: data.products.map(row => [row.code, row.name, row.variantName || '—', unitLabel(row.unit), row.salesQuantity, row.returnQuantity, row.netQuantity, row.netSales, row.currentUnitCost, row.estimatedCost]) },
    PROFIT: { columns: [{ title: 'Ürün kodu' }, { title: 'Ürün / varyant' }, { title: 'Birim' }, amount('Net satış'), amount('Tahmini maliyet'), amount('Tahmini brüt kâr'), quantity('Maliyetli satır'), quantity('Maliyeti bilinmeyen satır')], rows: data.products.map(row => [row.code, [row.name, row.variantName].filter(Boolean).join(' · '), unitLabel(row.unit), row.netSales, row.estimatedCost, row.estimatedGrossProfit, row.knownCostLines, row.unknownCostLines]) },
    MONTHLY: { columns: [{ title: 'Ay' }, amount('Satış'), amount('Satış iadesi'), amount('Net satış'), amount('Alış'), amount('Alış iadesi'), amount('Net alış'), quantity('Fatura sayısı')], rows: data.monthly.map(row => [row.month, row.salesNet, row.salesReturnsNet, row.netSales, row.purchaseNet, row.purchaseReturnsNet, row.netPurchases, row.invoiceCount]) },
    EXPENSES: { columns: [{ title: 'Gider kategorisi' }, amount('KDV hariç'), amount('KDV'), amount('KDV dahil'), quantity('Kayıt sayısı')], rows: data.expenses.rows.map(row => [row.categoryName, row.netAmount, row.vatAmount, row.grossAmount, row.count]) },
    STOCK: { columns: [{ title: 'Risk' }, { title: 'Ürün kodu' }, { title: 'Ürün / varyant' }, { title: 'Birim' }, quantity('Güncel stok'), quantity('Kritik eşik'), { title: 'Son hareket' }], rows: [
      ...data.stock.critical.map(row => ['Kritik stok', row.code, [row.name, row.variantName].filter(Boolean).join(' · '), unitLabel(row.unit), row.currentStock, row.criticalStock, dateLabel(row.lastMovementDate)] as Cell[]),
      ...data.stock.idle.map(row => [`${data.stock.idleDays} gün hareketsiz`, row.code, [row.name, row.variantName].filter(Boolean).join(' · '), unitLabel(row.unit), row.currentStock, row.criticalStock, dateLabel(row.lastMovementDate)] as Cell[]),
    ] },
  };
}

export const ManagementReportsPanel: React.FC = () => {
  const { activeTenantId } = useApp();
  return <ManagementReportsContent key={activeTenantId} />;
};
function ManagementReportsContent() {
  const { refreshKey, openPrintModal } = useApp();
  const [draft, setDraft] = useState(initialFilters);
  const [query, setQuery] = useState(initialFilters);
  const [data, setData] = useState<ManagementReportsResponse | null>(null);
  const [currencyOptions, setCurrencyOptions] = useState(['TRY']);
  const [activeTab, setActiveTab] = useState<Tab>('OVERVIEW');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [validation, setValidation] = useState('');
  const generation = useRef(0);
  useEffect(() => {
    const n = ++generation.current;let cancelled = false;
    setLoading(true);setData(null);setError('');
    api.getManagementReports(query).then(result => {
      if (cancelled || generation.current !== n) return;
      if (!result.success) throw Error('Yönetici raporu alınamadı.');
      setData(result);setCurrencyOptions([...new Set([result.filters.currency, ...result.currencyOptions])]);
    }).catch(failure => {
      if (!cancelled && generation.current === n) { setData(null);setError(failure instanceof Error ? failure.message : 'Yönetici raporu alınamadı.'); }
    }).finally(() => { if (!cancelled && generation.current === n) setLoading(false); });
    return () => { cancelled = true;generation.current++; };
  }, [query, refreshKey]);
  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.startDate || !draft.endDate || draft.startDate > draft.endDate) { setValidation('Başlangıç ve bitiş tarihlerini kontrol edin.');return; }
    setValidation('');setQuery({ ...draft });
  };
  const preset = (type: 'MONTH' | '90D' | 'YEAR') => {
    const endDate = istanbulToday();let startDate = endDate.slice(0, 7) + '-01';
    if (type === 'YEAR') startDate = endDate.slice(0, 4) + '-01-01';
    if (type === '90D') { const date = new Date(endDate + 'T12:00:00Z');date.setUTCDate(date.getUTCDate() - 89);startDate = date.toISOString().slice(0, 10); }
    const next = { startDate, endDate, currency: draft.currency };setDraft(next);setQuery(next);setValidation('');
  };
  const table = data ? reportTables(data)[activeTab] : null;
  const rows = table?.rows.filter(row => normalizeNavigationSearch(row.map(value => value ?? '').join(' ')).includes(normalizeNavigationSearch(search))) || [];
  const tabLabel = tabs.find(([id]) => id === activeTab)![1];
  const currency = data?.filters.currency || query.currency;
  const period = data ? `${dateLabel(data.filters.startDate)} – ${dateLabel(data.filters.endDate)}` : '';
  const snapshotScope = data ? `${period} · Anlık bakiyeler: ${dateLabel(data.snapshotDate)} · ${currency}` : '';
  const profitScope = data && activeTab === 'PROFIT' ? `Güncel alış maliyetiyle tahmin; net kâr değildir. Satır kapsamı: ${data.profitability.coveragePercent === null ? 'bilinmiyor' : `%${number(data.profitability.coveragePercent)}`}; maliyeti bilinmeyen ${number(data.profitability.unknownCostLines)} satır.` : '';
  const exportCsv = () => {
    if (!data || !table || !rows.length) return;
    const lines = [['Rapor', tabLabel], ['Dönem', period], ['Anlık bakiye tarihi', data.snapshotDate], ['Para birimi', currency], ...(profitScope ? [['Kâr tahmininin kapsamı', profitScope]] : []), ...data.warnings.map(warning => ['Veri uyarısı', warning.message, warning.count]), [], table.columns.map(column => column.title), ...rows];
    const blob = new Blob(['\ufeff' + lines.map(row => row.map(csvCell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');link.href = url;link.download = `yonetici-${activeTab.toLowerCase()}-${currency}-${data.filters.endDate}.csv`;link.click();window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const print = () => {
    if (!data || !table || !rows.length) return;
    const reportRows = rows.map(row => Object.fromEntries([['Rapor ve kapsam', `${tabLabel} · ${snapshotScope}${profitScope ? ` · ${profitScope}` : ''}`], ...table.columns.map((column, i) => [column.title, cellLabel(row[i], column, currency)])]));
    openPrintModal('REPORT', `${tabLabel} · ${currency}`, { rows: reportRows });
  };
  const dirty = data && (draft.currency !== data.filters.currency || draft.startDate !== data.filters.startDate || draft.endDate !== data.filters.endDate);
  const scopeNote = activeTab === 'BALANCES' ? 'Alacak ve borçlar rapor alınırken görülen cari net bakiyeleridir. Dönem hareketleri ayrıca gösterilir; geçmiş tarihteki kapanış bakiyesi değildir.' : activeTab === 'STOCK' ? 'Stok ve riskler anlık durumdur. Tarih filtresi stok bakiyesini geçmişe taşımaz. Farklı birimlerin miktarları toplanmaz.' : 'Satış, alış ve giderler seçili dönemi kapsar. İadeler net tutarlara yansıtılır; döviz tutarları birbirine çevrilmez.';
  return <section className="management-reports" role="region" aria-label="Yönetici raporları">
    <header className="management-reports-heading"><div><span className="management-reports-eyebrow">FİRMA YÖNETİMİ</span><h2>Yönetici Raporları</h2><p>Alacaklar, ürünler ve dönem performansı aynı çalışma alanında.</p></div><div className="management-report-actions"><button className="btn btn-secondary" onClick={exportCsv} disabled={loading || !data || !rows.length}><Download size={16} /> CSV İndir</button><button className="btn btn-secondary" onClick={print} disabled={loading || !data || !rows.length}><Printer size={16} /> Yazdır</button></div></header>
    <form className="management-report-filters" onSubmit={apply}>
      <label>Başlangıç tarihi<input type="date" required min="1900-01-01" max="2199-12-31" value={draft.startDate} onChange={event => setDraft({ ...draft, startDate: event.target.value })} /></label>
      <label>Bitiş tarihi<input type="date" required min="1900-01-01" max="2199-12-31" value={draft.endDate} onChange={event => setDraft({ ...draft, endDate: event.target.value })} /></label>
      <label>Para birimi<select aria-label="Para birimi" value={draft.currency} onChange={event => setDraft({ ...draft, currency: event.target.value })}>{currencyOptions.map(option => <option key={option} value={option}>{option === 'TRY' ? 'TRY · Türk lirası' : option}</option>)}</select></label>
      <button type="submit" className="btn btn-primary" disabled={loading}><RefreshCw size={16} /> Raporu Getir</button>
      <div className="management-report-presets" aria-label="Rapor dönemleri"><button type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={() => preset('MONTH')}>Bu ay</button><button type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={() => preset('90D')}>Son 90 gün</button><button type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={() => preset('YEAR')}>Bu yıl</button></div>
    </form>
    {validation && <p role="alert" className="management-report-error">{validation}</p>}
    {dirty && <p className="management-report-note">Filtreler değişti. Yeni sonuçlar için Raporu Getir düğmesine basın; gösterilen raporun kapsamı aşağıda yazıyor.</p>}
    <div className="management-report-tabs" role="tablist" aria-label="Yönetici raporu türleri">{tabs.map(([id, label], index) => <button key={id} id={`management-tab-${id}`} role="tab" aria-selected={activeTab === id} aria-controls="management-report-content" tabIndex={activeTab === id ? 0 : -1} onClick={() => { setActiveTab(id);setSearch(''); }} onKeyDown={event => {
      let next = index;if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;else if (event.key === 'Home') next = 0;else if (event.key === 'End') next = tabs.length - 1;else return;
      event.preventDefault();setActiveTab(tabs[next][0]);setSearch('');document.getElementById(`management-tab-${tabs[next][0]}`)?.focus();
    }}>{label}</button>)}</div>
    {loading ? <p role="status" className="management-report-loading">Yönetici raporu hazırlanıyor…</p> : error ? <div role="alert" className="management-report-error">{error} <button className="btn btn-secondary" onClick={() => setQuery({ ...query })}>Tekrar Dene</button></div> : data && <div id="management-report-content" role="tabpanel" aria-labelledby={`management-tab-${activeTab}`}>
      <p className="management-report-scope"><strong>{period} · {currency}</strong><span>Anlık bakiyeler: {dateLabel(data.snapshotDate)} · Rapor saati: {new Date(data.snapshotAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })} İstanbul</span></p>
      {data.warnings.length > 0 && <details className="management-report-warnings"><summary>{data.warnings.length} kontrol notu</summary><ul>{data.warnings.map((warning, index) => <li key={`${warning.code}-${index}`}>{warning.message}{warning.count > 0 ? ` (${number(warning.count)} kayıt)` : ''}</li>)}</ul></details>}
      {activeTab === 'OVERVIEW' && <>
        <div className="management-report-metrics">{[
          ['Net satış', data.overview.netSales, 'Dönem · KDV hariç'], ['Net alış', data.overview.netPurchases, 'Dönem · KDV hariç'], ['Gider', data.overview.expenseNet, 'Dönem · KDV hariç'],
          ['Alacağımız', data.overview.receivable, 'Anlık cari bakiye'], ['Borcumuz', data.overview.payable, 'Anlık cari bakiye'], ['Kasa ve banka', data.overview.cashBalance + data.overview.bankBalance, 'Anlık hesap bakiyesi'],
        ].map(([label, value, detail]) => <div key={String(label)}><span>{label}</span><strong>{money(value as number, currency)}</strong><small>{detail}</small></div>)}</div>
        <p className="management-report-note">Dönemde {number(data.overview.postedInvoiceCount)} işlenmiş fatura var. {data.overview.excludedInvoiceCount > 0 && `${number(data.overview.excludedInvoiceCount)} kayıt hesaplamaya alınmadı.`} Anlık bakiyeler seçili tarihlerdeki kapanış bakiyesi değildir.</p>
      </>}
      {activeTab === 'PROFIT' && <>
        <p className="management-report-note"><strong>Net kâr değildir.</strong> Güncel alış maliyetleriyle yapılan brüt kâr tahminidir. Vergi, finansman ve diğer dönem giderleri bu tutardan düşülmez. Eksik maliyetler sıfır kabul edilmez.</p>
        <div className="management-report-metrics"><div><span>{data.profitability.complete ? 'Tahmini brüt kâr' : 'Kapsanan satışların tahmini brüt kârı'}</span><strong>{money(data.profitability.estimatedGrossProfit, currency)}</strong><small>{data.profitability.complete ? 'Maliyet kapsamı tam' : 'Kısmi maliyet kapsamı'}</small></div><div><span>Maliyet kapsamı</span><strong>{data.profitability.coveragePercent === null ? 'Bilinmiyor' : `%${number(data.profitability.coveragePercent)}`}</strong><small>{number(data.profitability.knownCostLines)} maliyetli / {number(data.profitability.unknownCostLines)} maliyeti bilinmeyen satır</small></div><div><span>Maliyeti bilinmeyen satış</span><strong>{money(data.profitability.uncoveredNetSales, currency)}</strong><small>Kâr tahminine dahil edilmez</small></div></div>
      </>}
      {activeTab === 'EXPENSES' && <p className="management-report-note">Dönem gideri: KDV hariç <strong>{money(data.expenses.totalNet, currency)}</strong> · KDV dahil {money(data.expenses.totalGross, currency)}. Faturalardaki alış tutarı ayrıca gider olarak eklenmez.</p>}
      <p className="management-report-note">{scopeNote}</p>
      <div className="management-report-search"><label>Raporda ara<input type="search" value={search} placeholder="Ad, kod veya kategori" onChange={event => setSearch(event.target.value)} /></label><span>{number(rows.length)} satır · Arama yalnız tabloyu süzer; özetler rapor kapsamının tamamıdır.</span></div>
      {table && rows.length > 0 ? <div className="management-report-table-wrap"><table><thead><tr>{table.columns.map(column => <th key={column.title} scope="col">{column.title}{column.kind === 'money' && <small>{currency}</small>}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((value, cellIndex) => <td key={cellIndex} className={table.columns[cellIndex].kind ? 'management-numeric' : undefined}>{cellLabel(value, table.columns[cellIndex], currency)}</td>)}</tr>)}</tbody></table></div> : <p className="management-report-empty">Bu kapsamda gösterilecek satır yok. Tarih, para birimi veya arama seçimini kontrol edin.</p>}
    </div>}
  </section>;
}
