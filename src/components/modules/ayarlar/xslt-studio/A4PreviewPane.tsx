import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ZoomOut, Printer, Ruler } from 'lucide-react';

/**
 * A4 Belge Görüntüleyici
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 2026-09-27: Stüdyo için yazıldı.
 *
 * ZOOM KURALI: Ölçek YALNIZCA görseldir. `transform: scale()` kullanılır ve
 * iframe'in kendi iç genişliği (820 px) DEĞİŞTİRİLMEZ. Neden: HTML çıktısı
 * basılı A4'e göre sabit genişlikte üretilir; iframe'i yeniden boyutlandırmak
 * dönüşümü yeniden çalıştırır ya da belgeyi yeniden akıtır ve "A4'te nasıl
 * görüneceği" yanıltıcı olur.
 *
 * `Fit Width` / `Fit Page` hesaplanır; sabit liste değildir ve pencere
 * boyutu değişince güncellenir.
 */

export type ZoomMode = number | 'fit-width' | 'fit-page';

export interface A4PreviewPaneProps {
  /** iframe'e verilecek HTML (istemci XSLT dönüşümünden gelir). */
  html: string;
  zoom: ZoomMode;
  onZoomChange: (z: ZoomMode) => void;
  /** Önizleme tazelenirken gösterilir. */
  busy?: boolean;
  /** Kağıt gölgesi / zemin. */
  showRuler?: boolean;
  /** iframe kimliği (yazdırma için dışarıdan erişilir). */
  frameId?: string;
  /** Yazdır düğmesine basıldığında. */
  onPrint?: () => void;
  /** Önizlemenin altında gösterilecek ek bilgi (ör. "3 Mart 2026 14:22 itibarıyla"). */
  footerInfo?: React.ReactNode;
  /** Belgenin üstünde gösterilecek uyarı (ör. yedek görünüm kullanılıyor). */
  notice?: React.ReactNode;
}

/** A4 @ 96 dpi — baskı standardı. */
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;
/** İç boşluk payı (mm cinsinden 10 mm ≈ 38 px). */
const GUTTER = 48;

const ZOOM_PRESETS: Array<{ label: string; value: ZoomMode }> = [
  { label: '%50', value: 50 },
  { label: '%75', value: 75 },
  { label: '%100', value: 100 },
  { label: '%125', value: 125 },
  { label: 'Genişliğe Sığdır', value: 'fit-width' },
  { label: 'Sayfaya Sığdır', value: 'fit-page' },
];

