import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'danger' | 'success' | 'outline' | 'ghost';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  isLoading,
  disabled,
  style,
  className = '',
  ...props
}) => {
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'primary':
        return {
          background: 'var(--primary)',
          color: '#ffffff',
          border: '1px solid var(--primary)',
        };
      case 'secondary':
        return {
          background: 'var(--bg-surface)',
          color: 'var(--text-main)',
          border: '1px solid var(--border-color)',
        };
      case 'accent':
        return {
          background: 'var(--primary)',
          color: '#ffffff',
          border: '1px solid var(--primary)',
        };
      case 'danger':
        return {
          background: 'var(--danger)',
          color: '#ffffff',
          border: '1px solid var(--danger)',
        };
      case 'success':
        return {
          background: 'var(--success)',
          color: '#ffffff',
          border: '1px solid var(--success)',
        };
      case 'outline':
        return {
          background: 'transparent',
          color: 'var(--primary)',
          border: '1px solid var(--border-color)',
        };
      case 'ghost':
        return {
          background: 'transparent',
          color: 'var(--text-muted)',
          border: 'none',
        };
      default:
        return {};
    }
  };

  const getSizeStyles = (): React.CSSProperties => {
    switch (size) {
      case 'xs':
        return { padding: '3px 8px', fontSize: 'var(--fs-xs, 11px)', gap: '4px', borderRadius: 'var(--radius-xs, 4px)' };
      case 'sm':
        return { padding: '5px 12px', fontSize: 'var(--fs-sm, 12px)', gap: '6px', borderRadius: 'var(--radius-sm, 6px)' };
      case 'md':
        return { padding: '8px 16px', fontSize: 'var(--fs-base, 13px)', gap: '8px', borderRadius: 'var(--radius-sm, 6px)' };
      case 'lg':
        return { padding: '10px 20px', fontSize: 'var(--fs-lg, 16px)', gap: '10px', borderRadius: 'var(--radius-md, 8px)' };
    }
  };

  return (
    <button
      disabled={disabled || isLoading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
        opacity: disabled || isLoading ? 0.6 : 1,
        transition: 'all 150ms ease-in-out',
        fontFamily: 'inherit',
        ...getVariantStyles(),
        ...getSizeStyles(),
        ...style,
      }}
      className={`erp-btn ${className}`}
      {...props}
    >
      {isLoading ? (
        <span className="erp-spinner-inline" />
      ) : (
        <>
          {icon && iconPosition === 'left' && <span className="erp-btn-icon">{icon}</span>}
          {children && <span>{children}</span>}
          {icon && iconPosition === 'right' && <span className="erp-btn-icon">{icon}</span>}
        </>
      )}
    </button>
  );
};
