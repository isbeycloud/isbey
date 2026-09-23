import { canEnterCompany, companyIdentity } from '../../security/memberships';
import { Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { storage } from '../../db/storage';
import { MobileSyncService } from '../../services/mobileSyncService';
import { MobileDevice, DatabaseState } from '../../db/schema';
import { requireAuth } from '../../middleware/authGuards';
// FAZ 25.4: mobil login brute-force rate limit
import { mobileLoginRateLimit } from '../../middleware/productionSecurity';

const router = Router();

// FAZ 25.1: Fallback secret YASAK — secret yoksa istek açıkça reddedilir
// (authGuards.ts zaten boot'ta zorunlu tutuyor; burada savunma katmanı olarak tekrar kontrol edilir)
const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET ortam değişkeni tanımlı değil.');
  }
  return secret;
};

/**
 * Şifre doğrulama (auth.ts ile aynı desen: bcrypt hash + legacy plain-text)
 */
function verifyPassword(providedPass: string, storedHash: string): boolean {
  if (!providedPass || !storedHash) return false;
  if (!storedHash.startsWith('$2') && process.env.NODE_ENV !== 'production' && storedHash === providedPass) return true;
  try {
    return bcrypt.compareSync(providedPass, storedHash);
  } catch {
    return false;
  }
}

/**
 * POST /api/v1/mobile/auth/login
 * Mobil cihaz kaydı ve güvenli oturum başlatma
 *
 * FAZ 25.1 GÜVENLİK DÜZELTMESİ:
 *  - Sahte "mob-jwt-*" token KALDIRILDI → gerçek JWT (JWT_SECRET ile imzalı)
 *  - Pasif kullanıcılar reddedilir
 *  - Cihaz kaydı transaction içinde yapılır
 */
// FAZ 25.4 #3: Mobil login brute-force koruması — 15 dk / 30 deneme / IP
router.post('/auth/login', mobileLoginRateLimit, async (req, res) => {
  const { email, password, deviceId, deviceModel = 'Android Device', platform = 'ANDROID', appVersion = '1.0.0', pushToken, biometricEnabled } = req.body;

  if (typeof email !== 'string' || !email || typeof password !== 'string' || !password) {
    return res.status(400).json({ success: false, message: 'E-posta ve şifre zorunludur.' });
  }

  const db = storage.getState();
  const identifier = String(email).trim().toLowerCase();
  const user = (db.users || []).find(
    u => (u.email && u.email.toLowerCase() === identifier) || (u.username && u.username.toLowerCase() === identifier)
  );

  if (!user || !verifyPassword(String(password), user.passwordHash)) {
    return res.status(401).json({ success: false, message: 'Geçersiz e-posta veya şifre.' });
  }

  // FAZ 25.1: Pasif kullanıcı login'e kapatıldı
  if (!user.active) {
    return res.status(403).json({ success: false, message: 'Kullanıcı hesabınız pasife alınmıştır.' });
  }

  const tenantId = [user.companyId, ...db.tenants.map(t => t.id)].find(id => id && canEnterCompany(db, user, id));
  if (!tenantId) return res.status(403).json({ success: false, message: 'Aktif firma üyeliği bulunamadı.' });
  const now = new Date().toISOString();

  // Cihaz kaydı (transaction içinde — atomicity)
  const devId = deviceId || `dev-${crypto.randomBytes(6).toString('hex')}`;

  let device: MobileDevice | null = null;
  try {
    // FAZ 25.1 DÜZELTME: runTransaction Promise döndürür — await zorunludur
    const committed = await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.mobileDevices) draft.mobileDevices = [];
      let dev = draft.mobileDevices.find(d => d.deviceId === devId && d.userId === user.id);
      if (dev && dev.isRevoked) {
        return { blocked: true as const, device: null };
      }
      if (!dev) {
        dev = {
          id: `mdev-${Date.now()}`,
          tenantId,
          userId: user.id,
          userName: user.fullName || user.username,
          deviceId: devId,
          deviceModel,
          platform,
          appVersion,
          pushToken,
          biometricEnabled: !!biometricEnabled,
          isRevoked: false,
          lastActiveAt: now,
          createdAt: now,
        };
        draft.mobileDevices.push(dev);
      } else {
        dev.lastActiveAt = now;
        dev.appVersion = appVersion;
        if (pushToken) dev.pushToken = pushToken;
      }
      return { blocked: false as const, device: dev };
    });
    device = committed.blocked ? null : committed.device;
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Cihaz kaydı sırasında hata oluştu.' });
  }

  if (!device) {
    return res.status(403).json({ success: false, message: 'Bu cihaz yöneticiniz tarafından engellenmiştir.' });
  }

  // FAZ 25.1: Gerçek JWT — requireAuth zinciriyle doğrulanabilir
  const token = jwt.sign(
    {
      userId: user.id,
      username: user.username,
      fullName: user.fullName,
      role: companyIdentity(db, user, tenantId).role,
      tenantId,
      companyId: user.companyId || tenantId,
      allowedCompanyIds: user.allowedCompanyIds || [tenantId],
      deviceId: devId,
      type: 'mobile',
    },
    getJwtSecret(),
    { expiresIn: '30d' }
  );

  return res.json({
    success: true,
    message: 'Mobil giriş başarılı.',
    token,
    user: {
      id: user.id,
      name: user.fullName || user.username,
      email: user.email,
      role: user.role,
      tenantId,
    },
    device,
  });
});

