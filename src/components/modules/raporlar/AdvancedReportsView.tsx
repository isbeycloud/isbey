import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  DollarSign,
  Users,
  ShieldAlert,
  Award,
  Landmark,
  Calendar,
  AlertTriangle,
  ArrowUpRight,
  Download,
  Filter,
  CheckCircle2,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import type { CustomerRiskScore, FieldAgentPerformance } from '../../../types';

export const AdvancedReportsView: React.FC = () => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'field' | 'risk' | 'cashflow'>('dashboard');

  const [kpiData, setKpiData] = useState<any>(null);
  const [performance, setPerformance] = useState<FieldAgentPerformance[]>([]);
  const [riskScores, setRiskScores] = useState<CustomerRiskScore[]>([]);
  const [cashFlow, setCashFlow] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [kRes, pRes, rRes, cfRes] = await Promise.all([
        api.getAdvancedDashboardReports(),
        api.getFieldAgentPerformance(),
        api.getCustomerRiskScores(),
        api.getCashBankFlowReports(),
      ]);

      if (kRes.success) setKpiData(kRes.data);
      if (pRes.success) setPerformance(pRes.performance || []);
      if (rRes.success) setRiskScores(rRes.riskScores || []);
      if (cfRes.success) setCashFlow(cfRes);
    } catch (err: any) {
      showToast(err.message || 'Rapor verileri yüklenemedi.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={24} color="var(--primary)" />
            </div>
            <div>
              <h1 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, margin: 0 }}>
                Gelişmiş Finans & Saha Raporlama Merkezi
              </h1>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>
                Konsolide yönetici göstergeleri, 0-100 Cari Risk Skorları ve Saha Performans Karnesi
              </p>
            </div>
          </div>

          <button
            onClick={() => window.print()}
            style={{ padding: '10px 18px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-main)', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Download size={16} />
            <span>Raporu Dışa Aktar (PDF/Yazdır)</span>
          </button>
        </div>

        {/* Tab Menüsü */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', marginBottom: '24px' }}>
          {[
            { id: 'dashboard', label: 'Yönetici Konsolide Dashboard', icon: TrendingUp },
            { id: 'field', label: `Saha Personel Karnesi (${performance.length})`, icon: Award },
            { id: 'risk', label: `Cari Risk & Skor Analizi (${riskScores.length})`, icon: ShieldAlert },
            { id: 'cashflow', label: 'Kasa & Banka Nakit Akışı', icon: Landmark },
          ].map(tab => {
            const Icon = tab.icon;
            const isSel = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  padding: '12px 18px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isSel ? '2px solid var(--primary)' : '2px solid transparent',
                  color: isSel ? 'var(--primary)' : 'var(--text-muted)',
                  fontWeight: isSel ? 700 : 500,
                  fontSize: 'var(--fs-base, 13px)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Icon size={18} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── 1. SEKME: YÖNETİCİ DASHBOARD ── */}
        {activeTab === 'dashboard' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 600 }}>Bugünkü Satış Hacmi</div>
                <div style={{ fontSize: 'var(--fs-2xl, 26px)', fontWeight: 700, color: 'var(--info)', marginTop: '4px' }}>
                  {(kpiData?.todaySales || 0).toLocaleString('tr-TR')} TL
                </div>
                <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '2px' }}>Toplam: {(kpiData?.totalSales || 0).toLocaleString('tr-TR')} TL</div>
              </div>

              <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 600 }}>Bugünkü Tahsilat (Saha+Online)</div>
                <div style={{ fontSize: 'var(--fs-2xl, 26px)', fontWeight: 700, color: 'var(--success)', marginTop: '4px' }}>
                  {(kpiData?.todayCollections || 0).toLocaleString('tr-TR')} TL
                </div>
                <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '2px' }}>Toplam: {(kpiData?.totalCollections || 0).toLocaleString('tr-TR')} TL</div>
              </div>

              <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 600 }}>Toplam Likit Varlıklar</div>
                <div style={{ fontSize: 'var(--fs-2xl, 26px)', fontWeight: 700, color: 'var(--warning)', marginTop: '4px' }}>
                  {(kpiData?.netLiquidAssets || 0).toLocaleString('tr-TR')} TL
                </div>
                <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '2px' }}>Kasa: {(kpiData?.totalCash || 0).toLocaleString('tr-TR')} TL | Banka: {(kpiData?.totalBank || 0).toLocaleString('tr-TR')} TL</div>
              </div>

              <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 600 }}>Cari Alacak / Borç</div>
                <div style={{ fontSize: 'var(--fs-2xl, 26px)', fontWeight: 700, color: 'var(--primary)', marginTop: '4px' }}>
                  {(kpiData?.totalReceivables || 0).toLocaleString('tr-TR')} TL
                </div>
                <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '2px' }}>{kpiData?.totalActiveCustomers || 0} Aktif Müşteri üzerinden</div>
              </div>
            </div>
          </div>
        )}

        {/* ── 2. SEKME: SAHA PERSONEL KARNESİ ── */}
        {activeTab === 'field' && (
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Saha Personeli Hedef ve Gerçekleşen Tahsilat Karnesi</h3>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm, 12px)', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface-secondary)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '14px 18px' }}>Saha Personeli</th>
                  <th style={{ padding: '14px 18px' }}>Tahsilat Adedi</th>
                  <th style={{ padding: '14px 18px' }}>Toplam Ziyaret</th>
                  <th style={{ padding: '14px 18px' }}>Hedef Tutar</th>
                  <th style={{ padding: '14px 18px' }}>Gerçekleşen Tahsilat</th>
                  <th style={{ padding: '14px 18px' }}>Başarı Oranı</th>
                </tr>
              </thead>
              <tbody>
                {performance.map((p, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--text-main)' }}>
                      {p.agentName}
                    </td>
                    <td style={{ padding: '14px 18px' }}>{p.collectionCount} İşlem</td>
                    <td style={{ padding: '14px 18px' }}>{p.completedVisits} / {p.totalVisits} Ziyaret</td>
                    <td style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>{p.targetAmount.toLocaleString('tr-TR')} TL</td>
                    <td style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--success)' }}>{p.totalCollections.toLocaleString('tr-TR')} TL</td>
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '60px', height: '6px', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-sm, 6px)', overflow: 'hidden' }}>
                          <div style={{ width: `${p.successRate}%`, height: '100%', background: p.successRate >= 80 ? 'var(--success)' : p.successRate >= 50 ? 'var(--info)' : 'var(--warning)' }} />
                        </div>
                        <span style={{ fontWeight: 700, color: p.successRate >= 80 ? 'var(--success)' : 'var(--info)' }}>%{p.successRate}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── 3. SEKME: CARİ RİSK SKORLARI ── */}
        {activeTab === 'risk' && (
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Müşteri Kredi & Cari Risk Skoru Tablosu (0 - 100)</h3>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm, 12px)', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface-secondary)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '14px 18px' }}>Müşteri (Cari Hesap)</th>
                  <th style={{ padding: '14px 18px' }}>Toplam Borç</th>
                  <th style={{ padding: '14px 18px' }}>Vadesi Geçen</th>
                  <th style={{ padding: '14px 18px' }}>Maks. Gecikme</th>
                  <th style={{ padding: '14px 18px' }}>Risk Skoru</th>
                  <th style={{ padding: '14px 18px' }}>Risk Seviyesi</th>
                  <th style={{ padding: '14px 18px' }}>Önerilen Aksiyon</th>
                </tr>
              </thead>
              <tbody>
                {riskScores.map((r, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--text-main)' }}>{r.customerTitle}</td>
                    <td style={{ padding: '14px 18px', fontWeight: 700 }}>{r.totalDebt.toLocaleString('tr-TR')} TL</td>
                    <td style={{ padding: '14px 18px', color: r.overdueDebt > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 700 }}>
                      {r.overdueDebt.toLocaleString('tr-TR')} TL
                    </td>
                    <td style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>
                      {r.maxOverdueDays > 0 ? `${r.maxOverdueDays} Gün` : 'Gecikme Yok'}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: r.riskScore >= 75 ? 'var(--success)' : r.riskScore >= 50 ? 'var(--warning)' : 'var(--danger)' }}>
                        {r.riskScore}
                      </span> / 100
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span className={
                        r.riskLevel === 'LOW'
                          ? 'badge badge-success'
                          : r.riskLevel === 'MEDIUM'
                          ? 'badge badge-info'
                          : 'badge badge-danger'
                      }>
                        {r.riskLevel === 'LOW' ? 'Düşük Risk' : r.riskLevel === 'MEDIUM' ? 'Orta Risk' : 'Yüksek Risk'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>
                      {r.suggestedAction}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── 4. SEKME: KASA & BANKA NAKİT AKIŞI ── */}
        {activeTab === 'cashflow' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '20px' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Kasa Hareketleri</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(cashFlow?.recentCashTxs || []).map((t: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-sm, 6px)', fontSize: 'var(--fs-sm, 12px)' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{t.description}</div>
                      <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>{t.date}</div>
                    </div>
                    <div style={{ fontWeight: 700, color: t.type === 'INCOME' ? 'var(--success)' : 'var(--danger)' }}>
                      {t.type === 'INCOME' ? '+' : '-'}{t.amount.toLocaleString('tr-TR')} TL
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '20px' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Banka Hareketleri</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(cashFlow?.recentBankTxs || []).map((t: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-sm, 6px)', fontSize: 'var(--fs-sm, 12px)' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{t.description}</div>
                      <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>{t.bankAccountName || 'Banka'}</div>
                    </div>
                    <div style={{ fontWeight: 700, color: t.type === 'INCOME' ? 'var(--success)' : 'var(--danger)' }}>
                      {t.type === 'INCOME' ? '+' : '-'}{t.amount.toLocaleString('tr-TR')} TL
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
