export interface PackageCheckoutPreview {
  tenantId: string;
  planId: string;
  planName: string;
  billingCycle: 'monthly' | 'yearly';
  catalogAmount: number;
  currency: 'TRY';
  checkoutAvailable: false;
  priceFinalized: false;
  paymentCollected: false;
  message: string;
}

export interface GarantiReadiness {
  provider: 'GARANTI_BBVA';
  model: '3D_OOS_PAY';
  stage: 'PREPARATION';
  checkoutAvailable: false;
  mode: 'TEST' | 'PROD' | null;
  configurationComplete: boolean;
  checks: { key: string; label: string; configured: boolean }[];
  identifiersValid: boolean;
  publicUrlValid: boolean;
  message: string;
}
