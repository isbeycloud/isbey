import type { CSSProperties } from 'react';

/** The supplied master artwork, displayed consistently without redrawing it. */
export function BrandLogo({ compact = false, width = 220, style }: {
  compact?: boolean; width?: number; style?: CSSProperties;
}) {
  return <svg role="img" aria-label="İŞBEY CLOUD" viewBox={compact ? '65 125 540 480' : '65 125 2050 480'}
    style={{ width: compact ? 36 : width, maxWidth: '100%', height: 'auto', display: 'inline-block',
      verticalAlign: 'middle', background: '#fff', borderRadius: 6, flexShrink: 0, ...style }}>
    <image href="/brand/isbey-cloud-logo.png" width="2172" height="724" />
  </svg>;
}
