import crypto from 'crypto';
import { IPosProvider, PosPaymentRequest, PosPaymentResponse } from './posProvider';

export class MockPosProvider implements IPosProvider {
  public name = 'İŞBEY Sanal POS & Mobil Terminal Simülatörü';
  public providerId = 'MOCK' as const;

  public async createPayment(req: PosPaymentRequest): Promise<PosPaymentResponse> {
    const rawCard = req.cardNumber ? req.cardNumber.replace(/\s+/g, '') : '4543600000001234';
    const cardLast4 = rawCard.slice(-4);
    const providerTransactionId = `pos-tx-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

    // Simüle Hata Testleri:
    // Kart '0000' ile bitiyorsa Yetersiz Bakiye
    if (cardLast4 === '0000') {
      return {
        success: false,
        provider: this.providerId,
        providerTransactionId,
        status: 'FAILED',
        cardLast4,
        errorMessage: 'Yetersiz Bakiye (Banka Kodu: 51).',
      };
    }

    // Kart '9999' ile bitiyorsa Banka İletişim Hatası
    if (cardLast4 === '9999') {
      return {
        success: false,
        provider: this.providerId,
        providerTransactionId,
        status: 'FAILED',
        cardLast4,
        errorMessage: 'Banka Terminal Zaman Aşımı (Banka Kodu: 96).',
      };
    }

    // Kart Markası Algılama
    let cardBrand = 'TROY';
    if (rawCard.startsWith('4')) cardBrand = 'VISA';
    else if (rawCard.startsWith('5')) cardBrand = 'MASTERCARD';
    else if (rawCard.startsWith('9')) cardBrand = 'TROY';

    const authCode = Math.floor(100000 + Math.random() * 900000).toString();

    return {
      success: true,
      provider: this.providerId,
      providerTransactionId,
      status: 'SUCCESS',
      authCode,
      cardLast4,
      cardBrand,
      responsePayload: {
        amount: req.amount,
        currency: req.currency,
        installment: req.installment || 1,
        rrn: crypto.randomBytes(6).toString('hex').toUpperCase(),
        timestamp: new Date().toISOString(),
      },
    };
  }

  public async checkPayment(providerTransactionId: string): Promise<PosPaymentResponse> {
    return {
      success: true,
      provider: this.providerId,
      providerTransactionId,
      status: 'SUCCESS',
      authCode: '654321',
      cardLast4: '1234',
      cardBrand: 'VISA',
    };
  }

  public async refundPayment(providerTransactionId: string, amount: number): Promise<PosPaymentResponse> {
    return {
      success: true,
      provider: this.providerId,
      providerTransactionId: `ref-${providerTransactionId}`,
      status: 'REFUNDED',
      authCode: 'REFUNDED',
      responsePayload: { refundedAmount: amount, refundedAt: new Date().toISOString() },
    };
  }

  public async cancelPayment(providerTransactionId: string): Promise<PosPaymentResponse> {
    return {
      success: true,
      provider: this.providerId,
      providerTransactionId: `void-${providerTransactionId}`,
      status: 'REFUNDED',
      authCode: 'VOIDED',
    };
  }
}
