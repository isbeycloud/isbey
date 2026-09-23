import React, { useState, useEffect } from 'react';
import { Modal } from '../../common/Modal';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import type { Tenant, TenantPlan, TenantStatus, TenantModule } from '../../../types';
import { Save, RefreshCw } from 'lucide-react';

interface TenantEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: Tenant | null;
  onUpdated: (updatedTenant: Tenant) => void;
}

const ALL_MODULES: { id: TenantModule; label: string; desc: string }[] = [
  { id: 'POS', label: 'Hızlı POS Satış', desc: 'Barkodlu & görsel perakende satış kasası' },
  { id: 'STOK', label: 'Stok & Depo', desc: 'Depo transferleri, kritik stok ve envanter' },
  { id: 'CARI', label: 'Cari Hesaplar', desc: 'Müşteri, tedarikçi, risk ve bakiye takibi' },
  { id: 'FATURA', label: 'Faturalar', desc: 'Satış, alış faturaları ve e-Fatura entegrasyonu' },
  { id: 'TEKLIF_SIPARIS', label: 'Teklif & Sipariş', desc: 'Fiyat teklifleri ve müşteri siparişleri' },
  { id: 'IRSALIYE', label: 'İrsaliyeler', desc: 'Sevk ve mal kabul irsaliyesi yönetimi' },
  { id: 'BANKA', label: 'Banka Hesapları', desc: 'Banka hesap hareketleri ve POS entegrasyonu' },
  { id: 'KASA', label: 'Kasa Yönetimi', desc: 'Nakit kasa hareketleri ve gün sonu raporu' },
  { id: 'CEK_SENET', label: 'Çek / Senet', desc: 'Müşteri ve kendi çek/senet portföyü' },
  { id: 'E_FATURA', label: 'e-Dönüşüm (GİB)', desc: 'e-Fatura, e-Arşiv ve e-İrsaliye servisi' },
  { id: 'PERSONEL', label: 'Personel & Prim', desc: 'Maaş, prim ve avans takibi' },
  { id: 'RAPORLAR', label: 'Gelişmiş Raporlar', desc: 'Mizan, kâr/zarar, yaşlandırma ve nakit akışı' },
  { id: 'AI_ASISTAN', label: 'AI Muhasebe Asistanı', desc: 'Akıllı veri analizi ve otomatik asistan' },
  { id: 'FORM_DESIGNER', label: 'Form Tasarımcısı', desc: 'Sürükle-bırak fatura ve belge editörü' },
];

