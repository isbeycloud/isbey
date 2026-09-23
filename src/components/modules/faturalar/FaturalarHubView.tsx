import React, { useState } from 'react';
import {
  FileText,
  ShoppingBag,
  Zap,
  Truck,
} from 'lucide-react';
import { InvoiceListView } from '../satis/InvoiceListView';
import { PurchaseInvoiceView } from '../alis/PurchaseInvoiceView';
import { EDonusumView } from '../edonusum/EDonusumView';
import { WaybillListView } from '../irsaliye/WaybillListView';

export const FaturalarHubView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'satis' | 'alis' | 'efatura' | 'irsaliye'>('satis');

  const tabs = [
    { id: 'satis', label: 'Satış Faturaları', icon: FileText, badge: 'Giden' },
    { id: 'alis', label: 'Alış Faturaları', icon: ShoppingBag, badge: 'Gelen' },
    { id: 'efatura', label: 'e-Fatura & e-Arşiv Portalı', icon: Zap, badge: 'GİB' },
    { id: 'irsaliye', label: 'e-İrsaliyeler & Sevk', icon: Truck, badge: 'Lojistik' },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-surface-secondary)' }}>
      {/* Üst Hub Tab Bar */}
      <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-color)', padding: '8px 16px 0', display: 'flex', gap: '8px', overflowX: 'auto' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: activeTab === t.id ? 'var(--bg-surface-secondary)' : 'transparent',
              borderTopLeftRadius: 'var(--radius-sm, 6px)',
              borderTopRightRadius: 'var(--radius-sm, 6px)',
              borderBottom: activeTab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === t.id ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: activeTab === t.id ? 700 : 600,
              fontSize: 'var(--fs-sm, 12px)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.15s ease',
            }}
          >
            <t.icon size={16} />
            <span>{t.label}</span>
            <span style={{ fontSize: 'var(--fs-2xs, 10px)', padding: '1px 5px', borderRadius: 'var(--radius-xs, 4px)', background: activeTab === t.id ? 'var(--primary-light)' : 'var(--bg-surface-secondary)', color: activeTab === t.id ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 700 }}>
              {t.badge}
            </span>
          </button>
        ))}
      </div>

      {/* Aktif Tab İçeriği */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {activeTab === 'satis' && <InvoiceListView />}
        {activeTab === 'alis' && <PurchaseInvoiceView />}
        {activeTab === 'efatura' && <EDonusumView />}
        {activeTab === 'irsaliye' && <WaybillListView />}
      </div>
    </div>
  );
};
