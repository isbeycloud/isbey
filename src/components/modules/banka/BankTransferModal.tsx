import React, { useState, useEffect } from 'react';
import { Modal } from '../../common/Modal';
import type { BankAccount, CashRegister } from '../../../types';
import { api } from '../../../services/api';

import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import { Wallet } from 'lucide-react';

interface BankTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BankTransferModal: React.FC<BankTransferModalProps> = ({ isOpen, onClose }) => {
  const { showToast } = useToast();
  const { triggerRefresh } = useApp();

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [cashRegisters, setCashRegisters] = useState<CashRegister[]>([]);

  const [bankAccountId, setBankAccountId] = useState('');
  const [cashRegisterId, setCashRegisterId] = useState('');
  const [amount, setAmount] = useState<number | string>('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (isOpen) loadMeta();
  }, [isOpen]);

  const loadMeta = async () => {
    try {
      const [bRes, cRes] = await Promise.all([api.getBankAccounts(), api.getCashRegisters()]);
      if (bRes.success && bRes.bankAccounts.length > 0) {
        setBankAccounts(bRes.bankAccounts);
        setBankAccountId(bRes.bankAccounts[0].id);
      }
      if (cRes.success && cRes.cashRegisters.length > 0) {
        setCashRegisters(cRes.cashRegisters);
        setCashRegisterId(cRes.cashRegisters[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const selectedBank = bankAccounts.find(b => b.id === bankAccountId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmt = Number(amount);
    if (!bankAccountId || !cashRegisterId || numAmt <= 0) {
      showToast('Lütfen Banka, Kasa ve geçerli tutar giriniz.', 'warning');
      return;
    }

    try {
      const res = await api.transferBankToCash({
        bankAccountId,
        cashRegisterId,
        amount: numAmt,
        date,
        description,
      });

      if (res.success) {
        showToast(res.message, 'success');
        triggerRefresh();
        onClose();
      }
    } catch (err: any) {
      showToast(err.message || 'Transfer başarısız oldu.', 'error');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Bankadan Kasaya Para Çekme (Virman)"
      size="medium"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            İptal
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit}>
            <Wallet size={14} />
            <span>Kasaya Aktar</span>
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label required">Çıkış Yapılacak Banka Hesabı</label>
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

        <div className="form-group">
          <label className="form-label required">Giriş Yapılacak Kasa</label>
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

        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label required">Çekilecek Tutar (TL)</label>
            <input
              type="number"
              step="0.01"
              max={selectedBank?.balance}
              className="form-input"
              required
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              style={{ fontSize: '16px', fontWeight: 'bold' }}
            />
          </div>

          <div className="form-group">
            <label className="form-label required">Tarih</label>
            <input
              type="date"
              className="form-input"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Açıklama / Dekont Notu</label>
          <input
            type="text"
            className="form-input"
            placeholder="Örn: Bankadan nakit avans çekilmesi"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>
      </form>
    </Modal>
  );
};