// ══════════════════════════════════════════════════════════════════════════
// FAZ 25.1: Bu noktadan sonraki TÜM mobil uçları AUTH zorunlu.
// Tenant kimliği YALNIZCA token'dan (req.tenantId) alınır —
// req.query.tenantId / x-tenant-id başlığı asla yetki kaynağı değildir.
// ══════════════════════════════════════════════════════════════════════════
router.use(requireAuth);

/** Token'dan güvenli tenant çözümlemesi (IDOR karşıtı) */
const tenantFromToken = (req: any): string => req.tenantId;

/**
 * GET /api/v1/mobile/bootstrap
 * Mobil ilk kurulum ve hafif hidrasyon verisi
 *
 * FAZ 25.1 IDOR DÜZELTMESİ: tenantId artık yalnızca JWT'den gelir.
 * Önceki davranış (?tenantId= veya x-tenant-id ile başka firmanın verisini
 * okuyabilme) kaldırıldı.
 */
router.get('/bootstrap', (req, res) => {
  const tenantId = tenantFromToken(req);
  const db = storage.getState();

  const customers = (db.customers || [])
    .filter(c => c.tenantId === tenantId || (!c.tenantId && tenantId === 'tnt-isbey'))
    .map(c => ({
      id: c.id,
      code: c.code,
      title: c.title,
      taxNumber: c.taxNumber,
      phone: c.phone,
      city: c.city,
      district: c.district,
      balance: c.balance || 0,
    }));

  const products = (db.products || [])
    .filter(p => p.tenantId === tenantId || (!p.tenantId && tenantId === 'tnt-isbey'))
    .map(p => ({
      id: p.id,
      code: p.code,
      name: p.name,
      barcode: p.barcode,
      salePrice: p.salePrice || 0,
      stock: p.stock || 0,
      unit: p.unit || 'ADET',
      vatRate: p.vatRate || 20,
    }));

  const warehouses = (db.warehouses || [])
    .filter(w => w.tenantId === tenantId || (!w.tenantId && tenantId === 'tnt-isbey'))
    .map(w => ({ id: w.id, code: w.code, name: w.name }));

  const company = db.company || { name: 'İŞBEY Bulut ERP' };

  return res.json({
    success: true,
    serverTime: new Date().toISOString(),
    tenantId,
    company,
    customers,
    products,
    warehouses,
    settings: {
      currency: 'TRY',
      dailyCollectionLimit: 500000,
      requireGps: true,
      requireSignature: true,
      requirePhoto: false,
    },
  });
});

/**
 * POST /api/v1/mobile/sync
 * Çevrimdışı işlem kuyruğunu sunucuya senkronize eder
 *
 * FAZ 25.1: tenantId/userId istek gövdesinden DEĞİL, token'dan alınır.
 */
router.post('/sync', async (req, res) => {
  try {
    const { deviceId = 'dev-mobile', operations = [] } = req.body || {};
    const result = await MobileSyncService.processSyncBatch({
      tenantId: tenantFromToken(req),
      userId: req.user.id,
      userName: req.user.fullName || req.user.username,
      deviceId,
      operations,
    });
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message || 'Senkronizasyon hatası.' });
  }
});

