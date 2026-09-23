import React, { useState, useEffect } from 'react';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  ShieldCheck,
  DollarSign,
  Layers,
  ArrowRight,
  Filter,
  Plus,
  X,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import type { ApprovalRequest, ApprovalRule } from '../../../types';

export const ApprovalCenterView: React.FC = () => {
  const { showToast } = useToast();
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [rules, setRules] = useState<ApprovalRule[]>([]);
  const [activeTab, setActiveTab] = useState<'requests' | 'rules'>('requests');
  const [isLoading, setIsLoading] = useState(true);

  // Reject Modal
  const [rejectModalId, setRejectModalId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Create Request Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newRequestForm, setNewRequestForm] = useState({
    entityType: 'EXPENSE',
    documentNo: 'GID-2026-0099',
    title: 'Yeni Ofis Donanım Satın Alma',
    amount: 18500,
    currency: 'TRY',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [reqRes, ruleRes] = await Promise.all([
        api.getApprovalRequests(),
        api.getApprovalRules(),
      ]);

      if (reqRes.success) setRequests(reqRes.requests || []);
      if (ruleRes.success) setRules(ruleRes.rules || []);
    } catch (err: any) {
      showToast(err.message || 'Onay verileri yüklenemedi.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDecision = async (id: string, decision: 'APPROVE' | 'REJECT', reason?: string) => {
    try {
      const res = await api.processApprovalDecision(id, {
        decision,
        rejectReason: reason,
      });

      if (res.success) {
        showToast(res.message, 'success');
        setRejectModalId(null);
        setRejectReason('');
        loadData();
      }
    } catch (err: any) {
      showToast(err.message || 'Onay kararı işlenemedi.', 'error');
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.createApprovalRequest(newRequestForm);
      if (res.success) {
        showToast(res.message, 'success');
        setIsCreateModalOpen(false);
        loadData();
      }
    } catch (err: any) {
      showToast(err.message || 'Onay talebi oluşturulamadı.', 'error');
    }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={24} color="var(--primary)" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, margin: 0 }}>
                  Onay Merkezi & Tutar Kuralları
                </h1>
                <span className="badge badge-warning">
                  Kademeli Onay
                </span>
              </div>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>
                0-5.000 TL (Yönetici), 5.001-50.000 TL (Genel Müdür), &gt;50.000 TL (Firma Sahibi) harcama limitleri
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            style={{ padding: '10px 18px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={18} />
            <span>Yeni Onay Talebi</span>
          </button>
        </div>

        {/* Tab Menüsü */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', marginBottom: '20px' }}>
          <button
            onClick={() => setActiveTab('requests')}
            style={{
              padding: '12px 18px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'requests' ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === 'requests' ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: activeTab === 'requests' ? 700 : 500,
              fontSize: 'var(--fs-base, 13px)',
              cursor: 'pointer',
            }}
          >
            Bekleyen & İşlenen Onaylar ({requests.length})
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            style={{
              padding: '12px 18px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'rules' ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === 'rules' ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: activeTab === 'rules' ? 700 : 500,
              fontSize: 'var(--fs-base, 13px)',
              cursor: 'pointer',
            }}
          >
            Tutar Kademeli Onay Kuralları ({rules.length})
          </button>
        </div>

        {/* ── 1. SEKME: ONAY TALEPLERİ ── */}
        {activeTab === 'requests' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {requests.length === 0 ? (
              <div style={{ background: 'var(--bg-surface)', padding: '40px', borderRadius: 'var(--radius-md, 8px)', textAlign: 'center', color: 'var(--text-muted)' }}>
                Onay bekleyen finansal işlem bulunmuyor.
              </div>
            ) : (
              requests.map(req => (
                <div
                  key={req.id}
                  style={{
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius-md, 8px)',
                    border: '1px solid var(--border-color)',
                    padding: '18px 20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '16px',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="badge badge-info">
                        {req.entityType}
                      </span>
                      <h4 style={{ margin: 0, fontSize: 'var(--fs-md, 14px)', fontWeight: 700, color: 'var(--text-main)' }}>
                        {req.title} ({req.documentNo})
                      </h4>
                      <span className={
                        req.status === 'APPROVED' ? 'badge badge-success' :
                        req.status === 'REJECTED' ? 'badge badge-danger' :
                        'badge badge-warning'
                      }>
                        {req.status}
                      </span>
                    </div>

                    <div style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--success-text)', marginTop: '6px' }}>
                      {req.amount.toLocaleString('tr-TR')} {req.currency}
                    </div>

                    <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Talep Eden: {req.requestedByName} | Gerekli Rol: <b>{req.requiredRole}</b> | Tarih: {new Date(req.createdAt).toLocaleString('tr-TR')}
                    </div>
                  </div>

                  {req.status === 'PENDING' ? (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleDecision(req.id, 'APPROVE')}
                        style={{ padding: '8px 16px', background: 'var(--success)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <CheckCircle size={14} />
                        <span>Onayla</span>
                      </button>
                      <button
                        onClick={() => setRejectModalId(req.id)}
                        style={{ padding: '8px 16px', background: 'var(--danger)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <XCircle size={14} />
                        <span>Reddet</span>
                      </button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 'var(--fs-sm, 12px)', color: req.status === 'APPROVED' ? 'var(--success-text)' : 'var(--danger-text)', fontWeight: 700 }}>
                      {req.status === 'APPROVED' ? `Onaylandı (${req.approverName})` : `Reddedildi (${req.rejectReason || 'Açıklamasız'})`}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── 2. SEKME: ONAY KURALLARI ── */}
        {activeTab === 'rules' && (
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-base, 13px)', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface-secondary)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '14px 18px' }}>Belge Türü</th>
                  <th style={{ padding: '14px 18px' }}>Tutar Aralığı</th>
                  <th style={{ padding: '14px 18px' }}>Gerekli Onay Yetkilisi</th>
                  <th style={{ padding: '14px 18px' }}>Onay Sırası</th>
                  <th style={{ padding: '14px 18px' }}>Durum</th>
                </tr>
              </thead>
              <tbody>
                {rules.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--info)' }}>{r.documentType}</td>
                    <td style={{ padding: '14px 18px', fontWeight: 700 }}>
                      {r.minAmount.toLocaleString('tr-TR')} TL — {r.maxAmount >= 999999 ? 'Limitsiz' : `${r.maxAmount.toLocaleString('tr-TR')} TL`}
                    </td>
                    <td style={{ padding: '14px 18px', color: 'var(--warning-text)', fontWeight: 700 }}>{r.approverRole}</td>
                    <td style={{ padding: '14px 18px' }}>{r.approvalOrder}. Aşama</td>
                    <td style={{ padding: '14px 18px' }}>
                      <span className="badge badge-success">
                        Aktif
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {rejectModalId && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div style={{ width: '90vw', maxWidth: '440px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '24px', color: 'var(--text-main)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Talebi Reddet</h3>
            <p style={{ margin: '0 0 14px', fontSize: 'var(--fs-base, 13px)', color: 'var(--text-muted)' }}>Lütfen ret gerekçesini belirtiniz:</p>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Örn: Bütçe aşımı veya eksik fatura faturası."
              style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)', marginBottom: '14px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setRejectModalId(null)} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm, 6px)', cursor: 'pointer' }}>
                İptal
              </button>
              <button onClick={() => handleDecision(rejectModalId, 'REJECT', rejectReason)} style={{ padding: '8px 20px', background: 'var(--danger)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                Reddet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {isCreateModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div style={{ width: '90vw', maxWidth: '480px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '24px', color: 'var(--text-main)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Yeni Onay Talebi Oluştur</h3>
              <button onClick={() => setIsCreateModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateRequest} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Belge Başlığı</label>
                <input
                  type="text"
                  required
                  value={newRequestForm.title}
                  onChange={e => setNewRequestForm({ ...newRequestForm, title: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Belge Türü</label>
                  <select
                    value={newRequestForm.entityType}
                    onChange={e => setNewRequestForm({ ...newRequestForm, entityType: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                  >
                    <option value="EXPENSE">Gider / Harcama</option>
                    <option value="INVOICE">Fatura</option>
                    <option value="PURCHASE_ORDER">Satın Alma Siparişi</option>
                    <option value="PAYMENT">Tedarikçi Ödemesi</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Tutar (TL)</label>
                  <input
                    type="number"
                    required
                    value={newRequestForm.amount}
                    onChange={e => setNewRequestForm({ ...newRequestForm, amount: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm, 6px)', cursor: 'pointer' }}>
                  İptal
                </button>
                <button type="submit" style={{ padding: '8px 20px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                  Talebi Gönder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
