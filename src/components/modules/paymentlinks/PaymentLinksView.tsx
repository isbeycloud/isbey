import React, { useState, useEffect } from 'react';
import {
  QrCode,
  Plus,
  Copy,
  Check,
  ExternalLink,
  DollarSign,
  Calendar,
  Building,
  Clock,
  Send,
  Sparkles,
  Share2,
  X,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import type { PaymentLink, Customer } from '../../../types';

export const PaymentLinksView: React.FC = () => {
  const { showToast } = useToast();
  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // New Link Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newLink, setNewLink] = useState({
    customerId: '',
    amount: 0,
    currency: 'TRY' as 'TRY' | 'USD' | 'EUR',
    description: 'Cari Hesap Açık Bakiye Ödemesi',
    expiresInDays: 7,
  });

  // QR Modal
  const [selectedQrLink, setSelectedQrLink] = useState<PaymentLink | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [lRes, cRes] = await Promise.all([
        api.getPaymentLinks(),
        api.getCustomers(),
      ]);

      if (lRes.success) setLinks(lRes.paymentLinks || []);
      if (cRes.success) setCustomers(cRes.customers || []);
    } catch (err: any) {
      showToast(err.message || 'Ödeme linkleri yüklenemedi.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLink.customerId || newLink.amount <= 0) {
      showToast('Lütfen müşteri ve geçerli tutar giriniz.', 'error');
      return;
    }

    try {
      const res = await api.createPaymentLink(newLink);
      if (res.success) {
        showToast(res.message, 'success');
        setIsModalOpen(false);
        setNewLink({
          customerId: '',
          amount: 0,
          currency: 'TRY',
          description: 'Cari Hesap Açık Bakiye Ödemesi',
          expiresInDays: 7,
        });
        loadData();
      }
    } catch (err: any) {
      showToast(err.message || 'Ödeme linki oluşturulamadı.', 'error');
    }
  };

  const handleCopyLink = (token: string) => {
    const fullUrl = `${window.location.origin}/pay/${token}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedToken(token);
    showToast('Ödeme linki panoya kopyalandı.', 'success');
    setTimeout(() => setCopiedToken(null), 2000);
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <QrCode size={24} color="var(--primary)" />
            </div>
            <div>
              <h1 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, margin: 0 }}>
                QR Kod & Online Tahsilat Linkleri
              </h1>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>
                Müşterilerinize SMS veya WhatsApp ile tek tıkla ödeme linki ve QR kod gönderin
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            style={{ padding: '10px 20px', borderRadius: 'var(--radius-sm, 6px)', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={18} />
            <span>Yeni Ödeme Linki Oluştur</span>
          </button>
        </div>

        {/* Linkler Tablosu */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-base, 13px)', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-secondary)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '14px 18px' }}>Oluşturma Tarihi</th>
                <th style={{ padding: '14px 18px' }}>Müşteri</th>
                <th style={{ padding: '14px 18px' }}>Açıklama</th>
                <th style={{ padding: '14px 18px' }}>Tutar</th>
                <th style={{ padding: '14px 18px' }}>Geçerlilik</th>
                <th style={{ padding: '14px 18px' }}>Görüntülenme</th>
                <th style={{ padding: '14px 18px' }}>Durum</th>
                <th style={{ padding: '14px 18px' }}>Paylaşım & QR</th>
              </tr>
            </thead>
            <tbody>
              {links.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Henüz oluşturulmuş bir ödeme linki bulunmuyor.
                  </td>
                </tr>
              ) : (
                links.map(l => (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>
                      {new Date(l.createdAt).toLocaleDateString('tr-TR')}
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--text-main)' }}>
                      {l.customerTitle}
                    </td>
                    <td style={{ padding: '14px 18px', color: 'var(--text-main)' }}>
                      {l.description}
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--success)', fontSize: 'var(--fs-base, 13px)' }}>
                      {l.amount.toLocaleString('tr-TR')} {l.currency}
                    </td>
                    <td style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>
                      {new Date(l.expiresAt).toLocaleDateString('tr-TR')}
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 600 }}>
                      {l.viewCount || 0} kez
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span className={
                        l.status === 'USED'
                          ? 'badge badge-success'
                          : l.status === 'ACTIVE'
                          ? 'badge badge-info'
                          : 'badge badge-danger'
                      }>
                        {l.status === 'USED' ? 'Ödendi' : l.status === 'ACTIVE' ? 'Aktif' : 'Süresi Doldu'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => handleCopyLink(l.token)}
                          title="Linki Kopyala"
                          style={{ padding: '6px 10px', background: 'var(--bg-surface-secondary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--fs-xs, 11px)' }}
                        >
                          {copiedToken === l.token ? <Check size={12} color="var(--success)" /> : <Copy size={12} />}
                          <span>{copiedToken === l.token ? 'Kopyalandı' : 'Kopyala'}</span>
                        </button>
                        <button
                          onClick={() => setSelectedQrLink(l)}
                          title="QR Kodu Görüntüle"
                          style={{ padding: '6px 10px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700 }}
                        >
                          <QrCode size={12} />
                          <span>QR</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Payment Link Modal */}
      {isModalOpen && (
        // 2026-09-13: Karartma .modal-overlay sınıfından gelir; satır içi koyu arka plan + blur kaldırıldı ki açık temada tutarlı kalsın.
        <div className="modal-overlay" style={{ zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '90vw', maxWidth: '480px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '24px', color: 'var(--text-main)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Yeni Ödeme & QR Linki</h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateLink} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Müşteri (Cari Hesap) *</label>
                <select
                  required
                  value={newLink.customerId}
                  onChange={e => setNewLink({ ...newLink, customerId: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                >
                  <option value="">-- Müşteri Seçiniz --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.title} (Borç: {(c.balance || 0).toLocaleString('tr-TR')} TL)
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Ödeme Tutarı *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={newLink.amount || ''}
                    onChange={e => setNewLink({ ...newLink, amount: Number(e.target.value) })}
                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--success)', fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Geçerlilik (Gün)</label>
                  <input
                    type="number"
                    value={newLink.expiresInDays}
                    onChange={e => setNewLink({ ...newLink, expiresInDays: Number(e.target.value) })}
                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Açıklama</label>
                <input
                  type="text"
                  value={newLink.description}
                  onChange={e => setNewLink({ ...newLink, description: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{ padding: '8px 16px', background: 'var(--bg-surface-secondary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', cursor: 'pointer' }}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 20px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                  Linki & QR Kodu Üret
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {selectedQrLink && (
        // 2026-09-13: Karartma .modal-overlay sınıfından gelir; satır içi koyu arka plan + blur kaldırıldı ki açık temada tutarlı kalsın.
        <div className="modal-overlay" style={{ zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '90vw', maxWidth: '380px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '24px', color: 'var(--text-main)', textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Müşteri Ödeme QR Kodu</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', margin: '0 0 16px' }}>{selectedQrLink.customerTitle}</p>

            {/* QR Kod Görsel Simülasyonu */}
            <div style={{ background: 'var(--bg-surface-secondary)', padding: '16px', borderRadius: 'var(--radius-md, 8px)', display: 'inline-block', marginBottom: '16px' }}>
              {/* 2026-09-13: QR kod yüzeyi bilinçli olarak koyu bırakıldı; okunabilirlik kontrasta bağlı, tema token'ı burada işlevi bozar. */}
              <div style={{ width: '180px', height: '180px', background: '#0f172a', borderRadius: 'var(--radius-sm, 6px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                <QrCode size={120} color="#ffffff" />
                <span style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--info)', marginTop: '4px' }}>İŞBEY Güvenli QR</span>
              </div>
            </div>

            <div style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--success)', marginBottom: '16px' }}>
              {selectedQrLink.amount.toLocaleString('tr-TR')} {selectedQrLink.currency}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={() => handleCopyLink(selectedQrLink.token)}
                style={{ padding: '10px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <Copy size={16} />
                <span>Ödeme Linkini Kopyala</span>
              </button>
              <button
                onClick={() => setSelectedQrLink(null)}
                style={{ padding: '8px', background: 'var(--bg-surface-secondary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', cursor: 'pointer' }}
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
