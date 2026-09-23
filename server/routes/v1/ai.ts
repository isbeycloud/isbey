import { Router } from 'express';
import crypto from 'crypto';
import { storage } from '../../db/storage';
import { MockAIProvider } from '../../services/ai/aiProvider';
import { AIDataService } from '../../services/ai/aiDataService';
import { AI_AGENTS_REGISTRY, AIAgentScanEngine } from '../../services/ai/aiAgentsRegistry';
import { AIConversation, AIMessage, DatabaseState } from '../../db/schema';
// FAZ 25.2-C: tenantId yalnızca token'dan çözümlenir (query/body/header kaynağı yasak)
import { resolveRequestTenantId } from '../../security/policies';

const router = Router();
const aiProvider = new MockAIProvider();

/**
 * GET /api/v1/ai/agents
 * Sistemdeki 5 uzman ERP Yapay Zeka Ajanının listesi
 */
router.get('/agents', (req, res) => {
  return res.json({
    success: true,
    agents: AI_AGENTS_REGISTRY,
  });
});

/**
 * POST /api/v1/ai/agents/:agentId/scan
 * Belirli bir ajanın anlık derin denetimini çalıştırır
 */
router.post('/agents/:agentId/scan', (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const { agentId } = req.params;

    const result = AIAgentScanEngine.runAgentScan(agentId, tenantId);
    return res.json({
      success: true,
      result,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message || 'Ajan taraması gerçekleştirilemedi.' });
  }
});

/**
 * POST /api/v1/ai/chat
 * Doğal dilde soru-cevap ve yapılandırılmış yanıt üretimi (Tenant İzolasyonlu & Multi-Agent Destekli)
 */
router.post('/chat', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const userId = req.body.userId || 'usr-default';
    const { message, conversationId, agentId } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Lütfen bir soru veya komut giriniz.' });
    }

    // 1. Tenant Verilerini Güvenli Whitelist Servisinden Çek
    const financialSummary = AIDataService.getTenantFinancialSummary(tenantId);
    const topCustomers = AIDataService.getTopCustomers(tenantId);
    const overdueCustomers = AIDataService.getOverdueCustomers(tenantId);
    const criticalStock = AIDataService.getCriticalStockProducts(tenantId);

    const activeAgent = AI_AGENTS_REGISTRY.find(a => a.id === agentId) || AI_AGENTS_REGISTRY[0];

    const contextData = {
      financialSummary,
      topCustomers,
      overdueCustomers,
      criticalStock,
      agent: activeAgent,
    };

    // 2. AI Modelini Çalıştır
    const aiResponse = await aiProvider.chat(
      [{ role: 'user', content: message }],
      contextData
    );

    const now = new Date().toISOString();
    let convId = conversationId;

    // 3. Konuşma ve Mesaj Kaydı
    await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.aiConversations) draft.aiConversations = [];
      if (!draft.aiMessages) draft.aiMessages = [];

      if (!convId) {
        convId = `conv-${Date.now()}`;
        const newConv: AIConversation = {
          id: convId,
          tenantId,
          userId,
          title: `[${activeAgent.name}] ${message.slice(0, 30)}...`,
          createdAt: now,
          updatedAt: now,
        };
        draft.aiConversations.unshift(newConv);
      }

      // Kullanıcı Mesajı
      draft.aiMessages.push({
        id: `msg-usr-${Date.now()}`,
        conversationId: convId,
        tenantId,
        sender: 'USER',
        content: message,
        createdAt: now,
      });

      // AI Yanıtı
      draft.aiMessages.push({
        id: `msg-ai-${Date.now()}`,
        conversationId: convId,
        tenantId,
        sender: 'AI',
        content: aiResponse.answer,
        sources: aiResponse.sources,
        suggestedActions: aiResponse.suggestedActions,
        confidence: aiResponse.confidence,
        createdAt: now,
      });

      // AI Denetim ve Kullanım Logu
      if (!draft.aiInteractions) draft.aiInteractions = [];
      draft.aiInteractions.unshift({
        id: `ai-int-${Date.now()}`,
        tenantId,
        userId,
        sessionId: convId,
        requestType: 'CHAT',
        inputSummary: `[${activeAgent.name}] ${message.slice(0, 80)}`,
        outputSummary: aiResponse.answer.slice(0, 100),
        model: `${activeAgent.name} Agent / ${aiResponse.model}`,
        confidence: aiResponse.confidence,
        createdAt: now,
      });

      if (!draft.aiUsage) draft.aiUsage = [];
      const currentPeriod = now.slice(0, 7);
      let usage = draft.aiUsage.find(u => u.tenantId === tenantId && u.period === currentPeriod);
      if (!usage) {
        usage = {
          id: `ai-use-${Date.now()}`,
          tenantId,
          userId,
          model: aiResponse.model,
          requestCount: 1,
          inputTokens: aiResponse.tokensUsed.inputTokens,
          outputTokens: aiResponse.tokensUsed.outputTokens,
          estimatedCost: 0.002,
          period: currentPeriod,
          createdAt: now,
        };
        draft.aiUsage.push(usage);
      } else {
        usage.requestCount += 1;
        usage.inputTokens += aiResponse.tokensUsed.inputTokens;
        usage.outputTokens += aiResponse.tokensUsed.outputTokens;
        usage.estimatedCost += 0.002;
      }
    });

    return res.json({
      success: true,
      conversationId: convId,
      answer: aiResponse.answer,
      sources: aiResponse.sources,
      suggestedActions: aiResponse.suggestedActions,
      confidence: aiResponse.confidence,
      model: `${activeAgent.name} Agent (${aiResponse.model})`,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message || 'AI sorgusu işlenemedi.' });
  }
});

