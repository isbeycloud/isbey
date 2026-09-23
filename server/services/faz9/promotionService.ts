import crypto from 'crypto';
import { storage } from '../../db/storage';
import { PromoCoupon, ReferralProgramRecord, DatabaseState } from '../../db/schema';
import { CreditWalletService } from './creditWalletService';

export class PromotionService {
  /**
   * Kupon kodunu doğrular
   */
  public static validateCoupon(code: string, amount: number): { valid: boolean; discountAmount: number; message?: string } {
    const db = storage.getState();
    const coupon = (db.promoCoupons || []).find(c => c.code.toUpperCase() === code.toUpperCase() && c.isActive);

    if (!coupon) return { valid: false, discountAmount: 0, message: 'Geçersiz veya süresi dolmuş kupon kodu.' };

    if (coupon.currentRedemptions >= coupon.maxRedemptions) {
      return { valid: false, discountAmount: 0, message: 'Bu kuponun kullanım limiti dolmuştur.' };
    }

    if (coupon.minAmount && amount < coupon.minAmount) {
      return { valid: false, discountAmount: 0, message: `Bu kupon en az ${coupon.minAmount} TL tutarındaki işlemlerde geçerlidir.` };
    }

    const discountAmount = coupon.discountType === 'PERCENTAGE'
      ? Math.round((amount * (coupon.discountValue / 100)) * 100) / 100
      : Math.min(amount, coupon.discountValue);

    return { valid: true, discountAmount, message: `İndirim uygulandı (%${coupon.discountValue} / ${discountAmount} TL).` };
  }

  /**
   * Tenant için davet (Referral) kodu oluşturur
   */
  public static getOrCreateReferralCode(tenantId: string): string {
    const code = `ISBEY-${tenantId.replace('tnt-', '').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    return code;
  }

  /**
   * Referral ile kayıt olan yeni tenant'ı ödüllendirir
   */
  public static async processReferralReward(inviterTenantId: string, invitedTenantId: string) {
    const now = new Date().toISOString();

    await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.referralRecords) draft.referralRecords = [];

      draft.referralRecords.push({
        id: `ref-${Date.now()}`,
        inviterTenantId,
        invitedTenantId,
        referralCode: `REF-${inviterTenantId}`,
        status: 'CONVERTED',
        inviterRewardCredits: 100,
        inviteeRewardCredits: 50,
        rewardGranted: true,
        createdAt: now,
        convertedAt: now,
      });

      // Davet edene 100 kontör ekle
      const inviterWallet = (draft.creditWallets || []).find(w => w.tenantId === inviterTenantId);
      if (inviterWallet) inviterWallet.balance += 100;

      // Yeni kayıt olana 50 kontör ekle
      const invitedWallet = (draft.creditWallets || []).find(w => w.tenantId === invitedTenantId);
      if (invitedWallet) invitedWallet.balance += 50;

      return true;
    });
  }
}
