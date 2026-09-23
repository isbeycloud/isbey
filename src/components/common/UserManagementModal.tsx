import { useAuth } from '../../context/AuthContext';
import { FirmMembershipEditor } from './FirmMembershipEditor';
import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import type { User, UserRole } from '../../types';
import { Users, UserPlus, Shield, Check, Trash2, Key, Edit2, ShieldAlert, Lock, CheckCircle2 } from 'lucide-react';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ROLE_DEFINITIONS: Record<UserRole, { label: string; desc: string; color: string }> = {
  SUPER_ADMIN: { label: 'Sistem Yöneticisi (Full)', desc: 'Tüm modüllere, ayarlara ve silme işlemlerine tam erişim', color: '#dc2626' },
  ADMIN: { label: 'Şirket Yöneticisi', desc: 'Genel yönetim, fatura, cari, kasa ve raporlama', color: '#ea580c' },
  COMPANY_ADMIN: { label: 'Firma Yöneticisi', desc: 'Firma genel yönetimi ve ayarları', color: '#7c3aed' },
  MUHASEBE: { label: 'Muhasebe Uzmanı', desc: 'Faturalar, çek/senet, banka, e-fatura ve resmi defterler', color: '#0284c7' },
  SATIS: { label: 'Satış Temsilcisi / Kasiyer', desc: 'Hızlı POS, satış faturaları, teklif ve tahsilat', color: '#16a34a' },
  KASA: { label: 'Kasa / Vezne Sorumlusu', desc: 'Kasa hareketleri, nakit tahsilat ve ödemeler', color: '#ca8a04' },
  DEPO: { label: 'Depo & Sevkiyat Görevlisi', desc: 'Stok sayımı, transferler, sevk irsaliyeleri', color: '#8b5cf6' },
  PERSONEL: { label: 'Personel & İK Sorumlusu', desc: 'Personel özlük, maaş ve prim takibi', color: '#ec4899' },
  SAHA: { label: 'Saha Satış Elemanı', desc: 'Mobil sipariş, cari tahsilat ve teklif hazırlama', color: '#06b6d4' },
  RAPOR: { label: 'Rapor / Denetmen (Salt Okunur)', desc: 'Yalnızca rapor ve analizleri görüntüleme yetkisi', color: '#64748b' },
};

