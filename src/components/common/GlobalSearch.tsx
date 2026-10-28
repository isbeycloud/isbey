import { useEffect, useId, useRef, useState } from 'react';
import { Search, X, ArrowRight, Compass, FileText, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import type { AppView, RibbonTab } from '../../context/AppContext';
import { api } from '../../services/api';
import { findNavigationCommands } from '../../data/navigationSearch';
import type { NavigationCommand } from '../../data/navigationSearch';
import type { SearchResultItem, GlobalSearchCategory } from '../../types';
import './GlobalSearch.css';

type SearchChoice = { id: string; title: string; subtitle: string; command?: NavigationCommand; record?: SearchResultItem };
function recordDestination(item: SearchResultItem): { view: AppView; tab: RibbonTab } | null {
  switch (item.type) {
    case 'CUSTOMER': return { view: 'cari', tab: 'CARI' };
    case 'PRODUCT': return { view: 'stok', tab: 'STOK' };
    case 'INVOICE': return item.metadata?.badge === 'Alış Faturası' ? { view: 'alis', tab: 'ALIS' } : { view: 'satis', tab: 'SATIS' };
    case 'WAYBILL': return { view: 'irsaliye', tab: 'IRSALIYE' };
    case 'QUOTE': case 'ORDER': return { view: 'teklif', tab: 'TEKLIF' };
    case 'EXPENSE': return { view: 'gider', tab: 'GIDER' };
    case 'COMPANY': case 'SERVICE': return { view: 'companies', tab: 'AYARLAR' };
    case 'HIZLI_CUSTOMER': return { view: 'hizlibilisim', tab: 'AYARLAR' };
    case 'USER': return { view: 'admin', tab: 'AYARLAR' };
    default: return null;
  }
}

export function GlobalSearch() {
  const { isGlobalSearchOpen: open, setIsGlobalSearchOpen, setActiveView, setActiveRibbonTab,
    setIsFastCollectionOpen, setIsFastPaymentOpen, setIsNewCustomerModalOpen, setIsNewProductModalOpen,
    setIsNewInvoiceModalOpen, setNewInvoiceType, setIsMobileSidebarOpen } = useApp();
  const { canAccessModule, can, activeTenant, user } = useAuth();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [categories, setCategories] = useState<GlobalSearchCategory[]>([]);
  const [responseKey, setResponseKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = () => setIsGlobalSearchOpen(false);
  const queryKey = JSON.stringify([activeTenant?.id, user?.id, query.trim(), filter]);
  const canCreate = (module: string) => {
    if (!can('add', module)) return false;
    const code = ({ CUSTOMERS: 'customers.create', STOCK: 'products.create', SALES: 'invoices.create', PURCHASES: 'invoices.create', COLLECTIONS: 'collections.create' } as Record<string, string>)[module];
    const codes = user?.permissionCodes;
    return !codes || !!code && codes.some(value => value === '*' || value === code || value === code.split('.')[0] + '.*');
  };

  useEffect(() => {
    if (!open) { setQuery(''); setCategories([]); setError(''); setSelected(0); setFilter('all'); return; }
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    input.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    setCategories([]); setError(''); setLoading(false); setSelected(0);
    if (!open || !query.trim() || filter === 'menus') return;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = await api.globalSearch(query.trim(), filter);
        if (!cancelled) { if (!result.success) throw new Error('Arama tamamlanamadı.'); setCategories(result.categories || []); setResponseKey(queryKey); }
      } catch { if (!cancelled) setError('Kayıt araması tamamlanamadı. Menü sonuçlarını kullanabilir veya tekrar deneyebilirsiniz.'); }
      finally { if (!cancelled) setLoading(false); }
    }, 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [open, query, filter, retry, activeTenant?.id, user?.id]);

  const commands = findNavigationCommands(query, canAccessModule, canCreate);
  const commandGroups = filter === 'all' || filter === 'menus' ? [
    { key: 'actions', title: 'Hızlı İşlemler', items: commands.filter(c => c.action).map(c => ({ id: c.id, title: c.title, subtitle: c.description, command: c })) },
    { key: 'menus', title: query.trim() ? 'Menüler' : 'Nereye gitmek istersiniz?', items: commands.filter(c => !c.action).slice(0, query.trim() ? 25 : 8).map(c => ({ id: c.id, title: c.title, subtitle: c.description, command: c })) },
  ] : [];
  const recordGroups = (responseKey === queryKey ? categories : []).filter(c => c.key !== 'MODULE').map(c => ({ key: c.key, title: c.title,
    items: c.items.filter(item => { const dest = recordDestination(item); return !!dest && canAccessModule(dest.view); })
      .map(record => ({ id: record.type + record.id, title: record.title, subtitle: record.subtitle, record })) }));
  const groups: { key: string; title: string; items: SearchChoice[] }[] = [...commandGroups, ...recordGroups].filter(g => g.items.length);
  const choices = groups.flatMap(g => g.items);
  useEffect(() => { document.getElementById(`${id}-choice-${selected}`)?.scrollIntoView({ block: 'nearest' }); }, [selected, id]);

  const select = (choice?: SearchChoice) => {
    if (!choice) return;
    const command = choice.command;
    const dest = command || (choice.record && recordDestination(choice.record));
    if (!dest || !canAccessModule(dest.view) || (command?.action && !canCreate(command.permissionModule!))) return;
    close(); setIsMobileSidebarOpen(false); setActiveView(dest.view); setActiveRibbonTab(dest.tab);
    switch (command?.action) {
      case 'customer': setIsNewCustomerModalOpen(true); break;
      case 'product': setIsNewProductModalOpen(true); break;
      case 'salesInvoice': setNewInvoiceType('SALES'); setIsNewInvoiceModalOpen(true); break;
      case 'purchaseInvoice': setNewInvoiceType('PURCHASE'); setIsNewInvoiceModalOpen(true); break;
      case 'collection': setIsFastCollectionOpen(true); break;
      case 'payment': setIsFastPaymentOpen(true); break;
    }
  };
  const keyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    else if (event.key === 'Tab') {
      const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button, input, select, [tabindex="0"]') || [])].filter(el => el.tabIndex >= 0 && !el.hasAttribute('disabled'));
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    } else if (event.target === input.current && ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Enter') select(choices[selected]);
      else if (choices.length) setSelected(i => (i + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length);
    }
  };
  if (!open) return null;
  let index = 0;
  const filters = [
    { id: 'all', label: 'Tümü', allowed: true }, { id: 'menus', label: 'Menüler', allowed: true },
    { id: 'customers', label: 'Cariler', allowed: canAccessModule('cari') }, { id: 'products', label: 'Ürünler', allowed: canAccessModule('stok') },
    { id: 'invoices', label: 'Faturalar', allowed: canAccessModule('satis') || canAccessModule('alis') },
    { id: 'waybills', label: 'İrsaliyeler', allowed: canAccessModule('irsaliye') }, { id: 'quotes', label: 'Teklifler', allowed: canAccessModule('teklif') },
    { id: 'expenses', label: 'Giderler', allowed: canAccessModule('gider') },
  ].filter(f => f.allowed);
  return <div className="modal-overlay global-search-overlay" onClick={close}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} className="global-search-dialog" onClick={e => e.stopPropagation()} onKeyDown={keyDown}>
      <header className="global-search-header"><div><h2 id={`${id}-title`}>Menü ve Kayıt Ara</h2><p>Bir işlem, menü, müşteri veya belge adı yazın.</p></div><button type="button" className="global-search-close" aria-label="Aramayı kapat" onClick={close}><X size={20} /></button></header>
      <div className="global-search-input"><Search size={20} aria-hidden="true" /><input ref={input} role="combobox" aria-label="Menü veya kayıt ara" aria-controls={`${id}-list`} aria-expanded="true" aria-autocomplete="list" aria-activedescendant={choices[selected] ? `${id}-choice-${selected}` : undefined} placeholder="Örn. fatura, tahsilat, yazar kasa, müşteri…" value={query} onChange={e => setQuery(e.target.value)} />{query && <button type="button" aria-label="Aramayı temizle" onClick={() => { setQuery(''); input.current?.focus(); }}><X size={16} /></button>}</div>
      <nav className="global-search-filters" aria-label="Arama türü">{filters.map(f => <button type="button" key={f.id} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>)}</nav>
      {error && <div className="global-search-error" role="alert">{error}<button type="button" onClick={() => setRetry(i => i + 1)}>Tekrar Dene</button></div>}
      {loading && <p className="global-search-status" role="status">Kayıtlar aranıyor… Menüleri beklemeden açabilirsiniz.</p>}
      <div id={`${id}-list`} role="listbox" aria-label="Arama sonuçları" className="global-search-results">
        {groups.map(group => <section key={group.key} role="group" aria-label={group.title}><h3>{group.title}</h3>{group.items.map(choice => {
          const i = index++;
          return <button type="button" role="option" tabIndex={-1} id={`${id}-choice-${i}`} aria-selected={selected === i} key={choice.id} onMouseEnter={() => setSelected(i)} onClick={() => select(choice)}>
            <span className="global-search-kind" aria-hidden="true">{choice.command?.action ? <Plus size={18} /> : choice.command ? <Compass size={18} /> : <FileText size={18} />}</span>
            <span className="global-search-label"><strong>{choice.title}</strong><small>{choice.subtitle}</small></span><span className="global-search-target">{choice.record ? 'Listeyi aç' : choice.command?.action ? 'Başlat' : 'Aç'} <ArrowRight size={14} /></span>
          </button>;
        })}</section>)}
        {!choices.length && !loading && !error && <p className="global-search-empty">{query.trim() ? `“${query}” için sonuç bulunamadı. Başka bir kelime deneyin veya arama türünü değiştirin.` : 'Bu arama türünde aramak için bir kelime yazın.'}</p>}
      </div>
      <footer><span>↑ ↓ Seç · Enter Aç · Esc Kapat</span><span>Kayıt sonuçları ilgili listeyi açar.</span></footer>
    </div>
  </div>;
}
