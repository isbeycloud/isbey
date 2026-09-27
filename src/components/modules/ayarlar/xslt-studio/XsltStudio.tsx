import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Palette,
  Code,
  FlaskConical,
  Eye,
  Save,
  Undo2,
  Redo2,
  ShieldCheck,
  History,
  Maximize2,
  Minimize2,
  Wand2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Columns2,
  Info,
} from 'lucide-react';
import { api } from '../../../../services/api';
import { useToast } from '../../../../context/ToastContext';
import { Modal } from '../../../common/Modal';
import { MonacoXsltEditor, type MonacoMarker, type MonacoXsltEditorHandle } from './MonacoXsltEditor';
import { MonacoDiffView } from './MonacoDiffView';
import { SplitPane } from './SplitPane';
import { A4PreviewPane, type ZoomMode } from './A4PreviewPane';
import { GorselTasarimModu } from './GorselTasarimModu';
import { TestXmlModu } from './TestXmlModu';
import { SurumGecmisiPaneli } from './SurumGecmisiPaneli';
import { useXsltHistory } from './useXsltHistory';
import { useDebouncedTask } from './useDebounce';
import { formatXslt } from './xsltFormatter';
import { compileVisualDesignToXslt, describeCoverage } from './visualToXslt';
import {
  defaultVisualDesign,
  type VisualDesignDoc,
} from './visualDesign';

/**
 * XSLT / Fatura Tasarım Stüdyosu
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 2026-09-27: Belge Tasarımcısı'nın üzerine kurulan profesyonel düzenleyici
 * katmanı. Dört mod: Görsel Tasarım · XSLT Kod · Test XML · Önizleme.
 *
 * DEĞİŞMEYEN KURALLAR (regresyon koruması):
 *   • Bu bileşen `general.xslt`'i, QR kütüphanesini, XSLT normalleştirme
 *     katmanını (`normalizeXsltForBrowser`) veya önizleme dönüşüm yolunu
 *     YENİDEN YAZMAZ. Var olan akışı çağırır.
 *   • Önizleme dönüşümü `DocumentTemplateDesigner.updateLivePreview()` ile
 *     aynı yoldan gider (sunucudan XSLT al → tarayıcıda XSLTProcessor).
 *     Burada ikinci bir dönüşüm motoru kurulmaz.
 *   • Hızlı Bilişim'e HİÇBİR çağrı yapılmaz. Belge gönderimi bu bileşenden
 *     tetiklenemez.
 *
 * TEK DOĞRULUK KAYNAĞI: `code` (XSLT metni). Görsel mod bu metni ÜRETİR ama
 * kaydetme her zaman `code` üzerinden olur. Bu sayede kullanıcı görsel
 * moddan koda geçip elle ince ayar yapabilir ve ne kaydedileceği belirsiz
 * kalmaz.
 */

export type StudioMode = 'visual' | 'code' | 'testxml';

export interface XsltStudioProps {
  isOpen: boolean;
  onClose: () => void;
  templateId: string | null;
  templateName: string;
  docType: string;
  /** Kaydedilecek XSLT (tek doğruluk kaynağı). */
  code: string;
  onCodeChange: (next: string) => void;
  /** Önizleme HTML'i (üst bileşen üretir — aynı dönüşüm yolu korunur). */
  previewHtml: string;
  /** Önizlemeyi tazele. */
  onRefreshPreview: () => void;
  previewBusy?: boolean;
  /** Test XML modunda kullanılacak XML. */
  testXml: string;
  onTestXmlChange: (xml: string) => void;
  /** Yeni bir XML senaryo seçimi yapıldığında üst bileşene bildir. */
  onScenarioChange: (id: string) => void;
  selectedScenario: string;
  /** Kaydet. */
  onSave: () => Promise<void> | void;
  saving?: boolean;
  /** Kirli durum. */
  dirty?: boolean;
  /** Kaydedildikten sonra (sürüm numarası değiştiğinde) üst bileşen bildirir. */
  version: number;
}

