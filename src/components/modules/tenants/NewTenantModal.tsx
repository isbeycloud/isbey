import React, { useState } from 'react';
import { Modal } from '../../common/Modal';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import type { Tenant, TenantPlan, TenantModule } from '../../../types';
import { Building, Plus } from 'lucide-react';

interface NewTenantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (tenant: Tenant) => void;
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
  { id: 'PERSONEL', label: 'Personel & Prim', desc: 'Personel özlük, maaş ve prim takibi' },
  { id: 'RAPORLAR', label: 'Raporlar', desc: 'Gelişmiş finansal analiz ve grafikler' },
  { id: 'AI_ASISTAN', label: 'AI Asistanı', desc: 'Akıllı veri analizi ve otomatik tahmin' },
];

export const NewTenantModal: React.FC<NewTenantModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const { showToast } = useToast();
  const { triggerRefresh } = useApp();
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: '',
    title: '',
    taxNumber: '',
    taxOffice: 'Kadıköy',
    ownerName: '',
    ownerEmail: '',
    ownerPhone: '',
    initialCredits: 500,
    city: 'İstanbul',
    address: '',
    plan: 'PRO' as TenantPlan,
  });

  const [selectedModules, setSelectedModules] = useState<TenantModule[]>([
    'POS', 'STOK', 'CARI', 'FATURA', 'TEKLIF_SIPARIS', 'IRSALIYE', 'BANKA', 'KASA', 'E_FATURA', 'RAPORLAR'
  ]);

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
    if (!form.name.trim() || !form.taxNumber.trim() || !form.ownerName.trim()) {
      showToast('Lütfen Şirket Adı, Vergi No ve Yetkili Adını eksiksiz giriniz.', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...form,
        email: form.ownerEmail || 'info@firma.com',
        phone: form.ownerPhone || '0532 000 00 00',
        eInvoiceCredits: form.initialCredits,
        modules: selectedModules,
      };

      const res = await api.createTenant(payload);
      if (res.success && res.tenant) {
        showToast(`"${res.tenant.name}" şirketi başarıyla oluşturuldu ve çalışma ortamı hazırlandı.`, 'success');
        onCreated(res.tenant);
        triggerRefresh();
        onClose();
      }
    } catch (err: any) {
      showToast(err.message || 'Şirket oluşturulamadı.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="🏢 Yeni Kiracı / Şirket Başlatma Sihirbazı"
      size="large"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label required">Firma Kısa Adı</label>
            <input
              type="text"
              className="form-input"
              placeholder="Örn: ABC Lojistik"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label required">Resmi Ticari Unvan</label>
            <input
              type="text"
              className="form-input"
              placeholder="Örn: ABC Lojistik ve Ticaret A.Ş."
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label required">Vergi No (VKN)</label>
            <input
              type="text"
              className="form-input"
              placeholder="10 Haneli VKN"
              value={form.taxNumber}
              onChange={e => setForm({ ...form, taxNumber: e.target.value })}
              required
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Vergi Dairesi</label>
            <input
              type="text"
              className="form-input"
              placeholder="Örn: Kadıköy"
              value={form.taxOffice}
              onChange={e => setForm({ ...form, taxOffice: e.target.value })}
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Abonelik Paketi</label>
            <select
              className="form-input"
              value={form.plan}
              onChange={e => setForm({ ...form, plan: e.target.value as TenantPlan })}
            >
              <option value="STARTER">Starter</option>
              <option value="PRO">Pro</option>
              <option value="ENTERPRISE">Enterprise</option>
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Başlangıç e-Kontörü</label>
            <input
              type="number"
              className="form-input"
              value={form.initialCredits}
              onChange={e => setForm({ ...form, initialCredits: Number(e.target.value) })}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label required">Şirket Yetkilisi</label>
            <input
              type="text"
              className="form-input"
              placeholder="Ad Soyad"
              value={form.ownerName}
              onChange={e => setForm({ ...form, ownerName: e.target.value })}
              required
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Yetkili E-Posta</label>
            <input
              type="email"
              className="form-input"
              placeholder="yetkili@firma.com"
              value={form.ownerEmail}
              onChange={e => setForm({ ...form, ownerEmail: e.target.value })}
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Yetkili Telefon</label>
            <input
              type="text"
              className="form-input"
              placeholder="0532 000 00 00"
              value={form.ownerPhone}
              onChange={e => setForm({ ...form, ownerPhone: e.target.value })}
            />
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label className="form-label" style={{ fontWeight: 700, margin: 0 }}>
              Bu Kiracı İçin Aktif Edilecek Modüller ({selectedModules.length}/{ALL_MODULES.length})
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
            maxHeight: '160px',
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
                    transition: 'all 0.1s ease',
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

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            İptal
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={15} />
            <span>{submitting ? 'Kuruluyor...' : 'Kiracı Şirketi Başlat & Kur'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
