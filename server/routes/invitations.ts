import { companyIdentity } from '../security/memberships';
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { storage } from '../db/storage';
import { requireAuth, requireRole } from '../middleware/authGuards';
import { generateToken } from './auth';
import { Invitation, User, TenantUser } from '../db/schema';

export const invitationsRouter = Router();

// GET /api/invitations - List invitations for company (Protected)
invitationsRouter.get('/', requireAuth, (req: Request, res: Response) => {
  const db = storage.getState();
  const tenantId = req.tenantId;
  const user = req.user;

  const list = (db.invitations || []).filter(inv => 
    user.role === 'SUPER_ADMIN' || inv.tenantId === tenantId
  );

  res.json({ success: true, invitations: list });
});

// POST /api/invitations - Send invitation (Protected)
invitationsRouter.post('/', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'), async (req: Request, res: Response) => {
  const { email, fullName, roleSlug = 'employee' } = req.body;
  const user = req.user;
  const tenantId = req.tenantId || 'tnt-isbey';

  if (!email || !email.trim()) {
    return res.status(400).json({ success: false, message: 'E-Posta adresi zorunludur.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const db = storage.getState();
  const tenant = (db.tenants || []).find(t => t.id === tenantId);

  const selectedRole = db.roles?.find(r => r.slug === roleSlug && r.slug !== 'platform_admin' && (r.isSystem || r.tenantId === tenantId));
  if (!selectedRole) return res.status(400).json({ success: false, message: 'Geçerli firma rolü seçin.' });
  // Zaten bu firmada üye mi?
  const existingUser = (db.users || []).find(u => u.email.toLowerCase() === cleanEmail);
  if (existingUser) {
    const alreadyMember = (db.tenantUsers || []).some(tu => tu.userId === existingUser.id && tu.tenantId === tenantId && tu.status === 'active');
    if (alreadyMember) {
      return res.status(400).json({ success: false, message: 'Bu kullanıcı zaten bu firmanın aktif bir üyesidir.' });
    }
  }

  // Güvenli rastgele token üret
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 gün geçerli

  const newInvitation: Invitation = {
    id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId,
    tenantName: tenant?.name || 'İŞBEY',
    email: cleanEmail,
    fullName: fullName?.trim(),
    roleSlug,
    tokenHash,
    expiresAt,
    createdBy: user.fullName || user.username,
    createdAt: now.toISOString(),
  };

  try {
    await storage.runTransaction(draft => {
      if (!draft.invitations) draft.invitations = [];
      draft.invitations.unshift(newInvitation);
    });

    storage.addAuditLog({
      userId: user.id,
      username: user.username,
      companyId: tenantId,
      companyName: tenant?.name || 'İŞBEY',
      action: 'USER_INVITED',
      module: 'USERS',
      details: `Kullanıcı daveti gönderildi: ${cleanEmail} (${roleSlug})`,
      ipAddress: req.ip || '127.0.0.1',
    });

    // İstemciye kopyalanabilir davet linki dön
    const inviteLink = `/accept-invite?token=${rawToken}`;

    res.status(201).json({
      success: true,
      message: `${cleanEmail} adresine davet oluşturuldu.`,
      invitation: { ...newInvitation, tokenPlain: rawToken, inviteLink },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/invitations/verify/:token - Verify token (Public)
invitationsRouter.get('/verify/:token', (req: Request, res: Response) => {
  const { token } = req.params;
  if (!token) return res.status(400).json({ success: false, message: 'Token zorunludur.' });

  const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
  const db = storage.getState();
  const inv = (db.invitations || []).find(i => i.tokenHash === tokenHash);

  if (!inv) {
    return res.status(404).json({ success: false, message: 'Davet bulunamadı veya geçersiz.' });
  }

  if (inv.acceptedAt) {
    return res.status(400).json({ success: false, message: 'Bu davet daha önce kabul edilmiş.' });
  }

  if (new Date(inv.expiresAt) < new Date()) {
    return res.status(400).json({ success: false, message: 'Bu davetiyenin süresi dolmuştur.' });
  }

  res.json({
    success: true,
    invitation: {
      id: inv.id,
      email: inv.email,
      fullName: inv.fullName,
      tenantName: inv.tenantName,
      roleSlug: inv.roleSlug,
    },
  });
});

// POST /api/invitations/accept - Accept invitation (Public)
invitationsRouter.post('/accept', async (req: Request, res: Response) => {
  const { token, fullName, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ success: false, message: 'Token ve şifre zorunludur.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Şifreniz en az 6 karakter olmalıdır.' });
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const db = storage.getState();
  const inv = (db.invitations || []).find(i => i.tokenHash === tokenHash);

  if (!inv || inv.acceptedAt || new Date(inv.expiresAt) < new Date()) {
    return res.status(400).json({ success: false, message: 'Geçersiz veya süresi dolmuş davet.' });
  }

  try {
    let targetUser: User;
    const now = new Date().toISOString();

    await storage.runTransaction(draft => {
      let existing = (draft.users || []).find(u => u.email.toLowerCase() === inv.email.toLowerCase());

      if (existing) {
        if (!existing.active || !bcrypt.compareSync(password, existing.passwordHash)) throw new Error('Mevcut hesabın şifresi doğrulanamadı.');
        // Mevcut kullanıcıyı bu tenant'a bağla
        if (!existing.allowedCompanyIds) existing.allowedCompanyIds = [];
        if (!existing.allowedCompanyIds.includes(inv.tenantId)) {
          existing.allowedCompanyIds.push(inv.tenantId);
        }
        targetUser = existing;
      } else {
        // Yeni kullanıcı oluştur
        const baseUsername = inv.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '');
        let username = baseUsername;
        let c = 1;
        while ((draft.users || []).some(u => u.username.toLowerCase() === username.toLowerCase())) {
          username = `${baseUsername}${c++}`;
        }

        const newUser: User = {
          id: `usr-${Date.now()}`,
          username,
          fullName: (fullName || inv.fullName || username).trim(),
          email: inv.email,
          role: inv.roleSlug === 'accountant' ? 'MUHASEBE' : 'SATIS',
          passwordHash: bcrypt.hashSync(password, 10),
          active: true,
          companyId: inv.tenantId,
          companyName: inv.tenantName,
          allowedCompanyIds: [inv.tenantId],
          createdAt: now,
          lastLoginAt: now,
        };

        draft.users.push(newUser);
        targetUser = newUser;
      }

      const assignedRole = draft.roles?.find(r => r.slug === inv.roleSlug && r.slug !== 'platform_admin' && (r.isSystem || r.tenantId === inv.tenantId));
      if (!assignedRole) throw new Error('Davet rolü artık geçerli değil.');
      // TenantUser kaydını oluştur
      if (!draft.tenantUsers) draft.tenantUsers = [];
      const alreadyLinked = draft.tenantUsers.some(tu => tu.userId === targetUser.id && tu.tenantId === inv.tenantId);
      if (!alreadyLinked) {
        draft.tenantUsers.push({
          id: `tu-${targetUser.id}-${inv.tenantId}`,
          tenantId: inv.tenantId,
          userId: targetUser.id,
          roleSlug: inv.roleSlug,
          roleIds: [assignedRole.id],
          isOwner: false,
          status: 'active',
          joinedAt: now,
          createdAt: now,
          updatedAt: now,
        });
      }

      // Davetiyeyi kabul edildi olarak işaretle
      const currentInv = draft.invitations?.find(i => i.id === inv.id);
      if (currentInv) {
        currentInv.acceptedAt = now;
      }
    });

    const jwtToken = generateToken(targetUser!, inv.tenantId);
    const safeUser = companyIdentity(storage.getState(), targetUser!, inv.tenantId);

    res.json({
      success: true,
      message: 'Davet kabul edildi ve hesabınız başarıyla aktifleştirildi.',
      token: jwtToken,
      user: safeUser,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default invitationsRouter;
