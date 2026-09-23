import React, { useState, useEffect } from 'react';
import { DataGrid } from '../../common/DataGrid';
import type { Column } from '../../common/DataGrid';

import type { CashRegister, CashTransaction } from '../../../types';
import { api } from '../../../services/api';

import { useApp } from '../../../context/AppContext';
import { CashTransferModal } from './CashTransferModal';
import { CollectionPaymentModal } from '../cari/CollectionPaymentModal';
import { Wallet, Plus, ArrowUpRight, ArrowDownRight, Landmark, DollarSign, CreditCard } from 'lucide-react';

export const CashRegisterView: React.FC = () => {
  const { refreshKey, setIsFastCollectionOpen, setIsFastPaymentOpen } = useApp();

  const [cashRegisters, setCashRegisters] = useState<CashRegister[]>([]);
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [selectedCashId, setSelectedCashId] = useState<string>('ALL');
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [selectedCashId, refreshKey]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cRes, tRes] = await Promise.all([
        api.getCashRegisters(),
        api.getCashTransactions({ cashRegisterId: selectedCashId }),
      ]);
      if (cRes.success) setCashRegisters(cRes.cashRegisters);
      if (tRes.success) setTransactions(tRes.transactions);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const columns: Column<CashTransaction>[] = [
    {
      key: 'date',
      title: 'Tarih',
      width: '100px',
    },
    {
      key: 'documentNo',
      title: 'Belge No',
      width: '120px',
      render: t => <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{t.documentNo}</span>,
    },
    {
      key: 'cashRegisterName',
      title: 'Kasa',
      width: '150px',
      render: t => <span>{t.cashRegisterName}</span>,
    },
    {
      key: 'type',
      title: 'Hareket Türü',
      width: '140px',
      render: t => {
        const isIn = t.direction === 'IN';
        return (
          <span className={`badge ${isIn ? 'badge-success' : 'badge-danger'}`}>
            {isIn ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
            {t.category || (isIn ? 'Kasa Girişi' : 'Kasa Çıkışı')}
          </span>
        );
      },
    },
    {
      key: 'customerTitle',
      title: 'İlgili Cari / Hesap',
      render: t => <span>{t.customerTitle || t.bankAccountName || '-'}</span>,
    },
    {
      key: 'description',
      title: 'Açıklama',
      render: t => <span>{t.description}</span>,
    },
    {
      key: 'amount',
      title: 'Tutar (TL)',
      numeric: true,
      width: '140px',
      render: t => {
        const isIn = t.direction === 'IN';
        return (
          <span style={{ fontWeight: 700, color: isIn ? 'var(--success)' : 'var(--danger)' }}>
            {isIn ? '+' : '-'}{t.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
          </span>
        );
      },
    },
  ];

  const totalCashBalance = cashRegisters.reduce((sum, c) => sum + c.balance, 0);

  return (
    <div className="view-content-container">
      {/* Kasa Kartları */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        {cashRegisters.length === 0 && !loading && (
          <div
            style={{
              gridColumn: '1 / -1',
              padding: '28px 16px',
              textAlign: 'center',
              border: '1px dashed var(--border-color)',
              borderRadius: 'var(--radius-md, 8px)',
              color: 'var(--text-muted)',
              background: 'var(--bg-surface)',
            }}
          >
            <Wallet size={26} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.5 }} />
            <div style={{ fontWeight: 700, fontSize: 'var(--fs-base, 13px)', color: 'var(--text-main)' }}>Henüz kasa tanımlı değil</div>
            <div style={{ fontSize: 'var(--fs-sm, 12px)', marginTop: '4px' }}>
              "Kasa Girişi / Tahsilat" işlemiyle ilk kasa hareketini oluşturabilirsiniz.
            </div>
          </div>
        )}
        {cashRegisters.map(c => (
          <div
            key={c.id}
            className="kpi-card"
            style={{
              borderLeft: '4px solid var(--primary)',
              cursor: 'pointer',
              background: selectedCashId === c.id ? 'var(--primary-light)' : 'var(--bg-surface)',
            }}
            onClick={() => setSelectedCashId(c.id === selectedCashId ? 'ALL' : c.id)}
          >
            <div className="kpi-card-header">
              <span className="kpi-title">{c.name} ({c.code})</span>
              <div className="kpi-icon-wrapper" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
                <Wallet size={16} />
              </div>
            </div>
            <div className="kpi-value" style={{ color: 'var(--primary)' }}>
              {c.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
            </div>
            <div className="kpi-subtext">
              <span>{c.description || 'Aktif Kasa'}</span>
            </div>
          </div>
        ))}

        {/* Toplam Kasa Özeti */}
        <div className="kpi-card" style={{ borderLeft: '4px solid var(--primary)', background: 'var(--bg-surface-secondary)' }}>
          <div className="kpi-card-header">
            <span className="kpi-title">Tüm Kasalar Toplamı</span>
            <div className="kpi-icon-wrapper" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
              <DollarSign size={16} />
            </div>
          </div>
          <div className="kpi-value" style={{ color: 'var(--primary)' }}>
            {totalCashBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
          </div>
          <div className="kpi-subtext">
            <span>{cashRegisters.length} Kasa Aktif</span>
          </div>
        </div>
      </div>

      {/* Araç Çubuğu */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn ${selectedCashId === 'ALL' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setSelectedCashId('ALL')}
          >
            Tüm Kasa Hareketleri
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={() => setIsTransferOpen(true)}>
            <Landmark size={15} />
            <span>Kasadan Bankaya Virman</span>
          </button>
          <button className="btn btn-success" onClick={() => setIsFastCollectionOpen(true)}>
            <Plus size={15} />
            <span>Kasa Girişi / Tahsilat</span>
          </button>
          <button className="btn btn-danger" onClick={() => setIsFastPaymentOpen(true)}>
            <Plus size={15} />
            <span>Kasa Çıkışı / Ödeme</span>
          </button>
        </div>
      </div>

      {/* Kasa Hareketleri Tablosu */}
      <DataGrid
        columns={columns}
        data={transactions}
        loading={loading}
        searchPlaceholder="Belge no, açıklama veya cari adı ile filtrele..."
        showTotals={true}
        totalColumns={['amount']}
      />

      <CashTransferModal
        isOpen={isTransferOpen}
        onClose={() => setIsTransferOpen(false)}
      />
    </div>
  );
};
