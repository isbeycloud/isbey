import crypto from 'crypto';
import {
  PaymentProvider,
  CreatePaymentParams,
  PaymentProviderResult,
  RefundPaymentParams,
  RefundResult,
} from './paymentProvider';

export class MockPaymentProvider implements PaymentProvider {
  public providerName = 'MOCK';

  public async createPayment(params: CreatePaymentParams): Promise<PaymentProviderResult> {
    const cleanCard = (params.cardNumber || '').replace(/[^0-9]/g, '');
    const cardLast4 = cleanCard.slice(-4) || '4242';
    const cardBrand = cleanCard.startsWith('5') ? 'Mastercard' : cleanCard.startsWith('4') ? 'Visa' : 'Troy';

    // 1. Simüle Hata Test Senaryosu (Kart sonu 0000 veya CVV 000)
    if (cleanCard.endsWith('0000') || params.cvv === '000') {
      return {
        success: false,
        providerPaymentId: `MOCK-FAIL-${Date.now()}`,
        status: 'failed',
        cardLast4,
        cardBrand,
        errorMessage: 'Banka reddi (Kod: 51): Yetersiz bakiye veya limit aşımı.',
      };
    }

    // 2. Simüle Timeout / Ağ Hatası (Kart sonu 9999)
    if (cleanCard.endsWith('9999')) {
      return {
        success: false,
        providerPaymentId: `MOCK-TIMEOUT-${Date.now()}`,
        status: 'failed',
        cardLast4,
        cardBrand,
        errorMessage: 'Banka ağ zaman aşımı (Timeout). Lütfen daha sonra tekrar deneyiniz.',
      };
    }

    // 3. Başarılı İşlem
    const providerPaymentId = `MOCK-TX-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    return {
      success: true,
      providerPaymentId,
      status: 'successful',
      paidAt: now,
      cardLast4,
      cardBrand,
      rawResponse: {
        gateway: 'Mock Sanal POS',
        authCode: '123456',
        hostRefNum: `REF-${Date.now()}`,
      },
    };
  }

  public async verifyPayment(providerPaymentId: string): Promise<PaymentProviderResult> {
    if (providerPaymentId.includes('FAIL')) {
      return {
        success: false,
        providerPaymentId,
        status: 'failed',
        errorMessage: 'Ödeme başarısız.',
      };
    }
    return {
      success: true,
      providerPaymentId,
      status: 'successful',
      paidAt: new Date().toISOString(),
    };
  }

  public async refundPayment(params: RefundPaymentParams): Promise<RefundResult> {
    const refundId = `REFUND-MOCK-${Date.now()}`;
    return {
      success: true,
      refundedAmount: params.amount,
      refundId,
    };
  }

  public validateWebhookSignature(payload: any, signature: string, secretKey: string): boolean {
    // FAZ 25.3 #2: 'mock-valid-signature' bypass kaldırıldı — yalnızca gerçek HMAC-SHA256 kabul edilir.
    if (!signature || !secretKey) return false;
    const bodyStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const expectedSig = crypto.createHmac('sha256', secretKey).update(bodyStr).digest('hex');
    return signature === expectedSig;
  }
}
