import React, { useMemo, useRef, useState } from 'react';
import {
  Type,
  Hash,
  Minus,
  MoveVertical,
  Image as ImageIcon,
  Table2,
  Sigma,
  Landmark,
  QrCode,
  Barcode,
  PenLine,
  StickyNote,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Copy,
  Layers,
  AlertTriangle,
} from 'lucide-react';
import {
  BINDING_CATEGORIES,
  PRODUCT_COLUMN_DEFS,
  UBL_BINDINGS,
  makeBlock,
  makeColumn,
  makeRow,
  makeSection,
  type BlockKind,
  type VisualBlock,
  type VisualDesignDoc,
  type VisualSection,
} from './visualDesign';
import { describeCoverage, unusedColumnWarning } from './visualToXslt';

/**
 * Görsel Tasarım Modu
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 2026-09-27: XSLT Stüdyosu'nun üçüncü modu.
 *
 * TASARIM KARARI — "GÜVENLİ MODEL" NEDEN BÖYLE:
 * Kullanıcı serbest piksel yerine bölüm → satır → kolon → blok ağacı düzenler.
 * Her blok, gerçek UBL alanlarından birine bağlanır (UBL_BINDINGS). Ürün
 * tablosu özel bir bloktur: satırları `cac:InvoiceLine` döngüsüdür ve
 * KORUNUR — kullanıcı yalnız sütun seçer/genişletir.
 *
 * KULLANICIYA DÜRÜSTLÜK: Bazı bloklar (logo, imza, IBAN tablosu, QR) UBL
 * belgesinde yer almaz; şablon yapılandırmasından veya sistem şablonundan
 * gelir. Bunlar görsel modda YER TUTUCU olarak üretilir ve üstte sarı bir
 * şeritle AÇIKÇA bildirilir. "Çalışıyor gibi gösterme" kuralı burada geçerli.
 */

