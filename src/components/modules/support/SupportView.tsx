import React, { useState, useEffect } from 'react';
import {
  LifeBuoy,
  Plus,
  Send,
  MessageSquare,
  CheckCircle2,
  Clock,
  AlertCircle,
  ShieldCheck,
  Search,
  Filter,
  User,
  ArrowRight,
  Headphones,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';

export const SupportView: React.FC = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Modal
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [category, setCategory] = useState('FATURA');
  const [priority, setPriority] = useState('NORMAL');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Yanıt gönderme
  const [replyMessage, setReplyMessage] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);

  const fetchTickets = async () => {
    setIsLoading(true);
    try {
      const res = await api.getSupportTickets();
      if (res.success) {
        setTickets(res.tickets || []);
        if (selectedTicket) {
          const updated = res.tickets.find((t: any) => t.id === selectedTicket.id);
          if (updated) setSelectedTicket(updated);
        } else if (res.tickets.length > 0) {
          setSelectedTicket(res.tickets[0]);
        }
      }
    } catch (err) {
      console.warn('Destek talepleri yüklenemedi');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !message) {
      addToast('Lütfen konu ve mesaj alanlarını doldurunuz.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.createSupportTicket({ category, priority, subject, message });
      if (res.success) {
        addToast(res.message, 'success');
        setIsNewModalOpen(false);
        setSubject('');
        setMessage('');
        fetchTickets();
      }
    } catch (err: any) {
      addToast(err.message || 'Talep oluşturulamadı.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyMessage.trim()) return;

    setIsSendingReply(true);
    try {
      const res = await api.addSupportTicketResponse(selectedTicket.id, replyMessage);
      if (res.success) {
        addToast('Yanıtınız iletildi.', 'success');
        setReplyMessage('');
        setSelectedTicket(res.ticket);
        fetchTickets();
      }
    } catch (err: any) {
      addToast(err.message || 'Yanıt gönderilemedi.', 'error');
    } finally {
      setIsSendingReply(false);
    }
  };

  const filteredTickets = tickets.filter(t => {
    const matchStatus = filterStatus === 'ALL' || t.status === filterStatus;
    const matchSearch =
      t.ticketNo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.companyName?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchStatus && matchSearch;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return <span className="badge badge-info">Açık</span>;
      case 'IN_PROGRESS':
        return <span className="badge badge-warning">İncelemede</span>;
      case 'RESOLVED':
        return <span className="badge badge-success">Çözüldü</span>;
      case 'CLOSED':
        return <span className="badge badge-secondary">Kapalı</span>;
      default:
        return null;
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-surface-secondary)', color: 'var(--text-main)', overflow: 'hidden' }}>
      {/* Üst Başlık & Aksiyon Barı */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Headphones size={20} color="var(--primary)" />
          </div>
          <div>
            <h1 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Müşteri Destek & Bilet Merkezi</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', margin: '2px 0 0' }}>Teknik soru, e-Dönüşüm veya fatura desteği için 7/24 uzman ekibimiz yanınızda.</p>
          </div>
        </div>

        <button
          onClick={() => setIsNewModalOpen(true)}
          style={{
            padding: '9px 18px',
            borderRadius: 'var(--radius-sm, 6px)',
            background: 'var(--primary)',
            border: 'none',
            color: '#fff',
            fontWeight: 700,
            fontSize: 'var(--fs-base, 13px)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Plus size={16} />
          Yeni Destek Talebi Aç
        </button>
      </div>

      {/* İki Sütunlu Düzen: Sol Liste, Sağ Detay */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Sol: Talep Listesi */}
        <div style={{ width: '360px', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)' }}>
          {/* Arama & Filtre */}
          <div style={{ padding: '12px', borderBottom: '1px solid var(--border-light)' }}>
            <div style={{ position: 'relative', marginBottom: '8px' }}>
              <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Talep no veya konu ara..."
                style={{ width: '100%', padding: '7px 8px 7px 30px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '4px' }}>
              {['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED'].map(st => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  style={{
                    flex: 1,
                    padding: '4px',
                    borderRadius: 'var(--radius-sm, 6px)',
                    background: filterStatus === st ? 'var(--primary)' : 'transparent',
                    border: 'none',
                    color: filterStatus === st ? '#fff' : 'var(--text-muted)',
                    fontSize: 'var(--fs-xs, 11px)',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {st === 'ALL' ? 'Tümü' : st === 'OPEN' ? 'Açık' : st === 'IN_PROGRESS' ? 'İşlemde' : 'Çözüldü'}
                </button>
              ))}
            </div>
          </div>

          {/* Liste */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {filteredTickets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)', fontSize: 'var(--fs-base, 13px)' }}>
                <MessageSquare size={32} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
                Kayıtlı destek talebi bulunamadı.
              </div>
            ) : (
              filteredTickets.map(t => {
                const isSelected = selectedTicket?.id === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTicket(t)}
                    style={{
                      padding: '12px',
                      borderRadius: 'var(--radius-md, 8px)',
                      background: isSelected ? 'var(--primary-light)' : 'transparent',
                      border: isSelected ? '1px solid var(--primary)' : '1px solid transparent',
                      marginBottom: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--info)' }}>{t.ticketNo}</span>
                      {getStatusBadge(t.status)}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 'var(--fs-base, 13px)', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.subject}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px', fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>
                      <span>{t.category}</span>
                      <span>{new Date(t.createdAt).toLocaleDateString('tr-TR')}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Sağ: Talep Konuşma Geçmişi ve Detay */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-surface-secondary)', overflow: 'hidden' }}>
          {selectedTicket ? (
            <>
              {/* Talep Başlığı */}
              <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, fontSize: 'var(--fs-lg, 16px)', color: 'var(--text-main)' }}>{selectedTicket.subject}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-base, 13px)' }}>({selectedTicket.ticketNo})</span>
                  </div>
                  <div style={{ fontSize: 'var(--fs-base, 13px)', color: 'var(--text-muted)' }}>
                    Firma: <strong style={{ color: 'var(--text-main)' }}>{selectedTicket.companyName}</strong> | Açan: {selectedTicket.userName} ({selectedTicket.userEmail})
                  </div>
                </div>
                <div>{getStatusBadge(selectedTicket.status)}</div>
              </div>

              {/* Mesaj Akışı */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* İlk Talep Mesajı */}
                <div style={{ display: 'flex', gap: '12px', maxWidth: '80%' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 700, fontSize: 'var(--fs-base, 13px)' }}>
                    {selectedTicket.userName?.charAt(0) || 'U'}
                  </div>
                  <div style={{ background: 'var(--bg-surface)', padding: '14px 16px', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 700, fontSize: 'var(--fs-base, 13px)', color: 'var(--info)' }}>{selectedTicket.userName}</span>
                      <span style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>{new Date(selectedTicket.createdAt).toLocaleString('tr-TR')}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 'var(--fs-base, 13px)', color: 'var(--text-main)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                      {selectedTicket.message}
                    </p>
                  </div>
                </div>

                {/* Yanıtlar */}
                {selectedTicket.responses?.map((resp: any) => (
                  <div
                    key={resp.id}
                    style={{
                      display: 'flex',
                      gap: '12px',
                      maxWidth: '80%',
                      alignSelf: resp.isAdmin ? 'flex-end' : 'flex-start',
                      flexDirection: resp.isAdmin ? 'row-reverse' : 'row',
                    }}
                  >
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: 'var(--primary)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        fontWeight: 700,
                        fontSize: 'var(--fs-base, 13px)',
                      }}
                    >
                      {resp.isAdmin ? 'İ' : resp.userName?.charAt(0) || 'U'}
                    </div>
                    <div
                      style={{
                        background: resp.isAdmin ? 'var(--primary-light)' : 'var(--bg-surface)',
                        padding: '14px 16px',
                        borderRadius: 'var(--radius-lg, 10px)',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '6px' }}>
                        <span style={{ fontWeight: 700, fontSize: 'var(--fs-base, 13px)', color: resp.isAdmin ? 'var(--primary)' : 'var(--info)' }}>
                          {resp.userName} {resp.isAdmin && '(İŞBEY Uzman Desteği)'}
                        </span>
                        <span style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>{new Date(resp.createdAt).toLocaleString('tr-TR')}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: 'var(--fs-base, 13px)', color: 'var(--text-main)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        {resp.message}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Yanıt Gönderme Barı */}
              <form onSubmit={handleSendReply} style={{ padding: '16px 24px', background: 'var(--bg-surface)', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '12px' }}>
                <input
                  type="text"
                  value={replyMessage}
                  onChange={e => setReplyMessage(e.target.value)}
                  placeholder="Yanıtınızı buraya yazın..."
                  style={{ flex: 1, padding: '10px 14px', borderRadius: 'var(--radius-md, 8px)', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)', outline: 'none' }}
                />
                <button
                  type="submit"
                  disabled={isSendingReply || !replyMessage.trim()}
                  style={{
                    padding: '10px 20px',
                    borderRadius: 'var(--radius-md, 8px)',
                    background: 'var(--primary)',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    opacity: isSendingReply || !replyMessage.trim() ? 0.6 : 1,
                  }}
                >
                  <Send size={15} />
                  Gönder
                </button>
              </form>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              Görüntülemek için sol listeden bir destek talebi seçin.
            </div>
          )}
        </div>
      </div>

      {/* YENİ TALEP AÇMA MODALI */}
      {isNewModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            // 2026-09-13: backdrop-filter (glassmorphism) tasarım kararıyla kaldırıldı; düz karartma yeterli.
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div style={{ width: '100%', maxWidth: '520px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', padding: '24px', border: '1px solid var(--border-color)' }}>
            <h2 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, margin: '0 0 16px', color: 'var(--text-main)' }}>Yeni Destek Talebi Oluştur</h2>

            <form onSubmit={handleCreateTicket} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-sm, 12px)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Kategori</label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
                  >
                    <option value="FATURA">Fatura / e-Arşiv</option>
                    <option value="EDONUSUM">GİB e-Dönüşüm / e-Fatura</option>
                    <option value="MUHASEBE">Ön Muhasebe / Stok / Cari</option>
                    <option value="ENTEGRASYON">API / Entegrasyon</option>
                    <option value="ODEME">Abonelik & Kontör</option>
                    <option value="DIGER">Diğer</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--fs-sm, 12px)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Öncelik</label>
                  <select
                    value={priority}
                    onChange={e => setPriority(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
                  >
                    <option value="DUSUK">Düşük</option>
                    <option value="NORMAL">Normal</option>
                    <option value="YUKSEK">Yüksek</option>
                    <option value="ACIL">Acil</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-sm, 12px)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Konu Başlığı *</label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="Örn: e-Fatura GİB gönderiminde hata alıyorum"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-main)', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--fs-sm, 12px)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Açıklama / Mesajınız *</label>
                <textarea
                  required
                  rows={5}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Lütfen yaşadığınız sorunu veya talebinizi detaylıca açıklayınız..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-main)', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm, 6px)', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{ padding: '8px 20px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary)', border: 'none', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                  {isSubmitting ? 'Gönderiliyor...' : 'Talebi İlet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
