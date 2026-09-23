/**
 * İŞBEY CLOUD — Canlı QA Test Ekranı (SPA içi görünüm)
 * ====================================================
 * FAZ 25 doğrulama zincirinin (docs/20) tarayıcı karşılığı.
 * POST /api/test-screen/run uçsunu çağırır; uç requireAuth +
 * requireRole('SUPER_ADMIN','ADMIN') ile korunur, token SPA api
 * istemcisi (services/api.ts) tarafından otomatik eklenir.
 *
 * Rapor yan etkisizdir (kontör tüketimi / e-belge gönderimi yok);
 * secret değerleri GÖSTERİLMEZ — yalnız SET/UNSET bilgisi döner.
 */

import React, { useState } from 'react';
import { api } from '../../../services/api';
import { FlaskConical } from 'lucide-react';

type CheckStatus = 'PASS' | 'FAIL' | 'WARN' | 'SKIP';

interface QaCheck {
  id: string;
  category: string;
  title: string;
  status: CheckStatus;
  expected?: string;
  actual?: string;
  note?: string;
}

interface QaReport {
  ranAt: string;
  base: string;
  checks: QaCheck[];
  summary: { pass: number; fail: number; warn: number; skip: number };
}

const STATUS_STYLE: Record<CheckStatus, { color: string; bg: string }> = {
  PASS: { color: '#166534', bg: 'rgba(22,163,74,0.12)' },
  FAIL: { color: '#991b1b', bg: 'rgba(220,38,38,0.12)' },
  WARN: { color: '#92400e', bg: 'rgba(217,119,6,0.12)' },
  SKIP: { color: '#475569', bg: 'rgba(100,116,139,0.12)' },
};

export const LiveQaTestScreen: React.FC = () => {
  const [report, setReport] = useState<QaReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runTests = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await api.runQaTestReport();
      setReport(res.report);
    } catch (err: any) {
      setError(err?.message || 'Rapor alınamadı. Sunucunun (Port 4000) aktif olduğundan emin olun.');
    } finally {
      setRunning(false);
    }
  };

  const categories = report ? Array.from(new Set(report.checks.map(c => c.category))) : [];

  return (
    <div className="card-panel" style={{ padding: '16px', marginTop: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <h4 style={{ fontSize: '13px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <FlaskConical size={15} color="#7c3aed" />
          <span>Canlı QA Test Ekranı — FAZ 25 Doğrulama Zinciri</span>
        </h4>
        <button
          onClick={runTests}
          disabled={running}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: 'var(--primary, #d12131)', color: '#fff', border: 'none',
            borderRadius: '8px', padding: '8px 14px', fontSize: '12px', fontWeight: 700,
            cursor: running ? 'wait' : 'pointer', opacity: running ? 0.6 : 1,
          }}
        >
          {running ? '⏳ Koşuluyor… (~1 dk)' : '▶ Testleri Çalıştır'}
        </button>
      </div>
      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '8px 0 0' }}>
        Yan etkisizdir (kontör tüketimi / e-belge gönderimi yok). Secret değerleri gösterilmez — yalnız SET/UNSET.
        Webhook rate-limit testi bucket'ı ~1 dk doldurur; bu sürede gerçek webhook istekleri 429 alabilir.
        Her koşum 3 login üretir; login limiti 15 dk/20 olduğu için art arda çok koşum rate-limit'e takılabilir
        (etkilenen kontroller SKIP olarak işaretlenir, FAIL sayılmaz).
      </p>

      {error && (
        <div style={{
          marginTop: '12px', padding: '10px 12px',
          background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)',
          borderRadius: '8px', color: '#991b1b', fontSize: '12px',
        }}>
          ❌ {error}
        </div>
      )}

      {report && (
        <>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
            {([
              ['PASS', report.summary.pass, '#166534', 'rgba(22,163,74,0.12)'],
              ['FAIL', report.summary.fail, '#991b1b', 'rgba(220,38,38,0.12)'],
              ['WARN', report.summary.warn, '#92400e', 'rgba(217,119,6,0.12)'],
              ['SKIP', report.summary.skip, '#475569', 'rgba(100,116,139,0.12)'],
            ] as const).map(([label, count, color, bg]) => (
              <span key={label} style={{ borderRadius: '999px', padding: '5px 12px', fontSize: '11px', fontWeight: 800, color, background: bg }}>
                {label}: {count}
              </span>
            ))}
          </div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', margin: '6px 0 2px' }}>
            Koşum: {report.ranAt} · Hedef: {report.base}
          </div>

          {categories.map(cat => (
            <div key={cat} style={{ marginTop: '12px' }}>
              {/* 2026-09-13 (tasarım sadeleştirmesi): textTransform: uppercase kaldırıldı (tüm-büyük harf yasak). */}
              <div style={{ fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '6px' }}>
                {cat}
              </div>
              {report.checks.filter(c => c.category === cat).map(c => {
                const st = STATUS_STYLE[c.status];
                return (
                  <div key={c.id} style={{
                    background: 'var(--bg-surface-secondary)', border: '1px solid var(--border, #e2e8f0)',
                    borderRadius: '8px', padding: '10px 12px', marginBottom: '6px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                      <span style={{
                        fontSize: '10px', fontWeight: 800, borderRadius: '6px', padding: '2px 8px',
                        color: st.color, background: st.bg, minWidth: '46px', textAlign: 'center',
                      }}>
                        {c.status}
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 600, flex: 1 }}>{c.title}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{c.id}</span>
                    </div>
                    {(c.expected || c.actual) && (
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.5 }}>
                        {c.expected ? <span>Beklenen: {c.expected}{c.actual ? ' · ' : ''}</span> : null}
                        {c.actual ? <span>Gerçek: {c.actual}</span> : null}
                      </div>
                    )}
                    {c.note && (
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        ℹ️ {c.note}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </>
      )}
    </div>
  );
};
