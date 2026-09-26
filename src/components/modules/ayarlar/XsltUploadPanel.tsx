import React, { useCallback, useRef, useState } from 'react';
import { Upload, FileCode2, AlertCircle, CheckCircle2, X, FileWarning } from 'lucide-react';

/**
 * XSLT Dosya Yükleme Paneli
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 2026-09-26: Kullanıcı, Hızlı Bilişim portalından veya GİB'den aldığı `.xslt`
 * dosyasını doğrudan yükleyebilmelidir. Öncesinde yalnızca textarea'ya
 * kopyala-yapıştır vardı; 3500 satırlık bir şablon için bu kullanılamazdı.
 *
 * Kurallar:
 *  • Yalnız `.xslt`, `.xsl`, `.xml` uzantıları kabul edilir.
 *  • Boyut sınırı vardır (gömülü QR kütüphaneleri dosyayı şişirir; 2 MB üstü
 *    tarayıcı önizlemesini kilitler).
 *  • Yükleme sonrası içerik DOĞRULANIR; geçersizse kaydetme kapalı kalır.
 *  • Sürüm notu zorunludur: her yükleme yeni sürüm üretir ve nedenini
 *    sonradan anlayabilmek gerekir.
 */

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_EXT = ['.xslt', '.xsl', '.xml'];

export interface XsltUploadPanelProps {
  /** Doğrulama sonucu (sunucudan). */
  onValidate: (content: string) => Promise<{ valid: boolean; message?: string; error?: string }>;
  /** Kaydetme işlemi. */
  onSave: (content: string, versionNote: string) => Promise<void>;
  /** Kaydetme sürüyor mu? */
  saving?: boolean;
  /** Mevcut içerikle karşılaştırma için (opsiyonel). */
  currentContent?: string;
  /**
   * Yükleme kalıcı bir sürüm mü oluşturur, yoksa yalnız düzenleyiciye mi
   * uygulanır?
   *
   * 2026-09-26: İki giriş noktası iki farklı şey yapar. Belge listesindeki
   * yükleme gerçekten yeni sürüm yazar (`upload-xslt`); tasarımcı içindeki
   * yükleme ise XSLT'yi düzenleyiciye koyar ve sürüm, tasarım "Kaydet" ile
   * kaydedildiğinde oluşur. Aynı panel iki yerde kullanıldığı için, not
   * ZORUNLU tutulup sonra sessizce atılmamalıdır. Bu bayrak, panelin
   * etiketlerini ve not zorunluluğunu bağlama göre ayarlar.
   */
  mode?: 'version' | 'editor';
}

interface LoadedFile {
  name: string;
  size: number;
  content: string;
  lineCount: number;
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export const XsltUploadPanel: React.FC<XsltUploadPanelProps> = ({
  onValidate,
  onSave,
  saving = false,
  currentContent,
  mode = 'version',
}) => {
  const [loaded, setLoaded] = useState<LoadedFile | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<{ valid: boolean; message: string } | null>(null);
  const [validating, setValidating] = useState(false);
  const [versionNote, setVersionNote] = useState('');
  const [showDiff, setShowDiff] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const readFile = useCallback(async (file: File) => {
    setError(null);
    setValidation(null);
    setShowDiff(false);

    if (!ALLOWED_EXT.includes(extOf(file.name))) {
      setLoaded(null);
      setError(`Desteklenmeyen dosya türü ("${extOf(file.name) || 'uzantısız'}"). Beklenen: ${ALLOWED_EXT.join(', ')}`);
      return;
    }
    if (file.size > MAX_BYTES) {
      setLoaded(null);
      setError(
        `Dosya çok büyük (${formatBytes(file.size)}). En fazla ${formatBytes(MAX_BYTES)} yüklenebilir. ` +
        'Gömülü QR kütüphanesi olan şablonlar normalde 500 KB civarındadır.'
      );
      return;
    }
    if (file.size === 0) {
      setLoaded(null);
      setError('Dosya boş.');
      return;
    }

    try {
      const content = await file.text();
      if (!content.trim()) {
        setLoaded(null);
        setError('Dosya içeriği boş veya yalnızca boşluk karakterlerinden oluşuyor.');
        return;
      }
      const entry: LoadedFile = {
        name: file.name,
        size: file.size,
        content,
        lineCount: content.split('\n').length,
      };
      setLoaded(entry);

      setValidating(true);
      try {
        const res = await onValidate(content);
        setValidation({
          valid: res.valid,
          message: res.valid ? (res.message || 'XSLT geçerli.') : (res.error || res.message || 'XSLT geçersiz.'),
        });
      } finally {
        setValidating(false);
      }
    } catch (e: any) {
      setLoaded(null);
      setError(`Dosya okunamadı: ${e?.message || e}`);
    }
  }, [onValidate]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void readFile(file);
  }, [readFile]);