export interface GorselTasarimModuProps {
  doc: VisualDesignDoc;
  onChange: (next: VisualDesignDoc) => void;
  /** Derleme sonucu uyarıları (üst şeritte gösterilir). */
  warnings: string[];
  problems: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Blok paleti
// ─────────────────────────────────────────────────────────────────────────────

interface PaletteItem {
  kind: BlockKind;
  label: string;
  icon: React.ReactNode;
  group: 'Temel Alanlar' | 'Fatura' | 'Müşteri' | 'İçerik' | 'Toplamlar' | 'Diğer';
  hint: string;
}

const PALETTE: PaletteItem[] = [
  { kind: 'text', label: 'Metin', icon: <Type size={13} />, group: 'Temel Alanlar', hint: 'Sabit metin veya başlık' },
  { kind: 'field', label: 'Alan', icon: <Hash size={13} />, group: 'Temel Alanlar', hint: 'UBL belgesinden bir değer' },
  { kind: 'divider', label: 'Ayırıcı', icon: <Minus size={13} />, group: 'Temel Alanlar', hint: 'Yatay çizgi' },
  { kind: 'spacer', label: 'Boşluk', icon: <MoveVertical size={13} />, group: 'Temel Alanlar', hint: 'Dikey boşluk' },
  { kind: 'image', label: 'Logo', icon: <ImageIcon size={13} />, group: 'Fatura', hint: 'Firma logosu' },
  { kind: 'invoice-table', label: 'Ürün Tablosu', icon: <Table2 size={13} />, group: 'Fatura', hint: 'InvoiceLine döngüsü' },
  { kind: 'barcode', label: 'Barkod', icon: <Barcode size={13} />, group: 'Fatura', hint: 'Barkod' },
  { kind: 'qr', label: 'QR Kod', icon: <QrCode size={13} />, group: 'Fatura', hint: 'GİB QR alanı' },
  { kind: 'signature', label: 'İmza / Kaşe', icon: <PenLine size={13} />, group: 'Fatura', hint: 'Kaşe ve imza' },
  { kind: 'totals-table', label: 'Toplamlar', icon: <Sigma size={13} />, group: 'Toplamlar', hint: 'KDV ve genel toplam' },
  { kind: 'bank-table', label: 'Banka / IBAN', icon: <Landmark size={13} />, group: 'Diğer', hint: 'IBAN listesi' },
  { kind: 'conditional-note', label: 'Koşullu Not', icon: <StickyNote size={13} />, group: 'İçerik', hint: 'Alan boşsa gizlenir' },
];

const PALETTE_GROUPS: PaletteItem['group'][] = ['Temel Alanlar', 'Fatura', 'Müşteri', 'İçerik', 'Toplamlar', 'Diğer'];

// ─────────────────────────────────────────────────────────────────────────────
// Yardımcılar (immutable güncellemeler — bkz. coding-style.md)
// ─────────────────────────────────────────────────────────────────────────────

function mapSections(doc: VisualDesignDoc, fn: (s: VisualSection, i: number) => VisualSection): VisualDesignDoc {
  return { ...doc, sections: doc.sections.map(fn) };
}

function removeBlock(doc: VisualDesignDoc, blockId: string): VisualDesignDoc {
  return mapSections(doc, s => ({
    ...s,
    rows: s.rows.map(r => ({
      ...r,
      columns: r.columns.map(c => ({ ...c, blocks: c.blocks.filter(b => b.id !== blockId) })),
    })),
  }));
}

function updateBlock(doc: VisualDesignDoc, blockId: string, patch: Partial<VisualBlock>): VisualDesignDoc {
  return mapSections(doc, s => ({
    ...s,
    rows: s.rows.map(r => ({
      ...r,
      columns: r.columns.map(c => ({
        ...c,
        blocks: c.blocks.map(b => (b.id === blockId ? { ...b, ...patch, style: patch.style ? { ...b.style, ...patch.style } : b.style } : b)),
      })),
    })),
  }));
}

function moveBlock(doc: VisualDesignDoc, blockId: string, dir: -1 | 1): VisualDesignDoc {
  return mapSections(doc, s => ({
    ...s,
    rows: s.rows.map(r => ({
      ...r,
      columns: r.columns.map(c => {
        const i = c.blocks.findIndex(b => b.id === blockId);
        if (i < 0) return c;
        const j = i + dir;
        if (j < 0 || j >= c.blocks.length) return c;
        const next = [...c.blocks];
        [next[i], next[j]] = [next[j], next[i]];
        return { ...c, blocks: next };
      }),
    })),
  }));
}

/**
 * Bloğu bulunduğu kolondan çıkarıp hedef kolonun sonuna taşır.
 * Kaynak==hedef ise HİÇBİR ŞEY yapmaz (sıra değişmez; yeniden sıralama için
 * yukarı/aşağı düğmeleri vardır — burada sessizce yer değiştirmek şaşırtıcı olur).
 */
function moveBlockToColumn(doc: VisualDesignDoc, blockId: string, sectionId: string, columnId: string): VisualDesignDoc {
  let sourceColId: string | null = null;
  let block: VisualBlock | null = null;
  for (const s of doc.sections) for (const r of s.rows) for (const c of r.columns) {
    const found = c.blocks.find(b => b.id === blockId);
    if (found) { sourceColId = c.id; block = found; }
  }
  if (!block) return doc;
  if (sourceColId === columnId) return doc;

  const withoutBlock = removeBlock(doc, blockId);
  return insertBlockInto(withoutBlock, sectionId, columnId, block);
}

function duplicateBlock(doc: VisualDesignDoc, blockId: string): VisualDesignDoc {
  return mapSections(doc, s => ({
    ...s,
    rows: s.rows.map(r => ({
      ...r,
      columns: r.columns.map(c => {
        const i = c.blocks.findIndex(b => b.id === blockId);
        if (i < 0) return c;
        const copy: VisualBlock = { ...c.blocks[i], id: `${c.blocks[i].id}-k${Date.now().toString(36)}` };
        const next = [...c.blocks];
        next.splice(i + 1, 0, copy);
        return { ...c, blocks: next };
      }),
    })),
  }));
}

/**
 * Belirli bir kolonun SONUNA blok ekler (sürükle-bırak hedefi).
 * Kolon bulunamazsa `appendBlock`'a düşer — blok asla sessizce kaybolmaz.
 */
function insertBlockInto(doc: VisualDesignDoc, sectionId: string, columnId: string, block: VisualBlock): VisualDesignDoc {
  let found = false;
  const next = mapSections(doc, s => {
    if (s.id !== sectionId) return s;
    return {
      ...s,
      rows: s.rows.map(r => {
        if (!r.columns.some(c => c.id === columnId)) return r;
        found = true;
        return { ...r, columns: r.columns.map(c => (c.id === columnId ? { ...c, blocks: [...c.blocks, block] } : c)) };
      }),
    };
  });
  return found ? next : appendBlock(doc, sectionId, block);
}

function appendBlock(doc: VisualDesignDoc, sectionId: string | null, block: VisualBlock): VisualDesignDoc {
  if (doc.sections.length === 0) {
    const sec = makeSection('Yeni Bölüm');
    sec.rows[0].columns[0].blocks.push(block);
    return { ...doc, sections: [...doc.sections, sec] };
  }
  const targetId = sectionId || doc.sections[0].id;
  return mapSections(doc, s => {
    if (s.id !== targetId) return s;
    if (s.rows.length === 0) {
      const r = makeRow();
      r.columns[0].blocks.push(block);
      return { ...s, rows: [r] };
    }
    const lastRow = s.rows[s.rows.length - 1];
    const lastColIndex = lastRow.columns.length - 1;
    const idx = s.rows.length - 1;
    return {
      ...s,
      rows: s.rows.map((r, i) =>
        i === idx
          ? { ...r, columns: r.columns.map((c, ci) => (ci === lastColIndex ? { ...c, blocks: [...c.blocks, block] } : c)) }
          : r
      ),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Blok önizleme (editör tuvalinde gösterilen temsil)
// ─────────────────────────────────────────────────────────────────────────────

const BLOCK_ICON: Record<BlockKind, React.ReactNode> = {
  text: <Type size={12} />,
  field: <Hash size={12} />,
  divider: <Minus size={12} />,
  spacer: <MoveVertical size={12} />,
  image: <ImageIcon size={12} />,
  'invoice-table': <Table2 size={12} />,
  'totals-table': <Sigma size={12} />,
  'bank-table': <Landmark size={12} />,
  qr: <QrCode size={12} />,
  barcode: <Barcode size={12} />,
  signature: <PenLine size={12} />,
  'conditional-note': <StickyNote size={12} />,
};

const BLOCK_LABEL: Record<BlockKind, string> = {
  text: 'Metin',
  field: 'Alan',
  divider: 'Ayırıcı',
  spacer: 'Boşluk',
  image: 'Görsel',
  'invoice-table': 'Ürün Tablosu',
  'totals-table': 'Toplamlar',
  'bank-table': 'Banka / IBAN',
  qr: 'QR Kod',
  barcode: 'Barkod',
  signature: 'İmza / Kaşe',
  'conditional-note': 'Koşullu Not',
};

function blockTitle(b: VisualBlock): string {
  if (b.kind === 'field' || b.kind === 'conditional-note') {
    const bind = UBL_BINDINGS.find(x => x.key === b.bind);
    return bind ? bind.label : '(bağlayıcı seçilmedi)';
  }
  if (b.kind === 'text') return b.text ? `"${b.text.slice(0, 24)}${b.text.length > 24 ? '…' : ''}"` : 'Metin';
  return BLOCK_LABEL[b.kind];
}

/** Yer tutucu (gerçek verisi olmayan) bloklar — kullanıcı bunu bilmeli. */
const PLACEHOLDER_KINDS: BlockKind[] = ['image', 'bank-table', 'qr', 'barcode', 'signature'];

// ─────────────────────────────────────────────────────────────────────────────
// Bileşen
// ─────────────────────────────────────────────────────────────────────────────

export const GorselTasarimModu: React.FC<GorselTasarimModuProps> = ({ doc, onChange, warnings, problems }) => {
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(doc.sections[0]?.id ?? null);
  /** Sürükleme sırasında hedef kolonu vurgulamak için. */
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  /** Paletten sürüklenen bileşen türü (dataTransfer okumak yerine ref'te tutulur). */
  const draggingKind = useRef<BlockKind | null>(null);
  /** Tuval içinde taşınan mevcut bloğun kimliği. */
  const movingBlockId = useRef<string | null>(null);

  const selected = useMemo(() => {
    for (const s of doc.sections) for (const r of s.rows) for (const c of r.columns) {
      const b = c.blocks.find(x => x.id === selectedBlockId);
      if (b) return b;
    }
    return null;
  }, [doc, selectedBlockId]);

  const coverage = useMemo(() => describeCoverage(doc), [doc]);
  const colWarning = useMemo(() => unusedColumnWarning(doc.productColumns), [doc.productColumns]);
  const colTotal = doc.productColumns.filter(c => c.enabled).reduce((a, c) => a + Number(c.widthPercent || 0), 0);

  const updateBase = (patch: Partial<VisualDesignDoc['base']>) =>
    onChange({ ...doc, base: { ...doc.base, ...patch } });

  const updateColumn = (key: string, patch: Partial<{ enabled: boolean; widthPercent: number; label: string; align: 'left' | 'center' | 'right' }>) =>
    onChange({
      ...doc,
      productColumns: doc.productColumns.map(c => (c.key === key ? { ...c, ...patch } : c)),
    });

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0 }}>
      {/* ═══ SOL: Bileşen paleti ═══ */}
      <div
        style={{
          width: '232px',
          flexShrink: 0,
          borderRight: '1px solid var(--border-color)',
          background: 'var(--bg-surface)',
          overflowY: 'auto',
          padding: '8px',
        }}
      >
        <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
          Bileşenler
        </div>

        {PALETTE_GROUPS.map(group => {
          const items = PALETTE.filter(p => p.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--primary)', marginBottom: '4px' }}>{group}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {items.map(it => (
                  <button
                    key={it.kind}
                    type="button"
                    data-testid={`palette-${it.kind}`}
                    draggable
                    onDragStart={e => {
                      draggingKind.current = it.kind;
                      // Bazı tarayıcılar dataTransfer olmadan sürüklemeyi
                      // başlatmaz; metin de yazıyoruz ama asıl kaynak ref.
                      e.dataTransfer.setData('text/plain', `isbey-block:${it.kind}`);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onDragEnd={() => { draggingKind.current = null; setDropTarget(null); }}
                    onClick={() => onChange(appendBlock(doc, activeSectionId, makeBlock(it.kind)))}
                    title={`${it.hint} — tuvale sürükleyin veya tıklayın (seçili bölümün sonuna eklenir)`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px', width: '100%',
                      padding: '5px 7px', borderRadius: 'var(--radius-sm)', cursor: 'grab',
                      background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)',
                      color: 'var(--text-main)', fontSize: '11px', textAlign: 'left',
                    }}
                  >
                    <span style={{ color: 'var(--text-muted)', display: 'flex' }}>{it.icon}</span>
                    <span style={{ flex: 1 }}>{it.label}</span>
                    <Plus size={11} style={{ color: 'var(--text-muted)' }} />
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '8px', marginTop: '4px' }}>
          <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px' }}>
            Belge Geneli
          </div>
          <label style={{ display: 'block', fontSize: '10px', marginBottom: '5px' }}>
            Yazı Tipi
            <input
              type="text"
              className="form-control form-control-sm"
              value={doc.base.fontFamily}
              onChange={e => updateBase({ fontFamily: e.target.value })}
              style={{ fontSize: '10.5px', marginTop: '2px' }}
            />
          </label>
          <label style={{ display: 'block', fontSize: '10px', marginBottom: '5px' }}>
            Yazı Boyutu ({doc.base.fontSize}px)
            <input
              type="range" min={8} max={16} step={0.5} value={doc.base.fontSize}
              onChange={e => updateBase({ fontSize: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
          </label>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '5px' }}>
            <label style={{ fontSize: '10px', flex: 1 }}>
              Ana Renk
              <input
                type="color" value={doc.base.primaryColor}
                onChange={e => updateBase({ primaryColor: e.target.value })}
                style={{ width: '100%', height: '22px', padding: 0, border: '1px solid var(--border-color)', borderRadius: '4px' }}
              />
            </label>
            <label style={{ fontSize: '10px', flex: 1 }}>
              İkincil
              <input
                type="color" value={doc.base.secondaryColor}
                onChange={e => updateBase({ secondaryColor: e.target.value })}
                style={{ width: '100%', height: '22px', padding: 0, border: '1px solid var(--border-color)', borderRadius: '4px' }}
              />
            </label>
          </div>
        </div>
      </div>

      {/* ═══ ORTA: Tasarım tuvali ═══ */}
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', background: 'var(--bg-surface-secondary)', padding: '10px' }}>
        {/* Dürüstlük şeridi: gerçek verisi olmayan bloklar */}
        {(warnings.length > 0 || problems.length > 0 || colWarning) && (
          <div
            style={{
              background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--warning) 35%, transparent)',
              borderRadius: 'var(--radius-sm)',
              padding: '7px 10px',
              marginBottom: '10px',
              fontSize: '10.5px',
              lineHeight: 1.5,
              color: 'var(--text-main)',
            }}
          >
            <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px', marginBottom: problems.length || colWarning ? '4px' : 0 }}>
              <AlertTriangle size={12} /> Görsel tasarım sınırları
            </div>
            {problems.length > 0 && (
              <ul style={{ margin: '0 0 3px 16px', padding: 0 }}>
                {problems.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            )}
            {colWarning && <div style={{ marginBottom: '3px' }}>• {colWarning}</div>}
            {warnings.length > 0 && (
              <ul style={{ margin: 0, marginLeft: '16px', padding: 0 }}>
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </div>
        )}

        {doc.sections.map((section, si) => (
          <div
            key={section.id}
            onMouseDown={() => setActiveSectionId(section.id)}
            style={{
              border: `1px solid ${activeSectionId === section.id ? 'var(--primary)' : 'var(--border-color)'}`,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-surface)',
              marginBottom: '10px',
              overflow: 'hidden',
            }}
          >
            {/* Bölüm başlığı */}
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 8px',
                background: 'var(--bg-surface-secondary)', borderBottom: '1px solid var(--border-color)',
              }}
            >
              <Layers size={12} style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={section.title}
                onChange={e => onChange(mapSections(doc, (s, i) => (i === si ? { ...s, title: e.target.value } : s)))}
                style={{
                  flex: 1, fontSize: '11px', fontWeight: 700, background: 'transparent',
                  border: 'none', outline: 'none', color: 'var(--text-main)',
                }}
              />
              <label style={{ fontSize: '9.5px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <input
                  type="checkbox"
                  checked={!!section.pageBreakAfter}
                  onChange={e => onChange(mapSections(doc, (s, i) => (i === si ? { ...s, pageBreakAfter: e.target.checked } : s)))}
                />
                Sayfa sonu
              </label>
              <button
                type="button" className="btn btn-secondary btn-sm"
                onClick={() => onChange(mapSections(doc, (s, i) => (i === si ? { ...s, rows: [...s.rows, makeRow()] } : s)))}
                style={{ fontSize: '9.5px', padding: '1px 6px', height: '20px' }} title="Bu bölüme satır ekle"
              >
                <Plus size={10} /> Satır
              </button>
              <button
                type="button" className="btn btn-secondary btn-sm"
                onClick={() => onChange({ ...doc, sections: doc.sections.filter((_, i) => i !== si) })}
                style={{ fontSize: '9.5px', padding: '1px 6px', height: '20px' }} title="Bölümü sil"
              >
                <Trash2 size={10} />
              </button>
            </div>

            {/* Satırlar */}
            {section.rows.map(row => (
              <div key={row.id} style={{ display: 'flex', gap: `${row.style?.gap ?? 0}px`, padding: '5px', alignItems: 'flex-start' }}>
                {row.columns.map(col => (
                  <div
                    key={col.id}
                    data-testid={`column-${col.id}`}
                    onDragEnter={e => {
                      if (!draggingKind.current && !movingBlockId.current) return;
                      e.preventDefault();
                      setDropTarget(col.id);
                    }}
                    onDragOver={e => {
                      if (!draggingKind.current && !movingBlockId.current) return;
                      // Varsayılan davranış drop'u ENGELLER.
                      e.preventDefault();
                      e.dataTransfer.dropEffect = draggingKind.current ? 'copy' : 'move';
                    }}
                    onDragLeave={() => setDropTarget(prev => (prev === col.id ? null : prev))}
                    onDrop={e => {
                      e.preventDefault();
                      const kind = draggingKind.current;
                      const movingId = movingBlockId.current;
                      draggingKind.current = null;
                      movingBlockId.current = null;
                      setDropTarget(null);
                      if (kind) {
                        onChange(insertBlockInto(doc, section.id, col.id, makeBlock(kind)));
                      } else if (movingId) {
                        onChange(moveBlockToColumn(doc, movingId, section.id, col.id));
                      }
                    }}
                    style={{
                      width: `${col.widthPercent}%`, boxSizing: 'border-box',
                      border: dropTarget === col.id
                        ? '2px solid var(--primary)'
                        : '1px dashed var(--border-light)',
                      background: dropTarget === col.id ? 'var(--primary-light)' : undefined,
                      borderRadius: 'var(--radius-sm)',
                      padding: '4px', minHeight: '34px',
                      transition: 'background 0.1s, border-color 0.1s',
                    }}
                  >
                    {col.blocks.length === 0 && (
                      <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', textAlign: 'center', padding: '7px 0' }}>
                        Boş — soldan bileşen ekleyin
                      </div>
                    )}
                    {col.blocks.map(b => {
                      const isSel = b.id === selectedBlockId;
                      const isPlaceholder = PLACEHOLDER_KINDS.includes(b.kind);
                      return (
                        <div
                          key={b.id}
                          data-testid={`block-${b.id}`}
                          onMouseDown={e => { e.stopPropagation(); setSelectedBlockId(b.id); setActiveSectionId(section.id); }}
                          draggable
                          onDragStart={e => {
                            e.stopPropagation();
                            e.dataTransfer.setData('text/plain', `isbey-move:${b.id}`);
                            e.dataTransfer.effectAllowed = 'move';
                            // Palet sürüklemesiyle karışmaması için kind'ı
                            // TEMİZLE: bu bir taşıma, yeni blok değil.
                            draggingKind.current = null;
                            movingBlockId.current = b.id;
                          }}
                          onDragEnd={() => { movingBlockId.current = null; setDropTarget(null); }}
                          title="Başka bir kolona sürükleyerek taşıyabilirsiniz"
                          style={{
                            display: 'flex', alignItems: 'center', gap: '5px',
                            padding: '4px 6px', marginBottom: '3px', borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer', fontSize: '10.5px',
                            border: `1px solid ${isSel ? 'var(--primary)' : 'var(--border-color)'}`,
                            background: isSel ? 'var(--primary-light)' : 'var(--bg-surface)',
                            color: isSel ? 'var(--primary)' : 'var(--text-main)',
                          }}
                        >
                          <span style={{ display: 'flex', opacity: 0.75 }}>{BLOCK_ICON[b.kind]}</span>
                          <span style={{ fontWeight: 600 }}>{BLOCK_LABEL[b.kind]}</span>
                          <span style={{ flex: 1, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {blockTitle(b)}
                          </span>
                          {isPlaceholder && (
                            <span
                              title="Bu bloğun verisi UBL belgesinde yer almaz; sistem şablonundan/şablon ayarlarından gelir. Görsel tasarımda yer tutucu olarak gösterilir."
                              style={{ fontSize: '8.5px', background: 'color-mix(in srgb, var(--warning) 22%, transparent)', color: 'var(--warning)', padding: '0 4px', borderRadius: '3px', fontWeight: 700 }}
                            >
                              YER TUTUCU
                            </span>
                          )}
                          <button type="button" className="btn btn-secondary btn-sm"
                            onMouseDown={e => e.stopPropagation()}
                            onClick={() => onChange(moveBlock(doc, b.id, -1))}
                            style={{ fontSize: '9px', padding: '0 3px', height: '17px' }} title="Yukarı taşı">
                            <ChevronUp size={9} />
                          </button>
                          <button type="button" className="btn btn-secondary btn-sm"
                            onMouseDown={e => e.stopPropagation()}
                            onClick={() => onChange(moveBlock(doc, b.id, 1))}
                            style={{ fontSize: '9px', padding: '0 3px', height: '17px' }} title="Aşağı taşı">
                            <ChevronDown size={9} />
                          </button>
                          <button type="button" className="btn btn-secondary btn-sm"
                            onMouseDown={e => e.stopPropagation()}
                            onClick={() => onChange(duplicateBlock(doc, b.id))}
                            style={{ fontSize: '9px', padding: '0 3px', height: '17px' }} title="Çoğalt">
                            <Copy size={9} />
                          </button>
                          <button type="button" className="btn btn-secondary btn-sm"
                            onMouseDown={e => e.stopPropagation()}
                            onClick={() => { onChange(removeBlock(doc, b.id)); if (isSel) setSelectedBlockId(null); }}
                            style={{ fontSize: '9px', padding: '0 3px', height: '17px' }} title="Sil">
                            <Trash2 size={9} />
                          </button>
                        </div>
                      );
                    })}

                    {/* Kolon içi ekleme kısayolu */}
                    <button
                      type="button"
                      onMouseDown={e => e.stopPropagation()}
                      onClick={() => onChange(appendBlock(doc, section.id, makeBlock('field')))}
                      style={{
                        width: '100%', fontSize: '9.5px', padding: '2px', marginTop: '2px',
                        background: 'transparent', border: '1px dashed var(--border-light)',
                        borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', cursor: 'pointer',
                      }}
                    >
                      + alan
                    </button>
                  </div>
                ))}

                {/* Kolon ekleme */}
                <button
                  type="button"
                  onClick={() =>
                    onChange(mapSections(doc, s =>
                      s.id === section.id
                        ? { ...s, rows: s.rows.map(rr => (rr.id === row.id
                            ? (() => {
                                const n = rr.columns.length + 1;
                                const each = Math.round((100 / n) * 10) / 10;
                                return { ...rr, columns: [...rr.columns.map(c => ({ ...c, widthPercent: each })), makeColumn(each)] };
                              })()
                            : rr)) }
                        : s
                    ))
                  }
                  title="Bu satıra kolon ekle"
                  style={{
                    flexShrink: 0, width: '24px', alignSelf: 'stretch',
                    background: 'transparent', border: '1px dashed var(--border-light)',
                    borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px',
                  }}
                >
                  <Plus size={11} />
                </button>
              </div>
            ))}

            {section.rows.length === 0 && (
              <div style={{ padding: '10px', fontSize: '10.5px', color: 'var(--text-muted)', textAlign: 'center' }}>
                Bu bölümde satır yok. Yukarıdan "Satır" ekleyin.
              </div>
            )}
          </div>
        ))}

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            const sec = makeSection(`Bölüm ${doc.sections.length + 1}`);
            onChange({ ...doc, sections: [...doc.sections, sec] });
            setActiveSectionId(sec.id);
          }}
          style={{ fontSize: '11px', width: '100%', marginBottom: '10px' }}
        >
          <Plus size={12} /> Yeni Bölüm Ekle
        </button>

        {/* Ürün tablosu sütunları */}
        <div className="card-panel" style={{ padding: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-main)' }}>
              Ürün Tablosu Sütunları
            </div>
            <div style={{ fontSize: '10px', color: Math.abs(colTotal - 100) > 5 ? 'var(--warning)' : 'var(--text-muted)', fontWeight: 700 }}>
              Toplam %{Math.round(colTotal)}
            </div>
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '7px', lineHeight: 1.45 }}>
            Satırlar her zaman <code>cac:InvoiceLine</code> döngüsüdür — sütun eklemek döngüyü bozmaz.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {PRODUCT_COLUMN_DEFS.map(def => {
              const col = doc.productColumns.find(c => c.key === def.key);
              if (!col) return null;
              return (
                <div key={def.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10.5px' }}>
                  <input
                    type="checkbox"
                    checked={col.enabled}
                    onChange={e => updateColumn(def.key, { enabled: e.target.checked })}
                  />
                  <span style={{ flex: 1 }}>{def.label}</span>
                  <input
                    type="number" min={4} max={60} step={1}
                    value={col.widthPercent}
                    disabled={!col.enabled}
                    onChange={e => updateColumn(def.key, { widthPercent: Number(e.target.value) })}
                    style={{ width: '48px', fontSize: '10px', opacity: col.enabled ? 1 : 0.45 }}
                  />
                  <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>%</span>
                  <select
                    value={col.align}
                    disabled={!col.enabled}
                    onChange={e => updateColumn(def.key, { align: e.target.value as 'left' | 'center' | 'right' })}
                    style={{ fontSize: '10px', opacity: col.enabled ? 1 : 0.45 }}
                  >
                    <option value="left">Sol</option>
                    <option value="center">Orta</option>
                    <option value="right">Sağ</option>
                  </select>
                </div>
              );
            })}
          </div>
        </div>

        {/* Kapsam raporu */}
        <div className="card-panel" style={{ padding: '10px', marginTop: '10px' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
            Tasarımın Kapsadığı Alanlar
          </div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-main)', lineHeight: 1.6 }}>
            <div style={{ marginBottom: '3px' }}>
              <strong style={{ color: 'var(--success)' }}>Kullanılan ({coverage.covered.length}):</strong>{' '}
              {coverage.covered.length ? coverage.covered.join(', ') : '—'}
            </div>
            <div>
              <strong style={{ color: 'var(--text-muted)' }}>Kullanılmayan ({coverage.notCovered.length}):</strong>{' '}
              {coverage.notCovered.length ? coverage.notCovered.join(', ') : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ SAĞ: Özellik paneli ═══ */}
      <div
        style={{
          width: '248px', flexShrink: 0, borderLeft: '1px solid var(--border-color)',
          background: 'var(--bg-surface)', overflowY: 'auto', padding: '8px',
        }}
      >
        <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
          Özellikler
        </div>

        {!selected && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6, padding: '8px 0' }}>
            Düzenlemek için soldaki tuvalden bir bileşen seçin. Bileşen eklemek için en soldaki
            "Bileşenler" panelini kullanın.
          </div>
        )}

        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--primary)' }}>
              {BLOCK_LABEL[selected.kind]}
            </div>

            {/* Bağlayıcı seçimi */}
            {(selected.kind === 'field' || selected.kind === 'conditional-note') && (
              <label style={{ fontSize: '10.5px', fontWeight: 600 }}>
                Bağlı Alan
                <select
                  className="form-control form-control-sm"
                  value={selected.bind || ''}
                  onChange={e => onChange(updateBlock(doc, selected.id, { bind: e.target.value }))}
                  style={{ fontSize: '10.5px', marginTop: '3px' }}
                >
                  <option value="">— seçilmedi —</option>
                  {BINDING_CATEGORIES.map(cat => {
                    const items = UBL_BINDINGS.filter(b => b.category === cat);
                    if (items.length === 0) return null;
                    return (
                      <optgroup key={cat} label={cat}>
                        {items.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
                      </optgroup>
                    );
                  })}
                </select>
                <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {UBL_BINDINGS.find(b => b.key === selected.bind)?.detail || 'UBL belgesinden okunacak alan'}
                </div>
              </label>
            )}

            {selected.kind === 'conditional-note' && (
              <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Alan <strong>boşsa bu bölüm çıktıda hiç görünmez</strong> (XSLT <code>xsl:if</code> ile).
              </div>
            )}

            {selected.kind === 'text' && (
              <label style={{ fontSize: '10.5px', fontWeight: 600 }}>
                Metin
                <textarea
                  className="form-control form-control-sm"
                  rows={2}
                  value={selected.text || ''}
                  onChange={e => onChange(updateBlock(doc, selected.id, { text: e.target.value }))}
                  style={{ fontSize: '10.5px', marginTop: '3px' }}
                />
              </label>
            )}

            {selected.kind === 'image' && (
              <label style={{ fontSize: '10.5px', fontWeight: 600 }}>
                Görsel Türü
                <select
                  className="form-control form-control-sm"
                  value={selected.src === 'signature' ? 'signature' : 'logo'}
                  onChange={e => onChange(updateBlock(doc, selected.id, { src: e.target.value }))}
                  style={{ fontSize: '10.5px', marginTop: '3px' }}
                >
                  <option value="logo">Firma Logosu</option>
                  <option value="signature">İmza / Kaşe</option>
                </select>
              </label>
            )}

            {/* Tipografi */}
            {(selected.kind === 'field' || selected.kind === 'text' || selected.kind === 'conditional-note') && (
              <>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <label style={{ fontSize: '10.5px', flex: 1 }}>
                    Boyut (px)
                    <input
                      type="number" min={6} max={40} step={0.5}
                      value={selected.style?.fontSize ?? doc.base.fontSize}
                      onChange={e => onChange(updateBlock(doc, selected.id, { style: { fontSize: Number(e.target.value) } }))}
                      style={{ width: '100%', fontSize: '10.5px', marginTop: '2px' }}
                    />
                  </label>
                  <label style={{ fontSize: '10.5px', flex: 1 }}>
                    Renk
                    <input
                      type="color"
                      value={selected.style?.color || doc.base.color}
                      onChange={e => onChange(updateBlock(doc, selected.id, { style: { color: e.target.value } }))}
                      style={{ width: '100%', height: '24px', padding: 0, marginTop: '2px', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                    />
                  </label>
                </div>

                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${selected.style?.fontWeight === 'bold' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => onChange(updateBlock(doc, selected.id, { style: { fontWeight: selected.style?.fontWeight === 'bold' ? 'normal' : 'bold' } }))}
                    style={{ flex: 1, fontSize: '10.5px' }}
                  ><strong>K</strong></button>
                  <button
                    type="button"
                    className={`btn btn-sm ${selected.style?.fontStyle === 'italic' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => onChange(updateBlock(doc, selected.id, { style: { fontStyle: selected.style?.fontStyle === 'italic' ? 'normal' : 'italic' } }))}
                    style={{ flex: 1, fontSize: '10.5px' }}
                  ><em>İ</em></button>
                  {(['left', 'center', 'right'] as const).map(a => (
                    <button
                      key={a}
                      type="button"
                      className={`btn btn-sm ${selected.style?.textAlign === a ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => onChange(updateBlock(doc, selected.id, { style: { textAlign: a } }))}
                      style={{ flex: 1, fontSize: '10.5px' }}
                    >
                      {a === 'left' ? 'Sol' : a === 'center' ? 'Orta' : 'Sağ'}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Görünüm */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '7px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Görünüm</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <label style={{ fontSize: '10px', flex: 1 }}>
                  Üst boşluk
                  <input
                    type="number" min={0} max={120}
                    value={selected.style?.marginTop ?? 0}
                    onChange={e => onChange(updateBlock(doc, selected.id, { style: { marginTop: Number(e.target.value) } }))}
                    style={{ width: '100%', fontSize: '10px', marginTop: '2px' }}
                  />
                </label>
                <label style={{ fontSize: '10px', flex: 1 }}>
                  Alt boşluk
                  <input
                    type="number" min={0} max={120}
                    value={selected.style?.marginBottom ?? 0}
                    onChange={e => onChange(updateBlock(doc, selected.id, { style: { marginBottom: Number(e.target.value) } }))}
                    style={{ width: '100%', fontSize: '10px', marginTop: '2px' }}
                  />
                </label>
              </div>
              <div style={{ display: 'flex', gap: '4px', marginTop: '5px' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${selected.style?.borderTop ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => onChange(updateBlock(doc, selected.id, { style: { borderTop: !selected.style?.borderTop } }))}
                  style={{ flex: 1, fontSize: '10px' }}
                >Üst çizgi</button>
                <button
                  type="button"
                  className={`btn btn-sm ${selected.style?.borderBottom ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => onChange(updateBlock(doc, selected.id, { style: { borderBottom: !selected.style?.borderBottom } }))}
                  style={{ flex: 1, fontSize: '10px' }}
                >Alt çizgi</button>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => { onChange(removeBlock(doc, selected.id)); setSelectedBlockId(null); }}
              style={{ fontSize: '10.5px', marginTop: '4px' }}
            >
              <Trash2 size={11} /> Bileşeni Sil
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default GorselTasarimModu;