export const TenantEditModal: React.FC<TenantEditModalProps> = ({
  isOpen,
  onClose,
  tenant,
  onUpdated,
}) => {
  const { showToast } = useToast();
  const { triggerRefresh } = useApp();

  const [form, setForm] = useState({
    name: '',
    title: '',
    taxNumber: '',
    taxOffice: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    district: '',
    plan: 'PRO' as TenantPlan,
    status: 'ACTIVE' as TenantStatus,
    maxUsers: 10,
    maxInvoicesPerMonth: 5000,
    ownerName: '',
    ownerEmail: '',
    ownerPhone: '',
  });

  const [selectedModules, setSelectedModules] = useState<TenantModule[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (tenant && isOpen) {
      setForm({
        name: tenant.name,
        title: tenant.title,
        taxNumber: tenant.taxNumber,
        taxOffice: tenant.taxOffice,
        email: tenant.email,
        phone: tenant.phone,
        address: tenant.address || '',
        city: tenant.city || '',
        district: tenant.district || '',
        plan: tenant.plan,
        status: tenant.status,
        maxUsers: tenant.maxUsers,
        maxInvoicesPerMonth: tenant.maxInvoicesPerMonth,
        ownerName: tenant.ownerName,
        ownerEmail: tenant.ownerEmail,
        ownerPhone: tenant.ownerPhone || '',
      });
      setSelectedModules(tenant.activeModules || []);
    }
  }, [tenant, isOpen]);

  if (!tenant) return null;

  const toggleModule = (modId: TenantModule) => {
    setSelectedModules(prev =>
      prev.includes(modId) ? prev.filter(m => m !== modId) : [...prev, modId]
    );
  };

  const handleSelectAllModules = () => {
    setSelectedModules(ALL_MODULES.map(m => m.id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        activeModules: selectedModules,
      };

      const res = await api.updateTenant(tenant.id, payload);
      if (res.success && res.tenant) {
        showToast(`"${res.tenant.name}" bilgileri güncellendi.`, 'success');
        onUpdated(res.tenant);
        triggerRefresh();
        onClose();
      }
    } catch (err: any) {
      showToast(err.message || 'Güncelleme sırasında hata oluştu.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`⚙️ Kiracı Şirket Yönetimi — ${tenant.name}`}
      size="large"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Durum & Plan Seçimi */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', background: 'var(--bg-surface-secondary)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label required">Abonelik Durumu</label>
            <select
              className="form-select"
              value={form.status}
              onChange={e => setForm({ ...form, status: e.target.value as TenantStatus })}
            >
              <option value="ACTIVE">🟢 Aktif (Erişim Açık)</option>
              <option value="TRIAL">🟡 Deneme Sürecinde</option>
              <option value="SUSPENDED">🔴 Askıda (Kilitli)</option>
              <option value="EXPIRED">⚪ Süresi Dolmuş</option>
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label required">Paket Planı</label>
            <select
              className="form-select"
              value={form.plan}
              onChange={e => setForm({ ...form, plan: e.target.value as TenantPlan })}
            >
              <option value="FREE">Free Deneme</option>
              <option value="STARTER">Starter Plan</option>
              <option value="PRO">Pro Plan</option>
              <option value="ENTERPRISE">Enterprise Plan</option>
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Kullanıcı Limiti (Kota)</label>
            <input
              type="number"
              className="form-input"
              value={form.maxUsers}
              onChange={e => setForm({ ...form, maxUsers: Number(e.target.value) })}
            />
          </div>
        </div>

        {/* Firma Temel Bilgileri */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label required">Firma Kısa Adı</label>
            <input
              type="text"
              className="form-input"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label required">Vergi Numarası (VKN / TCKN)</label>
            <input
              type="text"
              className="form-input"
              value={form.taxNumber}
              onChange={e => setForm({ ...form, taxNumber: e.target.value })}
              required
            />
          </div>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label required">Resmi Fatura Ticari Unvanı</label>
          <input
            type="text"
            className="form-input"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            required
          />
        </div>

        {/* Yetkili & İletişim */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Şirket Yetkilisi</label>
            <input
              type="text"
              className="form-input"
              value={form.ownerName}
              onChange={e => setForm({ ...form, ownerName: e.target.value })}
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">E-Posta</label>
            <input
              type="email"
              className="form-input"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Telefon</label>
            <input
              type="text"
              className="form-input"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
            />
          </div>
        </div>

        {/* Modüller */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label className="form-label" style={{ fontWeight: 700, margin: 0 }}>
              Aktif ERP Modülleri ({selectedModules.length}/{ALL_MODULES.length})
            </label>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={handleSelectAllModules}
              style={{ fontSize: '10.5px', color: 'var(--primary)' }}
            >
              Tümünü Seç
            </button>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '6px',
            maxHeight: '150px',
            overflowY: 'auto',
            padding: '4px',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            background: 'var(--bg-surface-secondary)',
          }}>
            {ALL_MODULES.map(m => {
              const isChecked = selectedModules.includes(m.id);
              return (
                <div
                  key={m.id}
                  onClick={() => toggleModule(m.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 8px',
                    borderRadius: '4px',
                    background: isChecked ? 'var(--bg-surface)' : 'transparent',
                    border: isChecked ? '1px solid var(--primary-light)' : '1px solid transparent',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {}}
                    style={{ cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ fontSize: '11.5px', fontWeight: isChecked ? 700 : 500, color: isChecked ? 'var(--primary)' : 'var(--text-main)' }}>
                      {m.label}
                    </div>
                    <div style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>{m.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Butonlar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            İptal
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {submitting ? <RefreshCw size={14} className="spin" /> : <Save size={15} />}
            <span>Değişiklikleri Kaydet</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
