/**
 * İŞBEY CLOUD — Kullanıcı Yetkilendirme (Menü + Hesap Kapsamı)
 * ============================================================
 * 2026-10-12: Ekran görüntüsündeki "YETKİLENDİRME" sekmesinin karşılığı.
 *
 * Firma yöneticisi bir kullanıcıyı seçer; HANGİ menüleri göreceğini (açma
 * kapama anahtarları) ve HANGİ kasa/banka/personel/vergi kayıtlarına
 * erişeceğini tek ekranda tanımlar.
 *
 * SEMANTİK:
 *  - Kapsam YOKSA kullanıcı her şeyi görür. Ekran "kısıtlama yok" gösterir.
 *  - Menü anahtarı KAPALI = gizli; belirtilmeyen = açık.
 *  - Hesap listesi BOŞ = tamamı görünür; DOLU = yalnız seçilenler.
 */

import React, { useState, useEffect } from 'react';
import type { User, CashRegister, BankAccount, Employee, ScopeMenuKey, UserVisibilityScope } from '../../../types';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { ShieldCheck, Save, RotateCcw, User as UserIcon } from 'lucide-react';

/** Ekran görüntüsündeki menü listesi (sabit sıra). */
const MENU_LIST: Array<{ key: ScopeMenuKey; label: string }> = [
  { key: 'dashboard', label: 'Ana Sayfa' },
  { key: 'maas', label: 'Maaş Tahakkukları' },
  { key: 'vergi', label: 'Vergi Tahakkukları' },
  { key: 'finansal-tablolar', label: 'Finansal Tablolar' },
  { key: 'alis-faturalari', label: 'Alış Faturaları' },
  { key: 'satis-faturalari', label: 'Satış Faturaları' },
  { key: 'cekler', label: 'Çekler' },
  { key: 'senetler', label: 'Senetler' },
  { key: 'masraflar', label: 'Masraflar' },
  { key: 'kdv-detaylari', label: 'KDV Detayları' },
  { key: 'ba-bs', label: 'BA-BS' },
  { key: 'vadesi-gecenler', label: 'Vadesi Geçenler' },
  { key: 'stok-durum', label: 'Stok Durum' },
  { key: 'banka-hareketleri', label: 'Banka Hareketleri' },
  { key: 'musteri-listesi', label: 'Müşteri Listesi' },
];

const TAX_TYPES = ['Muhtasar', 'KDV', 'Kurumlar', 'Geçici Vergi', 'SGK', 'Damga Vergisi', 'Diğer'];

function Toggle({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      title={on ? 'Gösteriliyor — kapatmak için tıklayın' : 'Gizli — açmak için tıklayın'}
      style={{
        width: '38px',
        height: '22px',
        borderRadius: '11px',
        border: 'none',
        cursor: 'pointer',
        background: on ? 'var(--success)' : 'var(--border-color)',
        position: 'relative',
        transition: 'background 0.15s ease',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: '2px',
          left: on ? '18px' : '2px',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.15s ease',
          boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
        }}
      />
    </button>
  );
}

