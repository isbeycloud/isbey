import React, { useState } from 'react';
import {
  Calendar,
  FileCheck2,
  TrendingDown,
  TrendingUp,
  AlertCircle,
  Clock,
  CheckCircle2,
  Download,
} from 'lucide-react';

export const VergiBeyannameView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'kdv' | 'muhtasar' | 'takvim'>('kdv');

  const taxCalendar = [
    { title: 'KDV-1 Beyannamesi (Ağustos 2026)', deadline: '28.09.2026', status: 'HAZIR', daysLeft: 26 },
    { title: 'Muhtasar ve Prim Hizmet Beyannamesi', deadline: '26.09.2026', status: 'BEKLİYOR', daysLeft: 24 },
    { title: 'Geçici Vergi 3. Dönem', deadline: '17.11.2026', status: 'BEKLİYOR', daysLeft: 76 },
    { title: 'Damga Vergisi Beyannamesi', deadline: '26.09.2026', status: 'HAZIR', daysLeft: 24 },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-surface-secondary)', color: 'var(--text-main)' }}>
      {/* Üst Hub Tab Bar */}
      <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-color)', padding: '8px 16px 0', display: 'flex', gap: '8px', overflowX: 'auto' }}>
        {[
          { id: 'kdv', label: 'KDV Hesap & Tahakkuk Özeti', icon: TrendingUp, badge: 'KDV-1' },
          { id: 'muhtasar', label: 'Muhtasar & Stopaj Tablosu', icon: FileCheck2, badge: 'STOPAJ' },
          { id: 'takvim', label: 'Resmi Beyanname Takvimi', icon: Calendar, badge: 'GİB' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: activeTab === t.id ? 'var(--bg-surface)' : 'transparent',
              borderTopLeftRadius: 'var(--radius-sm, 6px)',
              borderTopRightRadius: 'var(--radius-sm, 6px)',
              borderBottom: activeTab === t.id ? '2px solid var(--warning)' : '2px solid transparent',
              color: activeTab === t.id ? 'var(--warning)' : 'var(--text-muted)',
              fontWeight: activeTab === t.id ? 700 : 600,
              fontSize: 'var(--fs-base, 13px)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <t.icon size={16} />
            <span>{t.label}</span>
            <span style={{ fontSize: 'var(--fs-2xs, 10px)', padding: '1px 5px', borderRadius: 'var(--radius-xs, 4px)', background: activeTab === t.id ? 'var(--warning-bg)' : 'var(--bg-surface-secondary)', color: activeTab === t.id ? 'var(--warning)' : 'var(--text-muted)', fontWeight: 700 }}>
              {t.badge}
            </span>
          </button>
        ))}
      </div>

      {/* Tab İçeriği */}
      <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          {/* 3'lü KDV Özet Kartı */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)' }}>
              {/* 2026-09-13: Etiket "Hesaplanan KDV (391)" bir kısaltma değil,
                  cümle biçimli başlık — Title Case'e çevrildi. */}
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700 }}>Hesaplanan KDV (391)</div>
              <div style={{ fontSize: 'var(--fs-2xl, 26px)', fontWeight: 700, color: 'var(--warning)', marginTop: '4px' }}>
                48.200,00 TL
              </div>
              <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', marginTop: '2px' }}>Satış Faturaları Toplam KDV</div>
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700 }}>İndirilecek KDV (191)</div>
              <div style={{ fontSize: 'var(--fs-2xl, 26px)', fontWeight: 700, color: 'var(--info)', marginTop: '4px' }}>
                31.450,00 TL
              </div>
              <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', marginTop: '2px' }}>Alış & Gider Faturaları KDV</div>
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700 }}>Ödenecek KDV (360)</div>
              <div style={{ fontSize: 'var(--fs-2xl, 26px)', fontWeight: 700, color: 'var(--success)', marginTop: '4px' }}>
                16.750,00 TL
              </div>
              <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', marginTop: '2px' }}>Tahakkuk Eden Vergi Borcu</div>
            </div>
          </div>

          {/* Beyanname Takvimi Listesi */}
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '20px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Yaklaşan Resmi Beyanname & Bildirim Takvimi</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {taxCalendar.map((item, idx) => (
                <div key={idx} style={{ background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md, 8px)', padding: '14px 18px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}>{item.title}</div>
                    <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', marginTop: '2px' }}>Son Verilme Tarihi: <b>{item.deadline}</b> ({item.daysLeft} gün kaldı)</div>
                  </div>

                  <span className={`badge ${item.status === 'HAZIR' ? 'badge-success' : 'badge-warning'}`}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
