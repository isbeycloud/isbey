export type { FiscalDeviceProfile, FiscalDeviceInput, FiscalAdapterManifest, DeviceTransport } from '../../packages/fiscal-device-kit/src/index';
export interface FiscalDeviceReadiness {
  deviceId: string;
  state: 'UNVERIFIED';
  connected: false;
  collectionAvailable: false;
  hardwareContacted: false;
  message: string;
  checks: { label: string; state: string }[];
}
