import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'neutral';
  size?: 'sm' | 'md';
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
  dot = false,
  style,
  className = '',
  ...props
}) => {
  const getVariantStyles = (): { bg: string; text: string; border: string; dotBg: string } => {
    switch (variant) {
      case 'success':
        return { bg: 'var(--success-bg)', text: 'var(--success-text)', border: 'var(--success-border)', dotBg: 'var(--success)' };
      case 'warning':
        return { bg: 'var(--warning-bg)', text: 'var(--warning-text)', border: 'var(--warning-border)', dotBg: 'var(--warning)' };
      case 'danger':
        return { bg: 'var(--danger-bg)', text: 'var(--danger-text)', border: 'var(--danger-border)', dotBg: 'var(--danger)' };
      case 'info':
        return { bg: 'var(--info-bg)', text: 'var(--info-text)', border: 'var(--info-border)', dotBg: 'var(--info)' };
      case 'accent':
        // 2026-09-13: Turuncu accent literalleri uyarı token'larına bağlandı (açık temada tek kaynak).
        return { bg: 'var(--warning-bg)', text: 'var(--warning-text)', border: 'var(--warning-border)', dotBg: 'var(--warning)' };
      case 'primary':
        return { bg: 'var(--primary-light)', text: 'var(--primary)', border: 'var(--primary-glow)', dotBg: 'var(--primary)' };
      case 'secondary':
      case 'neutral':
      default:
        return { bg: 'var(--bg-surface-secondary)', text: 'var(--text-muted)', border: 'var(--border-color)', dotBg: 'var(--text-muted)' };
    }
  };

  const v = getVariantStyles();

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        fontWeight: 700,
        fontSize: size === 'sm' ? 'var(--fs-xs, 11px)' : 'var(--fs-sm, 12px)',
        padding: size === 'sm' ? '2px 6px' : '3px 8px',
        borderRadius: 'var(--radius-xs, 4px)',
        background: v.bg,
        color: v.text,
        border: `1px solid ${v.border}`,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        ...style,
      }}
      className={`erp-badge ${className}`}
      {...props}
    >
      {dot && (
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: v.dotBg,
          }}
        />
      )}
      {children}
    </span>
  );
};
