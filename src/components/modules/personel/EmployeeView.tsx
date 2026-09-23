import React, { useState, useEffect } from 'react';
import { DataGrid } from '../../common/DataGrid';
import type { Column } from '../../common/DataGrid';

import type { Employee, CashRegister, BankAccount } from '../../../types';
import { api } from '../../../services/api';

import { useApp } from '../../../context/AppContext';
import { useToast } from '../../../context/ToastContext';
import { Modal } from '../../common/Modal';
import { Plus, UserCheck, DollarSign, CreditCard, Award, User } from 'lucide-react';

export const EmployeeView: React.FC = () => {
  const { refreshKey, triggerRefresh } = useApp();
  const { showToast } = useToast();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [cashRegisters, setCashRegisters] = useState<CashRegister[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);

  // New Employee Modal
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newForm, setNewForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    department: 'Satış & Pazarlama',
    title: 'Satış Temsilcisi',
    salary: 30000,
    commissionRate: 2.0,
  });

  // Pay Modal
  const [payModalState, setPayModalState] = useState<{ open: boolean; employee: Employee | null }>({ open: false, employee: null });
  const [payType, setPayType] = useState<'SALARY' | 'ADVANCE' | 'COMMISSION'>('SALARY');
  const [payAmount, setPayAmount] = useState<number | string>('');
  const [payChannel, setPayChannel] = useState<'CASH' | 'BANK'>('BANK');
  const [cashRegisterId, setCashRegisterId] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [payNotes, setPayNotes] = useState('');

  useEffect(() => {
    loadData();
  }, [refreshKey]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [eRes, cRes, bRes] = await Promise.all([
        api.getEmployees(),
        api.getCashRegisters(),
        api.getBankAccounts(),
      ]);
      if (eRes.success) setEmployees(eRes.employees);
      if (cRes.success && cRes.cashRegisters.length > 0) {
        setCashRegisters(cRes.cashRegisters);
        setCashRegisterId(cRes.cashRegisters[0].id);
      }
      if (bRes.success && bRes.bankAccounts.length > 0) {
        setBankAccounts(bRes.bankAccounts);
        setBankAccountId(bRes.bankAccounts[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForm.fullName.trim() || !newForm.phone.trim()) {
      showToast('Lütfen İsim ve Telefon alanlarını doldurunuz.', 'warning');
      return;
    }

    try {
      const res = await api.createEmployee(newForm);
      if (res.success) {
        showToast(res.message, 'success');
        triggerRefresh();
        setIsNewModalOpen(false);
      }
    } catch (err: any) {
      showToast(err.message || 'Personel kaydedilemedi.', 'error');
    }
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModalState.employee) return;
    const amt = Number(payAmount);
    if (amt <= 0) {
      showToast('Lütfen geçerli bir tutar giriniz.', 'warning');
      return;
    }

    try {
      const res = await api.payEmployee(payModalState.employee.id, {
        type: payType,
        amount: amt,
        cashRegisterId: payChannel === 'CASH' ? cashRegisterId : undefined,
        bankAccountId: payChannel === 'BANK' ? bankAccountId : undefined,
        description: payNotes,
      });

      if (res.success) {
        showToast(res.message, 'success');
        triggerRefresh();
        setPayModalState({ open: false, employee: null });
      }
    } catch (err: any) {
      showToast(err.message || 'Ödeme yapılamadı.', 'error');
    }
  };

  const columns: Column<Employee>[] = [
    {
      key: 'code',
      title: 'Personel Kod',
      width: '110px',
      render: e => <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{e.code}</span>,
    },
    {
      key: 'fullName',
      title: 'Adı Soyadı',
      render: e => (
        <div>
          <div style={{ fontWeight: 600 }}>{e.fullName}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{e.phone}</div>
        </div>
      ),
    },
    {
      key: 'department',
      title: 'Departman & Unvan',
      render: e => (
        <div>
          <div style={{ fontWeight: 500 }}>{e.department}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{e.title}</div>
        </div>
      ),
    },
    {
      key: 'salary',
      title: 'Maaş',
      numeric: true,
      width: '120px',
      render: e => <span>{e.salary.toLocaleString('tr-TR')} ₺</span>,
    },
    {
      key: 'commissionRate',
      title: 'Prim %',
      numeric: true,
      width: '80px',
      render: e => <span>%{e.commissionRate}</span>,
    },
    {
      key: 'totalSales',
      title: 'Toplam Satış',
      numeric: true,
      width: '130px',
      render: e => <span style={{ fontWeight: 600 }}>{e.totalSales.toLocaleString('tr-TR')} ₺</span>,
    },
    {
      key: 'balance',
      title: 'Hak Edilen Kalan',
      numeric: true,
      width: '130px',
      render: e => (
        <span style={{ fontWeight: 700, color: e.balance > 0 ? '#10b981' : 'var(--text-muted)' }}>
          {e.balance.toLocaleString('tr-TR')} ₺
        </span>
      ),
    },
    {
      key: 'actions',
      title: 'İşlemler',
      sortable: false,
      width: '120px',
      render: e => (
        <button
          className="btn btn-primary btn-sm"
          onClick={() => {
            setPayModalState({ open: true, employee: e });
            setPayAmount(e.balance > 0 ? e.balance : e.salary);
          }}
        >
          <DollarSign size={13} />
          <span>Ödeme Yap</span>
        </button>
      ),
    },
  ];

  return (
    <div className="view-content-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 700 }}>Personel ve Prim Yönetimi</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Maaş, avans, satış primi ve personel tahsilat takibi</p>
        </div>

        <button className="btn btn-primary" onClick={() => setIsNewModalOpen(true)}>
          <Plus size={16} />
          <span>Yeni Personel Ekle</span>
        </button>
      </div>

      <DataGrid
        columns={columns}
        data={employees}
        searchPlaceholder="Personel adı, unvan veya departman ile ara..."
        showTotals={true}
        totalColumns={['salary', 'totalSales', 'balance']}
      />

      {/* Yeni Personel Modalı */}
      <Modal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        title="Yeni Personel Kartı Oluştur"
        size="large"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setIsNewModalOpen(false)}>
              İptal
            </button>
            <button type="button" className="btn btn-primary" onClick={handleCreateEmployee}>
              Kaydet
            </button>
          </>
        }
      >
        <form onSubmit={handleCreateEmployee}>
          <div className="form-grid-3">
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label required">Personel Adı Soyadı</label>
              <input
                type="text"
                className="form-input"
                required
                placeholder="Örn: Ahmet Çelik"
                value={newForm.fullName}
                onChange={e => setNewForm({ ...newForm, fullName: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label required">Telefon</label>
              <input
                type="text"
                className="form-input"
                required
                placeholder="05XX XXX XX XX"
                value={newForm.phone}
                onChange={e => setNewForm({ ...newForm, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="form-grid-3">
            <div className="form-group">
              <label className="form-label">Departman</label>
              <select
                className="form-select"
                value={newForm.department}
                onChange={e => setNewForm({ ...newForm, department: e.target.value })}
              >
                <option value="Satış & Pazarlama">Satış & Pazarlama</option>
                <option value="Muhasebe & Finans">Muhasebe & Finans</option>
                <option value="Depo & Lojistik">Depo & Lojistik</option>
                <option value="Teknik Servis">Teknik Servis</option>
                <option value="Yönetim">Yönetim</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Unvan</label>
              <input
                type="text"
                className="form-input"
                placeholder="Örn: Kıdemli Satış Uzmanı"
                value={newForm.title}
                onChange={e => setNewForm({ ...newForm, title: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Aylık Maaş (TL)</label>
              <input
                type="number"
                className="form-input"
                value={newForm.salary}
                onChange={e => setNewForm({ ...newForm, salary: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Satış Prim Oranı (%)</label>
              <input
                type="number"
                step="0.1"
                className="form-input"
                value={newForm.commissionRate}
                onChange={e => setNewForm({ ...newForm, commissionRate: Number(e.target.value) })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">E-Posta</label>
              <input
                type="email"
                className="form-input"
                placeholder="personel@firma.com"
                value={newForm.email}
                onChange={e => setNewForm({ ...newForm, email: e.target.value })}
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* Maaş / Avans / Prim Ödeme Modalı */}
      <Modal
        isOpen={payModalState.open}
        onClose={() => setPayModalState({ open: false, employee: null })}
        title={`Ödeme Yap: ${payModalState.employee?.fullName}`}
        size="medium"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setPayModalState({ open: false, employee: null })}>
              İptal
            </button>
            <button type="button" className="btn btn-success" onClick={handlePaySubmit}>
              Ödemeyi Onayla
            </button>
          </>
        }
      >
        <form onSubmit={handlePaySubmit}>
          <div className="form-group">
            <label className="form-label required">Ödeme Türü</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
              <button
                type="button"
                className={`btn ${payType === 'SALARY' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                onClick={() => setPayType('SALARY')}
              >
                Maaş Ödemesi
              </button>
              <button
                type="button"
                className={`btn ${payType === 'ADVANCE' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                onClick={() => setPayType('ADVANCE')}
              >
                Avans
              </button>
              <button
                type="button"
                className={`btn ${payType === 'COMMISSION' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                onClick={() => setPayType('COMMISSION')}
              >
                Satış Primi
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label required">Ödeme Kanalı</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className={`btn ${payChannel === 'BANK' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setPayChannel('BANK')}
              >
                Banka Havalesi
              </button>
              <button
                type="button"
                className={`btn ${payChannel === 'CASH' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setPayChannel('CASH')}
              >
                Kasa / Nakit
              </button>
            </div>
          </div>

          {payChannel === 'BANK' ? (
            <div className="form-group">
              <label className="form-label required">Banka Hesabı</label>
              <select
                className="form-select"
                value={bankAccountId}
                onChange={e => setBankAccountId(e.target.value)}
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
              <label className="form-label required">Kasa</label>
              <select
                className="form-select"
                value={cashRegisterId}
                onChange={e => setCashRegisterId(e.target.value)}
              >
                {cashRegisters.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} (Bakiye: {c.balance.toLocaleString('tr-TR')} ₺)
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label className="form-label required">Ödenecek Tutar (TL)</label>
            <input
              type="number"
              step="0.01"
              className="form-input"
              required
              placeholder="0.00"
              value={payAmount}
              onChange={e => setPayAmount(e.target.value)}
              style={{ fontSize: '16px', fontWeight: 'bold' }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Açıklama</label>
            <input
              type="text"
              className="form-input"
              placeholder="Örn: 2026 Ağustos ayı maaş transferi"
              value={payNotes}
              onChange={e => setPayNotes(e.target.value)}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
};
