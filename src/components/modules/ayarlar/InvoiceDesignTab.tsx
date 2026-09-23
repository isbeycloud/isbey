/**
 * İŞBEY CLOUD — FAZ 25.3-A2 FATURA TASARIM MODÜLÜ (Invoice Design Tab)
 * ====================================================================
 * Ayarlar → Fatura Tasarımı sekmesi.
 *
 * Bölümler (onaylı kapsam):
 *   - Şablonlar: 6 hazır tema (PRESET_THEMES) + kayıtlı tasarımlar
 *   - Logo / Kaşe: dataURL yükleme
 *   - Firma Bilgileri: mevcut Company kaydından otomatik (düzenleme Settings→Firma)
 *   - Renk Ayarı: vurgu rengi seçici
 *   - Alan Yönetimi: bölüm göster/gizle + sürükle-bırak sıralama
 *   - Önizleme: mevcut DocumentTemplateEngine ile canlı önizleme
 *
 * Veri: backend /api/invoice-designs (requireAuth, tenant token'dan) +
 * localStorage fallback (offline/ilk kurulum). Mevcut docSettings akışı bozulmaz.
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  LayoutTemplate, Palette, Upload, Eye, Save, Plus, Trash2, Copy, Star,
  GripVertical, Check, FileText, Building2, Stamp, RotateCcw, ListChecks,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import type { Company } from '../../../types';
import {
  PRESET_THEMES, INVOICE_FIELDS, DEFAULT_INVOICE_DESIGN,
  resolveDesignToTemplateSettings, sanitizeInvoiceDesign,
} from '../../templates/invoiceDesignConfig';
import type { InvoiceDesignConfig, InvoiceThemeId, InvoiceFieldId } from '../../templates/invoiceDesignConfig';
import { DocumentTemplateEngine } from '../../templates/DocumentTemplateEngine';

const LS_KEY = 'isbey_invoice_designs_v1';

// ─── Canlı önizleme örnek faturası (SettingsView'daki payload ile tutarlı) ──
const sampleInvoicePayload = {
  type: 'SALE',
  invoiceNo: 'SAT-2026-000124',
  date: new Date().toLocaleDateString('tr-TR'),
  maturityDate: new Date(Date.now() + 30 * 864e5).toLocaleDateString('tr-TR'),
  customerTitle: 'Atlas Endüstriyel Bilişim Sistemleri San. ve Tic. Ltd. Şti.',
  customerAddress: 'Büyükdere Cad. Maslak Plaza Kat:8 No:42 Sarıyer / İSTANBUL',
  taxOffice: 'Maslak',
  taxNumber: '1280947192',
  paymentType: 'OPEN_ACCOUNT',
  notes: '',
  items: [
    { productCode: 'STK-MON-01', productName: '27 inç 4K UltraHD IPS Monitör', quantity: 3, unit: 'Adet', unitPrice: 8500, vatRate: 20, lineGrandTotal: 30600 },
    { productCode: 'STK-KAB-09', productName: 'Thunderbolt 4 / Type-C 40Gbps Kablosu', quantity: 6, unit: 'Adet', unitPrice: 450, vatRate: 20, lineGrandTotal: 3240 },
    { productCode: 'HZM-KUR-01', productName: 'İş İstasyonu Yerinde Kurulum', quantity: 1, unit: 'Hizmet', unitPrice: 2000, vatRate: 20, lineGrandTotal: 2400 },
  ],
  subTotal: 30200,
  totalDiscount: 0,
  totalVat: 6040,
  grandTotal: 36240,
};

const THEME_LABEL: Record<InvoiceThemeId, string> = {
  CORPORATE: 'Kurumsal', MINIMAL: 'Minimal', MODERN: 'Modern',
  ECOMMERCE: 'E-Ticaret', OFFICIAL: 'Resmi Evrak', CUSTOM: 'Özel Tasarım',
};

export const InvoiceDesignTab: React.FC = () => {
  const { showToast } = useToast();
  const { activeTenant, triggerRefresh } = useApp();

  const [designs, setDesigns] = useState<InvoiceDesignConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_INVOICE_DESIGN.id);
  const [company, setCompany] = useState<Company | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [dragFieldId, setDragFieldId] = useState<InvoiceFieldId | null>(null);
  const fileLogoRef = useRef<HTMLInputElement>(null);
  const fileStampRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => designs.find(d => d.id === selectedId) ?? DEFAULT_INVOICE_DESIGN,
    [designs, selectedId]
  );

  // ─── Yükleme: backend + localStorage fallback ─────────────────────────────
  useEffect(() => {
    let alive = true;
    const loadLocal = (): InvoiceDesignConfig[] => {
      try {
        const raw = localStorage.getItem(LS_KEY);
        return raw ? (JSON.parse(raw) as InvoiceDesignConfig[]).map(sanitizeInvoiceDesign) : [];
      } catch { return []; }
    };
    (async () => {
      let list = loadLocal();
      try {
        const res = await api.getInvoiceDesigns();
        if (res.success && Array.isArray(res.invoiceDesigns) && res.invoiceDesigns.length > 0) {
          list = res.invoiceDesigns.map(sanitizeInvoiceDesign);
        }
      } catch { /* offline → localStorage sürümü geçerli */ }
      if (!alive) return;
      setDesigns(list);
      const def = list.find(d => d.isDefault) ?? list[0];
      if (def) setSelectedId(def.id);
      try {
        const c = await api.getSettings();
        if (alive && c.success) setCompany(c.company);
      } catch { /* önizleme varsayılan firma ile çalışır */ }
    })();
    return () => { alive = false; };
  }, [activeTenant?.id]);

  const persistLocal = useCallback((list: InvoiceDesignConfig[]) => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch { /* kota aşımı sessiz */ }
  }, []);

  // ─── Kaydet (yeni veya güncelle) ──────────────────────────────────────────
  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const payload = { ...selected, updatedAt: new Date().toISOString() };
      const exists = designs.some(d => d.id === selected.id);
      let saved: InvoiceDesignConfig = payload;
      if (exists && !payload.id.startsWith('invd-') === false && payload.id !== DEFAULT_INVOICE_DESIGN.id) {
        const res = await api.updateInvoiceDesign(payload.id, payload);
        if (!res.success) throw new Error('Kaydedilemedi');
      } else if (payload.id === DEFAULT_INVOICE_DESIGN.id) {
        const res = await api.createInvoiceDesign({ ...payload, id: undefined });
        if (res.success && res.invoiceDesign) saved = sanitizeInvoiceDesign(res.invoiceDesign);
      } else {
        const res = await api.updateInvoiceDesign(payload.id, payload);
        if (!res.success) throw new Error('Kaydedilemedi');
      }
      const next = exists
        ? designs.map(d => (d.id === saved.id ? saved : d))
        : [...designs, saved];
      setDesigns(next);
      persistLocal(next);
      setSelectedId(saved.id);
      triggerRefresh();
      showToast('Fatura tasarımı kaydedildi.', 'success');
    } catch (err: any) {
      // Backend yoksa localStorage'a düş — tasarım kaybolmaz
      const next = designs.some(d => d.id === selected.id)
        ? designs.map(d => (d.id === selected.id ? selected : d))
        : [...designs, selected];
      setDesigns(next);
      persistLocal(next);
      showToast(err?.message ? `Tasarım yerel olarak kaydedildi: ${err.message}` : 'Tasarım yerel olarak kaydedildi.', 'success');
    } finally {
      setSaving(false);
    }
  };

  // ─── Yeni tasarım (temadan türet) ─────────────────────────────────────────
  const handleCreateFromTheme = (themeId: InvoiceThemeId) => {
    const theme = PRESET_THEMES.find(t => t.id === themeId);
    const nd: InvoiceDesignConfig = sanitizeInvoiceDesign({
      id: 'invd-' + Date.now(),
      name: `${THEME_LABEL[themeId]} Tasarım`,
      theme: themeId,
      isDefault: designs.length === 0,
      accentColor: theme?.accentColor,
      showSections: themeId === 'CUSTOM' ? { ...theme?.defaults?.showSections } : undefined,
    });
    setDesigns(prev => { persistLocal([...prev, nd]); return [...prev, nd]; });
    setSelectedId(nd.id);
    showToast('Yeni tasarım oluşturuldu — özelleştirip kaydedin.', 'success');
  };

  const handleSetDefault = async (id: string) => {
    const next = designs.map(d => ({ ...d, isDefault: d.id === id }));
    setDesigns(next);
    persistLocal(next);
    try { await api.setDefaultInvoiceDesign(id); } catch { /* yerel varsayılan geçerli */ }
    showToast('Varsayılan fatura tasarımı güncellendi.', 'success');
  };

  const handleDuplicate = () => {
    const copy: InvoiceDesignConfig = sanitizeInvoiceDesign({
      ...selected, id: 'invd-' + Date.now(), name: `${selected.name} (Kopya)`, isDefault: false,
    });
    setDesigns(prev => { persistLocal([...prev, copy]); return [...prev, copy]; });
    setSelectedId(copy.id);
  };

  const handleDelete = async (id: string) => {
    if (id === DEFAULT_INVOICE_DESIGN.id) return;
    const next = designs.filter(d => d.id !== id);
    setDesigns(next);
    persistLocal(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? DEFAULT_INVOICE_DESIGN.id);
    try { await api.deleteInvoiceDesign(id); } catch { /* yerel silme geçerli */ }
    showToast('Tasarım silindi.', 'success');
  };

  // ─── Alan yönetimi: göster/gizle + sürükle-bırak sıralama ─────────────────
  const toggleSection = (fieldId: InvoiceFieldId) => {
    const updated: InvoiceDesignConfig = {
      ...selected,
      showSections: { ...selected.showSections, [fieldId]: selected.showSections?.[fieldId] === false },
    };
    setDesigns(prev => prev.map(d => (d.id === selected.id ? updated : d)));
  };

  const handleDragStart = (fieldId: InvoiceFieldId) => setDragFieldId(fieldId);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDropOn = (targetId: InvoiceFieldId) => {
    if (!dragFieldId || dragFieldId === targetId) return;
    const current = INVOICE_FIELDS.map(f => f.id);
    const from = current.indexOf(dragFieldId);
    const to = current.indexOf(targetId);
    const reordered = [...current];
    reordered.splice(to, 0, reordered.splice(from, 1)[0]);
    // Sıralama bilgisi columnOrder'a benzer şekilde customLayout yerine showSections sırasına
    // değil, ayrı bir alan sırasına yazılır (backend uyumluluğu için JSON düz dizi)
    const updated: InvoiceDesignConfig = { ...selected } as any;
    (updated as any).sectionOrder = reordered;
    setDesigns(prev => prev.map(d => (d.id === selected.id ? updated : d)));
    setDragFieldId(null);
  };

  // ─── Renk / logo / kaşe ───────────────────────────────────────────────────
  const setAccent = (color: string) =>
    setDesigns(prev => prev.map(d => (d.id === selected.id ? { ...d, accentColor: color } : d)));

  const readFileAsDataUrl = (file: File, cb: (dataUrl: string) => void) => {
    if (file.size > 300 * 1024) { showToast('Görsel 300 KB altı olmalı (baskı performansı).', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => cb(String(reader.result));
    reader.readAsDataURL(file);
  };

  const uploadLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    readFileAsDataUrl(f, dataUrl =>
      setDesigns(prev => prev.map(d => (d.id === selected.id ? { ...d, logoDataUrl: dataUrl } : d))));
  };
  const uploadStamp = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    readFileAsDataUrl(f, dataUrl =>
      setDesigns(prev => prev.map(d => (d.id === selected.id ? { ...d, stampDataUrl: dataUrl } : d))));
  };

  // ─── Önizleme ayarları: tasarım → mevcut motor ────────────────────────────
  const previewSettings = resolveDesignToTemplateSettings(selected, company?.documentSettings);
  const previewCompany: Company | undefined = selected.logoDataUrl
    ? ({ ...(company ?? ({} as Company)), logoUrl: selected.logoDataUrl } as Company)
    : company;

  const templateSettingsForEngine = selected.stampDataUrl
    ? { ...previewSettings, showStampAndSignature: true, headerNote: previewSettings.headerNote }
    : previewSettings;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 300px', gap: '16px', alignItems: 'start' }}>
      {/* ─── SOL: Şablonlar + kayıtlı tasarımlar ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div className="card" style={{ padding: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', fontWeight: 700, fontSize: '13px' }}>
            <LayoutTemplate size={15} /> Hazır Temalar
          </div>
          {PRESET_THEMES.map(t => (
            <button
              key={t.id}
              onClick={() => handleCreateFromTheme(t.id)}
              title={t.description}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                padding: '8px', marginBottom: '6px', cursor: 'pointer', textAlign: 'left',
                border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)',
              }}
            >
              {/* 2026-09-13 (tasarım sadeleştirmesi): gradyan KORUNDU — dekoratif değil,
                  şablon küçük resmi: renk şeritleri temanın başlık/zemin renklerini
                  temsil ediyor (tıklanan tema önizlemesi). */}
              <span style={{
                width: '34px', height: '24px', borderRadius: '4px', flexShrink: 0,
                background: `linear-gradient(135deg, ${t.preview.header} 0 45%, ${t.preview.bg} 45%)`,
                border: `2px solid ${t.preview.accent}`,
              }} />
              <span>
                <span style={{ display: 'block', fontSize: '12px', fontWeight: 700 }}>{t.name}</span>
                <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)' }}>
                  {t.template} şablonu
                </span>
              </span>
              <Plus size={13} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
            </button>
          ))}
        </div>

        <div className="card" style={{ padding: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', fontWeight: 700, fontSize: '13px' }}>
            <FileText size={15} /> Kayıtlı Tasarımlar ({designs.length})
          </div>
          {designs.length === 0 && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Henüz kayıt yok. Soldaki temalardan birini seçerek başlayın; varsayılan tasarım her zaman etkin.
            </div>
          )}
          {designs.map(d => (
            <div
              key={d.id}
              onClick={() => setSelectedId(d.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 8px', marginBottom: '5px',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 'var(--fs-sm)',
                border: `1px solid ${d.id === selected.id ? 'var(--primary)' : 'var(--border-color)'}`,
                background: d.id === selected.id ? 'var(--bg-surface-active)' : 'transparent',
              }}
            >
              {d.isDefault && <Star size={12} color="var(--warning)" fill="var(--warning)" />}
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
              {!d.isDefault && (
                <>
                  <button title="Varsayılan yap" onClick={e => { e.stopPropagation(); handleSetDefault(d.id); }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px' }}>
                    <Check size={12} color="var(--text-muted)" />
                  </button>
                  <button title="Sil" onClick={e => { e.stopPropagation(); handleDelete(d.id); }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px' }}>
                    <Trash2 size={12} color="var(--danger)" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ─── ORTA: Canlı Önizleme ─── */}
      <div className="card" style={{ padding: '14px', overflow: 'auto', maxHeight: '72vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <Eye size={15} />
          <span style={{ fontWeight: 700, fontSize: '13px' }}>Canlı Önizleme</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {selected.name} · {THEME_LABEL[selected.theme]}
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
            <button className="btn btn-secondary btn-sm" onClick={handleDuplicate} title="Kopyala">
              <Copy size={13} /> Kopyala
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
              <Save size={13} /> {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </span>
        </div>
        {/* Ölçekli önizleme: A4 genişliği sığdırılır */}
        <div style={{ transform: 'scale(0.62)', transformOrigin: 'top left', height: '640px', overflow: 'hidden' }}>
          <DocumentTemplateEngine
            type="A4_INVOICE"
            payload={{ ...sampleInvoicePayload, notes: selected.footerNotes ?? '' }}
            company={previewCompany}
            settings={templateSettingsForEngine}
          />
        </div>
      </div>

      {/* ─── SAĞ: Özellik Paneli ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Logo & Kaşe */}
        <div className="card" style={{ padding: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', fontWeight: 700, fontSize: '13px' }}>
            <Building2 size={15} /> Logo & Kaşe
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => fileLogoRef.current?.click()}>
              <Upload size={13} /> Logo Yükle
            </button>
            <input ref={fileLogoRef} type="file" accept="image/png,image/jpeg,image/svg+xml" hidden onChange={uploadLogo} />
            <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => fileStampRef.current?.click()}>
              <Stamp size={13} /> Kaşe Yükle
            </button>
            <input ref={fileStampRef} type="file" accept="image/png,image/jpeg" hidden onChange={uploadStamp} />
          </div>
          {(selected.logoDataUrl || selected.stampDataUrl) && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {selected.logoDataUrl && <img src={selected.logoDataUrl} alt="logo" style={{ height: '34px', maxWidth: '90px', objectFit: 'contain', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-xs)' }} />}
              {selected.stampDataUrl && <img src={selected.stampDataUrl} alt="kaşe" style={{ height: '34px', maxWidth: '90px', objectFit: 'contain', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-xs)' }} />}
              <button className="btn btn-secondary btn-sm" title="Kaldır"
                onClick={() => setDesigns(prev => prev.map(d => (d.id === selected.id ? { ...d, logoDataUrl: undefined, stampDataUrl: undefined } : d)))}>
                <RotateCcw size={12} />
              </button>
            </div>
          )}
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '6px' }}>
            Firma unvanı/adresi: Ayarlar → Firma Bilgileri. Maks. 300 KB, PNG/JPG.
          </div>
        </div>

        {/* Renk Ayarı */}
        <div className="card" style={{ padding: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', fontWeight: 700, fontSize: '13px' }}>
            <Palette size={15} /> Renk Ayarı
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="color"
              value={selected.accentColor}
              onChange={e => setAccent(e.target.value)}
              style={{ width: '44px', height: '30px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', padding: 0 }}
            />
            <input
              type="text"
              value={selected.accentColor}
              onChange={e => /^#[0-9a-fA-F]{0,8}$/.test(e.target.value) && setAccent(e.target.value)}
              style={{ flex: 1, fontSize: 'var(--fs-sm)', padding: '6px 8px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '5px', marginTop: '8px' }}>
            {/* 2026-09-13 — Bu hex değerleri VERİ'dir: kullanıcının faturasına
                seçebileceği BASKI renkleri (accentColor). Uygulama teması
                token'ına çevrilmez; swatch'ın kendisi de veriyi gösterir. */}
            {['#1e40af', '#111827', '#0ea5e9', '#059669', '#3730a3', '#dc2626'].map(c => (
              <button key={c} title={c} onClick={() => setAccent(c)}
                style={{ width: '22px', height: '22px', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-color)', cursor: 'pointer', background: c }} />
            ))}
          </div>
        </div>

        {/* Alan Yönetimi */}
        <div className="card" style={{ padding: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', fontWeight: 700, fontSize: '13px' }}>
            <ListChecks size={15} /> Alan Yönetimi
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            Bölümü aç/kapat; sürükleyerek sırala (⠿ tutamağından yakala).
          </div>
          <div
            onDragOver={handleDragOver}
            style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}
          >
            {INVOICE_FIELDS.map(f => {
              const visible = selected.showSections?.[f.id] !== false;
              return (
                <div
                  key={f.id}
                  draggable
                  onDragStart={() => handleDragStart(f.id)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDropOn(f.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px',
                    border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
                    background: visible ? 'var(--bg-surface)' : 'var(--bg-surface-secondary)', opacity: visible ? 1 : 0.55,
                    cursor: 'grab',
                  }}
                >
                  <GripVertical size={13} color="var(--text-muted)" />
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontSize: '12px', fontWeight: 600 }}>{f.label}</span>
                    <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)' }}>{f.description}</span>
                  </span>
                  <button
                    onClick={() => toggleSection(f.id)}
                    title={visible ? 'Gizle' : 'Göster'}
                    style={{
                      border: 'none', borderRadius: 'var(--radius-lg)', cursor: 'pointer', padding: '2px 8px',
                      fontSize: 'var(--fs-2xs)', fontWeight: 700,
                      background: visible ? 'var(--success-bg)' : 'var(--border-color)', color: visible ? 'var(--success-text)' : 'var(--text-muted)',
                    }}
                  >
                    {visible ? 'AÇIK' : 'KAPALI'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Not alanları */}
        <div className="card" style={{ padding: '14px' }}>
          <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '8px' }}>Üst / Alt Not</div>
          <input
            placeholder="Üst not (fatura başlığına yazılır)"
            value={selected.headerNote ?? ''}
            onChange={e => setDesigns(prev => prev.map(d => (d.id === selected.id ? { ...d, headerNote: e.target.value } : d)))}
            style={{ width: '100%', fontSize: 'var(--fs-sm)', padding: '6px 8px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', marginBottom: '6px', boxSizing: 'border-box' }}
          />
          <textarea
            placeholder="Alt not / banka bilgilendirme metni"
            value={selected.footerNotes ?? ''}
            onChange={e => setDesigns(prev => prev.map(d => (d.id === selected.id ? { ...d, footerNotes: e.target.value } : d)))}
            rows={3}
            style={{ width: '100%', fontSize: 'var(--fs-sm)', padding: '6px 8px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', boxSizing: 'border-box', resize: 'vertical' }}
          />
        </div>
      </div>
    </div>
  );
};
