import React, { useState } from 'react';
import {
  Wallet,
  Landmark,
  ArrowDownLeft,
  ArrowUpRight,
  FileCheck,
} from 'lucide-react';
import { CashRegisterView } from '../kasa/CashRegisterView';
import { BankAccountView } from '../banka/BankAccountView';
import { FieldCollectionListView } from '../saha/FieldCollectionListView';
import { ExpenseListView } from '../gider/ExpenseListView';
import { CheckNotesView } from '../ceksenet/CheckNotesView';

export const FinansHubView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'kasa' | 'banka' | 'tahsilat' | 'odeme' | 'ceksenet'>('kasa');

  const tabs = [
    { id: 'kasa', label: 'Kasa Hesapları', icon: Wallet, badge: 'Nakit' },
    { id: 'banka', label: 'Banka Hesapları & POS', icon: Landmark, badge: 'EFT/POS' },
    { id: 'tahsilat', label: 'Tahsilatlar & Saha', icon: ArrowDownLeft, badge: 'Giriş' },
    { id: 'odeme', label: 'Ödemeler & Giderler', icon: ArrowUpRight, badge: 'Çıkış' },
    { id: 'ceksenet', label: 'Çek / Senet Portföyü', icon: FileCheck, badge: 'Vadeli' },
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
              borderBottom: activeTab === t.id ? '2px solid var(--success)' : '2px solid transparent',
              color: activeTab === t.id ? 'var(--success)' : 'var(--text-muted)',
              fontWeight: activeTab === t.id ? 700 : 600,
              fontSize: 'var(--fs-base, 13px)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.15s ease',
            }}
          >
            <t.icon size={16} />
            <span>{t.label}</span>
            <span style={{ fontSize: 'var(--fs-2xs, 10px)', padding: '1px 5px', borderRadius: 'var(--radius-xs, 4px)', background: activeTab === t.id ? 'var(--success-bg)' : 'var(--bg-surface-secondary)', color: activeTab === t.id ? 'var(--success)' : 'var(--text-muted)', fontWeight: 700 }}>
              {t.badge}
            </span>
          </button>
        ))}
      </div>

      {/* Aktif Tab İçeriği */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {activeTab === 'kasa' && <CashRegisterView />}
        {activeTab === 'banka' && <BankAccountView />}
        {activeTab === 'tahsilat' && <FieldCollectionListView />}
        {activeTab === 'odeme' && <ExpenseListView />}
        {activeTab === 'ceksenet' && <CheckNotesView />}
      </div>
    </div>
  );
};
