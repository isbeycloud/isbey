import React, { useState, useEffect } from 'react';
import { DataGrid } from '../../common/DataGrid';
import type { Column } from '../../common/DataGrid';
import type { Expense, ExpenseCategory } from '../../../types';
import { api } from '../../../services/api';
import { useApp } from '../../../context/AppContext';
import { useToast } from '../../../context/ToastContext';
import { ExpenseModal } from './ExpenseModal';
import { Plus, DollarSign, Tag, Trash2, ArrowDownRight, Wallet, Landmark } from 'lucide-react';

export const ExpenseListView: React.FC = () => {
  const { isNewExpenseModalOpen, setIsNewExpenseModalOpen, refreshKey, triggerRefresh } = useApp();
  const { showToast } = useToast();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [summary, setSummary] = useState<any>({ totalAmount: 0, totalVat: 0, netAmount: 0, count: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    loadExpenses();
  }, [selectedCategory, refreshKey]);

  const loadCategories = async () => {
    try {
      const res = await api.getExpenseCategories();
      if (res.success) setCategories(res.categories);
    } catch (err) {
      console.error(err);
    }
  };

  const loadExpenses = async () => {
    setLoading(true);
    try {
      const res = await api.getExpenses({ categoryId: selectedCategory });
      if (res.success) {
        setExpenses(res.expenses);
        setSummary(res.summary);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteExpense = async (exp: Expense) => {
    if (!window.confirm(`${exp.documentNo} no'lu masraf kaydını silmek ve kasaya/bankaya bakiye iadesi yapmak istediğinize emin misiniz?`)) {
      return;
    }

    try {
      const res = await api.deleteExpense(exp.id);
      if (res.success) {
        showToast(res.message, 'success');
        triggerRefresh();
      }
    } catch (err: any) {
      showToast(err.message || 'Silinemedi.', 'error');
    }
  };

  const columns: Column<Expense>[] = [
    {
      key: 'documentNo',
      title: 'Fiş No',
      width: '120px',
      render: e => <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{e.documentNo}</span>,
    },
    {
      key: 'date',
      title: 'Tarih',
      width: '100px',
    },
    {
      key: 'expenseCategoryName',
      title: 'Kategori',
      width: '160px',
      render: e => (
        <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Tag size={11} /> {e.expenseCategoryName}
        </span>
      ),
    },
    {
      key: 'title',
      title: 'Gider Açıklaması',
      render: e => (
        <div>
          <div style={{ fontWeight: 600 }}>{e.title}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {e.paymentMethod === 'CASH' ? `Kasa: ${e.cashRegisterName || 'Nakit'}` : `Banka: ${e.bankAccountName || 'Banka'}`}
            {e.receiptNo ? ` • Belge: ${e.receiptNo}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'amount',
      title: 'Tutar (KDV Hariç)',
      numeric: true,
      width: '130px',
      render: e => <span>{e.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>,
    },
    {
      key: 'vatAmount',
      title: 'KDV',
      numeric: true,
      width: '100px',
      render: e => <span>{e.vatAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ (%{e.vatRate})</span>,
    },
    {
      key: 'totalAmount',
      title: 'Toplam Ödenen',
      numeric: true,
      width: '140px',
      render: e => (
        <span style={{ fontWeight: 800, color: '#ef4444', fontSize: '13px' }}>
          -{e.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
        </span>
      ),
    },
    {
      key: 'actions',
      title: 'İşlemler',
      sortable: false,
      width: '80px',
      render: e => (
        <button
          className="btn btn-secondary btn-sm"
          title="Gideri Sil"
          onClick={() => handleDeleteExpense(e)}
        >
          <Trash2 size={13} color="#ef4444" />
        </button>
      ),
    },
  ];

  return (
    <div className="view-content-container">
      {/* Masraf KPI Özet Kartları */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        <div className="kpi-card" style={{ borderLeft: '4px solid #ef4444' }}>
          <div className="kpi-card-header">
            <span className="kpi-title">TOPLAM GİDER & MASRAFLAR</span>
            <div className="kpi-icon-wrapper" style={{ background: '#fee2e2', color: '#ef4444' }}>
              <ArrowDownRight size={16} />
            </div>
          </div>
          <div className="kpi-value" style={{ color: '#ef4444' }}>
            {summary.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
          </div>
          <div className="kpi-subtext">
            <span>{summary.count} Masraf Fişi Kayıtlı</span>
          </div>
        </div>

        <div className="kpi-card" style={{ borderLeft: '4px solid #6366f1' }}>
          <div className="kpi-card-header">
            <span className="kpi-title">NET MASRAF (KDV HARİÇ)</span>
            <div className="kpi-icon-wrapper" style={{ background: '#e0e7ff', color: '#6366f1' }}>
              <DollarSign size={16} />
            </div>
          </div>
          <div className="kpi-value" style={{ color: '#6366f1' }}>
            {summary.netAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
          </div>
          <div className="kpi-subtext">
            <span>Gider Tabanı</span>
          </div>
        </div>

        <div className="kpi-card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <div className="kpi-card-header">
            <span className="kpi-title">İNDİRİLECEK GİDER KDV'Sİ</span>
            <div className="kpi-icon-wrapper" style={{ background: '#fef3c7', color: '#f59e0b' }}>
              <Tag size={16} />
            </div>
          </div>
          <div className="kpi-value" style={{ color: '#f59e0b' }}>
            {summary.totalVat.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
          </div>
          <div className="kpi-subtext">
            <span>Vergiden Düşülecek KDV</span>
          </div>
        </div>
      </div>

      {/* Araç Çubuğu */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
          <button
            className={`btn ${selectedCategory === 'ALL' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setSelectedCategory('ALL')}
          >
            Tüm Masraflar
          </button>
          {categories.map(c => (
            <button
              key={c.id}
              className={`btn ${selectedCategory === c.id ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => setSelectedCategory(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>

        <button className="btn btn-primary" onClick={() => setIsNewExpenseModalOpen(true)}>
          <Plus size={16} />
          <span>Yeni Masraf Fişi Ekle</span>
        </button>
      </div>

      <DataGrid
        columns={columns}
        data={expenses}
        searchPlaceholder="Gider başlığı, fiş no veya kategori ara..."
        showTotals={true}
        totalColumns={['amount', 'vatAmount', 'totalAmount']}
      />

      <ExpenseModal
        isOpen={isNewExpenseModalOpen}
        onClose={() => setIsNewExpenseModalOpen(false)}
      />
    </div>
  );
};