/**
 * GET /api/v1/ai/dashboard
 * Bugünün AI Özeti ve Hızlı Öneriler
 */
router.get('/dashboard', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const financialSummary = AIDataService.getTenantFinancialSummary(tenantId);
  const overdue = AIDataService.getOverdueCustomers(tenantId);
  const criticalStock = AIDataService.getCriticalStockProducts(tenantId);

  const db = storage.getState();
  const bankMatches = (db.bankTransactionMatches || []).filter(
    m => (m.tenantId === tenantId || (!m.tenantId && tenantId === 'tnt-isbey')) && m.status === 'PROPOSED'
  );

  return res.json({
    success: true,
    summary: {
      overdueCustomersCount: overdue.length,
      overdueTotalAmount: overdue.reduce((sum, c) => sum + (c.overdueDebt || 0), 0),
      unmatchedBankCount: bankMatches.length,
      criticalStockCount: criticalStock.length,
      predictedDeficit: financialSummary.predictedDeficit30Days,
      todaySales: financialSummary.todaySales,
      liquidAssets: financialSummary.netLiquidAssets,
    },
    recommendations: [
      {
        id: 'rec-1',
        title: 'Gecikmiş Alacaklar İçin Hatırlatma',
        description: `${overdue.length} müşterinizin toplam ${overdue.reduce((s, c) => s + (c.overdueDebt || 0), 0).toLocaleString('tr-TR')} TL vadesi geçen borcu bulunuyor.`,
        priority: 'HIGH',
        confidence: 0.95,
        type: 'COLLECTION_REMINDER',
        agent: 'Kalkan',
      },
      {
        id: 'rec-2',
        title: 'Banka Eşleştirmesi Onayı',
        description: `${bankMatches.length} adet banka havalesi için %95+ güvenilirlikte cari eşleşme önerisi hazırlandı.`,
        priority: 'MEDIUM',
        confidence: 0.96,
        type: 'BANK_RECONCILIATION',
        agent: 'Mizan',
      },
      {
        id: 'rec-3',
        title: 'Kritik Stok Satın Alma Önerisi',
        description: `${criticalStock.length} ürün kritik stok eşiğinin altına indi. Satış hızına göre sipariş açılması önerilir.`,
        priority: 'MEDIUM',
        confidence: 0.92,
        type: 'STOCK_REORDER',
        agent: 'Lojistik',
      },
    ],
  });
});

/**
 * GET /api/v1/ai/conversations
 * Sohbet geçmişi
 */
router.get('/conversations', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const db = storage.getState();
  const list = (db.aiConversations || []).filter(
    c => c.tenantId === tenantId || (!c.tenantId && tenantId === 'tnt-isbey')
  );
  return res.json({ success: true, count: list.length, conversations: list });
});

/**
 * GET /api/v1/ai/conversations/:id/messages
 * Sohbet detay mesajları
 */
router.get('/conversations/:id/messages', (req, res) => {
  const db = storage.getState();
  const messages = (db.aiMessages || []).filter(m => m.conversationId === req.params.id);
  return res.json({ success: true, count: messages.length, messages });
});

export default router;
