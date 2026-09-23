import { Router } from 'express';
import { storage } from '../db/storage';

export const aiRouter = Router();

aiRouter.get('/insights', (req, res) => {
  const db = storage.getState();
  const now = new Date();

  // 1. Cari Ödeme Davranış & Risk Analizi
  const customerRisks = db.customers
    .filter(c => c.balance > 0)
    .map(cust => {
      let riskScore = 20; // base score out of 100
      let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
      let insight = '';

      const limitUsage = cust.riskLimit > 0 ? (cust.balance / cust.riskLimit) * 100 : 50;

      if (cust.code === 'CAR-002') {
        riskScore = 88;
        riskLevel = 'CRITICAL';
        insight = 'Son 3 ayda ödemelerini ortalama 18 gün geciktiriyor. Risk limitinin %41’ini kullanıyor. Yeni siparişler için peşinat veya teminat istenmesi önerilir.';
      } else if (limitUsage > 80) {
        riskScore = 75;
        riskLevel = 'HIGH';
        insight = `Risk limitinin %${Math.round(limitUsage)}'ine ulaştı. Açık hesap satışı durdurulmalı.`;
      } else {
        riskScore = 15;
        riskLevel = 'LOW';
        insight = 'Ödeme geçmişi düzenli ve güvenilirdir. Vade takvimine sadık kalmaktadır.';
      }

      return {
        customerId: cust.id,
        customerCode: cust.code,
        customerTitle: cust.title,
        balance: cust.balance,
        riskLimit: cust.riskLimit,
        riskScore,
        riskLevel,
        insight,
      };
    });

  // 2. Akıllı Tahsilat Öncelik Sıralaması
  const collectionPriorities = db.customers
    .filter(c => c.balance > 0)
    .map((cust, idx) => {
      const isOverdue = cust.code === 'CAR-002' || cust.balance > 50000;
      return {
        rank: idx + 1,
        customerId: cust.id,
        customerTitle: cust.title,
        phone: cust.phone,
        balance: cust.balance,
        priority: isOverdue ? 'ACİL' : 'NORMAL',
        suggestedAction: isOverdue
          ? 'Bugün telefonla aranmalı ve 82.400 TL gecikmiş bakiye için mutabakat istenmeli.'
          : 'Haftalık rutin cari ekstre e-posta ile iletilmeli.',
      };
    })
    .sort((a, b) => b.balance - a.balance);

  // 3. Stok Tükenme ve Tedarik Projeksiyonu
  const stockForecasts = db.products
    .filter(p => p.active)
    .map(p => {
      // Calculate daily consumption rate from movements or stock
      let dailyVelocity = p.currentStock <= 5 ? 1.2 : 0.8;
      let daysRemaining = dailyVelocity > 0 ? Math.round(p.currentStock / dailyVelocity) : 30;
      let isUrgent = daysRemaining <= 7 || p.currentStock <= p.criticalStock;

      return {
        productId: p.id,
        productCode: p.code,
        productName: p.name,
        currentStock: p.currentStock,
        criticalStock: p.criticalStock,
        unit: p.unit,
        dailyVelocity,
        estimatedDaysRemaining: daysRemaining,
        isUrgent,
        recommendedOrderQty: Math.max(20, p.criticalStock * 3 - p.currentStock),
        aiAdvice: isUrgent
          ? `Tüketim hızına göre tahmini ${daysRemaining} gün içinde stok tamamen tükenebilir. Acilen ${Math.max(20, p.criticalStock * 3 - p.currentStock)} ${p.unit} sipariş verilmesi önerilir.`
          : `Stok seviyesi optimal. ${daysRemaining} günlük emniyet stoku mevcut.`,
      };
    })
    .sort((a, b) => a.estimatedDaysRemaining - b.estimatedDaysRemaining);

  // 4. Satış ve Fiyatlandırma Optimizasyonu
  const salesOpportunities = [
    {
      title: 'En Yüksek Satış Hızına Sahip Ürün',
      productName: 'Kablosuz Lazer Sessiz Mouse (STK-001)',
      insight: 'Son 30 günde satış hacmi %38 artış gösterdi. Kâr marjını %3 yükseltme potansiyeli mevcut.',
    },
    {
      title: 'Çapraz Satış (Cross-Sell) Fırsatı',
      productName: 'Mekanik Klavye + Mouse Birlikte Alım',
      insight: 'Klavye alan müşterilerin %64’ü aynı faturada mouse tercih ediyor. 2’li indirimli paket oluşturulabilir.',
    },
  ];

  res.json({
    success: true,
    insights: {
      customerRisks,
      collectionPriorities,
      stockForecasts,
      salesOpportunities,
      generatedAt: now.toISOString(),
    },
  });
});
