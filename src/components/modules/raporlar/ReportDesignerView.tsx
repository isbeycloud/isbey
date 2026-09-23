/**
 * İŞBEY CLOUD — FAZ 25.3-C RAPOR TASARIM MERKEZİ (ReportDesignerView)
 * ===================================================================
 * Dashboard tarzı KPI raporları tasarlama ekranı.
 *  Sol kolon   → kayıtlı rapor şablonları + yeni rapor
 *  Orta kolon  → canlı önizleme (KPI kartları + grafik + tablo)
 *  Sağ kolon   → özellik paneli (veri kaynağı, grafik, alanlar, filtre, KPI)
 *
 * Veri katmanı: /api/report-designs (tenant izole, requireAuth).
 * Backend erişilemezse localStorage fallback ('isbey_report_designs_v1').
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus, Save, Trash2, Printer, FileSpreadsheet, RefreshCw,
  Loader2, AlertCircle, Database, SlidersHorizontal, Gauge,
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, PointElement, LineElement,
  ArcElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { useApp } from '../../../context/AppContext';
import { useToast } from '../../../context/ToastContext';
import { api } from '../../../services/api';
import {
  DATA_SOURCE_LABELS, CHART_LABELS, REPORT_FIELDS, KPI_LABELS,
  FIELD_COLUMN_LABELS, AMOUNT_LABEL, NEW_REPORT_DESIGN,
  orderedFields, fieldHasData, computeKpis, buildChartData,
  applyFilters, exportRowsToCsv,
} from './reportBuilderTypes';
import type {
  ReportDesign, ReportDataSource, ReportChartType, ReportFieldId, ReportRow, ReportKpiId,
} from './reportBuilderTypes';
import { loadReportRows } from './reportDataLoader';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, PointElement, LineElement,
  ArcElement, Title, Tooltip, Legend, Filler,
);

const LS_KEY = 'isbey_report_designs_v1';
const CHART_PALETTE = ['#0066cc', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316'];

const fmtTL = (n: number) => (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
const fmtNum = (n: number) => (Number(n) || 0).toLocaleString('tr-TR');
const fmtDate = (d?: string) => (d ? d.slice(0, 10).split('-').reverse().join('.') : '-');
const currentMonthKey = () => new Date().toISOString().slice(0, 7);

// ─── Yerel kayıt: son durum özeti (backend kapalıyken) ──────────────────────

const readLocalDesigns = (): ReportDesign[] => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as ReportDesign[]) : [];
  } catch { return []; }
};

const writeLocalDesigns = (list: ReportDesign[]) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch { /* kota dolu — sessiz */ }
};

// ─── Ana bileşen ────────────────────────────────────────────────────────────

