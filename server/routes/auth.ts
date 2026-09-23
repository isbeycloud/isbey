import usersRouter from './users';
import { redactSecretsDeep } from '../security/credentialMask';
import { canEnterCompany, companyIdentity } from '../security/memberships';
import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { storage } from '../db/storage';
import { Tenant, User } from '../db/schema';
// FAZ 25.1: /auth/users uçları artık korumalı (RBAC)
import { requireAuth } from '../middleware/authGuards';
// FAZ 25.4: login brute-force rate limit
import { loginRateLimit } from '../middleware/productionSecurity';
// FAZ 28: Monitoring & Observability auth izleme
import { MonitoringService } from '../services/monitoringService';

export const authRouter = Router();

// FAZ 9: Fallback JWT secret YASAK — secret yoksa uygulama açıkça hata verir (CLAUDE.md kuralı)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET ortam değişkeni tanımlı değil. .env dosyasına JWT_SECRET ekleyin.');
}
const JWT_EXPIRES_IN = '7d';

/**
 * Helper: JWT Token üretir
 */
export function generateToken(user: User, tenantId: string): string {
  const payload = {
    userId: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    tenantId: tenantId,
    companyId: user.companyId || tenantId,
    allowedCompanyIds: user.allowedCompanyIds || [tenantId],
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Helper: Şifre doğrulama (hem bcrypt hash hem plain-text geriye uyumlu)
 */
function verifyPassword(providedPass: string, storedHash: string): boolean {
  if (!providedPass || !storedHash) return false;
  // Never accept a stored bcrypt hash as the password itself.
  if (!storedHash.startsWith('$2') && process.env.NODE_ENV !== 'production' && storedHash === providedPass) return true;
  try {
    return bcrypt.compareSync(providedPass, storedHash);
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 1. LOGIN (GİRİŞ)
// ──────────────────────────────────────────────────────────────────────────
// FAZ 25.4 #3: Login brute-force koruması — 15 dk / 20 deneme / IP
authRouter.post('/login', loginRateLimit, (req: Request, res: Response) => {
  const { username, password, email } = req.body;
  // FAZ 25.1: Girdi tipi doğrulaması — string dışı identifier (ör. NoSQL payload) 400 ile reddedilir
  if (typeof username !== 'string' && typeof email !== 'string') {
    return res.status(400).json({ success: false, message: 'Kullanıcı adı/e-posta ve şifre zorunludur.' });
  }
  const loginIdentifier = String(username || email || '').trim().toLowerCase();

  if (!loginIdentifier || typeof password !== 'string' || !password) {
    return res.status(400).json({ success: false, message: 'Kullanıcı adı/e-posta ve şifre zorunludur.' });
  }

  const db = storage.getState();
  const user = db.users.find(
    u => u.username.toLowerCase() === loginIdentifier || u.email.toLowerCase() === loginIdentifier
  );

  if (!user || !verifyPassword(password, user.passwordHash)) {
    MonitoringService.recordAuthEvent('FAILED', loginIdentifier, req.ip || '127.0.0.1', {
      reason: 'Geçersiz kimlik bilgisi',
    });
    storage.addAuditLog({
      userId: 'anonymous',
      username: loginIdentifier || 'unknown',
      action: 'LOGIN',
      module: 'AUTH',
      ipAddress: req.ip || '127.0.0.1',
      details: `Başarısız giriş denemesi: ${loginIdentifier}`,
    });
    return res.status(401).json({ success: false, message: 'Geçersiz kullanıcı adı, e-posta veya şifre!' });
  }

  if (!user.active) {
    return res.status(403).json({ success: false, message: 'Kullanıcı hesabı pasif durumda! Lütfen yöneticinizle iletişime geçin.' });
  }

  // Kullanıcının bağlı olduğu tenant / şirket
  const activeTenantId = [user.companyId, ...db.tenants.map(t => t.id)].find(id => id && canEnterCompany(db, user, id));
  if (!activeTenantId) return res.status(403).json({ success: false, message: 'Erişilebilir aktif firma üyeliği bulunamadı.' });
  const tenant = (db.tenants || []).find(t => t.id === activeTenantId);

  // Güncelle: Son giriş zamanı
  user.lastLoginAt = new Date().toISOString();
  user.lastLoginIp = req.ip || '127.0.0.1';

  // Otomatik Bcrypt yükseltmesi (eğer henüz bcrypt ile hashlenmemişse)
  if (!user.passwordHash.startsWith('$2a$') && !user.passwordHash.startsWith('$2b$')) {
    user.passwordHash = bcrypt.hashSync(password, 10);
  }

  MonitoringService.recordAuthEvent('SUCCESS', user.username, req.ip || '127.0.0.1', {
    tenantId: activeTenantId,
    userId: user.id,
  });

  storage.addAuditLog({
    userId: user.id,
    username: user.username,
    companyId: activeTenantId,
    companyName: tenant?.name || 'İŞBEY',
    action: 'LOGIN',
    module: 'AUTH',
    ipAddress: req.ip || '127.0.0.1',
    details: `${user.fullName} (${user.role}) sisteme giriş yaptı`,
  });

  const token = generateToken(user, activeTenantId);
  const safeUser = companyIdentity(db, user, activeTenantId);

  return res.json({
    success: true,
    message: `Hoş geldiniz, ${user.fullName}!`,
    token,
    user: safeUser,
    activeTenant: redactSecretsDeep(tenant) || {
      id: activeTenantId,
      name: user.companyName || 'İŞBEY',
      title: user.companyName || 'İŞBEY Cloud',
      plan: 'STARTER',
      status: 'ACTIVE',
    },
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 2. SELF-SERVICE REGISTER (ÜCRETSİZ 14 GÜNLÜK DENEME KAYDI)
// ──────────────────────────────────────────────────────────────────────────
authRouter.post('/register', async (req: Request, res: Response) => {
  const {
    fullName,
    email,
    phone,
    companyName,
    taxNumber,
    taxOffice,
    city,
    password,
  } = req.body;

  if (!fullName || !email || !companyName || !password) {
    return res.status(400).json({
      success: false,
      message: 'Ad Soyad, E-Posta, Firma Ünvanı ve Şifre alanları zorunludur.',
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Şifreniz en az 6 karakter uzunluğunda olmalıdır.',
    });
  }

  const cleanEmail = email.trim().toLowerCase();
  const db = storage.getState();

  // E-posta veya kullanıcı adı çakışması kontrolü
  const baseUsername = cleanEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') || `user${Date.now()}`;
  let finalUsername = baseUsername;
  let counter = 1;
  while (db.users.some(u => u.username.toLowerCase() === finalUsername.toLowerCase())) {
    finalUsername = `${baseUsername}${counter++}`;
  }

  if (db.users.some(u => u.email.toLowerCase() === cleanEmail)) {
    return res.status(400).json({
      success: false,
      message: 'Bu e-posta adresi ile kayıtlı bir kullanıcı zaten mevcut. Lütfen giriş yapınız.',
    });
  }

  try {
    const now = new Date();
    const expiryDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(); // 14 Gün Deneme
    const tenantId = `tnt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const companyCode = storage.generateNextCompanyCode();
    const cleanTaxNumber = (taxNumber || '').trim() || `VN${Date.now().toString().slice(-8)}`;

    const newTenant: Tenant = {
      id: tenantId,
      companyCode,
      name: companyName.trim(),
      slug: companyName.trim().toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-'),
      title: companyName.trim(),
      taxNumber: cleanTaxNumber,
      taxOffice: (taxOffice || `${city || 'Merkez'} Vergi Dairesi`).trim(),
      email: cleanEmail,
      phone: phone || '',
      city: city || 'İstanbul',
      district: 'Merkez',
      plan: 'STARTER',
      status: 'TRIAL',
      maxUsers: 5,
      currentUsers: 1,
      maxInvoicesPerMonth: 500,
      eInvoiceCredits: 100,
      storageLimitMb: 2048,
      storageUsedMb: 5,
      activeModules: [
        'POS', 'STOK', 'CARI', 'FATURA', 'TEKLIF_SIPARIS',
        'IRSALIYE', 'BANKA', 'KASA', 'CEK_SENET', 'E_FATURA',
        'PERSONEL', 'RAPORLAR', 'AI_ASISTAN', 'FORM_DESIGNER'
      ],
      ownerName: fullName.trim(),
      ownerEmail: cleanEmail,
      ownerPhone: phone || '',
      expiresAt: expiryDate,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      stats: {
        totalCustomers: 0,
        totalProducts: 0,
        totalInvoices: 0,
        totalRevenue: 0,
        monthlyInvoiceCount: 0,
        userCount: 1,
        lastLoginAt: now.toISOString(),
      },
    };

    const newAdminUser: User = {
      id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      username: finalUsername,
      fullName: fullName.trim(),
      email: cleanEmail,
      phone: phone || '',
      role: 'COMPANY_ADMIN',
      passwordHash: bcrypt.hashSync(password, 10),
      active: true,
      companyId: tenantId,
      companyName: companyName.trim(),
      allowedCompanyIds: [tenantId],
      createdAt: now.toISOString(),
      lastLoginAt: now.toISOString(),
    };

    // Transaction içinde tenant, kullanıcı ve tüm varsayılan kaynakları oluştur
    await storage.runTransaction(draft => {
      storage.bootstrapNewTenant(newTenant, newAdminUser, draft);
    });

    storage.addAuditLog({
      userId: newAdminUser.id,
      username: newAdminUser.username,
      companyId: tenantId,
      companyName: newTenant.name,
      action: 'COMPANY_CREATED',
      module: 'AUTH',
      ipAddress: req.ip || '127.0.0.1',
      details: `Yeni İŞBEY CLOUD hesabı oluşturuldu: ${companyName} (${cleanEmail})`,
    });

    const token = generateToken(newAdminUser, tenantId);
    const safeUser = companyIdentity(storage.getState(), newAdminUser, newTenant.id);

    return res.status(201).json({
      success: true,
      message: 'Tebrikler! İŞBEY CLOUD hesabınız oluşturuldu ve 14 günlük deneme sürümünüz başlatıldı.',
      token,
      user: safeUser,
      tenant: newTenant,
      isFirstLogin: true,
    });
  } catch (err: any) {
    console.error('[AUTH REGISTER ERROR]', err);
    return res.status(500).json({ success: false, message: err.message || 'Kayıt sırasında bir hata oluştu.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// 3. GET ME (OTURUM PROFİLİ & AKTİF ŞİRKET)
// ──────────────────────────────────────────────────────────────────────────
authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  const db = storage.getState();
  const account = db.users.find(u => u.id === req.user.id)!;
  res.json({ success: true, user: req.user, activeTenant: redactSecretsDeep(db.tenants.find(t => t.id === req.tenantId)),
    allowedTenants: db.tenants.filter(t => canEnterCompany(db, account, t.id)).map(t => ({ id: t.id, name: t.name, title: t.title, status: t.status })) });
});

// ──────────────────────────────────────────────────────────────────────────
// 4. SWITCH COMPANY (MUHASEBECİ / ÇOKLU ŞİRKET DEĞİŞTİRME)
// ──────────────────────────────────────────────────────────────────────────
export const switchCompany = (req: Request, res: Response) => {
  const db = storage.getState();
  const targetTenantId = req.params.id || req.body.targetTenantId;
  const account = db.users.find(u => u.id === req.user.id)!;
  if (typeof targetTenantId !== 'string' || !canEnterCompany(db, account, targetTenantId)) {
    return res.status(403).json({ success: false, message: 'Bu firmaya geçiş yetkiniz bulunmuyor.' });
  }
  const tenant = db.tenants.find(t => t.id === targetTenantId)!;
  return res.json({ success: true, message: 'Aktif firma değiştirildi.', token: generateToken(account, targetTenantId),
    user: companyIdentity(db, account, targetTenantId), activeTenant: redactSecretsDeep(tenant), company: redactSecretsDeep(tenant), activeCompanyId: targetTenantId });
};
authRouter.post('/switch-company', requireAuth, switchCompany);

// ──────────────────────────────────────────────────────────────────────────
// 5. LIST USERS (KULLANICILARI LİSTELE)
// FAZ 25.1: Korumalı — yalnızca platform/firma yöneticileri kullanıcı listesini görebilir.
// (Bu router global defaultDeny katmanından zaten geçer; burada ek RBAC uygulanır.)
// ──────────────────────────────────────────────────────────────────────────
authRouter.use('/users', usersRouter);