type ValidationState = {
  valid: boolean;
  message: string;
  error?: string;
  warning?: string;
  unsupportedFeatures?: string[];
  line?: number;
  column?: number;
  severity?: 'error' | 'warning';
} | null;

/** Görsel tasarımın localStorage anahtarı. XSLT'nin KENDİSİ saklanmaz. */
const visualKey = (templateId: string | null) => `isbey:xslt-studio:visual:${templateId || 'yeni'}`;
/** Görsel tasarım JSON'u için üst sınır — şişmiş veriyi sessizce yazmayalım. */
const VISUAL_MAX_BYTES = 200 * 1024;

function loadVisualDoc(templateId: string | null): VisualDesignDoc | null {
  try {
    const raw = localStorage.getItem(visualKey(templateId));
    if (!raw) return null;
    if (raw.length > VISUAL_MAX_BYTES) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.sections) || !Array.isArray(parsed.productColumns)) return null;
    return parsed as VisualDesignDoc;
  } catch {
    return null;
  }
}

export const XsltStudio: React.FC<XsltStudioProps> = ({
  isOpen,
  onClose,
  templateId,
  templateName,
  docType,
  code,
  onCodeChange,
  previewHtml,
  onRefreshPreview,
  previewBusy = false,
  testXml,
  onTestXmlChange,
  onScenarioChange,
  selectedScenario,
  onSave,
  saving = false,
  dirty = false,
  version,
}) => {
  const { showToast } = useToast();

  const [mode, setMode] = useState<StudioMode>('code');
  const [fullscreen, setFullscreen] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [zoom, setZoom] = useState<ZoomMode>('fit-width');
  const [validation, setValidation] = useState<ValidationState>(null);
  const [validating, setValidating] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffPair, setDiffPair] = useState<{ a: { version: number; content: string }; b: { version: number; content: string } } | null>(null);
  const [cursor, setCursor] = useState<{ line: number; column: number }>({ line: 1, column: 1 });

  const editorRef = useRef<MonacoXsltEditorHandle | null>(null);

  // ── Geri al / ileri al geçmişi (kod metni üzerinde)
  const history = useXsltHistory(code, 'Başlangıç');
  /** Undo/redo dışından gelen içerik değişikliklerini ayırt etmek için. */
  const applyingHistoryRef = useRef(false);

  // ── Görsel tasarım belgesi
  const [visualDoc, setVisualDoc] = useState<VisualDesignDoc>(() => loadVisualDoc(templateId) || defaultVisualDesign());
  /** Görsel tasarım en son hangi kodla derlendi? */
  const [compiledFromVisual, setCompiledFromVisual] = useState<string | null>(null);

  // Şablon değişince görsel tasarımı yeniden yükle.
  useEffect(() => {
    setVisualDoc(loadVisualDoc(templateId) || defaultVisualDesign());
    setCompiledFromVisual(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  // ── Görsel tasarımı sakla (XSLT'nin kendisi DEĞİL — bkz. üstteki not).
  const persistVisual = useDebouncedTask(700);
  useEffect(() => {
    persistVisual.schedule(() => {
      try {
        const raw = JSON.stringify(visualDoc);
        if (raw.length > VISUAL_MAX_BYTES) {
          // Sessizce yazma; kullanıcı verisi kaybolmasın diye uyarı göster.
          showToast('Görsel tasarım çok büyüdü; tarayıcıya kaydedilemedi.', 'warning');
          return;
        }
        localStorage.setItem(visualKey(templateId), raw);
      } catch {
        /* kota dolu — kritik değil, çalışma devam eder */
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualDoc]);

  // ── Görsel tasarım derlemesi
  const compiled = useMemo(
    () => compileVisualDesignToXslt(visualDoc, docType),
    [visualDoc, docType]
  );
  const coverage = useMemo(() => describeCoverage(visualDoc), [visualDoc]);
  /** Görsel tasarım, koddaki içerikten farklı mı? */
  const visualDiverged = compiledFromVisual !== null && code !== compiledFromVisual;

  // ── Kod değişikliği: geçmişe yaz + üst bileşene ilet
  const handleCodeChange = useCallback((next: string) => {
    onCodeChange(next);
    if (applyingHistoryRef.current) return;
    history.push(next, 'Düzenleme');
    // Kod her değiştiğinde doğrulama sonucu bayatlar.
    setValidation(prev => (prev ? null : prev));
  }, [history, onCodeChange]);

  // ── Ctrl+S (Monaco'dan özel olay) → kaydet
  useEffect(() => {
    const onSaveEvent = () => { void onSave(); };
    window.addEventListener('isbey-xslt-save', onSaveEvent);
    return () => window.removeEventListener('isbey-xslt-save', onSaveEvent);
  }, [onSave]);

  // ── Ctrl+Z / Ctrl+Shift+Z — düğme ile AYNI geçmişi kullanır.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        const text = history.undo();
        if (text !== null) {
          e.preventDefault();
          applyingHistoryRef.current = true;
          onCodeChange(text);
          applyingHistoryRef.current = false;
        }
      } else if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') {
        const text = history.redo();
        if (text !== null) {
          e.preventDefault();
          applyingHistoryRef.current = true;
          onCodeChange(text);
          applyingHistoryRef.current = false;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, history, onCodeChange]);

  // ── Doğrulama
  const runValidation = useCallback(async (silent = false) => {
    if (!code.trim()) {
      setValidation({ valid: false, message: 'XSLT içeriği boş.', error: 'XSLT içeriği boş.' });
      if (!silent) showToast('XSLT içeriği boş.', 'warning');
      return;
    }
    setValidating(true);
    try {
      const res = await api.validateXslt(code);
      setValidation({
        valid: res.valid,
        message: res.message,
        error: res.error,
        warning: res.warning,
        unsupportedFeatures: res.unsupportedFeatures,
        line: res.line,
        column: res.column,
        severity: res.severity,
      });
      if (res.valid) {
        if (!silent) {
          showToast(
            res.unsupportedFeatures?.length
              ? `✓ XML sözdizimi geçerli. Not: ${res.unsupportedFeatures.length} tarayıcı-uyumsuz yapı var.`
              : '✓ XSLT doğrulandı: XML sözdizimi geçerli.',
            res.unsupportedFeatures?.length ? 'warning' : 'success'
          );
        }
      } else if (!silent) {
        showToast(`XSLT Hatası: ${res.error || res.message}`, 'error');
      }
    } catch (e: any) {
      setValidation({ valid: false, message: e?.message || 'Doğrulama yapılamadı.', error: e?.message });
      if (!silent) showToast(e?.message || 'Doğrulama sırasında hata oluştu.', 'error');
    } finally {
      setValidating(false);
    }
  }, [code, showToast]);

  // ── Yazma durunca sessiz doğrulama (kullanıcıyı toast ile dövmeden)
  const debouncedValidate = useDebouncedTask(900);
  useEffect(() => {
    if (!isOpen || mode !== 'code' || !code.trim()) return;
    debouncedValidate.schedule(() => { void runValidation(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, isOpen, mode]);

  // ── Monaco marker'ları (doğrulama sonucundan)
  const markers: MonacoMarker[] = useMemo(() => {
    if (!validation || validation.valid) return [];
    if (validation.line === undefined) return [];
    return [{
      line: validation.line,
      column: validation.column ?? 1,
      message: validation.error || validation.message || 'XSLT hatası',
      severity: validation.severity === 'warning' ? 'warning' : 'error',
    }];
  }, [validation]);

  // ── Görsel tasarımı koda aktar
  const applyVisualToCode = useCallback((silent = false) => {
    if (compiled.problems.length > 0) {
      showToast(`Görsel tasarımda ${compiled.problems.length} eksik var; yine de kod üretildi. Uyarıları inceleyin.`, 'warning');
    }
    onCodeChange(compiled.xslt);
    setCompiledFromVisual(compiled.xslt);
    history.push(compiled.xslt, 'Görsel tasarımdan üretildi');
    if (!silent) {
      showToast(
        `Görsel tasarım XSLT'ye derlendi (${compiled.usedBindings.length} alan bağlandı). Önizlemeyi tazeleyin.`,
        'success'
      );
    }
  }, [compiled, onCodeChange, history, showToast]);

  const doUndo = () => {
    const text = history.undo();
    if (text === null) { showToast('Geri alınacak adım yok.', 'info'); return; }
    applyingHistoryRef.current = true;
    onCodeChange(text);
    applyingHistoryRef.current = false;
  };
  const doRedo = () => {
    const text = history.redo();
    if (text === null) { showToast('İleri alınacak adım yok.', 'info'); return; }
    applyingHistoryRef.current = true;
    onCodeChange(text);
    applyingHistoryRef.current = false;
  };

  const doFormat = () => {
    const res = formatXslt(code);
    if (res.error) {
      // Biçimlendirici güvenlik ağına takıldı — sessizce "biçimlendirildi"
      // demek yanıltıcı olur.
      showToast(res.error, 'warning');
      return;
    }
    if (res.changedLines === 0) {
      showToast('XSLT zaten biçimli; değişiklik yapılmadı.', 'info');
      return;
    }
    onCodeChange(res.output);
    history.push(res.output, 'Biçimlendirildi');
    showToast(
      `XSLT biçimlendirildi (${res.changedLines} satırın girintisi düzenlendi). İçerik değişmedi.` +
      (res.warnings.length ? ` Not: ${res.warnings.join(' ')}` : ''),
      'success'
    );
  };

  const charCount = code.length;
  const lineCount = useMemo(() => (code ? code.split('\n').length : 0), [code]);

  // ── Mod sekmeleri
  const modes: Array<{ id: StudioMode; label: string; icon: React.ReactNode; title: string }> = [
    { id: 'visual', label: 'Görsel Tasarım', icon: <Palette size={13} />, title: 'Sürükle-bırak bölüm/satır/kolon düzenleyici' },
    { id: 'code', label: 'XSLT Kod', icon: <Code size={13} />, title: 'XSLT 1.0 kaynak kod editörü' },
    { id: 'testxml', label: 'Test XML', icon: <FlaskConical size={13} />, title: 'UBL-TR test senaryoları (gerçek gönderim yapmaz)' },
  ];

  const body = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* ═══ Mod sekmeleri + araç çubuğu ═══ */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
          padding: '5px 10px', borderBottom: '1px solid var(--border-color)',
          background: 'var(--bg-surface)', flexShrink: 0, flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          {modes.map(m => (
            <button
              key={m.id}
              type="button"
              data-testid={`studio-mode-${m.id}`}
              onClick={() => setMode(m.id)}
              title={m.title}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '5px 11px', fontSize: '11.5px', cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
                border: `1px solid ${mode === m.id ? 'var(--primary)' : 'transparent'}`,
                background: mode === m.id ? 'var(--primary-light)' : 'transparent',
                color: mode === m.id ? 'var(--primary)' : 'var(--text-muted)',
                fontWeight: mode === m.id ? 700 : 500,
              }}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" data-testid="studio-undo" onClick={doUndo}
            disabled={!history.canUndo} title={`Geri al (${history.counts.undo} adım) · Ctrl+Z`}
            style={{ fontSize: '10.5px', padding: '2px 7px', height: '23px', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Undo2 size={12} /> {history.counts.undo > 0 && <span style={{ fontSize: '9px' }}>{history.counts.undo}</span>}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" data-testid="studio-redo" onClick={doRedo}
            disabled={!history.canRedo} title={`İleri al (${history.counts.redo} adım) · Ctrl+Shift+Z`}
            style={{ fontSize: '10.5px', padding: '2px 7px', height: '23px', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Redo2 size={12} /> {history.counts.redo > 0 && <span style={{ fontSize: '9px' }}>{history.counts.redo}</span>}
          </button>

          <span style={{ width: '1px', height: '18px', background: 'var(--border-color)', margin: '0 3px' }} />

          <button type="button" className="btn btn-secondary btn-sm" data-testid="studio-validate" onClick={() => void runValidation(false)}
            disabled={validating || mode === 'visual'} title="XSLT'yi sunucuda doğrula (Ctrl+Shift+V)"
            style={{ fontSize: '10.5px', padding: '2px 7px', height: '23px', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <ShieldCheck size={12} /> {validating ? 'Doğrulanıyor…' : 'Doğrula'}
          </button>

          <button type="button" className="btn btn-secondary btn-sm" data-testid="studio-format" onClick={doFormat}
            disabled={mode !== 'code'} title="Yalnızca girintiyi düzenler; içeriği değiştirmez"
            style={{ fontSize: '10.5px', padding: '2px 7px', height: '23px', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Wand2 size={12} /> Biçimlendir
          </button>

          <button type="button" className="btn btn-secondary btn-sm" data-testid="studio-refresh-preview" onClick={() => onRefreshPreview()}
            disabled={previewBusy} title="Önizlemeyi bu XSLT ile yeniden çalıştır"
            style={{ fontSize: '10.5px', padding: '2px 7px', height: '23px', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Eye size={12} /> Önizle
          </button>

          <button type="button" className="btn btn-secondary btn-sm" data-testid="studio-history" onClick={() => setHistoryOpen(v => !v)}
            title="Sürüm geçmişi ve geri yükleme"
            style={{ fontSize: '10.5px', padding: '2px 7px', height: '23px', display: 'flex', alignItems: 'center', gap: '3px',
              background: historyOpen ? 'var(--primary-light)' : undefined }}>
            <History size={12} /> Sürümler
          </button>

          <span style={{ width: '1px', height: '18px', background: 'var(--border-color)', margin: '0 3px' }} />

          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowPreview(v => !v)}
            title={showPreview ? 'Önizlemeyi gizle' : 'Önizlemeyi göster'}
            style={{ fontSize: '10.5px', padding: '2px 7px', height: '23px', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Columns2 size={12} /> {showPreview ? 'Önizlemeyi Gizle' : 'Önizlemeyi Göster'}
          </button>

          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFullscreen(v => !v)}
            title={fullscreen ? 'Tam ekrandan çık' : 'Tam ekran (F11 benzeri)'}
            style={{ fontSize: '10.5px', padding: '2px 7px', height: '23px', display: 'flex', alignItems: 'center', gap: '3px' }}>
            {fullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>

          <button type="button" className="btn btn-success btn-sm" data-testid="studio-save" onClick={() => void onSave()}
            disabled={saving} title="Tasarımı kaydet (Ctrl+S)"
            style={{ fontSize: '11px', padding: '3px 12px', height: '23px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
            <Save size={12} /> {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </div>

      {/* ═══ Durum şeridi: doğrulama + kirli durum + görsel sapma ═══ */}
      {(() => {
        const items: React.ReactNode[] = [];
        if (validation) {
          if (validation.valid) {
            items.push(
              <span key="ok" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--success)', fontWeight: 700 }}>
                <CheckCircle2 size={12} /> XML sözdizimi geçerli
              </span>
            );
          } else {
            items.push(
              <span key="err" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--danger)', fontWeight: 700 }}>
                <XCircle size={12} /> {validation.error || validation.message || 'XSLT hatası'}
                {validation.line !== undefined && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      if (validation.line === undefined) return;
                      editorRef.current?.revealMarker({
                        line: validation.line, column: validation.column ?? 1,
                        message: validation.error || validation.message || '',
                        severity: validation.severity === 'warning' ? 'warning' : 'error',
                      });
                    }}
                    style={{ fontSize: '9.5px', padding: '0 5px', height: '17px', marginLeft: '3px' }}
                  >
                    satır {validation.line}:{validation.column ?? 1}
                  </button>
                )}
              </span>
            );
          }
          if (validation.warning) {
            items.push(
              <span key="warn" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--warning)' }}>
                <AlertTriangle size={12} /> {validation.warning}
              </span>
            );
          }
          if (validation.unsupportedFeatures?.length) {
            items.push(
              <span key="unsup" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--warning)' }}>
                <AlertTriangle size={12} /> Tarayıcıda çalışmayan yapı: {validation.unsupportedFeatures.join(', ')}
              </span>
            );
          }
        } else {
          items.push(
            <span key="idle" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)' }}>
              <Info size={12} /> Henüz doğrulanmadı
            </span>
          );
        }

        if (dirty) {
          items.push(
            <span key="dirty" style={{ color: 'var(--warning)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <AlertTriangle size={12} /> Kaydedilmemiş değişiklikler
            </span>
          );
        }

        if (mode === 'visual' && visualDiverged) {
          items.push(
            <button
              key="diverge"
              type="button"
              onClick={() => applyVisualToCode()}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '10px', padding: '1px 7px', height: '19px', color: 'var(--warning)' }}
              title="Görsel tasarım kod içeriğinden farklı. Kodu görsel tasarımla güncelle."
            >
              Görsel tasarım koddan farklı — kodu güncelle
            </button>
          );
        }

        return (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap',
              padding: '3px 10px', borderBottom: '1px solid var(--border-color)',
              background: 'var(--bg-surface-secondary)', fontSize: '10.5px', flexShrink: 0,
            }}
          >
            {items}
            <span style={{ flex: 1 }} />
            {/* Ölçüm kancası: değerler KODUN KENDİSİNDEN gelir (`code`), editörün
                görünen satırlarından DEĞİL. Monaco sanallaştırılmış bir görünüm
                çizer: ekranda daima ~aynı sayıda satır bulunur, dolayısıyla
                görünen metni ölçmek içeriğin değiştiğini KANITLAMAZ. */}
            <span
              data-testid="studio-stats"
              data-chars={charCount}
              data-lines={lineCount}
              style={{ color: 'var(--text-muted)' }}
            >
              {lineCount.toLocaleString('tr-TR')} satır · {charCount.toLocaleString('tr-TR')} karakter
              {charCount > 368000 && ' (büyük şablon)'}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>
              düzenleyici: satır {cursor.line}, kolon {cursor.column}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>v{version}</span>
          </div>
        );
      })()}

      {/* ═══ Gövde ═══ */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0 }}>
        {mode === 'testxml' ? (
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <TestXmlModu
              scenario={selectedScenario}
              onScenarioChange={onScenarioChange}
              xml={testXml}
              onXmlChange={onTestXmlChange}
              onApply={onRefreshPreview}
            />
          </div>
        ) : (
          <SplitPane
            storageKey="isbey:xslt-studio:split"
            initialRatio={0.5}
            minLeftPx={340}
            minRightPx={320}
            left={
              mode === 'visual' ? (
                <GorselTasarimModu
                  doc={visualDoc}
                  onChange={setVisualDoc}
                  warnings={compiled.warnings}
                  problems={compiled.problems}
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <MonacoXsltEditor
                      value={code}
                      onChange={handleCodeChange}
                      markers={markers}
                      height="100%"
                      onReady={apiRef => { editorRef.current = apiRef; }}
                      onCursorChange={setCursor}
                    />
                  </div>
                </div>
              )
            }
            right={
              showPreview ? (
                <A4PreviewPane
                  html={previewHtml}
                  zoom={zoom}
                  onZoomChange={setZoom}
                  busy={previewBusy}
                  onPrint={() => {
                    const iframe = document.getElementById('studio-preview-frame') as HTMLIFrameElement | null;
                    iframe?.contentWindow?.print();
                  }}
                  footerInfo={
                    <>
                      <span>{templateName} · {docType}</span>
                      <span>{mode === 'visual' ? 'Görsel tasarım' : 'XSLT kod'} kaynağı</span>
                    </>
                  }
                />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, fontSize: '11.5px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
                  Önizleme gizli. Araç çubuğundan "Önizlemeyi Göster" ile açabilirsiniz.
                </div>
              )
            }
          />
        )}

        {/* ═══ Sağ kenar: sürüm geçmişi ═══ */}
        {historyOpen && mode !== 'testxml' && (
          <div style={{ width: '296px', flexShrink: 0, borderLeft: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <SurumGecmisiPaneli
              templateId={templateId}
              dirty={dirty}
              currentContent={code}
              onRestored={(content, v) => {
                onCodeChange(content);
                history.reset(content, `v${v} geri yüklendi`);
                setValidation(null);
                onRefreshPreview();
              }}
              onCompare={(a, b) => {
                setDiffPair({ a, b });
                setDiffOpen(true);
              }}
            />
          </div>
        )}
      </div>

      {/* ═══ Görsel mod alt çubuğu: derleme kapsamı ═══ */}
      {mode === 'visual' && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
            padding: '5px 10px', borderTop: '1px solid var(--border-color)',
            background: 'var(--bg-surface)', fontSize: '10.5px', flexShrink: 0,
          }}
        >
          <span style={{ color: 'var(--text-muted)' }}>
            Bağlanan alan: <strong style={{ color: 'var(--text-main)' }}>{compiled.usedBindings.length}</strong>
            {' / '}{compiled.usedBindings.length + coverage.notCovered.length}
          </span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            data-testid="visual-compile"
            onClick={() => applyVisualToCode()}
            style={{ fontSize: '10.5px', padding: '2px 10px', height: '22px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}
          >
            <Wand2 size={12} /> XSLT'yi Bu Tasarımdan Üret
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            data-testid="visual-compile-preview"
            onClick={() => { applyVisualToCode(true); onRefreshPreview(); }}
            style={{ fontSize: '10.5px', padding: '2px 10px', height: '22px' }}
          >
            Üret ve Önizle
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              const fresh = defaultVisualDesign();
              setVisualDoc(fresh);
              setCompiledFromVisual(null);
              showToast('Görsel tasarım varsayılana döndürüldü. Kod etkilenmedi.', 'info');
            }}
            style={{ fontSize: '10.5px', padding: '2px 10px', height: '22px' }}
            title="Görsel düzenleyiciyi baştan başlat (kayıtlı kod değişmez)"
          >
            Varsayılana Dön
          </button>
          <span style={{ flex: 1 }} />
          <span style={{ color: 'var(--text-muted)' }}>
            {compiled.problems.length > 0 && `${compiled.problems.length} eksik · `}
            {compiled.warnings.length} bilgi notu
          </span>
          <span style={{ color: 'var(--text-muted)' }}>Üretilen XSLT: {compiled.xslt.length.toLocaleString('tr-TR')} karakter</span>
        </div>
      )}
    </div>
  );

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`XSLT / Fatura Tasarım Stüdyosu — ${templateName}`}
        size={fullscreen ? 'full' : 'large'}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
              Ctrl+S kaydet · Ctrl+Z geri al · Ctrl+Shift+Z ileri al ·
              Test XML ve görsel mod gerçek e-fatura göndermez
            </div>
            <div style={{ display: 'flex', gap: '7px' }}>
              <button className="btn btn-secondary btn-sm" onClick={onClose}>Kapat</button>
              <button
                className="btn btn-primary btn-sm"
                onClick={async () => {
                  await onSave();
                  onRefreshPreview();
                }}
                disabled={saving}
              >
                <Save size={13} /> {saving ? 'Kaydediliyor…' : 'Kaydet ve Önizle'}
              </button>
            </div>
          </div>
        }
      >
        <div style={{ height: fullscreen ? '100%' : '72vh', minHeight: '420px', display: 'flex', flexDirection: 'column' }}>
          {body}
        </div>
      </Modal>

      {/* ═══ Sürüm karşılaştırma ═══ */}
      {diffOpen && diffPair && (
        <Modal
          isOpen={diffOpen}
          onClose={() => { setDiffOpen(false); setDiffPair(null); }}
          title="XSLT Sürüm Karşılaştırması"
          size="full"
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%', gap: '8px' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => { setDiffOpen(false); setDiffPair(null); }}>
                Kapat
              </button>
            </div>
          }
        >
          <div style={{ height: '70vh' }}>
            <MonacoDiffView
              original={diffPair.a.content}
              modified={diffPair.b.content}
              originalLabel={diffPair.a.version === 0 ? 'Editördeki içerik' : `v${diffPair.a.version}`}
              modifiedLabel={diffPair.b.version === 0 ? 'Editördeki içerik' : `v${diffPair.b.version}`}
            />
          </div>
        </Modal>
      )}
    </>
  );
};

export default XsltStudio;
