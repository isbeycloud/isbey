import React, { useState } from 'react';
import {
  type FormElement,
  type FormSection,
  ELEMENT_TYPE_LABELS,
  FORMAT_OPTIONS,
  DATA_BINDING_TREE,
  type DataBindingNode,
} from './formDesignerTypes';

interface FormPropertiesProps {
  selectedElement: FormElement | null;
  selectedSection: FormSection | null;
  onElementChange: (updates: Partial<FormElement>) => void;
  onSectionChange: (updates: Partial<FormSection>) => void;
}

export const FormProperties: React.FC<FormPropertiesProps> = ({
  selectedElement,
  selectedSection,
  onElementChange,
  onSectionChange,
}) => {
  const [activeTab, setActiveTab] = useState<'PROPS' | 'STYLE' | 'DATA'>('PROPS');
  const [showDataPicker, setShowDataPicker] = useState(false);

  if (!selectedElement && !selectedSection) {
    return (
      <div className="fd-properties">
        <div className="fd-properties-header">⚙️ Özellikler</div>
        <div className="fd-properties-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div style={{ textAlign: 'center', color: 'var(--text-light)', fontSize: '11px' }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>🖱️</div>
            <div>Bir eleman veya bölüm seçin</div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Section Properties ───────────────────────────────────────────────────
  if (!selectedElement && selectedSection) {
    return (
      <div className="fd-properties">
        <div className="fd-properties-header">⚙️ Bölüm Özellikleri</div>
        <div className="fd-properties-body">
          <div className="fd-prop-group">
            <div className="fd-prop-group-title">BÖLÜM</div>

            <div className="fd-prop-row">
              <span className="fd-prop-label">Etiket</span>
              <input
                className="fd-prop-input"
                value={selectedSection.label}
                onChange={e => onSectionChange({ label: e.target.value })}
              />
            </div>

            <div className="fd-prop-row">
              <span className="fd-prop-label">Yükseklik</span>
              <input
                className="fd-prop-input"
                type="number"
                min={20}
                max={2000}
                value={selectedSection.height}
                onChange={e => onSectionChange({ height: Number(e.target.value) })}
              />
            </div>

            <div className="fd-prop-row">
              <span className="fd-prop-label">Görünür</span>
              <input
                type="checkbox"
                checked={selectedSection.visible}
                onChange={e => onSectionChange({ visible: e.target.checked })}
              />
            </div>

            <div className="fd-prop-row">
              <span className="fd-prop-label">Arka Plan</span>
              <input
                className="fd-prop-input"
                type="color"
                style={{ width: 48, height: 26, padding: '1px 2px' }}
                value={selectedSection.backgroundColor || '#ffffff'}
                onChange={e => onSectionChange({ backgroundColor: e.target.value })}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const el = selectedElement!;
  const p = el.props;

  const updateProp = (key: string, value: any) => {
    onElementChange({ props: { ...p, [key]: value } });
  };

  return (
    <div className="fd-properties">
      <div className="fd-properties-header">
        ⚙️ {ELEMENT_TYPE_LABELS[el.type]}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
        {(['PROPS', 'STYLE', 'DATA'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: '5px 4px',
              fontSize: '10px',
              fontWeight: 600,
              border: 'none',
              background: activeTab === tab ? 'var(--primary-light)' : 'transparent',
              color: activeTab === tab ? 'var(--primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
            }}
          >
            {tab === 'PROPS' ? 'Özellik' : tab === 'STYLE' ? 'Stil' : 'Veri'}
          </button>
        ))}
      </div>

      <div className="fd-properties-body">
        {/* ─── GEOMETRY (always shown) ─── */}
        <div className="fd-prop-group">
          <div className="fd-prop-group-title">KONUM & BOYUT</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[['X', 'x'], ['Y', 'y'], ['G', 'width'], ['Y', 'height']].map(([lbl, key], i) => (
              <div key={i}>
                <div style={{ fontSize: 9, color: 'var(--text-light)', marginBottom: 2 }}>
                  {i === 0 ? 'X' : i === 1 ? 'Y' : i === 2 ? 'Genişlik' : 'Yükseklik'}
                </div>
                <input
                  className="fd-prop-input"
                  type="number"
                  value={(el as any)[key]}
                  onChange={e => onElementChange({ [key]: Number(e.target.value) })}
                />
              </div>
            ))}
          </div>
          <div className="fd-prop-row" style={{ marginTop: 6 }}>
            <span className="fd-prop-label">Kilitli</span>
            <input
              type="checkbox"
              checked={el.locked || false}
              onChange={e => onElementChange({ locked: e.target.checked })}
            />
          </div>
        </div>

        {/* ─── PROPS TAB ─── */}
        {activeTab === 'PROPS' && (
          <div className="fd-prop-group">
            <div className="fd-prop-group-title">İÇERİK</div>

            {(el.type === 'LABEL' || el.type === 'TEXTBOX') && (
              <div className="fd-prop-row">
                <span className="fd-prop-label">Değer</span>
                <input
                  className="fd-prop-input"
                  value={p.value || ''}
                  onChange={e => updateProp('value', e.target.value)}
                  placeholder="Sabit metin..."
                />
              </div>
            )}

            {el.type === 'LABEL' && (
              <>
                <div className="fd-prop-row">
                  <span className="fd-prop-label">Veri Kaynağı</span>
                  <div style={{ flex: 1, display: 'flex', gap: 3 }}>
                    <input
                      className="fd-prop-input"
                      value={p.dataBinding || ''}
                      onChange={e => updateProp('dataBinding', e.target.value)}
                      placeholder="invoice.no..."
                      style={{ flex: 1 }}
                    />
                    <button
                      className="btn btn-xs btn-secondary"
                      onClick={() => setShowDataPicker(!showDataPicker)}
                      title="Veri kaynağı seç"
                    >
                      🔗
                    </button>
                  </div>
                </div>

                {showDataPicker && (
                  <div style={{
                    background: 'var(--bg-surface-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 6,
                    padding: 8,
                    maxHeight: 200,
                    overflowY: 'auto',
                    marginTop: 4,
                  }}>
                    <DataTree
                      nodes={DATA_BINDING_TREE}
                      onSelect={path => {
                        updateProp('dataBinding', path);
                        setShowDataPicker(false);
                      }}
                    />
                  </div>
                )}

                <div className="fd-prop-row">
                  <span className="fd-prop-label">Format</span>
                  <select
                    className="fd-prop-input"
                    value={p.format || ''}
                    onChange={e => updateProp('format', e.target.value)}
                  >
                    {FORMAT_OPTIONS.map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {el.type === 'DIVIDER' && (
              <>
                <div className="fd-prop-row">
                  <span className="fd-prop-label">Stil</span>
                  <select className="fd-prop-input" value={p.lineStyle || 'solid'} onChange={e => updateProp('lineStyle', e.target.value)}>
                    <option value="solid">Düz</option>
                    <option value="dashed">Kesik</option>
                    <option value="dotted">Noktalı</option>
                  </select>
                </div>
                <div className="fd-prop-row">
                  <span className="fd-prop-label">Kalınlık</span>
                  <input className="fd-prop-input" type="number" min={1} max={10} value={p.lineThickness || 1} onChange={e => updateProp('lineThickness', Number(e.target.value))} />
                </div>
                <div className="fd-prop-row">
                  <span className="fd-prop-label">Renk</span>
                  <input type="color" style={{ width: 48, height: 24 }} value={p.lineColor || '#000000'} onChange={e => updateProp('lineColor', e.target.value)} />
                </div>
              </>
            )}

            {el.type === 'IMAGE' && (
              <div className="fd-prop-row">
                <span className="fd-prop-label">URL</span>
                <input className="fd-prop-input" value={p.src || ''} onChange={e => updateProp('src', e.target.value)} placeholder="https://..." />
              </div>
            )}

            {(el.type === 'IMAGE' || el.type === 'LOGO') && (
              <div className="fd-prop-row">
                <span className="fd-prop-label">Hizalama</span>
                <select className="fd-prop-input" value={p.objectFit || 'contain'} onChange={e => updateProp('objectFit', e.target.value)}>
                  <option value="contain">Sığdır</option>
                  <option value="cover">Kapla</option>
                  <option value="fill">Doldur</option>
                </select>
              </div>
            )}

            {el.type === 'GROUP_BOX' && (
              <div className="fd-prop-row">
                <span className="fd-prop-label">Başlık</span>
                <input className="fd-prop-input" value={p.title || ''} onChange={e => updateProp('title', e.target.value)} />
              </div>
            )}

            {/* Visibility & Required */}
            {['LABEL', 'TEXTBOX', 'NUMBERBOX', 'DATEPICKER', 'COMBOBOX', 'CHECKBOX'].includes(el.type) && (
              <>
                <div className="fd-prop-row">
                  <span className="fd-prop-label">Zorunlu</span>
                  <input type="checkbox" checked={p.required || false} onChange={e => updateProp('required', e.target.checked)} />
                </div>
                <div className="fd-prop-row">
                  <span className="fd-prop-label">Salt Okunur</span>
                  <input type="checkbox" checked={p.readOnly || false} onChange={e => updateProp('readOnly', e.target.checked)} />
                </div>
                <div className="fd-prop-row">
                  <span className="fd-prop-label">Görünür</span>
                  <input type="checkbox" checked={p.visible !== false} onChange={e => updateProp('visible', e.target.checked)} />
                </div>
              </>
            )}
          </div>
        )}

        {/* ─── STYLE TAB ─── */}
        {activeTab === 'STYLE' && (
          <div className="fd-prop-group">
            <div className="fd-prop-group-title">TİPOGRAFİ</div>

            <div className="fd-prop-row">
              <span className="fd-prop-label">Font Boyutu</span>
              <input className="fd-prop-input" type="number" min={6} max={72} value={p.fontSize || 11} onChange={e => updateProp('fontSize', Number(e.target.value))} />
            </div>

            <div className="fd-prop-row">
              <span className="fd-prop-label">Kalınlık</span>
              <select className="fd-prop-input" value={p.fontWeight || 'normal'} onChange={e => updateProp('fontWeight', e.target.value)}>
                <option value="normal">Normal</option>
                <option value="500">Orta (500)</option>
                <option value="600">Semi-Bold</option>
                <option value="bold">Kalın</option>
                <option value="700">Çok Kalın (700)</option>
              </select>
            </div>

            <div className="fd-prop-row">
              <span className="fd-prop-label">Hizalama</span>
              <div style={{ display: 'flex', gap: 3 }}>
                {(['left', 'center', 'right'] as const).map(align => (
                  <button
                    key={align}
                    className={`btn btn-xs ${p.fontAlign === align ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => updateProp('fontAlign', align)}
                  >
                    {align === 'left' ? '◀' : align === 'center' ? '■' : '▶'}
                  </button>
                ))}
              </div>
            </div>

            <div className="fd-prop-group-title" style={{ marginTop: 10 }}>RENKLER</div>

            <div className="fd-prop-row">
              <span className="fd-prop-label">Metin</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="color" style={{ width: 36, height: 22, padding: '1px 2px' }} value={p.color || '#000000'} onChange={e => updateProp('color', e.target.value)} />
                <input className="fd-prop-input" value={p.color || ''} onChange={e => updateProp('color', e.target.value)} placeholder="#000000" />
              </div>
            </div>

            <div className="fd-prop-row">
              <span className="fd-prop-label">Arkaplan</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="color" style={{ width: 36, height: 22, padding: '1px 2px' }} value={p.backgroundColor || '#ffffff'} onChange={e => updateProp('backgroundColor', e.target.value)} />
                <input className="fd-prop-input" value={p.backgroundColor || ''} onChange={e => updateProp('backgroundColor', e.target.value)} placeholder="Şeffaf" />
              </div>
            </div>

            <div className="fd-prop-group-title" style={{ marginTop: 10 }}>KENAR BOŞLUĞU</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              <div>
                <div style={{ fontSize: 9, color: 'var(--text-light)', marginBottom: 2 }}>Yatay</div>
                <input className="fd-prop-input" type="number" min={0} value={p.paddingH || 0} onChange={e => updateProp('paddingH', Number(e.target.value))} />
              </div>
              <div>
                <div style={{ fontSize: 9, color: 'var(--text-light)', marginBottom: 2 }}>Dikey</div>
                <input className="fd-prop-input" type="number" min={0} value={p.paddingV || 0} onChange={e => updateProp('paddingV', Number(e.target.value))} />
              </div>
            </div>

            <div className="fd-prop-row" style={{ marginTop: 8 }}>
              <span className="fd-prop-label">Köşe Yuvarlama</span>
              <input className="fd-prop-input" type="number" min={0} max={50} value={p.borderRadius || 0} onChange={e => updateProp('borderRadius', Number(e.target.value))} />
            </div>
          </div>
        )}

        {/* ─── DATA TAB ─── */}
        {activeTab === 'DATA' && (
          <div className="fd-prop-group">
            <div className="fd-prop-group-title">VERİ KAYNAĞI</div>

            <div style={{ marginBottom: 8 }}>
              <div className="fd-prop-label" style={{ marginBottom: 4 }}>Bağlı Alan</div>
              <input
                className="fd-prop-input"
                style={{ width: '100%' }}
                value={p.dataBinding || ''}
                onChange={e => updateProp('dataBinding', e.target.value)}
                placeholder="örn: invoice.no"
              />
            </div>

            <div style={{ marginBottom: 8 }}>
              <div className="fd-prop-label" style={{ marginBottom: 4 }}>Format</div>
              <select
                className="fd-prop-input"
                style={{ width: '100%' }}
                value={p.format || ''}
                onChange={e => updateProp('format', e.target.value)}
              >
                {FORMAT_OPTIONS.map(f => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>

            <div className="fd-prop-group-title">BAĞLAMA AĞACI</div>
            <div style={{ maxHeight: 300, overflowY: 'auto', fontSize: 11.5 }}>
              <DataTree
                nodes={DATA_BINDING_TREE}
                onSelect={path => updateProp('dataBinding', path)}
                selected={p.dataBinding}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Data Binding Tree Component ─────────────────────────────────────────

interface DataTreeProps {
  nodes: DataBindingNode[];
  onSelect: (path: string) => void;
  selected?: string;
  depth?: number;
}

const DataTree: React.FC<DataTreeProps> = ({ nodes, onSelect, selected, depth = 0 }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <div className="fd-data-tree">
      {nodes.map(node => {
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = expanded[node.path];
        const isSelected = selected === node.path;

        return (
          <div key={node.path}>
            <div
              className={`fd-data-tree-node ${isSelected ? 'selected' : ''}`}
              style={{ paddingLeft: depth * 12 }}
              onClick={() => {
                if (hasChildren) {
                  setExpanded(prev => ({ ...prev, [node.path]: !prev[node.path] }));
                } else {
                  onSelect(node.path);
                }
              }}
            >
              {hasChildren && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 12 }}>
                  {isExpanded ? '▼' : '▶'}
                </span>
              )}
              {!hasChildren && <span style={{ width: 12, display: 'inline-block' }} />}

              {/* Type icon */}
              <span style={{ fontSize: 10, marginRight: 3, color: 'var(--text-light)' }}>
                {node.type === 'object' ? '📁' :
                  node.type === 'array' ? '📋' :
                    node.type === 'number' ? '#' :
                      node.type === 'date' ? '📅' : 'T'}
              </span>

              <span style={{ flex: 1 }}>{node.label}</span>

              {/* Format badge */}
              {node.format && (
                <span style={{
                  fontSize: 8, background: 'var(--primary-light)',
                  color: 'var(--primary)', padding: '1px 4px',
                  borderRadius: 3, fontFamily: 'var(--font-mono)',
                }}>
                  {node.format}
                </span>
              )}
            </div>

            {hasChildren && isExpanded && (
              <div className="fd-data-tree-children">
                <DataTree
                  nodes={node.children!}
                  onSelect={onSelect}
                  selected={selected}
                  depth={depth + 1}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
