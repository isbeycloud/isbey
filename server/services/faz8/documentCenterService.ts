import crypto from 'crypto';
import { storage } from '../../db/storage';
import { DocumentItem, DocumentVersion, PublicShareToken, DatabaseState } from '../../db/schema';
import { ActivityAuditService } from './activityAuditService';

export class DocumentCenterService {
  /**
   * Yeni belge yükler veya mevcut belgenin yeni versiyonunu (v2, v3) ekler
   */
  public static async uploadDocument(params: {
    tenantId: string;
    existingDocumentId?: string;
    category: DocumentItem['category'];
    folderName: string;
    documentNo?: string;
    title: string;
    description?: string;
    tags?: string[];
    fileName: string;
    fileSize: number;
    mimeType: string;
    fileUrl: string;
    uploadedByUserId: string;
    uploadedByName: string;
    changeSummary?: string;
    sharedWithMaliMusavir?: boolean;
  }): Promise<DocumentItem> {
    const {
      tenantId,
      existingDocumentId,
      category,
      folderName,
      documentNo,
      title,
      description,
      tags = [],
      fileName,
      fileSize,
      mimeType,
      fileUrl,
      uploadedByUserId,
      uploadedByName,
      changeSummary,
      sharedWithMaliMusavir = true,
    } = params;

    const now = new Date().toISOString();

    return await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.documents) draft.documents = [];

      let doc: DocumentItem | undefined;

      if (existingDocumentId) {
        doc = draft.documents.find(d => d.id === existingDocumentId && (d.tenantId === tenantId || (!d.tenantId && tenantId === 'tnt-isbey')));
      }

      if (doc) {
        // Yeni Versiyon Ekleme
        const nextVer = doc.currentVersion + 1;
        const newVersion: DocumentVersion = {
          versionNumber: nextVer,
          fileUrl,
          fileName,
          fileSize,
          uploadedByUserId,
          uploadedByName,
          uploadedAt: now,
          changeSummary: changeSummary || `v${nextVer} versiyonu yüklendi.`,
        };

        doc.versions.unshift(newVersion);
        doc.currentVersion = nextVer;
        doc.fileUrl = fileUrl;
        doc.fileName = fileName;
        doc.fileSize = fileSize;
        doc.mimeType = mimeType;
        doc.updatedAt = now;

        ActivityAuditService.logActivityDraft(draft, {
          tenantId,
          userId: uploadedByUserId,
          userName: uploadedByName,
          actionType: 'UPLOAD',
          entityType: 'DOCUMENT',
          entityId: doc.id,
          title: `${doc.title} belgesine v${nextVer} versiyonu eklendi.`,
        });

        return doc;
      } else {
        // Sıfırdan Yeni Belge Oluşturma
        const docId = `doc-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
        const initialVersion: DocumentVersion = {
          versionNumber: 1,
          fileUrl,
          fileName,
          fileSize,
          uploadedByUserId,
          uploadedByName,
          uploadedAt: now,
          changeSummary: changeSummary || 'İlk versiyon oluşturuldu.',
        };

        const newDoc: DocumentItem = {
          id: docId,
          tenantId,
          category,
          folderName: folderName || 'Genel',
          documentNo,
          title,
          description,
          tags,
          currentVersion: 1,
          versions: [initialVersion],
          fileUrl,
          fileName,
          fileSize,
          mimeType,
          sharedWithMaliMusavir,
          isArchived: false,
          createdAt: now,
          updatedAt: now,
        };

        draft.documents.unshift(newDoc);

        ActivityAuditService.logActivityDraft(draft, {
          tenantId,
          userId: uploadedByUserId,
          userName: uploadedByName,
          actionType: 'CREATE',
          entityType: 'DOCUMENT',
          entityId: newDoc.id,
          title: `Yeni belge yüklendi: ${newDoc.title}`,
        });

        return newDoc;
      }
    });
  }

  /**
   * Güvenli harici paylaşım token'ı üretir
   */
  public static async createShareToken(params: {
    tenantId: string;
    entityType: 'DOCUMENT' | 'ACCOUNT_STATEMENT' | 'INVOICE';
    entityId: string;
    title: string;
    password?: string;
    expiresInHours?: number;
    downloadLimit?: number;
  }): Promise<PublicShareToken> {
    const { tenantId, entityType, entityId, title, password, expiresInHours = 72, downloadLimit = 10 } = params;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInHours * 60 * 60 * 1000).toISOString();
    const token = `isb_sh_${crypto.randomBytes(16).toString('hex')}`;

    const newToken: PublicShareToken = {
      id: `tok-${Date.now()}`,
      tenantId,
      entityType,
      entityId,
      token,
      hasPassword: !!password,
      passwordHash: password ? crypto.createHash('sha256').update(password).digest('hex') : undefined,
      expiresAt,
      downloadLimit,
      downloadCount: 0,
      isRevoked: false,
      title,
      createdAt: now.toISOString(),
    };

    return await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.publicShareTokens) draft.publicShareTokens = [];
      draft.publicShareTokens.unshift(newToken);
      return newToken;
    });
  }

  /**
   * Paylaşım token'ını çözer ve doğrular
   */
  public static resolveShareToken(tokenStr: string, passwordAttempt?: string) {
    const db = storage.getState();
    const token = (db.publicShareTokens || []).find(t => t.token === tokenStr && !t.isRevoked);

    if (!token) throw new Error('Geçersiz veya iptal edilmiş paylaşım bağlantısı.');

    if (new Date() > new Date(token.expiresAt)) {
      throw new Error('Bu paylaşım bağlantısının geçerlilik süresi dolmuştur.');
    }

    if (token.downloadLimit > 0 && token.downloadCount >= token.downloadLimit) {
      throw new Error('Bu belgenin indirme/görüntüleme limiti dolmuştur.');
    }

    if (token.hasPassword) {
      if (!passwordAttempt) {
        return { requiresPassword: true, title: token.title };
      }
      const attemptHash = crypto.createHash('sha256').update(passwordAttempt).digest('hex');
      if (attemptHash !== token.passwordHash) {
        throw new Error('Geçersiz paylaşım şifresi.');
      }
    }

    // Belge veya Ekstre bilgisini çek
    let documentData: any = null;
    if (token.entityType === 'DOCUMENT') {
      documentData = (db.documents || []).find(d => d.id === token.entityId);
    } else if (token.entityType === 'ACCOUNT_STATEMENT') {
      const customer = (db.customers || []).find(c => c.id === token.entityId);
      const txs = (db.currentTransactions || []).filter(tx => tx.customerId === token.entityId);
      documentData = { customer, transactions: txs };
    }

    return {
      requiresPassword: false,
      token,
      data: documentData,
    };
  }
}
