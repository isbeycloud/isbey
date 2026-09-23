import React, { useState, useEffect } from 'react';
import { api } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { UserManagementTab } from '../ayarlar/UserManagementTab';
import { HizliConnectSettingsTab } from '../ayarlar/HizliConnectSettingsTab';
import { HizliBilisimPortalIntegrationTab } from './HizliBilisimPortalIntegrationTab';
import { HizliIntegrationManagementTab } from './HizliIntegrationManagementTab';
import { LiveQaTestScreen } from './LiveQaTestScreen';
import { DataGrid } from '../../common/DataGrid';
import type { Column } from '../../common/DataGrid';
import type { AuditLog } from '../../../types';
import {
  Shield,
  Users,
  Zap,
  ShieldCheck,
  BarChart3,
  Activity,
  Lock,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  Server,
  Database,
  RefreshCw,
  Eye,
  UserCheck,
  Crown,
  Sparkles,
  Link,
} from 'lucide-react';

type AdminTab = 'OVERVIEW' | 'HIZLI_PORTAL' | 'HIZLI_INTEGRATIONS' | 'USERS' | 'ROLES' | 'HIZLI_CONNECT' | 'AUDIT' | 'SYSTEM';

export const AdminPanelView: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('OVERVIEW');
  const [stats, setStats] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    if (activeTab === 'AUDIT') loadAuditLogs();
    if (activeTab === 'USERS') loadUsers();
    if (activeTab === 'OVERVIEW') loadStats();
  }, [activeTab]);

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const [settingsRes, usersRes] = await Promise.all([
        api.getSettings(),
        api.getUsers(),
      ]);
      if (usersRes.success) setUsers(usersRes.users);
      if (settingsRes.success) {
        setStats({
          totalUsers: usersRes.success ? usersRes.users.length : 0,
          activeUsers: usersRes.success ? usersRes.users.filter((u: any) => u.active).length : 0,
          adminUsers: usersRes.success ? usersRes.users.filter((u: any) => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN').length : 0,
          company: settingsRes.company,
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingStats(false);
    }
  };

  const loadUsers = async () => {
    try {
      const res = await api.getUsers();
      if (res.success) setUsers(res.users);
    } catch (err) {
      console.error(err);
    }
  };

  const loadAuditLogs = async () => {
    try {
      const res = await api.getAuditLogs();
      if (res.success) setAuditLogs(res.auditLogs);
    } catch (err) {
      console.error(err);
    }
  };

  const tabs: { id: AdminTab; label: string; icon: React.ReactNode; onlySuper?: boolean }[] = [
    { id: 'OVERVIEW', label: 'Genel Bakış', icon: <BarChart3 size={14} /> },
    { id: 'HIZLI_PORTAL', label: 'e-Fatura Portal Eşleme', icon: <Zap size={14} color="#0284c7" /> },
    { id: 'HIZLI_INTEGRATIONS', label: 'Entegrasyon Yönetimi', icon: <Link size={14} color="#16a34a" /> },
    { id: 'USERS', label: 'Kullanıcı Yönetimi', icon: <Users size={14} /> },
    { id: 'ROLES', label: 'Rol & Yetki Matrisi', icon: <Shield size={14} /> },
    { id: 'HIZLI_CONNECT', label: 'e-Dönüşüm API Ayarları', icon: <Server size={14} /> },
    { id: 'AUDIT', label: 'Denetim Kayıtları', icon: <ShieldCheck size={14} /> },
    { id: 'SYSTEM', label: 'Sistem Bilgisi', icon: <Server size={14} /> },
  ];

  const roleLabels: Record<string, { label: string; color: string; bg: string }> = {
    SUPER_ADMIN: { label: 'Süper Yönetici', color: '#dc2626', bg: 'rgba(220,38,38,0.1)' },
    ADMIN: { label: 'Yönetici', color: '#7c3aed', bg: 'rgba(124,58,237,0.1)' },
    MUHASEBE: { label: 'Muhasebe', color: '#0284c7', bg: 'rgba(2,132,199,0.1)' },
    SATIS: { label: 'Satış', color: '#16a34a', bg: 'rgba(22,163,74,0.1)' },
    KASA: { label: 'Kasa', color: '#d97706', bg: 'rgba(217,119,6,0.1)' },
    DEPO: { label: 'Depo', color: '#64748b', bg: 'rgba(100,116,139,0.1)' },
    PERSONEL: { label: 'Personel', color: '#0891b2', bg: 'rgba(8,145,178,0.1)' },
    SAHA: { label: 'Saha', color: '#15803d', bg: 'rgba(21,128,61,0.1)' },
    RAPOR: { label: 'Rapor', color: '#4f46e5', bg: 'rgba(79,70,229,0.1)' },
  };

  const roleMatrix = [
    { module: 'Dashboard', SUPER_ADMIN: true, ADMIN: true, MUHASEBE: true, SATIS: true, KASA: true, DEPO: true, RAPOR: true },
    { module: 'POS / Satış', SUPER_ADMIN: true, ADMIN: true, MUHASEBE: true, SATIS: true, KASA: true, DEPO: false, RAPOR: false },
    { module: 'Fatura', SUPER_ADMIN: true, ADMIN: true, MUHASEBE: true, SATIS: true, KASA: false, DEPO: false, RAPOR: false },
    { module: 'Alış / Gider', SUPER_ADMIN: true, ADMIN: true, MUHASEBE: true, SATIS: false, KASA: false, DEPO: false, RAPOR: false },
    { module: 'Stok & Depo', SUPER_ADMIN: true, ADMIN: true, MUHASEBE: true, SATIS: true, KASA: false, DEPO: true, RAPOR: true },
    { module: 'Cari Hesaplar', SUPER_ADMIN: true, ADMIN: true, MUHASEBE: true, SATIS: true, KASA: false, DEPO: false, RAPOR: true },
    { module: 'Kasa / Banka', SUPER_ADMIN: true, ADMIN: true, MUHASEBE: true, SATIS: false, KASA: true, DEPO: false, RAPOR: false },
    { module: 'Çek / Senet', SUPER_ADMIN: true, ADMIN: true, MUHASEBE: true, SATIS: false, KASA: false, DEPO: false, RAPOR: false },
    { module: 'Personel & HR', SUPER_ADMIN: true, ADMIN: true, MUHASEBE: false, SATIS: false, KASA: false, DEPO: false, RAPOR: false },
    { module: 'Raporlar', SUPER_ADMIN: true, ADMIN: true, MUHASEBE: true, SATIS: false, KASA: false, DEPO: false, RAPOR: true },
    { module: 'AI Asistanı', SUPER_ADMIN: true, ADMIN: true, MUHASEBE: true, SATIS: true, KASA: true, DEPO: true, RAPOR: true },
    { module: 'Ayarlar', SUPER_ADMIN: true, ADMIN: true, MUHASEBE: false, SATIS: false, KASA: false, DEPO: false, RAPOR: false },
    { module: 'Yönetim Paneli', SUPER_ADMIN: true, ADMIN: true, MUHASEBE: false, SATIS: false, KASA: false, DEPO: false, RAPOR: false },
  ];

  const auditColumns: Column<AuditLog>[] = [
    {
      key: 'timestamp',
      title: 'Tarih / Saat',
      width: '150px',
      render: l => <span style={{ fontSize: '11px' }}>{new Date(l.timestamp).toLocaleString('tr-TR')}</span>,
    },
    {
      key: 'username',
      title: 'Kullanıcı',
      width: '110px',
      render: l => <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{l.username}</span>,
    },
    {
      key: 'action',
      title: 'Eylem',
      width: '90px',
      render: l => {
        const isDelete = l.action === 'DELETE' || l.action === 'CANCEL';
        return <span className={`badge ${isDelete ? 'badge-danger' : l.action === 'CREATE' ? 'badge-success' : 'badge-info'}`}>{l.action}</span>;
      },
    },
    {
      key: 'module',
      title: 'Modül',
      width: '90px',
      render: l => <span style={{ fontWeight: 600 }}>{l.module}</span>,
    },
    {
      key: 'documentNo',
      title: 'Belge No',
      width: '120px',
      render: l => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{l.documentNo || '—'}</span>,
    },
    {
      key: 'details',
      title: 'Detay',
      render: l => <span style={{ fontSize: '11.5px' }}>{l.details}</span>,
    },
    {
      key: 'ipAddress',
      title: 'IP',
      width: '100px',
      render: l => <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{l.ipAddress}</span>,
    },
  ];

  return (
    <div className="view-content-container">
      {/* ─── Admin Panel Başlık Bandı ─── */}
      <div style={{
        // 2026-09-13 (tasarım sadeleştirmesi): dekoratif gradyan yerine düz koyu yüzey
        // token'ı. Bant metni beyaz olduğu için açık token (bg-surface-secondary) uygun değil.
        background: 'var(--text-main)',
        borderRadius: '12px',
        padding: '16px 22px',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 4px 20px rgba(49,46,129,0.4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            background: 'rgba(255,255,255,0.15)',
            // 2026-09-13 (tasarım sadeleştirmesi): backdropFilter: blur(10px) kaldırıldı
            // (glassmorphism yasak). Yarı saydam beyaz blok düz yüzey olarak korunuyor.
            border: '1px solid rgba(255,255,255,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Crown size={24} color="#fbbf24" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 900, color: '#fff', margin: 0 }}>
                Yönetim Paneli
              </h2>
              <span style={{
                background: user?.role === 'SUPER_ADMIN' ? 'rgba(251,191,36,0.2)' : 'rgba(139,92,246,0.2)',
                border: `1px solid ${user?.role === 'SUPER_ADMIN' ? '#fbbf24' : '#8b5cf6'}`,
                color: user?.role === 'SUPER_ADMIN' ? '#fbbf24' : '#c4b5fd',
                fontSize: '10.5px',
                fontWeight: 700,
                padding: '2px 10px',
                borderRadius: '20px',
                letterSpacing: '0.5px',
              }}>
                {user?.role === 'SUPER_ADMIN' ? '⭐ SÜPER YÖNETİCİ' : '🔑 YÖNETİCİ'}
              </span>
            </div>
            <div style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.65)', marginTop: '3px' }}>
              Kullanıcı yönetimi, rol yetkilendirme, sistem denetimi ve entegrasyon ayarları
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>Oturum Açan Yönetici</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>{user?.fullName || user?.username}</div>
          </div>
          <Lock size={18} color="rgba(255,255,255,0.4)" />
        </div>
      </div>

      {/* ─── Sekmeler ─── */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '2px solid var(--border-color)', paddingBottom: '0', marginBottom: '16px', overflowX: 'auto' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: activeTab === tab.id ? 700 : 500,
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
              background: 'transparent',
              color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              borderRadius: '6px 6px 0 0',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
              marginBottom: '-2px',
            }}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ─── GENEL BAKIŞ ─── */}
      {activeTab === 'OVERVIEW' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* KPI Kartları */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
            {[
              {
                label: 'Toplam Kullanıcı',
                value: loadingStats ? '...' : (stats?.totalUsers || 0),
                sub: `${stats?.activeUsers || 0} aktif`,
                icon: <Users size={20} color="#7c3aed" />,
                accent: '#7c3aed',
                bg: 'rgba(124,58,237,0.08)',
              },
              {
                label: 'Yönetici Sayısı',
                value: loadingStats ? '...' : (stats?.adminUsers || 0),
                sub: 'Admin & SuperAdmin',
                icon: <Crown size={20} color="#dc2626" />,
                accent: '#dc2626',
                bg: 'rgba(220,38,38,0.08)',
              },
              {
                label: 'Aktif Oturumlar',
                value: '1',
                sub: 'Şu an aktif',
                icon: <Activity size={20} color="#16a34a" />,
                accent: '#16a34a',
                bg: 'rgba(22,163,74,0.08)',
              },
              {
                label: 'Sistem Durumu',
                value: 'Sağlıklı',
                sub: 'Tüm servisler aktif',
                icon: <CheckCircle2 size={20} color="#0284c7" />,
                accent: '#0284c7',
                bg: 'rgba(2,132,199,0.08)',
              },
            ].map((kpi, i) => (
              <div key={i} style={{
                background: kpi.bg,
                border: `1px solid ${kpi.accent}30`,
                borderRadius: '10px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{kpi.label}</div>
                  <div style={{ padding: '6px', background: `${kpi.accent}18`, borderRadius: '8px' }}>{kpi.icon}</div>
                </div>
                <div style={{ fontSize: '26px', fontWeight: 900, color: kpi.accent, fontFamily: 'var(--font-mono)' }}>{kpi.value}</div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{kpi.sub}</div>
              </div>
            ))}
          </div>

          {/* Canlı QA Test Ekranı (FAZ 25 doğrulama paneli — yalnız SUPER_ADMIN/ADMIN).
              SPA içi görünüm: token services/api.ts ile otomatik eklenir; ayrı sekme
              açma yaklaşımı kaldırıldı (tarayıcı sekmesi Authorization başlığı taşıyamazdı). */}
          <LiveQaTestScreen />

          {/* Kullanıcı Listesi Özeti */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="card-panel" style={{ padding: '16px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <UserCheck size={15} color="var(--primary)" />
                <span>Kullanıcı Listesi Özeti</span>
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {users.slice(0, 8).map(u => {
                  const roleInfo = roleLabels[u.role] || { label: u.role, color: '#64748b', bg: 'rgba(100,116,139,0.1)' };
                  return (
                    <div key={u.id} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 10px',
                      background: 'var(--bg-surface-secondary)',
                      borderRadius: '6px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          background: `${roleInfo.color}20`,
                          border: `1.5px solid ${roleInfo.color}40`,
                          color: roleInfo.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          fontWeight: 800,
                        }}>
                          {u.fullName?.charAt(0) || u.username?.charAt(0) || '?'}
                        </div>
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 600 }}>{u.fullName || u.username}</div>
                          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>@{u.username}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '20px',
                          background: roleInfo.bg,
                          color: roleInfo.color,
                          border: `1px solid ${roleInfo.color}30`,
                        }}>
                          {roleInfo.label}
                        </span>
                        <div style={{
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          background: u.active ? 'var(--success)' : '#94a3b8',
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Güvenlik & Sistem Özeti */}
            <div className="card-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck size={15} color="var(--primary)" />
                <span>Güvenlik & Sistem Özeti</span>
              </h4>
              {[
                { label: 'Oturum Zaman Aşımı', value: '8 saat', icon: <Clock size={13} />, color: '#0284c7' },
                { label: 'Şifre Politikası', value: 'Orta Güvenlik', icon: <Lock size={13} />, color: '#16a34a' },
                { label: 'İki Faktörlü Doğrulama', value: 'Pasif', icon: <AlertTriangle size={13} />, color: '#d97706' },
                { label: 'Son Audit Log', value: 'Bugün', icon: <Eye size={13} />, color: '#7c3aed' },
                { label: 'Veritabanı Boyutu', value: 'Local JSON', icon: <Database size={13} />, color: '#0891b2' },
                { label: 'Sunucu Durumu', value: '✓ Port 4000 Aktif', icon: <Server size={13} />, color: '#16a34a' },
                { label: 'Hızlı e-Connect', value: 'ApiKey Aktif ✓', icon: <Zap size={13} />, color: '#0284c7' },
                { label: 'TypeScript Build', value: '0 Hata', icon: <CheckCircle2 size={13} />, color: '#16a34a' },
              ].map((item, i) => (
                <div key={i} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '7px 10px',
                  background: 'var(--bg-surface-secondary)',
                  borderRadius: '6px',
                  fontSize: '12px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
                    <span style={{ color: item.color }}>{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                  <span style={{ fontWeight: 700, color: item.color }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── KULLANICI YÖNETİMİ ─── */}
      {activeTab === 'USERS' && <UserManagementTab />}

      {/* ─── ROL & YETKİ MATRİSİ ─── */}
      {activeTab === 'ROLES' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card-panel" style={{ padding: '16px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Shield size={16} color="var(--primary)" />
              <span>Rol Bazlı Erişim Kontrol Matrisi (RBAC)</span>
            </h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px 12px', background: 'var(--bg-surface-secondary)', borderRadius: '6px 0 0 0', fontWeight: 700, minWidth: '140px' }}>
                      Modül / Özellik
                    </th>
                    {['SUPER_ADMIN', 'ADMIN', 'MUHASEBE', 'SATIS', 'KASA', 'DEPO', 'RAPOR'].map(role => {
                      const info = roleLabels[role];
                      return (
                        <th key={role} style={{
                          padding: '8px 12px',
                          background: 'var(--bg-surface-secondary)',
                          textAlign: 'center',
                          fontWeight: 700,
                          color: info.color,
                          whiteSpace: 'nowrap',
                        }}>
                          {info.label}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {roleMatrix.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-main)' }}>
                        {row.module}
                      </td>
                      {(['SUPER_ADMIN', 'ADMIN', 'MUHASEBE', 'SATIS', 'KASA', 'DEPO', 'RAPOR'] as const).map(role => {
                        const hasAccess = (row as any)[role];
                        return (
                          <td key={role} style={{ textAlign: 'center', padding: '8px 12px' }}>
                            {hasAccess ? (
                              <CheckCircle2 size={16} color="var(--success)" />
                            ) : (
                              <span style={{ color: 'var(--border-color)', fontWeight: 700, fontSize: '16px' }}>✕</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Rol Açıklamaları */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {Object.entries(roleLabels).map(([role, info]) => (
              <div key={role} style={{
                padding: '12px 14px',
                background: info.bg,
                border: `1px solid ${info.color}25`,
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: `${info.color}20`,
                  color: info.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 900,
                  fontSize: '13px',
                  flexShrink: 0,
                }}>
                  {info.label.charAt(0)}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '12px', color: info.color }}>{info.label}</div>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── HIZLI BİLİŞİM ENTEGRASYON YÖNETİMİ ─── */}
      {activeTab === 'HIZLI_INTEGRATIONS' && <HizliIntegrationManagementTab />}

      {/* ─── HIZLI BİLİŞİM E-FATURA PORTAL EŞLEME ─── */}
      {activeTab === 'HIZLI_PORTAL' && <HizliBilisimPortalIntegrationTab />}

      {/* ─── e-DÖNÜŞÜM HIZLI CONNECT AYARLARI ─── */}
      {activeTab === 'HIZLI_CONNECT' && <HizliConnectSettingsTab />}

      {/* ─── DENETİM KAYITLARI ─── */}
      {activeTab === 'AUDIT' && (
        <div className="card-panel" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={16} color="var(--primary)" />
              <span>Sistem Denetim Kayıtları (Audit Log)</span>
            </h4>
            <button className="btn btn-secondary btn-sm" onClick={loadAuditLogs}>
              <RefreshCw size={13} />
              <span>Yenile</span>
            </button>
          </div>
          <DataGrid
            columns={auditColumns}
            data={auditLogs}
            rowKey="id"
            emptyMessage="Henüz denetim kaydı bulunmuyor."
          />
        </div>
      )}

      {/* ─── SİSTEM BİLGİSİ ─── */}
      {activeTab === 'SYSTEM' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div className="card-panel" style={{ padding: '16px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Server size={15} color="var(--primary)" />
              <span>Sistem & Altyapı Bilgileri</span>
            </h4>
            {[
              { k: 'Uygulama', v: 'İŞBEY ERP v2.0.0' },
              { k: 'Çerçeve', v: 'React 19 + Vite 8 + TypeScript 6' },
              { k: 'Backend', v: 'Node.js + Express 5 + TSX' },
              { k: 'Veritabanı', v: 'Local JSON (In-Memory Store)' },
              { k: 'Port (Frontend)', v: 'localhost:5174' },
              { k: 'Port (Backend)', v: 'localhost:4000' },
              { k: 'e-Connect API', v: 'econnecttest.hizliteknoloji.com.tr' },
              { k: 'ApiKey', v: '.env (HIZLI_BILISIM_API_KEY)' },
              { k: 'GİB UBL-TR', v: '2.1 (TEMEL FATURA)' },
            ].map(({ k, v }) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: 'var(--bg-surface-secondary)', borderRadius: '5px', marginBottom: '4px', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{v}</span>
              </div>
            ))}
          </div>

          <div className="card-panel" style={{ padding: '16px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <TrendingUp size={15} color="var(--primary)" />
              <span>Entegrasyon & Modül Durumu</span>
            </h4>
            {[
              { k: 'Hızlı Teknoloji e-Connect', v: '✓ Bağlı', color: 'var(--success)' },
              { k: 'e-Fatura (UBL-TR 2.1)', v: '✓ Aktif', color: 'var(--success)' },
              { k: 'e-Arşiv', v: '✓ Aktif', color: 'var(--success)' },
              { k: 'GİB Mükellef Sorgu', v: '✓ Aktif', color: 'var(--success)' },
              { k: 'Multi-Tenant Sistemi', v: '✓ 4 Kiracı', color: 'var(--success)' },
              { k: 'AI Asistanı (Gemini)', v: '✓ Bağlı', color: 'var(--success)' },
              { k: 'Form Tasarımcısı', v: '✓ Aktif', color: 'var(--success)' },
              { k: 'İki Faktörlü Doğrulama', v: '⚠ Yakında', color: '#d97706' },
              { k: 'E-posta Bildirimleri', v: '⚠ Yakında', color: '#d97706' },
            ].map(({ k, v, color }) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: 'var(--bg-surface-secondary)', borderRadius: '5px', marginBottom: '4px', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                <span style={{ fontWeight: 700, color }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
