import React, { useState } from 'react';
import {
  FileText,
  ShoppingBag,
  Zap,
  Truck,
  Search,
} from 'lucide-react';
import { InvoiceListView } from '../satis/InvoiceListView';
import { PurchaseInvoiceView } from '../alis/PurchaseInvoiceView';
import { EDonusumView } from '../edonusum/EDonusumView';
import { WaybillListView } from '../irsaliye/WaybillListView';
import { BelgeSorgulamaView } from '../sorgulama/BelgeSorgulamaView';
import { useAuth } from '../../../context/AuthContext';
import { invoiceWorkspaceTabs } from '../../../utils/packageNavigation';

/**
 * Faturalar çalışma alanı.
 *
 * `sorgulama` sekmesi (docs/85) gelen/giden fatura ve irsaliyeleri TEK çubuktan
 * tarih/unvan/VKN/belge-no ile arar. Sekme, hub'ın bir parçası olarak durur:
 * ayrı bir AppView + sidebar girdisi eklemek MODULE_ACCESS_MATRIX, sidebar
 * grupları ve `faz252d` hizalama testini gereksiz yere değiştirirdi — mevcut
 * `faturalar` yetkisi zaten bu ekranı kapsıyor.
 */
export const FaturalarHubView: React.FC = () => {
  const { canAccessModule } = useAuth();
  const [activeTab, setActiveTab] = useState<'satis' | 'alis' | 'efatura' | 'irsaliye' | 'sorgulama'>('satis');

  const icons = { satis: FileText, alis: ShoppingBag, efatura: Zap, irsaliye: Truck, sorgulama: Search };
  const tabs = invoiceWorkspaceTabs.filter(tab => canAccessModule(tab.module)).map(tab => ({ ...tab, icon: icons[tab.id] }));
  const selectedTab = tabs.find(tab => tab.id === activeTab)?.id || tabs[0]?.id;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-surface-secondary)' }}>
      {/* Üst Hub Tab Bar */}
      <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-color)', padding: '8px 16px 0', display: 'flex', gap: '8px', overflowX: 'auto' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: selectedTab === t.id ? 'var(--bg-surface-secondary)' : 'transparent',
              borderTopLeftRadius: 'var(--radius-sm, 6px)',
              borderTopRightRadius: 'var(--radius-sm, 6px)',
              borderBottom: selectedTab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
              color: selectedTab === t.id ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: selectedTab === t.id ? 700 : 600,
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
          </button>
        ))}
      </div>

      {/* Aktif Tab İçeriği */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {selectedTab === 'satis' && <InvoiceListView />}
        {selectedTab === 'alis' && <PurchaseInvoiceView />}
        {selectedTab === 'efatura' && <EDonusumView />}
        {selectedTab === 'irsaliye' && <WaybillListView />}
        {selectedTab === 'sorgulama' && <BelgeSorgulamaView />}
      </div>
    </div>
  );
};
