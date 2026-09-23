import { storage } from '../../db/storage';
import { UserDevice, DatabaseState } from '../../db/schema';

export class DeviceService {
  /**
   * Kullanıcının bağlı cihazlarını listeler
   */
  public static getDevices(userId: string, tenantId: string): UserDevice[] {
    const db = storage.getState();
    return (db.userDevices || []).filter(
      d => (d.userId === userId || d.tenantId === tenantId || (!d.tenantId && tenantId === 'tnt-isbey')) && !d.isBlocked
    );
  }

  /**
   * Cihaz oturumunu uzaktan sonlandırır
   */
  public static async terminateDevice(deviceId: string, tenantId: string) {
    return await storage.runTransaction((draft: DatabaseState) => {
      const dev = (draft.userDevices || []).find(d => d.id === deviceId && (d.tenantId === tenantId || (!d.tenantId && tenantId === 'tnt-isbey')));
      if (!dev) throw new Error('Cihaz bulunamadı.');
      dev.isBlocked = true;
      return { success: true, message: `${dev.deviceName} cihazının oturumu kapatıldı.` };
    });
  }
}