export const UserScopeTab: React.FC = () => {
  const { showToast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [menus, setMenus] = useState<Partial<Record<ScopeMenuKey, boolean>>>({});
  const [cashIds, setCashIds] = useState<string[]>([]);
  const [bankIds, setBankIds] = useState<string[]>([]);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [taxTypes, setTaxTypes] = useState<string[]>([]);

  const [cashRegisters, setCashRegisters] = useState<CashRegister[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [hasScope, setHasScope] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (selectedUserId) loadScope(selectedUserId);
  }, [selectedUserId]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const [uRes, cRes, bRes, eRes] = await Promise.all([
        api.getUsers(),
        api.getCashRegisters().catch(() => ({ success: false as const, cashRegisters: [] as CashRegister[] })),
        api.getBankAccounts().catch(() => ({ success: false as const, bankAccounts: [] as BankAccount[] })),
        api.getEmployees().catch(() => ({ success: false as const, employees: [] as Employee[] })),
      ]);
      if (uRes.success) {
        // Yönetici dışındaki kullanıcılar (muhasebeci/personel öncelikli).
        const list = (uRes.users || []).filter(u => u.username !== 'admin');
        setUsers(list);
        const firstMuhasebe = list.find(u => u.role === 'MUHASEBE') || list[0];
        if (firstMuhasebe) setSelectedUserId(firstMuhasebe.id);
      }
      if (cRes.success) setCashRegisters(cRes.cashRegisters || []);
      if (bRes.success) setBankAccounts(bRes.bankAccounts || []);
      if (eRes.success) setEmployees(eRes.employees || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadScope = async (userId: string) => {
    try {
      const res = await api.getUserScope(userId);
      const scope = (res as any).scope as UserVisibilityScope | null;
      if (scope) {
        setMenus(scope.menus || {});
        setCashIds(scope.cashRegisterIds || []);
        setBankIds(scope.bankAccountIds || []);
        setEmployeeIds(scope.employeeIds || []);
        setTaxTypes(scope.taxTypes || []);
        setHasScope(true);
      } else {
        setMenus({});
        setCashIds([]);
        setBankIds([]);
        setEmployeeIds([]);
        setTaxTypes([]);
        setHasScope(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleMenu = (key: ScopeMenuKey) => {
    // Belirtilmeyen menü AÇIK sayılır; ilk kapatmada false yazılır.
    setMenus(prev => ({ ...prev, [key]: !(prev[key] !== false) }));
  };

  const toggleId = (list: string[], id: string, set: (v: string[]) => void) => {
    set(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  };

  const handleSave = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      const res = await api.updateUserScope(selectedUserId, {
        menus,
        cashRegisterIds: cashIds,
        bankAccountIds: bankIds,
        employeeIds,
        taxTypes,
      });
      if ((res as any).success) {
        showToast('Yetki kapsamı kaydedildi.', 'success');
        setHasScope(true);
      }
    } catch (err: any) {
      showToast(err.message || 'Kapsam kaydedilemedi.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selectedUserId) return;
    if (!window.confirm('Bu kullanıcının tüm kısıtlamaları kaldırılsın mı? (Tam görünüm)')) return;
    try {
      await api.deleteUserScope(selectedUserId);
      showToast('Kısıtlamalar kaldırıldı — kullanıcı her şeyi görür.', 'success');
      loadScope(selectedUserId);
    } catch (err: any) {
      showToast(err.message || 'Kaldırılamadı.', 'error');
    }
  };

  const selectedUser = users.find(u => u.id === selectedUserId);
  const isVisible = (key: ScopeMenuKey) => menus[key] !== false;

  const chipStyle = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: 'var(--fs-xs)',
    padding: '3px 8px',
    borderRadius: '12px',
    cursor: 'pointer',
    border: active ? '1.5px solid var(--primary)' : '1px solid var(--border-color)',
    background: active ? 'var(--primary-light)' : 'var(--bg-surface)',
    color: active ? 'var(--primary)' : 'var(--text-muted)',
    fontWeight: active ? 600 : 400,
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 'var(--fs-md)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={16} /> Kullanıcı Yetkilendirme
          </h3>
          <p style={{ margin: '3px 0 0 0', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
            Muhasebecinizin hangi menüleri ve hesapları göreceğini buradan ayarlayabilirsiniz.
            Kısıtlama yoksa kullanıcı her şeyi görür.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <UserIcon size={14} color="var(--text-muted)" />
          <select
            className="form-select"
            style={{ minWidth: '220px' }}
            value={selectedUserId}
            onChange={e => setSelectedUserId(e.target.value)}
          >
            <option value="">Çalışan Seçiniz</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>
                {u.fullName || u.username} ({u.role})
              </option>
            ))}
          </select>
        </div>
      </div>

      {!selectedUserId ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>
          Yetkilendirmek için yukarıdan bir çalışan seçin.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || loading}>
              <Save size={13} /> {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
            {hasScope && (
              <button className="btn btn-secondary btn-sm" onClick={handleReset}>
                <RotateCcw size={13} /> Tüm Kısıtlamaları Kaldır
              </button>
            )}
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
              {hasScope
                ? `${selectedUser?.fullName || selectedUser?.username} için kısıtlama TANIMLI`
                : `${selectedUser?.fullName || selectedUser?.username} için kısıtlama YOK (tam görünüm)`}
            </span>
          </div>

          <h4 style={{ fontSize: 'var(--fs-sm)', margin: '0 0 8px 0' }}>Menüler</h4>
          <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginBottom: '16px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 80px',
                gap: '8px',
                padding: '6px 12px',
                background: 'var(--bg-surface-secondary)',
                fontSize: 'var(--fs-xs)',
                fontWeight: 600,
                color: 'var(--text-muted)',
              }}
            >
              <span>Menü</span>
              <span style={{ textAlign: 'right' }}>Göster</span>
            </div>
            {MENU_LIST.map((m, i) => (
              <div
                key={m.key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 80px',
                  gap: '8px',
                  padding: '7px 12px',
                  alignItems: 'center',
                  borderTop: '1px solid var(--border-light)',
                  background: i % 2 === 1 ? 'var(--bg-surface-secondary)' : 'transparent',
                }}
              >
                <span style={{ fontSize: 'var(--fs-sm)' }}>{m.label}</span>
                <span style={{ textAlign: 'right' }}>
                  <Toggle on={isVisible(m.key)} onChange={() => toggleMenu(m.key)} label={m.label} />
                </span>
              </div>
            ))}
          </div>

          {/* Ekran görüntüsündeki gibi: Banka Hareketleri altında hesap seçimi */}
          <h4 style={{ fontSize: 'var(--fs-sm)', margin: '0 0 8px 0' }}>
            Banka Hareketleri — Görünür Hesaplar
            <span style={{ fontWeight: 400, fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
              {' '}(boş = tamamı görünür)
            </span>
          </h4>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
            {cashRegisters.map(c => (
              <button key={c.id} type="button" style={chipStyle(cashIds.includes(c.id))} onClick={() => toggleId(cashIds, c.id, setCashIds)}>
                {cashIds.includes(c.id) ? '× ' : ''}{c.name} ({Number(c.balance || 0).toLocaleString('tr-TR')} ₺)
              </button>
            ))}
            {bankAccounts.map(b => (
              <button key={b.id} type="button" style={chipStyle(bankIds.includes(b.id))} onClick={() => toggleId(bankIds, b.id, setBankIds)}>
                {bankIds.includes(b.id) ? '× ' : ''}{b.bankName} {b.accountName} ({Number(b.balance || 0).toLocaleString('tr-TR')} ₺)
              </button>
            ))}
            {cashRegisters.length === 0 && bankAccounts.length === 0 && (
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Tanımlı kasa/banka hesabı yok.</span>
            )}
          </div>

          <h4 style={{ fontSize: 'var(--fs-sm)', margin: '0 0 8px 0' }}>
            Maaş Tahakkukları — Görünür Personel
            <span style={{ fontWeight: 400, fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
              {' '}(boş = tamamı görünür)
            </span>
          </h4>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
            {employees.map(e => (
              <button key={e.id} type="button" style={chipStyle(employeeIds.includes(e.id))} onClick={() => toggleId(employeeIds, e.id, setEmployeeIds)}>
                {employeeIds.includes(e.id) ? '× ' : ''}{e.fullName}
              </button>
            ))}
            {employees.length === 0 && (
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Tanımlı personel yok.</span>
            )}
          </div>

          <h4 style={{ fontSize: 'var(--fs-sm)', margin: '0 0 8px 0' }}>
            Vergi Tahakkukları — Görünür Türler
            <span style={{ fontWeight: 400, fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
              {' '}(boş = tamamı görünür)
            </span>
          </h4>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {TAX_TYPES.map(t => (
              <button key={t} type="button" style={chipStyle(taxTypes.includes(t))} onClick={() => toggleId(taxTypes, t, setTaxTypes)}>
                {taxTypes.includes(t) ? '× ' : ''}{t}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
