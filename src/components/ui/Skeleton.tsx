import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  circle?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = '16px',
  borderRadius = '4px',
  circle = false,
  style,
  className = '',
  ...props
}) => {
  return (
    <div
      style={{
        width: circle ? height : width,
        height,
        borderRadius: circle ? '50%' : borderRadius,
        background: 'var(--bg-surface-secondary)',
        backgroundSize: '200% 100%',
        animation: 'erp-skeleton-wave 1.5s infinite',
        ...style,
      }}
      className={`erp-skeleton ${className}`}
      {...props}
    />
  );
};
