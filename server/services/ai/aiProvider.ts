export interface AIChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIChatResponse {
  answer: string;
  sources?: string[];
  suggestedActions?: Array<{
    type: string;
    label: string;
    payload: any;
  }>;
  confidence: number;
  model: string;
  tokensUsed: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface IAIProvider {
  name: string;
  chat(messages: AIChatMessage[], contextData?: any): Promise<AIChatResponse>;
  analyze(prompt: string, data: any): Promise<any>;
  extract(documentText: string, schema: any): Promise<any>;
}

export class MockAIProvider implements IAIProvider {
  public name = 'İŞBEY Financial LLM v7.0 (Mock/Gemini-Pro)';

  public async chat(messages: AIChatMessage[], contextData?: any): Promise<AIChatResponse> {
    const lastUserMsg = messages[messages.length - 1]?.content?.toLowerCase() || '';
    const summary = contextData?.financialSummary || {};

    let answer = '';
    const sources: string[] = [];
    const suggestedActions: AIChatResponse['suggestedActions'] = [];
    let confidence = 0.94;

    if (lastUserMsg.includes('en çok satış') || lastUserMsg.includes('müşteri') || lastUserMsg.includes('top müşteri')) {
      const topCustomers = contextData?.topCustomers || [];
      if (topCustomers.length > 0) {
        answer = `Bu dönem en yüksek hacimli satış yaptığınız müşteriler:\n\n` +
          topCustomers.slice(0, 3).map((c: any, idx: number) => `${idx + 1}. **${c.customerTitle}** — ${(c.totalSales || 0).toLocaleString('tr-TR')} TL`).join('\n') +
          `\n\nBu müşteriler toplam cironuzun yaklaşık %${Math.round((topCustomers[0]?.totalSales / (summary.totalSales || 1)) * 100) || 45}'ini oluşturmaktadır.`;
        sources.push(`${topCustomers.length} adet onaylı satış faturası`);
      } else {
        answer = 'Kayıtlı satış verilerinize göre şu anda aktif ciro oluşturan müşteriniz bulunmaktadır.';
      }
    } else if (lastUserMsg.includes('vade') || lastUserMsg.includes('gecik') || lastUserMsg.includes('borç') || lastUserMsg.includes('alacak')) {
      const overdue = contextData?.overdueCustomers || [];
      const overdueTotal = overdue.reduce((sum: number, c: any) => sum + (c.overdueDebt || c.balance || 0), 0);
      answer = `Toplam **${overdue.length} müşterinizin** vadesi geçmiş borcu bulunmaktadır. Toplam gecikmiş alacak tutarı: **${overdueTotal.toLocaleString('tr-TR')} TL**.\n\n` +
        `En yüksek riskli cariler:\n` +
        overdue.slice(0, 3).map((c: any) => `• **${c.customerTitle}**: ${(c.overdueDebt || c.balance).toLocaleString('tr-TR')} TL (${c.maxOverdueDays || 12} gün gecikme)`).join('\n') +
        `\n\nTahsilat ekibinizin bu carilerle ivedilikle iletişime geçmesi önerilir.`;
      sources.push(`${overdue.length} adet vadesi geçmiş cari hesap ekstresi`);
      suggestedActions.push({
        type: 'COLLECTION_ACTION',
        label: 'Tahsilat Hatırlatması Başlat',
        payload: { customerIds: overdue.slice(0, 3).map((c: any) => c.customerId) },
      });
    } else if (lastUserMsg.includes('nakit') || lastUserMsg.includes('açık') || lastUserMsg.includes('kasa') || lastUserMsg.includes('banka')) {
      const liquid = (summary.totalCash || 0) + (summary.totalBank || 0);
      const isDeficit = summary.predictedDeficit30Days > 0;
      answer = `Mevcut likit varlıklarınız (Kasa + Banka): **${liquid.toLocaleString('tr-TR')} TL**.\n\n` +
        `• Kasa Bakiyesi: ${(summary.totalCash || 0).toLocaleString('tr-TR')} TL\n` +
        `• Banka Bakiyesi: ${(summary.totalBank || 0).toLocaleString('tr-TR')} TL\n\n` +
        (isDeficit
          ? `⚠️ **Nakit Açığı Uyarısı:** Önümüzdeki 30 gün içerisinde yaklaşan tedarikçi ödemeleriniz nedeniyle yaklaşık **${summary.predictedDeficit30Days?.toLocaleString('tr-TR')} TL** nakit açığı oluşma riski bulunmaktadır.`
          : `✅ Önümüzdeki 30 gün için nakit akışınız dengeli ve pozitif görünmektedir.`);
      sources.push('Kasa defterleri, banka mevduat hesapları ve 30 günlük vade projeksiyonu');
      if (isDeficit) {
        suggestedActions.push({
          type: 'VIEW_FORECAST',
          label: 'Nakit Akış Projeksiyonunu İncele',
          payload: { view: 'nakit-tahmin' },
        });
      }
    } else if (lastUserMsg.includes('fatura') || lastUserMsg.includes('hata') || lastUserMsg.includes('kdv') || lastUserMsg.includes('mükerrer')) {
      answer = `Yapılan otomatik matematiksel denetimde **1 adet KDV matrah uyumsuzluğu** ve **1 adet muhtemel mükerrer fatura şüphesi** tespit edilmiştir.\n\n` +
        `• **FAT-2026-00012**: %20 KDV oranı ile genel toplam tutarında 4.50 TL yuvarlama farkı tespit edildi.\n` +
        `• **GİD-2026-00045**: Aynı tutarlı (12.500 TL) fatura 2 gün önce de işlenmiş.\n\n` +
        `Muhasebe Kontrol Masasından kayıtları inceleyebilirsiniz.`;
      sources.push('Satış ve Alış Fatura UBL/XML doğrulama motoru');
      suggestedActions.push({
        type: 'VIEW_AUDIT_DESK',
        label: 'Muhasebe Kontrol Masasını Aç',
        payload: { view: 'muhasebe-kontrol' },
      });
    } else {
      answer = `Şirketinizin güncel finansal özeti:\n\n` +
        `• **Bu Ayki Satış Cirosu:** ${(summary.todaySales || 45200).toLocaleString('tr-TR')} TL (Toplam: ${(summary.totalSales || 380000).toLocaleString('tr-TR')} TL)\n` +
        `• **Toplam Tahsilat:** ${(summary.totalCollections || 145000).toLocaleString('tr-TR')} TL\n` +
        `• **Toplam Cari Alacak:** ${(summary.totalReceivables || 210000).toLocaleString('tr-TR')} TL\n` +
        `• **Likit Varlıklar:** ${((summary.totalCash || 0) + (summary.totalBank || 0)).toLocaleString('tr-TR')} TL\n\n` +
        `Bana belirli müşteriler, vadesi geçen borçlar, nakit akış tahmini veya fatura kontrolleri hakkında soru sorabilirsiniz.`;
      sources.push('İŞBEY Tenant Finansal Veri Katmanı');
    }

    return {
      answer,
      sources,
      suggestedActions,
      confidence,
      model: this.name,
      tokensUsed: {
        inputTokens: Math.floor(150 + lastUserMsg.length * 2),
        outputTokens: Math.floor(200 + answer.length / 4),
      },
    };
  }

  public async analyze(prompt: string, data: any): Promise<any> {
    return {
      summary: 'Analiz başarıyla tamamlandı.',
      metrics: data,
      generatedAt: new Date().toISOString(),
    };
  }

  public async extract(documentText: string, schema: any): Promise<any> {
    return {
      extracted: true,
      confidence: 0.95,
      data: {},
    };
  }
}
