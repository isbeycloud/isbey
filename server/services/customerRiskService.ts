import { storage } from '../db/storage';
import { Customer, CustomerRiskScore, CurrentTransaction } from '../db/schema';

export class CustomerRiskService {
  /**
   * Tüm cari hesaplar için dinamik finansal risk analizi ve 0-100 güven skoru hesaplar
   */
  public static calculateRiskScores(tenantId: string): CustomerRiskScore[] {
    const db = storage.getState();
    const customers = (db.customers || []).filter(
      c => c.tenantId === tenantId || (!c.tenantId && tenantId === 'tnt-isbey')
    );
    const transactions = (db.currentTransactions || []).filter(
      t => t.tenantId === tenantId || (!t.tenantId && tenantId === 'tnt-isbey')
    );

    const now = new Date();
    const results: CustomerRiskScore[] = [];

    for (const cust of customers) {
      const custTxs = transactions.filter(t => t.customerId === cust.id);
      const totalDebt = Math.max(0, cust.balance || 0);

      // Vadesi geçen borç ve gün sayısı analizi
      let overdueDebt = 0;
      let maxOverdueDays = 0;

      for (const tx of custTxs) {
        if (tx.debt > 0 && tx.dueDate) {
          const dueDate = new Date(tx.dueDate);
          if (dueDate < now) {
            const diffDays = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
            overdueDebt += tx.debt;
            if (diffDays > maxOverdueDays) maxOverdueDays = diffDays;
          }
        }
      }

      // Skor Hesaplama Algoritması:
      // Başlangıç: 100 puan
      let score = 100;

      // 1. Vadesi geçen gün kesintisi
      if (maxOverdueDays > 90) score -= 40;
      else if (maxOverdueDays > 60) score -= 25;
      else if (maxOverdueDays > 30) score -= 15;
      else if (maxOverdueDays > 7) score -= 5;

      // 2. Vadesi geçen borç / Toplam borç oranı kesintisi
      if (totalDebt > 0) {
        const overdueRatio = overdueDebt / totalDebt;
        if (overdueRatio > 0.7) score -= 30;
        else if (overdueRatio > 0.4) score -= 20;
        else if (overdueRatio > 0.1) score -= 10;
      }

      // 3. Geçmiş ödeme düzeni bonusu/kesintisi
      const paymentTxs = custTxs.filter(t => t.credit > 0);
      let paymentHabitScore = 80;
      if (paymentTxs.length >= 5) {
        paymentHabitScore = 95;
        score += 10;
      } else if (paymentTxs.length === 0 && totalDebt > 0) {
        paymentHabitScore = 40;
        score -= 15;
      }

      const finalScore = Math.max(0, Math.min(100, Math.round(score)));

      let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
      let suggestedAction = 'Standart vadeli satış yapılabilir.';

      if (finalScore < 40) {
        riskLevel = 'CRITICAL';
        suggestedAction = 'Açık hesap kapatılmalı, sadece peşin veya teminatlı satış yapılmalı.';
      } else if (finalScore < 65) {
        riskLevel = 'HIGH';
        suggestedAction = 'Kredi limiti düşürülmeli, yeni sipariş öncesi tahsilat talep edilmeli.';
      } else if (finalScore < 85) {
        riskLevel = 'MEDIUM';
        suggestedAction = 'Vade takip edilmeli, gecikmeler için hatırlatma yapılmalı.';
      }

      results.push({
        customerId: cust.id,
        customerTitle: cust.title,
        riskScore: finalScore,
        riskLevel,
        totalDebt,
        overdueDebt,
        maxOverdueDays,
        paymentHabitScore,
        suggestedAction,
        evaluatedAt: now.toISOString(),
      });
    }

    // Skora göre sırala (en riskliler üstte)
    return results.sort((a, b) => a.riskScore - b.riskScore);
  }
}
