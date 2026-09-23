/**
 * İŞBEY CLOUD — Canlı QA Test Ekranı Route'u
 * ==========================================
 * POST /api/test-screen/run → tam raporu JSON olarak koşar.
 *
 * GÜVENLİK: requireAuth + requireRole('SUPER_ADMIN','ADMIN') zorunludur
 * (securityGate defaultDeny allowlist'inde DEĞİLDİR — bilinçli korumalı).
 *
 * Arayüz SPA İÇİNDE çalışır (src/components/modules/yonetim/LiveQaTestScreen.tsx):
 * tarayıcı sekmesi Authorization başlığı taşıyamayacağı için ayrı HTML sayfası
 * YAPILMADI; token SPA api istemcisi (services/api.ts) tarafından otomatik eklenir.
 * Rapor secret değer SIZDIRMAZ (yalnız SET/UNSET).
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/authGuards';
import { TestScreenService } from '../services/testScreenService';

export const testScreenRouter = Router();

// Tüm uçlar: platform yöneticisi zorunlu
testScreenRouter.use(requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'));

testScreenRouter.post('/run', async (_req: Request, res: Response) => {
  try {
    const report = await TestScreenService.runFullReport();
    res.json({ success: true, report });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Test raporu üretilmedi.' });
  }
});
