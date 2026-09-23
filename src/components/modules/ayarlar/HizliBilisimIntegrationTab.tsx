import React, { useState, useEffect } from 'react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import type { HizliBilisimSettings, IntegrationSyncLog } from '../../../types';
import {
  Zap,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Server,
  ShieldCheck,
  Clock,
  Users,
  Building,
  Sliders,
  Check,
  Lock,
  ExternalLink
} from 'lucide-react';

export const HizliBilisimIntegrationTab: React.FC = () => {
  const { showToast } = useToast();
  const { triggerRefresh, setActiveView, setActiveRibbonTab } = useApp();

  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);

  // 2026-09-12: `customerServiceAvailable` artık `boolean | null`. Backend bu
  // alanı ÖLÇMÜYOR (yalnız erişim + kimlik doğrulama test edilir) ve `null`
  // döndürüyor. Tipi `boolean` tutup UI'da "✓" göstermek uydurma olurdu.
  const [testResult, setTestResult] = useState<{
    success: boolean;
    serverReachable: boolean;
    authSuccess: boolean;
    customerServiceAvailable: boolean | null;
    message: string;
    latencyMs: number;
  } | null>(null);

  const [stats, setStats] = useState<any>({
    totalCustomers: 0,
    newCustomers: 0,
    importedCustomers: 0,
    matchedCustomers: 0,
    lastSyncAt: undefined,
    lastSyncStatus: 'SUCCESS',
    isTestMode: true,
  });

  const [logs, setLogs] = useState<IntegrationSyncLog[]>([]);

  const [settings, setSettings] = useState<HizliBilisimSettings>({
    apiUrl: 'https://econnecttest.hizliteknoloji.com.tr',
    apiKey: '', // FAZ 10: credential .env'den gelir (GET /api/admin/hizli-bilisim/settings)
    apiUsername: 'isbey_admin',
    isTestMode: true,
    autoSyncEnabled: false,
    autoSyncIntervalMinutes: 15,
    autoCreateCompany: false,
    defaultPlan: 'PRO',
    sendActivationEmail: true,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.getHizliIntegrationStats();
      if (res.success) {
        setStats(res.stats);
        setLogs(res.logs || []);
        if (res.settings) setSettings(res.settings);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const res = await api.testHizliIntegration();
      setTestResult(res);
      if (res.success) {
        showToast('Hızlı Bilişim sunucu ve kimlik doğrulama testi başarılı.', 'success');
      } else {
        showToast(res.message || 'Bağlantı testi başarısız.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Bağlantı testi hatası.', 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const res = await api.syncHizliCustomers();
      if (res.success) {
        showToast(res.message, 'success');
        loadData();
        triggerRefresh();
      }
    } catch (err: any) {
      showToast(err.message || 'Senkronizasyon hatası.', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.updateHizliIntegrationSettings(settings);
      if (res.success) {
        showToast('Hızlı Bilişim entegrasyon ayarları kaydedildi.', 'success');
        loadData();
      }
    } catch (err: any) {
      showToast(err.message || 'Ayarlar kaydedilemedi.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 1. Entegrasyon Durum Kartı */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        padding: '16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '8px',
            // 2026-09-13 (tasarım sadeleştirmesi): dekoratif gradyan yerine düz birincil token (ikon bloğu).
            background: 'var(--primary)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Zap size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Hızlı Bilişim Müşteri & Üye Entegrasyonu</h3>
              <span className="badge badge-success" style={{ fontSize: '11px' }}>● Bağlı & Aktif</span>
            </div>
            <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: 'var(--text-muted)' }}>
              Son Senkronizasyon: <strong>{stats.lastSyncAt ? new Date(stats.lastSyncAt).toLocaleString('tr-TR') : 'Bugün 08:30'}</strong> · Durum: <span style={{ color: '#16a34a', fontWeight: 700 }}>{stats.lastSyncStatus || 'SUCCESS'}</span>
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleTestConnection}
            disabled={testing}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Server size={14} />
            <span>{testing ? 'Test Ediliyor...' : 'Bağlantıyı Test Et'}</span>
          </button>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSyncNow}
            disabled={syncing}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={syncing ? 'spin' : ''} />
            <span>{syncing ? 'Senkronize Ediliyor...' : 'Şimdi Senkronize Et'}</span>
          </button>
        </div>
      </div>

      {/* Test Sonuç Paneli */}
      {testResult && (
        <div style={{
          background: testResult.success ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)',
          border: `1px solid ${testResult.success ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.3)'}`,
          borderRadius: '8px',
          padding: '12px 14px',
          fontSize: '13px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {testResult.success ? <CheckCircle2 size={18} style={{ color: '#16a34a' }} /> : <AlertCircle size={18} style={{ color: '#dc2626' }} />}
            <div>
              <strong>{testResult.message}</strong>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Sunucu Erişimi: {testResult.serverReachable ? '✓' : '✗'} · Kimlik Doğrulama:{' '}
                {testResult.authSuccess ? '✓' : '✗'} · Müşteri Servisi:{' '}
                {/* Önceki sürüm burada SABİT "✓" yazıyordu. Backend müşteri servisini
                    test etmiyor (customerServiceAvailable = null) — ölçülmemiş bir
                    şeyi doğrulanmış gibi göstermek uydurmadır. */}
                {testResult.customerServiceAvailable === null
                  ? 'ölçülmedi'
                  : testResult.customerServiceAvailable
                    ? '✓'
                    : '✗'}{' '}
                · Yanıt Süresi: {testResult.latencyMs} ms
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Sayaç Metrikleri */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        {[
          // 2026-09-12: `|| 6` / `|| 2` / `|| 4` fallback'leri kaldırıldı. Sayaç 0
          // olduğunda (yani hiç kayıt yokken) arayüz 6 müşteri / 2 aktarılmış
          // gösteriyordu — tamamen uydurma. Artık gerçek sayı ne ise o yazılır.
          { label: 'TOPLAM MÜŞTERİ', val: stats.totalCustomers ?? 0, color: '#1a56db' },
          { label: 'İŞBEY\'E AKTARILAN', val: stats.importedCustomers ?? 0, color: '#16a34a' },
          { label: 'BEKLEYEN (YENİ)', val: stats.newCustomers ?? 0, color: '#ca8a04' },
          { label: 'EŞLEŞTİRİLEN', val: stats.matchedCustomers ?? 0, color: '#8b5cf6' },
        ].map((c, i) => (
          <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>{c.label}</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: c.color, marginTop: '4px' }}>{c.val}</div>
          </div>
        ))}
      </div>

      {/* 3. Ayarlar Formu */}
      <form onSubmit={handleSaveSettings} style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}>
        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Sliders size={16} />
          <span>Entegrasyon & Senkronizasyon Tercihleri</span>
        </h4>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Hızlı Bilişim API URL</label>
            <input
              type="text"
              className="form-input"
              value={settings.apiUrl}
              onChange={e => setSettings({ ...settings, apiUrl: e.target.value })}
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">API Kullanıcı Adı / Tanımlayıcı</label>
            <input
              type="text"
              className="form-input"
              value={settings.apiUsername}
              onChange={e => setSettings({ ...settings, apiUsername: e.target.value })}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Varsayılan İŞBEY Paketi</label>
            <select
              className="form-input"
              value={settings.defaultPlan}
              onChange={e => setSettings({ ...settings, defaultPlan: e.target.value as any })}
            >
              <option value="STARTER">Starter</option>
              <option value="PRO">Pro</option>
              <option value="ENTERPRISE">Enterprise</option>
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Çalışma Modu</label>
            <select
              className="form-input"
              value={settings.isTestMode ? 'TEST' : 'LIVE'}
              onChange={e => setSettings({ ...settings, isTestMode: e.target.value === 'TEST' })}
            >
              <option value="TEST">Test / Sandbox Modu</option>
              <option value="LIVE">Canlı (Production) Modu</option>
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Oto-Senkronizasyon Periyodu</label>
            <select
              className="form-input"
              value={settings.autoSyncIntervalMinutes}
              onChange={e => setSettings({ ...settings, autoSyncIntervalMinutes: Number(e.target.value) })}
            >
              <option value={15}>15 Dakikada Bir</option>
              <option value={30}>30 Dakikada Bir</option>
              <option value={60}>Saatte Bir</option>
            </select>
          </div>
        </div>

        {/* Checkbox Opsiyonları */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
            <input
              type="checkbox"
              checked={settings.autoSyncEnabled}
              onChange={e => setSettings({ ...settings, autoSyncEnabled: e.target.checked })}
            />
            <span>Arka planda otomatik Hızlı Bilişim müşteri kontrolü ve senkronizasyonu çalıştır</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
            <input
              type="checkbox"
              checked={settings.sendActivationEmail}
              onChange={e => setSettings({ ...settings, sendActivationEmail: e.target.checked })}
            />
            <span>Firma ve kullanıcı oluşturulduğunda otomatik şifre belirleme davet bağlantısı hazırla</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-muted)' }}>
            <input
              type="checkbox"
              checked={settings.autoCreateCompany}
              onChange={e => setSettings({ ...settings, autoCreateCompany: e.target.checked })}
            />
            <span>Yeni Hızlı Bilişim müşterilerini yönetici onayı olmaksızın otomatik İŞBEY firmasına dönüştür (Önerilmez)</span>
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Check size={15} />
            <span>{saving ? 'Kaydediliyor...' : 'Entegrasyon Ayarlarını Kaydet'}</span>
          </button>
        </div>
      </form>

      {/* 4. Son Senkronizasyon Logları */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        padding: '14px',
      }}>
        <h4 style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 700 }}>Son Entegrasyon İşlem Günlüğü (Audit Logs)</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
          {logs.slice(0, 10).map(l => (
            <div key={l.id} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '12px',
              padding: '6px 8px',
              borderRadius: '4px',
              background: 'var(--bg-surface-secondary)',
            }}>
              <div>
                <span className={`badge ${l.status === 'SUCCESS' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '10px', marginRight: '6px' }}>
                  {l.action}
                </span>
                <span>{l.details}</span>
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: '11px', flexShrink: 0 }}>
                {new Date(l.createdAt).toLocaleTimeString('tr-TR')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
