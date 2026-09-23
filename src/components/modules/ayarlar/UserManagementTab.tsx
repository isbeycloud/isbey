import { useAuth } from '../../../context/AuthContext';
import { FirmMembershipEditor } from '../../common/FirmMembershipEditor';
import React, { useState, useEffect } from 'react';
import { DataGrid } from '../../common/DataGrid';
import type { Column } from '../../common/DataGrid';
import type { User, UserRole } from '../../../types';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import { Modal } from '../../common/Modal';
import { Plus, Shield, UserCheck, Trash2, Key, Edit2 } from 'lucide-react';

export const UserManagementTab: React.FC = () => {
  const { showToast } = useToast();
  const { user: actingUser } = useAuth();
  const canEditAccount = ['SUPER_ADMIN', 'ADMIN'].includes(actingUser?.role || '');
  const { triggerRefresh } = useApp();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // New/Edit User Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [form, setForm] = useState({
    username: '',
    fullName: '',
    email: '',
    phone: '',
    role: 'SATIS' as UserRole,
    password: '',
  });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await api.getUsers();
      if (res.success) setUsers(res.users);
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
    setIsModalOpen(true);
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
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username.trim() || !form.fullName.trim()) {
      showToast('Kullanıcı adı ve Ad Soyad zorunludur.', 'warning');
      return;
    }

    try {
      if (editingUserId) {
        const res = await api.updateUser(editingUserId, form);
        if (res.success) {
          showToast(res.message, 'success');
          loadUsers();
          setIsModalOpen(false);
        }
      } else {
        const res = await api.createUser(form);
        if (res.success) {
          showToast(res.message, 'success');
          loadUsers();
          setIsModalOpen(false);
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Kullanıcı işlemi başarısız.', 'error');
    }
  };

  const handleDeleteUser = async (u: User) => {
    if (!window.confirm(`${u.username} kullanıcısının aktif firma üyeliğini kaldırmak istediğinize emin misiniz?`)) return;

    try {
      const res = await api.deleteUser(u.id);
      if (res.success) {
        showToast(res.message, 'success');
        loadUsers();
      }
    } catch (err: any) {
      showToast(err.message || 'Silinemedi.', 'error');
    }
  };

  const columns: Column<User>[] = [
    {
      key: 'username',
      title: 'Kullanıcı Adı',
      width: '130px',
      render: u => <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{u.username}</span>,
    },
    {
      key: 'fullName',
      title: 'Adı Soyadı',
      render: u => (
        <div>
          <div style={{ fontWeight: 600 }}>{u.fullName}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{u.email}</div>
        </div>
      ),
    },
    {
      key: 'role',
      title: 'Rol & Yetki Seviyesi',
      width: '140px',
      render: u => {
        const isSuper = u.role === 'SUPER_ADMIN';
        return (
          <span className={`badge ${isSuper ? 'badge-danger' : u.role === 'MUHASEBE' ? 'badge-warning' : 'badge-info'}`}>
            <Shield size={11} /> {u.roleSlugs?.join(' + ') || u.role}
          </span>
        );
      },
    },
    {
      key: 'active',
      title: 'Durum',
      width: '100px',
      render: u => (
        <span className={`badge ${u.active ? 'badge-success' : 'badge-secondary'}`}>
          {u.active ? 'Aktif' : 'Pasif'}
        </span>
      ),
    },
    {
      key: 'lastLoginAt',
      title: 'Son Giriş',
      width: '140px',
      render: u => (
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('tr-TR') : 'Henüz giriş yok'}
        </span>
      ),
    },
    {
      key: 'actions',
      title: 'İşlemler',
      sortable: false,
      width: '120px',
      render: u => (
        <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
          <button className="btn btn-secondary btn-sm" title="Düzenle" onClick={() => handleOpenEdit(u)}>
            <Edit2 size={13} />
          </button>
          {u.username !== 'admin' && (
            <button className="btn btn-secondary btn-sm" title="Sil" onClick={() => handleDeleteUser(u)}>
              <Trash2 size={13} color="#ef4444" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '15px', fontWeight: 700 }}>Kullanıcı Hesapları & Rol Tabanlı Erişim (RBAC)</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Kullanıcıları tanımlayın, rol atayın ve modül bazlı izinleri yönetin.
          </p>
        </div>

        <button className="btn btn-primary" onClick={handleOpenNew}>
          <Plus size={16} />
          <span>Yeni Kullanıcı Ekle</span>
        </button>
      </div>

      <DataGrid
        columns={columns}
        data={users}
        searchPlaceholder="Kullanıcı adı, isim veya e-posta ile ara..."
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingUserId ? 'Kullanıcıyı Düzenle' : 'Yeni Kullanıcı Oluştur'}
        size="medium"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
              İptal
            </button>
            <button type="button" className="btn btn-primary" disabled={!!editingUserId && !canEditAccount} onClick={handleSubmit}>
              Kaydet
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit}>
<fieldset disabled={!!editingUserId && !canEditAccount} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label required">Kullanıcı Adı</label>
              <input
                type="text"
                className="form-input"
                required
                disabled={!!editingUserId}
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label required">Adı Soyadı</label>
              <input
                type="text"
                className="form-input"
                required
                value={form.fullName}
                onChange={e => setForm({ ...form, fullName: e.target.value })}
              />
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">E-Posta</label>
              <input
                type="email"
                className="form-input"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Telefon</label>
              <input
                type="text"
                className="form-input"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label required">İlk firma rolü (sonraki değişiklikler aşağıda)</label>
              <select
                className="form-select"
                disabled={!!editingUserId}
                value={form.role}
                onChange={e => setForm({ ...form, role: e.target.value as UserRole })}
              >
                <option value="MUHASEBE">MUHASEBE (Finans & Fatura)</option>
                <option value="SATIS">SATIS (Satış & POS Kasiyer)</option>
                <option value="DEPO">DEPO (Stok & Sevkiyat)</option>
                <option value="RAPOR">RAPOR (Sadece Rapor Görüntüleme)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">{editingUserId ? 'Yeni Şifre (Değişmeyecekse boş bırakın)' : 'Şifre'}</label>
              <input
                type="password"
                className="form-input"
                placeholder="******"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
              />
            </div>
          </div>
        </fieldset>
{editingUserId && !canEditAccount && <p>Ortak hesap bilgilerini platform yöneticisi düzenleyebilir. Bu firmadaki rolleri aşağıdan yönetin.</p>}
{editingUserId && <FirmMembershipEditor userId={editingUserId!} />}
</form>
      </Modal>
    </div>
  );
};
