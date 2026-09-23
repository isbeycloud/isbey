import React, { useState, useEffect } from 'react';
import {
  Shield,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  Lock,
  Users,
  Key,
  Info,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import type { Role, Permission } from '../../types';

export const RolesPermissionsView: React.FC = () => {
  const { user } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [groupedPerms, setGroupedPerms] = useState<Record<string, Permission[]>>({});
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPerms, setFormPerms] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [roleRes, permRes] = await Promise.all([
        api.getRoles(),
        api.getPermissions(),
      ]);

      if (roleRes.success && roleRes.roles) {
        setRoles(roleRes.roles);
        if (!selectedRole && roleRes.roles.length > 0) {
          setSelectedRole(roleRes.roles[0]);
        }
      }

      if (permRes.success && permRes.permissions) {
        setPermissions(permRes.permissions);
        setGroupedPerms(permRes.grouped || {});
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setIsEditing(false);
    setFormName('');
    setFormDesc('');
    setFormPerms(['customers.view', 'products.view', 'invoices.view']);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (role: Role) => {
    setIsEditing(true);
    setFormName(role.name);
    setFormDesc(role.description || '');
    setFormPerms(role.permissions || []);
    setIsModalOpen(true);
  };

  const handleTogglePerm = (code: string) => {
    setFormPerms(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const handleToggleGroup = (moduleName: string) => {
    const modulePerms = (groupedPerms[moduleName] || []).map(p => p.code);
    const allSelected = modulePerms.every(p => formPerms.includes(p));

    if (allSelected) {
      setFormPerms(prev => prev.filter(p => !modulePerms.includes(p)));
    } else {
      setFormPerms(prev => Array.from(new Set([...prev, ...modulePerms])));
    }
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    try {
      if (isEditing && selectedRole) {
        const res = await api.updateRole(selectedRole.id, {
          name: formName,
          description: formDesc,
          permissions: formPerms,
        });
        if (res.success) {
          setSaveStatus('Rol başarıyla güncellendi.');
          setIsModalOpen(false);
          loadData();
        }
      } else {
        const res = await api.createRole({
          name: formName,
          description: formDesc,
          permissions: formPerms,
        });
        if (res.success) {
          setSaveStatus('Yeni özel rol oluşturuldu.');
          setIsModalOpen(false);
          loadData();
        }
      }
    } catch (err: any) {
      alert(err.message || 'İşlem başarısız');
    }
  };

  const handleDeleteRole = async (role: Role) => {
    if (role.isSystem) {
      alert('Sistem varsayılan rolleri silinemez.');
      return;
    }
    if (!confirm(`'${role.name}' rolünü silmek istediğinize emin misiniz?`)) return;

    try {
      const res = await api.deleteRole(role.id);
      if (res.success) {
        loadData();
      }
    } catch (err: any) {
      alert(err.message || 'Silme işlemi başarısız');
    }
  };

  return (
    <div className="view-container" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Üst Başlık & Aksiyon */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Shield className="text-primary" size={28} />
            Rol ve Yetki Yönetimi (Granüler RBAC)
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-base, 13px)', marginTop: '4px' }}>
            Firma personellerinizin ve muhasebecilerinizin ERP modüllerine erişim yetkilerini özelleştirin.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--primary)',
            color: '#fff',
            border: 'none',
            padding: '10px 18px',
            borderRadius: 'var(--radius-sm, 6px)',
            fontWeight: '600',
            cursor: 'pointer',
          }}
        >
          <Plus size={18} />
          Yeni Özel Rol Tanımla
        </button>
      </div>

      {/* Ana Gövde: Sol Roller Listesi, Sağ İzin Matrisi */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', alignItems: 'start' }}>
        {/* Sol Kolon: Roller */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg, 10px)', padding: '16px', boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ fontSize: 'var(--fs-base, 13px)', fontWeight: '600', marginBottom: '12px', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
            Tanımlı Roller ({roles.length})
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {roles.map(role => {
              const isSelected = selectedRole?.id === role.id;
              return (
                <div
                  key={role.id}
                  onClick={() => setSelectedRole(role)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md, 8px)',
                    border: `1px solid ${isSelected ? 'var(--primary)' : 'transparent'}`,
                    background: isSelected ? 'var(--primary-light)' : 'var(--bg-surface-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: isSelected ? '700' : '600', color: isSelected ? 'var(--primary)' : 'var(--text-main)' }}>
                      {role.name}
                    </div>
                    {role.isSystem ? (
                      <span className="badge badge-secondary" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Lock size={10} /> Sistem
                      </span>
                    ) : (
                      <span className="badge badge-success">
                        Özel
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', marginTop: '4px', lineHeight: '1.4' }}>
                    {role.description || 'Açıklama belirtilmedi.'}
                  </div>
                  <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--primary)', marginTop: '6px', fontWeight: '500' }}>
                    {role.permissions.length} İzin Yetkisi
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sağ Kolon: Seçili Rolün İzin Detayları */}
        {selectedRole ? (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg, 10px)', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-light)', paddingBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h2 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: '700', color: 'var(--text-main)' }}>
                    {selectedRole.name}
                  </h2>
                  {selectedRole.isSystem && (
                    <span className="badge badge-secondary">
                      Sistem Varsayılan Rolü
                    </span>
                  )}
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-base, 13px)', marginTop: '4px' }}>
                  {selectedRole.description}
                </p>
              </div>

              {!selectedRole.isSystem && (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => handleOpenEditModal(selectedRole)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-main)', cursor: 'pointer', fontSize: 'var(--fs-base, 13px)', fontWeight: '600' }}
                  >
                    <Edit2 size={14} /> Düzenle
                  </button>
                  <button
                    onClick={() => handleDeleteRole(selectedRole)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--danger)', background: 'var(--bg-surface)', color: 'var(--danger)', cursor: 'pointer', fontSize: 'var(--fs-base, 13px)', fontWeight: '600' }}
                  >
                    <Trash2 size={14} /> Sil
                  </button>
                </div>
              )}
            </div>

            {/* İzin Modülleri Izgarası */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {Object.entries(groupedPerms).map(([moduleName, perms]) => {
                return (
                  <div key={moduleName} style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md, 8px)', padding: '14px', background: 'var(--bg-surface-secondary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <h4 style={{ fontSize: 'var(--fs-base, 13px)', fontWeight: '700', color: 'var(--text-main)' }}>
                        Modül: {moduleName}
                      </h4>
                      <span style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>
                        {perms.filter(p => selectedRole.permissions.includes(p.code)).length} / {perms.length} Aktif İzin
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                      {perms.map(p => {
                        const hasPerm = selectedRole.permissions.includes(p.code) || selectedRole.permissions.includes('*');
                        return (
                          <div
                            key={p.code}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '10px',
                              padding: '10px',
                              borderRadius: 'var(--radius-sm, 6px)',
                              background: hasPerm ? 'var(--success-bg)' : 'var(--bg-surface-secondary)',
                              border: `1px solid ${hasPerm ? 'var(--success-border)' : 'var(--border-color)'}`,
                            }}
                          >
                            <div style={{ marginTop: '2px', color: hasPerm ? 'var(--success)' : 'var(--text-light)' }}>
                              {hasPerm ? <CheckCircle2 size={16} /> : <X size={16} />}
                            </div>
                            <div>
                              <div style={{ fontSize: 'var(--fs-base, 13px)', fontWeight: '600', color: hasPerm ? 'var(--success-text)' : 'var(--text-muted)' }}>
                                {p.name}
                              </div>
                              <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '2px' }}>
                                {p.description}
                              </div>
                              <code style={{ fontSize: 'var(--fs-2xs, 10px)', color: 'var(--text-muted)', background: 'var(--bg-surface-secondary)', padding: '1px 4px', borderRadius: 'var(--radius-xs, 4px)', marginTop: '4px', display: 'inline-block' }}>
                                {p.code}
                              </code>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Lütfen incelemek istediğiniz bir rolü seçin.
          </div>
        )}
      </div>

      {/* Rol Oluştur / Düzenle Modal */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(23, 32, 51, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', width: '100%', maxWidth: '850px', maxHeight: '90vh', overflowY: 'auto', padding: '24px', boxShadow: 'var(--shadow-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: '700' }}>
                {isEditing ? 'Özel Rolü Düzenle' : 'Yeni Özel Rol Oluştur'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveRole}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-base, 13px)', fontWeight: '600', marginBottom: '6px' }}>
                    Rol Adı *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Örn: Saha Satış Yetkilisi"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', fontSize: 'var(--fs-md, 14px)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-base, 13px)', fontWeight: '600', marginBottom: '6px' }}>
                    Açıklama
                  </label>
                  <input
                    type="text"
                    placeholder="Örn: Sadece teklif ve fatura düzenleyebilir"
                    value={formDesc}
                    onChange={e => setFormDesc(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', fontSize: 'var(--fs-md, 14px)' }}
                  />
                </div>
              </div>

              {/* İzin Seçim Matrisi */}
              <h4 style={{ fontSize: 'var(--fs-base, 13px)', fontWeight: '700', marginBottom: '12px', color: 'var(--text-main)' }}>
                Rol İzinlerini Belirleyin ({formPerms.length} İzin Seçildi)
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflowY: 'auto', paddingRight: '6px' }}>
                {Object.entries(groupedPerms).map(([moduleName, perms]) => {
                  const allSelected = perms.every(p => formPerms.includes(p.code));
                  return (
                    <div key={moduleName} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md, 8px)', padding: '12px', background: 'var(--bg-surface-secondary)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                        <span style={{ fontWeight: '700', fontSize: 'var(--fs-base, 13px)', color: 'var(--text-main)' }}>
                          {moduleName}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggleGroup(moduleName)}
                          style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}
                        >
                          {allSelected ? 'Tümünü Kaldır' : 'Tümünü Seç'}
                        </button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {perms.map(p => {
                          const isChecked = formPerms.includes(p.code);
                          return (
                            <label
                              key={p.code}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                fontSize: 'var(--fs-base, 13px)',
                                cursor: 'pointer',
                                padding: '6px 8px',
                                borderRadius: 'var(--radius-xs, 4px)',
                                background: isChecked ? 'var(--primary-light)' : 'transparent',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleTogglePerm(p.code)}
                              />
                              <div>
                                <div style={{ fontWeight: isChecked ? '600' : '400' }}>{p.name}</div>
                                <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>{p.description}</div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{ padding: '10px 18px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-main)', cursor: 'pointer', fontWeight: '600' }}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  style={{ padding: '10px 20px', borderRadius: 'var(--radius-sm, 6px)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: '600' }}
                >
                  {isEditing ? 'Değişiklikleri Kaydet' : 'Rolü Oluştur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RolesPermissionsView;
