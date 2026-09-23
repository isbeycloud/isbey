import { storage } from '../../db/storage';
import { PartnerNode, DatabaseState } from '../../db/schema';

export class PartnerService {
  /**
   * Tüm bayileri ve alt bayileri listeler
   */
  public static getPartners(parentPartnerId?: string): PartnerNode[] {
    const db = storage.getState();
    let list = db.partnerNodes || [];
    if (parentPartnerId !== undefined) {
      list = list.filter(p => p.parentPartnerId === parentPartnerId);
    }
    return list;
  }

  /**
   * ID'ye göre bayi bulur
   */
  public static getPartnerById(id: string): PartnerNode | undefined {
    const db = storage.getState();
    return (db.partnerNodes || []).find(p => p.id === id);
  }

  /**
   * Yeni Bayi veya Alt Bayi Oluşturur
   */
  public static async createPartner(params: {
    parentPartnerId?: string | null;
    role: 'DEALER' | 'SUB_DEALER';
    code: string;
    name: string;
    contactName: string;
    email: string;
    phone: string;
    city: string;
    taxNumber?: string;
    defaultCommissionRate?: number;
  }): Promise<PartnerNode> {
    const now = new Date().toISOString();
    return await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.partnerNodes) draft.partnerNodes = [];

      const node: PartnerNode = {
        id: `partner-${Date.now()}`,
        parentPartnerId: params.parentPartnerId || null,
        role: params.role,
        code: params.code,
        name: params.name,
        contactName: params.contactName,
        email: params.email,
        phone: params.phone,
        city: params.city,
        taxNumber: params.taxNumber,
        defaultCommissionRate: params.defaultCommissionRate || (params.role === 'DEALER' ? 20 : 10),
        walletBalance: 0,
        pendingCommission: 0,
        paidCommissionTotal: 0,
        assignedTenantIds: [],
        subDealerIds: [],
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };

      draft.partnerNodes.push(node);

      if (params.parentPartnerId) {
        const parent = draft.partnerNodes.find(p => p.id === params.parentPartnerId);
        if (parent) {
          if (!parent.subDealerIds) parent.subDealerIds = [];
          parent.subDealerIds.push(node.id);
        }
      }

      return node;
    });
  }

  /**
   * Bayiye müşteri tenant atar
   */
  public static async assignTenantToDealer(dealerId: string, tenantId: string): Promise<PartnerNode> {
    return await storage.runTransaction((draft: DatabaseState) => {
      const partner = (draft.partnerNodes || []).find(p => p.id === dealerId);
      if (!partner) throw new Error('Bayi bulunamadı.');
      if (!partner.assignedTenantIds.includes(tenantId)) {
        partner.assignedTenantIds.push(tenantId);
        partner.updatedAt = new Date().toISOString();
      }
      return partner;
    });
  }
}
