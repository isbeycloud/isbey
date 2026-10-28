import { useEffect, useState } from 'react';
import { api } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import type { PosTransaction } from '../../../types';
import { FiscalDeviceSettings } from './FiscalDeviceSettings';

export function MobilePOSView() {
  const { canAccessModule, activeTenant } = useAuth();
  const canConfigure = canAccessModule('companies');
  const [tab, setTab] = useState<'devices' | 'history'>('devices');
  const [transactions, setTransactions] = useState<PosTransaction[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    setTransactions([]); setError('');
    if (tab !== 'history') return;
    let active = true;
    api.getPosTransactions().then(r => { if (active) setTransactions(r.transactions); }).catch(err => { if (active) setError(err.message || 'İşlem geçmişi alınamadı.'); });
    return () => { active = false; };
  }, [tab, activeTenant?.id]);
  return <div style={{ padding: 24, overflow: 'auto', flex: 1, minWidth: 0 }}>
    <nav aria-label="POS bağlantı bölümleri" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
      <button className="btn btn-secondary" aria-pressed={tab === 'devices'} onClick={() => setTab('devices')}>Cihaz Bağlantıları</button>
      <button className="btn btn-secondary" aria-pressed={tab === 'history'} onClick={() => setTab('history')}>İşlem Geçmişi</button>
    </nav>
    {tab === 'devices' ? canConfigure ? <FiscalDeviceSettings /> : <p role="status">Cihaz bağlantısı henüz doğrulanmadı. Tanımlama için firma yöneticinize başvurun; gerçek tahsilat kapalı.</p> : <>
      <h2>POS İşlem Geçmişi</h2>{error && <p role="alert">{error}</p>}
      {!error && !transactions.length && <p>Henüz POS işlem kaydı yok.</p>}
      <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Tarih</th><th>İşlem</th><th>Tutar</th><th>Durum</th></tr></thead><tbody>
        {transactions.map(t => <tr key={t.id}><td>{new Date(t.createdAt).toLocaleDateString('tr-TR')}</td><td>{t.providerTransactionId}</td><td>{t.amount.toLocaleString('tr-TR')} {t.currency}</td><td>{t.provider === 'MOCK' ? 'Deneme kaydı' : t.status}</td></tr>)}
      </tbody></table></div>
    </>}
  </div>;
}
