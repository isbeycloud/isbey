import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Users,
  Package,
  FileText,
  Truck,
  FileCheck,
  DollarSign,
  CreditCard,
  Compass,
  X,
  Sparkles,
  Plus,
  CornerDownLeft,
  Building,
  UserCheck,
  Zap,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import type { SearchResultItem, GlobalSearchCategory } from '../../types';

export const GlobalSearch: React.FC = () => {
  const {
    isGlobalSearchOpen,
    setIsGlobalSearchOpen,
    setActiveView,
    setActiveRibbonTab,
    setIsFastCollectionOpen,
    setIsNewCustomerModalOpen,
    setIsNewProductModalOpen,
    setIsNewInvoiceModalOpen,
    setNewInvoiceType,
  } = useApp();

  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [categories, setCategories] = useState<GlobalSearchCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<any>(null);

  const flatItems: SearchResultItem[] = categories.flatMap(cat => cat.items);

  useEffect(() => {
    if (isGlobalSearchOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      performSearch(query, filterType);
    } else {
      setQuery('');
      setCategories([]);
      setSelectedIndex(0);
    }
  }, [isGlobalSearchOpen]);

  const performSearch = async (q: string, type: string) => {
    if (!q.trim()) {
      setCategories([]);
      return;
    }

    setLoading(true);
    try {
      const res = await api.globalSearch(q.trim(), type);
      if (res.success) {
        setCategories(res.categories || []);
        setSelectedIndex(0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      performSearch(val, filterType);
    }, 120);
  };

  const handleFilterChange = (type: string) => {
    setFilterType(type);
    performSearch(query, type);
  };

  const handleSelect = (item: SearchResultItem) => {
    if (!item) return;
    setIsGlobalSearchOpen(false);

    switch (item.type) {
      case 'CUSTOMER':
        setActiveView('cari');
        setActiveRibbonTab('CARI');
        break;
      case 'PRODUCT':
        setActiveView('stok');
        setActiveRibbonTab('STOK');
        break;
      case 'INVOICE':
        setActiveView('satis');
        setActiveRibbonTab('SATIS');
        break;
      case 'WAYBILL':
        setActiveView('irsaliye');
        setActiveRibbonTab('IRSALIYE');
        break;
      case 'QUOTE':
      case 'ORDER':
        setActiveView('teklif');
        setActiveRibbonTab('TEKLIF');
        break;
      case 'EXPENSE':
        setActiveView('gider');
        setActiveRibbonTab('GIDER');
        break;
      case 'COMPANY':
        setActiveView('companies');
        setActiveRibbonTab('AYARLAR');
        break;
      case 'HIZLI_CUSTOMER':
        setActiveView('hizlibilisim');
        setActiveRibbonTab('AYARLAR');
        break;
      case 'USER':
        setActiveView('admin');
        setActiveRibbonTab('AYARLAR');
        break;
      case 'SERVICE':
        setActiveView('companies');
        setActiveRibbonTab('AYARLAR');
        break;
      case 'MODULE':
        if (item.metadata?.view) setActiveView(item.metadata.view as any);
        if (item.metadata?.tab) setActiveRibbonTab(item.metadata.tab as any);
        break;
      default:
        break;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flatItems.length > 0) setSelectedIndex(prev => (prev + 1) % flatItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flatItems.length > 0) setSelectedIndex(prev => (prev - 1 + flatItems.length) % flatItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatItems[selectedIndex]) handleSelect(flatItems[selectedIndex]);
    } else if (e.key === 'F4') {
      e.preventDefault();
      setIsGlobalSearchOpen(false);
      setIsNewProductModalOpen(true);
    } else if (e.key === 'F5') {
      e.preventDefault();
      setIsGlobalSearchOpen(false);
      setIsNewCustomerModalOpen(true);
    }
  };

  const getCategoryIcon = (key: string) => {
    switch (key) {
      case 'COMPANY': return <Building size={15} color="#8b5cf6" />;
      case 'USER': return <UserCheck size={15} color="#0284c7" />;
      case 'SERVICE': return <Zap size={15} color="#eab308" />;
      case 'CUSTOMER': return <Users size={15} color="#0284c7" />;
      case 'PRODUCT': return <Package size={15} color="#16a34a" />;
      case 'INVOICE': return <FileText size={15} color="#8b5cf6" />;
      case 'WAYBILL': return <Truck size={15} color="#d97706" />;
      case 'QUOTE': case 'ORDER': return <FileCheck size={15} color="#059669" />;
      case 'EXPENSE': return <DollarSign size={15} color="#dc2626" />;
      case 'MODULE': return <Compass size={15} color="#4f46e5" />;
      default: return <Search size={15} color="var(--primary)" />;
    }
  };

  if (!isGlobalSearchOpen) return null;

  let currentGlobalIdx = 0;

  // 2026-09-13 (tasarım sadeleştirmesi): backdropFilter: blur(4px) kaldırıldı —
  // glassmorphism istenmeyen estetik listesindeydi. Karartmayı .modal-overlay
  // sınıfı zaten veriyor, bu yüzden satır içi arka plan da eklenmedi.
  return (
    <div className="modal-overlay" onClick={() => setIsGlobalSearchOpen(false)} style={{ zIndex: 99999 }}>
      <div className="modal-dialog" style={{ maxWidth: '750px', width: '94%', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.45)', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-surface-secondary)' }}>
          <div style={{ background: 'var(--primary-light)', padding: '8px', borderRadius: '10px', display: 'flex' }}><Search size={22} color="var(--primary)" /></div>
          <input ref={inputRef} type="text" placeholder="🔎 Ne aramak istiyorsunuz? (Cari, Ürün, Baş Harf, Barkod, Fatura)..." value={query} onChange={e => handleQueryChange(e.target.value)} onKeyDown={handleKeyDown} style={{ flex: 1, border: 'none', outline: 'none', fontSize: '16px', fontWeight: 600, background: 'transparent', color: 'var(--text-main)' }} />
          {query && <button onClick={() => { setQuery(''); setCategories([]); inputRef.current?.focus(); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}><X size={18} /></button>}
          <span className="kbd-badge" style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 700 }}>ESC</span>
        </div>

        <div style={{ display: 'flex', gap: '6px', padding: '8px 18px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)', overflowX: 'auto' }}>
          {[ { id: 'all', label: 'Tümü' }, { id: 'customers', label: 'Cariler' }, { id: 'products', label: 'Ürünler' }, { id: 'invoices', label: 'Faturalar' }, { id: 'waybills', label: 'İrsaliyeler' }, { id: 'quotes', label: 'Teklifler' }, { id: 'expenses', label: 'Giderler' } ].map(f => (
            <button key={f.id} onClick={() => handleFilterChange(f.id)} style={{ border: 'none', background: filterType === f.id ? 'var(--primary)' : 'var(--bg-surface-secondary)', color: filterType === f.id ? '#ffffff' : 'var(--text-muted)', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease' }}>{f.label}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px', minHeight: '280px' }}>
          {loading && <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)', fontSize: '13px' }}><Sparkles size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', color: 'var(--primary)' }} /><div>Aranıyor...</div></div>}
          {!loading && !query.trim() && (
            <div>
              {/* 2026-09-13 (tasarım sadeleştirmesi): textTransform: uppercase kaldırıldı (tüm-büyük harf yasak). */}
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '10px' }}>⚡ Hızlı Eylemler</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div onClick={() => { setIsGlobalSearchOpen(false); setIsNewCustomerModalOpen(true); }} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', background: 'var(--bg-surface-secondary)', cursor: 'pointer', border: '1px solid var(--border-color)' }}><Plus size={16} color="var(--primary)" /><div><div style={{ fontSize: '12px', fontWeight: 700 }}>Yeni Cari (F5)</div></div></div>
                <div onClick={() => { setIsGlobalSearchOpen(false); setIsNewProductModalOpen(true); }} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', background: 'var(--bg-surface-secondary)', cursor: 'pointer', border: '1px solid var(--border-color)' }}><Plus size={16} color="#16a34a" /><div><div style={{ fontSize: '12px', fontWeight: 700 }}>Yeni Stok (F4)</div></div></div>
              </div>
            </div>
          )}
          {!loading && query.trim() && categories.length === 0 && <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>"{query}" ile eşleşen kayıt bulunamadı.</div>}
          {!loading && categories.map(cat => (
            <div key={cat.key} style={{ marginBottom: '16px' }}>
              {/* 2026-09-13 (tasarım sadeleştirmesi): textTransform: uppercase kaldırıldı (tüm-büyük harf yasak). */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 800, color: 'var(--primary)', marginBottom: '6px' }}>{getCategoryIcon(cat.key)} <span>{cat.title}</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {cat.items.map(item => {
                  const itemIdx = currentGlobalIdx++;
                  const isSelected = itemIdx === selectedIndex;
                  return (
                    <div key={item.id + item.type} onClick={() => handleSelect(item)} onMouseEnter={() => setSelectedIndex(itemIdx)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', background: isSelected ? 'var(--primary-light)' : 'var(--bg-surface-secondary)', border: isSelected ? '1px solid var(--primary)' : '1px solid transparent', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                        <div style={{ minWidth: '24px' }}>{getCategoryIcon(item.type)}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: isSelected ? 'var(--primary)' : 'var(--text-main)' }}>{item.title}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.subtitle}</div>
                        </div>
                      </div>
                      {isSelected && <div style={{ background: 'var(--primary)', color: '#fff', padding: '3px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}><CornerDownLeft size={10} /> AÇ</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-surface-secondary)', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
          <div><strong>↑ ↓</strong> Seç • <strong>ENTER</strong> Aç • <strong>ESC</strong> Kapat</div>
          <div><strong>F4:</strong> Yeni Ürün • <strong>F5:</strong> Yeni Cari</div>
        </div>
      </div>
    </div>
  );
};
