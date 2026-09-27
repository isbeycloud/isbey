import React, { useEffect, useRef, useState } from 'react';

/**
 * Monaco Sürüm Karşılaştırma Görünümü (tembel yüklenen)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 2026-09-27: Sürüm geçmişi panelinde iki XSLT sürümünü yan yana gösterir.
 *
 * NEDEN MONACO DIFF: XSLT şablonları 3000+ satır olabiliyor; düz metin
 * karşılaştırmasında değişen satırı bulmak imkânsız. Monaco'nun diff editörü
 * satır hizalaması ve kelime düzeyinde vurgulama yapar.
 *
 * TEMBEL YÜKLEME: `MonacoXsltEditor` ile aynı desen — Monaco ayrı chunk'ta
 * ve yalnız bu görünüm açıldığında indirilir. Aynı `MonacoEnvironment`
 * işçisi paylaşılır; iki kez tanımlanmaz.
 *
 * SALT OKUNUR: Bu bir karşılaştırma görünümüdür, düzenleyici değildir.
 * Kullanıcı buradan sürümü "geri yükler" (restore) — düzenleme oradan yapılır.
 */

export interface MonacoDiffViewProps {
  /** Eski (sol) içerik. */
  original: string;
  /** Yeni (sağ) içerik. */
  modified: string;
  height?: string;
  /** Sol/sağ başlık etiketleri. */
  originalLabel?: string;
  modifiedLabel?: string;
}

export const MonacoDiffView: React.FC<MonacoDiffViewProps> = ({
  original,
  modified,
  height = '100%',
  originalLabel = 'Eski sürüm',
  modifiedLabel = 'Yeni sürüm',
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<any>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let disposed = false;

    (async () => {
      try {
        // İşçi yapılandırmasını (varsa) yeniden kullan; yoksa kur.
        if (!(self as any).MonacoEnvironment) {
          const workerMod: any = await import('monaco-editor/esm/vs/editor/editor.worker?worker');
          const EditorWorker = workerMod.default ?? workerMod;
          (self as any).MonacoEnvironment = { getWorker: () => new EditorWorker() };
        }
        const monaco: any = await import('monaco-editor');
        if (disposed || !hostRef.current) return;

        const dark = document.documentElement.classList.contains('dark')
          || document.documentElement.getAttribute('data-theme') === 'dark';
        monaco.editor.defineTheme('isbey-diff-light', {
          base: 'vs', inherit: true,
          rules: [], colors: { 'editor.background': '#ffffff' },
        });
        monaco.editor.defineTheme('isbey-diff-dark', {
          base: 'vs-dark', inherit: true,
          rules: [], colors: { 'editor.background': '#1e1e1e' },
        });
        monaco.editor.setTheme(dark ? 'isbey-diff-dark' : 'isbey-diff-light');

        const diff = monaco.editor.createDiffEditor(hostRef.current, {
          readOnly: true,
          renderSideBySide: true,
          originalEditable: false,
          automaticLayout: true,
          fontSize: 12,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          renderOverviewRuler: false,
          // 3000 satırlık şablonlarda satır içi (inline) vurgulama pahalıdır;
          // yan yana görünümde zaten gereksiz.
          renderIndicators: true,
        });

        const originalModel = monaco.editor.createModel(original, 'xml');
        const modifiedModel = monaco.editor.createModel(modified, 'xml');
        diff.setModel({ original: originalModel, modified: modifiedModel });
        editorRef.current = diff;
        setState('ready');
      } catch (e: any) {
        if (!disposed) {
          setError(e?.message || String(e));
          setState('error');
        }
      }
    })();

    return () => {
      disposed = true;
      try {
        const diff = editorRef.current;
        const models = diff?.getModel?.();
        models?.original?.dispose?.();
        models?.modified?.dispose?.();
        diff?.dispose?.();
      } catch {
        /* yok sayılır — yalnız temizlik */
      }
      editorRef.current = null;
    };
  }, [original, modified]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height, minHeight: 0 }}>
      <div
        style={{
          display: 'flex', fontSize: '10.5px', fontWeight: 700,
          borderBottom: '1px solid var(--border-color)', flexShrink: 0,
        }}
      >
        <div style={{ flex: 1, padding: '4px 8px', color: 'var(--danger)', background: 'var(--bg-surface-secondary)' }}>
          − {originalLabel}
        </div>
        <div style={{ flex: 1, padding: '4px 8px', color: 'var(--success)', background: 'var(--bg-surface-secondary)' }}>
          + {modifiedLabel}
        </div>
      </div>

      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
        {state === 'loading' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
            Karşılaştırma hazırlanıyor…
          </div>
        )}
        {state === 'error' && (
          <div style={{ position: 'absolute', inset: 0, padding: '16px', fontSize: '12px', color: 'var(--danger)', overflow: 'auto' }}>
            <strong>Karşılaştırma görünümü yüklenemedi.</strong>
            <div style={{ marginTop: '6px', color: 'var(--text-muted)', fontSize: '11px' }}>{error}</div>
            <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>
              Sürüm içeriklerini aşağıdaki düğmeyle görüntüleyip elle karşılaştırabilirsiniz.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MonacoDiffView;
