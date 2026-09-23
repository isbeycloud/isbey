import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  Layers,
  CheckCircle,
  ExternalLink,
  Zap,
  Star,
  Activity,
  Search,
  Filter,
  X,
  Play,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import type { MarketplaceAppItem, TenantIntegrationConnection } from '../../../types';

export const MarketplaceStoreView: React.FC = () => {
  const { showToast } = useToast();
  const [apps, setApps] = useState<MarketplaceAppItem[]>([]);
  const [connections, setConnections] = useState<TenantIntegrationConnection[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Connect Modal
  const [targetApp, setTargetApp] = useState<MarketplaceAppItem | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');

  // Ping Test Result
  const [pingResult, setPingResult] = useState<any>(null);
  const [isTestingPing, setIsTestingPing] = useState(false);

  const categories = [
    { id: 'ALL', label: 'Tümü' },
    { id: 'BANKA', label: 'Banka' },
    { id: 'ODEME', label: 'Ödeme & POS' },
    { id: 'E_DONUSUM', label: 'e-Dönüşüm' },
    { id: 'KARGO', label: 'Kargo' },
    { id: 'E_TICARET', label: 'E-Ticaret' },
    { id: 'CRM', label: 'CRM' },
    { id: 'AI', label: 'AI & Yapay Zeka' },
  ];

  useEffect(() => {
    loadData();
  }, [selectedCategory]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [aRes, cRes] = await Promise.all([
        api.getMarketplaceApps(selectedCategory !== 'ALL' ? selectedCategory : undefined),
        api.getMarketplaceConnections(),
      ]);

      if (aRes.success) setApps(aRes.apps || []);
      if (cRes.success) setConnections(cRes.connections || []);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetApp) return;

    try {
      const res = await api.connectMarketplaceApp({
        appSlug: targetApp.slug,
        credentials: { apiKey: apiKeyInput },
      });

      if (res.success) {
        showToast(res.message, 'success');
        setTargetApp(null);
        setApiKeyInput('');
        loadData();
      }
    } catch (err: any) {
      showToast(err.message || 'Bağlantı kurulamadı.', 'error');
    }
  };

  const handleDisconnect = async (appSlug: string) => {
    try {
      const res = await api.disconnectMarketplaceApp(appSlug);
      if (res.success) {
        showToast(res.message, 'success');
        loadData();
      }
    } catch (err: any) {
      showToast(err.message || 'Bağlantı kesilemedi.', 'error');
    }
  };

  const handleTestConnection = async (appSlug: string) => {
    setIsTestingPing(true);
    setPingResult(null);
    try {
      const res = await api.testMarketplaceConnection(appSlug);
      setPingResult(res);
      showToast(`Bağlantı Testi: ${res.message}`, res.healthy ? 'success' : 'error');
    } finally {
      setIsTestingPing(false);
    }
  };

  const isInstalled = (slug: string) => connections.some(c => c.appSlug === slug && c.isConnected);

  const filteredApps = apps.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.shortDescription.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '46px', height: '46px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShoppingBag size={26} color="var(--primary)" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, margin: 0 }}>
                  Entegrasyon Pazaryeri (Marketplace)
                </h1>
                {/* 2026-09-13: Koyu tema rozeti açık tema "badge-info" sınıfına çevrildi. */}
                <span className="badge badge-info" style={{ fontSize: 'var(--fs-xs, 11px)', fontWeight: 700 }}>
                  App Store
                </span>
              </div>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-base, 13px)' }}>
                Bankalar, ödeme sistemleri, kargo firmaları ve e-ticaret platformlarıyla tek tıkla bağlanın
              </p>
            </div>
          </div>
        </div>

        {/* Kategori Filtre Çubuğu */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '12px', marginBottom: '20px' }}>
          {categories.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(c.id)}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm, 6px)',
                border: 'none',
                background: selectedCategory === c.id ? 'var(--primary)' : 'var(--bg-surface-secondary)',
                color: selectedCategory === c.id ? '#fff' : 'var(--text-muted)',
                fontWeight: 700,
                fontSize: 'var(--fs-sm, 12px)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Uygulama Kartları Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {filteredApps.map(app => {
            const installed = isInstalled(app.slug);
            return (
              <div
                key={app.id}
                style={{
                  background: 'var(--bg-surface)',
                  borderRadius: 'var(--radius-md, 8px)',
                  border: installed ? '1px solid var(--success)' : '1px solid var(--border-color)',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <span className="badge badge-info" style={{ fontSize: 'var(--fs-xs, 11px)', fontWeight: 700 }}>
                      {app.category}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--fs-xs, 11px)', color: 'var(--warning-text)', fontWeight: 700 }}>
                      <Star size={12} fill="var(--warning)" />
                      {app.rating} ({app.installedTenantsCount})
                    </span>
                  </div>

                  <h3 style={{ margin: '0 0 6px', fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--text-main)' }}>
                    {app.name}
                  </h3>
                  <p style={{ margin: '0 0 14px', color: 'var(--text-muted)', fontSize: 'var(--fs-base, 13px)', lineHeight: '1.4' }}>
                    {app.shortDescription}
                  </p>

                  <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                    Geliştirici: <b>{app.author}</b> | v{app.version} | Ücret: <b>{app.pricingType === 'FREE' ? 'ÜCRETSİZ' : `${app.priceMonthly} TL / Ay`}</b>
                  </div>
                </div>

                {/* Aksiyon Butonları */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                  {installed ? (
                    <>
                      <button
                        onClick={() => handleTestConnection(app.slug)}
                        disabled={isTestingPing}
                        style={{ flex: 1, padding: '8px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--info)', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                      >
                        <Activity size={14} />
                        <span>Test Et</span>
                      </button>
                      <button
                        onClick={() => handleDisconnect(app.slug)}
                        style={{ padding: '8px 12px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--danger-text)', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, cursor: 'pointer' }}
                      >
                        Kaldır
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setTargetApp(app)}
                      style={{ width: '100%', padding: '10px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer' }}
                    >
                      + Bağlantı Kur (Yükle)
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Connect Modal */}
      {targetApp && (
        <div className="modal-overlay" style={{ zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10, 15, 30, 0.55)' }}>
          <div style={{ width: '90vw', maxWidth: '460px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '24px', color: 'var(--text-main)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>{targetApp.name} Bağlantısı</h3>
              <button onClick={() => setTargetApp(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: 'var(--fs-base, 13px)', color: 'var(--text-main)', margin: '0 0 16px' }}>
              {targetApp.fullDescription}
            </p>

            <form onSubmit={handleConnect} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Entegrasyon API / Client Key</label>
                <input
                  type="text"
                  required
                  placeholder="Entegratörden aldığınız anahtar..."
                  value={apiKeyInput}
                  onChange={e => setApiKeyInput(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-sm, 12px)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button type="button" onClick={() => setTargetApp(null)} style={{ padding: '8px 16px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', cursor: 'pointer' }}>
                  İptal
                </button>
                <button type="submit" style={{ padding: '8px 20px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                  Doğrula ve Bağlan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
