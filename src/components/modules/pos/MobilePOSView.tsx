import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Zap,
  CheckCircle2,
  AlertCircle,
  Wifi,
  Smartphone,
  RotateCcw,
  Printer,
  History,
  Shield,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import type { PosTransaction } from '../../../types';

export const MobilePOSView: React.FC = () => {
  const { showToast } = useToast();
  const [amountStr, setAmountStr] = useState('0');
  const [installment, setInstallment] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastSlip, setLastSlip] = useState<{ tx: PosTransaction; authCode: string } | null>(null);
  const [transactions, setTransactions] = useState<PosTransaction[]>([]);
  const [activeTab, setActiveTab] = useState<'terminal' | 'history'>('terminal');

  useEffect(() => {
    loadTransactions();
  }, []);

  const loadTransactions = async () => {
    try {
      const res = await api.getPosTransactions();
      if (res.success) setTransactions(res.transactions || []);
    } catch {
      // ignore
    }
  };

  const handleKeyPress = (val: string) => {
    if (val === 'C') {
      setAmountStr('0');
      return;
    }
    if (val === 'DEL') {
      if (amountStr.length <= 1) setAmountStr('0');
      else setAmountStr(amountStr.slice(0, -1));
      return;
    }
    if (amountStr === '0' && val !== '.') {
      setAmountStr(val);
    } else {
      if (val === '.' && amountStr.includes('.')) return;
      if (amountStr.length < 9) setAmountStr(amountStr + val);
    }
  };

  const handleCharge = async (mode: 'CONTACTLESS' | 'CHIP') => {
    const numericAmount = parseFloat(amountStr);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      showToast('Lütfen geçerli bir tutar giriniz.', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      // Simüle kart çekimi
      const res = await api.chargeMobilePos({
        amount: numericAmount,
        currency: 'TRY',
        cardNumber: mode === 'CONTACTLESS' ? '9792000000001234' : '4543600000005678',
        cardHolderName: 'ISBEY MOBIL TEST',
        cardExpiry: '12/28',
        cardCvv: '123',
        installment,
      });

      if (res.success) {
        showToast('POS işlemi başarıyla onaylandı.', 'success');
        setLastSlip({ tx: res.transaction, authCode: res.authCode || '987654' });
        setAmountStr('0');
        loadTransactions();
      }
    } catch (err: any) {
      showToast(err.message || 'POS işlemi reddedildi.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* 2026-09-13: sayfa kabuğu açık temaya geçti — ikon bloğu marka
                renginin açık tonuna, ikon da marka rengine çekildi. */}
            <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CreditCard size={24} color="var(--primary)" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, margin: 0 }}>
                  Mobil POS & Sanal Terminal
                </h1>
                <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Wifi size={12} /> Çevrimiçi
                </span>
              </div>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>
                Android/Web mobil POS tuş takımı, temassız NFC ve anında slip çıktısı
              </p>
            </div>
          </div>

          {/* Tab Seçimi */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setActiveTab('terminal')}
              style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm, 6px)', border: 'none', background: activeTab === 'terminal' ? 'var(--primary)' : 'var(--bg-surface-secondary)', color: activeTab === 'terminal' ? '#fff' : 'var(--text-main)', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer' }}
            >
              POS Terminali
            </button>
            <button
              onClick={() => setActiveTab('history')}
              style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm, 6px)', border: 'none', background: activeTab === 'history' ? 'var(--primary)' : 'var(--bg-surface-secondary)', color: activeTab === 'history' ? '#fff' : 'var(--text-main)', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer' }}
            >
              İşlem Geçmişi ({transactions.length})
            </button>
          </div>
        </div>

        {activeTab === 'terminal' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: '24px', alignItems: 'start' }}>
            {/* Sol: Sanal POS Cihazı */}
            <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '24px', boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.6)' }}>
              {/* POS Ekranı */}
              <div style={{ background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', padding: '20px', marginBottom: '20px', textAlign: 'right' }}>
                <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                  <span>İŞBEY POS v2.0</span>
                  <span>{installment > 1 ? `${installment} Taksit` : 'Tek Çekim'}</span>
                </div>
                <div style={{ fontSize: '2.4rem', fontWeight: 700, color: 'var(--info)', marginTop: '6px' }}>
                  {parseFloat(amountStr).toLocaleString('tr-TR', { minimumFractionDigits: 0 })} <span style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>TL</span>
                </div>
              </div>

              {/* Taksit Butonları */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
                {[1, 2, 3, 6, 9, 12].map(t => (
                  <button
                    key={t}
                    onClick={() => setInstallment(t)}
                    style={{
                      flex: 1,
                      padding: '6px',
                      borderRadius: 'var(--radius-sm, 6px)',
                      border: installment === t ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                      background: installment === t ? 'var(--primary)' : 'var(--bg-surface-secondary)',
                      color: installment === t ? '#fff' : 'var(--text-main)',
                      fontSize: 'var(--fs-xs, 11px)',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {t === 1 ? 'Tek' : `${t}T`}
                  </button>
                ))}
              </div>

              {/* Hızlı Tutar Butonları */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {[100, 250, 500, 1000].map(quickVal => (
                  <button
                    key={quickVal}
                    onClick={() => setAmountStr(quickVal.toString())}
                    style={{ flex: 1, padding: '8px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-muted)', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, cursor: 'pointer' }}
                  >
                    +{quickVal} TL
                  </button>
                ))}
              </div>

              {/* Tuş Takımı */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' }}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'DEL'].map(k => (
                  <button
                    key={k}
                    onClick={() => handleKeyPress(k)}
                    style={{
                      padding: '16px',
                      borderRadius: 'var(--radius-sm, 6px)',
                      border: '1px solid var(--border-color)',
                      background: k === 'C' ? 'var(--danger-bg)' : k === 'DEL' ? 'var(--bg-surface-secondary)' : 'var(--bg-surface)',
                      color: k === 'C' ? 'var(--danger)' : 'var(--text-main)',
                      fontSize: '1.25rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {k}
                  </button>
                ))}
              </div>

              {/* Çekim İşlem Butonları */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  disabled={isProcessing || parseFloat(amountStr) <= 0}
                  onClick={() => handleCharge('CONTACTLESS')}
                  style={{
                    padding: '14px',
                    borderRadius: 'var(--radius-sm, 6px)',
                    border: 'none',
                    background: 'var(--primary)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 'var(--fs-sm, 12px)',
                    cursor: parseFloat(amountStr) > 0 ? 'pointer' : 'default',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Wifi size={18} />
                  <span>Temassız NFC</span>
                </button>

                <button
                  disabled={isProcessing || parseFloat(amountStr) <= 0}
                  onClick={() => handleCharge('CHIP')}
                  style={{
                    padding: '14px',
                    borderRadius: 'var(--radius-sm, 6px)',
                    border: 'none',
                    background: 'var(--primary)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 'var(--fs-sm, 12px)',
                    cursor: parseFloat(amountStr) > 0 ? 'pointer' : 'default',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <CreditCard size={18} />
                  <span>Çipli / Kart Çek</span>
                </button>
              </div>
            </div>

            {/* Sağ: POS Slip Önizlemesi */}
            <div>
              {/* 2026-09-13: Slip, termal yazıcı çıktısının birebir önizlemesi
                  olduğu için beyaz kâğıt görünümü bilinçli olarak korundu. */}
              {lastSlip ? (
                <div style={{ background: '#fff', color: 'var(--text-main)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', padding: '24px', fontFamily: 'monospace', maxWidth: '340px', margin: '0 auto', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4)' }}>
                  <div style={{ textAlign: 'center', borderBottom: '1px dashed var(--border-color)', paddingBottom: '12px', marginBottom: '14px' }}>
                    <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>İŞBEY TEKNOLOJİ A.Ş.</h3>
                    <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>Mobil POS Satış Slipi</div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: 'var(--fs-sm, 12px)', borderBottom: '1px dashed var(--border-color)', paddingBottom: '14px', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Tarih / Saat:</span>
                      <span>{new Date(lastSlip.tx.createdAt).toLocaleString('tr-TR')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>İşlem Tipi:</span>
                      <span>Satış ({lastSlip.tx.installment || 1} Taksit)</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Kart No:</span>
                      <span>•••• •••• •••• {lastSlip.tx.cardLast4 || '1234'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Onay Kodu:</span>
                      <span style={{ fontWeight: 700 }}>{lastSlip.authCode}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1.2rem', fontWeight: 700, marginBottom: '16px' }}>
                    <span>Toplam:</span>
                    <span>{lastSlip.tx.amount.toLocaleString('tr-TR')} TL</span>
                  </div>

                  <div style={{ textAlign: 'center', fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginBottom: '14px' }}>
                    Müşteri Nüshası - Teşekkür Ederiz
                  </div>

                  <button
                    onClick={() => window.print()}
                    style={{ width: '100%', padding: '10px', background: 'var(--bg-surface-secondary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <Printer size={16} />
                    <span>Slipi Yazdır</span>
                  </button>
                </div>
              ) : (
                <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Smartphone size={48} style={{ margin: '0 auto 16px', color: 'var(--text-muted)' }} />
                  <h3 style={{ margin: '0 0 8px', color: 'var(--text-main)', fontSize: 'var(--fs-lg, 16px)' }}>POS İşlemi Bekleniyor</h3>
                  <p style={{ fontSize: 'var(--fs-sm, 12px)', margin: 0 }}>
                    Sol taraftaki tuş takımından tutar girerek Temassız NFC veya Çipli çekim başlatabilirsiniz.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Geçmiş Tablosu */
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-base, 13px)', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface-secondary)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '14px 18px' }}>Tarih</th>
                  <th style={{ padding: '14px 18px' }}>İşlem No</th>
                  <th style={{ padding: '14px 18px' }}>Kart</th>
                  <th style={{ padding: '14px 18px' }}>Taksit</th>
                  <th style={{ padding: '14px 18px' }}>Onay Kodu</th>
                  <th style={{ padding: '14px 18px' }}>Tutar</th>
                  <th style={{ padding: '14px 18px' }}>Durum</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Henüz POS işlemi bulunmuyor.
                    </td>
                  </tr>
                ) : (
                  transactions.map(t => (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>
                        {new Date(t.createdAt).toLocaleDateString('tr-TR')}
                      </td>
                      <td style={{ padding: '14px 18px', fontFamily: 'monospace' }}>{t.providerTransactionId}</td>
                      <td style={{ padding: '14px 18px' }}>•••• {t.cardLast4 || '1234'} ({t.cardBrand || 'TROY'})</td>
                      <td style={{ padding: '14px 18px' }}>{t.installment || 1} Taksit</td>
                      <td style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--info)' }}>{t.authCode || '-'}</td>
                      <td style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--success)' }}>{t.amount.toLocaleString('tr-TR')} TL</td>
                      <td style={{ padding: '14px 18px' }}>
                        <span className="badge badge-success">
                          {t.status}
                        </span>
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
  );
};
