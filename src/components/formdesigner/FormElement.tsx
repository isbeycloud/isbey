import React from 'react';
import {
  type FormElement,
  ELEMENT_TYPE_LABELS,
  formatValue,
} from './formDesignerTypes';

interface FormElementRendererProps {
  element: FormElement;
  isSelected: boolean;
  isDesignMode: boolean;
  previewData?: Record<string, any>;
  onClick?: (e: React.MouseEvent) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
}

export const FormElementRenderer: React.FC<FormElementRendererProps> = ({
  element,
  isSelected,
  isDesignMode,
  previewData,
  onClick,
  onMouseDown,
}) => {
  const { type, x, y, width, height, props: p } = element;

  // Resolve data binding
  const resolveValue = (binding?: string): any => {
    if (!binding || !previewData) return undefined;
    const parts = binding.split('.');
    let current: any = previewData;
    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      current = current[part];
    }
    return current;
  };

  const displayValue = p.dataBinding ? resolveValue(p.dataBinding) : p.value;
  const formattedValue = displayValue !== undefined ? formatValue(displayValue, p.format) : (p.value || (isDesignMode ? `[${ELEMENT_TYPE_LABELS[type]}]` : ''));

  const commonStyle: React.CSSProperties = {
    position: 'absolute',
    left: x,
    top: y,
    width,
    height,
    overflow: 'hidden',
    zIndex: element.zIndex || 1,
    cursor: isDesignMode ? (element.locked ? 'not-allowed' : 'move') : 'default',
    border: isDesignMode ? (isSelected ? '1.5px solid #1a56db' : '1px dashed transparent') : 'none',
    boxSizing: 'border-box',
    userSelect: 'none',
  };

  if (isDesignMode && isSelected) {
    (commonStyle as any).boxShadow = '0 0 0 2px rgba(26,86,219,0.25)';
  }
  if (isDesignMode && !isSelected && !element.locked) {
    (commonStyle as any)[':hover'] = { border: '1px dashed rgba(26,86,219,0.4)' };
  }

  const getContent = () => {
    switch (type) {
      case 'LABEL':
      case 'TEXTBOX':
      case 'NUMBERBOX':
        return (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              paddingLeft: p.paddingH || 0,
              paddingRight: p.paddingH || 0,
              paddingTop: p.paddingV || 0,
              paddingBottom: p.paddingV || 0,
              fontSize: p.fontSize || 11,
              fontWeight: p.fontWeight || 'normal',
              textAlign: p.fontAlign || 'left',
              color: p.color || '#000000',
              backgroundColor: p.backgroundColor,
              borderRadius: p.borderRadius,
              overflow: 'hidden',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {formattedValue}
          </div>
        );

      case 'LOGO':
        return (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: p.backgroundColor }}>
            {isDesignMode ? (
              <div style={{
                width: '100%', height: '100%',
                background: '#f0f4ff',
                border: '2px dashed #1a56db',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', gap: 4, color: '#1a56db', fontSize: 11,
              }}>
                <span style={{ fontSize: 22 }}>🏷️</span>
                <span>Şirket Logosu</span>
              </div>
            ) : (
              previewData?.company?.logoUrl
                ? <img src={previewData.company.logoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: p.objectFit || 'contain' }} />
                : <div style={{ width: '100%', height: '100%', background: '#f0f4ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1a56db', fontSize: 11 }}>Logo</div>
            )}
          </div>
        );

      case 'IMAGE':
        return (
          <div style={{ width: '100%', height: '100%' }}>
            {p.src
              ? <img src={p.src} alt="Resim" style={{ width: '100%', height: '100%', objectFit: p.objectFit || 'contain' }} />
              : <div style={{ width: '100%', height: '100%', background: '#f3f4f6', border: '2px dashed #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 11 }}>
                  🖼️ Resim
                </div>
            }
          </div>
        );

      case 'QRCODE':
        return (
          <div style={{
            width: '100%', height: '100%',
            background: '#ffffff',
            border: isDesignMode ? '1px dashed #9ca3af' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 2, color: '#6b7280', fontSize: 9,
          }}>
            {/* 2026-09-13 (tasarım sadeleştirmesi): bu tarama gradyanı KORUNDU — dekoratif
                dolgu değil, "QR Kod" yer tutucusunu temsil eden teknik tarama deseni. */}
            <div style={{
              width: Math.min(width - 8, height - 8),
              height: Math.min(width - 8, height - 8),
              background: 'repeating-linear-gradient(45deg, #000 0px, #000 4px, transparent 4px, transparent 8px), repeating-linear-gradient(-45deg, #000 0px, #000 4px, transparent 4px, transparent 8px)',
              backgroundSize: '8px 8px',
              opacity: 0.15,
            }} />
            {isDesignMode && <span>QR Kod</span>}
          </div>
        );

      case 'SIGNATURE':
        return (
          <div style={{
            width: '100%', height: '100%',
            border: '1px solid #d1d5db',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'flex-end',
            paddingBottom: 4, background: '#fafafa',
          }}>
            <div style={{ width: '80%', borderTop: '1px solid #000', paddingTop: 2, fontSize: 9, textAlign: 'center', color: '#475569' }}>İmza / Kaşe</div>
          </div>
        );

      case 'DIVIDER':
        return (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center',
          }}>
            <div style={{
              width: '100%',
              borderTop: `${p.lineThickness || 1}px ${p.lineStyle || 'solid'} ${p.lineColor || '#000000'}`,
            }} />
          </div>
        );

      case 'GROUP_BOX':
        return (
          <div style={{
            width: '100%', height: '100%',
            border: `1px solid ${p.color || '#d1d5db'}`,
            borderRadius: p.borderRadius || 0,
            backgroundColor: p.backgroundColor,
            position: 'relative',
          }}>
            {p.title && (
              <span style={{
                position: 'absolute', top: -9, left: 8,
                background: '#ffffff', padding: '0 4px',
                fontSize: p.fontSize || 10, color: p.color || '#475569',
                fontWeight: p.fontWeight || '600',
              }}>
                {p.title}
              </span>
            )}
          </div>
        );

      case 'PRODUCT_TABLE':
        return (
          <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr style={{ background: '#1a56db' }}>
                  {['Kod', 'Ürün Adı', 'Miktar', 'Birim', 'B.Fiyat', 'İskonto%', 'KDV%', 'Tutar'].map(h => (
                    <th key={h} style={{ padding: '3px 5px', color: '#ffffff', fontWeight: 600, textAlign: 'left', border: 'none' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isDesignMode
                  ? [1, 2, 3].map(i => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#f9fafb' : '#ffffff' }}>
                      {['P-001', 'Örnek Ürün ' + i, '1,00', 'Adet', '100,00 ₺', '%0', '%20', '120,00 ₺'].map((c, j) => (
                        <td key={j} style={{ padding: '2px 5px', borderBottom: '1px solid #e5e7eb', color: '#374151' }}>{c}</td>
                      ))}
                    </tr>
                  ))
                  : (previewData?.invoice?.lines || []).map((line: any, i: number) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#f9fafb' : '#ffffff' }}>
                      <td style={{ padding: '2px 5px', borderBottom: '1px solid #e5e7eb' }}>{line.productCode}</td>
                      <td style={{ padding: '2px 5px', borderBottom: '1px solid #e5e7eb' }}>{line.productName}</td>
                      <td style={{ padding: '2px 5px', borderBottom: '1px solid #e5e7eb' }}>{line.quantity}</td>
                      <td style={{ padding: '2px 5px', borderBottom: '1px solid #e5e7eb' }}>{line.unitOfMeasure || 'Adet'}</td>
                      <td style={{ padding: '2px 5px', borderBottom: '1px solid #e5e7eb', textAlign: 'right' }}>{formatValue(line.unitPrice, 'TR_CURRENCY')}</td>
                      <td style={{ padding: '2px 5px', borderBottom: '1px solid #e5e7eb', textAlign: 'right' }}>{line.discountRate}%</td>
                      <td style={{ padding: '2px 5px', borderBottom: '1px solid #e5e7eb', textAlign: 'right' }}>{line.vatRate}%</td>
                      <td style={{ padding: '2px 5px', borderBottom: '1px solid #e5e7eb', textAlign: 'right' }}>{formatValue(line.lineGrandTotal, 'TR_CURRENCY')}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        );

      case 'TOTALS_TABLE':
        const inv = previewData?.invoice;
        const rows = [
          ['Ara Toplam', formatValue(inv?.subtotal || 0, 'TR_CURRENCY')],
          ['İskonto', '-' + formatValue(inv?.discountTotal || 0, 'TR_CURRENCY')],
          ['KDV', formatValue(inv?.vatTotal || 0, 'TR_CURRENCY')],
          ['GENEL TOPLAM', formatValue(inv?.grandTotal || 0, 'TR_CURRENCY')],
        ];
        return (
          <div style={{ width: '100%', height: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <tbody>
                {(isDesignMode
                  ? [['Ara Toplam', '1.000,00 ₺'], ['İskonto', '-0,00 ₺'], ['KDV (%20)', '200,00 ₺'], ['GENEL TOPLAM', '1.200,00 ₺']]
                  : rows
                ).map(([label, value], i) => (
                  <tr key={i} style={i === rows.length - 1 ? { background: '#1a56db' } : {}}>
                    <td style={{ padding: '3px 8px', border: '1px solid #e5e7eb', fontWeight: i === rows.length - 1 ? 700 : 400, color: i === rows.length - 1 ? '#fff' : '#374151' }}>{label}</td>
                    <td style={{ padding: '3px 8px', border: '1px solid #e5e7eb', textAlign: 'right', fontWeight: i === rows.length - 1 ? 700 : 400, color: i === rows.length - 1 ? '#fff' : '#374151', fontFamily: 'monospace' }}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case 'CUSTOMER_FIELD':
        return (
          <div style={{ width: '100%', height: '100%', border: '1px solid #e5e7eb', borderRadius: 4, padding: '4px 8px', background: '#fafafa' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#374151', marginBottom: 2 }}>
              {isDesignMode ? 'Cari Unvan / Müşteri Adı' : (previewData?.customer?.title || 'Müşteri Seçilmedi')}
            </div>
            <div style={{ fontSize: 9, color: '#6b7280' }}>
              {isDesignMode ? 'VD: Kadıköy | VKN: 123 456 789' : (previewData?.customer?.taxInfo || '')}
            </div>
            <div style={{ fontSize: 9, color: '#6b7280' }}>
              {isDesignMode ? 'Adres: Örnek Mah. No: 1 İstanbul' : (previewData?.customer?.address || '')}
            </div>
          </div>
        );

      case 'SPACER':
        // 2026-09-13 (tasarım sadeleştirmesi): bu tarama gradyanı KORUNDU — dekoratif
        // dolgu değil, tasarım modundaki "boşluk" (spacer) yer tutucu deseni.
        return (
          <div style={{
            width: '100%', height: '100%',
            background: isDesignMode ? 'repeating-linear-gradient(45deg, #f3f4f6, #f3f4f6 5px, transparent 5px, transparent 10px)' : 'transparent',
            border: isDesignMode ? '1px dashed #d1d5db' : 'none',
          }} />
        );

      default:
        return (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#f3f4f6', border: '1px dashed #d1d5db',
            fontSize: 10, color: '#9ca3af',
          }}>
            {ELEMENT_TYPE_LABELS[type]}
          </div>
        );
    }
  };

  return (
    <div
      style={commonStyle}
      onClick={onClick}
      onMouseDown={onMouseDown}
      data-element-id={element.id}
    >
      {getContent()}

      {/* Resize handles (design mode only) */}
      {isDesignMode && isSelected && !element.locked && (
        <>
          <div className="fd-resize-handle se" data-handle="se" />
          <div className="fd-resize-handle ne" data-handle="ne" />
          <div className="fd-resize-handle sw" data-handle="sw" />
          <div className="fd-resize-handle nw" data-handle="nw" />
          <div className="fd-resize-handle n" data-handle="n" />
          <div className="fd-resize-handle s" data-handle="s" />
          <div className="fd-resize-handle e" data-handle="e" />
          <div className="fd-resize-handle w" data-handle="w" />
        </>
      )}
    </div>
  );
};
