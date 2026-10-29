import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { storage } from '../db/storage';
import type { User, UserRole } from '../db/schema';
import { requireAuth, requireRole } from '../middleware/authGuards';
import { membershipsRouter } from './memberships';
import { membershipFor, isPlatformUser, companyIdentity, migrateMemberships } from '../security/memberships';
import { userAccounts } from '../services/userAccounts';

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
  if (typeof username !== 'string' || !username.trim() || typeof fullName !== 'string' || !fullName.trim() || (email !== undefined && typeof email !== 'string') || typeof password !== 'string' || Array.from(password).length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ success: false, message: 'Kullanıcı adı, ad soyad ve en az 12 karakterli, en fazla 72 baytlık şifre zorunludur.' });
  }
  const allowed: UserRole[] = ['COMPANY_ADMIN', 'MUHASEBE', 'SATIS', 'KASA', 'DEPO', 'PERSONEL', 'SAHA', 'RAPOR'];
  if (!allowed.includes(role)) return res.status(403).json({ success: false, message: 'Firma kullanıcısına bu rol atanamaz.' });
  const tenantId = isPlatformUser(req.user) ? req.body.companyId || req.tenantId : req.tenantId;
  if (!isPlatformUser(req.user) && req.body.companyId && req.body.companyId !== tenantId) return res.status(403).json({ success: false, message: 'Firma erişimi reddedildi.' });
  try {
    const user = await storage.runTransaction(draft => {
      const tenant = draft.tenants.find(t => t.id === tenantId && !t.isArchived);
      if (!tenant) throw new Error('Firma bulunamadı.');
      const normalize = (value: string) => value.trim().normalize('NFKC').toLowerCase();
      const aliases = [normalize(username), ...(email?.trim() ? [normalize(email)] : [])];
      if (userAccounts.effectiveUsers().some(u => aliases.includes(normalize(u.username)) || u.email && aliases.includes(normalize(u.email)))) throw new Error('Kullanıcı adı veya e-posta zaten mevcut; mevcut hesabı firma üyeliği ile bağlayın.');
      const count = (draft.tenantUsers || []).filter(m => m.tenantId === tenantId && m.status === 'active' && !m.deletedAt).length;
      if (tenant.maxUsers && count >= tenant.maxUsers) throw new Error('Firma kullanıcı limiti doldu.');
      const account: User = { id: randomUUID(), username: username.trim(), fullName: fullName.trim(), email: email?.trim().toLowerCase() || '', phone,
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
  return res.status(409).json({ success: false, message: 'Hesap bilgilerini Kullanıcı Hesabı ekranından güncelleyin. Firma rolleri üyelik bölümünden yönetilir.' });
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
