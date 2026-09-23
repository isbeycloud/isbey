import React, { useState } from 'react';
import {
  BookOpen,
  FileSpreadsheet,
  Layers,
  FileText,
  Calendar,
  Filter,
  Download,
  Printer,
} from 'lucide-react';

export const MuhasebeDefterView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'fisler' | 'mizan' | 'yevmiye' | 'kebir'>('mizan');

  // Örnek Mizan Hesap Verisi
  const mizanData = [
    { code: '100.01', name: 'Merkez Kasa (TL)', debit: 42500, credit: 18200, balanceDebit: 24300, balanceCredit: 0 },
    { code: '102.01', name: 'Garanti BBVA Ticari TL', debit: 285000, credit: 110000, balanceDebit: 175000, balanceCredit: 0 },
    { code: '120.01', name: 'Alıcılar / Müşteriler', debit: 412000, credit: 260000, balanceDebit: 152000, balanceCredit: 0 },
    { code: '153.01', name: 'Ticari Mallar Deposu', debit: 180000, credit: 45000, balanceDebit: 135000, balanceCredit: 0 },
    { code: '320.01', name: 'Satıcılar / Tedarikçiler', debit: 110000, credit: 195000, balanceDebit: 0, balanceCredit: 85000 },
    { code: '391.18', name: 'Hesaplanan KDV (%20)', debit: 0, credit: 48200, balanceDebit: 0, balanceCredit: 48200 },
    { code: '600.01', name: 'Yurtiçi Satışlar Geliri', debit: 0, credit: 289000, balanceDebit: 0, balanceCredit: 289000 },
    { code: '770.01', name: 'Genel Yönetim Giderleri', debit: 34500, credit: 0, balanceDebit: 34500, balanceCredit: 0 },
  ];

  const totalDebit = mizanData.reduce((acc, r) => acc + r.debit, 0);
  const totalCredit = mizanData.reduce((acc, r) => acc + r.credit, 0);
  const totalBalanceDebit = mizanData.reduce((acc, r) => acc + r.balanceDebit, 0);
  const totalBalanceCredit = mizanData.reduce((acc, r) => acc + r.balanceCredit, 0);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-surface-secondary)', color: 'var(--text-main)' }}>
      {/* Üst Tab Menüsü */}
      <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-color)', padding: '8px 16px 0', display: 'flex', gap: '8px', overflowX: 'auto' }}>
        {[
          { id: 'mizan', label: 'Genel & Aylık Mizan', icon: FileSpreadsheet, badge: 'RAPOR' },
          { id: 'fisler', label: 'Muhasebe Fişleri', icon: FileText, badge: 'MAHSUP' },
          { id: 'yevmiye', label: 'Yevmiye Defteri', icon: BookOpen, badge: 'DEFTER' },
          { id: 'kebir', label: 'Büyük Defter (Kebir)', icon: Layers, badge: 'HESAP' },
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
              borderBottom: activeTab === t.id ? '2px solid var(--info)' : '2px solid transparent',
              color: activeTab === t.id ? 'var(--info)' : 'var(--text-muted)',
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
            <span style={{ fontSize: 'var(--fs-2xs, 10px)', padding: '1px 5px', borderRadius: 'var(--radius-xs, 4px)', background: activeTab === t.id ? 'var(--info-bg)' : 'var(--bg-surface-secondary)', color: activeTab === t.id ? 'var(--info)' : 'var(--text-muted)', fontWeight: 700 }}>
              {t.badge}
            </span>
          </button>
        ))}
      </div>

      {/* Tab İçeriği */}
      <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          {/* Araç Çubuğu */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Calendar size={14} color="var(--info)" />
                <span>Dönem: <b>01.01.2026 - 31.12.2026</b></span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => window.print()}
                style={{ padding: '8px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md, 8px)', color: 'var(--text-main)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Printer size={14} />
                <span>Yazdır</span>
              </button>
              <button
                style={{ padding: '8px 14px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-md, 8px)', color: '#fff', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Download size={14} />
                <span>Excel İndir</span>
              </button>
            </div>
          </div>

          {/* Mizan Tablosu */}
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-base, 13px)', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface-secondary)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '12px 16px' }}>Hesap Kodu</th>
                  <th style={{ padding: '12px 16px' }}>Hesap Adı</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Borç Tutarı</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Alacak Tutarı</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Borç Bakiye</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Alacak Bakiye</th>
                </tr>
              </thead>
              <tbody>
                {mizanData.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--info)' }}>{row.code}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-main)' }}>{row.name}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>{row.debit.toLocaleString('tr-TR')} TL</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>{row.credit.toLocaleString('tr-TR')} TL</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: row.balanceDebit > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                      {row.balanceDebit > 0 ? `${row.balanceDebit.toLocaleString('tr-TR')} TL` : '-'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: row.balanceCredit > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                      {row.balanceCredit > 0 ? `${row.balanceCredit.toLocaleString('tr-TR')} TL` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--bg-surface-secondary)', fontWeight: 700, color: 'var(--text-main)', borderTop: '2px solid var(--border-color)' }}>
                  <td colSpan={2} style={{ padding: '14px 16px' }}>Genel Toplam</td>
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>{totalDebit.toLocaleString('tr-TR')} TL</td>
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>{totalCredit.toLocaleString('tr-TR')} TL</td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', color: 'var(--success)' }}>{totalBalanceDebit.toLocaleString('tr-TR')} TL</td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', color: 'var(--warning)' }}>{totalBalanceCredit.toLocaleString('tr-TR')} TL</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
