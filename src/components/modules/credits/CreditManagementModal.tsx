import React, { useState, useEffect } from 'react';
import {
  X,
  Coins,
  Sparkles,
  ArrowUpRight,
  History,
  AlertCircle,
  CheckCircle2,
  Clock,
  Plus,
  Zap,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import type { CreditWallet, CreditPackage, CreditTxRecord } from '../../../types';

interface CreditManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreditsUpdated?: () => void;
}

export const CreditManagementModal: React.FC<CreditManagementModalProps> = ({
  isOpen,
  onClose,
  onCreditsUpdated,
}) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'packages' | 'history'>('packages');
  const [wallet, setWallet] = useState<CreditWallet | null>(null);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [transactions, setTransactions] = useState<CreditTxRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [wRes, pRes, tRes] = await Promise.all([
        api.getCreditWallet(),
        api.getCreditPackages(),
        api.getCreditTransactions(),
      ]);

      if (wRes.success) setWallet(wRes.wallet);
      if (pRes.success) setPackages(pRes.packages);
      if (tRes.success) setTransactions(tRes.transactions);
    } catch (err: any) {
      showToast(err.message || 'Kontör bilgileri yüklenemedi.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const availableBalance = wallet ? wallet.balance - (wallet.reservedBalance || 0) : 0;
  const isLow = wallet && availableBalance <= (wallet.lowCreditThreshold || 20);

  return (
    <>
      {/* 2026-09-13: Karartma .modal-overlay sınıfından gelir; satır içi koyu arka plan + blur kaldırıldı ki açık temada tutarlı kalsın. */}
      <div className="modal-overlay" style={{ zIndex: 1060, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          className="modal-content"
          style={{
            width: '95vw',
            maxWidth: '900px',
            maxHeight: '90vh',
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-lg, 10px)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            color: 'var(--text-main)',
          }}
        >
          {/* Header & Wallet Summary */}
          <div style={{ padding: '24px 28px 18px', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Coins size={22} color="var(--primary)" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>e-Dönüşüm Kontör Merkezi</h3>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>e-Fatura, e-Arşiv ve e-İrsaliye gönderim kredisi</p>
                </div>
              </div>
              <button
                onClick={onClose}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Bakiye Kartları */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div style={{ background: 'var(--bg-surface-secondary)', padding: '16px 20px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', fontWeight: 600 }}>Kullanılabilir Bakiye</div>
                <div style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--info)', marginTop: '4px' }}>
                  {availableBalance.toLocaleString('tr-TR')} <span style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>Kontör</span>
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface-secondary)', padding: '16px 20px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', fontWeight: 600 }}>İşlemdeki (Rezerve)</div>
                <div style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--warning)', marginTop: '4px' }}>
                  {(wallet?.reservedBalance || 0).toLocaleString('tr-TR')} <span style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>Kontör</span>
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface-secondary)', padding: '16px 20px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', fontWeight: 600 }}>Kritik Uyarı Eşiği</div>
                <div style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--text-muted)', marginTop: '4px' }}>
                  {wallet?.lowCreditThreshold || 20} <span style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>Kontör</span>
                </div>
              </div>
            </div>

            {/* Düşük Kontör Uyarısı */}
            {isLow && (
              <div style={{ marginTop: '14px', padding: '10px 14px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm, 6px)', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--danger-text)', fontSize: 'var(--fs-sm, 12px)' }}>
                <AlertCircle size={18} color="var(--danger)" />
                <span><b>Kritik Kontör Uyarısı:</b> Kontör bakiyeniz eşik değerinin altına inmiştir. Faturalarınızın durmaması için lütfen yükleme yapınız.</span>
              </div>
            )}

            {/* Tab Seçimi */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '18px' }}>
              <button
                onClick={() => setActiveTab('packages')}
                style={{
                  padding: '8px 18px',
                  borderRadius: 'var(--radius-sm, 6px)',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 'var(--fs-sm, 12px)',
                  background: activeTab === 'packages' ? 'var(--primary)' : 'var(--bg-surface-secondary)',
                  color: activeTab === 'packages' ? '#fff' : 'var(--text-main)',
                }}
              >
                Kontör Satın Al
              </button>
              <button
                onClick={() => setActiveTab('history')}
                style={{
                  padding: '8px 18px',
                  borderRadius: 'var(--radius-sm, 6px)',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 'var(--fs-sm, 12px)',
                  background: activeTab === 'history' ? 'var(--primary)' : 'var(--bg-surface-secondary)',
                  color: activeTab === 'history' ? '#fff' : 'var(--text-main)',
                }}
              >
                Hareket Geçmişi
              </button>
            </div>
          </div>

          {/* İçerik */}
          <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>
            {activeTab === 'packages' ? (
              /* Kontör Paketleri Grid */
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                {packages.map(pkg => (
                  <div
                    key={pkg.id}
                    style={{
                      background: pkg.isPopular ? 'var(--primary-light)' : 'var(--bg-surface-secondary)',
                      borderRadius: 'var(--radius-md, 8px)',
                      border: pkg.isPopular ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      position: 'relative',
                    }}
                  >
                    {pkg.isPopular && (
                      <div style={{ position: 'absolute', top: '-10px', right: '16px', background: 'var(--primary)', color: '#fff', padding: '2px 8px', borderRadius: 'var(--radius-sm, 6px)', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700 }}>
                        Avantajlı
                      </div>
                    )}
                    <h4 style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, margin: '0 0 6px', color: 'var(--text-main)' }}>
                      {pkg.name}
                    </h4>
                    <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', marginBottom: '14px' }}>
                      Birim: <b>{pkg.unitPrice} TL</b> / kontör
                    </div>

                    <div style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--info)', marginBottom: '4px' }}>
                      {pkg.price.toLocaleString('tr-TR')} TL
                    </div>
                    <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginBottom: '20px' }}>
                      KDV Dahil {pkg.totalPrice.toLocaleString('tr-TR')} TL
                    </div>

                    <button
                      disabled={isPurchasing}
                      onClick={async () => {
                        setIsPurchasing(true);
                        try {
                          const res = await api.buyBillingCredits({
                            quantity: pkg.quantity,
                            amount: pkg.totalPrice || pkg.price,
                          });
                          if (res.success) {
                            showToast(`${pkg.name || `${pkg.quantity} Kontör`} başarıyla cüzdanınıza yüklendi!`, 'success');
                            loadData();
                            if (onCreditsUpdated) onCreditsUpdated();
                          }
                        } catch (err: any) {
                          showToast(err.message || 'Satın alma tamamlanamadı.', 'error');
                        } finally {
                          setIsPurchasing(false);
                        }
                      }}
                      style={{
                        marginTop: 'auto',
                        padding: '10px',
                        borderRadius: 'var(--radius-sm, 6px)',
                        border: 'none',
                        background: 'var(--primary)',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 'var(--fs-sm, 12px)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <span>{isPurchasing ? 'İşleniyor...' : 'Satın Al'}</span>
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              /* Hareket Tablosu */
              <div style={{ background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-base, 13px)', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-surface-secondary)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ padding: '12px 16px' }}>Tarih</th>
                      <th style={{ padding: '12px 16px' }}>İşlem Tipi</th>
                      <th style={{ padding: '12px 16px' }}>Açıklama</th>
                      <th style={{ padding: '12px 16px' }}>Miktar</th>
                      <th style={{ padding: '12px 16px' }}>Bakiye</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          Henüz bir kontör hareketi bulunmuyor.
                        </td>
                      </tr>
                    ) : (
                      transactions.map((tx, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                            {new Date(tx.createdAt).toLocaleDateString('tr-TR')}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span className={tx.type === 'PURCHASE' || tx.type === 'purchase' || tx.type === 'BONUS' ? 'badge badge-success' : 'badge badge-danger'}>
                              {tx.type}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', color: 'var(--text-main)' }}>{tx.description}</td>
                          <td style={{ padding: '12px 16px', fontWeight: 700, color: tx.type === 'PURCHASE' || tx.type === 'purchase' ? 'var(--success)' : 'var(--danger)' }}>
                            {tx.type === 'PURCHASE' || tx.type === 'purchase' ? `+${tx.quantity || (tx as any).amount}` : `-${tx.quantity || (tx as any).amount}`}
                          </td>
                          <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--info)' }}>
                            {tx.balanceAfter}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
