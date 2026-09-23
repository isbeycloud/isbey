import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  header?: React.ReactNode;
  headerAction?: React.ReactNode;
  footer?: React.ReactNode;
  noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  header,
  headerAction,
  footer,
  noPadding = false,
  style,
  className = '',
  ...props
}) => {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-md, 8px)',
        boxShadow: 'var(--shadow-xs)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'transform 150ms ease, box-shadow 150ms ease',
        ...style,
      }}
      className={`erp-card ${className}`}
      {...props}
    >
      {header && (
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-surface-secondary)',
          }}
          className="erp-card-header"
        >
          <div style={{ fontWeight: 700, fontSize: 'var(--fs-md, 14px)', color: 'var(--text-main)' }}>
            {header}
          </div>
          {headerAction && <div>{headerAction}</div>}
        </div>
      )}

      <div
        style={{
          padding: noPadding ? 0 : '18px',
          flex: 1,
        }}
        className="erp-card-body"
      >
        {children}
      </div>

      {footer && (
        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid var(--border-color)',
            background: 'var(--bg-surface-secondary)',
          }}
          className="erp-card-footer"
        >
          {footer}
        </div>
      )}
    </div>
  );
};
