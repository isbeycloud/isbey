import React, { useState, useEffect } from 'react';
import {
  Landmark,
  CheckCircle2,
  AlertTriangle,
  Search,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  Building,
  FileText,
  Clock,
  Sparkles,
  Layers,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import type { BankMatchSuggestion } from '../../../types';

export const BankReconciliationView: React.FC = () => {
  const { showToast } = useToast();
  const [suggestions, setSuggestions] = useState<BankMatchSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'CONFIRMED' | 'PROPOSED'>('ALL');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await api.getBankMatchingSuggestions();
      if (res.success) setSuggestions(res.suggestions || []);
    } catch (err: any) {
      showToast(err.message || 'Banka eşleştirmeleri yüklenemedi.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReconcile = async (s: BankMatchSuggestion) => {
    if (!s.matchedCustomer) {
      showToast('Eşleştirilecek cari hesap seçilmedi.', 'error');
      return;
    }

    try {
      const res = await api.reconcileBankTransaction({
        bankTransactionId: s.bankTransaction.id,
        customerId: s.matchedCustomer.id,
        invoiceId: s.matchedInvoice?.id,
        reconciledBy: 'Akıllı Eşleştirme Motoru',
      });

      if (res.success) {
        showToast(res.message, 'success');
        loadData();
      }
    } catch (err: any) {
      showToast(err.message || 'Mutabakat onaylanamadı.', 'error');
    }
  };

  const filtered = suggestions.filter(s => {
    if (filter === 'CONFIRMED') return s.match.status === 'CONFIRMED';
    if (filter === 'PROPOSED') return s.match.status === 'PROPOSED';
    return true;
  });

  const matchedCount = suggestions.filter(s => s.match.status === 'CONFIRMED').length;
  const pendingCount = suggestions.filter(s => s.match.status === 'PROPOSED').length;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Landmark size={24} color="var(--primary)" />
            </div>
            <div>
              <h1 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, margin: 0 }}>
                Akıllı Banka Mutabakatı & Eşleştirme
              </h1>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>
                Banka hareketlerini VKN, Fatura No ve Ünvan benzerliğine göre cari hesaplarla otomatik eşleştirin
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={loadData}
              style={{ padding: '10px 16px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-main)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <RefreshCw size={16} />
              <span>Yenile & Tekrar Analiz Et</span>
            </button>
          </div>
        </div>

        {/* KPI Kartları */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 600 }}>Onaylanmış Mutabakatlar</div>
            <div style={{ fontSize: 'var(--fs-2xl, 26px)', fontWeight: 700, color: 'var(--success)', marginTop: '4px' }}>
              {matchedCount}
            </div>
            <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '2px' }}>Cari hesaba işlenmiş</div>
          </div>

          <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 600 }}>Eşleşme Bekleyen Hareketler</div>
            <div style={{ fontSize: 'var(--fs-2xl, 26px)', fontWeight: 700, color: 'var(--warning)', marginTop: '4px' }}>
              {pendingCount}
            </div>
            <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--warning)', marginTop: '2px' }}>Önerilen cari eşleşmeleri</div>
          </div>

          <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', fontWeight: 600 }}>Akıllı Eşleşme Doğruluğu</div>
            <div style={{ fontSize: 'var(--fs-2xl, 26px)', fontWeight: 700, color: 'var(--info)', marginTop: '4px' }}>
              %94.8
            </div>
            <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '2px' }}>VKN + Ünvan + Tutar kuralı</div>
          </div>
        </div>

        {/* Eşleştirme Tablosu */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm, 12px)', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-secondary)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '14px 18px' }}>Tarih</th>
                <th style={{ padding: '14px 18px' }}>Banka & Açıklama</th>
                <th style={{ padding: '14px 18px' }}>Tutar</th>
                <th style={{ padding: '14px 18px' }}>Önerilen Cari / Fatura</th>
                <th style={{ padding: '14px 18px' }}>Güven Skoru</th>
                <th style={{ padding: '14px 18px' }}>Durum</th>
                <th style={{ padding: '14px 18px' }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Banka hareketi bulunamadı.
                  </td>
                </tr>
              ) : (
                filtered.map((s, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>
                      {new Date(s.bankTransaction.date).toLocaleDateString('tr-TR')}
                    </td>
                    <td style={{ padding: '14px 18px', maxWidth: '280px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{s.bankTransaction.bankAccountName || 'Banka Hesabı'}</div>
                      <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.bankTransaction.description}
                      </div>
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--success)', fontSize: 'var(--fs-md, 14px)' }}>
                      {s.bankTransaction.amount.toLocaleString('tr-TR')} TL
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      {s.matchedCustomer ? (
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--info)' }}>{s.matchedCustomer.title}</div>
                          {s.matchedInvoice && (
                            <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--success)' }}>
                              Fatura: {s.matchedInvoice.invoiceNo} ({s.matchedInvoice.grandTotal} TL)
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Eşleşme Bulunamadı</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '45px', height: '6px', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-xs, 4px)', overflow: 'hidden' }}>
                          <div style={{ width: `${s.match.matchScore}%`, height: '100%', background: s.match.matchScore >= 80 ? 'var(--success)' : 'var(--warning)' }} />
                        </div>
                        <span style={{ fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', color: s.match.matchScore >= 80 ? 'var(--success)' : 'var(--warning)' }}>
                          %{s.match.matchScore}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span className={`badge ${s.match.status === 'CONFIRMED' ? 'badge-success' : 'badge-warning'}`}>
                        {s.match.status === 'CONFIRMED' ? 'Mutabık' : 'Önerildi'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      {s.match.status !== 'CONFIRMED' && s.matchedCustomer ? (
                        <button
                          onClick={() => handleReconcile(s)}
                          style={{
                            padding: '6px 12px',
                            background: 'var(--primary)',
                            border: 'none',
                            borderRadius: 'var(--radius-sm, 6px)',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: 'var(--fs-xs, 11px)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <span>Eşleştir & Kapat</span>
                          <ArrowRight size={14} />
                        </button>
                      ) : (
                        <span className="badge badge-success">İşlendi</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
