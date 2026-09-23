import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Info,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import type { CashFlowForecastResult } from '../../../types';

export const CashFlowForecastView: React.FC = () => {
  const { showToast } = useToast();
  const [period, setPeriod] = useState<'7_DAYS' | '30_DAYS' | '90_DAYS'>('30_DAYS');
  const [forecast, setForecast] = useState<CashFlowForecastResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadForecast(period);
  }, [period]);

  const loadForecast = async (p: '7_DAYS' | '30_DAYS' | '90_DAYS') => {
    setIsLoading(true);
    try {
      const res = await api.getCashFlowForecast(p);
      if (res.success) setForecast(res.forecast);
    } catch (err: any) {
      showToast(err.message || 'Tahmin yüklenemedi.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header & Periyot Seçimi */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={24} color="var(--primary)" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, margin: 0 }}>
                  Nakit Akış Tahmini & Finansal Projeksiyon
                </h1>
                <span className="badge badge-success">
                  AI Simülasyonu
                </span>
              </div>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>
                Açık fatura vadeleri, düzenli cari ödeme alışkanlıkları ve gider projeksiyonlarına göre likidite tahmini
              </p>
            </div>
          </div>

          {/* Periyot Butonları */}
          <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-surface)', padding: '4px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
            {[
              { id: '7_DAYS', label: '7 Gün' },
              { id: '30_DAYS', label: '30 Gün' },
              { id: '90_DAYS', label: '90 Gün' },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id as any)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-sm, 6px)',
                  border: 'none',
                  background: period === p.id ? 'var(--primary)' : 'transparent',
                  color: period === p.id ? '#fff' : 'var(--text-muted)',
                  fontWeight: 700,
                  fontSize: 'var(--fs-sm, 12px)',
                  cursor: 'pointer',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {forecast && (
          <div>
            {/* KPI Kartları */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 600 }}>Mevcut Likit Varlıklar</div>
                <div style={{ fontSize: 'var(--fs-2xl, 26px)', fontWeight: 700, color: 'var(--info)', marginTop: '4px' }}>
                  {forecast.currentLiquidAssets.toLocaleString('tr-TR')} TL
                </div>
                <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '2px' }}>Kasa ve Banka Mevcutları</div>
              </div>

              <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 600 }}>Beklenen Tahsilat Girişi</div>
                <div style={{ fontSize: 'var(--fs-2xl, 26px)', fontWeight: 700, color: 'var(--success-text)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <ArrowUpRight size={22} />
                  <span>+{forecast.expectedCollections.toLocaleString('tr-TR')} TL</span>
                </div>
                <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '2px' }}>Müşteri vadeli faturaları</div>
              </div>

              <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 600 }}>Beklenen Gider / Ödeme</div>
                <div style={{ fontSize: 'var(--fs-2xl, 26px)', fontWeight: 700, color: 'var(--danger-text)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <ArrowDownRight size={22} />
                  <span>-{forecast.expectedPayables.toLocaleString('tr-TR')} TL</span>
                </div>
                <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '2px' }}>Tedarikçi borçları & masraflar</div>
              </div>

              <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 600 }}>Tahmini Dönem Sonu Bakiye</div>
                <div style={{ fontSize: 'var(--fs-2xl, 26px)', fontWeight: 700, color: forecast.projectedEndingBalance >= 0 ? 'var(--success-text)' : 'var(--danger-text)', marginTop: '4px' }}>
                  {forecast.projectedEndingBalance.toLocaleString('tr-TR')} TL
                </div>
                <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '2px' }}>Güven: %{forecast.confidence === 'HIGH' ? '92' : '84'}</div>
              </div>
            </div>

            {/* Nakit Açığı Uyarısı veya Pozitif Durum Kutusu */}
            <div style={{
              background: forecast.isDeficitExpected ? 'var(--danger-bg)' : 'var(--success-bg)',
              border: forecast.isDeficitExpected ? '1px solid var(--danger-border)' : '1px solid var(--success-border)',
              borderRadius: 'var(--radius-md, 8px)',
              padding: '20px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            }}>
              {forecast.isDeficitExpected ? (
                <AlertTriangle size={32} color="var(--danger)" style={{ flexShrink: 0 }} />
              ) : (
                <CheckCircle2 size={32} color="var(--success)" style={{ flexShrink: 0 }} />
              )}
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: forecast.isDeficitExpected ? 'var(--danger-text)' : 'var(--success-text)' }}>
                  {forecast.isDeficitExpected
                    ? `Önümüzdeki ${period === '7_DAYS' ? '7' : period === '30_DAYS' ? '30' : '90'} Gün İçinde ${forecast.deficitAmount.toLocaleString('tr-TR')} TL Nakit Açığı Oluşabilir`
                    : `Önümüzdeki ${period === '7_DAYS' ? '7' : period === '30_DAYS' ? '30' : '90'} Günlük Likidite Dengeli`}
                </h3>
                <p style={{ margin: 0, fontSize: 'var(--fs-base, 13px)', color: 'var(--text-main)' }}>
                  {forecast.explanation[forecast.explanation.length - 1]}
                </p>
              </div>
            </div>

            {/* Günlük Likidite Tablosu */}
            <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
                <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Günlük Nakit Akış Simülasyon Çizelgesi</h3>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-base, 13px)', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-surface-secondary)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '12px 18px' }}>Tarih / Gün</th>
                    <th style={{ padding: '12px 18px' }}>Tahmini Giriş (+)</th>
                    <th style={{ padding: '12px 18px' }}>Tahmini Çıkış (-)</th>
                    <th style={{ padding: '12px 18px' }}>Dönem Bakiye Projeksiyonu</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.dailyProjections.map((d, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '12px 18px', color: 'var(--text-muted)' }}>
                        <b>{d.dayLabel}</b> ({new Date(d.date).toLocaleDateString('tr-TR')})
                      </td>
                      <td style={{ padding: '12px 18px', color: 'var(--success-text)', fontWeight: 700 }}>
                        +{d.projectedInflow.toLocaleString('tr-TR')} TL
                      </td>
                      <td style={{ padding: '12px 18px', color: 'var(--danger-text)', fontWeight: 700 }}>
                        -{d.projectedOutflow.toLocaleString('tr-TR')} TL
                      </td>
                      <td style={{ padding: '12px 18px', fontWeight: 700, color: d.endingBalance >= 0 ? 'var(--info)' : 'var(--danger-text)' }}>
                        {d.endingBalance.toLocaleString('tr-TR')} TL
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
