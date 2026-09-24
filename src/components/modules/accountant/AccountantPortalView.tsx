import React, { useState, useEffect } from 'react';
import {
  Briefcase,
  Building,
  FileCheck,
  AlertCircle,
  Plus,
  Calendar,
  Download,
  Mail,
  Phone,
  Send,
  Printer,
  CheckCircle2,
  Layers,
  X,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import type { AccountantClient, DocumentRequest } from '../../../types';

export const AccountantPortalView: React.FC = () => {
  const { showToast } = useToast();
  const { switchTenant, setActiveView, activeTenant } = useApp();
  const [clients, setClients] = useState<AccountantClient[]>([]);
  const [requests, setRequests] = useState<DocumentRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // New Request Modal
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [newRequest, setNewRequest] = useState({
    companyName: activeTenant?.name || '',
    documentType: 'BANK_STATEMENT',
    period: new Date().toISOString().slice(0, 7),
    description: '',
    dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  });

  // Monthly Report Modal
  const [selectedReport, setSelectedReport] = useState<any | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [cRes, rRes] = await Promise.all([
        api.getAccountantClients(),
        api.getAccountantDocumentRequests(),
      ]);

      if (cRes.success) setClients(cRes.clients || []);
      if (rRes.success) setRequests(rRes.requests || []);
    } catch (err: any) {
      showToast(err.message || 'Müşavir verileri yüklenemedi.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.createAccountantDocumentRequest(newRequest);
      if (res.success) {
        showToast(res.message, 'success');
        setIsRequestModalOpen(false);
        loadData();
      }
    } catch (err: any) {
      showToast(err.message || 'Evrak talebi iletilemedi.', 'error');
    }
  };

  const handleViewMonthlyReport = async (tenantId: string) => {
    try {
      const res = await api.getAccountantMonthlyReport(tenantId);
      if (res.success) {
        setSelectedReport(res.report);
      }
    } catch (err: any) {
      showToast(err.message || 'Kapanış raporu alınamadı.', 'error');
    }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Briefcase size={24} color="var(--primary)" />
            </div>
            <div>
              <h1 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, margin: 0 }}>
                Mali Müşavir & Denetim Portalı
              </h1>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>
                Mükellef işletmelerinizin mali kayıtlarını denetleyin, eksik evrak talep edin ve aylık kapanış raporları üretin
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsRequestModalOpen(true)}
            style={{ padding: '10px 18px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={18} />
            <span>Firmadan Evrak Talep Et</span>
          </button>
        </div>

        {/* Bağlı Mükellef Firmalar Tablosu */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', overflow: 'hidden', marginBottom: '24px' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
            <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Mükellef Portföyüm ({clients.length} İşletme)</h3>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-base, 13px)', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-secondary)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '14px 18px' }}>Firma Ünvanı</th>
                <th style={{ padding: '14px 18px' }}>VKN / Vergi Dairesi</th>
                <th style={{ padding: '14px 18px' }}>İletişim</th>
                <th style={{ padding: '14px 18px' }}>Eksik Evrak</th>
                <th style={{ padding: '14px 18px' }}>Eşleşmemiş Banka</th>
                <th style={{ padding: '14px 18px' }}>Durum</th>
                <th style={{ padding: '14px 18px' }}>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--text-main)' }}>
                    {c.companyName}
                  </td>
                  <td style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>
                    {c.taxNumber} ({c.taxOffice})
                  </td>
                  <td style={{ padding: '14px 18px', color: 'var(--text-main)' }}>
                    {c.contactEmail}
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <span className={c.missingDocumentsCount > 0 ? 'badge badge-danger' : 'badge badge-success'}>
                      {c.missingDocumentsCount} Beklenen Belge
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px', color: 'var(--warning-text)', fontWeight: 700 }}>
                    {c.unreconciledBankCount} Hareket
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <span className="badge badge-success">
                      {c.status}
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <button className="btn btn-secondary" onClick={async () => {
                      if (await switchTenant(c.tenantId)) setActiveView('muhasebe');
                      else showToast('Firma üyeliği aktif değil veya erişim yetkiniz kaldırılmış.', 'error');
                    }}>Firmaya geç / İşlem yap</button>
                    <button
                      onClick={() => handleViewMonthlyReport(c.tenantId)}
                      style={{ padding: '6px 12px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Aylık Kapanış Raporu
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Talep Edilen Evraklar Tablosu */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
            <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Evrak Talepleri & Teslim Durumu</h3>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-base, 13px)', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-secondary)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '12px 18px' }}>Talep Tarihi</th>
                <th style={{ padding: '12px 18px' }}>Firma</th>
                <th style={{ padding: '12px 18px' }}>İstenen Evrak Türü</th>
                <th style={{ padding: '12px 18px' }}>Dönem</th>
                <th style={{ padding: '12px 18px' }}>Açıklama</th>
                <th style={{ padding: '12px 18px' }}>Son Teslim</th>
                <th style={{ padding: '12px 18px' }}>Durum</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Aktif evrak talebi bulunmuyor.
                  </td>
                </tr>
              ) : (
                requests.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '12px 18px', color: 'var(--text-muted)' }}>
                      {new Date(r.createdAt).toLocaleDateString('tr-TR')}
                    </td>
                    <td style={{ padding: '12px 18px', fontWeight: 700 }}>{r.companyName}</td>
                    <td style={{ padding: '12px 18px' }}>
                      <span className="badge badge-secondary">
                        {r.documentType}
                      </span>
                    </td>
                    <td style={{ padding: '12px 18px', color: 'var(--info)' }}>{r.period}</td>
                    <td style={{ padding: '12px 18px', color: 'var(--text-main)' }}>{r.description}</td>
                    <td style={{ padding: '12px 18px', color: 'var(--warning-text)' }}>{r.dueDate}</td>
                    <td style={{ padding: '12px 18px' }}>
                      <span className="badge badge-warning">
                        {r.status === 'PENDING' ? 'YÜKLENMESİ BEKLENİYOR' : 'YÜKLENDİ'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Request Modal */}
      {isRequestModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div style={{ width: '90vw', maxWidth: '480px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '24px', color: 'var(--text-main)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Firmadan Evrak Talep Et</h3>
              <button onClick={() => setIsRequestModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateRequest} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Firma</label>
                <input
                  type="text"
                  value={newRequest.companyName}
                  disabled
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-muted)', fontSize: 'var(--fs-base, 13px)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>İstenen Evrak Türü</label>
                <select
                  value={newRequest.documentType}
                  onChange={e => setNewRequest({ ...newRequest, documentType: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                >
                  <option value="BANK_STATEMENT">Banka Ekstresi (PDF/Excel)</option>
                  <option value="INVOICE">Eksik Alış / Satış Faturaları</option>
                  <option value="RECEIPT">Kasa Fişleri & Gider Masraf Belgeleri</option>
                  <option value="CONTRACT">Sözleşme / Protokol</option>
                  <option value="OTHER">Diğer Resmi Evrak</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Dönem</label>
                  <input
                    type="text"
                    value={newRequest.period}
                    onChange={e => setNewRequest({ ...newRequest, period: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Son Teslim Tarihi</label>
                  <input
                    type="date"
                    value={newRequest.dueDate}
                    onChange={e => setNewRequest({ ...newRequest, dueDate: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Talep Açıklaması / Not</label>
                <textarea
                  rows={3}
                  required
                  value={newRequest.description}
                  onChange={e => setNewRequest({ ...newRequest, description: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsRequestModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm, 6px)', cursor: 'pointer' }}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 20px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                  Talebi İlet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Monthly Report Modal */}
      {selectedReport && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div style={{ width: '90vw', maxWidth: '640px', maxHeight: '90vh', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '24px', color: 'var(--text-main)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Aylık AI Muhasebe Kapanış Raporu</h3>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>{selectedReport.companyName} — {selectedReport.period}</p>
              </div>
              <button onClick={() => setSelectedReport(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
              <div style={{ background: 'var(--bg-surface-secondary)', padding: '14px', borderRadius: 'var(--radius-md, 8px)', fontSize: 'var(--fs-base, 13px)', color: 'var(--text-main)' }}>
                {selectedReport.summaryText}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ background: 'var(--bg-surface-secondary)', padding: '12px', borderRadius: 'var(--radius-md, 8px)' }}>
                  <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>Satış Faturaları:</div>
                  <div style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--success-text)' }}>{selectedReport.stats?.totalSalesAmount?.toLocaleString('tr-TR')} TL</div>
                  <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>{selectedReport.stats?.totalSalesInvoices} Fatura</div>
                </div>

                <div style={{ background: 'var(--bg-surface-secondary)', padding: '12px', borderRadius: 'var(--radius-md, 8px)' }}>
                  <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>Toplam Giderler:</div>
                  <div style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--danger-text)' }}>{selectedReport.stats?.totalExpenseAmount?.toLocaleString('tr-TR')} TL</div>
                  <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>{selectedReport.stats?.totalExpenseCount} Belge</div>
                </div>
              </div>

              <h4 style={{ margin: '8px 0 4px', fontSize: 'var(--fs-md, 14px)', fontWeight: 700, color: 'var(--warning-text)' }}>Denetim & Uyumsuzluk Maddeleri</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {(selectedReport.auditIssues || []).map((iss: any, idx: number) => (
                  <div key={idx} style={{ padding: '8px 12px', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-sm, 6px)', fontSize: 'var(--fs-sm, 12px)', borderLeft: '3px solid var(--warning)' }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{iss.title}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-xs, 11px)' }}>{iss.description}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => window.print()}
                className="btn btn-secondary"
                style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm, 6px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Printer size={16} />
                <span>Yazdır</span>
              </button>
              <button
                onClick={() => setSelectedReport(null)}
                style={{ padding: '8px 20px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
