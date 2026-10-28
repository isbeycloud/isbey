import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import type { DatabaseState } from '../../db/schema';
import { fiscalAdapterCatalog, createFiscalAdapterRegistry } from '../../../packages/fiscal-device-kit/src/index';
import type { FiscalDeviceProfile } from '../../../packages/fiscal-device-kit/src/index';

export class FiscalConfigurationError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const fields = ['name', 'adapterId', 'model', 'serialNumber', 'branchLabel', 'workstationName', 'transport', 'connectionHint', 'host', 'port', 'expectedRevision'];
function validate(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new FiscalConfigurationError('Cihaz bilgilerini girin.');
  const body = input as Record<string, unknown>;
  if (Object.keys(body).some(k => !fields.includes(k))) throw new FiscalConfigurationError('Tanımsız cihaz alanı gönderildi. Parola veya kart bilgisi kaydedilmez.');
  const text = (key: string, required = false, max = 100) => {
    if (body[key] !== undefined && typeof body[key] !== 'string') throw new FiscalConfigurationError('Cihaz alanlarının biçimi geçerli değil.');
    const value = (body[key] as string || '').trim();
    if ((required && !value) || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw new FiscalConfigurationError('Cihaz bilgileri eksik veya çok uzun.');
    return value;
  };
  const adapterId = text('adapterId', true);
  const manifest = fiscalAdapterCatalog().find(a => a.id === adapterId);
  if (!manifest || !manifest.transports.includes(body.transport as never)) throw new FiscalConfigurationError('Marka ve bağlantı yöntemi seçin.');
  const host = text('host', false, 45);
  const port = body.port;
  if (body.transport === 'TCP_IP') {
    const parts = host.split('.').map(Number);
    const privateIp = isIP(host) === 4 && (parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168));
    if (!privateIp || !Number.isInteger(port) || (port as number) < 1 || (port as number) > 65535) throw new FiscalConfigurationError('Yerel ağ cihazı için özel IPv4 adresi ve geçerli port girin.');
  } else if (host || port !== undefined) throw new FiscalConfigurationError('IP ve port yalnız yerel ağ bağlantısında kullanılır.');
  const connectionHint = text('connectionHint', false, 64);
  if (/[\\<>|;&`$]/.test(connectionHint) || connectionHint.includes('://')) throw new FiscalConfigurationError('Bağlantı notuna adres, komut veya parola yazmayın.');
  return { name: text('name', true), adapterId, model: text('model', true, 60), serialNumber: text('serialNumber', true, 60),
    branchLabel: text('branchLabel', true), workstationName: text('workstationName', true), transport: body.transport as FiscalDeviceProfile['transport'],
    connectionHint, ...(host ? { host, port: port as number } : {}), expectedRevision: text('expectedRevision') };
}

export function saveFiscalDevice(db: DatabaseState, tenantId: string, input: unknown, actor: { id: string; username: string; ipAddress: string }, id?: string) {
  const value = validate(input);
  if (!db.tenants.some(t => t.id === tenantId && !t.isArchived)) throw new FiscalConfigurationError('Firma bulunamadı.', 404);
  const old = id ? db.fiscalDevices?.find(d => d.id === id && d.tenantId === tenantId) : undefined;
  if (id && !old) throw new FiscalConfigurationError('Cihaz tanımı bulunamadı.', 404);
  if (old && value.expectedRevision !== old.revision) throw new FiscalConfigurationError('Cihaz tanımı değişmiş. Listeyi yenileyin.', 409);
  if (db.fiscalDevices?.some(d => d.tenantId === tenantId && d.id !== id && d.status !== 'DISABLED' && d.serialNumber.toLocaleUpperCase('tr-TR') === value.serialNumber.toLocaleUpperCase('tr-TR'))) {
    throw new FiscalConfigurationError('Bu sicil/seri numarası firmada zaten tanımlı.', 409);
  }
  const { expectedRevision: _expected, ...data } = value;
  const now = new Date().toISOString();
  const device: FiscalDeviceProfile = { ...data, id: old?.id || randomUUID(), tenantId, status: old?.status || 'DRAFT',
    revision: randomUUID(), createdAt: old?.createdAt || now, updatedAt: now };
  db.fiscalDevices ||= [];
  if (old) db.fiscalDevices[db.fiscalDevices.indexOf(old)] = device;
  else db.fiscalDevices.push(device);
  db.auditLogs ||= [];
  db.auditLogs.unshift({ id: randomUUID(), tenantId, companyId: tenantId, userId: actor.id, username: actor.username, ipAddress: actor.ipAddress,
    action: old ? 'FISCAL_DEVICE_UPDATED' : 'FISCAL_DEVICE_CREATED', module: 'SETTINGS', timestamp: now,
    details: JSON.stringify({ deviceId: device.id, adapterId: device.adapterId, state: device.status, connected: false, paymentCollected: false }) });
  return device;
}

export async function inspectFiscalDevice(profile: FiscalDeviceProfile) {
  const result = await createFiscalAdapterRegistry().get(profile.adapterId).inspect(profile);
  return { deviceId: profile.id, ...result, connected: false, collectionAvailable: false, hardwareContacted: false,
    checks: [
      { label: 'Cihaz tanımı', state: profile.status === 'DISABLED' ? 'DISABLED' : 'SAVED' },
      { label: 'Üretici bağlantısı', state: 'PENDING' },
      { label: 'Mağaza bağlantı bileşeni', state: 'UNVERIFIED' },
      { label: 'Cihaz üzerinde test', state: 'UNVERIFIED' },
    ] };
}
