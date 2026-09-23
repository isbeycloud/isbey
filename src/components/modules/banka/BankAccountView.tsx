import React, { useState, useEffect } from 'react';
import { DataGrid } from '../../common/DataGrid';
import type { Column } from '../../common/DataGrid';

import type { BankAccount, BankTransaction } from '../../../types';
import { api } from '../../../services/api';

import { useApp } from '../../../context/AppContext';
import { BankTransferModal } from './BankTransferModal';
import { Landmark, ArrowUpRight, ArrowDownRight, Wallet, Plus } from 'lucide-react';

export const BankAccountView: React.FC = () => {
  const { refreshKey, setIsFastCollectionOpen, setIsFastPaymentOpen } = useApp();

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<string>('ALL');
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [selectedBankId, refreshKey]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [bRes, tRes] = await Promise.all([
        api.getBankAccounts(),
        api.getBankTransactions({ bankAccountId: selectedBankId }),
      ]);
      if (bRes.success) setBankAccounts(bRes.bankAccounts);
      if (tRes.success) setTransactions(tRes.transactions);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const columns: Column<BankTransaction>[] = [
    {
      key: 'date',
      title: 'Tarih',
      width: '100px',
    },
    {
      key: 'documentNo',
      title: 'Dekont / Belge No',
      width: '130px',
      render: t => <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{t.documentNo}</span>,
    },
    {
      key: 'bankAccountName',
      title: 'Banka Hesabı',
      width: '160px',
      render: t => <span>{t.bankAccountName}</span>,
    },
    {
      key: 'type',
      title: 'İşlem Türü',
      width: '140px',
      render: t => {
        const isIn = t.direction === 'IN';
        return (
          <span className={`badge ${isIn ? 'badge-success' : 'badge-danger'}`}>
            {isIn ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
            {isIn ? 'Gelen Havale/EFT' : 'Giden Transfer'}
          </span>
        );
      },
    },
    {
      key: 'customerTitle',
      title: 'Cari / Muhatap',
      render: t => <span>{t.customerTitle || '-'}</span>,
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

  const totalBankBalance = bankAccounts.reduce((sum, b) => sum + b.balance, 0);

  return (
    <div className="view-content-container">
      {/* Banka Kartları */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
        {bankAccounts.length === 0 && !loading && (
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
            <Landmark size={26} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.5 }} />
            <div style={{ fontWeight: 700, fontSize: 'var(--fs-base, 13px)', color: 'var(--text-main)' }}>Henüz banka hesabınız yok</div>
            <div style={{ fontSize: 'var(--fs-sm, 12px)', marginTop: '4px' }}>
              "Gelen Havale / Tahsilat" işlemiyle ilk hareketi oluşturabilir veya cari kartından banka tahsilatı alabilirsiniz.
            </div>
          </div>
        )}
        {bankAccounts.map(b => (
          <div
            key={b.id}
            className="kpi-card"
            style={{
              borderLeft: '4px solid var(--primary)',
              cursor: 'pointer',
              background: selectedBankId === b.id ? 'var(--primary-light)' : 'var(--bg-surface)',
            }}
            onClick={() => setSelectedBankId(b.id === selectedBankId ? 'ALL' : b.id)}
          >
            <div className="kpi-card-header">
              <span className="kpi-title">{b.bankName}</span>
              <div className="kpi-icon-wrapper" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
                <Landmark size={16} />
              </div>
            </div>
            <div style={{ fontSize: 'var(--fs-sm, 12px)', fontWeight: 600, color: 'var(--text-muted)' }}>{b.accountName}</div>
            <div className="kpi-value" style={{ color: 'var(--primary)', margin: '4px 0' }}>
              {b.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
            </div>
            <div style={{ fontSize: 'var(--fs-2xs, 10px)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {b.iban}
            </div>
          </div>
        ))}

        {/* Toplam Banka Özeti */}
        <div className="kpi-card" style={{ borderLeft: '4px solid var(--primary)', background: 'var(--bg-surface-secondary)' }}>
          <div className="kpi-card-header">
            <span className="kpi-title">Tüm Bankalar Toplamı</span>
            <div className="kpi-icon-wrapper" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
              <Landmark size={16} />
            </div>
          </div>
          <div className="kpi-value" style={{ color: 'var(--primary)' }}>
            {totalBankBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
          </div>
          <div className="kpi-subtext">
            <span>{bankAccounts.length} Aktif Ticari Hesap</span>
          </div>
        </div>
      </div>

      {/* Araç Çubuğu */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn ${selectedBankId === 'ALL' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setSelectedBankId('ALL')}
          >
            Tüm Banka Hareketleri
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={() => setIsTransferOpen(true)}>
            <Wallet size={15} />
            <span>Bankadan Kasaya Para Çek</span>
          </button>
          <button className="btn btn-success" onClick={() => setIsFastCollectionOpen(true)}>
            <Plus size={15} />
            <span>Gelen Havale / Tahsilat</span>
          </button>
          <button className="btn btn-danger" onClick={() => setIsFastPaymentOpen(true)}>
            <Plus size={15} />
            <span>Giden Havale / EFT</span>
          </button>
        </div>
      </div>

      {/* Banka Hareketleri Tablosu */}
      <DataGrid
        columns={columns}
        data={transactions}
        loading={loading}
        searchPlaceholder="Dekont no, muhatap veya açıklama ile ara..."
        showTotals={true}
        totalColumns={['amount']}
      />

      <BankTransferModal
        isOpen={isTransferOpen}
        onClose={() => setIsTransferOpen(false)}
      />
    </div>
  );
};
