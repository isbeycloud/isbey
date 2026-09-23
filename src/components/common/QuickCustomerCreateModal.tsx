import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import type { Customer, CustomerType } from '../../types';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { UserPlus, Save, Building, Phone, Mail, MapPin, Hash, ShieldAlert } from 'lucide-react';

interface QuickCustomerCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCustomerCreated: (customer: Customer) => void;
  initialTitle?: string;
  defaultType?: CustomerType;
}

export const QuickCustomerCreateModal: React.FC<QuickCustomerCreateModalProps> = ({
  isOpen,
  onClose,
  onCustomerCreated,
  initialTitle = '',
  defaultType = 'CUSTOMER',
}) => {
  const { showToast } = useToast();

  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState<CustomerType>(defaultType);
  const [taxNumber, setTaxNumber] = useState('');
  const [taxOffice, setTaxOffice] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('İstanbul');
  const [maturityDays, setMaturityDays] = useState<number>(30);
  const [riskLimit, setRiskLimit] = useState<number>(50000);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTitle(initialTitle);
      setType(defaultType);
      setCode('CAR-' + Date.now().toString().slice(-4));
      setTaxNumber('');
      setTaxOffice('');
      setPhone('');
      setEmail('');
      setAddress('');
      setCity('İstanbul');
      setMaturityDays(30);
      setRiskLimit(50000);
    }
  }, [isOpen, initialTitle, defaultType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      showToast('Lütfen cari ünvanını veya adını giriniz.', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        code: code.trim() || 'CAR-' + Date.now().toString().slice(-4),
        type,
        taxNumber: taxNumber.trim(),
        taxOffice: taxOffice.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        city: city.trim(),
        maturityDays: Number(maturityDays) || 30,
        riskLimit: Number(riskLimit) || 50000,
        balance: 0,
        totalDebit: 0,
        totalCredit: 0,
        active: true,
      };

      const res = await api.createCustomer(payload);
      if (res.success && res.customer) {
        showToast(`"${res.customer.title}" cari kartı oluşturuldu ve seçildi.`, 'success');
        onCustomerCreated(res.customer);
        onClose();
      }
    } catch (err: any) {
      showToast(err.message || 'Cari kart oluşturulurken hata oluştu.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="⚡ Hızlı Yeni Cari Kart Ekle"
      size="medium"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ background: 'var(--primary-light)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <UserPlus size={18} color="var(--primary)" />
          <span style={{ fontSize: '12px', color: 'var(--text-main)' }}>
            Oluşturulan cari anında seçilecek ve faturanızdaki mevcut kalemler korunacaktır.
          </span>
        </div>

        {/* Cari Tipi & Cari Kodu */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 600 }}>Cari Türü</label>
            <select
              className="form-select"
              value={type}
              onChange={e => setType(e.target.value as CustomerType)}
            >
              <option value="CUSTOMER">Müşteri (Alıcı)</option>
              <option value="SUPPLIER">Tedarikçi (Satıcı)</option>
              <option value="BOTH">Hem Müşteri Hem Tedarikçi</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Cari Kodu</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Hash size={15} color="var(--text-muted)" />
              <input
                type="text"
                className="form-input"
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="CAR-XXXX"
              />
            </div>
          </div>
        </div>

        {/* Ünvan */}
        <div className="form-group">
          <label className="form-label" style={{ fontWeight: 700 }}>
            Firma Ünvanı / Ad Soyad <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            type="text"
            className="form-input"
            placeholder="Örn: ABC Dayanıklı Tüketim Malları Ltd. Şti."
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            autoFocus
          />
        </div>

        {/* Vergi No & Vergi Dairesi */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="form-group">
            <label className="form-label">VKN / TCKN</label>
            <input
              type="text"
              className="form-input"
              value={taxNumber}
              onChange={e => setTaxNumber(e.target.value)}
              placeholder="10 veya 11 haneli"
              maxLength={11}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Vergi Dairesi</label>
            <input
              type="text"
              className="form-input"
              value={taxOffice}
              onChange={e => setTaxOffice(e.target.value)}
              placeholder="Örn: Kadıköy V.D."
            />
          </div>
        </div>

        {/* Telefon & E-posta */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="form-group">
            <label className="form-label">Telefon</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Phone size={15} color="var(--text-muted)" />
              <input
                type="tel"
                className="form-input"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="0532 XXX XX XX"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">E-Posta</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Mail size={15} color="var(--text-muted)" />
              <input
                type="email"
                className="form-input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="muhasebe@firma.com"
              />
            </div>
          </div>
        </div>

        {/* Şehir & Adres */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
          <div className="form-group">
            <label className="form-label">Şehir</label>
            <input
              type="text"
              className="form-input"
              value={city}
              onChange={e => setCity(e.target.value)}
              placeholder="İstanbul"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Açık Adres</label>
            <input
              type="text"
              className="form-input"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Mahalle, Cadde, No..."
            />
          </div>
        </div>

        {/* Vade & Risk Limiti */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="form-group">
            <label className="form-label">Ödeme Vadesi (Gün)</label>
            <input
              type="number"
              className="form-input"
              min="0"
              value={maturityDays}
              onChange={e => setMaturityDays(Number(e.target.value))}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Kredi / Risk Limiti (TL)</label>
            <input
              type="number"
              className="form-input"
              min="0"
              step="1000"
              value={riskLimit}
              onChange={e => setRiskLimit(Number(e.target.value))}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            İptal
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            <Save size={16} />
            <span>{submitting ? 'Kaydediliyor...' : 'Kaydet ve Belgeye Seç'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
