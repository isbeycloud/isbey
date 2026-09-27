import React, { useEffect, useState } from 'react';
import { History, RotateCcw, GitCompare, AlertCircle, RefreshCw, FileText } from 'lucide-react';
import { api } from '../../../../services/api';
import { useToast } from '../../../../context/ToastContext';

/**
 * Sürüm Geçmişi Paneli
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 2026-09-27: Mevcut sürüm altyapısı (documentTemplateVersions + restore ucu)
 * KORUNUR ve üzerine karşılaştırma + geri yükleme arayüzü eklenir.
 *
 * KURAL: Geri yükleme MEVCUT `restore` ucunu kullanır — kendi yazma
 * mantığımızı kurmuyoruz. Sunucu zaten yeni bir sürüm olarak kaydediyor
 * (üzerine yazmıyor), yani geri alma da geri alınabilir.
 *
 * KİRLİ DURUM: Editörde kaydedilmemiş değişiklik varken geri yükleme
 * yapılırsa o değişiklik KAYBOLUR. Bu yüzden onay istenir.
 */

export interface SurumGecmisiPaneliProps {
  templateId: string | null;
  /** Kaydedilmemiş değişiklik var mı (uyarı için). */
  dirty?: boolean;
  /** Editördeki geçerli içerik — "mevcut" ile karşılaştırmak için. */
  currentContent: string;
  /** Geri yükleme başarılı olduğunda, yeni içeriği düzenleyiciye koymak için. */
  onRestored: (content: string, version: number) => void;
  /** İki sürümü karşılaştırmak istendiğinde. */
  onCompare: (a: { version: number; content: string }, b: { version: number; content: string }) => void;
}

/**
 * Sunucudaki `documentTemplateVersions` kaydının şekli.
 * DİKKAT: not alanının adı `notes`'tur (`versionNote` DEĞİL). Sunucu
 * `versionNote` gövdesini alır ama kayda `notes` olarak yazar
 * (bkz. server/routes/document-templates.ts, PUT ve upload-xslt uçları).
 */
interface VersionRow {
  id?: string;
  version: number;
  xsltContent?: string;
  notes?: string;
  createdBy?: string;
  createdAt?: string;
}

