/**
 * İŞBEY CLOUD — DETAY RAPORLARI (2026-10-17)
 * ===========================================
 * Üç sekme: CARİ EKSTRE · STOK / VARYANT · KASA-BANKA HAREKET DÖKÜMÜ.
 * Veri `/api/v1/reports/detail/*` uçlarından gelir (tenant izole, salt-okunur).
 *
 * TUTAR GÜVENİ: Bu ekran hiçbir bakiye/kâr/KDV HESAPLAMAZ. Gösterilen her
 * tutar sunucudan geldiği gibidir. Sunucunun ürettiği tutarlılık bayrakları
 * (`balanceMatchesLedger`, `stockMatchesVariants`, `balanceMatchesMovements`)
 * ekranda AÇIKÇA gösterilir — uyuşmazlık varsa kullanıcı bunu görür, saklanmaz.
 *
 * FİLTRE: Geçersiz filtre istemcide anında yakalanır; sunucu 400 dönerse
 * mesaj ekranda gösterilir ve ÖNCEKİ sonuç KORUNUR (boş ekrana düşülmez).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Users, Package, Wallet, RefreshCw, AlertTriangle, CheckCircle2,
  ChevronRight, ChevronDown, Printer,
} from 'lucide-react';
import { DataGrid } from '../../common/DataGrid';
import type { Column } from '../../common/DataGrid';
import { api } from '../../../services/api';
import { useApp } from '../../../context/AppContext';
import { ReportFilterBar } from './ReportFilterBar';
import type { ReportScope } from './ReportFilterBar';
import {
  EMPTY_FILTER_OPTIONS, EMPTY_REPORT_FILTERS, toQueryParams,
} from './reportFilterTypes';
import type { ReportFilterOptions, ReportFilterState } from './reportFilterTypes';

type Tab = 'CARI' | 'STOK' | 'KASA_BANKA';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'CARI', label: 'Cari Ekstre ve Vade', icon: <Users size={15} /> },
  { id: 'STOK', label: 'Stok / Varyant Değerleme', icon: <Package size={15} /> },
  { id: 'KASA_BANKA', label: 'Kasa-Banka Hareket Dökümü', icon: <Wallet size={15} /> },
];

const fmtTL = (n: unknown) => (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
const fmtNum = (n: unknown) => (Number(n) || 0).toLocaleString('tr-TR');
const fmtDate = (d?: string) => (d ? d.slice(0, 10).split('-').reverse().join('.') : '-');

/** Tutarlılık rozeti: sunucunun bildirdiği bayrağı GÖRÜNÜR kılar. */
const ConsistencyBadge: React.FC<{ ok: boolean; okText: string; failText: string }> = ({ ok, okText, failText }) => (
  <span
    className={`badge ${ok ? 'badge-success' : 'badge-danger'}`}
    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
  >
    {ok ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
    {ok ? okText : failText}
  </span>
);

export const ReportDetailView: React.FC = () => {
  // 2026-10-17: firma değişiminde eski firmanın raporunda takılı kalmamak için
  // `activeTenantId` + `refreshKey` dinlenir (ReportsView / diğer ekranlardaki desen).
  const { refreshKey, activeTenantId, openPrintModal } = useApp();

  const [tab, setTab] = useState<Tab>('CARI');
  const [filters, setFilters] = useState<ReportFilterState>({ ...EMPTY_REPORT_FILTERS });
  const [applied, setApplied] = useState<Record<string, unknown>>({});
  const [options, setOptions] = useState<ReportFilterOptions>(EMPTY_FILTER_OPTIONS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cariData, setCariData] = useState<any>(null);
  const [stockData, setStockData] = useState<any>(null);
  const [kbData, setKbData] = useState<any>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Filtre seçenekleri: yalnız KENDİ firmasının kayıtları gelir (sunucu süzer).
  useEffect(() => {
    let cancelled = false;
    api.getReportFilterOptions()
      .then(res => { if (!cancelled && res.success) setOptions(res as unknown as ReportFilterOptions); })
      .catch(() => { /* seçenekler boş kalır; ekran yine çalışır */ });
    return () => { cancelled = true; };
  }, [activeTenantId, refreshKey]);

  const load = useCallback(async (params: Record<string, unknown>, which: Tab) => {
    setLoading(true);
    setError(null);
    try {
      if (which === 'CARI') {
        const res = await api.getCustomerDetailReport(params);
        if (res.success) setCariData(res);
      } else if (which === 'STOK') {
        const res = await api.getStockDetailReport(params);
        if (res.success) setStockData(res);
      } else {
        const res = await api.getCashBankDetailReport(params);
        if (res.success) setKbData(res);
      }
    } catch (err) {
      // 400 (geçersiz filtre) buraya düşer. ÖNCEKİ sonuç KORUNUR; kullanıcı
      // "veri yok" ekranı yerine GERÇEK nedeni görür (sunucudan gelen mesaj).
      const message = err instanceof Error ? err.message : 'Rapor yüklenemedi.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Sekme / firma değişince mevcut filtrelerle yeniden yükle
  useEffect(() => {
    load(applied, tab);
  }, [tab, applied, activeTenantId, refreshKey, load]);

  const handleApply = () => {
    setApplied(toQueryParams(filters));
  };

  const handleReset = () => {
    setFilters({ ...EMPTY_REPORT_FILTERS });
    setApplied({});
  };

  // ─── CARİ KOLONLARI ───
  const cariColumns: Column<any>[] = [
    {
      key: 'code', title: 'Kod', width: '110px',
      render: r => <span style={{ fontFamily: 'monospace' }}>{r.code}</span>,
    },
    { key: 'title', title: 'Cari Ünvan', render: r => <span style={{ fontWeight: 600 }}>{r.title}</span> },
    { key: 'taxNumber', title: 'VKN/TCKN', width: '120px' },
    {
      key: 'balance', title: 'Bakiye', numeric: true,
      render: r => (
        <span style={{ fontWeight: 700, color: r.balance > 0 ? '#ef4444' : r.balance < 0 ? '#10b981' : 'var(--text-muted)' }}>
          {fmtTL(r.balance)}
        </span>
      ),
    },
    { key: 'ledgerTotal', title: 'Defter Toplamı', numeric: true, render: r => fmtTL(r.ledgerTotal) },
    {
      key: 'balanceMatchesLedger', title: 'Defter = Bakiye', width: '140px',
      render: r => <ConsistencyBadge ok={r.balanceMatchesLedger} okText="Uyumlu" failText="UYUŞMAZLIK" />,
    },
    {
      key: 'overdueTotal', title: 'Vadesi Geçen', numeric: true,
      render: r => <span style={{ color: r.overdueTotal > 0 ? '#ef4444' : 'var(--text-muted)' }}>{fmtTL(r.overdueTotal)}</span>,
    },
    {
      key: '_detail', title: 'Ekstre', width: '90px',
      render: r => (
        <button
          type="button" className="btn btn-secondary btn-sm"
          onClick={() => setExpanded(e => (e === r.id ? null : r.id))}
        >
          {expanded === r.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span>{(r.ledger?.length || 0) + (r.overdue?.length || 0)}</span>
        </button>
      ),
    },
  ];

  // ─── STOK KOLONLARI ───
  const stockColumns: Column<any>[] = [
    { key: 'code', title: 'Stok Kod', width: '110px', render: r => <span style={{ fontFamily: 'monospace' }}>{r.code}</span> },
    { key: 'name', title: 'Ürün Adı', render: r => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    { key: 'warehouseName', title: 'Depo', width: '130px' },
    { key: 'currentStock', title: 'Stok', numeric: true, width: '90px', render: r => `${fmtNum(r.currentStock)} ${r.unit || ''}`.trim() },
    {
      key: 'variantStockSum', title: 'Varyant Toplamı', numeric: true, width: '120px',
      render: r => (r.hasVariants ? fmtNum(r.variantStockSum) : <span style={{ color: 'var(--text-muted)' }}>—</span>),
    },
    {
      key: 'stockMatchesVariants', title: 'Varyant = Stok', width: '130px',
      render: r => (r.hasVariants
        ? <ConsistencyBadge ok={r.stockMatchesVariants} okText="Uyumlu" failText="UYUŞMAZLIK" />
        : <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>varyantsız</span>),
    },
    { key: 'costValue', title: 'Maliyet Değeri', numeric: true, render: r => fmtTL(r.costValue) },
    { key: 'saleValue', title: 'Satış Değeri', numeric: true, render: r => fmtTL(r.saleValue) },
    { key: 'potentialProfit', title: 'Potansiyel Kâr', numeric: true, render: r => <span style={{ color: r.potentialProfit >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>{fmtTL(r.potentialProfit)}</span> },
    {
      key: 'isCritical', title: 'Durum', width: '110px',
      render: r => (r.isCritical
        ? <span className="badge badge-danger" style={{ fontSize: '11px' }}>KRİTİK</span>
        : <span className="badge badge-success" style={{ fontSize: '11px' }}>Yeterli</span>),
    },
    {
      key: '_detail', title: 'Varyantlar', width: '110px',
      render: r => (r.hasVariants ? (
        <button
          type="button" className="btn btn-secondary btn-sm"
          onClick={() => setExpanded(e => (e === r.id ? null : r.id))}
        >
          {expanded === r.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span>{r.variants.length}</span>
        </button>
      ) : <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>—</span>),
    },
  ];

  // ─── KASA/BANKA HESAP KOLONLARI ───
  const accountColumns: Column<any>[] = [
    { key: 'name', title: 'Hesap', render: r => <span style={{ fontWeight: 600 }}>{r.bankName ? `${r.bankName} — ${r.name}` : r.name}</span> },
    {
      key: 'kindLabel', title: 'Tür', width: '90px',
      render: (r: any) => <span className="badge badge-info" style={{ fontSize: '11px' }}>{r._kind === 'CASH' ? 'Kasa' : 'Banka'}</span>,
    },
    { key: 'openingBalance', title: 'Açılış', numeric: true, render: r => fmtTL(r.openingBalance) },
    { key: 'inTotal', title: 'Giriş', numeric: true, render: r => <span style={{ color: '#10b981' }}>{fmtTL(r.inTotal)}</span> },
    { key: 'outTotal', title: 'Çıkış', numeric: true, render: r => <span style={{ color: '#ef4444' }}>{fmtTL(r.outTotal)}</span> },
    { key: 'expectedBalance', title: 'Beklenen Bakiye', numeric: true, render: r => fmtTL(r.expectedBalance) },
    { key: 'balance', title: 'Kayıtlı Bakiye', numeric: true, render: r => <span style={{ fontWeight: 700 }}>{fmtTL(r.balance)}</span> },
    {
      key: 'balanceMatchesMovements', title: 'Hareket = Bakiye', width: '150px',
      render: r => <ConsistencyBadge ok={r.balanceMatchesMovements} okText="Uyumlu" failText="UYUŞMAZLIK" />,
    },
  ];

  const txColumns: Column<any>[] = [
    { key: 'date', title: 'Tarih', width: '100px', render: r => fmtDate(r.date) },
    { key: 'documentNo', title: 'Belge No', width: '130px' },
    {
      key: 'kind', title: 'Kaynak', width: '90px',
      render: r => <span className="badge badge-info" style={{ fontSize: '11px' }}>{r.kind === 'CASH' ? 'Kasa' : 'Banka'}</span>,
    },
    { key: 'accountName', title: 'Hesap', width: '150px' },
    { key: 'type', title: 'İşlem Tipi', width: '130px' },
    {
      key: 'direction', title: 'Yön', width: '90px',
      render: r => (r.direction === 'IN'
        ? <span style={{ color: '#10b981', fontWeight: 600 }}>Giriş</span>
        : r.direction === 'OUT'
          ? <span style={{ color: '#ef4444', fontWeight: 600 }}>Çıkış</span>
          : <span style={{ color: 'var(--text-muted)' }}>Belirsiz</span>),
    },
    { key: 'amount', title: 'Tutar', numeric: true, render: r => fmtTL(r.amount) },
    { key: 'customerTitle', title: 'Cari', width: '150px', render: r => r.customerTitle || '-' },
  ];

  const activeData = tab === 'CARI' ? cariData : tab === 'STOK' ? stockData : kbData;

  const handlePrint = () => {
    if (tab === 'CARI' && cariData) {
      openPrintModal('REPORT', 'Cari Ekstre ve Vade Raporu', {
        rows: cariData.rows.map((r: any) => ({
          Kod: r.code, Ünvan: r.title, Bakiye: r.balance, 'Defter Toplamı': r.ledgerTotal,
          'Vadesi Geçen': r.overdueTotal,
        })),
      });
    } else if (tab === 'STOK' && stockData) {
      openPrintModal('REPORT', 'Stok / Varyant Değerleme Raporu', {
        rows: stockData.rows.map((r: any) => ({
          Kod: r.code, Ürün: r.name, Depo: r.warehouseName, Stok: r.currentStock,
          'Varyant Toplamı': r.variantStockSum, 'Maliyet Değeri': r.costValue,
          'Satış Değeri': r.saleValue, 'Potansiyel Kâr': r.potentialProfit,
        })),
      });
    } else if (kbData) {
      openPrintModal('REPORT', 'Kasa-Banka Hareket Dökümü', {
        rows: kbData.transactions.map((t: any) => ({
          Tarih: fmtDate(t.date), 'Belge No': t.documentNo, Kaynak: t.kind === 'CASH' ? 'Kasa' : 'Banka',
          Hesap: t.accountName, 'İşlem Tipi': t.type, Yön: t.direction, Tutar: t.amount, Cari: t.customerTitle,
        })),
      });
    }
  };

  // Tutarlılık uyuşmazlığı sayısı — özet şeridinde uyarı olarak gösterilir.
  const mismatchCount = tab === 'CARI'
    ? (cariData?.rows || []).filter((r: any) => !r.balanceMatchesLedger).length
    : tab === 'STOK'
      ? (stockData?.rows || []).filter((r: any) => r.hasVariants && !r.stockMatchesVariants).length
      : (kbData?.totals?.mismatchCount || 0);

  return (
    <div className="view-content-container" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              className={`btn ${tab === t.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setTab(t.id); setExpanded(null); }}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => load(applied, tab)} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            <span>Yenile</span>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handlePrint} disabled={!activeData}>
            <Printer size={13} />
            <span>Yazdır / PDF</span>
          </button>
        </div>
      </div>

      <ReportFilterBar
        scope={tab as ReportScope}
        filters={filters}
        onChange={setFilters}
        options={options}
        onApply={handleApply}
        onReset={handleReset}
        loading={loading}
      />

      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px',
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#b91c1c', fontSize: '13px',
        }}>
          <AlertTriangle size={15} />
          <span>{error}</span>
          <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#7f1d1d' }}>
            (Önceki sonuç korunuyor — filtreyi düzeltip tekrar deneyin.)
          </span>
        </div>
      )}

      {mismatchCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
          background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', color: '#92400e', fontSize: '12px',
        }}>
          <AlertTriangle size={14} />
          <span>
            {mismatchCount} kayıtta tutar tutarsızlığı var. Bu ekran tutarları YENİDEN HESAPLAMAZ;
            uyuşmazlık ilgili satırda işaretlenmiştir.
          </span>
        </div>
      )}

      {/* Özet şeridi */}
      {tab === 'CARI' && cariData && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px' }}>
          <div className="kpi-card" style={{ borderLeft: '4px solid #0066cc' }}>
            <div className="kpi-title">Cari Sayısı</div>
            <div className="kpi-value">{fmtNum(cariData.totals.customerCount)}</div>
          </div>
          <div className="kpi-card" style={{ borderLeft: '4px solid #ef4444' }}>
            <div className="kpi-title">Toplam Bakiye</div>
            <div className="kpi-value" style={{ color: '#ef4444' }}>{fmtTL(cariData.totals.balance)}</div>
          </div>
          <div className="kpi-card" style={{ borderLeft: '4px solid #f59e0b' }}>
            <div className="kpi-title">Vadesi Geçen Toplam</div>
            <div className="kpi-value" style={{ color: '#f59e0b' }}>{fmtTL(cariData.totals.overdueTotal)}</div>
          </div>
        </div>
      )}

      {tab === 'STOK' && stockData && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px' }}>
          <div className="kpi-card" style={{ borderLeft: '4px solid #0066cc' }}>
            <div className="kpi-title">Ürün Sayısı</div>
            <div className="kpi-value">{fmtNum(stockData.totals.productCount)}</div>
          </div>
          <div className="kpi-card" style={{ borderLeft: '4px solid #64748b' }}>
            <div className="kpi-title">Maliyet Değeri</div>
            <div className="kpi-value">{fmtTL(stockData.totals.costValue)}</div>
          </div>
          <div className="kpi-card" style={{ borderLeft: '4px solid var(--primary)' }}>
            <div className="kpi-title">Satış Değeri</div>
            <div className="kpi-value" style={{ color: 'var(--primary)' }}>{fmtTL(stockData.totals.saleValue)}</div>
          </div>
          <div className="kpi-card" style={{ borderLeft: '4px solid #10b981' }}>
            <div className="kpi-title">Potansiyel Kâr</div>
            <div className="kpi-value" style={{ color: '#10b981' }}>{fmtTL(stockData.totals.potentialProfit)}</div>
          </div>
          <div className="kpi-card" style={{ borderLeft: '4px solid #ef4444' }}>
            <div className="kpi-title">Kritik Seviye</div>
            <div className="kpi-value" style={{ color: '#ef4444' }}>{fmtNum(stockData.totals.criticalCount)}</div>
          </div>
        </div>
      )}

      {tab === 'KASA_BANKA' && kbData && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px' }}>
          <div className="kpi-card" style={{ borderLeft: '4px solid #0066cc' }}>
            <div className="kpi-title">Toplam Likidite</div>
            <div className="kpi-value" style={{ color: 'var(--primary)' }}>{fmtTL(kbData.totals.liquidity)}</div>
          </div>
          <div className="kpi-card" style={{ borderLeft: '4px solid #10b981' }}>
            <div className="kpi-title">Kasa Bakiyesi</div>
            <div className="kpi-value" style={{ color: '#10b981' }}>{fmtTL(kbData.totals.cashBalance)}</div>
          </div>
          <div className="kpi-card" style={{ borderLeft: '4px solid #0ea5e9' }}>
            <div className="kpi-title">Banka Bakiyesi</div>
            <div className="kpi-value" style={{ color: '#0ea5e9' }}>{fmtTL(kbData.totals.bankBalance)}</div>
          </div>
          <div className="kpi-card" style={{ borderLeft: '4px solid #64748b' }}>
            <div className="kpi-title">Hareket Sayısı</div>
            <div className="kpi-value">{fmtNum(kbData.totals.transactionCount)}</div>
          </div>
        </div>
      )}

      {/* Ana tablo */}
      {tab === 'CARI' && cariData && (
        <>
          <DataGrid
            columns={cariColumns} data={cariData.rows}
            searchPlaceholder="Cari kodu veya ünvanı ile ara..." showTotals
            totalColumns={['balance', 'ledgerTotal', 'overdueTotal']}
          />
          {expanded && (() => {
            const row = cariData.rows.find((r: any) => r.id === expanded);
            if (!row) return null;
            return (
              <div style={{ border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontWeight: 700, fontSize: '13px' }}>{row.code} — {row.title} · Ekstre Detayı</div>
                {row.ledger.length === 0 && (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Seçili aralıkta defter hareketi yok.</div>
                )}
                {row.ledger.length > 0 && (
                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                        <th style={{ padding: '5px' }}>Tarih</th>
                        <th style={{ padding: '5px' }}>Belge</th>
                        <th style={{ padding: '5px' }}>Tip</th>
                        <th style={{ padding: '5px' }}>Açıklama</th>
                        <th style={{ padding: '5px', textAlign: 'right' }}>Borç</th>
                        <th style={{ padding: '5px', textAlign: 'right' }}>Alacak</th>
                        <th style={{ padding: '5px', textAlign: 'right' }}>Bakiye</th>
                      </tr>
                    </thead>
                    <tbody>
                      {row.ledger.map((l: any) => (
                        <tr key={l.id} style={{ borderBottom: '1px solid var(--border-color, #f1f5f9)' }}>
                          <td style={{ padding: '5px' }}>{fmtDate(l.date)}</td>
                          <td style={{ padding: '5px' }}>{l.documentNo || '-'}</td>
                          <td style={{ padding: '5px' }}>{l.documentType || '-'}</td>
                          <td style={{ padding: '5px' }}>{l.description || '-'}</td>
                          <td style={{ padding: '5px', textAlign: 'right' }}>{l.debit ? fmtTL(l.debit) : '-'}</td>
                          <td style={{ padding: '5px', textAlign: 'right' }}>{l.credit ? fmtTL(l.credit) : '-'}</td>
                          <td style={{ padding: '5px', textAlign: 'right', fontWeight: 600 }}>{fmtTL(l.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {row.overdue.length > 0 && (
                  <>
                    <div style={{ fontWeight: 600, fontSize: '12px', marginTop: '4px' }}>Vadesi Geçen Belgeler</div>
                    <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                          <th style={{ padding: '5px' }}>Belge</th>
                          <th style={{ padding: '5px' }}>Tarih</th>
                          <th style={{ padding: '5px' }}>Vade</th>
                          <th style={{ padding: '5px', textAlign: 'right' }}>Tutar</th>
                          <th style={{ padding: '5px', textAlign: 'right' }}>Ödenen</th>
                          <th style={{ padding: '5px', textAlign: 'right' }}>Kalan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.overdue.map((o: any) => (
                          <tr key={o.id} style={{ borderBottom: '1px solid var(--border-color, #f1f5f9)' }}>
                            <td style={{ padding: '5px' }}>{o.documentNo}</td>
                            <td style={{ padding: '5px' }}>{fmtDate(o.date)}</td>
                            <td style={{ padding: '5px', color: '#ef4444' }}>{fmtDate(o.maturityDate)}</td>
                            <td style={{ padding: '5px', textAlign: 'right' }}>{fmtTL(o.grandTotal)}</td>
                            <td style={{ padding: '5px', textAlign: 'right' }}>{fmtTL(o.paidAmount)}</td>
                            <td style={{ padding: '5px', textAlign: 'right', fontWeight: 700, color: '#ef4444' }}>{fmtTL(o.remaining)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            );
          })()}
        </>
      )}

      {tab === 'STOK' && stockData && (
        <>
          <DataGrid
            columns={stockColumns} data={stockData.rows}
            searchPlaceholder="Ürün kodu veya adı ile ara..." showTotals
            totalColumns={['currentStock', 'costValue', 'saleValue', 'potentialProfit']}
          />
          {expanded && (() => {
            const row = stockData.rows.find((r: any) => r.id === expanded);
            if (!row || !row.hasVariants) return null;
            return (
              <div style={{ border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontWeight: 700, fontSize: '13px' }}>{row.code} — {row.name} · Varyant Kırılımı</div>
                <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                      <th style={{ padding: '5px' }}>Varyant</th>
                      <th style={{ padding: '5px' }}>Barkod</th>
                      <th style={{ padding: '5px' }}>Özellikler</th>
                      <th style={{ padding: '5px', textAlign: 'right' }}>Stok</th>
                      <th style={{ padding: '5px', textAlign: 'right' }}>Alış</th>
                      <th style={{ padding: '5px', textAlign: 'right' }}>Satış</th>
                      <th style={{ padding: '5px', textAlign: 'right' }}>Maliyet Değeri</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.variants.map((v: any) => (
                      <tr key={v.id} style={{ borderBottom: '1px solid var(--border-color, #f1f5f9)' }}>
                        <td style={{ padding: '5px', fontWeight: 600 }}>{v.name}</td>
                        <td style={{ padding: '5px' }}>{v.barcode || '-'}</td>
                        <td style={{ padding: '5px' }}>
                          {v.attributes && Object.keys(v.attributes).length > 0
                            ? Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(', ')
                            : '-'}
                        </td>
                        <td style={{ padding: '5px', textAlign: 'right' }}>{fmtNum(v.currentStock)}</td>
                        <td style={{ padding: '5px', textAlign: 'right' }}>{fmtTL(v.purchasePrice)}</td>
                        <td style={{ padding: '5px', textAlign: 'right' }}>{fmtTL(v.salePrice)}</td>
                        <td style={{ padding: '5px', textAlign: 'right', fontWeight: 600 }}>{fmtTL(v.costValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </>
      )}

      {tab === 'KASA_BANKA' && kbData && (
        <>
          <div style={{ fontWeight: 700, fontSize: '13px' }}>Hesap Özeti</div>
          <DataGrid
            columns={accountColumns}
            data={[
              ...kbData.cash.accounts.map((a: any) => ({ ...a, _kind: 'CASH' })),
              ...kbData.bank.accounts.map((a: any) => ({ ...a, _kind: 'BANK' })),
            ]}
            searchPlaceholder="Hesap adı ile ara..." showTotals
            totalColumns={['openingBalance', 'inTotal', 'outTotal', 'balance']}
          />
          <div style={{ fontWeight: 700, fontSize: '13px', marginTop: '4px' }}>Hareket Dökümü</div>
          <DataGrid
            columns={txColumns} data={kbData.transactions}
            searchPlaceholder="Belge no, hesap veya cari ile ara..." showTotals
            totalColumns={['amount']}
          />
        </>
      )}

      {!activeData && !loading && !error && (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
          Bu sekme için henüz veri yüklenmedi.
        </div>
      )}
    </div>
  );
};
