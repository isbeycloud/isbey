import React from 'react';
import { ShieldOff, ArrowLeft, Home } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { AppView } from '../../context/AppContext';

interface AccessDeniedViewProps {
  moduleId?: string;
  returnView?: AppView;
}

/**
 * FAZ 17 — Yetki reddedildiğinde gösterilen ekran.
 * Frontend guard olarak App.tsx içinde, URL/activeView manipülasyonuna karşı.
 * Not: Backend authorization da ayrıca çalışmaktadır.
 */
export const AccessDeniedView: React.FC<AccessDeniedViewProps> = ({
  moduleId,
  returnView = 'dashboard',
}) => {
  const { setActiveView, setActiveRibbonTab } = useApp();

  const handleGoBack = () => {
    setActiveView(returnView);
    setActiveRibbonTab('ANASAYFA');
  };

  const handleGoHome = () => {
    setActiveView('dashboard');
    setActiveRibbonTab('ANASAYFA');
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: '400px',
        padding: '48px 24px',
        textAlign: 'center',
        background: 'var(--bg-surface-secondary)',
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: '80px',
          height: '80px',
          borderRadius: 'var(--radius-lg, 10px)',
          background: 'var(--danger-bg)',
          border: '1px solid var(--danger-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '24px',
        }}
      >
        <ShieldOff size={36} color="var(--danger)" strokeWidth={1.5} />
      </div>

      {/* Başlık */}
      <h2
        style={{
          fontSize: 'var(--fs-xl, 20px)',
          fontWeight: 700,
          color: 'var(--text-main)',
          marginBottom: '12px',
          letterSpacing: '-0.02em',
        }}
      >
        Erişim Yetkisi Yok
      </h2>

      {/* Açıklama */}
      <p
        style={{
          fontSize: 'var(--fs-base, 13px)',
          color: 'var(--text-muted)',
          maxWidth: '400px',
          lineHeight: 1.7,
          marginBottom: '8px',
        }}
      >
        Bu modüle erişmek için gerekli yetkiye sahip değilsiniz.
      </p>

      {moduleId && (
        <p
          style={{
            fontSize: 'var(--fs-sm, 12px)',
            color: 'var(--text-muted)',
            marginBottom: '32px',
            fontFamily: 'monospace',
            background: 'var(--bg-surface-secondary)',
            padding: '4px 12px',
            borderRadius: 'var(--radius-sm, 6px)',
          }}
        >
          Modül: <strong>{moduleId}</strong>
        </p>
      )}

      {/* Bilgi kutusu */}
      <div
        style={{
          background: 'var(--info-bg)',
          border: '1px solid var(--info-border)',
          borderRadius: 'var(--radius-md, 8px)',
          padding: '14px 20px',
          maxWidth: '420px',
          marginBottom: '32px',
          textAlign: 'left',
        }}
      >
        <p style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--info)', fontWeight: 700, marginBottom: '6px' }}>
          Bu ekrana nasıl erişebilirim?
        </p>
        <p style={{ fontSize: 'var(--fs-base, 13px)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Firma yöneticinizden veya platform yöneticisinden bu modül için yetki talebinde bulunabilirsiniz.
          Yetkiniz güncellendiğinde tekrar giriş yaparak erişebilirsiniz.
        </p>
      </div>

      {/* Butonlar */}
      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          onClick={handleGoBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            borderRadius: 'var(--radius-sm, 6px)',
            border: '1px solid var(--border-color)',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: 'var(--fs-base, 13px)',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 150ms',
          }}
        >
          <ArrowLeft size={16} />
          Geri Dön
        </button>

        <button
          onClick={handleGoHome}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            borderRadius: 'var(--radius-sm, 6px)',
            border: 'none',
            background: 'var(--primary)',
            color: '#ffffff',
            fontSize: 'var(--fs-base, 13px)',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 150ms',
          }}
        >
          <Home size={16} />
          Ana Sayfaya Git
        </button>
      </div>

      {/* Güvenlik notu */}
      <p
        style={{
          fontSize: 'var(--fs-xs, 11px)',
          color: 'var(--text-muted)',
          marginTop: '32px',
          maxWidth: '360px',
        }}
      >
        Bu erişim denemesi sistem kayıtlarına işlenmiştir.
      </p>
    </div>
  );
};
