import React, { useState, useEffect } from 'react';
import { DataGrid } from '../../common/DataGrid';
import type { Column } from '../../common/DataGrid';

import { api } from '../../../services/api';
import { useApp } from '../../../context/AppContext';
import { BarChart3, TrendingUp, DollarSign, Package, Clock, Sliders, Download } from 'lucide-react';

export const ReportsView: React.FC = () => {
  const { openPrintModal } = useApp();

  const [activeTab, setActiveTab] = useState<'PROFIT_LOSS' | 'AGING' | 'STOCK_VALUATION'>('PROFIT_LOSS');
  const [costingMethod, setCostingMethod] = useState<'AVG_COST' | 'FIFO' | 'LAST_PRICE'>('AVG_COST');
  
  const [profitLossData, setProfitLossData] = useState<any>(null);
  const [agingData, setAgingData] = useState<any[]>([]);
  const [stockValuationData, setStockValuationData] = useState<{ report: any[]; totals: any } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReport();
  }, [activeTab, costingMethod]);

  const loadReport = async () => {
    setLoading(true);
    try {
      if (activeTab === 'PROFIT_LOSS') {
        const res = await api.getProfitLossReport({ costingMethod });
        if (res.success) setProfitLossData(res.data);
      } else if (activeTab === 'AGING') {
        const res = await api.getAgingReport();
        if (res.success) setAgingData(res.report);
      } else if (activeTab === 'STOCK_VALUATION') {
        const res = await api.getStockValuationReport();
        if (res.success) setStockValuationData({ report: res.report, totals: res.totals });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Profit Loss Product Columns
  const profitProductColumns: Column<any>[] = [
    { key: 'code', title: 'Stok Kodu', width: '100px' },
    { key: 'name', title: 'Ürün Adı', render: r => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    { key: 'quantitySold', title: 'Satılan Adet', numeric: true, width: '110px' },
    {
      key: 'revenue',
      title: 'Satış Geliri',
      numeric: true,
      render: r => <span>{r.revenue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>,
    },
    {
      key: 'totalCost',
      title: 'Maliyet',
      numeric: true,
      render: r => <span style={{ color: '#ef4444' }}>{r.totalCost.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>,
    },
    {
      key: 'grossProfit',
      title: 'Brüt Kâr',
      numeric: true,
      render: r => (
        <span style={{ fontWeight: 700, color: r.grossProfit >= 0 ? '#10b981' : '#ef4444' }}>
          {r.grossProfit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
        </span>
      ),
    },
    {
      key: 'marginPercent',
      title: 'Kâr Marjı %',
      numeric: true,
      width: '100px',
      render: r => <span className="badge badge-success">%{r.marginPercent}</span>,
    },
  ];

  // Aging Columns
  const agingColumns: Column<any>[] = [
    { key: 'code', title: 'Cari Kod', width: '100px' },
    { key: 'title', title: 'Cari Ünvan', render: r => <span style={{ fontWeight: 600 }}>{r.title}</span> },
    {
      key: 'totalBalance',
      title: 'Toplam Borç',
      numeric: true,
      render: r => <span style={{ fontWeight: 700, color: '#ef4444' }}>{r.totalBalance.toLocaleString('tr-TR')} ₺</span>,
    },
    {
      key: 'current',
      title: 'Vadesi Gelmemiş',
      numeric: true,
      render: r => <span>{r.current > 0 ? r.current.toLocaleString('tr-TR') + ' ₺' : '-'}</span>,
    },
    {
      key: 'days1To30',
      title: '1-30 Gün Gecikmiş',
      numeric: true,
      render: r => <span style={{ color: '#f59e0b', fontWeight: 600 }}>{r.days1To30 > 0 ? r.days1To30.toLocaleString('tr-TR') + ' ₺' : '-'}</span>,
    },
    {
      key: 'days31To60',
      title: '31-60 Gün Gecikmiş',
      numeric: true,
      render: r => <span style={{ color: '#ef4444', fontWeight: 600 }}>{r.days31To60 > 0 ? r.days31To60.toLocaleString('tr-TR') + ' ₺' : '-'}</span>,
    },
    {
      key: 'days90Plus',
      title: '90+ Gün Gecikmiş',
      numeric: true,
      render: r => <span style={{ color: '#b91c1c', fontWeight: 700 }}>{r.days90Plus > 0 ? r.days90Plus.toLocaleString('tr-TR') + ' ₺' : '-'}</span>,
    },
  ];

  // Stock Valuation Columns
  const stockValuationColumns: Column<any>[] = [
    { key: 'code', title: 'Stok Kod', width: '100px' },
    { key: 'name', title: 'Ürün Adı', render: r => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    { key: 'currentStock', title: 'Mevcut Stok', numeric: true, width: '100px', render: r => `${r.currentStock} ${r.unit}` },
    {
      key: 'totalCostValue',
      title: 'Maliyet Değeri',
      numeric: true,
      render: r => <span>{r.totalCostValue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>,
    },
    {
      key: 'totalSaleValue',
      title: 'Satış Değeri (Piyasa)',
      numeric: true,
      render: r => <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{r.totalSaleValue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>,
    },
    {
      key: 'potentialProfit',
      title: 'Potansiyel Brüt Kâr',
      numeric: true,
      render: r => <span style={{ fontWeight: 700, color: '#10b981' }}>{r.potentialProfit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>,
    },
  ];

  const handlePrintReport = () => {
    let title = 'Kâr / Zarar ve Maliyet Raporu';
    let rows: any[] = [];
    if (activeTab === 'PROFIT_LOSS' && profitLossData) {
      title = `Kâr ve Zarar Raporu (${costingMethod})`;
      rows = (profitLossData.productBreakdown || []).map((p: any) => ({
        'Kod': p.code,
        'Ürün': p.name,
        'Satılan Adet': p.quantitySold,
        'Hasılat': p.revenue,
        'Maliyet': p.totalCost,
        'Brüt Kâr': p.grossProfit,
        'Kâr Marjı': `%${p.marginPercent}`,
      }));
    } else if (activeTab === 'AGING') {
      title = 'Cari Yaşlandırma ve Vade Analizi Raporu';
      rows = agingData.map(a => ({
        'Cari Kod': a.code,
        'Ünvan': a.title,
        'Toplam Borç': a.totalBalance,
        'Vadesi Gelmemiş': a.current,
        '1-30 Gün': a.days1To30,
        '31-60 Gün': a.days31To60,
        '90+ Gün': a.days90Plus,
      }));
    } else if (activeTab === 'STOCK_VALUATION' && stockValuationData) {
      title = 'Stok Değerleme ve Envanter Raporu';
      rows = stockValuationData.report.map(s => ({
        'Stok Kod': s.code,
        'Ürün Adı': s.name,
        'Mevcut Stok': s.currentStock,
        'Maliyet Değeri': s.totalCostValue,
        'Satış Değeri': s.totalSaleValue,
        'Potansiyel Kâr': s.potentialProfit,
      }));
    }
    openPrintModal('REPORT', title, { rows });
  };

  return (
    <div className="view-content-container">
      {/* Rapor Türü Sekmeleri */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className={`btn ${activeTab === 'PROFIT_LOSS' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('PROFIT_LOSS')}
          >
            <BarChart3 size={15} />
            <span>Kâr / Zarar ve Maliyet Raporu</span>
          </button>
          <button
            className={`btn ${activeTab === 'AGING' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('AGING')}
          >
            <Clock size={15} />
            <span>Cari Yaşlandırma & Vade Raporu</span>
          </button>
          <button
            className={`btn ${activeTab === 'STOCK_VALUATION' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('STOCK_VALUATION')}
          >
            <Package size={15} />
            <span>Stok Değerleme & Envanter Kârı</span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {activeTab === 'PROFIT_LOSS' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Maliyet:</span>
              <select
                className="form-select"
                style={{ width: '180px', padding: '4px 8px', fontSize: '12px' }}
                value={costingMethod}
                onChange={e => setCostingMethod(e.target.value as any)}
              >
                <option value="AVG_COST">Ağırlıklı Ortalama</option>
                <option value="FIFO">FIFO (İlk Giren İlk Çıkar)</option>
                <option value="LAST_PRICE">Son Alış Fiyatı</option>
              </select>
            </div>
          )}

          <button className="btn btn-secondary btn-sm" onClick={handlePrintReport} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Download size={14} />
            <span>Yazdır / PDF İndir</span>
          </button>
        </div>
      </div>

      {/* 1. KÂR ZARAR GÖRÜNÜMÜ */}
      {activeTab === 'PROFIT_LOSS' && profitLossData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* KPI Kartları */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <div className="kpi-card" style={{ borderLeft: '4px solid #0066cc' }}>
              <div className="kpi-title">Toplam Satış Hasılatı</div>
              <div className="kpi-value" style={{ color: 'var(--primary)' }}>
                {profitLossData.totalSalesRevenue.toLocaleString('tr-TR')} ₺
              </div>
              <div className="kpi-subtext">Net Satışlar</div>
            </div>

            <div className="kpi-card" style={{ borderLeft: '4px solid #ef4444' }}>
              <div className="kpi-title">Satılan Malın Maliyeti (SMM)</div>
              <div className="kpi-value" style={{ color: '#ef4444' }}>
                {profitLossData.totalCostOfGoodsSold.toLocaleString('tr-TR')} ₺
              </div>
              <div className="kpi-subtext">Hesaplanan Stok Maliyeti</div>
            </div>

            <div className="kpi-card" style={{ borderLeft: '4px solid #10b981' }}>
              <div className="kpi-title">Brüt Ticari Kâr</div>
              <div className="kpi-value" style={{ color: '#10b981' }}>
                {profitLossData.grossProfit.toLocaleString('tr-TR')} ₺
              </div>
              <div className="kpi-subtext">Brüt Kâr Marjı: %{profitLossData.grossMargin}</div>
            </div>

            <div className="kpi-card" style={{ borderLeft: '4px solid #f59e0b' }}>
              <div className="kpi-title">Net Faaliyet Kârı</div>
              <div className="kpi-value" style={{ color: '#f59e0b' }}>
                {profitLossData.netProfit.toLocaleString('tr-TR')} ₺
              </div>
              <div className="kpi-subtext">Giderler Düşüldükten Sonra</div>
            </div>
          </div>

          <DataGrid
            columns={profitProductColumns}
            data={profitLossData.productBreakdown || []}
            searchPlaceholder="Ürün bazında kâr analizi ara..."
            showTotals={true}
            totalColumns={['quantitySold', 'revenue', 'totalCost', 'grossProfit']}
          />
        </div>
      )}

      {/* 2. CARİ YAŞLANDIRMA GÖRÜNÜMÜ */}
      {activeTab === 'AGING' && (
        <DataGrid
          columns={agingColumns}
          data={agingData}
          searchPlaceholder="Cari ünvan ile ara..."
          showTotals={true}
          totalColumns={['totalBalance', 'current', 'days1To30', 'days31To60', 'days90Plus']}
        />
      )}

      {/* 3. STOK DEĞERLEME GÖRÜNÜMÜ */}
      {activeTab === 'STOCK_VALUATION' && stockValuationData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <div className="kpi-card" style={{ borderLeft: '4px solid #64748b' }}>
              <div className="kpi-title">Toplam Depo Maliyet Değeri</div>
              <div className="kpi-value">
                {stockValuationData.totals.totalCostValue.toLocaleString('tr-TR')} ₺
              </div>
            </div>
            <div className="kpi-card" style={{ borderLeft: '4px solid var(--primary)' }}>
              <div className="kpi-title">Toplam Satış / Piyasa Değeri</div>
              <div className="kpi-value" style={{ color: 'var(--primary)' }}>
                {stockValuationData.totals.totalSaleValue.toLocaleString('tr-TR')} ₺
              </div>
            </div>
            <div className="kpi-card" style={{ borderLeft: '4px solid #10b981' }}>
              <div className="kpi-title">Mevcut Stoktaki Potansiyel Kâr</div>
              <div className="kpi-value" style={{ color: '#10b981' }}>
                {stockValuationData.totals.totalPotentialProfit.toLocaleString('tr-TR')} ₺
              </div>
            </div>
          </div>

          <DataGrid
            columns={stockValuationColumns}
            data={stockValuationData.report}
            searchPlaceholder="Ürün veya kod ile ara..."
            showTotals={true}
            totalColumns={['totalCostValue', 'totalSaleValue', 'potentialProfit']}
          />
        </div>
      )}
    </div>
  );
};
