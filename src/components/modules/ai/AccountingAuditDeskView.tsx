import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Filter,
  ArrowRight,
  RefreshCw,
  FileText,
  Building,
  DollarSign,
  Landmark,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import type { AuditDeskIssue } from '../../../types';

export const AccountingAuditDeskView: React.FC = () => {
  const { showToast } = useToast();
  const { setActiveView } = useApp();
  const [issues, setIssues] = useState<AuditDeskIssue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPriority, setSelectedPriority] = useState<string>('ALL');

  useEffect(() => {
    loadIssues();
  }, []);

  const loadIssues = async () => {
    setIsLoading(true);
    try {
      const res = await api.getAccountingAuditDesk();
      if (res.success) setIssues(res.issues || []);
    } catch (err: any) {
      showToast(err.message || 'Denetim kayıtları yüklenemedi.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = (issue: AuditDeskIssue) => {
    if (issue.category === 'UNMATCHED_BANK') {
      setActiveView('banka-mutabakat');
    } else if (issue.category === 'MISSING_VKN') {
      setActiveView('cari');
    } else {
      setActiveView('satis');
    }
  };

  const filtered = issues.filter(i => selectedPriority === 'ALL' || i.priority === selectedPriority);

  const criticalCount = issues.filter(i => i.priority === 'CRITICAL').length;
  const highCount = issues.filter(i => i.priority === 'HIGH').length;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldAlert size={24} color="var(--primary)" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, margin: 0 }}>
                  Muhasebe Kontrol Masası & Anomali Denetimi
                </h1>
                <span className="badge badge-danger">
                  {issues.length} Tespit
                </span>
              </div>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>
                KDV uyumsuzlukları, mükerrer faturalar, eksik VKN/TCKN ve şüpheli işlemler otomatik taranır
              </p>
            </div>
          </div>

          <button
            onClick={loadIssues}
            style={{ padding: '10px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--fs-sm, 12px)' }}
          >
            <RefreshCw size={16} />
            <span>Yeniden Tara</span>
          </button>
        </div>

        {/* Durum Özeti Kartları */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ background: 'var(--bg-surface)', padding: '18px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 600 }}>Kritik Seviye Uyuşmazlık</div>
            <div style={{ fontSize: 'var(--fs-2xl, 26px)', fontWeight: 700, color: 'var(--danger-text)', marginTop: '4px' }}>
              {criticalCount}
            </div>
            <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '2px' }}>KDV / Matrah tutarsızlıkları</div>
          </div>

          <div style={{ background: 'var(--bg-surface)', padding: '18px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 600 }}>Yüksek Öncelikli Şüphe</div>
            <div style={{ fontSize: 'var(--fs-2xl, 26px)', fontWeight: 700, color: 'var(--warning-text)', marginTop: '4px' }}>
              {highCount}
            </div>
            <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '2px' }}>Mükerrer veya olağandışı tutar</div>
          </div>

          <div style={{ background: 'var(--bg-surface)', padding: '18px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 600 }}>Toplam Denetim Uyarısı</div>
            <div style={{ fontSize: 'var(--fs-2xl, 26px)', fontWeight: 700, color: 'var(--info)', marginTop: '4px' }}>
              {issues.length}
            </div>
            <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '2px' }}>Otomatik kural motoru taraması</div>
          </div>
        </div>

        {/* Filtre */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM'].map(p => (
            <button
              key={p}
              onClick={() => setSelectedPriority(p)}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-sm, 6px)',
                border: selectedPriority === p ? 'none' : '1px solid var(--border-color)',
                background: selectedPriority === p ? 'var(--primary)' : 'var(--bg-surface)',
                color: selectedPriority === p ? '#fff' : 'var(--text-muted)',
                fontSize: 'var(--fs-sm, 12px)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {p === 'ALL' ? 'Tüm Tespitler' : p === 'CRITICAL' ? 'Kritik' : p === 'HIGH' ? 'Yüksek' : 'Orta'}
            </button>
          ))}
        </div>

        {/* Tespitler Listesi */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filtered.length === 0 ? (
            <div style={{ background: 'var(--bg-surface)', padding: '40px', borderRadius: 'var(--radius-md, 8px)', textAlign: 'center', color: 'var(--success)' }}>
              <CheckCircle2 size={40} style={{ margin: '0 auto 12px' }} />
              <h3 style={{ margin: '0 0 6px', fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Tebrikler! Her Şey Yolunda</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-base, 13px)', margin: 0 }}>Seçilen filtrede herhangi bir muhasebe veya KDV uyuşmazlığı bulunamadı.</p>
            </div>
          ) : (
            filtered.map(issue => (
              <div
                key={issue.id}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: 'var(--radius-sm, 6px)',
                    background:
                      issue.priority === 'CRITICAL'
                        ? 'var(--danger-bg)'
                        : issue.priority === 'HIGH'
                        ? 'var(--warning-bg)'
                        : 'var(--info-bg)',
                    color:
                      issue.priority === 'CRITICAL'
                        ? 'var(--danger)'
                        : issue.priority === 'HIGH'
                        ? 'var(--warning)'
                        : 'var(--info)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <AlertTriangle size={20} />
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h4 style={{ margin: 0, fontSize: 'var(--fs-base, 13px)', fontWeight: 700, color: 'var(--text-main)' }}>
                        {issue.title}
                      </h4>
                      <span className={
                        issue.priority === 'CRITICAL'
                          ? 'badge badge-danger'
                          : issue.priority === 'HIGH'
                          ? 'badge badge-warning'
                          : 'badge badge-info'
                      }>
                        {issue.priority}
                      </span>
                    </div>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>
                      {issue.description}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleAction(issue)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-sm, 6px)',
                    background: 'var(--primary)',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 'var(--fs-sm, 12px)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span>{issue.actionLabel}</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
