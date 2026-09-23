import React, { useState, useEffect, useCallback } from 'react';
import {
  Save, Eye, EyeOff, Undo2, Redo2, Download, Upload,
  Plus, Trash2, Copy, RefreshCw, ArrowLeft, Settings,
  Layers, FileText, CheckCircle, XCircle,
} from 'lucide-react';
import type {
  FormDesign,
  FormSection,
  FormElement,
  ToolboxItem,
} from './formDesignerTypes';
import {
  SECTION_TYPE_LABELS,
  PAPER_SIZES,
  DOCUMENT_TYPE_LABELS,
} from './formDesignerTypes';
import { FormToolbox } from './FormToolbox';
import { FormCanvas } from './FormCanvas';
import { FormProperties } from './FormProperties';
import { useFormHistory } from './useFormHistory';
import { useToast } from '../../context/ToastContext';
import { api } from '../../services/api';

interface FormDesignerViewProps {
  designId?: string | null;
  onBack: () => void;
}

const generateId = () => 'el-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
const generateSectionId = () => 'sec-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);

export const FormDesignerView: React.FC<FormDesignerViewProps> = ({ designId, onBack }) => {
  const { showToast } = useToast();
  const [design, setDesign] = useState<FormDesign | null>(null);
  const [sections, setSections] = useState<FormSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [zoom, setZoom] = useState(80); // percentage
  const [activeTab, setActiveTab] = useState<'CANVAS' | 'SECTIONS'>('CANVAS');

  const history = useFormHistory(sections);

  // Load design
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        if (designId) {
          const res = await api.getFormDesign(designId);
          if (res.success && res.formDesign) {
            setDesign(res.formDesign);
            setSections(res.formDesign.sections || []);
            history.reset(res.formDesign.sections || []);
          } else {
            showToast('Form tasarımı yüklenemedi.', 'error');
          }
        } else {
          // New design
          const newDesign: FormDesign = {
            id: '',
            name: 'Yeni Form Tasarımı',
            documentType: 'INVOICE_SALES',
            version: 1,
            isDefault: false,
            isBuiltIn: false,
            paperSize: 'A4',
            orientation: 'portrait',
            marginTop: 10, marginBottom: 10, marginLeft: 15, marginRight: 15,
            sections: [
              { id: generateSectionId(), type: 'HEADER', label: 'Başlık', order: 1, height: 120, visible: true, elements: [] },
              { id: generateSectionId(), type: 'CUSTOMER', label: 'Müşteri', order: 2, height: 100, visible: true, elements: [] },
              { id: generateSectionId(), type: 'LINES', label: 'Ürünler', order: 3, height: 350, visible: true, elements: [] },
              { id: generateSectionId(), type: 'TOTALS', label: 'Toplam', order: 4, height: 120, visible: true, elements: [] },
              { id: generateSectionId(), type: 'FOOTER', label: 'Alt Bilgi', order: 5, height: 80, visible: true, elements: [] },
            ],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          setDesign(newDesign);
          setSections(newDesign.sections);
          history.reset(newDesign.sections);
        }
      } catch (err) {
        showToast('Yükleme hatası', 'error');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [designId]);

  // ─── History helpers ─────────────────────────────────────────────────────
  const updateSections = useCallback((newSections: FormSection[], desc: string) => {
    setSections(newSections);
    history.push(newSections, desc);
    setIsDirty(true);
  }, [history]);

  const handleUndo = () => {
    const prev = history.undo();
    if (prev) { setSections(prev); setSelectedElementId(null); }
  };

  const handleRedo = () => {
    const next = history.redo();
    if (next) { setSections(next); setSelectedElementId(null); }
  };

  // ─── Element Selection ───────────────────────────────────────────────────
  const handleSelectElement = (elementId: string | null, sectionId: string | null) => {
    setSelectedElementId(elementId);
    setSelectedSectionId(sectionId);
  };

  const handleSelectSection = (sectionId: string | null) => {
    setSelectedSectionId(sectionId);
    setSelectedElementId(null);
  };

  // ─── Find element/section ────────────────────────────────────────────────
  const findElement = (): FormElement | null => {
    if (!selectedElementId || !selectedSectionId) return null;
    const section = sections.find(s => s.id === selectedSectionId);
    return section?.elements.find(e => e.id === selectedElementId) || null;
  };

  const findSection = (): FormSection | null => {
    if (!selectedSectionId) return null;
    return sections.find(s => s.id === selectedSectionId) || null;
  };

  // ─── Element Operations ───────────────────────────────────────────────────

  const handleDropElement = (sectionId: string, item: ToolboxItem, x: number, y: number) => {
    const newElement: FormElement = {
      id: generateId(),
      type: item.type,
      x,
      y,
      width: item.defaultWidth,
      height: item.defaultHeight,
      props: { ...item.defaultProps },
    };
    const newSections = sections.map(s =>
      s.id === sectionId
        ? { ...s, elements: [...s.elements, newElement] }
        : s
    );
    updateSections(newSections, `${item.label} eklendi`);
    setSelectedElementId(newElement.id);
    setSelectedSectionId(sectionId);
  };

  const handleElementMove = (sectionId: string, elementId: string, dx: number, dy: number) => {
    setSections(prev => prev.map(s =>
      s.id === sectionId
        ? {
          ...s,
          elements: s.elements.map(e =>
            e.id === elementId
              ? { ...e, x: Math.max(0, e.x + dx), y: Math.max(0, e.y + dy) }
              : e
          ),
        }
        : s
    ));
    setIsDirty(true);
  };

  const handleElementResize = (sectionId: string, elementId: string, newWidth: number, newHeight: number, newX: number, newY: number) => {
    setSections(prev => prev.map(s =>
      s.id === sectionId
        ? {
          ...s,
          elements: s.elements.map(e =>
            e.id === elementId
              ? { ...e, width: newWidth, height: newHeight, x: newX, y: newY }
              : e
          ),
        }
        : s
    ));
    setIsDirty(true);
  };

  const handleDeleteElement = (sectionId: string, elementId: string) => {
    const newSections = sections.map(s =>
      s.id === sectionId
        ? { ...s, elements: s.elements.filter(e => e.id !== elementId) }
        : s
    );
    updateSections(newSections, 'Eleman silindi');
    setSelectedElementId(null);
  };

  const handleElementChange = (updates: Partial<FormElement>) => {
    if (!selectedElementId || !selectedSectionId) return;
    const newSections = sections.map(s =>
      s.id === selectedSectionId
        ? {
          ...s,
          elements: s.elements.map(e =>
            e.id === selectedElementId ? { ...e, ...updates } : e
          ),
        }
        : s
    );
    setSections(newSections);
    setIsDirty(true);
  };

  const handleSectionChange = (updates: Partial<FormSection>) => {
    if (!selectedSectionId) return;
    const newSections = sections.map(s =>
      s.id === selectedSectionId ? { ...s, ...updates } : s
    );
    setSections(newSections);
    setIsDirty(true);
  };

  const handleSectionHeightChange = (sectionId: string, height: number) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, height } : s));
    setIsDirty(true);
  };

  const handleAddSection = () => {
    const newSection: FormSection = {
      id: generateSectionId(),
      type: 'CUSTOM',
      label: 'Yeni Bölüm',
      order: sections.length + 1,
      height: 100,
      visible: true,
      elements: [],
    };
    updateSections([...sections, newSection], 'Bölüm eklendi');
  };

  const handleDeleteSection = (sectionId: string) => {
    const sec = sections.find(s => s.id === sectionId);
    if (sec?.isBuiltIn !== undefined) {
      // Allow deletion of non-built-in sections
    }
    const newSections = sections.filter(s => s.id !== sectionId);
    updateSections(newSections, 'Bölüm silindi');
    if (selectedSectionId === sectionId) {
      setSelectedSectionId(null);
      setSelectedElementId(null);
    }
  };

  const handleDuplicateElement = () => {
    const el = findElement();
    if (!el || !selectedSectionId) return;
    const copy: FormElement = {
      ...JSON.parse(JSON.stringify(el)),
      id: generateId(),
      x: el.x + 10,
      y: el.y + 10,
    };
    const newSections = sections.map(s =>
      s.id === selectedSectionId
        ? { ...s, elements: [...s.elements, copy] }
        : s
    );
    updateSections(newSections, 'Eleman kopyalandı');
    setSelectedElementId(copy.id);
  };

  // ─── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!design) return;
    setSaving(true);
    try {
      const payload = { ...design, sections };
      let res;
      if (design.id) {
        res = await api.updateFormDesign(design.id, payload);
      } else {
        res = await api.createFormDesign(payload);
        if (res.success && res.formDesign) {
          setDesign(res.formDesign);
        }
      }
      if (res.success) {
        setIsDirty(false);
        showToast('Form tasarımı kaydedildi.', 'success');
      } else {
        showToast('Kaydetme hatası: ' + ((res as any).error || (res as any).message || 'Bilinmeyen hata'), 'error');
      }
    } catch (err: any) {
      showToast('Kaydetme hatası: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── Export / Import ──────────────────────────────────────────────────────
  const handleExport = () => {
    if (!design) return;
    const data = { ...design, sections, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${design.name.replace(/[^a-zA-Z0-9]/g, '_')}.form.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.sections || !Array.isArray(data.sections)) throw new Error('Geçersiz form dosyası');
        updateSections(data.sections, 'İçe aktarıldı');
        if (data.name && design) setDesign({ ...design, name: data.name + ' (İçe Aktarıldı)' });
        showToast('Form tasarımı içe aktarıldı.', 'success');
      } catch (err: any) {
        showToast('İçe aktarma hatası: ' + err.message, 'error');
      }
    };
    input.click();
  };

  // ─── Design meta changes ─────────────────────────────────────────────────
  const updateDesignMeta = (updates: Partial<FormDesign>) => {
    if (!design) return;
    setDesign({ ...design, ...updates });
    setIsDirty(true);
  };

  const paperWidth = PAPER_SIZES[design?.paperSize || 'A4']?.width || 760;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12, color: 'var(--text-muted)' }}>
        <RefreshCw size={24} className="spin" />
        <span>Form tasarımı yükleniyor...</span>
      </div>
    );
  }

  if (!design) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--danger)' }}>
        Form tasarımı bulunamadı.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* ─── Designer Toolbar ─── */}
      <div style={{
        height: 44,
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: 6,
        flexShrink: 0,
      }}>
        {/* Back */}
        <button className="btn btn-ghost btn-sm" onClick={onBack} title="Geri Dön">
          <ArrowLeft size={14} />
          Geri
        </button>

        <div style={{ width: 1, height: 20, background: 'var(--border-color)' }} />

        {/* Design name */}
        <input
          style={{
            border: 'none', outline: 'none', background: 'transparent',
            font: 'inherit', fontSize: 13, fontWeight: 700,
            color: 'var(--text-main)', width: 200,
          }}
          value={design.name}
          onChange={e => updateDesignMeta({ name: e.target.value })}
        />

        {isDirty && (
          <span style={{ fontSize: 10, color: 'var(--warning)', fontWeight: 600 }}>● Kaydedilmemiş</span>
        )}

        <div style={{ flex: 1 }} />

        {/* Document type */}
        <select
          className="fd-prop-input"
          style={{ width: 160 }}
          value={design.documentType}
          onChange={e => updateDesignMeta({ documentType: e.target.value as any })}
        >
          {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        {/* Paper size */}
        <select
          className="fd-prop-input"
          style={{ width: 130 }}
          value={design.paperSize}
          onChange={e => updateDesignMeta({ paperSize: e.target.value as any })}
        >
          {Object.entries(PAPER_SIZES).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        {/* Zoom */}
        <select
          className="fd-prop-input"
          style={{ width: 80 }}
          value={zoom}
          onChange={e => setZoom(Number(e.target.value))}
        >
          {[50, 75, 80, 90, 100, 110, 125].map(z => (
            <option key={z} value={z}>{z}%</option>
          ))}
        </select>

        <div style={{ width: 1, height: 20, background: 'var(--border-color)' }} />

        {/* Undo / Redo */}
        <button className="btn btn-ghost btn-sm" onClick={handleUndo} disabled={!history.canUndo} title="Geri Al (Ctrl+Z)">
          <Undo2 size={14} />
        </button>
        <button className="btn btn-ghost btn-sm" onClick={handleRedo} disabled={!history.canRedo} title="İleri Al (Ctrl+Y)">
          <Redo2 size={14} />
        </button>

        {/* Duplicate selected */}
        {selectedElementId && (
          <button className="btn btn-ghost btn-sm" onClick={handleDuplicateElement} title="Elemanı Kopyala">
            <Copy size={14} />
          </button>
        )}

        {/* Delete selected element */}
        {selectedElementId && selectedSectionId && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ color: 'var(--danger)' }}
            onClick={() => handleDeleteElement(selectedSectionId, selectedElementId)}
            title="Elemanı Sil (Delete)"
          >
            <Trash2 size={14} />
          </button>
        )}

        <div style={{ width: 1, height: 20, background: 'var(--border-color)' }} />

        {/* Import / Export */}
        <button className="btn btn-ghost btn-sm" onClick={handleImport} title="JSON'dan İçe Aktar">
          <Upload size={14} />
        </button>
        <button className="btn btn-ghost btn-sm" onClick={handleExport} title="JSON Olarak Dışa Aktar">
          <Download size={14} />
        </button>

        {/* Preview toggle */}
        <button
          className={`btn btn-sm ${isPreviewMode ? 'btn-secondary' : 'btn-ghost'}`}
          onClick={() => setIsPreviewMode(!isPreviewMode)}
          title={isPreviewMode ? 'Tasarım Moduna Geç' : 'Önizleme'}
        >
          {isPreviewMode ? <EyeOff size={14} /> : <Eye size={14} />}
          {isPreviewMode ? 'Düzenle' : 'Önizle'}
        </button>

        {/* Save */}
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSave}
          disabled={saving}
          title="Kaydet (Ctrl+S)"
        >
          {saving ? <RefreshCw size={14} className="spin" /> : <Save size={14} />}
          {saving ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
      </div>

      {/* ─── Main Layout ─── */}
      <div className="form-designer-layout" style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}>
        {/* Left: Toolbox */}
        {!isPreviewMode && (
          <FormToolbox
            onDragStart={() => { }}
          />
        )}

        {/* Center: Canvas */}
        <div className="fd-canvas-wrapper">
          <div className="fd-canvas-toolbar">
            {/* Section tabs */}
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginRight: 8 }}>Bölümler:</span>
            {sections.sort((a, b) => a.order - b.order).map(s => (
              <button
                key={s.id}
                className={`btn btn-xs ${selectedSectionId === s.id && !selectedElementId ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => handleSelectSection(s.id)}
                style={{ fontSize: 10 }}
              >
                {SECTION_TYPE_LABELS[s.type]}
              </button>
            ))}
            {!isPreviewMode && (
              <button className="btn btn-xs btn-ghost" onClick={handleAddSection} title="Bölüm Ekle">
                <Plus size={11} />
              </button>
            )}

            <div style={{ flex: 1 }} />

            {/* Status */}
            {selectedElementId && (
              <span style={{ fontSize: 10, color: 'var(--primary)', fontWeight: 600 }}>
                📌 Eleman seçili — Taşımak için sürükle, silmek için Delete
              </span>
            )}
          </div>

          <FormCanvas
            design={design}
            sections={sections}
            selectedElementId={selectedElementId}
            selectedSectionId={selectedSectionId}
            isPreviewMode={isPreviewMode}
            onSelectElement={handleSelectElement}
            onSelectSection={handleSelectSection}
            onElementMove={handleElementMove}
            onElementResize={handleElementResize}
            onDropElement={handleDropElement}
            onDeleteElement={handleDeleteElement}
            onSectionHeightChange={handleSectionHeightChange}
          />
        </div>

        {/* Right: Properties */}
        {!isPreviewMode && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <FormProperties
              selectedElement={findElement()}
              selectedSection={selectedElementId ? null : findSection()}
              onElementChange={handleElementChange}
              onSectionChange={handleSectionChange}
            />

            {/* Sections list */}
            <div style={{
              width: 240, background: 'var(--bg-surface)',
              borderLeft: '1px solid var(--border-color)',
              borderTop: '1px solid var(--border-color)',
              display: 'flex', flexDirection: 'column',
              maxHeight: 280, overflow: 'hidden',
            }}>
              <div className="fd-properties-header" style={{ borderBottom: '1px solid var(--border-color)', padding: '6px 12px' }}>
                <Layers size={12} style={{ display: 'inline', marginRight: 4 }} />
                Bölümler
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
                {sections.sort((a, b) => a.order - b.order).map(section => (
                  <div
                    key={section.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '4px 6px',
                      borderRadius: 4,
                      background: selectedSectionId === section.id && !selectedElementId
                        ? 'var(--primary-light)' : 'transparent',
                      cursor: 'pointer',
                      marginBottom: 1,
                    }}
                    onClick={() => { handleSelectSection(section.id); setSelectedElementId(null); }}
                  >
                    <Layers size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 11, fontWeight: 500 }}>
                      {section.label}
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--text-light)', fontFamily: 'var(--font-mono)' }}>
                      {section.elements.length} el
                    </span>
                    {section.visible
                      ? <Eye size={10} style={{ color: 'var(--success)' }} />
                      : <EyeOff size={10} style={{ color: 'var(--text-light)' }} />
                    }
                    <button
                      className="btn btn-xs btn-ghost"
                      style={{ padding: '0 2px', color: 'var(--danger)', opacity: 0.6 }}
                      onClick={e => { e.stopPropagation(); handleDeleteSection(section.id); }}
                      title="Bölümü Sil"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
