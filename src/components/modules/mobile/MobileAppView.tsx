import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Wifi,
  WifiOff,
  Battery,
  DollarSign,
  CreditCard,
  Scan,
  MapPin,
  Users,
  Navigation,
  RefreshCw,
  Plus,
  CheckCircle2,
  AlertTriangle,
  QrCode,
  Layers,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { FieldCollectionModal } from '../saha/FieldCollectionModal';
import { StockCountModal } from '../saha/StockCountModal';

export const MobileAppView: React.FC = () => {
  const { showToast } = useToast();
  const [activeScreen, setActiveScreen] = useState<'home' | 'collections' | 'pos' | 'customers' | 'visits'>('home');
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  // Modals
  const [isCollectionModalOpen, setIsCollectionModalOpen] = useState(false);
  const [isStockCountModalOpen, setIsStockCountModalOpen] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const res = await api.getMobileDashboard();
      if (res.success) setDashboardData(res.kpis);
    } catch {
      // ignore
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const res = await api.syncMobileData({
        operations: [],
      });
      if (res.success) {
        showToast('Tüm çevrimdışı veriler başarıyla eşitlendi.', 'success');
        setPendingSyncCount(0);
        loadDashboard();
      }
    } catch (err: any) {
      showToast(err.message || 'Senkronizasyon başarısız.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      {/* 2026-09-13: Bu blok bilinçli olarak KOYU bırakıldı — gerçek mobil
          uygulamanın birebir telefon mockup'ıdır (cihaz çerçevesi + uygulama
          ekranı). Açık temaya çevrilirse mockup masaüstü arayüzüne benzer ve
          mobil ürünü temsil etme amacını yitirir. */}
      {/* Mobil Cihaz Çerçevesi (Mobile Phone Mockup) */}
      <div
        style={{
          width: '100%',
          maxWidth: '410px',
          height: '840px',
          background: '#0f172a',
          borderRadius: '44px',
          border: '10px solid #1e293b',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Dynamic Island / Hoparlör Çentiği */}
        <div style={{ position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)', width: '110px', height: '22px', background: '#000', borderRadius: '14px', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#1e293b', marginRight: '6px' }} />
          <div style={{ width: '40px', height: '4px', borderRadius: '2px', background: '#1e293b' }} />
        </div>

        {/* Durum Çubuğu (Status Bar) */}
        <div style={{ padding: '14px 22px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', zIndex: 90 }}>
          <span>09:41</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span onClick={() => setIsOnline(!isOnline)} style={{ cursor: 'pointer', color: isOnline ? '#10b981' : '#ef4444' }}>
              {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
            </span>
            <span>5G</span>
            <Battery size={14} />
          </div>
        </div>

        {/* Senkronizasyon Uyarısı */}
        <div style={{ background: isOnline ? 'rgba(2, 132, 199, 0.15)' : 'rgba(239, 68, 68, 0.15)', padding: '6px 14px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem' }}>
          <span style={{ color: isOnline ? '#38bdf8' : '#f87171', fontWeight: 600 }}>
            {isOnline ? '● Bulut Senkronizasyonu Aktif' : '○ Çevrimdışı Mod (Lokal Kuyruk)'}
          </span>
          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}
          >
            <RefreshCw size={10} className={isSyncing ? 'spinner' : ''} />
            <span>Eşitle</span>
          </button>
        </div>

        {/* Mobil İçerik Alanı */}
        {/* 2026-09-13 (tasarım sadeleştirmesi): bu bölümdeki gradyanlar KORUNDU — burası
            bilinçli olarak koyu tasarlanmış telefon maketi (mockup) içeriği; maket
            kendi cihaz estetiğini taşır, uygulama arayüzü kurallarına tabi değil. */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {/* Mobil Başlık */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Hoş Geldiniz,</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f8fafc' }}>Saha Personeli</div>
            </div>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #0284c7, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
              İŞ
            </div>
          </div>

          {/* Finansal Özet Kartı */}
          <div style={{ background: 'linear-gradient(135deg, #0284c7, #1e40af)', borderRadius: '20px', padding: '18px', color: '#fff', marginBottom: '18px', boxShadow: '0 10px 25px -5px rgba(2, 132, 199, 0.4)' }}>
            <div style={{ fontSize: '0.75rem', opacity: 0.8, fontWeight: 600 }}>Bugünkü Saha Tahsilatı</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: '4px' }}>
              {(dashboardData?.todayCollections || 0).toLocaleString('tr-TR')} <span style={{ fontSize: '1rem', opacity: 0.9 }}>TL</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '14px', borderTop: '1px solid rgba(255, 255, 255, 0.2)', paddingTop: '10px', fontSize: '0.75rem' }}>
              <div>
                <div style={{ opacity: 0.8 }}>Ziyaretler:</div>
                <div style={{ fontWeight: 700 }}>{dashboardData?.completedVisitsCount || 0} / {dashboardData?.plannedVisitsCount || 0} Tamamlandı</div>
              </div>
              <div>
                <div style={{ opacity: 0.8 }}>Kritik Stok:</div>
                <div style={{ fontWeight: 700, color: '#fca5a5' }}>{dashboardData?.criticalStockCount || 0} Ürün</div>
              </div>
            </div>
          </div>

          {/* Hızlı Aksiyonlar */}
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '10px' }}>Hızlı Saha İşlemleri</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
            <button
              onClick={() => setIsCollectionModalOpen(true)}
              style={{ background: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '14px', padding: '12px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', color: '#fff', cursor: 'pointer' }}
            >
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <DollarSign size={18} color="#10b981" />
              </div>
              <span style={{ fontSize: '0.7rem', fontWeight: 700 }}>Tahsilat</span>
            </button>

            <button
              onClick={() => setIsStockCountModalOpen(true)}
              style={{ background: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '14px', padding: '12px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', color: '#fff', cursor: 'pointer' }}
            >
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Scan size={18} color="#38bdf8" />
              </div>
              <span style={{ fontSize: '0.7rem', fontWeight: 700 }}>Sayım</span>
            </button>

            <button
              onClick={() => showToast('Mobil POS terminali açıldı.', 'info')}
              style={{ background: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '14px', padding: '12px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', color: '#fff', cursor: 'pointer' }}
            >
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CreditCard size={18} color="#f59e0b" />
              </div>
              <span style={{ fontSize: '0.7rem', fontWeight: 700 }}>POS</span>
            </button>

            <button
              onClick={() => showToast('Rota haritası açıldı.', 'info')}
              style={{ background: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '14px', padding: '12px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', color: '#fff', cursor: 'pointer' }}
            >
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(236, 72, 153, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MapPin size={18} color="#ec4899" />
              </div>
              <span style={{ fontSize: '0.7rem', fontWeight: 700 }}>Rota</span>
            </button>
          </div>

          {/* Günlük Ziyaret Listesi */}
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '10px' }}>Bugünkü Ziyaret Planı</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              { time: '10:30', name: 'Atlas Teknoloji Ltd.', status: 'COMPLETED', outcome: 'Tahsilat Yapıldı (12.500 TL)' },
              { time: '13:00', name: 'Kuzey Ticaret A.Ş.', status: 'COMPLETED', outcome: 'Sipariş Alındı' },
              { time: '15:30', name: 'Marmara Lojistik', status: 'PENDING', outcome: 'Bekleniyor' },
            ].map((v, i) => (
              <div key={i} style={{ background: '#1e293b', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 700 }}>{v.time}</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc' }}>{v.name}</div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{v.outcome}</div>
                </div>
                <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, background: v.status === 'COMPLETED' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)', color: v.status === 'COMPLETED' ? '#10b981' : '#f59e0b' }}>
                  {v.status === 'COMPLETED' ? 'Bitti' : 'Bekliyor'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Alt Mobil Navigasyon Barı */}
        <div style={{ background: '#090d16', borderTop: '1px solid rgba(255, 255, 255, 0.08)', padding: '10px 14px 14px', display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
          {[
            { id: 'home', label: 'Ana Sayfa', icon: Smartphone },
            { id: 'collections', label: 'Tahsilat', icon: DollarSign },
            { id: 'pos', label: 'POS', icon: CreditCard },
            { id: 'customers', label: 'Cari', icon: Users },
            { id: 'visits', label: 'Rota', icon: Navigation },
          ].map(item => {
            const Icon = item.icon;
            const isSel = activeScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveScreen(item.id as any);
                  if (item.id === 'collections') setIsCollectionModalOpen(true);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  color: isSel ? '#38bdf8' : '#64748b',
                  fontSize: '0.65rem',
                  fontWeight: isSel ? 700 : 500,
                  cursor: 'pointer',
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Field Collection Modal */}
      {isCollectionModalOpen && (
        <FieldCollectionModal
          isOpen={isCollectionModalOpen}
          onClose={() => setIsCollectionModalOpen(false)}
          onSuccess={() => {
            setIsCollectionModalOpen(false);
            loadDashboard();
          }}
        />
      )}

      {/* Stock Count Modal */}
      {isStockCountModalOpen && (
        <StockCountModal
          isOpen={isStockCountModalOpen}
          onClose={() => setIsStockCountModalOpen(false)}
          onSuccess={() => {
            setIsStockCountModalOpen(false);
            loadDashboard();
          }}
        />
      )}
    </div>
  );
};
