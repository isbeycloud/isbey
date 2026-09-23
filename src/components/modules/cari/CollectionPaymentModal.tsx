import React, { useState, useEffect } from 'react';
import { Modal } from '../../common/Modal';
import type { Customer, CashRegister, BankAccount } from '../../../types';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import { CustomerSelectorModal } from '../../common/CustomerSelectorModal';
import { QuickCustomerCreateModal } from '../../common/QuickCustomerCreateModal';
import { Search, Plus, Building, ShieldAlert } from 'lucide-react';

interface CollectionPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'COLLECTION' | 'PAYMENT';
  defaultCustomerId?: string;
}

export const CollectionPaymentModal: React.FC<CollectionPaymentModalProps> = ({
  isOpen,
  onClose,
  mode,
  defaultCustomerId,
}) => {
  const { showToast } = useToast();
  const { triggerRefresh } = useApp();

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [cashRegisters, setCashRegisters] = useState<CashRegister[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  const [destinationType, setDestinationType] = useState<'CASH' | 'BANK'>('CASH');
  const [cashRegisterId, setCashRegisterId] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [amount, setAmount] = useState<number | string>('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');

  const [isCustomerSelectorOpen, setIsCustomerSelectorOpen] = useState(false);
  const [isQuickCustomerOpen, setIsQuickCustomerOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadMeta();
    }
  }, [isOpen, defaultCustomerId]);

  const loadMeta = async () => {
    try {
      const [cRes, cashRes, bnkRes] = await Promise.all([
        api.getCustomers(),
        api.getCashRegisters(),
        api.getBankAccounts(),
      ]);
      if (cRes.success) {
        if (defaultCustomerId) {
          const found = cRes.customers.find(c => c.id === defaultCustomerId);
          if (found) setSelectedCustomer(found);
        }
      }
      if (cashRes.success) {
        setCashRegisters(cashRes.cashRegisters);
        if (cashRes.cashRegisters.length > 0) setCashRegisterId(cashRes.cashRegisters[0].id);
      }
      if (bnkRes.success) {
        setBankAccounts(bnkRes.bankAccounts);
        if (bnkRes.bankAccounts.length > 0) setBankAccountId(bnkRes.bankAccounts[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmt = Number(amount);
    if (!selectedCustomer) {
      showToast('Lütfen bir cari hesap seçiniz.', 'warning');
      setIsCustomerSelectorOpen(true);
      return;
    }
    if (numAmt <= 0) {
      showToast('Lütfen geçerli bir tutar giriniz.', 'warning');
      return;
    }

    try {
      if (destinationType === 'CASH') {
        const res = await api.createCashTransaction({
          cashRegisterId,
          type: mode === 'COLLECTION' ? 'COLLECTION' : 'PAYMENT',
          amount: numAmt,
          date,
          customerId: selectedCustomer.id,
          description: description || `${selectedCustomer.title} - ${mode === 'COLLECTION' ? 'Nakit Tahsilat' : 'Nakit Ödeme'}`,
        });
        if (res.success) {
          showToast(res.message, 'success');
          triggerRefresh();
          onClose();
        }
      } else {
        const res = await api.createBankTransaction({
          bankAccountId,
          type: mode === 'COLLECTION' ? 'HAVALE_EFT_IN' : 'HAVALE_EFT_OUT',
          amount: numAmt,
          date,
          customerId: selectedCustomer.id,
          description: description || `${selectedCustomer.title} - Banka ${mode === 'COLLECTION' ? 'Tahsilatı' : 'Ödemesi'}`,
        });
        if (res.success) {
          showToast(res.message, 'success');
          triggerRefresh();
          onClose();
        }
      }
    } catch (err: any) {
      showToast(err.message || 'İşlem başarısız oldu.', 'error');
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={mode === 'COLLECTION' ? '💵 Hızlı Nakit / Banka Tahsilatı (F8)' : '💳 Hızlı Cari Ödeme Yap (F9)'}
        size="medium"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              İptal
            </button>
            <button
              type="button"
              className={`btn ${mode === 'COLLECTION' ? 'btn-success' : 'btn-danger'}`}
              onClick={handleSubmit}
            >
              {mode === 'COLLECTION' ? 'Tahsilatı Kaydet' : 'Ödemeyi Kaydet'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit}>
          {/* Customer Selector Card */}
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label className="form-label required" style={{ margin: 0 }}>Cari Hesap (Müşteri / Tedarikçi)</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setIsCustomerSelectorOpen(true)}
                  style={{ fontSize: '11px', padding: '2px 8px' }}
                >
                  <Search size={12} /> Cari Seç
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setIsQuickCustomerOpen(true)}
                  style={{ fontSize: '11px', padding: '2px 8px' }}
                >
                  <Plus size={12} /> Yeni
                </button>
              </div>
            </div>

            {selectedCustomer ? (
              <div style={{ background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700 }}>{selectedCustomer.title}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Kod: {selectedCustomer.code}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Bakiye:</div>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: selectedCustomer.balance > 0 ? '#ef4444' : '#10b981' }}>
                      {selectedCustomer.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div
                onClick={() => setIsCustomerSelectorOpen(true)}
                style={{
                  border: '2px dashed var(--border-color)',
                  borderRadius: '6px',
                  padding: '12px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: 'var(--bg-surface-secondary)',
                  color: 'var(--text-muted)',
                  fontSize: '12px',
                }}
              >
                Cari hesap seçmek için tıklayın
              </div>
            )}
          </div>


        {/* Destination Type Toggle (Kasa vs Banka) */}
        <div className="form-group">
          <label className="form-label required">Ödeme Kanalı</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className={`btn ${destinationType === 'CASH' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setDestinationType('CASH')}
            >
              Nakit (Kasa)
            </button>
            <button
              type="button"
              className={`btn ${destinationType === 'BANK' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setDestinationType('BANK')}
            >
              Banka / Havale / POS
            </button>
          </div>
        </div>

        {/* Specific Cash or Bank Select */}
        {destinationType === 'CASH' ? (
          <div className="form-group">
            <label className="form-label required">İşlem Kasası</label>
            <select
              className="form-select"
              value={cashRegisterId}
              onChange={e => setCashRegisterId(e.target.value)}
            >
              {cashRegisters.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} (Mevcut: {c.balance.toLocaleString('tr-TR')} ₺)
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="form-group">
            <label className="form-label required">Banka Hesabı</label>
            <select
              className="form-select"
              value={bankAccountId}
              onChange={e => setBankAccountId(e.target.value)}
            >
              {bankAccounts.map(b => (
                <option key={b.id} value={b.id}>
                  {b.bankName} - {b.accountName} (Mevcut: {b.balance.toLocaleString('tr-TR')} ₺)
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label required">Tutar (TL)</label>
            <input
              type="number"
              step="0.01"
              className="form-input"
              required
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              style={{ fontSize: '16px', fontWeight: 'bold' }}
            />
          </div>

          <div className="form-group">
            <label className="form-label required">İşlem Tarihi</label>
            <input
              type="date"
              className="form-input"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Açıklama</label>
          <input
            type="text"
            className="form-input"
            placeholder="Örn: Fatura kapama, peşinat veya cari virman açıklaması"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>
      </form>
    </Modal>

    {/* Ortak Cari Seçim Modalları */}
    <CustomerSelectorModal
      isOpen={isCustomerSelectorOpen}
      onClose={() => setIsCustomerSelectorOpen(false)}
      onSelect={cust => setSelectedCustomer(cust)}
    />

    <QuickCustomerCreateModal
      isOpen={isQuickCustomerOpen}
      onClose={() => setIsQuickCustomerOpen(false)}
      onCustomerCreated={cust => setSelectedCustomer(cust)}
    />
  </>
  );
};

