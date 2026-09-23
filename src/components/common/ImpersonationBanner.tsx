import React, { useState, useEffect } from 'react';
import { ShieldAlert, LogOut } from 'lucide-react';

export const ImpersonationBanner: React.FC = () => {
  const [targetTenant, setTargetTenant] = useState<string | null>(null);

  useEffect(() => {
    const token = sessionStorage.getItem('isbey_impersonation_token');
    const target = sessionStorage.getItem('isbey_impersonation_target');
    if (token && target) {
      setTargetTenant(target);
    }
  }, []);

  const handleExitImpersonation = () => {
    sessionStorage.removeItem('isbey_impersonation_token');
    sessionStorage.removeItem('isbey_impersonation_target');
    window.location.reload();
  };

  if (!targetTenant) return null;

  return (
    <div
      style={{
        // 2026-09-13 (tasarım sadeleştirmesi): dekoratif gradyan yerine düz tehlike
        // token'ı (--danger); beyaz metin okunurluğu korunur.
        background: 'var(--danger)',
        color: '#fff',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.82rem',
        fontWeight: 700,
        zIndex: 9999,
        position: 'sticky',
        top: 0,
        boxShadow: '0 4px 12px rgba(220, 38, 38, 0.4)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <ShieldAlert size={18} />
        <span>
          ⚠️ GÜVENLİK MODU: Platform Süper Yöneticisi olarak <u>{targetTenant}</u> firması hesabındasınız.
        </span>
      </div>

      <button
        onClick={handleExitImpersonation}
        style={{
          padding: '4px 12px',
          background: 'rgba(255, 255, 255, 0.2)',
          border: '1px solid rgba(255, 255, 255, 0.4)',
          borderRadius: '6px',
          color: '#fff',
          fontWeight: 800,
          fontSize: '0.75rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        <LogOut size={12} />
        <span>Yönetici Hesabına Geri Dön</span>
      </button>
    </div>
  );
};
