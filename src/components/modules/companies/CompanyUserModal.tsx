import { useAuth } from '../../../context/AuthContext';
import { FirmMembershipEditor } from '../../common/FirmMembershipEditor';
import React, { useState, useEffect } from 'react';
import { Modal } from '../../common/Modal';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { UserCheck, Shield, Key, Mail, Phone, Building, User as UserIcon } from 'lucide-react';
import type { User, UserRole, Tenant } from '../../../types';

interface CompanyUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  company: Tenant | null;
  editingUser: User | null;
}

export const CompanyUserModal: React.FC<CompanyUserModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  company,
  editingUser,
}) => {
  const { showToast } = useToast();
  const { user: actingUser } = useAuth();
  const canEditAccount = ['SUPER_ADMIN', 'ADMIN'].includes(actingUser?.role || '');

  const [form, setForm] = useState({
    username: '',
    fullName: '',
    email: '',
    phone: '',
    role: 'SATIS' as UserRole,
    department: '',
    branch: '',
    password: '123',
    sendResetLink: false,
    active: true,
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (editingUser) {
      setForm({
        username: editingUser.username,
        fullName: editingUser.fullName,
        email: editingUser.email,
        phone: editingUser.phone || '',
        role: editingUser.role,
        department: editingUser.department || '',
        branch: editingUser.branch || '',
        password: '',
        sendResetLink: false,
        active: editingUser.active,
      });
    } else {
      setForm({
        username: '',
        fullName: '',
        email: '',
        phone: '',
        role: 'SATIS',
        department: 'Satış & Pazarlama',
        branch: company?.branches?.[0]?.name || 'Merkez Şube',
        password: '123',
        sendResetLink: false,
        active: true,
      });
    }
  }, [editingUser, company, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username.trim() || !form.fullName.trim()) {
      showToast('Kullanıcı adı ve Ad Soyad zorunludur.', 'warning');
      return;
    }

    setLoading(true);
    try {
      if (editingUser) {
        const res = await api.updateUser(editingUser.id, {
          ...form,
          companyId: company?.id || editingUser.companyId,
        });
        if (res.success) {
          showToast('Kullanıcı başarıyla güncellendi.', 'success');
          onSuccess();
          onClose();
        }
      } else {
        const res = await api.createAdminUser({
          ...form,
          companyId: company?.id,
        });
        if (res.success) {
          showToast('Yeni kullanıcı başarıyla eklendi.', 'success');
          onSuccess();
          onClose();
        }
      }
    } catch (err: any) {
      showToast(err.message || 'İşlem başarısız.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const roles: { value: UserRole; label: string; desc: string }[] = [
    { value: 'COMPANY_ADMIN', label: 'Firma Yöneticisi (Admin)', desc: 'Tüm modüllere ve şirket ayarlarına tam erişim' },
    { value: 'MUHASEBE', label: 'Muhasebe Sorumlusu', desc: 'Fatura, cari, kasa, banka ve finans işlemleri' },
    { value: 'SATIS', label: 'Satış Temsilcisi / Kasiyer', desc: 'Hızlı POS, satış faturaları ve müşteri yönetimi' },
    { value: 'KASA', label: 'Kasa / Tahsilat Görevlisi', desc: 'Nakit giriş/çıkış, tahsilat ve ödeme fişleri' },
    { value: 'DEPO', label: 'Depo & Sevkiyat Sorumlusu', desc: 'Stok giriş/çıkış, irsaliye ve transferler' },
    { value: 'PERSONEL', label: 'İnsan Kaynakları & Personel', desc: 'Personel özlük, maaş ve prim takibi' },
    { value: 'RAPOR', label: 'Raporlama & Denetçi', desc: 'Sadece görüntüleme ve rapor alma yetkisi' },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingUser ? `Kullanıcı Düzenle — ${editingUser.fullName}` : `+ Yeni Firma Kullanıcısı (${company?.name || 'Genel'})`}
      size="medium"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
<fieldset disabled={!!editingUser && !canEditAccount} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
              Ad Soyad <span style={{ color: 'red' }}>*</span>
            </label>
            <input
              type="text"
              className="form-input"
              value={form.fullName}
              onChange={e => setForm({ ...form, fullName: e.target.value })}
              placeholder="Örn: Mehmet Yılmaz"
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
              Kullanıcı Adı <span style={{ color: 'red' }}>*</span>
            </label>
            <input
              type="text"
              className="form-input"
              value={form.username}
              onChange={e => setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, '') })}
              placeholder="Örn: mehmet.yilmaz"
              disabled={!!editingUser}
              required
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
              E-posta Adresi
            </label>
            <input
              type="email"
              className="form-input"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="mehmet@firma.com"
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
              Telefon / GSM
            </label>
            <input
              type="text"
              className="form-input"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              placeholder="0532 000 00 00"
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
            Kullanıcı Rolü & Yetki Düzeyi <span style={{ color: 'red' }}>*</span>
          </label>
          <select
            className="form-input"
            disabled={!!editingUser}
                value={form.role}
            onChange={e => setForm({ ...form, role: e.target.value as UserRole })}
            style={{ fontWeight: 600 }}
          >
            {roles.map(r => (
              <option key={r.value} value={r.value}>
                {r.label} — {r.desc}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
              Departman
            </label>
            <input
              type="text"
              className="form-input"
              value={form.department}
              onChange={e => setForm({ ...form, department: e.target.value })}
              placeholder="Örn: Muhasebe / Satış"
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
              Bağlı Olduğu Şube
            </label>
            <input
              type="text"
              className="form-input"
              value={form.branch}
              onChange={e => setForm({ ...form, branch: e.target.value })}
              placeholder="Merkez Şube"
            />
          </div>
        </div>

        {!editingUser && (
          <div style={{ background: 'var(--bg-surface-secondary)', padding: '12px 14px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700 }}>
              Başlangıç Şifresi:
            </label>
            <input
              type="text"
              className="form-input"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              placeholder="123"
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: 'var(--text-muted)', cursor: 'pointer', marginTop: '2px' }}>
              <input
                type="checkbox"
                checked={form.sendResetLink}
                onChange={e => setForm({ ...form, sendResetLink: e.target.checked })}
              />
              <span>Kullanıcıya tek kullanımlık şifre belirleme bağlantısı oluştur</span>
            </label>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
          <span style={{ fontSize: '12px' }}>Firma aktifliği üyelik bölümünden yönetilir.</span>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              İptal
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Kaydediliyor...' : editingUser ? 'Değişiklikleri Kaydet' : 'Kullanıcıyı Oluştur'}
            </button>
          </div>
        </div>
      </fieldset>
{editingUser && !canEditAccount && <p>Ortak hesap bilgilerini platform yöneticisi düzenleyebilir. Bu firmadaki rolleri aşağıdan yönetin.</p>}
{editingUser?.id && <FirmMembershipEditor userId={editingUser?.id!} initialTenantId={company?.id} />}
</form>
    </Modal>
  );
};
