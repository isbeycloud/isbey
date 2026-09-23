import React from 'react';
import { ShieldAlert, ArrowLeft, Building } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export const ImpersonationBanner: React.FC = () => {
  const { user, activeTenant, switchCompany, refreshProfile } = useAuth();

  // Check if current session is an admin impersonation
  const isImpersonating = user?.role === 'SUPER_ADMIN' && activeTenant && activeTenant.id !== user.companyId;

  const handleStopImpersonation = async () => {
    try {
      const res = await api.stopImpersonation();
      if (res.success && res.token) {
        localStorage.setItem('isbey_token', res.token);
        await refreshProfile();
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!isImpersonating) return null;

  return (
    <div
      style={{
        // 2026-09-13 (tasarım sadeleştirmesi): dekoratif gradyan yerine düz uyarı
        // token'ı. Beyaz metin okunurluğu için --warning (açık ton) seçildi.
        background: 'var(--warning)',
        color: '#ffffff',
        padding: '8px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '13px',
        fontWeight: '600',
        zIndex: 9999,
        boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <ShieldAlert size={18} />
        <span>
          <b>Platform Admin Denetim Modu:</b> Şu anda <u>{activeTenant?.name || activeTenant?.title}</u> firmasının çalışma alanını görüntülüyorsunuz. (Tüm eylemler loglanmaktadır).
        </span>
      </div>

      <button
        onClick={handleStopImpersonation}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: '#ffffff',
          color: '#b45309',
          border: 'none',
          padding: '4px 12px',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: '700',
          cursor: 'pointer',
          boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
        }}
      >
        <ArrowLeft size={14} />
        Yönetici Hesabına Geri Dön
      </button>
    </div>
  );
};

export default ImpersonationBanner;
