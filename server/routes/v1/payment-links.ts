import { Router } from 'express';
import { storage } from '../../db/storage';
import { PaymentLinkService } from '../../services/paymentLinkService';
// FAZ 25.2-C: tenantId yalnızca token'dan çözümlenir (query/body/header kaynağı yasak)
import { resolveRequestTenantId } from '../../security/policies';

const router = Router();

/**
 * GET /api/v1/payment-links
 * Tenant ödeme linklerini listeler
 */
router.get('/', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const db = storage.getState();
  const links = (db.paymentLinks || []).filter(
    l => l.tenantId === tenantId || (!l.tenantId && tenantId === 'tnt-isbey')
  );
  links.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return res.json({ success: true, count: links.length, paymentLinks: links });
});

/**
 * POST /api/v1/payment-links
 * Yeni ödeme ve QR linki oluşturur
 */
router.post('/', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const { customerId, amount, currency = 'TRY', description, expiresInDays = 7 } = req.body;

    if (!customerId || !amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Müşteri ve tutar bilgisi zorunludur.' });
    }

    const link = await PaymentLinkService.createPaymentLink({
      tenantId,
      customerId,
      amount,
      currency,
      description,
      expiresInDays,
    });

    return res.status(201).json({
      success: true,
      message: 'Güvenli ödeme ve QR linki başarıyla oluşturuldu.',
      paymentLink: link,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message || 'Ödeme linki oluşturulamadı.' });
  }
});

/**
 * GET /api/v1/payment-links/resolve/:token
 * Müşterinin açtığı herkese açık (public) ödeme ekranı bilgileri
 */
router.get('/resolve/:token', (req, res) => {
  const link = PaymentLinkService.resolveToken(req.params.token);
  if (!link) {
    return res.status(404).json({ success: false, message: 'Geçersiz veya süresi dolmuş ödeme linki.' });
  }
  return res.json({
    success: true,
    paymentLink: {
      token: link.token,
      customerTitle: link.customerTitle,
      amount: link.amount,
      currency: link.currency,
      description: link.description,
      expiresAt: link.expiresAt,
      status: link.status,
      qrData: link.qrData,
    },
  });
});

/**
 * POST /api/v1/payment-links/pay
 * Müşteri ödeme linki üzerinden kredi kartı tahsilatını tamamlar
 */
router.post('/pay', async (req, res) => {
  try {
    const { token, cardNumber, cardHolder, expiry, cvv } = req.body;
    if (!token || !cardNumber || !cardHolder || !expiry || !cvv) {
      return res.status(400).json({ success: false, message: 'Lütfen tüm kart bilgilerini eksiksiz doldurunuz.' });
    }

    const result = await PaymentLinkService.executePublicPayment({
      token,
      cardNumber,
      cardHolder,
      expiry,
      cvv,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message || 'Ödeme tamamlanamadı.' });
  }
});

export default router;
