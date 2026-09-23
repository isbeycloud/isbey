import React, { useState, useEffect } from 'react';
import { DataGrid } from '../../common/DataGrid';
import type { Column } from '../../common/DataGrid';

import type { CheckNote, CheckStatus, CheckType, Customer, BankAccount } from '../../../types';
import { api } from '../../../services/api';

import { useApp } from '../../../context/AppContext';
import { useToast } from '../../../context/ToastContext';
import { Modal } from '../../common/Modal';
import { Plus, FileCheck, CheckCircle2, ArrowRight, AlertCircle, Clock } from 'lucide-react';

export const CheckNotesView: React.FC = () => {
  const { refreshKey, triggerRefresh } = useApp();
  const { showToast } = useToast();

  const [checks, setChecks] = useState<CheckNote[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'INCOMING_CHECK' | 'OUTGOING_CHECK'>('ALL');
  const [loading, setLoading] = useState(true);

  // New Check Modal
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newForm, setNewForm] = useState({
    type: 'INCOMING_CHECK' as CheckType,
    bankName: '',
    branchName: '',
    accountNo: '',
    checkNumber: '',
    drawer: '',
    amount: '',
    issueDate: new Date().toISOString().split('T')[0],
    maturityDate: '',
    customerId: '',
    description: '',
  });

  // Status Action Modal
  const [statusModalState, setStatusModalState] = useState<{ open: boolean; check: CheckNote | null; targetStatus: CheckStatus }>({
    open: false,
    check: null,
    targetStatus: 'COLLECTED',
  });
  const [actionBankId, setActionBankId] = useState('');
  const [actionEndorseCustomerId, setActionEndorseCustomerId] = useState('');

  useEffect(() => {
    loadData();
  }, [typeFilter, refreshKey]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cRes, custRes, bRes] = await Promise.all([
        api.getChecksNotes({ type: typeFilter }),
        api.getCustomers(),
        api.getBankAccounts(),
      ]);
      if (cRes.success) setChecks(cRes.checksNotes);
      if (custRes.success) setCustomers(custRes.customers);
      if (bRes.success) {
        setBankAccounts(bRes.bankAccounts);
        if (bRes.bankAccounts.length > 0) setActionBankId(bRes.bankAccounts[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmt = Number(newForm.amount);
    if (!newForm.customerId || !newForm.drawer || numAmt <= 0 || !newForm.maturityDate) {
      showToast('Lütfen Cari, Keşideci, Vade Tarihi ve Tutar alanlarını doldurunuz.', 'warning');
      return;
    }

    try {
      const res = await api.createCheckNote({ ...newForm, amount: numAmt });
      if (res.success) {
        showToast(res.message, 'success');
        triggerRefresh();
        setIsNewModalOpen(false);
      }
    } catch (err: any) {
      showToast(err.message || 'Evrak kaydedilemedi.', 'error');
    }
  };

  const handleStatusChangeSubmit = async () => {
    if (!statusModalState.check) return;
    try {
      const res = await api.updateCheckStatus(statusModalState.check.id, {
        status: statusModalState.targetStatus,
        bankAccountId: actionBankId,
        endorsedToCustomerId: actionEndorseCustomerId,
      });
      if (res.success) {
        showToast(res.message, 'success');
        triggerRefresh();
        setStatusModalState({ open: false, check: null, targetStatus: 'COLLECTED' });
      }
    } catch (err: any) {
      showToast(err.message || 'İşlem başarısız oldu.', 'error');
    }
  };

  const columns: Column<CheckNote>[] = [
    {
      key: 'documentNo',
      title: 'Evrak No',
      width: '120px',
      render: c => <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{c.documentNo}</span>,
    },
    {
      key: 'type',
      title: 'Evrak Türü',
      width: '120px',
      render: c => (
        <span className={`badge ${c.type.startsWith('INCOMING') ? 'badge-success' : 'badge-danger'}`}>
          {c.type === 'INCOMING_CHECK' ? 'Alınan Çek' : c.type === 'OUTGOING_CHECK' ? 'Verilen Çek' : 'Senet'}
        </span>
      ),
    },
    {
      key: 'maturityDate',
      title: 'Vade Tarihi',
      width: '110px',
      render: c => (
        <div>
          <div style={{ fontWeight: 600 }}>{c.maturityDate}</div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Düzenleme: {c.issueDate}</div>
        </div>
      ),
    },
    {
      key: 'customerTitle',
      title: 'İlgili Cari / Keşideci',
      render: c => (
        <div>
          <div style={{ fontWeight: 600 }}>{c.customerTitle}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Keşideci: {c.drawer}</div>
        </div>
      ),
    },
    {
      key: 'bankName',
      title: 'Banka / Çek No',
      render: c => <span>{c.bankName ? `${c.bankName} - No: ${c.checkNumber || '-'}` : '-'}</span>,
    },
    {
      key: 'amount',
      title: 'Tutar (TL)',
      numeric: true,
      width: '130px',
      render: c => (
        <span style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '13px' }}>
          {c.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
        </span>
      ),
    },
    {
      key: 'status',
      title: 'Durum',
      width: '120px',
      render: c => {
        const isPort = c.status === 'IN_PORTFOLIO';
        const isCol = c.status === 'COLLECTED' || c.status === 'PAID';
        return (
          <span className={`badge ${isPort ? 'badge-info' : isCol ? 'badge-success' : 'badge-warning'}`}>
            {c.status === 'IN_PORTFOLIO' ? 'Portföyde' : c.status === 'COLLECTED' ? 'Tahsil Edildi' : c.status === 'PAID' ? 'Ödendi' : c.status === 'ENDORSED' ? 'Ciro Edildi' : 'Karşılıksız'}
          </span>
        );
      },
    },
    {
      key: 'actions',
      title: 'İşlemler',
      sortable: false,
      width: '140px',
      render: c => (
        c.status === 'IN_PORTFOLIO' ? (
          <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
            <button
              className="btn btn-success btn-sm"
              title="Tahsil Et"
              onClick={() => setStatusModalState({ open: true, check: c, targetStatus: 'COLLECTED' })}
            >
              Tahsil
            </button>
            <button
              className="btn btn-secondary btn-sm"
              title="Ciro Et"
              onClick={() => setStatusModalState({ open: true, check: c, targetStatus: 'ENDORSED' })}
            >
              Ciro
            </button>
          </div>
        ) : <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>İşlem Kapandı</span>
      ),
    },
  ];

  return (
    <div className="view-content-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn ${typeFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setTypeFilter('ALL')}
          >
            Tüm Evraklar ({checks.length})
          </button>
          <button
            className={`btn ${typeFilter === 'INCOMING_CHECK' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setTypeFilter('INCOMING_CHECK')}
          >
            Alınan Çekler
          </button>
          <button
            className={`btn ${typeFilter === 'OUTGOING_CHECK' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setTypeFilter('OUTGOING_CHECK')}
          >
            Verilen Çekler
          </button>
        </div>

        <button className="btn btn-primary" onClick={() => setIsNewModalOpen(true)}>
          <Plus size={16} />
          <span>Yeni Çek / Senet Girişi</span>
        </button>
      </div>

      <DataGrid
        columns={columns}
        data={checks}
        searchPlaceholder="Evrak no, banka, keşideci veya cari ile ara..."
        showTotals={true}
        totalColumns={['amount']}
      />

      {/* Yeni Çek Ekleme Modalı */}
      <Modal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        title="Yeni Çek / Senet Portföy Girişi"
        size="large"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setIsNewModalOpen(false)}>
              İptal
            </button>
            <button type="button" className="btn btn-primary" onClick={handleCreateCheck}>
              Portföye Kaydet
            </button>
          </>
        }
      >
        <form onSubmit={handleCreateCheck}>
          <div className="form-grid-3">
            <div className="form-group">
              <label className="form-label required">Evrak Türü</label>
              <select
                className="form-select"
                value={newForm.type}
                onChange={e => setNewForm({ ...newForm, type: e.target.value as CheckType })}
              >
                <option value="INCOMING_CHECK">Alınan Çek (Müşteriden)</option>
                <option value="OUTGOING_CHECK">Verilen Çek (Tedarikçiye)</option>
                <option value="INCOMING_PROMISSORY">Alınan Senet</option>
                <option value="OUTGOING_PROMISSORY">Verilen Senet</option>
              </select>
            </div>

            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label required">İlgili Cari Kart</label>
              <select
                className="form-select"
                required
                value={newForm.customerId}
                onChange={e => setNewForm({ ...newForm, customerId: e.target.value })}
              >
                <option value="">-- Cari Seçiniz --</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({c.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-grid-3">
            <div className="form-group">
              <label className="form-label required">Tutar (TL)</label>
              <input
                type="number"
                step="0.01"
                className="form-input"
                required
                placeholder="0.00"
                value={newForm.amount}
                onChange={e => setNewForm({ ...newForm, amount: e.target.value })}
                style={{ fontSize: '15px', fontWeight: 'bold' }}
              />
            </div>

            <div className="form-group">
              <label className="form-label required">Vade Tarihi</label>
              <input
                type="date"
                className="form-input"
                required
                value={newForm.maturityDate}
                onChange={e => setNewForm({ ...newForm, maturityDate: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label required">Keşideci</label>
              <input
                type="text"
                className="form-input"
                required
                placeholder="Çeki yazan kişi / firma"
                value={newForm.drawer}
                onChange={e => setNewForm({ ...newForm, drawer: e.target.value })}
              />
            </div>
          </div>

          <div className="form-grid-3">
            <div className="form-group">
              <label className="form-label">Banka Adı</label>
              <input
                type="text"
                className="form-input"
                placeholder="Örn: Garanti BBVA"
                value={newForm.bankName}
                onChange={e => setNewForm({ ...newForm, bankName: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Şube Adı</label>
              <input
                type="text"
                className="form-input"
                placeholder="Örn: Kadıköy Rıhtım"
                value={newForm.branchName}
                onChange={e => setNewForm({ ...newForm, branchName: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Çek Seri No</label>
              <input
                type="text"
                className="form-input"
                placeholder="Örn: 948201"
                value={newForm.checkNumber}
                onChange={e => setNewForm({ ...newForm, checkNumber: e.target.value })}
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* Durum Değiştirme Modalı (Tahsil / Ciro) */}
      <Modal
        isOpen={statusModalState.open}
        onClose={() => setStatusModalState({ open: false, check: null, targetStatus: 'COLLECTED' })}
        title={`${statusModalState.check?.documentNo} - ${statusModalState.targetStatus === 'COLLECTED' ? 'Çeki Bankaya Tahsil Et' : 'Çeki Tedarikçiye Ciro Et'}`}
        size="medium"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setStatusModalState({ open: false, check: null, targetStatus: 'COLLECTED' })}>
              İptal
            </button>
            <button type="button" className="btn btn-primary" onClick={handleStatusChangeSubmit}>
              Onayla ve İşle
            </button>
          </>
        }
      >
        <div style={{ marginBottom: '14px', background: 'var(--bg-surface-secondary)', padding: '10px 14px', borderRadius: '6px' }}>
          <div>Evrak Tutarı: <strong>{statusModalState.check?.amount.toLocaleString('tr-TR')} ₺</strong></div>
          <div>Vade Tarihi: <strong>{statusModalState.check?.maturityDate}</strong></div>
        </div>

        {statusModalState.targetStatus === 'COLLECTED' ? (
          <div className="form-group">
            <label className="form-label required">Tahsilatın Yatacağı Banka Hesabı</label>
            <select
              className="form-select"
              value={actionBankId}
              onChange={e => setActionBankId(e.target.value)}
            >
              {bankAccounts.map(b => (
                <option key={b.id} value={b.id}>
                  {b.bankName} - {b.accountName} (Bakiye: {b.balance.toLocaleString('tr-TR')} ₺)
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="form-group">
            <label className="form-label required">Ciro Edilecek Tedarikçi / Cari</label>
            <select
              className="form-select"
              value={actionEndorseCustomerId}
              onChange={e => setActionEndorseCustomerId(e.target.value)}
            >
              <option value="">-- Tedarikçi Seçiniz --</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.code}) - Borcumuz: {Math.abs(c.balance).toLocaleString('tr-TR')} ₺
                </option>
              ))}
            </select>
          </div>
        )}
      </Modal>
    </div>
  );
};
