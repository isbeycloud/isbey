import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Send,
  User,
  Paperclip,
  CheckCheck,
  Building,
  Plus,
  X,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import type { TopicConversation, TopicMessage } from '../../../types';

export const CollaborationMessengerView: React.FC = () => {
  const { showToast } = useToast();
  const [conversations, setConversations] = useState<TopicConversation[]>([]);
  const [activeConv, setActiveConv] = useState<TopicConversation | null>(null);
  const [messages, setMessages] = useState<TopicMessage[]>([]);
  const [newMsgContent, setNewMsgContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // New Conversation Modal
  const [isNewConvOpen, setIsNewConvOpen] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState('');

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversations = async () => {
    setIsLoading(true);
    try {
      const res = await api.getTopicConversations();
      if (res.success) {
        setConversations(res.conversations || []);
        if (res.conversations && res.conversations.length > 0 && !activeConv) {
          selectConversation(res.conversations[0]);
        }
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  const selectConversation = async (conv: TopicConversation) => {
    setActiveConv(conv);
    try {
      const res = await api.getTopicMessages(conv.id);
      if (res.success) setMessages(res.messages || []);
    } catch {
      // ignore
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMsgContent.trim() || !activeConv) return;

    try {
      const res = await api.sendTopicMessage({
        conversationId: activeConv.id,
        content: newMsgContent.trim(),
        senderId: 'usr-admin',
        senderName: 'Firma Sahibi',
        senderRole: 'CLIENT',
      });

      if (res.success) {
        setMessages(prev => [...prev, res.message]);
        setNewMsgContent('');
      }
    } catch (err: any) {
      showToast(err.message || 'Mesaj gönderilemedi.', 'error');
    }
  };

  const handleCreateNewConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicTitle.trim()) return;

    try {
      const res = await api.sendTopicMessage({
        topicTitle: newTopicTitle.trim(),
        content: 'Konuşma başlatıldı.',
        senderId: 'usr-admin',
        senderName: 'Firma Sahibi',
        senderRole: 'CLIENT',
      });

      if (res.success) {
        setIsNewConvOpen(false);
        setNewTopicTitle('');
        await loadConversations();
        selectConversation(res.conversation);
      }
    } catch (err: any) {
      showToast(err.message || 'Konuşma açılamadı.', 'error');
    }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '46px', height: '46px', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MessageSquare size={26} color="var(--primary)" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                  Mali Müşavir & Firma İletişim Masası
                </h1>
                <span className="badge badge-info">
                  Güvenli Mesajlaşma
                </span>
              </div>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-base, 13px)' }}>
                Aylık evraklar, KDV mutabakatları ve resmi bildirimler için konu bazlı ortak çalışma kanalı
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsNewConvOpen(true)}
            style={{ padding: '10px 18px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, fontSize: 'var(--fs-base, 13px)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={18} />
            <span>Yeni Konuşma Başlığı</span>
          </button>
        </div>

        {/* Messenger Panel */}
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', minHeight: '560px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          {/* Sol Konuşma Listesi */}
          <div style={{ background: 'var(--bg-surface-secondary)', borderRight: '1px solid var(--border-color)', padding: '18px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '12px' }}>
              Konuşma Başlıkları ({conversations.length})
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {conversations.map(c => (
                <div
                  key={c.id}
                  onClick={() => selectConversation(c)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-sm, 6px)',
                    cursor: 'pointer',
                    background: activeConv?.id === c.id ? 'var(--primary-light)' : 'transparent',
                    border: activeConv?.id === c.id ? '1px solid var(--primary)' : '1px solid transparent',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ fontWeight: 700, fontSize: 'var(--fs-base, 13px)', color: activeConv?.id === c.id ? 'var(--primary)' : 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.topicTitle}
                    </div>
                  </div>
                  <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.lastMessageSnippet}
                  </div>
                  <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Müşavir: {c.accountantName}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sağ Sohbet Alanı */}
          <div style={{ display: 'flex', flexDirection: 'column', padding: '20px' }}>
            {activeConv ? (
              <>
                <div style={{ paddingBottom: '14px', borderBottom: '1px solid var(--border-color)', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--text-main)' }}>
                    {activeConv.topicTitle}
                  </h3>
                  <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>
                    Mali Müşavir: <b>{activeConv.accountantName}</b> | Firma: <b>{activeConv.clientCompanyName}</b>
                  </div>
                </div>

                {/* Mesaj Akışı */}
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px', maxHeight: '420px' }}>
                  {messages.map(m => (
                    <div
                      key={m.id}
                      style={{
                        alignSelf: m.senderRole === 'CLIENT' ? 'flex-end' : 'flex-start',
                        maxWidth: '75%',
                        background: m.senderRole === 'CLIENT' ? 'var(--primary)' : 'var(--bg-surface-secondary)',
                        padding: '12px 16px',
                        borderRadius: m.senderRole === 'CLIENT'
                          ? 'var(--radius-lg, 10px) var(--radius-lg, 10px) 2px var(--radius-lg, 10px)'
                          : 'var(--radius-lg, 10px) var(--radius-lg, 10px) var(--radius-lg, 10px) 2px',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      <div style={{ fontSize: 'var(--fs-xs, 11px)', color: m.senderRole === 'CLIENT' ? 'rgba(255, 255, 255, 0.85)' : 'var(--text-muted)', fontWeight: 700, marginBottom: '4px' }}>
                        {m.senderName} ({m.senderRole === 'CLIENT' ? 'Firma' : 'Mali Müşavir'})
                      </div>
                      <div style={{ fontSize: 'var(--fs-base, 13px)', color: m.senderRole === 'CLIENT' ? '#fff' : 'var(--text-main)', lineHeight: '1.4' }}>
                        {m.content}
                      </div>
                      <div style={{ fontSize: 'var(--fs-xs, 11px)', color: m.senderRole === 'CLIENT' ? 'rgba(255, 255, 255, 0.85)' : 'var(--text-muted)', textAlign: 'right', marginTop: '4px' }}>
                        {new Date(m.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                {/* Mesaj Gönderme Formu */}
                <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    placeholder="Mali müşavirinize mesaj veya evrak notu yazın..."
                    value={newMsgContent}
                    onChange={e => setNewMsgContent(e.target.value)}
                    style={{ flex: 1, padding: '12px 16px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md, 8px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
                  />
                  <button
                    type="submit"
                    disabled={!newMsgContent.trim()}
                    style={{ padding: '0 20px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-md, 8px)', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Send size={18} />
                    <span>Gönder</span>
                  </button>
                </form>
              </>
            ) : (
              <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)' }}>
                Bir konuşma başlığı seçin veya yeni bir konu açın.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New Conv Modal */}
      {isNewConvOpen && (
        // 2026-09-13: Karartma .modal-overlay sınıfından gelir; satır içi koyu arka plan + blur kaldırıldı ki açık temada tutarlı kalsın.
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div style={{ width: '90vw', maxWidth: '440px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg, 10px)', border: '1px solid var(--border-color)', padding: '24px', color: 'var(--text-main)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 'var(--fs-lg, 16px)', fontWeight: 700 }}>Yeni Konuşma Başlığı Aç</h3>
            <form onSubmit={handleCreateNewConversation} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="text"
                required
                placeholder="Örn: Eylül 2026 Akaryakıt Fişleri"
                value={newTopicTitle}
                onChange={e => setNewTopicTitle(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', fontSize: 'var(--fs-base, 13px)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button type="button" onClick={() => setIsNewConvOpen(false)} style={{ padding: '8px 16px', background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm, 6px)', color: 'var(--text-main)', cursor: 'pointer' }}>
                  İptal
                </button>
                <button type="submit" style={{ padding: '8px 20px', background: 'var(--primary)', border: 'none', borderRadius: 'var(--radius-sm, 6px)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                  Oluştur
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
