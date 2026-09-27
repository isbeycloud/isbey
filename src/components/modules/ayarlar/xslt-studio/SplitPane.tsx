import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Sürükleyerek bölünebilen iki panelli yerleşim.
 *
 * NEDEN: Kullanıcı XSLT yazarken önizlemeyi aynı anda görmek ister. Sabit
 * yüzdeler (ör. %50/%50) 1366 px ekranda kodu sıkıştırır, 1920 px'te
 * önizlemeyi gereksiz küçültür. Bölücü sürüklenebilir olmalı ve tercih
 * hatırlanmalıdır.
 *
 * Uygulama teması değişkenlerini kullanır (--border-color, --bg-surface...).
 */

export interface SplitPaneProps {
  left: React.ReactNode;
  right: React.ReactNode;
  /** Sol panelin başlangıç oranı (0-1). */
  initialRatio?: number;
  minLeftPx?: number;
  minRightPx?: number;
  /** Oran değiştiğinde (tercihi saklamak için). */
  onRatioChange?: (ratio: number) => void;
  /** localStorage anahtarı — verilmezse tercih saklanmaz. */
  storageKey?: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const SplitPane: React.FC<SplitPaneProps> = ({
  left,
  right,
  initialRatio = 0.52,
  minLeftPx = 280,
  minRightPx = 320,
  onRatioChange,
  storageKey,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [ratio, setRatio] = useState<number>(() => {
    if (!storageKey) return initialRatio;
    const raw = localStorage.getItem(storageKey);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0.1 && n < 0.9 ? n : initialRatio;
  });
  const [dragging, setDragging] = useState(false);

  const apply = useCallback((next: number) => {
    const host = hostRef.current;
    if (!host) return;
    const total = host.clientWidth;
    if (total <= 0) return;
    const minR = minLeftPx / total;
    const maxR = 1 - minRightPx / total;
    const safe = clamp(next, Math.min(minR, maxR), Math.max(minR, maxR));
    setRatio(safe);
    if (storageKey) localStorage.setItem(storageKey, String(safe));
    onRatioChange?.(safe);
  }, [minLeftPx, minRightPx, onRatioChange, storageKey]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const host = hostRef.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      apply((e.clientX - rect.left) / rect.width);
    };
    const onUp = () => setDragging(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, apply]);

  // Pencere küçülünce oranı yeniden sınırla (panel kaybolmasın).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => apply(ratio));
    ro.observe(host);
    return () => ro.disconnect();
  }, [apply, ratio]);

  return (
    <div
      ref={hostRef}
      style={{
        display: 'flex',
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        position: 'relative',
        // Sürükleme sırasında metin seçimini engelle.
        userSelect: dragging ? 'none' : 'auto',
      }}
    >
      <div style={{ width: `${ratio * 100}%`, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {left}
      </div>

      {/* Bölücü */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Panelleri yeniden boyutlandır"
        onPointerDown={onPointerDown}
        onDoubleClick={() => apply(initialRatio)}
        title="Sürükleyerek boyutlandır · Çift tıkla: varsayılana dön"
        style={{
          width: '7px',
          flexShrink: 0,
          cursor: 'col-resize',
          background: dragging ? 'var(--primary)' : 'var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: dragging ? 'none' : 'background 0.15s',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <div
          style={{
            width: '3px',
            height: '34px',
            borderRadius: '2px',
            background: dragging ? 'rgba(255,255,255,0.85)' : 'var(--border-strong)',
          }}
        />
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>{right}</div>
    </div>
  );
};

export default SplitPane;
