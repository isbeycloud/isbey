import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  DollarSign,
  FileText,
  UploadCloud,
  UserPlus,
  Plus,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Landmark,
  ShieldCheck,
  Building,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Database,
  Layers,
  ShoppingBag,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';

export const ClientPortalDashboardView: React.FC = () => {
  const { showToast } = useToast();
  const { setActiveView, setActiveRibbonTab, setIsFastCollectionOpen, setIsFastPaymentOpen } = useApp();

  const [dashboard, setDashboard] = useState<any>(null);
  const [onboarding, setOnboarding] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInjectingDemo, setIsInjectingDemo] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [dRes, oRes] = await Promise.all([
        api.getClientDashboard(),
        api.getOnboardingProgress(),
      ]);

      if (dRes.success) setDashboard(dRes.data);
      if (oRes.success) setOnboarding(oRes.progress);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  const handleInjectDemoData = async () => {
    setIsInjectingDemo(true);
    try {
      const res = await api.injectDemoData();
      if (res.success) {
        showToast(res.message, 'success');
        loadData();
      }
    } catch (err: any) {
      showToast(err.message || 'Demo veriler oluşturulamadı.', 'error');
    } finally {
      setIsInjectingDemo(false);
    }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Building size={26} color="var(--primary)" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, margin: 0 }}>
                  Firma Sahibi & Müşteri Portalı
                </h1>
                <span className="badge badge-info">
                  Portal v8.0
                </span>
              </div>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>
                İşletmenizin anlık finansal durumu, bekleyen onaylar, eksik evraklar ve hızlı operasyon merkezi
              </p>
            </div>
          </div>

          <button
            onClick={handleInjectDemoData}
            disabled={isInjectingDemo}
            style={{ padding: '10px 18px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Database size={16} />
            <span>{isInjectingDemo ? 'Yükleniyor...' : 'Demo Verileri Oluştur'}</span>
          </button>
        </div>

        {/* Hızlı İşlemler Butonları */}
        <div style={{ background: 'var(--bg-surface)', padding: '16px 20px', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', marginBottom: '24px' }}>
          <div style={{ fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '12px' }}>
            Hızlı İşlemler
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={() => { setActiveView('satis'); setActiveRibbonTab('SATIS'); }}
              style={{ padding: '10px 16px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={16} />
              <span>+ Yeni Fatura</span>
            </button>
            <button
              onClick={() => setIsFastCollectionOpen(true)}
              style={{ padding: '10px 16px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--success)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <DollarSign size={16} />
              <span>+ Yeni Tahsilat (F8)</span>
            </button>
            <button
              onClick={() => setIsFastPaymentOpen(true)}
              style={{ padding: '10px 16px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--danger)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <DollarSign size={16} />
              <span>+ Yeni Gider (F9)</span>
            </button>
            <button
              onClick={() => setActiveView('documents')}
              style={{ padding: '10px 16px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <UploadCloud size={16} />
              <span>+ Belge Yükle</span>
            </button>
            <button
              onClick={() => { setActiveView('cari'); setActiveRibbonTab('CARI'); }}
              style={{ padding: '10px 16px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-main)', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <UserPlus size={16} />
              <span>+ Cari Ekle</span>
            </button>
            <button
              onClick={() => { setActiveView('teklif'); setActiveRibbonTab('TEKLIF'); }}
              style={{ padding: '10px 16px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-main)', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <ShoppingBag size={16} />
              <span>+ Teklif Oluştur</span>
            </button>
          </div>
        </div>

        {/* Finansal Durum Kartları */}
        {dashboard && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700 }}>Toplam Cari Alacak</div>
              <div style={{ fontSize: 'var(--fs-2xl, 26px)', fontWeight: 700, color: 'var(--success)', marginTop: '4px' }}>
                {(dashboard.totalReceivables || 0).toLocaleString('tr-TR')} TL
              </div>
              <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '2px' }}>Açık Müşteri Bakiyeleri</div>
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700 }}>Toplam Tedarikçi Borcu</div>
              <div style={{ fontSize: 'var(--fs-2xl, 26px)', fontWeight: 700, color: 'var(--danger)', marginTop: '4px' }}>
                {(dashboard.totalPayables || 0).toLocaleString('tr-TR')} TL
              </div>
              <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '2px' }}>Ödenecek Faturalar</div>
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700 }}>Likit Varlıklar (Kasa + Banka)</div>
              <div style={{ fontSize: 'var(--fs-2xl, 26px)', fontWeight: 700, color: 'var(--info)', marginTop: '4px' }}>
                {(dashboard.totalLiquid || 0).toLocaleString('tr-TR')} TL
              </div>
              <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '2px' }}>Kasa: {(dashboard.totalCash || 0).toLocaleString('tr-TR')} TL | Banka: {(dashboard.totalBank || 0).toLocaleString('tr-TR')} TL</div>
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700 }}>Bugünkü Satış Cirosu</div>
              <div style={{ fontSize: 'var(--fs-2xl, 26px)', fontWeight: 700, color: 'var(--warning)', marginTop: '4px' }}>
                {(dashboard.todaySales || 0).toLocaleString('tr-TR')} TL
              </div>
              <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '2px' }}>Toplam Ciro: {(dashboard.totalSales || 0).toLocaleString('tr-TR')} TL</div>
            </div>
          </div>
        )}

        {/* 3'lü Ortak Çalışma Masası Kartları (Bekleyen Onaylar, Eksik Evrak, Görevler) */}
        {dashboard && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '24px' }}>
            {/* Onay Bekleyenler */}
            <div
              onClick={() => setActiveView('approvals')}
              style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '20px', cursor: 'pointer', transition: 'transform 0.2s' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--text-main)' }}>Onay Bekleyen İşlemler</h3>
                <span className="badge badge-warning">
                  {dashboard.pendingApprovalsCount} Onay
                </span>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', margin: 0 }}>
                {dashboard.pendingApprovalsCount > 0
                  ? `${dashboard.pendingApprovalsCount} adet fatura/gider yetkili onayı bekliyor.`
                  : 'Onay bekleyen finansal işlem bulunmuyor.'}
              </p>
            </div>

            {/* Eksik Evraklar */}
            <div
              onClick={() => setActiveView('documents')}
              style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '20px', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--text-main)' }}>Müşavirden Evrak Talepleri</h3>
                <span className="badge badge-danger">
                  {dashboard.missingDocumentsCount} Beklenen
                </span>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', margin: 0 }}>
                {dashboard.missingDocumentsCount > 0
                  ? 'Mali müşaviriniz tarafından talep edilen banka ekstresi veya fişler var.'
                  : 'Tüm muhasebe evraklarınız eksiksiz teslim edilmiş.'}
              </p>
            </div>

            {/* Aktif Görevler */}
            <div
              onClick={() => setActiveView('tasks')}
              style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '20px', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--text-main)' }}>Açık Görevler</h3>
                <span className="badge badge-info">
                  {dashboard.activeTasksCount} Görev
                </span>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', margin: 0 }}>
                {dashboard.activeTasksCount > 0
                  ? 'Ekip üyeleri veya mali müşavire atanmış açık görevler mevcut.'
                  : 'Tamamlanmamış açık görev bulunmuyor.'}
              </p>
            </div>
          </div>
        )}

        {/* Onboarding İlerleme Çubuğu */}
        {onboarding && (
          <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={18} color="var(--success)" />
                <span style={{ fontSize: 'var(--fs-md, 14px)', fontWeight: 700 }}>Firma Kurulum & Entegrasyon İlerlemesi</span>
              </div>
              <span style={{ fontWeight: 700, color: 'var(--success)', fontSize: 'var(--fs-lg, 16px)' }}>%{onboarding.completionPercentage}</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-sm, 6px)', overflow: 'hidden' }}>
              <div style={{ width: `${onboarding.completionPercentage}%`, height: '100%', background: 'var(--success)' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
