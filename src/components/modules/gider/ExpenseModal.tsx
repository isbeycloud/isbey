import React, { useState, useEffect } from 'react';
import { Modal } from '../../common/Modal';
import type { ExpenseCategory, CashRegister, BankAccount } from '../../../types';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import { DollarSign, Plus } from 'lucide-react';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExpenseModal: React.FC<ExpenseModalProps> = ({ isOpen, onClose }) => {
  const { showToast } = useToast();
  const { triggerRefresh } = useApp();

  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [cashRegisters, setCashRegisters] = useState<CashRegister[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  const [expenseCategoryId, setExpenseCategoryId] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState<number | string>('');
  const [vatRate, setVatRate] = useState<number>(20);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK'>('CASH');
  const [cashRegisterId, setCashRegisterId] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [receiptNo, setReceiptNo] = useState('');
  const [notes, setNotes] = useState('');

  // New Category inline
  const [isNewCatOpen, setIsNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  useEffect(() => {
    if (isOpen) loadMeta();
  }, [isOpen]);

  const loadMeta = async () => {
    try {
      const [catRes, cRes, bRes] = await Promise.all([
        api.getExpenseCategories(),
        api.getCashRegisters(),
        api.getBankAccounts(),
      ]);
      if (catRes.success && catRes.categories.length > 0) {
        setCategories(catRes.categories);
        setExpenseCategoryId(catRes.categories[0].id);
      }
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
    }
  };

  const numAmt = Number(amount) || 0;
  const vatAmount = numAmt * (vatRate / 100);
  const totalAmount = numAmt + vatAmount;

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      const res = await api.createExpenseCategory({ name: newCatName.trim() });
      if (res.success) {
        setCategories([...categories, res.category]);
        setExpenseCategoryId(res.category.id);
        setNewCatName('');
        setIsNewCatOpen(false);
        showToast('Kategori eklendi.', 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Kategori eklenemedi.', 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseCategoryId || !title.trim() || numAmt <= 0) {
      showToast('Lütfen Kategori, Masraf Açıklaması ve Tutar giriniz.', 'warning');
      return;
    }

    try {
      const res = await api.createExpense({
        expenseCategoryId,
        title: title.trim(),
        amount: numAmt,
        vatRate,
        date,
        paymentMethod,
        cashRegisterId: paymentMethod === 'CASH' ? cashRegisterId : undefined,
        bankAccountId: paymentMethod === 'BANK' ? bankAccountId : undefined,
        receiptNo,
        notes,
      });

      if (res.success) {
        showToast(res.message, 'success');
        triggerRefresh();
        onClose();
      }
    } catch (err: any) {
      showToast(err.message || 'Masraf kaydı oluşturulamadı.', 'error');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Yeni Masraf & Gider Fişi Kaydet"
      size="medium"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            İptal
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit}>
            <DollarSign size={14} />
            <span>Gideri Kaydet & Kasadan/Bankadan Düş</span>
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label className="form-label required">Masraf Kategorisi</label>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '11px', padding: '2px 6px' }}
              onClick={() => setIsNewCatOpen(!isNewCatOpen)}
            >
              <Plus size={11} /> Yeni Kategori
            </button>
          </div>
          <select
            className="form-select"
            value={expenseCategoryId}
            onChange={e => setExpenseCategoryId(e.target.value)}
          >
            {categories.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {isNewCatOpen && (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Yeni kategori adı (örn: Noter & Harç)"
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
            />
            <button type="button" className="btn btn-primary btn-sm" onClick={handleAddCategory}>
              Ekle
            </button>
          </div>
        )}

        <div className="form-group">
          <label className="form-label required">Gider / Masraf Başlığı</label>
          <input
            type="text"
            className="form-input"
            required
            placeholder="Örn: 2026 Ağustos Ofis Kirası, Araç Mazot Alımı"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        </div>

        <div className="form-grid-3">
          <div className="form-group">
            <label className="form-label required">Tutar (KDV Hariç)</label>
            <input
              type="number"
              step="0.01"
              className="form-input"
              required
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              style={{ fontSize: '15px', fontWeight: 'bold' }}
            />
          </div>

          <div className="form-group">
            <label className="form-label required">KDV Oranı</label>
            <select
              className="form-select"
              value={vatRate}
              onChange={e => setVatRate(Number(e.target.value))}
            >
              <option value="0">%0 (KDV Muaf / Kira)</option>
              <option value="1">%1</option>
              <option value="10">%10</option>
              <option value="20">%20 (Standart)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Tarih</label>
            <input
              type="date"
              className="form-input"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label required">Ödeme Kaynağı</label>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <button
              type="button"
              className={`btn ${paymentMethod === 'CASH' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setPaymentMethod('CASH')}
            >
              Kasa / Nakit
            </button>
            <button
              type="button"
              className={`btn ${paymentMethod === 'BANK' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setPaymentMethod('BANK')}
            >
              Banka Havalesi / Kart
            </button>
          </div>

          {paymentMethod === 'CASH' ? (
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
          ) : (
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
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Fiş / Fatura / Dekont No</label>
          <input
            type="text"
            className="form-input"
            placeholder="Örn: FIS-94821 veya DEKONT-1029"
            value={receiptNo}
            onChange={e => setReceiptNo(e.target.value)}
          />
        </div>

        <div style={{ background: 'var(--bg-surface-secondary)', padding: '10px 14px', borderRadius: '6px', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
          <span>Ödenecek Toplam Tutar (KDV Dahil):</span>
          <strong style={{ fontSize: '16px', color: '#ef4444' }}>
            {totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
          </strong>
        </div>
      </form>
    </Modal>
  );
};