/**
 * GET /api/v1/mobile/devices
 * Kayıtlı cihaz oturumlarını listeler (yalnızca kendi tenant'ı)
 */
router.get('/devices', (req, res) => {
  const tenantId = tenantFromToken(req);
  const db = storage.getState();
  const devices = (db.mobileDevices || []).filter(d => d.tenantId === tenantId);
  return res.json({ success: true, devices });
});

/**
 * POST /api/v1/mobile/devices/:id/revoke
 * Cihaz yetkisini uzaktan iptal eder
 *
 * FAZ 25.1: Yalnızca cihaz sahibi veya firma/platform yöneticisi iptal edebilir.
 */
router.post('/devices/:id/revoke', async (req, res) => {
  const { id } = req.params;
  const tenantId = tenantFromToken(req);
  const isPrivileged = ['SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'].includes(req.user.role);

  const updated = await storage.runTransaction((draft: DatabaseState) => {
    const dev = (draft.mobileDevices || []).find(
      d => d.id === id && d.tenantId === tenantId && (isPrivileged || d.userId === req.user.id)
    );
    if (!dev) return null;
    dev.isRevoked = true;
    dev.revokedAt = new Date().toISOString();
    dev.revokedBy = req.user.fullName || req.user.username; // FAZ 25.1: istemci değil, token belirler
    return dev;
  });

  if (!updated) return res.status(404).json({ success: false, message: 'Cihaz bulunamadı veya iptal yetkiniz yok.' });
  return res.json({ success: true, message: 'Cihaz oturumu başarıyla sonlandırıldı.', device: updated });
});

/**
 * GET /api/v1/mobile/dashboard
 * Mobil ana ekran özet finansal KPI'ları (yalnızca kendi tenant'ı)
 */
router.get('/dashboard', (req, res) => {
  const tenantId = tenantFromToken(req);
  const db = storage.getState();
  const today = new Date().toISOString().split('T')[0];

  const todayCollections = (db.fieldCollections || [])
    .filter(c => (c.tenantId === tenantId || (!c.tenantId && tenantId === 'tnt-isbey')) && c.collectionDate === today && c.status === 'CONFIRMED')
    .reduce((sum, c) => sum + c.amount, 0);

  const pendingCollections = (db.fieldCollections || [])
    .filter(c => (c.tenantId === tenantId || (!c.tenantId && tenantId === 'tnt-isbey')) && c.status === 'PENDING_APPROVAL')
    .reduce((sum, c) => sum + c.amount, 0);

  const totalCash = (db.cashRegisters || [])
    .filter(cr => cr.tenantId === tenantId || (!cr.tenantId && tenantId === 'tnt-isbey'))
    .reduce((sum, cr) => sum + (cr.balance || 0), 0);

  const totalBank = (db.bankAccounts || [])
    .filter(ba => ba.tenantId === tenantId || (!ba.tenantId && tenantId === 'tnt-isbey'))
    .reduce((sum, ba) => sum + (ba.balance || 0), 0);

  const totalReceivables = (db.customers || [])
    .filter(c => (c.tenantId === tenantId || (!c.tenantId && tenantId === 'tnt-isbey')) && (c.balance || 0) > 0)
    .reduce((sum, c) => sum + (c.balance || 0), 0);

  const criticalStockCount = (db.products || [])
    .filter(p => (p.tenantId === tenantId || (!p.tenantId && tenantId === 'tnt-isbey')) && (p.stock || 0) <= (p.minStock || 5))
    .length;

  const todayVisits = (db.customerVisits || [])
    .filter(v => (v.tenantId === tenantId || (!v.tenantId && tenantId === 'tnt-isbey')) && v.visitDate === today);

  return res.json({
    success: true,
    kpis: {
      todaySales: 45200,
      todayCollections,
      pendingCollections,
      totalCash,
      totalBank,
      totalReceivables,
      criticalStockCount,
      plannedVisitsCount: todayVisits.length,
      completedVisitsCount: todayVisits.filter(v => v.status === 'COMPLETED').length,
    },
  });
});

export default router;
