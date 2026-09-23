import React, { useState, useEffect } from 'react';
import {
  Code,
  Key,
  Webhook,
  Terminal,
  Copy,
  Plus,
  CheckCircle2,
  ShieldCheck,
  AlertCircle,
  Play,
  X,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import type { ApiKeyCredential, WebhookSubscriptionItem, ApiUsageLog } from '../../../types';

export const DeveloperPortalView: React.FC = () => {
  const { showToast } = useToast();
  const [keys, setKeys] = useState<ApiKeyCredential[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookSubscriptionItem[]>([]);
  const [logs, setLogs] = useState<ApiUsageLog[]>([]);
  const [activeTab, setActiveTab] = useState<'keys' | 'webhooks' | 'sandbox' | 'logs'>('keys');
  const [isLoading, setIsLoading] = useState(true);

  // New Key Modal
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [keyForm, setKeyForm] = useState({
    name: '',
    isSandbox: false,
    rateLimitTier: 'PRO' as 'BASIC' | 'PRO' | 'ENTERPRISE',
  });

  // Secret Key Revealed Popup
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  // New Webhook Modal
  const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');

  // Sandbox Test
  const [sandboxEndpoint, setSandboxEndpoint] = useState('/api/v1/customers');
  const [sandboxResult, setSandboxResult] = useState<any>(null);
  const [isTestingSandbox, setIsTestingSandbox] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [kRes, wRes, lRes] = await Promise.all([
        api.getDeveloperKeys(),
        api.getDeveloperWebhooks(),
        api.getDeveloperLogs(),
      ]);

      if (kRes.success) setKeys(kRes.keys || []);
      if (wRes.success) setWebhooks(wRes.webhooks || []);
      if (lRes.success) setLogs(lRes.logs || []);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.createDeveloperKey({
        name: keyForm.name || 'Yeni API Anahtarı',
        isSandbox: keyForm.isSandbox,
        rateLimitTier: keyForm.rateLimitTier,
        scopes: ['customers.read', 'customers.write', 'invoices.read', 'invoices.write'],
      });

      if (res.success) {
        setIsKeyModalOpen(false);
        setRevealedSecret(res.plainSecretKey);
        loadData();
      }
    } catch (err: any) {
      showToast(err.message || 'API anahtarı oluşturulamadı.', 'error');
    }
  };

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webhookUrl) return;
    try {
      const res = await api.createDeveloperWebhook({
        url: webhookUrl,
        events: ['invoice.created', 'payment.received', 'customer.created'],
      });
      if (res.success) {
        showToast('Webhook aboneliği oluşturuldu.', 'success');
        setIsWebhookModalOpen(false);
        setWebhookUrl('');
        loadData();
      }
    } catch (err: any) {
      showToast(err.message || 'Webhook oluşturulamadı.', 'error');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('Panoya kopyalandı.', 'success');
  };

  const runSandboxTest = async () => {
    setIsTestingSandbox(true);
    try {
      // Simüle Sandbox API çağrısı
      await new Promise(r => setTimeout(r, 400));
      setSandboxResult({
        status: 200,
        latency: '34ms',
        environment: 'SANDBOX (Isolated Memory State)',
        response: {
          success: true,
          count: 3,
          data: [
            { id: 'sb-cust-1', title: 'Demo Sanal Test Müşteri Ltd.', balance: 14500 },
            { id: 'sb-cust-2', title: 'Test Perakende Ticaret A.Ş.', balance: 0 },
          ],
        },
      });
    } finally {
      setIsTestingSandbox(false);
    }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '46px', height: '46px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Code size={26} color="var(--primary)" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, margin: 0 }}>
                  Geliştirici & API Platformu
                </h1>
                {/* 2026-09-13: Koyu tema rozeti açık tema "badge-info" sınıfına çevrildi. */}
                <span className="badge badge-info" style={{ fontSize: 'var(--fs-xs, 11px)', fontWeight: 700 }}>
                  REST API v1 / v2
                </span>
              </div>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-base, 13px)' }}>
                API anahtarları, Scopes, Webhook tetikleyicileri ve izole Sandbox test ortamı
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setIsKeyModalOpen(true)}
              style={{ padding: '10px 18px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Key size={16} />
              <span>+ Yeni API Anahtarı</span>
            </button>
          </div>
        </div>

        {/* Tab Menüsü */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', marginBottom: '20px' }}>
          {[
            { id: 'keys', label: `API Anahtarları (${keys.length})`, icon: Key },
            { id: 'webhooks', label: `Webhooks (${webhooks.length})`, icon: Webhook },
            { id: 'sandbox', label: 'Sandbox Test Ortamı', icon: Terminal },
            { id: 'logs', label: `API İstek Logları (${logs.length})`, icon: Code },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              style={{
                padding: '12px 18px',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === t.id ? '2px solid var(--info)' : '2px solid transparent',
                color: activeTab === t.id ? 'var(--info)' : 'var(--text-muted)',
                fontWeight: activeTab === t.id ? 700 : 500,
                fontSize: 'var(--fs-base, 13px)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <t.icon size={16} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* ── 1. SEKME: API ANAHTARLARI ── */}
        {activeTab === 'keys' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {keys.length === 0 ? (
              <div style={{ background: 'var(--bg-surface)', padding: '40px', borderRadius: 'var(--radius-md, 8px)', textAlign: 'center', color: 'var(--text-muted)' }}>
                Henüz oluşturulmuş bir API anahtarı bulunmuyor.
              </div>
            ) : (
              keys.map(k => (
                <div
                  key={k.id}
                  style={{
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius-md, 8px)',
                    border: '1px solid var(--border-color)',
                    padding: '18px 20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className={k.keyPrefix.includes('test') ? 'badge badge-warning' : 'badge badge-info'} style={{ fontSize: 'var(--fs-xs, 11px)', fontWeight: 700 }}>
                        {k.keyPrefix.includes('test') ? 'SANDBOX' : 'PRODUCTION'}
                      </span>
                      <h4 style={{ margin: 0, fontSize: 'var(--fs-base, 13px)', fontWeight: 700, color: 'var(--text-main)' }}>{k.name}</h4>
                    </div>
                    <div style={{ fontFamily: 'monospace', color: 'var(--info)', fontSize: 'var(--fs-sm, 12px)', marginTop: '6px' }}>
                      {k.keyPrefix}••••••••••••••••••••••••
                    </div>
                    <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Tier: <b>{k.rateLimitTier}</b> | Yetkiler: {k.scopes.join(', ')} | Oluşturulma: {new Date(k.createdAt).toLocaleDateString('tr-TR')}
                    </div>
                  </div>

                  <span className="badge badge-success" style={{ fontSize: 'var(--fs-xs, 11px)', fontWeight: 700 }}>
                    Aktif
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── 2. SEKME: WEBHOOKS ── */}
        {activeTab === 'webhooks' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
              <button
                onClick={() => setIsWebhookModalOpen(true)}
                style={{ padding: '8px 16px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, cursor: 'pointer' }}
              >
                + Yeni Webhook Ekle
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {webhooks.map(w => (
                <div
                  key={w.id}
                  style={{
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius-md, 8px)',
                    border: '1px solid var(--border-color)',
                    padding: '18px 20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontFamily: 'monospace', color: 'var(--info)', fontSize: 'var(--fs-base, 13px)', fontWeight: 700 }}>
                      {w.url}
                    </div>
                    <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Dinlenen Olaylar: <b>{w.events.join(', ')}</b>
                    </div>
                  </div>
                  <span className="badge badge-success" style={{ fontSize: 'var(--fs-xs, 11px)', fontWeight: 700 }}>
                    Aktif
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 3. SEKME: SANDBOX RUNNER ── */}
        {activeTab === 'sandbox' && (
          <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>İzole Sandbox Test Konsolu</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-base, 13px)', margin: '0 0 16px' }}>
              Canlı veritabanınızı etkilemeden güvenli ortamda API istekleri gönderin ve JSON çıktılarını simüle edin.
            </p>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
              <span style={{ padding: '10px 14px', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--success)', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)' }}>GET</span>
              <input
                type="text"
                value={sandboxEndpoint}
                onChange={e => setSandboxEndpoint(e.target.value)}
                style={{ flex: 1, padding: '10px 14px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-sm, 12px)', fontFamily: 'monospace' }}
              />
              <button
                onClick={runSandboxTest}
                disabled={isTestingSandbox}
                style={{ padding: '0 20px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Play size={16} />
                <span>{isTestingSandbox ? 'Çalışıyor...' : 'İsteği Çalıştır'}</span>
              </button>
            </div>

            {sandboxResult && (
              <div style={{ background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md, 8px)', padding: '16px', border: '1px solid var(--border-color)', fontFamily: 'monospace', fontSize: 'var(--fs-sm, 12px)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: 'var(--success)', fontWeight: 700 }}>
                  <span>Status: {sandboxResult.status} OK</span>
                  <span>Latency: {sandboxResult.latency}</span>
                </div>
                <pre style={{ margin: 0, color: 'var(--info)', overflowX: 'auto' }}>
                  {JSON.stringify(sandboxResult.response, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* ── 4. SEKME: API LOGLARI ── */}
        {activeTab === 'logs' && (
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm, 12px)', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface-secondary)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '14px 18px' }}>Metot & Endpoint</th>
                  <th style={{ padding: '14px 18px' }}>Durum</th>
                  <th style={{ padding: '14px 18px' }}>Gecikme</th>
                  <th style={{ padding: '14px 18px' }}>IP Adresi</th>
                  <th style={{ padding: '14px 18px' }}>Tarih</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Henüz kaydedilmiş API isteği bulunmuyor.
                    </td>
                  </tr>
                ) : (
                  logs.map(l => (
                    <tr key={l.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '14px 18px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--info)' }}>
                        {l.method} {l.endpoint}
                      </td>
                      <td style={{ padding: '14px 18px', color: l.httpStatus === 200 ? 'var(--success-text)' : 'var(--danger-text)', fontWeight: 700 }}>
                        {l.httpStatus}
                      </td>
                      <td style={{ padding: '14px 18px' }}>{l.latencyMs}ms</td>
                      <td style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>{l.ipAddress}</td>
                      <td style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>{new Date(l.createdAt).toLocaleTimeString('tr-TR')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Secret Revealed Modal */}
      {revealedSecret && (
        <div className="modal-overlay" style={{ zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10, 15, 30, 0.55)' }}>
          <div style={{ width: '90vw', maxWidth: '520px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '24px', color: 'var(--text-main)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--success-text)' }}>
              API Anahtarınız Hazır!
            </h3>
            <p style={{ fontSize: 'var(--fs-base, 13px)', color: 'var(--warning-text)', margin: '0 0 14px' }}>
              Bu gizli anahtar (secret key) güvenlik nedeniyle sadece <b>1 kez</b> gösterilecektir. Lütfen güvenli bir yere kaydediniz.
            </p>

            <div style={{ background: 'var(--bg-surface-secondary)', padding: '14px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', fontFamily: 'monospace', color: 'var(--info)', fontSize: 'var(--fs-sm, 12px)', wordBreak: 'break-all', marginBottom: '16px' }}>
              {revealedSecret}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => copyToClipboard(revealedSecret)}
                style={{ padding: '8px 16px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Copy size={14} />
                <span>Kopyala</span>
              </button>
              <button
                onClick={() => setRevealedSecret(null)}
                style={{ padding: '8px 16px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', cursor: 'pointer' }}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Key Modal */}
      {isKeyModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10, 15, 30, 0.55)' }}>
          <div style={{ width: '90vw', maxWidth: '440px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '24px', color: 'var(--text-main)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Yeni API Anahtarı Oluştur</h3>
              <button onClick={() => setIsKeyModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateKey} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Uygulama / Anahtar Adı</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: E-Ticaret Entegrasyonu"
                  value={keyForm.name}
                  onChange={e => setKeyForm({ ...keyForm, name: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-sm, 12px)' }}
                />
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-main)', cursor: 'pointer', marginTop: '6px' }}>
                  <input
                    type="checkbox"
                    checked={keyForm.isSandbox}
                    onChange={e => setKeyForm({ ...keyForm, isSandbox: e.target.checked })}
                  />
                  <span>Sandbox (Test Ortamı) Anahtarı Olsun</span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setIsKeyModalOpen(false)} style={{ padding: '8px 16px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', cursor: 'pointer' }}>
                  İptal
                </button>
                <button type="submit" style={{ padding: '8px 20px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                  Oluştur
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Webhook Modal */}
      {isWebhookModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10, 15, 30, 0.55)' }}>
          <div style={{ width: '90vw', maxWidth: '440px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '24px', color: 'var(--text-main)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Yeni Webhook URL Kaydet</h3>
            <form onSubmit={handleCreateWebhook} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="url"
                required
                placeholder="https://siteniz.com/api/isbey-webhook"
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-sm, 12px)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button type="button" onClick={() => setIsWebhookModalOpen(false)} style={{ padding: '8px 16px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', cursor: 'pointer' }}>
                  İptal
                </button>
                <button type="submit" style={{ padding: '8px 20px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