export const A4PreviewPane: React.FC<A4PreviewPaneProps> = ({
  html,
  zoom,
  onZoomChange,
  busy = false,
  showRuler = true,
  frameId = 'studio-preview-frame',
  onPrint,
  footerInfo,
  notice,
}) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });
  const [rulerOn, setRulerOn] = useState(showRuler);
  const [autoHeight, setAutoHeight] = useState<number | null>(null);

  // ── Görüntüleme alanı boyutunu izle (Fit Width / Fit Page için)
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => {
      setViewportSize({ w: el.clientWidth, h: el.clientHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = useMemo(() => {
    if (typeof zoom === 'number') return zoom / 100;
    if (viewportSize.w === 0) return 1;
    if (zoom === 'fit-width') {
      const usable = viewportSize.w - GUTTER * 2;
      return Math.max(0.15, Math.min(2, usable / A4_WIDTH_PX));
    }
    // fit-page: hem genişlik hem yükseklik sığmalı
    const usableW = viewportSize.w - GUTTER * 2;
    const usableH = viewportSize.h - GUTTER * 2;
    if (usableH <= 0) return Math.max(0.15, Math.min(2, usableW / A4_WIDTH_PX));
    return Math.max(0.15, Math.min(2, Math.min(usableW / A4_WIDTH_PX, usableH / A4_HEIGHT_PX)));
  }, [zoom, viewportSize]);

  const zoomPercent = Math.round(scale * 100);

  // ── iframe yüksekliğini içeriğe göre ayarla.
  // NEDEN: Belge A4'ten uzun olabilir (çok satırlı fatura). Sabit 1123 px
  // kırpma yapar ve kullanıcı alt satırları göremez. iframe içi belgeye
  // erişilebilir (srcDoc aynı kökenlidir) ve gerçek yüksekliği ölçülebilir.
  const handleFrameLoad = () => {
    const iframe = document.getElementById(frameId) as HTMLIFrameElement | null;
    try {
      const doc = iframe?.contentDocument;
      if (!doc) return;
      const h = Math.max(
        A4_HEIGHT_PX,
        doc.documentElement?.scrollHeight || 0,
        doc.body?.scrollHeight || 0
      );
      // Yalnız makul aralıkta kabul et; aşırı değer düzeni bozar.
      if (h > 0 && h < 60000) setAutoHeight(h);
    } catch {
      // Erişilemezse sabit A4 yüksekliği kullanılır — sessizce yut, ama
      // önizleme yine de gösterilir.
      setAutoHeight(null);
    }
  };

  useEffect(() => {
    setAutoHeight(null);
  }, [html]);

  const pageHeight = autoHeight ?? A4_HEIGHT_PX;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, minWidth: 0 }}>
      {/* ─── Araç çubuğu */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          padding: '5px 10px',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-color)',
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <ZoomOut size={13} style={{ color: 'var(--text-muted)' }} />
          {ZOOM_PRESETS.map(p => (
            <button
              key={String(p.value)}
              type="button"
              data-testid={`a4-zoom-${p.value}`}
              className={`btn btn-sm ${zoom === p.value ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => onZoomChange(p.value)}
              style={{ fontSize: '10px', padding: '2px 7px', height: '22px', whiteSpace: 'nowrap' }}
              title={
                p.value === 'fit-width'
                  ? 'Belgeyi görüntüleme alanı genişliğine sığdır'
                  : p.value === 'fit-page'
                    ? 'Tüm A4 sayfasını görünür alana sığdır'
                    : `Ölçek %${p.value}`
              }
            >
              {p.label}
            </button>
          ))}
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '4px', fontWeight: 700 }}>
            %{zoomPercent}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            type="button"
            className={`btn btn-sm ${rulerOn ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setRulerOn(v => !v)}
            style={{ fontSize: '10px', padding: '2px 7px', height: '22px', display: 'flex', alignItems: 'center', gap: '3px' }}
            title="Cetveli göster/gizle"
          >
            <Ruler size={11} /> Cetvel
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onPrint}
            style={{ fontSize: '10px', padding: '2px 8px', height: '22px', display: 'flex', alignItems: 'center', gap: '3px' }}
          >
            <Printer size={11} /> Yazdır
          </button>
        </div>
      </div>

      {notice}

      {/* ─── Kağıt alanı */}
      <div
        ref={viewportRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          background: 'var(--bg-surface-secondary)',
          position: 'relative',
        }}
      >
        {/* Cetvel (görsel yardımcı; ölçekle birlikte kayar) */}
        {rulerOn && (
          <div
            style={{
              position: 'sticky',
              top: 0,
              left: 0,
              height: '16px',
              background: 'var(--bg-surface)',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'flex-end',
              zIndex: 2,
              pointerEvents: 'none',
              overflow: 'hidden',
            }}
          >
            {Array.from({ length: 60 }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: `${(10 * scale).toFixed(1)}px`,
                  flexShrink: 0,
                  borderLeft: i % 5 === 0 ? '1px solid var(--border-strong)' : '1px solid var(--border-light)',
                  height: i % 5 === 0 ? '9px' : '5px',
                  marginLeft: `calc(${(A4_WIDTH_PX * scale).toFixed(0)}px / 60)`,
                }}
              />
            ))}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: `${GUTTER / 2}px ${GUTTER}px ${GUTTER}px`,
            minWidth: 'fit-content',
          }}
        >
          {/* Kağıt: transform ÖLÇEK; genişlik/yükseklik zoom'dan bağımsız sabit.
              transformOrigin 'top center' olduğu için ölçeklenince ortada kalır. */}
          <div
            style={{
              width: `${A4_WIDTH_PX}px`,
              height: `${pageHeight}px`,
              // 2026-09-13 notu korunuyor: '#ffffff' DOCUMENT — basılan A4 kağıdı.
              background: '#ffffff',
              boxShadow: '0 6px 22px rgba(0,0,0,0.14), 0 1px 3px rgba(0,0,0,0.08)',
              borderRadius: '2px',
              transform: `scale(${scale})`,
              transformOrigin: 'top center',
              transition: 'transform 0.12s ease',
              position: 'relative',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            <iframe
              id={frameId}
              srcDoc={html}
              onLoad={handleFrameLoad}
              // SANDBOX NOTU: `allow-scripts` ŞART — general.xslt ~21 KB gömülü
              // QR (JS) kütüphanesi taşır ve canvas üretimi bununla çalışır.
              // `allow-same-origin` ŞART — iframe içi belgenin gerçek
              // yüksekliğini ölçüp A4 sayfasını ona göre uzatıyoruz; onsuz
              // uzun faturaların altı kırpılır.
              // Kaynak: XSLT içeriği kimliği doğrulanmış kiracının KENDİ
              // şablonudur; sunucuda XXE/dış varlık açısından reddedilir
              // (bkz. EXTERNAL_ENTITY_PATTERNS) ve şablon dışı içerik geçemez.
              sandbox="allow-same-origin allow-scripts"
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              title="A4 Belge Önizleme"
            />
            {busy && (
              <div
                style={{
                  position: 'absolute',
                  top: '6px',
                  right: '6px',
                  fontSize: '10px',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: 'rgba(26,31,46,0.72)',
                  color: '#fff',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  pointerEvents: 'none',
                }}
              >
                <span className="spin" style={{ display: 'inline-block' }}>◌</span> Güncelleniyor
              </div>
            )}
          </div>
        </div>
      </div>

      {footerInfo && (
        <div
          style={{
            padding: '3px 10px',
            borderTop: '1px solid var(--border-color)',
            background: 'var(--bg-surface)',
            fontSize: '10.5px',
            color: 'var(--text-muted)',
            display: 'flex',
            justifyContent: 'space-between',
            gap: '10px',
            flexShrink: 0,
          }}
        >
          {footerInfo}
        </div>
      )}
    </div>
  );
};

export default A4PreviewPane;
