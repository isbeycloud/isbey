import React, { useEffect, useMemo, useState } from 'react';
import { Play, RefreshCw, Upload, AlertCircle, CheckCircle2, FileCode2, ClipboardPaste } from 'lucide-react';
import { api } from '../../../../services/api';
import { useToast } from '../../../../context/ToastContext';
import { MonacoXsltEditor } from './MonacoXsltEditor';

/**
 * Test XML Modu
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 2026-09-27: Şablonların farklı UBL-TR senaryolarına karşı sınanması.
 *
 * KURAL — GERÇEK E-FATURA GÖNDERİMİ YOK:
 * Bu mod yalnızca XML üretir/alır ve yerel önizleme dönüşümüne besler.
 * Hızlı Bilişim'e hiçbir çağrı yapılmaz, belge durumu değiştirilmez
 * (SEND/SENDING/SENT akışı tetiklenmez). Sunucudaki `/test-xml/:scenario`
 * ucu da yalnız XML metni döner.
 *
 * SENARYOLAR SUNUCUDAN GELİR: Kimlikler ve etiketler tek kaynaktan
 * (server/services/ublTestXmlScenarios.ts) okunur; istemcide ikinci bir
 * liste tutulmaz ki ayrışmasınlar.
 */

export interface TestXmlModuProps {
  /** Seçili senaryo kimliği (üst bileşen saklar). */
  scenario: string;
  onScenarioChange: (id: string) => void;
  /** Geçerli XML metni. */
  xml: string;
  /** Kullanıcı XML'i değiştirdiğinde (elle düzenleme / yapıştırma). */
  onXmlChange: (xml: string) => void;
  /** XML önizlemeye uygulandığında üst bileşen tazeleme yapar. */
  onApply?: () => void;
}

interface ScenarioInfo {
  id: string;
  label: string;
  description: string;
  highlights: string[];
}

