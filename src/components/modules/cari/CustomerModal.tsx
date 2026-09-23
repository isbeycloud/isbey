import React, { useState, useEffect } from 'react';
import { Modal } from '../../common/Modal';
import type { Customer, CustomerType } from '../../../types';
import { api } from '../../../services/api';

import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';

interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerToEdit?: Customer | null;
}

export const CustomerModal: React.FC<CustomerModalProps> = ({ isOpen, onClose, customerToEdit }) => {
  const { showToast } = useToast();
  const { triggerRefresh } = useApp();

  const [formData, setFormData] = useState({
    title: '',
    contactName: '',
    type: 'CUSTOMER' as CustomerType,
    taxNumber: '',
    taxOffice: '',
    phone: '',
    email: '',
    address: '',
    city: 'İstanbul',
    district: '',
    iban: '',
    riskLimit: 100000,
    maturityDays: 30,
    notes: '',
  });

  useEffect(() => {
    if (customerToEdit) {
      setFormData({
        title: customerToEdit.title,
        contactName: customerToEdit.contactName || '',
        type: customerToEdit.type,
        taxNumber: customerToEdit.taxNumber || '',
        taxOffice: customerToEdit.taxOffice || '',
        phone: customerToEdit.phone || '',
        email: customerToEdit.email || '',
        address: customerToEdit.address || '',
        city: customerToEdit.city || 'İstanbul',
        district: customerToEdit.district || '',
        iban: customerToEdit.iban || '',
        riskLimit: customerToEdit.riskLimit || 100000,
        maturityDays: customerToEdit.maturityDays || 30,
        notes: customerToEdit.notes || '',
      });
    } else {
      setFormData({
        title: '',
        contactName: '',
        type: 'CUSTOMER',
        taxNumber: '',
        taxOffice: '',
        phone: '',
        email: '',
        address: '',
        city: 'İstanbul',
        district: '',
        iban: '',
        riskLimit: 100000,
        maturityDays: 30,
        notes: '',
      });
    }
  }, [customerToEdit, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.phone.trim()) {
      showToast('Lütfen Ünvan ve Telefon alanlarını doldurunuz.', 'warning');
      return;
    }

    try {
      if (customerToEdit) {
        const res = await api.updateCustomer(customerToEdit.id, formData);
        if (res.success) {
          showToast(res.message, 'success');
          triggerRefresh();
          onClose();
        }
      } else {
        const res = await api.createCustomer(formData);
        if (res.success) {
          showToast(res.message, 'success');
          triggerRefresh();
          onClose();
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Cari kart kaydedilemedi.', 'error');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={customerToEdit ? `Cari Düzenle: ${customerToEdit.title}` : 'Yeni Cari Kart Oluştur'}
      size="large"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            İptal
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit}>
            {customerToEdit ? 'Güncelle' : 'Kaydet'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="form-grid-3">
          <div className="form-group" style={{ gridColumn: 'span 2' }}>
            <label className="form-label required">Cari Ünvan / Firma Adı</label>
            <input
              type="text"
              className="form-input"
              required
              placeholder="Örn: ABC Ticaret San. A.Ş."
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label required">Cari Tipi</label>
            <select
              className="form-select"
              value={formData.type}
              onChange={e => setFormData({ ...formData, type: e.target.value as CustomerType })}
            >
              <option value="CUSTOMER">Müşteri (Alıcı)</option>
              <option value="SUPPLIER">Tedarikçi (Satıcı)</option>
              <option value="BOTH">Hem Müşteri Hem Tedarikçi</option>
            </select>
          </div>
        </div>

        <div className="form-grid-3">
          <div className="form-group">
            <label className="form-label required">Telefon</label>
            <input
              type="text"
              className="form-input"
              required
              placeholder="Örn: 0212 555 01 23"
              value={formData.phone}
              onChange={e => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Yetkili Kişi</label>
            <input
              type="text"
              className="form-input"
              placeholder="Örn: Ahmet Yılmaz"
              value={formData.contactName}
              onChange={e => setFormData({ ...formData, contactName: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">E-Posta</label>
            <input
              type="email"
              className="form-input"
              placeholder="muhasebe@firma.com"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
        </div>

        <div className="form-grid-3">
          <div className="form-group">
            <label className="form-label">Vergi Dairesi</label>
            <input
              type="text"
              className="form-input"
              placeholder="Örn: Kadıköy"
              value={formData.taxOffice}
              onChange={e => setFormData({ ...formData, taxOffice: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Vergi / TCKN No</label>
            <input
              type="text"
              className="form-input"
              placeholder="10 veya 11 haneli numara"
              value={formData.taxNumber}
              onChange={e => setFormData({ ...formData, taxNumber: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">IBAN Numarası</label>
            <input
              type="text"
              className="form-input"
              placeholder="TR00 0000 0000 0000 0000 0000 00"
              value={formData.iban}
              onChange={e => setFormData({ ...formData, iban: e.target.value })}
            />
          </div>
        </div>

        <div className="form-grid-3">
          <div className="form-group">
            <label className="form-label">Risk Limiti (TL)</label>
            <input
              type="number"
              className="form-input"
              value={formData.riskLimit}
              onChange={e => setFormData({ ...formData, riskLimit: Number(e.target.value) })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Standart Vade Günü</label>
            <input
              type="number"
              className="form-input"
              value={formData.maturityDays}
              onChange={e => setFormData({ ...formData, maturityDays: Number(e.target.value) })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Şehir / İlçe</label>
            <input
              type="text"
              className="form-input"
              placeholder="İstanbul / Kadıköy"
              value={formData.city}
              onChange={e => setFormData({ ...formData, city: e.target.value })}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Açık Adres</label>
          <textarea
            className="form-textarea"
            rows={2}
            placeholder="Cadde, sokak, bina ve kapı no"
            value={formData.address}
            onChange={e => setFormData({ ...formData, address: e.target.value })}
          />
        </div>
      </form>
    </Modal>
  );
};
