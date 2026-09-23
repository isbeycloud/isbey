import React, { useState, useEffect } from 'react';
import { DataGrid } from '../../common/DataGrid';
import type { Column } from '../../common/DataGrid';
import type { Customer } from '../../../types';


import { api } from '../../../services/api';

import { useApp } from '../../../context/AppContext';
import { CustomerModal } from './CustomerModal';
import { CustomerStatementModal } from './CustomerStatementModal';
import { CollectionPaymentModal } from './CollectionPaymentModal';
import {
  Plus,
  FileText,
  DollarSign,
  CreditCard,
  Edit2,
  Phone,
  Building,
  TrendingUp,
  AlertCircle
} from 'lucide-react';

export const CustomerListView: React.FC = () => {
  const { isNewCustomerModalOpen, setIsNewCustomerModalOpen, refreshKey } = useApp();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<'ALL' | 'CUSTOMER' | 'SUPPLIER'>('ALL');

  // Modal states
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null);
  const [fastModalState, setFastModalState] = useState<{ open: boolean; mode: 'COLLECTION' | 'PAYMENT'; customerId?: string }>({ open: false, mode: 'COLLECTION' });

  useEffect(() => {
    loadCustomers();
  }, [selectedType, refreshKey]);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const res = await api.getCustomers({ type: selectedType });
      if (res.success) {
        setCustomers(res.customers);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const columns: Column<Customer>[] = [
    {
      key: 'code',
      title: 'Cari Kod',
      width: '100px',
      render: c => <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{c.code}</span>,
    },
    {
      key: 'title',
      title: 'Cari Ünvan / Firma Adı',
      render: c => (
        <div>
          <div style={{ fontWeight: 600 }}>{c.title}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {c.contactName ? `${c.contactName} • ` : ''}{c.phone}
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      title: 'Cari Tipi',
      width: '110px',
      render: c => (
        <span className={`badge ${c.type === 'CUSTOMER' ? 'badge-info' : c.type === 'SUPPLIER' ? 'badge-warning' : 'badge-secondary'}`}>
          {c.type === 'CUSTOMER' ? 'Müşteri' : c.type === 'SUPPLIER' ? 'Tedarikçi' : 'Müşteri/Ted.'}
        </span>
      ),
    },
    {
      key: 'maturityDays',
      title: 'Vade (Gün)',
      numeric: true,
      width: '90px',
      render: c => <span>{c.maturityDays} Gün</span>,
    },
    {
      key: 'riskLimit',
      title: 'Risk Limiti',
      numeric: true,
      width: '130px',
      render: c => <span>{c.riskLimit.toLocaleString('tr-TR')} ₺</span>,
    },
    {
      key: 'balance',
      title: 'Güncel Bakiye',
      numeric: true,
      width: '150px',
      render: c => {
        const isDebt = c.balance > 0;
        const isCredit = c.balance < 0;
        return (
          <div>
            <span
              style={{
                fontWeight: 700,
                color: isDebt ? '#ef4444' : isCredit ? '#10b981' : 'var(--text-muted)',
              }}
            >
              {Math.abs(c.balance).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
            </span>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              {isDebt ? '(Borçlu / Alacağımız)' : isCredit ? '(Alacaklı / Borcumuz)' : '(Sıfır Bakiye)'}
            </div>
          </div>
        );
      },
    },
    {
      key: 'actions',
      title: 'İşlemler',
      sortable: false,
      width: '160px',
      render: c => (
        <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
          <button
            className="btn btn-secondary btn-sm"
            title="Cari Ekstre Aç"
            onClick={() => setStatementCustomer(c)}
          >
            <FileText size={13} color="var(--primary)" />
            <span>Ekstre</span>
          </button>
          <button
            className="btn btn-secondary btn-sm"
            title="Tahsilat Al"
            onClick={() => setFastModalState({ open: true, mode: 'COLLECTION', customerId: c.id })}
          >
            <DollarSign size={13} color="#10b981" />
          </button>
          <button
            className="btn btn-secondary btn-sm"
            title="Düzenle"
            onClick={() => setEditingCustomer(c)}
          >
            <Edit2 size={13} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="view-content-container">
      {/* Top filter tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn ${selectedType === 'ALL' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setSelectedType('ALL')}
          >
            Tüm Cariler ({customers.length})
          </button>
          <button
            className={`btn ${selectedType === 'CUSTOMER' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setSelectedType('CUSTOMER')}
          >
            Müşteriler
          </button>
          <button
            className={`btn ${selectedType === 'SUPPLIER' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setSelectedType('SUPPLIER')}
          >
            Tedarikçiler
          </button>
        </div>

        <button className="btn btn-primary" onClick={() => setIsNewCustomerModalOpen(true)}>
          <Plus size={16} />
          <span>Yeni Cari Kart Ekle</span>
        </button>
      </div>

      {/* Main DataGrid */}
      <DataGrid
        columns={columns}
        data={customers}
        loading={loading}
        searchPlaceholder="Cari ünvan, kod, vergi no veya telefon ile ara..."
        onRowClick={row => setStatementCustomer(row)}
        showTotals={true}
        totalColumns={['balance', 'riskLimit']}
      />

      {/* Modals */}
      <CustomerModal
        isOpen={isNewCustomerModalOpen || !!editingCustomer}
        onClose={() => {
          setIsNewCustomerModalOpen(false);
          setEditingCustomer(null);
        }}
        customerToEdit={editingCustomer}
      />

      <CustomerStatementModal
        isOpen={!!statementCustomer}
        onClose={() => setStatementCustomer(null)}
        customer={statementCustomer}
      />

      <CollectionPaymentModal
        isOpen={fastModalState.open}
        onClose={() => setFastModalState({ open: false, mode: 'COLLECTION' })}
        mode={fastModalState.mode}
        defaultCustomerId={fastModalState.customerId}
      />
    </div>
  );
};
