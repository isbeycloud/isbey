import React, { useState, useEffect } from 'react';
import { Clock, RefreshCw } from 'lucide-react';
import { api } from '../../../services/api';
import type { ActivityLog } from '../../../types';

/**
 * Aktivite Akışı / Denetim Günlüğü.
 *
 * 2026-09-13 (tasarım düzeltmesi): Ekran, açık temalı ERP kabuğunun İÇİNDE
 * tam sayfa KOYU (#0b1120) bir uygulama gibi çiziliyordu. Diğer tüm modüller
 * açık yüzeydeyken bu ekran "başka bir program" gibi görünüyordu; kenar
 * çubuğu açık, içerik gece yarısı siyahıydı. Ayrıca başlıktaki 46px gradyan
 * ikon kutusu ve "glow" gölge, istenmeyen AI-dashboard estetiğinin en tipik
 * örneğiydi. Ekran tasarım sistemine (token'lar + sade başlık) çevrildi.
 *
 * NOT: `useToast` daha önce içe aktarılmış ama hiç kullanılmamıştı; kaldırıldı.
 */
export const ActivityAuditStreamView: React.FC = () => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const res = await api.getActivityLogs();
      if (res.success) setLogs(res.logs || []);
      else setLoadError(true);
    } catch {
      // KURAL: API hatasında sahte log gösterilmez; hata açıkça bildirilir.
      setLoadError(true);
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  };

  /** Eylem tipini anlamlı bir okunur etikete çevirir. */
  const actionLabel = (t: string) => {
    switch (t) {
      case 'CREATE': return 'Oluşturma';
      case 'APPROVE': return 'Onay';
      case 'REJECT': return 'Red';
      case 'UPDATE': return 'Güncelleme';
      case 'DELETE': return 'Silme';
      default: return t;
    }
  };

  /** Eylem tipine karşılık gelen badge sınıfı (renk yalnız anlam taşır). */
  const actionBadge = (t: string) => {
    switch (t) {
      case 'CREATE': return 'badge badge-success';
      case 'APPROVE': return 'badge badge-info';
      case 'REJECT': case 'DELETE': return 'badge badge-danger';
      default: return 'badge badge-secondary';
    }
  };

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1000px', margin: '0 auto' }}>
      {/* Başlık — ekranın ne olduğunu ve ne yaptığını tek satırda söyler. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '18px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Clock size={18} color="var(--text-muted)" />
          <div>
            <h1 style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 600, margin: 0, color: 'var(--text-main)' }}>
              Denetim Günlüğü
            </h1>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>
              Fatura, tahsilat, belge ve yetki değişikliklerinin zaman çizelgesi
            </p>
          </div>
        </div>

        <button className="btn btn-secondary btn-sm" onClick={loadLogs} disabled={isLoading}>
          <RefreshCw size={14} />
          <span>{isLoading ? 'Yükleniyor…' : 'Yenile'}</span>
        </button>
      </div>

      {loadError && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            marginBottom: '14px',
            background: 'var(--danger-bg)',
            border: '1px solid var(--danger-border)',
            borderRadius: 'var(--radius-sm, 6px)',
            color: 'var(--danger-text)',
            fontSize: 'var(--fs-sm, 12px)',
          }}
        >
          Denetim kayıtları alınamadı. Listelenen içerik eksik olabilir — sayfayı yenileyin.
        </div>
      )}

      <div className="m3-card" style={{ overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-light)', fontSize: 'var(--fs-sm, 12px)' }}>
            Kayıtlar yükleniyor…
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-light)', fontSize: 'var(--fs-sm, 12px)' }}>
            Henüz kayıtlı bir denetim günlüğü bulunmuyor.
          </div>
        ) : (
          logs.map(log => (
            <div
              key={log.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '16px',
                padding: '11px 16px',
                borderBottom: '1px solid var(--border-light)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                <span className={actionBadge(log.actionType)} style={{ flexShrink: 0 }}>
                  {actionLabel(log.actionType)}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 500,
                      fontSize: 'var(--fs-base, 13px)',
                      color: 'var(--text-main)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {log.title}
                  </div>
                  <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '1px' }}>
                    {log.userName} · {log.entityType}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-light)', flexShrink: 0 }}>
                {new Date(log.createdAt).toLocaleString('tr-TR')}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ActivityAuditStreamView;
