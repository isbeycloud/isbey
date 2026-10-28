export type DeviceTransport = 'USB' | 'TCP_IP' | 'SERIAL' | 'CLOUD';
export type DeviceBrand = 'BEKO' | 'INGENICO' | 'HUGIN' | 'VERIFONE' | 'PAVO' | 'OTHER';
export interface FiscalAdapterManifest {
  id: string;
  brand: DeviceBrand;
  name: string;
  stage: 'DOCUMENTATION_REVIEWED' | 'VENDOR_PENDING';
  transports: DeviceTransport[];
  referenceModels: string[];
  documentationUrl?: string;
  collectionAvailable: false;
}

// Katalogdaki her kayıt entegrasyon hedefidir; tamamlanmış cihaz desteği değildir.
const catalog: FiscalAdapterManifest[] = [
  { id: 'beko-tokenx-wire', brand: 'BEKO', name: 'Beko / TokenX Kablolu', stage: 'DOCUMENTATION_REVIEWED', transports: ['USB'], referenceModels: ['300TR', 'X30TR'],
    documentationUrl: 'https://developer.tokeninc.com/token-developer-portal-1/x-platform/token-x-connect-wire', collectionAvailable: false },
  { id: 'beko-tokenx-cloud', brand: 'BEKO', name: 'Beko / TokenX Bulut', stage: 'DOCUMENTATION_REVIEWED', transports: ['CLOUD'], referenceModels: [],
    documentationUrl: 'https://developer.tokeninc.com/token-developer-portal-1/x-platform/token-x-connect-cloud/tokenx-api-integration-en', collectionAvailable: false },
  ...(['INGENICO', 'HUGIN', 'VERIFONE', 'PAVO', 'OTHER'] as const).map(brand => ({
    id: brand.toLowerCase() + '-pending', brand, name: brand === 'OTHER' ? 'Diğer marka' : brand,
    stage: 'VENDOR_PENDING' as const, transports: ['USB', 'TCP_IP', 'SERIAL', 'CLOUD'] as DeviceTransport[],
    referenceModels: [], collectionAvailable: false as const,
  })),
];

export const fiscalAdapterCatalog = (): FiscalAdapterManifest[] => structuredClone(catalog);

export interface FiscalDeviceProfile {
  id: string;
  tenantId: string;
  name: string;
  adapterId: string;
  model: string;
  serialNumber: string;
  branchLabel: string;
  workstationName: string;
  transport: DeviceTransport;
  connectionHint: string;
  host?: string;
  port?: number;
  status: 'DRAFT' | 'DISABLED';
  revision: string;
  createdAt: string;
  updatedAt: string;
}

export interface FiscalDeviceInput {
  name: string; adapterId: string; model: string; serialNumber: string;
  branchLabel: string; workstationName: string; transport: DeviceTransport;
  connectionHint: string; host?: string; port?: number; expectedRevision?: string;
}

export interface FiscalSaleRequest {
  operationId: string;
  deviceId: string;
  tenantId: string;
  documentId: string;
  amountMinor: number;
  currency: 'TRY';
}

// Kanıtlanmış ödeme sonucu olmadan ERP muhasebesine bağlanmayan ortak sözleşme.
export interface FiscalDeviceAdapter {
  id: string;
  inspect(profile: FiscalDeviceProfile): Promise<{ state: 'UNVERIFIED'; message: string }>;
  collect(request: FiscalSaleRequest): Promise<FiscalOperationResult>;
  query(operationId: string): Promise<FiscalOperationResult>;
  cancel(operationId: string): Promise<FiscalOperationResult>;
}

export type FiscalOperationResult = {
  operationId: string; providerOperationId: string; deviceId: string; amountMinor: number; currency: 'TRY';
} & ({ status: 'CONFIRMED'; receiptNumber: string } | { status: 'DECLINED' | 'UNKNOWN' | 'CANCELLED'; message: string });

export class FiscalDeviceUnavailableError extends Error {
  readonly code = 'FISCAL_DEVICE_NOT_READY';
  constructor() { super('Cihaz bağlantısı henüz doğrulanmadı. Tahsilat yapılmadı.'); }
}

export function createFiscalAdapterRegistry() {
  // Üretici SDK'ları burada ayrı modüllerle yer alacak; bilinmeyen markaya mock fallback yok.
  const adapters = new Map<string, FiscalDeviceAdapter>(catalog.map(item => [item.id, {
    id: item.id,
    async inspect() { return { state: 'UNVERIFIED' as const, message: 'Üretici bağlantısı ve cihaz testi bekleniyor. Bu kontrol cihazla iletişim kurmaz.' }; },
    async collect() { throw new FiscalDeviceUnavailableError(); },
    async query() { throw new FiscalDeviceUnavailableError(); },
    async cancel() { throw new FiscalDeviceUnavailableError(); },
  }]));
  return {
    get(id: string): FiscalDeviceAdapter {
      const adapter = adapters.get(id);
      if (!adapter) throw new FiscalDeviceUnavailableError();
      return adapter;
    },
    manifests: fiscalAdapterCatalog,
  };
}
