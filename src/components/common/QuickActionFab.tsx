/**
 * İŞBEY CLOUD — FAZ 25.3-E: HIZLI İŞLEM FAB ("+Yeni")
 * ===================================================
 * Sağ altta sabit duran akıllı işlem butonu. Açılınca yetkiye göre
 * Fatura / Tahsilat / Sipariş(Satış) / Cari kısayolları listelenir.
 * Rol kontrolü canAccessModule üzerinden (modulePermissions tek kaynak).
 */

import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, Receipt, Users, DollarSign, CreditCard } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { canAccessModule } from '../../utils/modulePermissions';

export const QuickActionFab: React.FC = () => {
  const { setIsNewInvoiceModalOpen, setNewInvoiceType, setIsNewCustomerModalOpen, setIsFastCollectionOpen, setIsFastPaymentOpen, activeView } = useApp();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const role = user?.role || '';
  const can = (moduleId: string) => canAccessModule(role, moduleId);

  const actions = [
    { id: 'FAB_INVOICE', label: 'Yeni Fatura', icon: Receipt, color: '#0284c7',
      show: can('satis'), onClick: () => { setNewInvoiceType('SALES'); setIsNewInvoiceModalOpen(true); } },
    { id: 'FAB_CUSTOMER', label: 'Yeni Cari', icon: Users, color: '#7c3aed',
      show: can('cari'), onClick: () => setIsNewCustomerModalOpen(true) },
    { id: 'FAB_COLLECTION', label: 'Hızlı Tahsilat', icon: DollarSign, color: '#059669',
      show: can('kasa'), onClick: () => setIsFastCollectionOpen(true) },
    { id: 'FAB_PAYMENT', label: 'Hızlı Ödeme', icon: CreditCard, color: '#d97706',
      show: can('kasa'), onClick: () => setIsFastPaymentOpen(true) },
  ].filter(a => a.show);

  // Görünüm değişince menüyü kapat; dış tıklamada da kapat
  useEffect(() => { setOpen(false); }, [activeView]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  // Yetkili hiçbir aksiyon yoksa FAB gösterme
  if (actions.length === 0) return null;

  return (
    <div ref={wrapRef} className="quick-action-fab" style={{ position: 'fixed', right: '22px', bottom: '22px', zIndex: 1200 }}>
      {open && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px',
          background: 'var(--bg-surface)', border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md, 8px)', padding: '10px', boxShadow: 'var(--shadow-lg)', minWidth: '190px',
        }}>
          {actions.map(a => (
            <button
              key={a.id}
              onClick={() => { setOpen(false); a.onClick(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 12px',
                borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)',
                background: 'var(--bg-surface-secondary)', cursor: 'pointer', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: a.color,
              }}
            >
              <a.icon size={15} />
              <span style={{ color: 'var(--text-main)' }}>{a.label}</span>
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen(prev => !prev)}
        aria-label={open ? 'Hızlı işlem menüsünü kapat' : 'Hızlı işlem menüsünü aç'}
        title="Hızlı İşlem (Yeni Kayıt)"
        style={{
          width: '52px', height: '52px', borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: 'var(--primary)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform 0.15s ease',
          transform: open ? 'rotate(45deg)' : 'none',
        }}
      >
        {open ? <X size={24} /> : <Plus size={26} />}
      </button>
    </div>
  );
};
