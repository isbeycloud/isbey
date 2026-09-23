import { PosTransaction, PosTransactionType, PosTransactionStatus, PosProviderType } from '../../db/schema';

export interface PosPaymentRequest {
  tenantId: string;
  companyId: string;
  amount: number;
  currency: 'TRY' | 'USD' | 'EUR';
  transactionType: PosTransactionType;
  referenceType: 'INVOICE' | 'FIELD_COLLECTION' | 'DIRECT_SALE';
  referenceId?: string;
  cardNumber?: string;
  cardExpiry?: string;
  cardCvv?: string;
  installment?: number;
  cardHolderName?: string;
}

export interface PosPaymentResponse {
  success: boolean;
  provider: PosProviderType;
  providerTransactionId: string;
  status: PosTransactionStatus;
  authCode?: string;
  cardLast4?: string;
  cardBrand?: string;
  errorMessage?: string;
  responsePayload?: Record<string, any>;
}

export interface IPosProvider {
  name: string;
  providerId: PosProviderType;
  createPayment(req: PosPaymentRequest): Promise<PosPaymentResponse>;
  checkPayment(providerTransactionId: string): Promise<PosPaymentResponse>;
  refundPayment(providerTransactionId: string, amount: number): Promise<PosPaymentResponse>;
  cancelPayment(providerTransactionId: string): Promise<PosPaymentResponse>;
}
