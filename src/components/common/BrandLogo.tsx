import type { CSSProperties } from 'react';

/** The supplied master artwork, displayed consistently without redrawing it. */
export function BrandLogo({ compact = false, width = 220, style }: {
  compact?: boolean; width?: number; style?: CSSProperties;
}) {
  return <svg role="img" aria-label="İŞBEY CLOUD" viewBox={compact ? '280 20 980 980' : '65 125 2050 480'}
    style={{ width: compact ? 36 : width, maxWidth: '100%', height: 'auto', display: 'inline-block',
      verticalAlign: 'middle', background: '#fff', borderRadius: 6, flexShrink: 0, ...style }}>
    <image href={compact ? '/brand/isbey-cloud-icon.png' : '/brand/isbey-cloud-logo.png'}
      width={compact ? 1536 : 2172} height={compact ? 1024 : 724} />
  </svg>;
}
