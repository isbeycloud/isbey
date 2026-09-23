import React, { useState, useEffect } from 'react';
import { api } from '../../../services/api';
import { useApp } from '../../../context/AppContext';
import {
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Package,
  Users,
  Phone,
  ArrowRight,
  ShieldAlert,
  Zap
} from 'lucide-react';

export const AIAssistantView: React.FC = () => {
  const { setActiveView, setActiveRibbonTab, setIsFastCollectionOpen } = useApp();
  const [insights, setInsights] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInsights();
  }, []);

  const loadInsights = async () => {
    setLoading(true);
    try {
      const res = await api.getAIInsights();
      if (res.success) {
        setInsights(res.insights);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !insights) {
    return (
      <div className="view-content-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Sparkles size={32} className="animate-spin" color="var(--info)" />
        <span style={{ marginTop: '10px', fontSize: '13px' }}>İŞBEY Yapay Zeka Modelleri Verileri Analiz Ediyor...</span>
      </div>
    );
  }

  const { customerRisks, collectionPriorities, stockForecasts, salesOpportunities } = insights;

  return (
    <div className="view-content-container">
      {/* AI Asistan Banner */}
      <div
        style={{
          /* 2026-09-13 (tasarım düzeltmesi): Banner koyu lacivert→mavi gradyandı
             ve "AI-dashboard" estetiğinin en belirgin örneğiydi. Açık tema
             yüzeyine çevrildi; başlık/paragraf metin renkleri token'lara bağlandı. */
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg, 10px)',
          padding: '18px 24px',
          color: 'var(--text-main)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <Sparkles size={20} color="var(--info)" />
            <h2 style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>İŞBEY Akıllı Karar &amp; Öngörü Asistanı</h2>
            <span className="badge badge-info" style={{ background: 'var(--info)', color: '#fff' }}>AI Proaktif Analiz</span>
          </div>
          <p style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', maxWidth: '680px' }}>
            Geçmiş faturalar, tahsilat eğilimleri ve stok tüketim hızlarını makine öğrenimi modelleriyle inceleyerek nakit akışınızı ve kârlılığınızı optimize eden akıllı öneriler.
          </p>
        </div>

        <button className="btn btn-primary" onClick={loadInsights}>
          <Zap size={14} />
          <span>Analizi Yenile</span>
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        
        {/* 1. ÖNCELİKLİ TAHSİLAT HEDEFLERİ */}
        <div className="card-panel">
          <div className="card-panel-header" style={{ background: '#ecfdf5' }}>
            <span className="card-panel-title" style={{ color: '#065f46' }}>
              <TrendingUp size={16} color="var(--success)" />
              Bu Hafta Öncelikli Tahsil Edilecek Müşteriler
            </span>
          </div>
          <div className="card-panel-body" style={{ padding: '10px 14px' }}>
            {collectionPriorities.map((item: any) => (
              <div
                key={item.customerId}
                style={{
                  padding: '10px',
                  borderBottom: '1px solid var(--border-light)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontWeight: 700, fontSize: '13px' }}>#{item.rank} {item.customerTitle}</span>
                    <span className={`badge ${item.priority === 'ACİL' ? 'badge-danger' : 'badge-info'}`}>
                      {item.priority}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {item.suggestedAction}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--primary)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Phone size={11} /> {item.phone}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 'var(--fs-md, 14px)', fontWeight: 700, color: 'var(--danger)' }}>
                    {item.balance.toLocaleString('tr-TR')} ₺
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ marginTop: '4px', padding: '2px 8px', fontSize: '11px' }}
                    onClick={() => setIsFastCollectionOpen(true)}
                  >
                    Tahsil Et
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2. CARİ ÖDEME RİSKİ DEĞERLENDİRMESİ */}
        <div className="card-panel">
          <div className="card-panel-header" style={{ background: '#fef2f2' }}>
            <span className="card-panel-title" style={{ color: '#991b1b' }}>
              <ShieldAlert size={16} color="var(--danger)" />
              Cari Ödeme Riski & Davranış Puanı
            </span>
          </div>
          <div className="card-panel-body" style={{ padding: '10px 14px' }}>
            {customerRisks.map((c: any) => (
              <div
                key={c.customerId}
                style={{
                  padding: '10px',
                  borderBottom: '1px solid var(--border-light)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px' }}>{c.customerTitle}</div>
                  <span className={`badge ${c.riskLevel === 'CRITICAL' ? 'badge-danger' : c.riskLevel === 'HIGH' ? 'badge-warning' : 'badge-success'}`}>
                    Risk Skoru: {c.riskScore} / 100
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-main)', marginTop: '4px', background: 'var(--bg-surface-secondary)', padding: '6px 10px', borderRadius: '6px' }}>
                  <strong>AI Görüşü:</strong> {c.insight}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* 3. STOK TÜKENME & TEDARİK PROJEKSİYONU */}
      <div className="card-panel">
        <div className="card-panel-header">
          <span className="card-panel-title">
            <Package size={16} color="var(--warning)" />
            Stok Tükenme Projeksiyonu & Tedarik Tavsiyeleri
          </span>
        </div>
        <div className="card-panel-body" style={{ padding: '10px 14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
            {stockForecasts.map((s: any) => (
              <div
                key={s.productId}
                style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '12px',
                  background: s.isUrgent ? '#fffbeb' : 'var(--bg-surface)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px' }}>{s.productName}</div>
                  <span className={`badge ${s.isUrgent ? 'badge-danger' : 'badge-success'}`}>
                    ~{s.estimatedDaysRemaining} Gün Kaldı
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0' }}>
                  Mevcut: {s.currentStock} {s.unit} • Günlük Tüketim Hızı: ~{s.dailyVelocity} {s.unit}/gün
                </div>
                <div style={{ fontSize: '12px', marginTop: '6px', color: s.isUrgent ? '#b45309' : 'var(--text-main)' }}>
                  {s.aiAdvice}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
};