function fmtDate(v?: string): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const SurumGecmisiPaneli: React.FC<SurumGecmisiPaneliProps> = ({
  templateId,
  dirty = false,
  currentContent,
  onRestored,
  onCompare,
}) => {
  const { showToast } = useToast();
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);
  /** Karşılaştırma için seçilen en fazla iki sürüm. */
  const [picked, setPicked] = useState<number[]>([]);

  const load = async () => {
    if (!templateId) { setVersions([]); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await api.getDocumentTemplateVersions(templateId);
      if (res.success && Array.isArray(res.versions)) {
        setVersions(res.versions as VersionRow[]);
      } else {
        setError('Sürüm listesi boş döndü.');
      }
    } catch (e: any) {
      setError(e?.message || 'Sürüm geçmişi alınamadı.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  const versionContent = (v: VersionRow): string => v.xsltContent || '';

  const togglePick = (v: number) => {
    setPicked(prev => {
      if (prev.includes(v)) return prev.filter(x => x !== v);
      if (prev.length >= 2) return [prev[1], v]; // en eski seçimi düşür
      return [...prev, v];
    });
  };

  const comparePicked = () => {
    if (picked.length !== 2) {
      showToast('Karşılaştırmak için listeden iki sürüm seçin.', 'warning');
      return;
    }
    const sorted = [...picked].sort((a, b) => a - b);
    const a = versions.find(v => v.version === sorted[0]);
    const b = versions.find(v => v.version === sorted[1]);
    if (!a || !b) { showToast('Seçilen sürümler bulunamadı.', 'error'); return; }
    onCompare(
      { version: a.version, content: versionContent(a) },
      { version: b.version, content: versionContent(b) }
    );
  };

  const restore = async (v: VersionRow) => {
    if (!templateId) return;
    if (dirty) {
      const ok = window.confirm(
        'Editörde kaydedilmemiş değişiklikleriniz var. Geri yükleme yapılırsa bu değişiklikler kaybolur.\n\n' +
        `v${v.version} sürümüne dönmek istiyor musunuz?`
      );
      if (!ok) return;
    }
    setRestoring(v.version);
    try {
      const res = await api.restoreDocumentTemplateVersion(templateId, v.version);
      if (res.success) {
        showToast(`✓ v${v.version} sürümü geri yüklendi.`, 'success');
        // Sunucu geri yüklemeyi YENİ bir sürüm olarak yazar; bu yüzden
        // listeyi ve düzenleyiciyi tazelemek zorunludur.
        await load();
        const fresh = await api.getDocumentTemplate(templateId).catch(() => null);
        const content = (fresh as any)?.template?.xsltContent ?? versionContent(v);
        const newVersion = (fresh as any)?.template?.version ?? v.version;
        onRestored(content, newVersion);
      }
    } catch (e: any) {
      showToast(e?.message || 'Geri yükleme başarısız.', 'error');
    } finally {
      setRestoring(null);
    }
  };

  if (!templateId) {
    return (
      <div style={{ padding: '14px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
        <History size={16} style={{ marginBottom: '6px', display: 'block' }} />
        Bu tasarım henüz kaydedilmedi. Sürüm geçmişi, tasarım ilk kez kaydedildikten sonra oluşur.
      </div>
    );
  }

  const currentSize = currentContent.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 10px', borderBottom: '1px solid var(--border-color)',
          background: 'var(--bg-surface)', flexShrink: 0,
        }}
      >
        <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <History size={13} /> Sürüm Geçmişi
          <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '10.5px' }}>
            ({versions.length} kayıt)
          </span>
        </div>
        <div style={{ display: 'flex', gap: '5px' }}>
          <button
            type="button" className="btn btn-secondary btn-sm"
            onClick={load} disabled={loading}
            style={{ fontSize: '10.5px', padding: '2px 7px', height: '22px', display: 'flex', alignItems: 'center', gap: '3px' }}
            title="Listeyi yenile"
          >
            <RefreshCw size={11} /> Yenile
          </button>
          <button
            type="button" className="btn btn-secondary btn-sm"
            data-testid="version-compare"
            onClick={comparePicked} disabled={picked.length !== 2}
            style={{ fontSize: '10.5px', padding: '2px 7px', height: '22px', display: 'flex', alignItems: 'center', gap: '3px' }}
            title="Seçili iki sürümü karşılaştır"
          >
            <GitCompare size={11} /> Karşılaştır ({picked.length}/2)
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '8px 10px', fontSize: '10.5px', color: 'var(--danger)', background: 'var(--bg-surface-secondary)' }}>
          <AlertCircle size={11} /> {error}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {/* Kaydedilmemiş hâli de listede göster — kullanıcı neyle karşılaştırdığını bilsin */}
        <div
          style={{
            padding: '7px 10px', borderBottom: '1px solid var(--border-color)',
            background: dirty ? 'color-mix(in srgb, var(--warning) 10%, transparent)' : 'var(--bg-surface-secondary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: dirty ? 'var(--warning)' : 'var(--text-muted)' }}>
              {dirty ? 'Kaydedilmemiş değişiklikler' : 'Editördeki içerik'}
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              {currentSize.toLocaleString('tr-TR')} bayt
            </span>
          </div>
          {dirty && (
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Kaydetmeden geri yükleme yaparsanız bu değişiklikler kaybolur.
            </div>
          )}
        </div>

        {loading && (
          <div style={{ padding: '12px', fontSize: '11px', color: 'var(--text-muted)' }}>Sürümler yükleniyor…</div>
        )}

        {!loading && versions.length === 0 && !error && (
          <div style={{ padding: '12px', fontSize: '11px', color: 'var(--text-muted)' }}>
            Kayıtlı sürüm bulunamadı.
          </div>
        )}

        {versions.map((v, idx) => {
          const isPicked = picked.includes(v.version);
          const isLatest = idx === 0;
          return (
            <div
              key={v.id || v.version}
              style={{
                padding: '8px 10px',
                borderBottom: '1px solid var(--border-light)',
                background: isPicked ? 'var(--primary-light)' : 'transparent',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                <input
                  type="checkbox"
                  data-testid={`version-pick-${v.version}`}
                  checked={isPicked}
                  onChange={() => togglePick(v.version)}
                  title="Karşılaştırma için seç"
                />
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-main)' }}>
                  v{v.version}
                </span>
                {isLatest && (
                  <span style={{ fontSize: '9px', fontWeight: 700, background: 'var(--success)', color: '#fff', padding: '0 5px', borderRadius: '3px' }}>
                    GÜNCEL
                  </span>
                )}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.5, marginLeft: '18px' }}>
                <div>{fmtDate(v.createdAt)}{v.createdBy ? ` · ${v.createdBy}` : ''}</div>
                {v.notes && (
                  <div style={{ color: 'var(--text-main)', marginTop: '1px' }}>{v.notes}</div>
                )}
                {v.xsltContent !== undefined && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '1px' }}>
                    <FileText size={9} /> {(v.xsltContent || '').length.toLocaleString('tr-TR')} bayt
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '5px', marginTop: '5px', marginLeft: '18px' }}>
                <button
                  type="button" className="btn btn-secondary btn-sm"
                  onClick={() => onCompare(
                    { version: v.version, content: versionContent(v) },
                    { version: 0, content: currentContent }
                  )}
                  disabled={v.xsltContent === undefined}
                  style={{ fontSize: '10px', padding: '1px 6px', height: '20px', display: 'flex', alignItems: 'center', gap: '3px' }}
                  title="Bu sürümü editördeki içerikle karşılaştır"
                >
                  <GitCompare size={9} /> Editörle karşılaştır
                </button>
                <button
                  type="button" className="btn btn-secondary btn-sm"
                  data-testid={`version-restore-${v.version}`}
                  onClick={() => restore(v)}
                  disabled={restoring !== null || isLatest}
                  style={{ fontSize: '10px', padding: '1px 6px', height: '20px', display: 'flex', alignItems: 'center', gap: '3px' }}
                  title={isLatest ? 'Güncel sürüm zaten yüklü' : `v${v.version} sürümüne geri dön`}
                >
                  <RotateCcw size={9} /> {restoring === v.version ? 'Yükleniyor…' : 'Geri Yükle'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          padding: '5px 10px', borderTop: '1px solid var(--border-color)',
          background: 'var(--bg-surface)', fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0,
        }}
      >
        Geri yükleme üzerine yazmaz: mevcut içerik korunur ve yeni bir sürüm olarak kaydedilir.
      </div>
    </div>
  );
};

export default SurumGecmisiPaneli;
