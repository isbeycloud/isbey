import React, { useState } from 'react';
import { TOOLBOX_ITEMS, type ToolboxItem } from './formDesignerTypes';

interface FormToolboxProps {
  onDragStart: (item: ToolboxItem) => void;
}

const GROUP_LABELS = {
  BASIC: 'Temel Elemanlar',
  ERP: 'ERP Bileşenleri',
  DOCUMENT: 'Belge Elemanları',
  LAYOUT: 'Düzen',
};

const GROUP_COLORS = {
  BASIC: '#1a56db',
  ERP: '#16a34a',
  DOCUMENT: '#d97706',
  LAYOUT: '#6b7280',
};

export const FormToolbox: React.FC<FormToolboxProps> = ({ onDragStart }) => {
  const [search, setSearch] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const filtered = search
    ? TOOLBOX_ITEMS.filter(i => i.label.toLowerCase().includes(search.toLowerCase()))
    : TOOLBOX_ITEMS;

  const groups = ['BASIC', 'ERP', 'DOCUMENT', 'LAYOUT'] as const;

  const toggleGroup = (g: string) => {
    setCollapsedGroups(prev => ({ ...prev, [g]: !prev[g] }));
  };

  return (
    <div className="fd-toolbox">
      <div className="fd-toolbox-header">
        🧰 Araç Kutusu
      </div>

      {/* Search */}
      <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-color)' }}>
        <input
          type="text"
          className="fd-prop-input"
          style={{ width: '100%' }}
          placeholder="Eleman ara..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="fd-toolbox-body">
        {groups.map(group => {
          const items = filtered.filter(i => i.group === group);
          if (items.length === 0) return null;
          const collapsed = collapsedGroups[group];
          return (
            <div key={group} style={{ marginBottom: 4 }}>
              {/* Group Header */}
              <div
                className="fd-tool-group-header"
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  cursor: 'pointer', userSelect: 'none',
                  padding: '5px 6px 3px 6px',
                }}
                onClick={() => toggleGroup(group)}
              >
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 16, height: 16, borderRadius: 3,
                  background: GROUP_COLORS[group] + '22',
                  color: GROUP_COLORS[group],
                  fontSize: 10, fontWeight: 700,
                }}>
                  {collapsed ? '▶' : '▼'}
                </span>
                <span style={{ color: GROUP_COLORS[group] }}>{GROUP_LABELS[group]}</span>
                <span style={{ marginLeft: 'auto', color: 'var(--text-light)', fontSize: 9 }}>{items.length}</span>
              </div>

              {!collapsed && items.map(item => (
                <ToolboxItemComponent
                  key={item.type}
                  item={item}
                  color={GROUP_COLORS[group]}
                  onDragStart={onDragStart}
                />
              ))}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div style={{ padding: '16px', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
            Sonuç bulunamadı
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div style={{
        padding: '6px 10px',
        borderTop: '1px solid var(--border-color)',
        fontSize: '10px',
        color: 'var(--text-light)',
        textAlign: 'center',
      }}>
        Elemanı canvas'a sürükleyin
      </div>
    </div>
  );
};

interface ToolboxItemProps {
  item: ToolboxItem;
  color: string;
  onDragStart: (item: ToolboxItem) => void;
}

const ToolboxItemComponent: React.FC<ToolboxItemProps> = ({ item, color, onDragStart }) => {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      className="fd-tool-item"
      draggable
      onDragStart={e => {
        e.dataTransfer.setData('application/form-element', JSON.stringify(item));
        e.dataTransfer.effectAllowed = 'copy';
        setIsDragging(true);
        onDragStart(item);
      }}
      onDragEnd={() => setIsDragging(false)}
      style={{
        opacity: isDragging ? 0.5 : 1,
        borderLeft: `2px solid ${isDragging ? color : 'transparent'}`,
      }}
    >
      {/* Icon */}
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 22, height: 22,
        background: color + '15',
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 700,
        color: color,
        flexShrink: 0,
        border: `1px solid ${color}22`,
      }}>
        {item.icon}
      </span>
      <span style={{ fontSize: '11.5px', flex: 1 }}>{item.label}</span>

      {/* Default size hint */}
      <span style={{ fontSize: '9px', color: 'var(--text-light)', fontFamily: 'var(--font-mono)' }}>
        {item.defaultWidth}×{item.defaultHeight}
      </span>
    </div>
  );
};