export const ReportDesignerView: React.FC = () => {
  const { showToast } = useToast();
  const { openPrintModal } = useApp();

  const [designs, setDesigns] = useState<ReportDesign[]>([]);
  const [activeDesignId, setActiveDesignId] = useState<string | null>(null);
  const [design, setDesign] = useState<ReportDesign>(() => ({
    id: 'draft',
    name: NEW_REPORT_DESIGN.name,
    dataSource: NEW_REPORT_DESIGN.dataSource,
    chartType: NEW_REPORT_DESIGN.chartType,
    fields: [...NEW_REPORT_DESIGN.fields],
    kpis: [...(NEW_REPORT_DESIGN.kpis || [])],
  }));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // ── Kayıtlı tasarımları yükle
  useEffect(() => {
    api.getReportDesigns()
      .then(res => {
        if (res.success && Array.isArray(res.reportDesigns)) {
          setDesigns(res.reportDesigns);
        }
      })
      .catch(() => setDesigns(readLocalDesigns()));
  }, []);

  // ── Tasarım değişince veriyi çalıştır
  const runReport = useCallback(async (d: ReportDesign) => {
    setRunning(true);
    setWarnings([]);
    try {
      const { rows: loaded, warnings: w } = await loadReportRows(d.dataSource, { dateFrom, dateTo });
      setRows(loaded);
      setWarnings(w);
    } catch {
      setRows([]);
      setWarnings(['Veri kaynağı şu anda yüklenemedi.']);
    } finally {
      setRunning(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { runReport(design); }, [design.dataSource, runReport]); // dataSource / tarih aralığı değişince yenile

  // ── Filtreli satır kümesi + KPI + grafik (hafıza — render dışı hesap)
  const filteredRows = useMemo(() => applyFilters(rows, { dateFrom, dateTo }), [rows, dateFrom, dateTo]);
  const kpis = useMemo(() => computeKpis(filteredRows, design.kpis, currentMonthKey()), [filteredRows, design.kpis]);
  const groupField = useMemo<ReportFieldId | undefined>(() => orderedFields(design.fields).find(f => f !== 'date'), [design.fields]);
  const chartData = useMemo(() => buildChartData(filteredRows, groupField), [filteredRows, groupField]);
  const tableFields = useMemo(() => orderedFields(design.fields), [design.fields]);

  const activeDesign = designs.find(d => d.id === activeDesignId) || null;

  // ── Tasarım alanı güncelleme
  const patchDesign = (patch: Partial<ReportDesign>) => {
    setDesign(prev => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const toggleField = (fid: ReportFieldId) => {
    setDesign(prev => {
      const has = prev.fields.includes(fid);
      const next = has ? prev.fields.filter(f => f !== fid) : [...prev.fields, fid];
      // En az 1 alan kalmalı (tablo boş kalmasın)
      return next.length > 0 ? { ...prev, fields: next } : prev;
    });
    setDirty(true);
  };

  const toggleKpi = (kid: ReportKpiId) => {
    setDesign(prev => {
      const cur = prev.kpis || [];
      const next = cur.includes(kid) ? cur.filter(k => k !== kid) : [...cur, kid];
      return { ...prev, kpis: next };
    });
    setDirty(true);
  };

  // ── Kaydet (yeni veya güncelle)
  const handleSave = async () => {
    const name = design.name.trim();
    if (!name) { showToast('Rapor adı zorunlu.', 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        name,
        dataSource: design.dataSource,
        chartType: design.chartType,
        fields: design.fields,
        kpis: design.kpis,
        filters: { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined },
      };
      if (activeDesignId && activeDesign) {
        const res = await api.updateReportDesign(activeDesignId, payload);
        if (res.success && res.reportDesign) {
          setDesigns(prev => prev.map(d => (d.id === activeDesignId ? res.reportDesign : d)));
          setDesign(prev => ({ ...prev, ...res.reportDesign }));
          showToast('Rapor tasarımı güncellendi.', 'success');
        } else {
          showToast(res.error || 'Rapor güncellenemedi.', 'error');
        }
      } else {
        const res = await api.createReportDesign(payload);
        if (res.success && res.reportDesign) {
          const rec = res.reportDesign;
          setDesigns(prev => [...prev, rec]);
          setActiveDesignId(rec.id);
          setDesign(prev => ({ ...prev, ...rec }));
          setDirty(false);
          showToast('Rapor tasarımı kaydedildi.', 'success');
        } else {
          // Backend yok → localStorage fallback
          const local: ReportDesign = { ...design, ...payload, id: 'local-' + Date.now() };
          const list = readLocalDesigns();
          list.push(local);
          writeLocalDesigns(list);
          setDesigns(prev => [...prev, local]);
          setActiveDesignId(local.id);
          showToast('Rapor yerel olarak kaydedildi (sunucuya ulaşılamadı).', 'warning');
        }
      }
      setDirty(false);
    } catch {
      showToast('Rapor kaydedilirken hata oluştu.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Sil
  const handleDelete = async () => {
    if (!activeDesignId || !activeDesign) return;
    try {
      if (!activeDesignId.startsWith('local-')) {
        const res = await api.deleteReportDesign(activeDesignId);
        if (!res.success) { showToast(res.error || 'Silinemedi.', 'error'); return; }
      }
      const rest = designs.filter(d => d.id !== activeDesignId);
      setDesigns(rest);
      if (!activeDesignId.startsWith('local-')) writeLocalDesigns(readLocalDesigns().filter(d => d.id !== activeDesignId));
      setActiveDesignId(null);
      setDesign(prev => ({ ...prev, name: NEW_REPORT_DESIGN.name }));
      setDirty(true);
      showToast('Rapor tasarımı silindi.', 'success');
    } catch {
      showToast('Rapor silinirken hata oluştu.', 'error');
    }
  };

  // ── Kayıtlı tasarımı aç
  const openDesign = (d: ReportDesign) => {
    setActiveDesignId(d.id);
    setDesign({ ...d, fields: [...(d.fields || [])], kpis: [...(d.kpis || [])] });
    setDirty(false);
    if (d.filters?.dateFrom) setDateFrom(d.filters.dateFrom);
    if (d.filters?.dateTo) setDateTo(d.filters.dateTo);
  };

  // ── Yeni tasarım
  const newDesign = () => {
    setActiveDesignId(null);
    setDesign({
      id: 'draft',
      name: NEW_REPORT_DESIGN.name,
      dataSource: NEW_REPORT_DESIGN.dataSource,
      chartType: NEW_REPORT_DESIGN.chartType,
      fields: [...NEW_REPORT_DESIGN.fields],
      kpis: [...(NEW_REPORT_DESIGN.kpis || [])],
    });
    setDirty(true);
  };

  // ── Excel (CSV) çıktısı
  const handleExport = () => {
    const headers: string[] = tableFields.map(f => FIELD_COLUMN_LABELS[f]).concat([AMOUNT_LABEL[design.dataSource]]);
    const body: (string | number)[][] = filteredRows.map(r => {
      const cells: (string | number)[] = tableFields.map(f => {
        if (f === 'date') return fmtDate(r.date);
        if (f === 'vat') return r.vat != null ? `%${r.vat}` : '-';
        return String(r[f] ?? '-');
      });
      cells.push(Math.round((Number(r.amount) || 0) * 100) / 100);
      return cells;
    });
    exportRowsToCsv(`${design.name.replace(/[^\p{L}\p{N}]+/gu, '_')}_${new Date().toISOString().slice(0, 10)}.csv`, headers, body);
    showToast('Excel (CSV) dosyası indirildi.', 'success');
  };

  // ── Yazdırma (PrintModal REPORT tipi — payload.rows: {kolon: değer})
  const handlePrint = () => {
    const printRows = filteredRows.slice(0, 200).map(r => {
      const obj: Record<string, string | number> = {};
      for (const f of tableFields) {
        const label = FIELD_COLUMN_LABELS[f];
        if (f === 'date') obj[label] = fmtDate(r.date);
        else if (f === 'vat') obj[label] = r.vat != null ? `%${r.vat}` : '-';
        else obj[label] = String(r[f] ?? '-');
      }
      obj[AMOUNT_LABEL[design.dataSource]] = Math.round((Number(r.amount) || 0) * 100) / 100;
      return obj;
    });
    openPrintModal('REPORT', `Rapor: ${design.name}`, { rows: printRows });
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="view-content-container" style={{ padding: '18px 22px', overflowY: 'auto', height: '100%' }}>
      {/* Üst çubuk */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* 2026-09-13 (tasarım sadeleştirmesi): dekoratif gradyan yerine düz marka
              token'ı. İkon beyaz olduğu için --primary-light değil --primary kullanıldı
              (açık zemin üzerinde beyaz ikon görünmez olurdu). */}
          <div style={{ padding: '8px', background: 'var(--primary)', borderRadius: '8px', display: 'flex' }}>
            <Gauge size={20} color="#fff" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Rapor Tasarım Merkezi</h2>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Dashboard tarzı KPI raporları tasarlayın, kaydedin, paylaşın
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <input
            type="date"
            value={dateFrom}
            onChange={e => { setDirty(true); setDateFrom(e.target.value); }}
            className="form-control"
            style={{ width: '150px', fontSize: '12px', padding: '6px 8px' }}
            title="Başlangıç tarihi"
          />
          <input
            type="date"
            value={dateTo}
            onChange={e => { setDirty(true); setDateTo(e.target.value); }}
            className="form-control"
            style={{ width: '150px', fontSize: '12px', padding: '6px 8px' }}
            title="Bitiş tarihi"
          />
          <button className="btn btn-secondary btn-sm" onClick={() => runReport(design)} disabled={running}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {running ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            <span>Yenile</span>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleExport} disabled={filteredRows.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileSpreadsheet size={14} />
            <span>Excel</span>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handlePrint} disabled={filteredRows.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Printer size={14} />
            <span>Yazdır</span>
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            <span>{activeDesignId ? 'Güncelle' : 'Kaydet'}</span>
          </button>
        </div>
      </div>

      {warnings.map((w, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', marginBottom: '10px',
          background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', fontSize: '12px', color: '#92400e',
        }}>
          <AlertCircle size={14} />
          <span>{w}</span>
        </div>
      ))}

      {/* 3 kolonlu gövde */}
      <div className="report-designer-grid" style={{ display: 'grid', gridTemplateColumns: '240px 1fr 300px', gap: '14px', alignItems: 'start' }}>
        {/* SOL: Kayıtlı raporlar */}
        <div style={{ background: 'var(--bg-secondary, #fff)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            {/* 2026-09-13 (tasarım sadeleştirmesi): textTransform: uppercase kaldırıldı (tüm-büyük harf yasak). */}
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.4px' }}>
              Kayıtlı Raporlar
            </div>
            <button onClick={newDesign} title="Yeni rapor"
              style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
              <Plus size={13} />
              Yeni
            </button>
          </div>
          {designs.length === 0 && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '12px 4px', textAlign: 'center' }}>
              Henüz kayıtlı rapor yok.<br />Sağdaki panelden tasarlayıp kaydedin.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {designs.map(d => (
              <div key={d.id}
                onClick={() => openDesign(d)}
                style={{
                  padding: '8px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px',
                  border: activeDesignId === d.id ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                  background: activeDesignId === d.id ? 'var(--primary-light, #eff6ff)' : 'transparent',
                  fontWeight: activeDesignId === d.id ? 600 : 400,
                }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                  {activeDesignId === d.id && (
                    <button onClick={e => { e.stopPropagation(); handleDelete(); }} title="Sil"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#dc2626', display: 'flex', padding: '2px' }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {DATA_SOURCE_LABELS[d.dataSource as ReportDataSource] || d.dataSource} · {CHART_LABELS[d.chartType as ReportChartType] || d.chartType}
                </div>
              </div>
            ))}
          </div>
          {dirty && (
            <div style={{ marginTop: '10px', fontSize: '11px', color: '#d97706', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <AlertCircle size={12} />
              Kaydedilmemiş değişiklikler var
            </div>
          )}
        </div>
        {/* ORTA: Canlı önizleme */}
        <div style={{ background: 'var(--bg-secondary, #fff)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '14px', minHeight: '480px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            {/* 2026-09-13 (tasarım sadeleştirmesi): textTransform: uppercase kaldırıldı (tüm-büyük harf yasak). */}
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.4px' }}>
              Canlı Önizleme
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {filteredRows.length} satır · {DATA_SOURCE_LABELS[design.dataSource]}
            </div>
          </div>

          {/* KPI kartları */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px', marginBottom: '14px' }}>
            {(design.kpis || []).includes('revenue') && (
              // 2026-09-13 (tasarım sadeleştirmesi): dekoratif gradyan yerine düz birincil
              // token (--primary) — KPI kartı vurgu rengi sadeleşti.
              <div style={{ background: 'var(--primary)', color: '#fff', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '11px', opacity: 0.85 }}>{KPI_LABELS.revenue}</div>
                <div style={{ fontSize: '17px', fontWeight: 700, marginTop: '4px' }}>{fmtTL(kpis.revenue)}</div>
              </div>
            )}
            {(design.kpis || []).includes('count') && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '11px', color: '#166534' }}>{KPI_LABELS.count}</div>
                <div style={{ fontSize: '17px', fontWeight: 700, color: '#15803d', marginTop: '4px' }}>{fmtNum(kpis.count)}</div>
              </div>
            )}
            {(design.kpis || []).includes('avg') && (
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '11px', color: '#1e40af' }}>{KPI_LABELS.avg}</div>
                <div style={{ fontSize: '17px', fontWeight: 700, color: '#1d4ed8', marginTop: '4px' }}>{fmtTL(kpis.avg)}</div>
              </div>
            )}
            {(design.kpis || []).includes('growth') && (
              <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '11px', color: '#6b21a8' }}>{KPI_LABELS.growth}</div>
                <div style={{ fontSize: '17px', fontWeight: 700, color: kpis.growth == null ? '#a78bfa' : kpis.growth >= 0 ? '#16a34a' : '#dc2626', marginTop: '4px' }}>
                  {kpis.growth == null ? '—' : `${kpis.growth >= 0 ? '+' : ''}${kpis.growth}%`}
                </div>
              </div>
            )}
            {(design.kpis || []).includes('receivable') && (
              <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '11px', color: '#9f1239' }}>{KPI_LABELS.receivable}</div>
                <div style={{ fontSize: '17px', fontWeight: 700, color: '#e11d48', marginTop: '4px' }}>{fmtTL(kpis.receivable)}</div>
              </div>
            )}
            {(design.kpis || []).includes('payable') && (
              <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '11px', color: '#854d0e' }}>{KPI_LABELS.payable}</div>
                <div style={{ fontSize: '17px', fontWeight: 700, color: '#d97706', marginTop: '4px' }}>{fmtTL(kpis.payable)}</div>
              </div>
            )}
          </div>

          {/* Grafik */}
          {design.chartType !== 'TABLE' && chartData && chartData.labels.length > 0 && (
            <div style={{ height: '260px', marginBottom: '14px' }}>
              {design.chartType === 'BAR' && (
                <Bar
                  data={{
                    labels: chartData.labels,
                    datasets: [{
                      label: AMOUNT_LABEL[design.dataSource],
                      data: chartData.values,
                      backgroundColor: chartData.labels.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length] + 'cc'),
                      borderRadius: 6,
                    }],
                  }}
                  options={{
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true } },
                  }}
                />
              )}
              {design.chartType === 'LINE' && (
                <Line
                  data={{
                    labels: chartData.labels,
                    datasets: [{
                      label: AMOUNT_LABEL[design.dataSource],
                      data: chartData.values,
                      borderColor: CHART_PALETTE[0],
                      backgroundColor: CHART_PALETTE[0] + '22',
                      fill: true, tension: 0.35,
                      pointBackgroundColor: CHART_PALETTE[0],
                    }],
                  }}
                  options={{
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true } },
                  }}
                />
              )}
              {design.chartType === 'DOUGHNUT' && (
                <Doughnut
                  data={{
                    labels: chartData.labels,
                    datasets: [{
                      data: chartData.values,
                      backgroundColor: chartData.labels.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]),
                      borderWidth: 2, borderColor: '#fff',
                    }],
                  }}
                  options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }}
                />
              )}
            </div>
          )}

          {/* Tablo */}
          <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-tertiary, #f8fafc)', borderBottom: '2px solid var(--border-color)' }}>
                  {/* 2026-09-13 (tasarım sadeleştirmesi): textTransform: uppercase kaldırıldı (tüm-büyük harf yasak). */}
                  {tableFields.map(f => (
                    <th key={f} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {FIELD_COLUMN_LABELS[f]}
                    </th>
                  ))}
                  {/* 2026-09-13 (tasarım sadeleştirmesi): textTransform: uppercase kaldırıldı (tüm-büyük harf yasak). */}
                  <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {AMOUNT_LABEL[design.dataSource]}
                  </th>
                </tr>
              </thead>
              <tbody>
                {running ? (
                  <tr><td colSpan={tableFields.length + 1} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Loader2 size={16} className="animate-spin" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '6px' }} />
                    Veri yükleniyor...
                  </td></tr>
                ) : filteredRows.length === 0 ? (
                  <tr><td colSpan={tableFields.length + 1} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Seçili kriterlere uyan kayıt bulunamadı. Tarih aralığını veya veri kaynağını değiştirin.
                  </td></tr>
                ) : (
                  filteredRows.slice(0, 50).map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      {tableFields.map(f => (
                        <td key={f} style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                          {f === 'date' ? fmtDate(r.date) : f === 'vat' ? (r.vat != null ? `%${r.vat}` : '-') : String(r[f] ?? '-')}
                        </td>
                      ))}
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {fmtTL(Number(r.amount) || 0)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {filteredRows.length > 50 && (
            <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
              İlk 50 satır gösteriliyor — tam liste için Excel/Yazdır kullanın.
            </div>
          )}
        </div>
        {/* SAĞ: Özellik paneli */}
        <div style={{ background: 'var(--bg-secondary, #fff)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* 2026-09-13 (tasarım sadeleştirmesi): textTransform: uppercase kaldırıldı (tüm-büyük harf yasak). */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.4px' }}>
            <SlidersHorizontal size={13} />
            Tasarım Ayarları
          </div>

          {/* Rapor adı */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-muted)' }}>Rapor Adı</label>
            <input
              value={design.name}
              onChange={e => patchDesign({ name: e.target.value })}
              className="form-control"
              style={{ width: '100%', fontSize: '12px', padding: '7px 9px' }}
              placeholder="örn. Aylık Satış Performansı"
            />
          </div>

          {/* Veri kaynağı */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-muted)' }}>
              <Database size={12} /> Veri Kaynağı
            </label>
            <select
              value={design.dataSource}
              onChange={e => patchDesign({ dataSource: e.target.value as ReportDataSource })}
              className="form-control"
              style={{ width: '100%', fontSize: '12px', padding: '7px 9px' }}
            >
              {(Object.keys(DATA_SOURCE_LABELS) as ReportDataSource[]).map(s => (
                <option key={s} value={s}>{DATA_SOURCE_LABELS[s]}</option>
              ))}
            </select>
          </div>

          {/* Grafik tipi */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: 600, marginBottom: '4px', display: 'block', color: 'var(--text-muted)' }}>Grafik Tipi</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {(Object.keys(CHART_LABELS) as ReportChartType[]).map(ct => (
                <button key={ct} onClick={() => patchDesign({ chartType: ct })}
                  style={{
                    padding: '7px 6px', borderRadius: '8px', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                    border: design.chartType === ct ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                    background: design.chartType === ct ? 'var(--primary-light, #eff6ff)' : 'transparent',
                    color: design.chartType === ct ? 'var(--primary)' : 'var(--text-color, #374151)',
                  }}>
                  {CHART_LABELS[ct]}
                </button>
              ))}
            </div>
          </div>

          {/* Alan seçici */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-muted)' }}>
              Alanlar ({design.fields.length})
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {REPORT_FIELDS.map(f => {
                const selected = design.fields.includes(f.id);
                const hasData = fieldHasData(f.id, design.dataSource);
                return (
                  <button key={f.id} onClick={() => toggleField(f.id)}
                    title={hasData ? undefined : 'Bu veri kaynağında bu alan genellikle boş gelir'}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px',
                      padding: '6px 9px', borderRadius: '7px', cursor: 'pointer', fontSize: '12px', textAlign: 'left',
                      border: selected ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                      background: selected ? 'var(--primary-light, #eff6ff)' : 'transparent',
                      opacity: hasData || selected ? 1 : 0.55,
                    }}>
                    <span style={{ fontWeight: selected ? 600 : 400 }}>{f.label}</span>
                    <span style={{
                      width: '14px', height: '14px', borderRadius: '4px', flexShrink: 0,
                      border: selected ? 'none' : '1px solid var(--border-color)',
                      background: selected ? 'var(--primary)' : 'transparent',
                      color: '#fff', fontSize: '10px', lineHeight: '14px', textAlign: 'center',
                    }}>{selected ? '✓' : ''}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* KPI seçici */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-muted)' }}>
              KPI Kartları
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              {(Object.keys(KPI_LABELS) as ReportKpiId[]).map(k => {
                const selected = (design.kpis || []).includes(k);
                const kpiDisabled = (k === 'receivable' || k === 'payable') && design.dataSource !== 'CUSTOMER';
                return (
                  <button key={k} onClick={() => !kpiDisabled && toggleKpi(k)} disabled={kpiDisabled}
                    title={kpiDisabled ? 'Yalnız Cari Hesaplar kaynağında anlamlı' : undefined}
                    style={{
                      padding: '5px 10px', borderRadius: '999px', cursor: kpiDisabled ? 'not-allowed' : 'pointer',
                      fontSize: '11px', fontWeight: 600,
                      border: selected ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                      background: selected ? 'var(--primary)' : 'transparent',
                      color: selected ? '#fff' : 'var(--text-color, #374151)',
                      opacity: kpiDisabled ? 0.45 : 1,
                    }}>
                    {KPI_LABELS[k]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
