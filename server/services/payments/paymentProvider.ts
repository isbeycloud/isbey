import { Payment, SaasPaymentStatus, PaymentType } from '../../db/schema';

export interface CreatePaymentParams {
  tenantId: string;
  orderType?: PaymentType;
  paymentType?: PaymentType;
  orderNumber?: string;
  amount: number; // KDV hariç
  vatAmount?: number;
  totalAmount?: number; // KDV dahil
  currency: 'TRY' | 'USD' | 'EUR';
  description: string;
  planId?: string;
  planSlug?: string;
  billingCycle?: 'monthly' | 'yearly';
  creditPackageId?: string;
  creditQuantity?: number;
  cardNumber?: string;
  cardHolder?: string;
  expireMonth?: string;
  expireYear?: string;
  expiry?: string;
  cvv?: string;
  userId?: string;
  username?: string;
  callbackUrl?: string;
  metadata?: Record<string, any>;
}

export interface PaymentProviderResult {
  success: boolean;
  providerPaymentId: string;
  paymentId?: string;
  status: SaasPaymentStatus;
  paidAt?: string;
  cardLast4?: string;
  cardBrand?: string;
  errorMessage?: string;
  rawResponse?: any;
}

export interface RefundPaymentParams {
  paymentId: string;
  providerPaymentId: string;
  amount: number;
  reason?: string;
}

export interface RefundResult {
  success: boolean;
  refundedAmount: number;
  refundId: string;
  errorMessage?: string;
}

export interface PaymentProvider {
  providerName: string;
  createPayment(params: CreatePaymentParams): Promise<PaymentProviderResult>;
  verifyPayment(providerPaymentId: string): Promise<PaymentProviderResult>;
  refundPayment(params: RefundPaymentParams): Promise<RefundResult>;
  validateWebhookSignature(payload: any, signature: string, secretKey: string): boolean;
}
