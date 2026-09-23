import React, { useState, useEffect } from 'react';
import { Modal } from '../../common/Modal';
import type { CashRegister, BankAccount } from '../../../types';
import { api } from '../../../services/api';

import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import { Landmark } from 'lucide-react';

interface CashTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CashTransferModal: React.FC<CashTransferModalProps> = ({ isOpen, onClose }) => {
  const { showToast } = useToast();
  const { triggerRefresh } = useApp();

  const [cashRegisters, setCashRegisters] = useState<CashRegister[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  const [cashRegisterId, setCashRegisterId] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [amount, setAmount] = useState<number | string>('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (isOpen) loadMeta();
  }, [isOpen]);

  const loadMeta = async () => {
    try {
      const [cRes, bRes] = await Promise.all([api.getCashRegisters(), api.getBankAccounts()]);
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

  const selectedCash = cashRegisters.find(c => c.id === cashRegisterId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmt = Number(amount);
    if (!cashRegisterId || !bankAccountId || numAmt <= 0) {
      showToast('Lütfen Kasa, Banka ve geçerli tutar giriniz.', 'warning');
      return;
    }

    try {
      const res = await api.transferCashToBank({
        cashRegisterId,
        bankAccountId,
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
      title="Kasadan Bankaya Para Yatırma (Virman)"
      size="medium"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            İptal
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit}>
            <Landmark size={14} />
            <span>Bankaya Yatır</span>
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label required">Çıkış Yapılacak Kasa</label>
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

        <div className="form-group">
          <label className="form-label required">Giriş Yapılacak Banka Hesabı</label>
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

        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label required">Yatırılacak Tutar (TL)</label>
            <input
              type="number"
              step="0.01"
              max={selectedCash?.balance}
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
          <label className="form-label">Açıklama / Dekont No</label>
          <input
            type="text"
            className="form-input"
            placeholder="Örn: Gün sonu hasılatının bankaya yatırılması"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>
      </form>
    </Modal>
  );
};
