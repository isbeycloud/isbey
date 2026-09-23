import crypto from 'crypto';
import { SaasPaymentStatus, PaymentProviderType } from '../../db/schema';

export interface PaymentRequestParams {
  tenantId: string;
  orderNumber: string;
  amount: number; // Decimal format
  currency: 'TRY' | 'USD' | 'EUR';
  description: string;
  cardHolderName?: string;
  paymentToken?: string; // Tokenized card ID
  idempotencyKey?: string;
  callbackUrl?: string;
}

export interface PaymentResponseResult {
  success: boolean;
  provider: PaymentProviderType;
  providerPaymentId: string;
  status: SaasPaymentStatus;
  paidAmount: number;
  currency: string;
  cardLast4?: string;
  cardBrand?: string;
  paidAt?: string;
  errorMessage?: string;
}

export interface IPaymentProvider {
  createPayment(params: PaymentRequestParams): Promise<PaymentResponseResult>;
  checkPayment(providerPaymentId: string): Promise<PaymentResponseResult>;
  refundPayment(providerPaymentId: string, amount?: number): Promise<PaymentResponseResult>;
  cancelPayment(providerPaymentId: string): Promise<PaymentResponseResult>;
}

export class MockPaymentProvider implements IPaymentProvider {
  async createPayment(params: PaymentRequestParams): Promise<PaymentResponseResult> {
    const now = new Date().toISOString();
    const pid = `mock_pay_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    return {
      success: true,
      provider: 'MOCK',
      providerPaymentId: pid,
      status: 'successful',
      paidAmount: params.amount,
      currency: params.currency,
      cardLast4: '5842',
      cardBrand: 'Mastercard',
      paidAt: now,
    };
  }

  async checkPayment(providerPaymentId: string): Promise<PaymentResponseResult> {
    return {
      success: true,
      provider: 'MOCK',
      providerPaymentId,
      status: 'successful',
      paidAmount: 100,
      currency: 'TRY',
    };
  }

  async refundPayment(providerPaymentId: string, amount?: number): Promise<PaymentResponseResult> {
    return {
      success: true,
      provider: 'MOCK',
      providerPaymentId,
      status: 'refunded',
      paidAmount: amount || 0,
      currency: 'TRY',
    };
  }

  async cancelPayment(providerPaymentId: string): Promise<PaymentResponseResult> {
    return {
      success: true,
      provider: 'MOCK',
      providerPaymentId,
      status: 'cancelled',
      paidAmount: 0,
      currency: 'TRY',
    };
  }
}

export class IyzicoPaymentProvider implements IPaymentProvider {
  async createPayment(params: PaymentRequestParams): Promise<PaymentResponseResult> {
    // Simüle iyzico 3D Secure / Tokenized Checkout
    const pid = `iyz_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    return {
      success: true,
      provider: 'IYZICO',
      providerPaymentId: pid,
      status: 'successful',
      paidAmount: params.amount,
      currency: params.currency,
      cardLast4: '4111',
      cardBrand: 'Visa',
      paidAt: new Date().toISOString(),
    };
  }

  async checkPayment(providerPaymentId: string): Promise<PaymentResponseResult> {
    return { success: true, provider: 'IYZICO', providerPaymentId, status: 'successful', paidAmount: 0, currency: 'TRY' };
  }

  async refundPayment(providerPaymentId: string, amount?: number): Promise<PaymentResponseResult> {
    return { success: true, provider: 'IYZICO', providerPaymentId, status: 'refunded', paidAmount: amount || 0, currency: 'TRY' };
  }

  async cancelPayment(providerPaymentId: string): Promise<PaymentResponseResult> {
    return { success: true, provider: 'IYZICO', providerPaymentId, status: 'cancelled', paidAmount: 0, currency: 'TRY' };
  }
}

export class PaymentProviderFactory {
  public static getProvider(type: PaymentProviderType = 'MOCK'): IPaymentProvider {
    switch (type) {
      case 'IYZICO': return new IyzicoPaymentProvider();
      case 'MOCK':
      default:
        return new MockPaymentProvider();
    }
  }
}
