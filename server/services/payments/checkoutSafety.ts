import type { RequestHandler } from 'express';

export const paymentPreparationMessage = 'Garanti BBVA sanal POS banka testleri bekleniyor. Online tahsilat henüz açık değil; paketiniz değiştirilmedi.';

// Simülasyon kodu hiçbir sunucu/önizleme ortamında ödeme sayılmaz.
export function requirePaymentSandbox() {
  if (process.env.NODE_ENV !== 'test') throw new Error(paymentPreparationMessage);
}

export const sandboxPaymentOnly: RequestHandler = (_req, res, next) => {
  if (process.env.NODE_ENV !== 'test') {
    res.status(503).json({ success: false, code: 'PAYMENT_NOT_AVAILABLE', message: paymentPreparationMessage });
    return;
  }
  next();
};
