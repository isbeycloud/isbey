import React, { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  FileText,
  DollarSign,
  UploadCloud,
  UserPlus,
  Sparkles,
  Layers,
  ArrowRight,
  Shield,
  Command,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { AppView, RibbonTab } from '../../context/AppContext';

export const CommandPaletteModal: React.FC = () => {
  const { setActiveView, setActiveRibbonTab, setIsFastCollectionOpen, setIsFastPaymentOpen } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const actions = [
    { id: 'new_invoice', label: '+ Yeni Satış Faturası Oluştur', icon: Plus, run: () => { setActiveView('satis'); setActiveRibbonTab('SATIS'); } },
    { id: 'new_collection', label: '+ Yeni Tahsilat Yap (F8)', icon: DollarSign, run: () => { setIsFastCollectionOpen(true); } },
    { id: 'new_expense', label: '+ Yeni Gider Girişi (F9)', icon: DollarSign, run: () => { setIsFastPaymentOpen(true); } },
    { id: 'upload_doc', label: '+ Yeni Belge Yükle / Dijital Arşiv', icon: UploadCloud, run: () => { setActiveView('documents'); } },
    { id: 'new_customer', label: '+ Yeni Cari Hesap Kartı', icon: UserPlus, run: () => { setActiveView('cari'); setActiveRibbonTab('CARI'); } },
    { id: 'ai_assistant', label: 'AI Muhasebe Asistanına Sor', icon: Sparkles, run: () => { setActiveView('ai-merkezi'); setActiveRibbonTab('AI_ASISTAN'); } },
    { id: 'approvals', label: 'Onay Bekleyen Finansal İşlemler', icon: Shield, run: () => { setActiveView('approvals'); } },
    { id: 'tasks', label: 'Görev Yönetimi & Ortak Workspace', icon: Layers, run: () => { setActiveView('tasks'); } },
    { id: 'cash_forecast', label: 'Nakit Akış Tahmini (30 Gün)', icon: FileText, run: () => { setActiveView('nakit-tahmin'); } },
    { id: 'client_portal', label: 'Firma Sahibi / Müşteri Portalı', icon: Layers, run: () => { setActiveView('client-portal'); } },
  ];

  const filtered = actions.filter(a => a.label.toLowerCase().includes(search.toLowerCase()));

  const handleSelect = (action: typeof actions[0]) => {
    action.run();
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1400, alignItems: 'flex-start', paddingTop: '10vh' }}>
      <div style={{ width: '90vw', maxWidth: '580px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', overflow: 'hidden', boxShadow: 'var(--shadow-xl)', color: 'var(--text-main)' }}>
        {/* Giriş Çubuğu */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border-color)', gap: '12px' }}>
          <Search size={20} color="var(--info)" />
          <input
            type="text"
            autoFocus
            placeholder="İşlem veya modül arayın... (Örn: Fatura, Tahsilat, Cari, Belge)"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-main)', fontSize: 'var(--fs-lg, 16px)', outline: 'none' }}
          />
          <span style={{ fontSize: 'var(--fs-sm, 12px)', background: 'var(--bg-surface-secondary)', padding: '3px 8px', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-muted)' }}>ESC</span>
        </div>

        {/* Eylemler Listesi */}
        <div style={{ maxHeight: '360px', overflowY: 'auto', padding: '8px' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-base, 13px)' }}>
              Eşleşen hızlı komut veya modül bulunamadı.
            </div>
          ) : (
            filtered.map(act => {
              const Icon = act.icon;
              return (
                <div
                  key={act.id}
                  onClick={() => handleSelect(act)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md, 8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--bg-surface-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--info)' }}>
                      <Icon size={16} />
                    </div>
                    <span style={{ fontSize: 'var(--fs-base, 13px)', fontWeight: 700, color: 'var(--text-main)' }}>{act.label}</span>
                  </div>
                  <ArrowRight size={14} color="var(--text-muted)" />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
