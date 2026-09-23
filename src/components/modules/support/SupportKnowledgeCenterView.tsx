import React, { useState, useEffect } from 'react';
import {
  HelpCircle,
  BookOpen,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Sparkles,
  MessageSquare,
  ArrowRight,
  Shield,
  Layers,
  X,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import type { SupportTicketFaz8, KnowledgeArticle } from '../../../types';

export const SupportKnowledgeCenterView: React.FC = () => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'kb' | 'tickets'>('kb');
  const [tickets, setTickets] = useState<SupportTicketFaz8[]>([]);
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // New Ticket Modal
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [ticketForm, setTicketForm] = useState({
    category: 'E_FATURA' as SupportTicketFaz8['category'],
    subject: '',
    description: '',
    priority: 'NORMAL' as SupportTicketFaz8['priority'],
  });

  // Selected Article Modal
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeArticle | null>(null);

  useEffect(() => {
    loadData();
  }, [searchQuery]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [tRes, kRes] = await Promise.all([
        api.getSupportTicketsFaz8(),
        api.getKnowledgeArticles(searchQuery),
      ]);

      if (tRes.success) setTickets(tRes.tickets || []);
      if (kRes.success) setArticles(kRes.articles || []);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.createSupportTicketFaz8(ticketForm);
      if (res.success) {
        showToast(res.message, 'success');
        setIsTicketModalOpen(false);
        setTicketForm({ category: 'E_FATURA', subject: '', description: '', priority: 'NORMAL' });
        loadData();
      }
    } catch (err: any) {
      showToast(err.message || 'Destek talebi açılamadı.', 'error');
    }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '46px', height: '46px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <HelpCircle size={26} color="var(--primary)" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                  Destek Masası & Bilgi Bankası
                </h1>
                <span className="badge badge-info">
                  7/24 Destek & AI
                </span>
              </div>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-base, 13px)' }}>
                e-Dönüşüm kılavuzları, sık sorulan sorular ve teknik destek biletleri
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsTicketModalOpen(true)}
            style={{ padding: '10px 18px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, fontSize: 'var(--fs-base, 13px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={18} />
            <span>Yeni Destek Talebi Aç</span>
          </button>
        </div>

        {/* Tab Menüsü */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', marginBottom: '20px' }}>
          <button
            onClick={() => setActiveTab('kb')}
            style={{
              padding: '12px 18px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'kb' ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === 'kb' ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: activeTab === 'kb' ? 700 : 500,
              fontSize: 'var(--fs-base, 13px)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <BookOpen size={18} />
            <span>Bilgi Bankası & Rehberler ({articles.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('tickets')}
            style={{
              padding: '12px 18px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'tickets' ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === 'tickets' ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: activeTab === 'tickets' ? 700 : 500,
              fontSize: 'var(--fs-base, 13px)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <MessageSquare size={18} />
            <span>Destek Taleplerim ({tickets.length})</span>
          </button>
        </div>

        {/* ── 1. SEKME: BİLGİ BANKASI ── */}
        {activeTab === 'kb' && (
          <div>
            <div style={{ position: 'relative', marginBottom: '20px' }}>
              <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Örn: e-Fatura kesme, banka mutabakatı veya stok devri..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '14px 16px 14px 44px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md, 8px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
              {articles.map(art => (
                <div
                  key={art.id}
                  onClick={() => setSelectedArticle(art)}
                  style={{
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius-lg, 10px)',
                    border: '1px solid var(--border-color)',
                    padding: '20px',
                    cursor: 'pointer',
                    transition: 'transform 0.2s',
                  }}
                >
                  <span className="badge badge-info">
                    {art.category}
                  </span>
                  <h3 style={{ margin: '10px 0 6px', fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--text-main)' }}>
                    {art.title}
                  </h3>
                  <p style={{ margin: '0 0 14px', color: 'var(--text-muted)', fontSize: 'var(--fs-base, 13px)', lineHeight: '1.4' }}>
                    {art.summary}
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>
                    <span>{art.viewsCount} Görüntülenme</span>
                    <span style={{ color: 'var(--info)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      Makaleyi Oku <ArrowRight size={12} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 2. SEKME: DESTEK BİLETLERİ ── */}
        {activeTab === 'tickets' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {tickets.length === 0 ? (
              <div style={{ background: 'var(--bg-surface)', padding: '40px', borderRadius: 'var(--radius-lg, 10px)', textAlign: 'center', color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}>
                Açık destek talebiniz bulunmuyor.
              </div>
            ) : (
              tickets.map(t => (
                <div
                  key={t.id}
                  style={{
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius-lg, 10px)',
                    border: '1px solid var(--border-color)',
                    padding: '18px 20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--info)' }}>{t.ticketNo}</span>
                      <span className="badge badge-secondary">{t.category}</span>
                      <h4 style={{ margin: 0, fontSize: 'var(--fs-base, 13px)', fontWeight: 700, color: 'var(--text-main)' }}>{t.subject}</h4>
                    </div>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--fs-base, 13px)' }}>{t.description}</p>
                    <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Öncelik: <b>{t.priority}</b> | Tarih: {new Date(t.createdAt).toLocaleString('tr-TR')}
                    </div>
                  </div>

                  <span className={t.status === 'RESOLVED' ? 'badge badge-success' : 'badge badge-info'}>
                    {t.status}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Ticket Modal */}
      {isTicketModalOpen && (
        // 2026-09-13: Karartma .modal-overlay sınıfından gelir; satır içi koyu arka plan + blur kaldırıldı ki açık temada tutarlı kalsın.
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div style={{ width: '90vw', maxWidth: '480px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '24px', color: 'var(--text-main)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--fs-xl, 20px)', fontWeight: 700 }}>Yeni Destek Bileti Aç</h3>
              <button onClick={() => setIsTicketModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateTicket} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Kategori</label>
                <select
                  value={ticketForm.category}
                  onChange={e => setTicketForm({ ...ticketForm, category: e.target.value as any })}
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                >
                  <option value="E_FATURA">e-Fatura / e-Arşiv / e-İrsaliye</option>
                  <option value="CARI">Cari & Finans</option>
                  <option value="BANKA">Banka Entegrasyonu</option>
                  <option value="MOBIL">Mobil Uygulama & POS</option>
                  <option value="GENEL">Genel Teknik Destek</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Konu</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: GİB Portal bağlantı hatası"
                  value={ticketForm.subject}
                  onChange={e => setTicketForm({ ...ticketForm, subject: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Açıklama / Hata Detayı</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Karşılaştığınız durum ve hata mesajını açıklayınız..."
                  value={ticketForm.description}
                  onChange={e => setTicketForm({ ...ticketForm, description: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setIsTicketModalOpen(false)} style={{ padding: '8px 16px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', cursor: 'pointer' }}>
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

      {/* Article Detail Modal */}
      {selectedArticle && (
        // 2026-09-13: Karartma .modal-overlay sınıfından gelir; satır içi koyu arka plan + blur kaldırıldı ki açık temada tutarlı kalsın.
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div style={{ width: '90vw', maxWidth: '640px', maxHeight: '85vh', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '24px', color: 'var(--text-main)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <span className="badge badge-info">{selectedArticle.category}</span>
                <h3 style={{ margin: '6px 0 0', fontSize: 'var(--fs-xl, 20px)', fontWeight: 700 }}>{selectedArticle.title}</h3>
              </div>
              <button onClick={() => setSelectedArticle(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-surface-secondary)', padding: '16px', borderRadius: 'var(--radius-md, 8px)', fontSize: 'var(--fs-base, 13px)', lineHeight: '1.6', color: 'var(--text-main)', marginBottom: '16px' }}>
              {selectedArticle.contentMarkdown}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setSelectedArticle(null)} style={{ padding: '8px 20px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