export const TestXmlModu: React.FC<TestXmlModuProps> = ({
  scenario,
  onScenarioChange,
  xml,
  onXmlChange,
  onApply,
}) => {
  const { showToast } = useToast();
  const [scenarios, setScenarios] = useState<ScenarioInfo[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingXml, setLoadingXml] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  /** Sunucudan gelen metin — kullanıcı düzenlerse "elle değiştirildi" uyarısı çıkar. */
  const [pristineXml, setPristineXml] = useState<string>('');

  const edited = useMemo(() => xml !== pristineXml && pristineXml !== '', [xml, pristineXml]);

  /** XML iyi-biçimli mi? Kullanıcı elle bozarsa dönüşüm anlaşılmaz hata verir. */
  const wellFormed = useMemo(() => {
    if (!xml.trim()) return { ok: false, reason: 'XML boş.' };
    try {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const err = doc.querySelector('parsererror');
      if (err) return { ok: false, reason: err.textContent?.split('\n')[0] || 'Ayrıştırma hatası.' };
      if (!doc.documentElement) return { ok: false, reason: 'Kök eleman yok.' };
      return { ok: true, root: doc.documentElement.tagName || doc.documentElement.nodeName, reason: '' };
    } catch (e: any) {
      return { ok: false, reason: e?.message || String(e) };
    }
  }, [xml]);

  /** Kalem sayısı — kullanıcı ürün tablosunun kaç satır üreteceğini görsün. */
  const lineCount = useMemo(() => {
    const m = xml.match(/<(?:[A-Za-z0-9_]+:)?(InvoiceLine|DespatchLine)\b/g);
    return m ? m.length : 0;
  }, [xml]);

  const loadScenarios = async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await api.getTestScenarios();
      if (res.success && Array.isArray(res.scenarios)) {
        setScenarios(res.scenarios);
        // Liste geldi ama hiç senaryo seçili değilse ilkini seç.
        if (!scenario && res.scenarios.length > 0) onScenarioChange(res.scenarios[0].id);
      } else {
        setListError('Senaryo listesi boş döndü.');
      }
    } catch (e: any) {
      setListError(e?.message || 'Senaryo listesi alınamadı.');
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadScenarios();
    // Yalnız ilk açılışta; senaryo değişimi ayrı efektle yönetilir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!scenario) return;
    let cancelled = false;
    (async () => {
      setLoadingXml(true);
      try {
        const text = await api.getTestXml(scenario);
        if (cancelled) return;
        onXmlChange(text);
        setPristineXml(text);
      } catch (e: any) {
        if (cancelled) return;
        // Sessizce eski XML'i bırakma — kullanıcı hangi senaryoya baktığını
        // sansın istemiyoruz.
        showToast(`Test XML alınamadı: ${e?.message || e}`, 'error');
      } finally {
        if (!cancelled) setLoadingXml(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario]);

  const active = scenarios.find(s => s.id === scenario);

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0 }}>
      {/* ── Sol: senaryo listesi ── */}
      <div
        style={{
          width: '268px', flexShrink: 0, borderRight: '1px solid var(--border-color)',
          background: 'var(--bg-surface)', overflowY: 'auto', padding: '9px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '7px' }}>
          <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            Test Senaryoları
          </div>
          <button
            type="button" className="btn btn-secondary btn-sm"
            onClick={loadScenarios} disabled={loadingList}
            style={{ fontSize: '10px', padding: '1px 6px', height: '20px' }}
            title="Listeyi yenile"
          >
            <RefreshCw size={10} />
          </button>
        </div>

        {loadingList && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Yükleniyor…</div>}

        {listError && (
          <div style={{ fontSize: '10.5px', color: 'var(--danger)', lineHeight: 1.5, padding: '6px', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-sm)' }}>
            <AlertCircle size={11} /> {listError}
          </div>
        )}

        {scenarios.map(s => {
          const sel = s.id === scenario;
          return (
            <button
              key={s.id}
              type="button"
              data-testid={`scenario-${s.id}`}
              onClick={() => onScenarioChange(s.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                padding: '7px 8px', marginBottom: '5px', borderRadius: 'var(--radius-sm)',
                border: `1px solid ${sel ? 'var(--primary)' : 'var(--border-color)'}`,
                background: sel ? 'var(--primary-light)' : 'var(--bg-surface-secondary)',
              }}
            >
              <div style={{ fontSize: '11.5px', fontWeight: 700, color: sel ? 'var(--primary)' : 'var(--text-main)', marginBottom: '2px' }}>
                {s.label}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.45 }}>{s.description}</div>
            </button>
          );
        })}

        {active && active.highlights?.length > 0 && (
          <div style={{
            marginTop: '6px', padding: '7px 8px', background: 'var(--bg-surface-secondary)',
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)',
          }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px' }}>
              Bu senaryoda
            </div>
            <ul style={{ margin: 0, marginLeft: '14px', padding: 0, fontSize: '10px', color: 'var(--text-main)', lineHeight: 1.55 }}>
              {active.highlights.map((h, i) => <li key={i}>{h}</li>)}
            </ul>
          </div>
        )}

        <div style={{
          marginTop: '10px', padding: '7px 8px', fontSize: '10px', lineHeight: 1.5,
          background: 'color-mix(in srgb, var(--success) 8%, transparent)',
          border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)',
          borderRadius: 'var(--radius-sm)', color: 'var(--text-main)',
        }}>
          <strong>Gerçek gönderim yapılmaz.</strong> Bu senaryolar yalnızca yerel önizleme
          dönüşümüne girdi olur; Hızlı Bilişim'e belge gönderilmez, belge durumu değişmez.
        </div>
      </div>

      {/* ── Sağ: XML içeriği ── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
            padding: '5px 10px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-color)',
            flexShrink: 0, flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10.5px' }}>
            {wellFormed.ok ? (
              <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
                <CheckCircle2 size={12} /> Geçerli XML
              </span>
            ) : (
              <span style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
                <AlertCircle size={12} /> {wellFormed.reason}
              </span>
            )}
            {wellFormed.ok && wellFormed.root && (
              <span style={{ color: 'var(--text-muted)' }}>kök: <code>{wellFormed.root}</code></span>
            )}
            <span style={{ color: 'var(--text-muted)' }}>kalem: <strong>{lineCount}</strong></span>
            <span style={{ color: 'var(--text-muted)' }}>{xml.length.toLocaleString('tr-TR')} bayt</span>
            {edited && (
              <span style={{ color: 'var(--warning)', fontWeight: 700 }} title="Senaryodan yüklendiğinden farklı">
                elle düzenlendi
              </span>
            )}
            {loadingXml && <span style={{ color: 'var(--text-muted)' }}>yükleniyor…</span>}
          </div>

          <div style={{ display: 'flex', gap: '5px' }}>
            <button
              type="button" className="btn btn-secondary btn-sm"
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  if (!text.trim()) { showToast('Pano boş.', 'warning'); return; }
                  onXmlChange(text);
                  showToast('Panodaki XML yüklendi.', 'success');
                } catch (e: any) {
                  showToast(`Panodan okunamadı: ${e?.message || e}`, 'error');
                }
              }}
              style={{ fontSize: '10.5px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <ClipboardPaste size={12} /> Yapıştır
            </button>

            <label
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '10.5px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', margin: 0 }}
            >
              <Upload size={12} /> Dosya
              <input
                type="file"
                accept=".xml,application/xml,text/xml"
                style={{ display: 'none' }}
                onChange={async e => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  if (f.size > 5 * 1024 * 1024) {
                    showToast('XML dosyası 5 MB sınırını aşıyor.', 'warning');
                    return;
                  }
                  const text = await f.text();
                  onXmlChange(text);
                  showToast(`"${f.name}" yüklendi.`, 'success');
                }}
              />
            </label>

            <button
              type="button" className="btn btn-secondary btn-sm"
              data-testid="xml-reset"
              onClick={() => { onXmlChange(pristineXml); showToast('Senaryo XML\'ine geri dönüldü.', 'info'); }}
              disabled={!edited}
              style={{ fontSize: '10.5px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <RefreshCw size={12} /> Sıfırla
            </button>

            <button
              type="button" className="btn btn-primary btn-sm"
              data-testid="xml-use-in-preview"
              onClick={() => { onApply?.(); showToast('Bu XML ile önizleme yenilendi.', 'success'); }}
              disabled={!wellFormed.ok}
              style={{ fontSize: '10.5px', display: 'flex', alignItems: 'center', gap: '4px' }}
              title={wellFormed.ok ? 'Bu XML ile önizleme dönüşümünü çalıştır' : 'Önce XML hatası giderilmeli'}
            >
              <Play size={12} /> Önizlemede Kullan
            </button>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <MonacoXsltEditor
            value={xml}
            onChange={onXmlChange}
            height="100%"
            /* XML için dil 'xml'; XSLT tamamlama katmanı burada zararsız
               (kullanıcı XSLT yazmıyor) ve düzenleyici davranışı aynı kalır. */
          />
        </div>

        <div
          style={{
            padding: '4px 10px', borderTop: '1px solid var(--border-color)',
            background: 'var(--bg-surface)', fontSize: '10px', color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0,
          }}
        >
          <FileCode2 size={11} />
          UBL-TR 2.1 · senaryolar sunucuda üretilir (server/services/ublTestXmlScenarios.ts) ·
          örnek veride başka firma kimliği yer almaz
        </div>
      </div>
    </div>
  );
};

export default TestXmlModu;