  const reset = () => {
    setLoaded(null);
    setError(null);
    setValidation(null);
    setVersionNote('');
    setShowDiff(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const needsNote = mode === 'version';
  const canSave = !!loaded && validation?.valid === true && (!needsNote || versionNote.trim().length >= 3) && !saving;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* ── 1. Dosya seçme / sürükle-bırak ─────────────────────────────── */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        style={{
          border: `2px dashed ${dragging ? 'var(--primary)' : 'var(--border-color)'}`,
          background: dragging ? 'var(--primary-light)' : 'var(--bg-surface-secondary)',
          borderRadius: 'var(--radius-md)',
          padding: '22px 16px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'border-color 120ms ease, background 120ms ease',
        }}
      >
        <Upload size={22} color="var(--primary)" style={{ marginBottom: '6px' }} />
        <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-main)' }}>
          XSLT dosyasını buraya sürükleyin veya seçmek için tıklayın
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
          {ALLOWED_EXT.join(' · ')} · en fazla {formatBytes(MAX_BYTES)}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xslt,.xsl,.xml"
          onChange={e => { const f = e.target.files?.[0]; if (f) void readFile(f); }}
          style={{ display: 'none' }}
        />
      </div>

      {/* ── 2. Hata ────────────────────────────────────────────────────── */}
      {error && (
        <div
          style={{
            padding: '9px 12px', borderRadius: 'var(--radius-sm)', fontSize: '11.5px',
            background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
            color: 'var(--danger-text)', display: 'flex', alignItems: 'flex-start', gap: '7px',
          }}
        >
          <FileWarning size={14} style={{ marginTop: '1px', flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {/* ── 3. Yüklenen dosya özeti + doğrulama ────────────────────────── */}
      {loaded && (
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 12px',
              background: 'var(--bg-surface-secondary)', borderBottom: '1px solid var(--border-color)',
            }}
          >
            <FileCode2 size={15} color="var(--primary)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {loaded.name}
              </div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                {formatBytes(loaded.size)} · {loaded.lineCount.toLocaleString('tr-TR')} satır
                {currentContent ? ` · mevcut tasarım ${currentContent.split('\n').length.toLocaleString('tr-TR')} satır` : ''}
              </div>
            </div>
            {currentContent && (
              <button
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '10.5px', padding: '2px 7px' }}
                onClick={() => setShowDiff(v => !v)}
              >
                {showDiff ? 'Gizle' : 'Karşılaştır'}
              </button>
            )}
            <button
              className="btn btn-secondary btn-sm"
              onClick={e => { e.stopPropagation(); reset(); }}
              style={{ fontSize: '10.5px', padding: '2px 6px' }}
              title="Seçimi temizle"
            >
              <X size={11} />
            </button>
          </div>

          <div style={{ padding: '10px 12px' }}>
            {validating ? (
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>XSLT doğrulanıyor...</div>
            ) : validation ? (
              <div
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '7px', fontSize: '11.5px',
                  color: validation.valid ? 'var(--success-text)' : 'var(--danger-text)',
                }}
              >
                {validation.valid ? <CheckCircle2 size={14} style={{ marginTop: '1px', flexShrink: 0 }} /> : <AlertCircle size={14} style={{ marginTop: '1px', flexShrink: 0 }} />}
                <span>{validation.message}</span>
              </div>
            ) : null}

            {showDiff && currentContent && (
              <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px' }}>Mevcut tasarım</div>
                  <pre style={{ margin: 0, maxHeight: '150px', overflow: 'auto', fontSize: '10px', fontFamily: 'var(--font-mono)', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-xs)', padding: '7px' }}>
                    {currentContent.slice(0, 1500)}
                  </pre>
                </div>
                <div>
                  <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--primary)', marginBottom: '3px' }}>Yeni dosya</div>
                  <pre style={{ margin: 0, maxHeight: '150px', overflow: 'auto', fontSize: '10px', fontFamily: 'var(--font-mono)', background: 'var(--primary-light)', border: '1px solid var(--primary)', borderRadius: 'var(--radius-xs)', padding: '7px' }}>
                    {loaded.content.slice(0, 1500)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 4. Sürüm notu + kaydet ─────────────────────────────────────── */}
      {loaded && validation?.valid && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-main)' }}>
            Sürüm notu{' '}
            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
              {needsNote ? '(zorunlu — sonradan nedeni anlaşılmalı)' : '(opsiyonel)'}
            </span>
          </label>
          <input
            className="form-control"
            value={versionNote}
            onChange={e => setVersionNote(e.target.value)}
            placeholder="Örn: Hızlı Bilişim portalından alınan general.xslt yüklendi"
            style={{ fontSize: '12px' }}
          />
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
            {needsNote
              ? 'Yükleme yeni bir sürüm oluşturur; mevcut tasarım sürüm geçmişinden geri yüklenebilir.'
              : 'Yükleme, XSLT kodunu düzenleyiciye koyar. Kalıcı sürüm, tasarım "Kaydet" ile kaydedildiğinde oluşur.'}
          </div>
          <button
            className="btn btn-primary"
            disabled={!canSave}
            onClick={() => void onSave(loaded.content, versionNote.trim())}
            style={{ alignSelf: 'flex-start', fontSize: '12px', padding: '7px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Upload size={14} />
            {saving ? 'Yükleniyor...' : (needsNote ? 'Yükle ve Yeni Sürüm Oluştur' : 'Kodu Düzenleyiciye Yükle')}
          </button>
        </div>
      )}
    </div>
  );
};
