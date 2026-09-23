import crypto from 'crypto';
import { storage } from '../../db/storage';
import { ApiApplication, ApiKeyCredential, ApiUsageLog, DatabaseState } from '../../db/schema';

export class ApiPlatformService {
  /**
   * Yeni API Anahtarı üretir (Secret sadece ilk defa gösterilir)
   */
  public static async createApiKey(params: {
    tenantId: string;
    applicationId: string;
    name: string;
    isSandbox?: boolean;
    scopes: string[];
    rateLimitTier?: 'BASIC' | 'PRO' | 'ENTERPRISE';
  }): Promise<{ credential: ApiKeyCredential; plainSecretKey: string }> {
    const { tenantId, applicationId, name, isSandbox = false, scopes, rateLimitTier = 'BASIC' } = params;
    const now = new Date().toISOString();

    const prefix = isSandbox ? 'isb_test_' : 'isb_live_';
    const randomSecret = crypto.randomBytes(24).toString('hex');
    const plainSecretKey = `${prefix}${randomSecret}`;

    // SHA-256 Hash
    const keyFingerprint = crypto.createHash('sha256').update(plainSecretKey).digest('hex');

    const credential: ApiKeyCredential = {
      id: `key-${Date.now()}`,
      tenantId,
      applicationId,
      name,
      keyPrefix: prefix,
      keyFingerprint,
      scopes,
      rateLimitTier,
      isRevoked: false,
      createdAt: now,
    };

    return await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.apiKeyCredentials) draft.apiKeyCredentials = [];
      draft.apiKeyCredentials.push(credential);
      return { credential, plainSecretKey };
    });
  }

  /**
   * API Key doğrulaması ve scope kontrolü
   */
  public static validateApiKey(plainKey: string, requiredScope?: string): { valid: boolean; tenantId?: string; error?: string } {
    const db = storage.getState();
    const hash = crypto.createHash('sha256').update(plainKey).digest('hex');

    const cred = (db.apiKeyCredentials || []).find(k => k.keyFingerprint === hash && !k.isRevoked);
    if (!cred) return { valid: false, error: 'Geçersiz veya iptal edilmiş API Anahtarı.' };

    if (requiredScope && !cred.scopes.includes(requiredScope) && !cred.scopes.includes('*')) {
      return { valid: false, error: `Bu işlem için yetkiniz yok (${requiredScope} scope gerekli).` };
    }

    return { valid: true, tenantId: cred.tenantId };
  }

  /**
   * API İsteğini loglar
   */
  public static logApiRequest(log: Omit<ApiUsageLog, 'id' | 'createdAt'>) {
    const now = new Date().toISOString();
    storage.runTransaction((draft: DatabaseState) => {
      if (!draft.apiUsageLogs) draft.apiUsageLogs = [];
      draft.apiUsageLogs.unshift({
        id: `apilog-${Date.now()}`,
        ...log,
        createdAt: now,
      });
      if (draft.apiUsageLogs.length > 500) draft.apiUsageLogs.pop();
    });
  }
}
