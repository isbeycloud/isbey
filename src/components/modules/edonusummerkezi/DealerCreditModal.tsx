import React, { useState } from 'react';
import {
  X,
  CreditCard,
  Plus,
  ArrowRightLeft,
  Gift,
  CheckCircle2,
  AlertCircle,
  Building,
  User,
  ShieldCheck,
} from 'lucide-react';
import type { DealerCustomer } from '../../../types/hizliBilisim';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';

interface DealerCreditModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: DealerCustomer[];
  selectedCustomer?: DealerCustomer | null;
  onSuccess?: () => void;
}

export const DealerCreditModal: React.FC<DealerCreditModalProps> = ({
  isOpen,
  onClose,
  customers,
  selectedCustomer,
  onSuccess,
}) => {
  const { showToast: toast } = useToast();
  const [activeMode, setActiveMode] = useState<'ADD' | 'TRANSFER'>('ADD');
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [targetCustomerId, setTargetCustomerId] = useState<string>(
    selectedCustomer?.id || (customers[0]?.id || '')
  );
  const [fromCustomerId, setFromCustomerId] = useState<string>(
    customers[0]?.id || ''
  );
  const [toCustomerId, setToCustomerId] = useState<string>(
    customers[1]?.id || (customers[0]?.id || '')
  );
  const [amount, setAmount] = useState<number>(500);
  const [type, setType] = useState<'PURCHASE' | 'GIFT'>('PURCHASE');
  const [description, setDescription] = useState('');

  if (!isOpen) return null;

  const handleAddCredits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCustomerId || amount <= 0) {
      toast('Lütfen müşteri ve geçerli bir kontör miktarı seçiniz.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.addDealerCredits({
        customerId: targetCustomerId,
        type,
        amount,
        description: description || (type === 'GIFT' ? 'Hediye Kontör Yüklemesi' : 'Kontör Satın Alma'),
      });

      if (res.success) {
        toast(`✓ ${amount} adet kontör başarıyla yüklendi!`, 'success');
        if (onSuccess) onSuccess();
        onClose();
      } else {
        toast(res.message || 'Kontör yüklenemedi.', 'error');
      }
    } catch (err: any) {
      toast(err.message || 'Kontör yükleme hatası.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransferCredits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromCustomerId || !toCustomerId || fromCustomerId === toCustomerId || amount <= 0) {
      toast('Lütfen farklı kaynak ve hedef müşteriler ile geçerli bir miktar seçiniz.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.transferDealerCredits({
        fromCustomerId,
        toCustomerId,
        amount,
        description: description || 'Bayi Portalı Müşteriler Arası Kontör Transferi',
      });

      if (res.success) {
        toast(`✓ ${amount} adet kontör başarıyla transfer edildi!`, 'success');
        if (onSuccess) onSuccess();
        onClose();
      } else {
        toast(res.message || 'Kontör transfer edilemedi.', 'error');
      }
    } catch (err: any) {
      toast(err.message || 'Transfer hatası.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const currentSelectedCust = customers.find((c) => c.id === targetCustomerId);
  const fromCust = customers.find((c) => c.id === fromCustomerId);
  const toCust = customers.find((c) => c.id === toCustomerId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl flex flex-col overflow-hidden text-slate-800">
        
        {/* HEADER */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <CreditCard size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Kontör Yükleme & Transfer İşlemleri
              </h3>
              <p className="text-xs text-slate-400">
                HBT e-Belge ve e-Defter kontör bakiye yönetimi
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>

        {/* MODE SWITCHER */}
        <div className="flex border-b border-slate-200 bg-slate-50 p-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveMode('ADD')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              activeMode === 'ADD'
                ? 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Plus size={14} /> Kontör Yükle / Hediye Et
          </button>
          <button
            type="button"
            onClick={() => setActiveMode('TRANSFER')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              activeMode === 'TRANSFER'
                ? 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ArrowRightLeft size={14} /> Firmalar Arası Transfer
          </button>
        </div>

        {/* BODY */}
        <div className="p-6 space-y-5">
          {activeMode === 'ADD' ? (
            <form onSubmit={handleAddCredits} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Müşteri / Firma Seçiniz *
                </label>
                <select
                  value={targetCustomerId}
                  onChange={(e) => setTargetCustomerId(e.target.value)}
                  className="w-full text-xs font-medium bg-white border border-slate-300 rounded-lg p-2.5"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      [{c.taxNumber}] {c.title || c.companyName} (Bakiye: {c.credits?.remaining || 0})
                    </option>
                  ))}
                </select>
                {currentSelectedCust && (
                  <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <span>Mevcut Bakiye: <strong className="text-slate-800 font-mono">{currentSelectedCust.credits?.remaining || 0}</strong></span>
                    <span>İşlem Sonrası: <strong className="text-emerald-700 font-mono">{(currentSelectedCust.credits?.remaining || 0) + (Number(amount) || 0)}</strong></span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    İşlem Türü *
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="w-full text-xs font-medium bg-white border border-slate-300 rounded-lg p-2.5"
                  >
                    <option value="PURCHASE">Kontör Satın Alma</option>
                    <option value="GIFT">Hediye / Promosyon</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kontör Miktarı (Adet) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value) || 0)}
                    className="w-full text-xs font-bold font-mono text-right bg-white border border-slate-300 rounded-lg p-2.5"
                  />
                </div>
              </div>

              {/* Hızlı Butonlar */}
              <div className="flex gap-2">
                {[100, 500, 1000, 2500, 5000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setAmount(amt)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                      amount === amt
                        ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    +{amt}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Açıklama / Referans
                </label>
                <input
                  type="text"
                  placeholder="Örn: Fatura No: 2026-0043 Tahsilat karşılığı"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20"
                >
                  {submitting ? 'Yükleniyor...' : 'Kontörü Hesaba Yükle'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleTransferCredits} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kaynak Firma (Kontör Düşülecek) *
                </label>
                <select
                  value={fromCustomerId}
                  onChange={(e) => setFromCustomerId(e.target.value)}
                  className="w-full text-xs font-medium bg-white border border-slate-300 rounded-lg p-2.5"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      [{c.taxNumber}] {c.title || c.companyName} (Bakiye: {c.credits?.remaining || 0})
                    </option>
                  ))}
                </select>
                {fromCust && (
                  <p className="mt-1 text-xs text-amber-700 font-semibold">
                    Kaynak bakiye: {fromCust.credits?.remaining || 0} adet
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Hedef Firma (Kontör Eklenecek) *
                </label>
                <select
                  value={toCustomerId}
                  onChange={(e) => setToCustomerId(e.target.value)}
                  className="w-full text-xs font-medium bg-white border border-slate-300 rounded-lg p-2.5"
                >
                  {customers
                    .filter((c) => c.id !== fromCustomerId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        [{c.taxNumber}] {c.title || c.companyName} (Bakiye: {c.credits?.remaining || 0})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Transfer Miktarı *
                </label>
                <input
                  type="number"
                  min={1}
                  max={fromCust?.credits?.remaining || 100000}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value) || 0)}
                  className="w-full text-xs font-bold font-mono text-right bg-white border border-slate-300 rounded-lg p-2.5"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Transfer Nedeni
                </label>
                <input
                  type="text"
                  placeholder="Grup şirketleri arası devir vb."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20"
                >
                  {submitting ? 'Transfer Ediliyor...' : 'Transferi Gerçekleştir'}
                </button>
              </div>
            </form>
          )}
        </div>

      </div>
    </div>
  );
};
