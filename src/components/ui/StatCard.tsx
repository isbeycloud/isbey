import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  changePercent?: number;
  changePeriod?: string;
  icon: React.ReactNode;
  iconBg?: string;
  iconColor?: string;
  accentColor?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  changePercent,
  changePeriod = 'önceki aya göre',
  icon,
  iconBg = 'var(--primary-light)',
  iconColor = 'var(--primary)',
  accentColor,
}) => {
  const isPositive = changePercent !== undefined ? changePercent >= 0 : null;

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-md, 8px)',
        padding: '18px 20px',
        boxShadow: 'var(--shadow-xs)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden',
        transition: 'transform 150ms ease, box-shadow 150ms ease',
      }}
      className="erp-stat-card"
    >
      {accentColor && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '3px',
            background: accentColor,
          }}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div>
          <span
            style={{
              fontSize: 'var(--fs-sm, 12px)',
              fontWeight: 700,
              color: 'var(--text-muted)',
              letterSpacing: '0.025em',
            }}
          >
            {title}
          </span>
          <div
            style={{
              fontSize: 'var(--fs-2xl, 26px)',
              fontWeight: 700,
              color: 'var(--text-main)',
              marginTop: '4px',
              letterSpacing: '-0.02em',
            }}
          >
            {value}
          </div>
        </div>

        <div
          style={{
            width: '42px',
            height: '42px',
            borderRadius: 'var(--radius-sm, 6px)',
            background: iconBg,
            color: iconColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--fs-sm, 12px)', marginTop: 'auto' }}>
        {changePercent !== undefined ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                fontWeight: 700,
                color: isPositive ? 'var(--success)' : 'var(--danger)',
                background: isPositive ? 'var(--success-bg)' : 'var(--danger-bg)',
                padding: '2px 6px',
                borderRadius: 'var(--radius-xs, 4px)',
              }}
            >
              {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              %{Math.abs(changePercent)}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>{changePeriod}</span>
          </div>
        ) : subtitle ? (
          <span style={{ color: 'var(--text-muted)' }}>{subtitle}</span>
        ) : <div />}
      </div>
    </div>
  );
};