export const UserManagementModal: React.FC<UserManagementModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { showToast } = useToast();
  const { user: actingUser } = useAuth();
  const canEditAccount = ['SUPER_ADMIN', 'ADMIN'].includes(actingUser?.role || '');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'LIST' | 'FORM'>('LIST');

  // Form State
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [form, setForm] = useState({
    username: '',
    fullName: '',
    email: '',
    phone: '',
    role: 'SATIS' as UserRole,
    password: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadUsers();
      setActiveTab('LIST');
    }
  }, [isOpen]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await api.getUsers();
      if (res.success) {
        setUsers(res.users);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenNew = () => {
    setEditingUserId(null);
    setForm({
      username: '',
      fullName: '',
      email: '',
      phone: '',
      role: 'SATIS',
      password: '',
    });
    setActiveTab('FORM');
  };

  const handleOpenEdit = (u: User) => {
    setEditingUserId(u.id);
    setForm({
      username: u.username,
      fullName: u.fullName,
      email: u.email,
      phone: u.phone || '',
      role: u.role,
      password: '',
    });
    setActiveTab('FORM');
  };

  const handleDeleteUser = async (id: string, name: string) => {
    if (id === 'u-admin') {
      showToast('Ana yönetici hesabı silinemez!', 'warning');
      return;
    }
    if (!window.confirm(`"${name}" kullanıcısının aktif firma üyeliğini kaldırmak istediğinize emin misiniz?`)) return;

    try {
      const res = await api.deleteUser(id);
      if (res.success) {
        showToast('Kullanıcı silindi.', 'success');
        loadUsers();
      }
    } catch (err: any) {
      showToast(err.message || 'Silme işlemi başarısız.', 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username.trim() || !form.fullName.trim()) {
      showToast('Kullanıcı adı ve tam ad zorunludur.', 'warning');
      return;
    }
    if (!editingUserId && !form.password) {
      showToast('Yeni kullanıcı için şifre belirleyin.', 'warning');
      return;
    }

    setSaving(true);
    try {
      if (editingUserId) {
        const res = await api.updateUser(editingUserId, form);
        if (res.success) {
          showToast('Kullanıcı ve yetkileri güncellendi.', 'success');
          loadUsers();
          setActiveTab('LIST');
        }
      } else {
        const res = await api.createUser(form);
        if (res.success) {
          showToast('Yeni kullanıcı başarıyla oluşturuldu ve yetkilendirildi.', 'success');
          loadUsers();
          setActiveTab('LIST');
        }
      }
    } catch (err: any) {
      showToast(err.message || 'İşlem başarısız.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="👥 Kullanıcı Ekleme & Rol Bazlı Yetkilendirme (RBAC)"
      size="large"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Üst Sekmeler */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className={`btn btn-sm ${activeTab === 'LIST' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('LIST')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Users size={14} />
              <span>Kullanıcı Listesi ({users.length})</span>
            </button>
            <button
              type="button"
              className={`btn btn-sm ${activeTab === 'FORM' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={handleOpenNew}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <UserPlus size={14} />
              <span>+ Yeni Kullanıcı & Yetki Tanımla</span>
            </button>
          </div>
        </div>

        {/* 1. KULLANICI LİSTESİ */}
        {activeTab === 'LIST' && (
          <div style={{ maxHeight: '380px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead style={{ background: 'var(--bg-surface-secondary)', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0 }}>
                <tr>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Kullanıcı</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Rol & Yetki</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>İletişim</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', width: '100px' }}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Kullanıcılar yükleniyor...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Henüz kayıtlı kullanıcı bulunmuyor.
                    </td>
                  </tr>
                ) : (
                  users.map(u => {
                    const roleInfo = ROLE_DEFINITIONS[u.role] || { label: u.role, desc: '', color: 'var(--primary)' };
                    const isSuper = u.role === 'SUPER_ADMIN';

                    return (
                      <tr key={u.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '28px', height: '28px', borderRadius: '50%',
                              background: roleInfo.color, color: '#fff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontWeight: 700, fontSize: '11px'
                            }}>
                              {u.fullName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{u.fullName}</div>
                              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>@{u.username}</div>
                            </div>
                          </div>
                        </td>

                        <td style={{ padding: '8px 10px' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background: `${roleInfo.color}15`,
                            color: roleInfo.color,
                            fontWeight: 700,
                            fontSize: '11px',
                            border: `1px solid ${roleInfo.color}40`,
                          }}>
                            {u.roleSlugs?.length ? u.roleSlugs.join(' + ') : roleInfo.label}
                          </span>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {roleInfo.desc}
                          </div>
                        </td>

                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)', fontSize: '11px' }}>
                          <div>{u.email}</div>
                          {u.phone && <div>{u.phone}</div>}
                        </td>

                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button
                              type="button"
                              className="btn btn-xs btn-secondary"
                              onClick={() => handleOpenEdit(u)}
                              title="Yetki ve Bilgileri Düzenle"
                            >
                              <Edit2 size={12} />
                            </button>

                            {!isSuper && (
                              <button
                                type="button"
                                className="btn btn-xs btn-danger"
                                onClick={() => handleDeleteUser(u.id, u.fullName)}
                                title="Aktif Firma Üyeliğini Kaldır"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 2. KULLANICI EKLEME & YETKİLENDİRME FORMU */}
        {activeTab === 'FORM' && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
<fieldset disabled={!!editingUserId && !canEditAccount} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>

            <div style={{ background: 'var(--bg-surface-secondary)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield size={16} color="var(--primary)" />
              <span style={{ fontSize: '12px', fontWeight: 600 }}>
                {editingUserId ? 'Kullanıcı Rolü ve Yetki Güncellemesi' : 'Yeni Kullanıcı Oluşturma ve Yetki Ataması'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label required">Kullanıcı Adı (Giriş için)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="örn: vedat.karakaya"
                  value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, '') })}
                  required
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label required">Ad Soyad (Tam İsim)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="örn: Vedat Aydın Karakaya"
                  value={form.fullName}
                  onChange={e => setForm({ ...form, fullName: e.target.value })}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">E-Posta Adresi</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="ornek@sirketiniz.com"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Telefon Numarası</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="0532 000 00 00"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">
                {editingUserId ? 'Yeni Şifre (Boş bırakılırsa değişmez)' : 'Giriş Şifresi *'}
              </label>
              <input
                type="password"
                className="form-input"
                placeholder={editingUserId ? 'Mevcut şifreyi korumak için boş bırakın' : 'Güvenli giriş şifresi'}
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                required={!editingUserId}
              />
            </div>

            {/* Yetki & Rol Seçimi (RBAC Kartları) */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label required" style={{ fontWeight: 700 }}>
                {editingUserId ? 'Firma rollerini aşağıdaki üyelik bölümünden yönetin.' : 'İlk Firma Rolü'}
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', maxHeight: '180px', overflowY: 'auto', padding: '2px' }}>
                {(Object.keys(ROLE_DEFINITIONS) as UserRole[]).filter(key => !editingUserId && !['SUPER_ADMIN', 'ADMIN'].includes(key)).map(roleKey => {
                  const r = ROLE_DEFINITIONS[roleKey];
                  const isSelected = form.role === roleKey;

                  return (
                    <div
                      key={roleKey}
                      onClick={() => setForm({ ...form, role: roleKey })}
                      style={{
                        border: isSelected ? `2px solid ${r.color}` : '1px solid var(--border-color)',
                        borderRadius: '6px',
                        padding: '8px 10px',
                        background: isSelected ? `${r.color}10` : 'var(--bg-surface)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '2px',
                        transition: 'all 0.12s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: r.color }}>{r.label}</span>
                        {isSelected && <CheckCircle2 size={14} color={r.color} />}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.2 }}>{r.desc}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Form Butonları */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setActiveTab('LIST')}
                disabled={saving}
              >
                Geri Dön
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={saving}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {saving ? 'Kaydediliyor...' : editingUserId ? 'Hesap Bilgilerini Kaydet' : 'Kullanıcıyı Kaydet'}
              </button>
            </div>
          </fieldset>
{editingUserId && !canEditAccount && <p>Ortak hesap bilgilerini platform yöneticisi düzenleyebilir. Bu firmadaki rolleri aşağıdan yönetin.</p>}
{editingUserId && <FirmMembershipEditor userId={editingUserId!} />}
</form>
        )}
      </div>
    </Modal>
  );
};
