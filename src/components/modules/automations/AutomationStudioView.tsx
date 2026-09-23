import React, { useState, useEffect } from 'react';
import {
  Zap,
  Plus,
  Play,
  CheckCircle2,
  AlertCircle,
  Webhook,
  Bell,
  Clock,
  Send,
  Shield,
  Layers,
  ArrowRight,
  X,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import type { AutomationRule, AutomationRun, WebhookEndpoint } from '../../../types';

export const AutomationStudioView: React.FC = () => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'rules' | 'runs' | 'webhooks'>('rules');
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // New Rule Modal
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [newRule, setNewRule] = useState({
    name: '',
    description: '',
    triggerEvent: 'INVOICE_OVERDUE',
    actionType: 'SEND_NOTIFICATION',
    actionConfig: { title: 'Otomasyon Bildirimi' },
  });

  // New Webhook Modal
  const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);
  const [newWebhookUrl, setNewWebhookUrl] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [rRes, runRes, wRes] = await Promise.all([
        api.getAutomationRules(),
        api.getAutomationRuns(),
        api.getWebhookEndpoints(),
      ]);

      if (rRes.success) setRules(rRes.rules || []);
      if (runRes.success) setRuns(runRes.runs || []);
      if (wRes.success) setWebhooks(wRes.webhooks || []);
    } catch (err: any) {
      showToast(err.message || 'Otomasyon verileri yüklenemedi.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRule.name) return;

    try {
      const res = await api.createAutomationRule({
        ...newRule,
        conditions: [{ field: 'overdueDays', operator: 'GREATER_THAN', value: 7 }],
      });
      if (res.success) {
        showToast(res.message, 'success');
        setIsRuleModalOpen(false);
        loadData();
      }
    } catch (err: any) {
      showToast(err.message || 'Kural oluşturulamadı.', 'error');
    }
  };

  const handleTestTrigger = async (triggerEvent: string) => {
    try {
      const res = await api.testTriggerAutomation({
        triggerEvent,
        payload: { overdueDays: 14, message: 'Test tetikleyici çalıştırıldı.' },
      });
      if (res.success) {
        showToast(res.message, 'success');
        loadData();
      }
    } catch (err: any) {
      showToast(err.message || 'Test başarısız.', 'error');
    }
  };

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWebhookUrl) return;

    try {
      const res = await api.createWebhookEndpoint({ url: newWebhookUrl });
      if (res.success) {
        showToast(res.message, 'success');
        setIsWebhookModalOpen(false);
        setNewWebhookUrl('');
        loadData();
      }
    } catch (err: any) {
      showToast(err.message || 'Webhook oluşturulamadı.', 'error');
    }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={24} color="var(--primary)" />
            </div>
            <div>
              <h1 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, margin: 0 }}>
                Otomasyon Stüdyosu & Webhooks
              </h1>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>
                Finansal olay tetikleyicileri (Vade, Stok, Banka), kural zincirleri ve HMAC imzalı Webhook entegrasyonu
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => handleTestTrigger('INVOICE_OVERDUE')}
              style={{ padding: '10px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--info)', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Play size={16} />
              <span>Test Olayı Tetikle</span>
            </button>
            <button
              onClick={() => setIsRuleModalOpen(true)}
              style={{ padding: '10px 18px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Plus size={18} />
              <span>Yeni Kural Tanımla</span>
            </button>
          </div>
        </div>

        {/* Tab Menüsü */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', marginBottom: '24px' }}>
          {[
            { id: 'rules', label: `Otomasyon Kuralları (${rules.length})`, icon: Zap },
            { id: 'runs', label: `Çalışma Günlüğü (${runs.length})`, icon: Clock },
            { id: 'webhooks', label: `Webhooks (${webhooks.length})`, icon: Webhook },
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

        {/* ── 1. SEKME: KURALLAR ── */}
        {activeTab === 'rules' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {rules.map(r => (
              <div key={r.id} style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: 'var(--fs-md, 14px)', fontWeight: 700, color: 'var(--text-main)' }}>{r.name}</h4>
                    <span className="badge badge-success">
                      Aktif
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>{r.description}</p>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px', fontSize: 'var(--fs-xs, 11px)' }}>
                    <span style={{ background: 'var(--bg-surface-secondary)', padding: '3px 8px', borderRadius: 'var(--radius-xs, 4px)', color: 'var(--info)' }}>Tetikleyici: {r.triggerEvent}</span>
                    <span style={{ background: 'var(--bg-surface-secondary)', padding: '3px 8px', borderRadius: 'var(--radius-xs, 4px)', color: 'var(--success-text)' }}>Eylem: {r.actionType}</span>
                  </div>
                </div>

                <button
                  onClick={() => handleTestTrigger(r.triggerEvent)}
                  className="btn btn-secondary"
                  style={{ padding: '8px 14px', borderRadius: 'var(--radius-sm, 6px)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Play size={14} />
                  <span>Çalıştır</span>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── 2. SEKME: ÇALIŞMA GÜNLÜĞÜ ── */}
        {activeTab === 'runs' && (
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-base, 13px)', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface-secondary)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '12px 18px' }}>Zaman</th>
                  <th style={{ padding: '12px 18px' }}>Kural Adı</th>
                  <th style={{ padding: '12px 18px' }}>Tetikleyici Olay</th>
                  <th style={{ padding: '12px 18px' }}>İşlenen Eylem</th>
                  <th style={{ padding: '12px 18px' }}>Durum</th>
                </tr>
              </thead>
              <tbody>
                {runs.map(run => (
                  <tr key={run.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '12px 18px', color: 'var(--text-muted)' }}>
                      {new Date(run.executedAt).toLocaleString('tr-TR')}
                    </td>
                    <td style={{ padding: '12px 18px', fontWeight: 700 }}>{run.ruleName}</td>
                    <td style={{ padding: '12px 18px', color: 'var(--info)' }}>{run.triggerEvent}</td>
                    <td style={{ padding: '12px 18px', color: 'var(--text-main)' }}>{run.actionExecuted}</td>
                    <td style={{ padding: '12px 18px' }}>
                      <span className={run.status === 'SUCCESS' ? 'badge badge-success' : 'badge badge-danger'}>
                        {run.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── 3. SEKME: WEBHOOKS ── */}
        {activeTab === 'webhooks' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
              <button
                onClick={() => setIsWebhookModalOpen(true)}
                style={{ padding: '8px 16px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer' }}
              >
                Yeni Webhook Ekle
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {webhooks.map(w => (
                <div key={w.id} style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontFamily: 'monospace', fontSize: 'var(--fs-md, 14px)', fontWeight: 700, color: 'var(--info)' }}>
                      {w.url}
                    </div>
                    <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '4px' }}>
                      HMAC Gizli Anahtar: •••••••••••••••• | Olaylar: {w.events.join(', ')}
                    </div>
                  </div>

                  <span className="badge badge-success">
                    Aktif
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* New Rule Modal */}
      {isRuleModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div style={{ width: '90vw', maxWidth: '480px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '24px', color: 'var(--text-main)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Yeni Otomasyon Kuralı</h3>
              <button onClick={() => setIsRuleModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateRule} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Kural Adı</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: Vadesi Geçen Alacak Hatırlatması"
                  value={newRule.name}
                  onChange={e => setNewRule({ ...newRule, name: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Tetikleyici Olay (WHEN)</label>
                <select
                  value={newRule.triggerEvent}
                  onChange={e => setNewRule({ ...newRule, triggerEvent: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                >
                  <option value="INVOICE_OVERDUE">Fatura Vadesi Geçtiğinde</option>
                  <option value="PAYMENT_RECEIVED">Tahsilat Alındığında</option>
                  <option value="STOCK_LOW">Kritik Stok Seviyesinde</option>
                  <option value="BANK_TX_UNMATCHED">Banka Eşleşmesi Beklendiğinde</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Yürütülecek Eylem (THEN)</label>
                <select
                  value={newRule.actionType}
                  onChange={e => setNewRule({ ...newRule, actionType: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                >
                  <option value="SEND_NOTIFICATION">Sistem & Push Bildirimi Gönder</option>
                  <option value="TRIGGER_WEBHOOK">Webhook URL Tetikle (JSON)</option>
                  <option value="CREATE_TASK">Görev / Not Oluştur</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsRuleModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm, 6px)', cursor: 'pointer' }}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 20px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                  Kuralı Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Webhook Modal */}
      {isWebhookModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div style={{ width: '90vw', maxWidth: '480px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '24px', color: 'var(--text-main)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Yeni Webhook Uç Noktası</h3>
              <button onClick={() => setIsWebhookModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateWebhook} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Hedef Webhook URL (HTTPS)</label>
                <input
                  type="url"
                  required
                  placeholder="https://api.yourdomain.com/webhooks/isbey"
                  value={newWebhookUrl}
                  onChange={e => setNewWebhookUrl(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsWebhookModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm, 6px)', cursor: 'pointer' }}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 20px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
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
