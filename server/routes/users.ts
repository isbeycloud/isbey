import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { storage } from '../db/storage';
import type { User, UserRole } from '../db/schema';
import { requireAuth, requireRole } from '../middleware/authGuards';
import { membershipsRouter } from './memberships';
import { membershipFor, isPlatformUser, companyIdentity, migrateMemberships } from '../security/memberships';

const router = Router();
router.use(requireAuth, requireRole('SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'));
router.use(membershipsRouter);
router.get('/', (req, res) => {
  const db = storage.getState();
  const users = db.users.filter(u => isPlatformUser(req.user) || (!isPlatformUser(u) && (() => {
    const m = membershipFor(db, u.id, req.tenantId!); return m && !m.deletedAt;
  })())).map(u => {
    const identity = companyIdentity(db, u, req.tenantId!);
    const m = membershipFor(db, u.id, req.tenantId!);
    return { ...identity, active: u.active && (!m || m.status === 'active') };
  });
  res.json({ success: true, users });
});

router.post('/', async (req, res) => {
  const { username, fullName, email, phone, password, role = 'SATIS' } = req.body;
  if (typeof username !== 'string' || !username.trim() || typeof fullName !== 'string' || !fullName.trim() || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ success: false, message: 'Kullanıcı adı, ad soyad ve en az 8 karakterli şifre zorunludur.' });
  }
  const allowed: UserRole[] = ['COMPANY_ADMIN', 'MUHASEBE', 'SATIS', 'KASA', 'DEPO', 'PERSONEL', 'SAHA', 'RAPOR'];
  if (!allowed.includes(role)) return res.status(403).json({ success: false, message: 'Firma kullanıcısına bu rol atanamaz.' });
  const tenantId = isPlatformUser(req.user) ? req.body.companyId || req.tenantId : req.tenantId;
  if (!isPlatformUser(req.user) && req.body.companyId && req.body.companyId !== tenantId) return res.status(403).json({ success: false, message: 'Firma erişimi reddedildi.' });
  try {
    const user = await storage.runTransaction(draft => {
      const tenant = draft.tenants.find(t => t.id === tenantId && !t.isArchived);
      if (!tenant) throw new Error('Firma bulunamadı.');
      if (draft.users.some(u => u.username.toLowerCase() === username.trim().toLowerCase())) throw new Error('Kullanıcı adı zaten mevcut; mevcut hesabı firma üyeliği ile bağlayın.');
      const count = (draft.tenantUsers || []).filter(m => m.tenantId === tenantId && m.status === 'active' && !m.deletedAt).length;
      if (tenant.maxUsers && count >= tenant.maxUsers) throw new Error('Firma kullanıcı limiti doldu.');
      const account: User = { id: randomUUID(), username: username.trim(), fullName: fullName.trim(), email: email || '', phone,
        role, passwordHash: bcrypt.hashSync(password, 10), active: true, companyId: tenantId, allowedCompanyIds: [tenantId], createdAt: new Date().toISOString() };
      draft.users.push(account);
      migrateMemberships(draft);
      return companyIdentity(draft, account, tenantId);
    });
    res.json({ success: true, user, message: 'Kullanıcı ve firma üyeliği oluşturuldu.' });
  } catch (error) { res.status(400).json({ success: false, message: (error as Error).message }); }
});

router.put('/:id', async (req, res) => {
  if (!isPlatformUser(req.user)) return res.status(403).json({ success: false, message: 'Firma yetkilerini Firma Üyelikleri bölümünden düzenleyin. Ortak hesap bilgilerini platform yöneticisi değiştirir.' });
  try {
    const result = await storage.runTransaction(draft => {
      const user = draft.users.find(u => u.id === req.params.id);
      if (!user) throw new Error('Kullanıcı bulunamadı.');
      const { fullName, email, phone, password, department, branch } = req.body;
      if (fullName) user.fullName = String(fullName).trim();
      if (email !== undefined) user.email = String(email).trim();
      if (phone !== undefined) user.phone = String(phone);
      if (department !== undefined) user.department = String(department);
      if (branch !== undefined) user.branch = String(branch);
      if (password) {
        if (typeof password !== 'string' || password.length < 8) throw new Error('Şifre en az 8 karakter olmalıdır.');
        user.passwordHash = bcrypt.hashSync(password, 10);
      }
      return companyIdentity(draft, user, req.tenantId!);
    });
    res.json({ success: true, user: result, message: 'Hesap bilgileri güncellendi. Firma rolleri üyelik bölümünden yönetilir.' });
  } catch (error) { res.status(400).json({ success: false, message: (error as Error).message }); }
});

router.delete('/:id', async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ success: false, message: 'Kendi üyeliğinizi kaldıramazsınız.' });
  try {
    await storage.runTransaction(draft => {
      const user = draft.users.find(u => u.id === req.params.id);
      const m = membershipFor(draft, String(req.params.id), req.tenantId!);
      if (!user || isPlatformUser(user) || !m) throw new Error('Firma üyeliği bulunamadı.');
      m.status = 'passive';
      m.deletedAt = m.updatedAt = new Date().toISOString();
    });
    res.json({ success: true, message: 'Aktif firma üyeliği kaldırıldı. Diğer firma üyelikleri korunuyor.' });
  } catch (error) { res.status(400).json({ success: false, message: (error as Error).message }); }
});
export default router;
