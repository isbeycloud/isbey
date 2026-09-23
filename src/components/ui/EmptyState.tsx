import React from 'react';
import { PackageOpen } from 'lucide-react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        textAlign: 'center',
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-md, 8px)',
        border: '1px dashed var(--border-color)',
        margin: '16px 0',
      }}
      className="erp-empty-state"
    >
      <div
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'var(--bg-surface-secondary)',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '16px',
          border: '1px solid var(--border-color)',
        }}
      >
        {icon || <PackageOpen size={28} />}
      </div>

      <h3
        style={{
          margin: '0 0 6px',
          fontSize: 'var(--fs-lg, 16px)',
          fontWeight: 700,
          color: 'var(--text-main)',
        }}
      >
        {title}
      </h3>

      {description && (
        <p
          style={{
            margin: '0 0 18px',
            fontSize: 'var(--fs-base, 13px)',
            color: 'var(--text-muted)',
            maxWidth: '400px',
          }}
        >
          {description}
        </p>
      )}

      {actionLabel && onAction && (
        <Button variant="accent" size="sm" icon={actionIcon} onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
