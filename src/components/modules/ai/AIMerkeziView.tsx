import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  Bot,
  User,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  FileText,
  Landmark,
  Package,
  Layers,
  ArrowRight,
  RefreshCw,
  Zap,
  HelpCircle,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink,
  Sliders,
  DollarSign,
  Search,
} from 'lucide-react';
import { api } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useApp } from '../../../context/AppContext';
import type { AIMessage, AIConversation } from '../../../types';

interface AIAgentItem {
  id: string;
  name: string;
  roleTitle: string;
  category: string;
  avatar: string;
  badgeColor: string;
  description: string;
  capabilities: string[];
  samplePrompts: string[];
}

export const AIMerkeziView: React.FC = () => {
  const { showToast } = useToast();
  const { setActiveView, setActiveRibbonTab } = useApp();

  const [agents, setAgents] = useState<AIAgentItem[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string>('atlas-finance');
  const [inputMsg, setInputMsg] = useState('');
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [dashboardSummary, setDashboardSummary] = useState<any>(null);

  // Scan state
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadAgents();
    loadDashboard();
    loadConversations();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const loadAgents = async () => {
    try {
      const res = await api.getAIAgents();
      if (res && res.success && res.agents) {
        setAgents(res.agents);
      }
    } catch {
      // fallback if needed
    }
  };

  const loadDashboard = async () => {
    try {
      const res = await api.getAIDashboardSummary();
      if (res && res.success) setDashboardSummary(res);
    } catch {
      // ignore
    }
  };

  const loadConversations = async () => {
    try {
      const res = await api.getAIConversations();
      if (res && res.success) {
        setConversations(res.conversations || []);
        if (res.conversations && res.conversations.length > 0) {
          loadMessages(res.conversations[0].id);
        }
      }
    } catch {
      // ignore
    }
  };

  const loadMessages = async (convId: string) => {
    setCurrentConvId(convId);
    try {
      const res = await api.getAIConversationMessages(convId);
      if (res && res.success) setMessages(res.messages || []);
    } catch {
      // ignore
    }
  };

  const handleRunAgentScan = async (agentId: string) => {
    setIsScanning(true);
    setActiveAgentId(agentId);
    try {
      const res = await api.runAIAgentScan(agentId);
      if (res && res.success && res.result) {
        setScanResult(res.result);
        showToast(`${res.result.agentName} Ajanı denetim ve taramayı tamamladı.`, 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Ajan taraması başarısız oldu.', 'error');
    } finally {
      setIsScanning(false);
    }
  };

  const handleSendMessage = async (customText?: string) => {
    const queryText = customText || inputMsg;
    if (!queryText.trim()) return;

    const tempUserMsg: AIMessage = {
      id: `temp-${Date.now()}`,
      conversationId: currentConvId || 'conv-new',
      tenantId: 'tnt-isbey',
      sender: 'USER',
      content: queryText,
      createdAt: new Date().toISOString(),
    };

    setMessages(prev => [...prev, tempUserMsg]);
    setInputMsg('');
    setIsTyping(true);

    try {
      const res = await api.sendAIChat({
        message: queryText,
        conversationId: currentConvId || undefined,
        agentId: activeAgentId,
      });

      if (res && res.success) {
        if (!currentConvId && res.conversationId) {
          setCurrentConvId(res.conversationId);
          loadConversations();
        }

        const aiMsg: AIMessage = {
          id: `ai-${Date.now()}`,
          conversationId: res.conversationId || currentConvId || 'conv-new',
          tenantId: 'tnt-isbey',
          sender: 'AI',
          content: res.answer,
          sources: res.sources,
          suggestedActions: res.suggestedActions,
          confidence: res.confidence,
          createdAt: new Date().toISOString(),
        };

        setMessages(prev => [...prev, aiMsg]);
      }
    } catch (err: any) {
      showToast(err.message || 'AI yanıtı alınamadı.', 'error');
    } finally {
      setIsTyping(false);
    }
  };

  const activeAgent = agents.find(a => a.id === activeAgentId) || agents[0];

  return (
    <div className="view-content-container" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* ─── 1. HEADER: YAPAY ZEKA AJANLARI KOMUTA MERKEZİ ─── */}
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg, 10px)',
          padding: '14px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: 'var(--radius-sm, 6px)',
              background: 'var(--primary-light)',
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sparkles size={22} color="var(--primary)" />
          </div>
          <div>
            <div style={{ fontSize: 'var(--fs-xl, 20px)', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
              İŞBEY AI Agents — Kurumsal Yapay Zeka Ajanları Masası
            </div>
            <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)' }}>
              Finans, Muhasebe, Tedarik Zinciri ve Risk operasyonlarını otonom denetleyen uzman ajanlar.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success)' }} />
            <span>5 Otonom Ajan Çevrimiçi</span>
          </span>
          <button
            onClick={() => handleRunAgentScan(activeAgentId)}
            disabled={isScanning}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              background: 'var(--primary)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-sm, 6px)',
              fontSize: 'var(--fs-sm, 12px)',
              fontWeight: 700,
              cursor: isScanning ? 'wait' : 'pointer',
            }}
          >
            {isScanning ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
            <span>Tüm Ajanları Tara</span>
          </button>
        </div>
      </div>

      {/* ─── 2. 5 UZMAN AJAN KARTLARI (AGENT DECK) ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
        {agents.map(agent => {
          const isSelected = activeAgentId === agent.id;
          return (
            <div
              key={agent.id}
              onClick={() => setActiveAgentId(agent.id)}
              style={{
                background: 'var(--bg-surface)',
                border: isSelected ? `2px solid ${agent.badgeColor}` : '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md, 8px)',
                padding: '14px',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.4rem' }}>{agent.avatar}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 'var(--fs-base, 13px)', color: 'var(--text-main)' }}>
                        {agent.name}
                      </div>
                      <div style={{ fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, color: agent.badgeColor }}>
                        {agent.category}
                      </div>
                    </div>
                  </div>
                  {isSelected && (
                    <span style={{ fontSize: 'var(--fs-xs, 11px)', fontWeight: 700, background: agent.badgeColor, color: '#ffffff', padding: '2px 6px', borderRadius: 'var(--radius-sm, 6px)' }}>
                      Seçili
                    </span>
                  )}
                </div>

                <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', lineHeight: 1.3, marginBottom: '10px' }}>
                  {agent.description}
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>
                  {agent.capabilities.length} Yetenek
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleRunAgentScan(agent.id); }}
                  style={{
                    padding: '3px 8px',
                    fontSize: 'var(--fs-xs, 11px)',
                    fontWeight: 700,
                    background: 'var(--bg-surface-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm, 6px)',
                    color: 'var(--text-main)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Play size={10} />
                  <span>Tara</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── 3. AJAN TARAMA VE BULGULAR PANELİ (Eğer yapıldıysa) ─── */}
      {scanResult && (
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg, 10px)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            borderLeft: `4px solid ${scanResult.status === 'OPTIMAL' ? 'var(--success)' : 'var(--warning)'}`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={18} color={scanResult.status === 'OPTIMAL' ? 'var(--success)' : 'var(--warning)'} />
              <span style={{ fontSize: 'var(--fs-lg, 16px)', fontWeight: 700, color: 'var(--text-main)' }}>
                {scanResult.agentName} Ajanı Denetim Raporu — Sağlık Skoru: %{scanResult.score}
              </span>
            </div>
            <button
              onClick={() => setScanResult(null)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 'var(--fs-sm, 12px)', fontWeight: 700 }}
            >
              Kapat
            </button>
          </div>

          <div style={{ fontSize: 'var(--fs-base, 13px)', color: 'var(--text-muted)', fontWeight: 600 }}>
            {scanResult.summary}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '8px' }}>
            {scanResult.findings.map((f: any) => (
              <div
                key={f.id}
                style={{
                  background: 'var(--bg-surface-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm, 6px)',
                  padding: '8px 12px',
                }}
              >
                <div style={{ fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: f.level === 'HIGH' ? 'var(--danger)' : 'var(--text-main)' }}>
                  {f.title}
                </div>
                <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {f.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── 4. MULTI-AGENT INTERACTIVE CHAT PANELİ ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '14px', minHeight: '480px' }}>
        {/* Sol: Ajan Profili & Hızlı Komutlar */}
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg, 10px)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <span style={{ fontSize: '2rem' }}>{activeAgent?.avatar || '🤖'}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 'var(--fs-lg, 16px)', color: 'var(--text-main)' }}>
                  {activeAgent?.name} Ajanı
                </div>
                <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', fontWeight: 700 }}>
                  {activeAgent?.roleTitle}
                </div>
              </div>
            </div>

            <div style={{ fontSize: 'var(--fs-sm, 12px)', color: 'var(--text-muted)', marginBottom: '14px', lineHeight: 1.4 }}>
              {activeAgent?.description}
            </div>

            <div style={{ fontSize: 'var(--fs-sm, 12px)', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>
              Örnek Sorular:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {activeAgent?.samplePrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(prompt)}
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    background: 'var(--bg-surface-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm, 6px)',
                    fontSize: 'var(--fs-sm, 12px)',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    lineHeight: 1.2,
                    transition: 'all 120ms ease',
                  }}
                  className="erp-prompt-chip"
                >
                  "{prompt}"
                </button>
              ))}
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '12px', fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>
            <strong>Tenant İzolasyonu:</strong> Ajan yalnızca yetkili firma verilerinizi güvenle sorgular.
          </div>
        </div>

        {/* Sağ: Canlı Sohbet Mesajlaşma Alanı */}
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg, 10px)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Chat Header */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border-color)',
              background: 'var(--bg-surface-secondary)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bot size={18} color="var(--primary)" />
              <span style={{ fontSize: 'var(--fs-base, 13px)', fontWeight: 700, color: 'var(--text-main)' }}>
                {activeAgent?.name} ile Canlı İstişare Masası
              </span>
            </div>
            <button
              onClick={() => setMessages([])}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)', cursor: 'pointer', fontWeight: 600 }}
            >
              Sohbeti Temizle
            </button>
          </div>

          {/* Chat Messages */}
          <div
            style={{
              flex: 1,
              padding: '16px',
              overflowY: 'auto',
              maxHeight: '400px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {messages.length === 0 ? (
              <div style={{ textAlign: 'center', margin: 'auto', color: 'var(--text-muted)', maxWidth: '320px' }}>
                <span style={{ fontSize: '2.5rem' }}>{activeAgent?.avatar || '🤖'}</span>
                <div style={{ fontWeight: 700, fontSize: 'var(--fs-lg, 16px)', color: 'var(--text-main)', marginTop: '8px' }}>
                  {activeAgent?.name} Ajanı Hazır
                </div>
                <div style={{ fontSize: 'var(--fs-sm, 12px)', marginTop: '4px' }}>
                  Aşağıdaki metin kutusundan soru sorabilir veya sol paneldeki örnek komutları tıklayabilirsiniz.
                </div>
              </div>
            ) : (
              messages.map(m => {
                const isUser = m.sender === 'USER';
                return (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      gap: '10px',
                      alignItems: 'flex-start',
                      justifyContent: isUser ? 'flex-end' : 'flex-start',
                    }}
                  >
                    {!isUser && (
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: 'var(--bg-surface-secondary)',
                          border: '1px solid var(--border-color)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.1rem',
                          flexShrink: 0,
                        }}
                      >
                        {activeAgent?.avatar || '🤖'}
                      </div>
                    )}

                    <div
                      style={{
                        maxWidth: '80%',
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-md, 8px)',
                        background: isUser ? 'var(--primary)' : 'var(--bg-surface-secondary)',
                        color: isUser ? '#ffffff' : 'var(--text-main)',
                        border: isUser ? 'none' : '1px solid var(--border-color)',
                        fontSize: 'var(--fs-base, 13px)',
                        lineHeight: 1.4,
                        whiteSpace: 'pre-line',
                      }}
                    >
                      {m.content}

                      {m.sources && m.sources.length > 0 && (
                        <div style={{ marginTop: '8px', borderTop: '1px solid var(--border-light)', paddingTop: '4px', fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>
                          <strong>Kaynaklar:</strong> {m.sources.join(', ')}
                        </div>
                      )}

                      {m.suggestedActions && m.suggestedActions.length > 0 && (
                        <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {m.suggestedActions.map((act, aIdx) => (
                            <button
                              key={aIdx}
                              onClick={() => {
                                if (act.payload?.view) {
                                  setActiveView(act.payload.view);
                                } else {
                                  showToast(`${act.label} işlemi başlatıldı.`, 'info');
                                }
                              }}
                              style={{
                                padding: '4px 8px',
                                background: 'var(--bg-surface)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-sm, 6px)',
                                fontSize: 'var(--fs-xs, 11px)',
                                fontWeight: 700,
                                color: 'var(--primary)',
                                cursor: 'pointer',
                              }}
                            >
                              {act.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {isUser && (
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: 'var(--primary)',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <User size={16} />
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {isTyping && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 12px)' }}>
                <RefreshCw size={14} className="animate-spin" />
                <span>{activeAgent?.name} analizi derliyor...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
          <div
            style={{
              padding: '12px 16px',
              borderTop: '1px solid var(--border-color)',
              background: 'var(--bg-surface)',
              display: 'flex',
              gap: '8px',
            }}
          >
            <input
              type="text"
              value={inputMsg}
              onChange={e => setInputMsg(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSendMessage();
              }}
              placeholder={`${activeAgent?.name} ajanına soru sorun veya işlem talep edin...`}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm, 6px)',
                border: '1px solid var(--border-color)',
                fontSize: 'var(--fs-base, 13px)',
                outline: 'none',
              }}
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={!inputMsg.trim() || isTyping}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px 16px',
                background: 'var(--primary)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--radius-sm, 6px)',
                cursor: !inputMsg.trim() || isTyping ? 'not-allowed' : 'pointer',
                opacity: !inputMsg.trim() || isTyping ? 0.6 : 1,
              }}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
