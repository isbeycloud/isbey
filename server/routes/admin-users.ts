import { migrateMemberships, membershipFor, companyIdentity } from '../security/memberships';
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { storage } from '../db/storage';
import { requireAuth, requireRole } from '../middleware/authGuards';
import type { User, UserRole, UserSession, PasswordResetToken } from '../db/schema';
import crypto from 'crypto';

export const adminUsersRouter = Router();

// ─── FAZ 25.2-A: Yetki ve tenant yardımcıları (users.ts deseni ile aynı) ───

// Platform yöneticisi: SUPER_ADMIN veya ADMIN (kodda PLATFORM_ADMIN diye ayrı rol yoktur)
const isPlatformAdmin = (user?: User): boolean =>
  user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

// FAZ 25.2-A (C1): Yetki yükseltme yasağı — platform yöneticisi olmayanlar
// SUPER_ADMIN/ADMIN atayamaz (COMPANY_ADMIN tek istekte kendini yükseltemez).
const canAssignRole = (caller: User, role: UserRole): boolean =>
  isPlatformAdmin(caller) || (role !== 'SUPER_ADMIN' && role !== 'ADMIN');

// FAZ 25.2-A (C1): Tenant izolasyonu — hedef kullanıcı arayanla aynı şirkette mi?
const isSameTenant = (caller: User, targetCompanyId?: string): boolean =>
  targetCompanyId === caller.companyId ||
  (caller.allowedCompanyIds || []).includes(targetCompanyId || '');

// FAZ 25.2-A (C1): COMPANY_ADMIN platform yöneticisi kullanıcılara dokunamaz
const isPlatformAdminTarget = (target: User): boolean =>
  target.role === 'SUPER_ADMIN' || target.role === 'ADMIN';

// GET /api/admin/users - List users with optional company filter
// FAZ 25.2-A (C5): Rol kontrolsüzdü (tüm tenant PII sızıyordu) → yalnızca platform yöneticileri
adminUsersRouter.get('/', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: Request, res: Response) => {
  try {
    const { companyId, role, search } = req.query;
    const db = storage.getState();
    let users = db.users || [];

    if (companyId) {
      users = users.filter(u => { const m = membershipFor(db, u.id, String(companyId)); return m && !m.deletedAt; });
    }

    if (role && role !== 'ALL') {
      users = users.filter(u => u.role === role);
    }

    if (search) {
      const q = String(search).toLowerCase();
      users = users.filter(u =>
        u.username.toLowerCase().includes(q) ||
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.phone && u.phone.includes(q))
      );
    }

    // Attach company names
    const safeUsers = users.map(u => {
      const { passwordHash, ...safe } = u;
      const comp = db.tenants?.find(t => t.id === u.companyId);
      return {
        ...(typeof companyId === 'string' ? companyIdentity(db, u, companyId) : safe),
        companyName: comp?.name || 'Genel Yönetim',
      };
    });

    res.json({
      success: true,
      users: safeUsers,
      totalUsers: safeUsers.length,
      activeUsers: safeUsers.filter(u => u.active).length,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/users/:id - Single user details + sessions
// FAZ 25.2-A (C5): Rol kontrolsüzdü → yalnızca platform yöneticileri
adminUsersRouter.get('/:id', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: Request, res: Response) => {
  try {
    const db = storage.getState();
    const user = (db.users || []).find(u => u.id === req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
    }

    const sessions = (db.sessions || []).filter(s => s.userId === user.id);
    const { passwordHash, ...safeUser } = user;
    const comp = db.tenants?.find(t => t.id === user.companyId);

    res.json({
      success: true,
      user: {
        ...safeUser,
        companyName: comp?.name || 'Genel Yönetim',
      },
      sessions,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/users - Create User with Company Limits Validation
// FAZ 25.2-A (C1): canAssignRole + tenant izolasyonu + bcrypt şifre
adminUsersRouter.post('/', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'), async (req: Request, res: Response) => {
  try {
    const {
      username,
      fullName,
      email,
      phone,
      role = 'SATIS',
      companyId,
      allowedCompanyIds,
      department,
      branch,
      password = '123',
      sendResetLink = false,
    } = req.body;

    if (!username?.trim() || !fullName?.trim()) {
      return res.status(400).json({ success: false, message: 'Kullanıcı adı ve Ad Soyad zorunludur.' });
    }

    // FAZ 25.2-A (C1): Yetki yükseltme yasağı
    if (!canAssignRole(req.user, role as UserRole)) {
      return res.status(403).json({ success: false, message: 'Bu rolü atama yetkiniz yok.' });
    }

    const result = await storage.runTransaction(async draft => {
      // 1. Check duplicate username
      if (draft.users.some(u => u.username.toLowerCase() === username.trim().toLowerCase())) {
        throw new Error(`"${username}" kullanıcı adı zaten kullanılmaktadır.`);
      }

      // FAZ 25.2-A (C1): Hedef şirket — platform yöneticisi seçebilir, COMPANY_ADMIN
      // yalnızca kendi şirketine kullanıcı açabilir (body'den serbest companyId YASAK).
      const isPlatformCaller = isPlatformAdmin(req.user);
      const targetCompanyId = (isPlatformCaller && companyId)
        ? companyId
        : (req.user?.companyId || draft.activeTenantId || 'tnt-isbey');

      if (!isPlatformCaller && !isSameTenant(req.user as User, targetCompanyId)) {
        throw new Error('Başka bir şirket için kullanıcı oluşturma yetkiniz yok.');
      }

      // 2. Check company user limit if assigned to a specific company
      const company = draft.tenants.find(t => t.id === targetCompanyId);
      if (company && company.maxUsers) {
        const currentCount = (draft.tenantUsers || []).filter(m => m.tenantId === targetCompanyId && m.status === 'active' && !m.deletedAt && draft.users.some(u => u.id === m.userId && u.active)).length;
        if (currentCount >= company.maxUsers) {
          throw new Error(`Kullanıcı limitiniz (${company.maxUsers}) dolmuştur. Lütfen sistem yöneticinizle iletişime geçerek paketinizi yükseltin.`);
        }
      }

      const newUserId = `usr-${Date.now()}`;
      const newUser: User = {
        id: newUserId,
        username: username.trim(),
        fullName: fullName.trim(),
        email: email?.trim() || `${username.trim()}@isbey.com.tr`,
        phone: phone?.trim(),
        role: role as UserRole,
        // FAZ 25.2-A (C1): Şifre düz metin saklanamaz — bcrypt ile hashlenir
        passwordHash: bcrypt.hashSync(password, 10),
        active: true,
        companyId: targetCompanyId,
        // FAZ 25.2-A (C1): allowedCompanyIds serbest ataması kapatıldı —
        // hedef şirket listesi hedef şirketi içerecek şekilde sınırlanır.
        allowedCompanyIds: [targetCompanyId],
        department: department?.trim(),
        branch: branch?.trim(),
        createdAt: new Date().toISOString(),
      };

      draft.users.push(newUser);
      migrateMemberships(draft);

      // Update tenant stats
      if (company && company.stats) {
        company.stats.userCount = (company.stats.userCount || 0) + 1;
      }

      // Generate reset token if requested
      let resetTokenObj: PasswordResetToken | null = null;
      if (sendResetLink) {
        const token = crypto.randomBytes(24).toString('hex');
        resetTokenObj = {
          token,
          userId: newUserId,
          userEmail: newUser.email,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          used: false,
          createdAt: new Date().toISOString(),
        };
        if (!draft.passwordResetTokens) draft.passwordResetTokens = [];
        draft.passwordResetTokens.push(resetTokenObj);
      }

      storage.addAuditLog({
        userId: req.user?.id || 'admin',
        username: req.user?.username || 'admin',
        companyId: targetCompanyId,
        companyName: company?.name,
        action: 'USER_CREATED',
        module: 'KULLANICILAR',
        ipAddress: req.ip || '127.0.0.1',
        details: `Yeni kullanıcı oluşturuldu: ${newUser.username} (${newUser.fullName}, Rol: ${newUser.role})`,
      });

      const { passwordHash: _, ...safeUser } = newUser;
      return { user: safeUser, resetToken: resetTokenObj?.token };
    });

    res.json({
      success: true,
      message: 'Kullanıcı başarıyla oluşturuldu.',
      user: result.user,
      resetLink: result.resetToken ? `/reset-password?token=${result.resetToken}` : undefined,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/users/:id - Update User
// FAZ 25.2-A (C1): role/companyId/allowedCompanyIds/permissions artık serbest atanamaz —
// canAssignRole + tenant izolasyonu + platform-admin alan kısıtları zorunludur.
adminUsersRouter.put('/:id', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { fullName, email, phone, role, companyId, allowedCompanyIds, department, branch, permissions, active } = req.body;

    // FAZ 25.2-A (C1): Yetki yükseltme yasağı
    if (role && !canAssignRole(req.user as User, role as UserRole)) {
      return res.status(403).json({ success: false, message: 'Bu rolü atama yetkiniz yok.' });
    }

    const result = await storage.runTransaction(async draft => {
      const user = draft.users.find(u => u.id === id);
      if (!user) throw new Error('Kullanıcı bulunamadı.');

      // FAZ 25.2-A (C1): Tenant izolasyonu — COMPANY_ADMIN yalnızca kendi şirketinin
      // kullanıcılarını düzenleyebilir; platform yöneticisi kullanıcılarına dokunamaz.
      const isPlatformCaller = isPlatformAdmin(req.user);
      if (!isPlatformCaller) {
        if (!isSameTenant(req.user as User, user.companyId)) {
          throw new Error('Bu kullanıcıyı düzenleme yetkiniz yok.');
        }
        if (isPlatformAdminTarget(user)) {
          throw new Error('Platform yöneticisi kullanıcılar bu uçtan düzenlenemez.');
        }
      }

      const oldRole = user.role;
      if (fullName) user.fullName = fullName.trim();
      if (email) user.email = email.trim();
      if (phone !== undefined) user.phone = phone?.trim();
      if (role) user.role = role as UserRole;
      // FAZ 25.2-A (C1): Şirket ataması yalnızca platform yöneticisine açıktır
      if (companyId && isPlatformCaller) user.companyId = companyId;
      if (allowedCompanyIds) throw new Error('Firma atamalarını Firma Üyelikleri bölümünden yönetin.');
      if (department !== undefined) user.department = department?.trim();
      if (branch !== undefined) user.branch = branch?.trim();
      // FAZ 25.2-A (C1): permissions serbest ataması kapatıldı — yalnızca platform yöneticisi
      if (permissions && isPlatformCaller) user.permissions = permissions;
      if (active !== undefined) {
        user.active = Boolean(active);
        // If deactivated, revoke sessions
        if (!user.active && draft.sessions) {
          draft.sessions.forEach(s => {
            if (s.userId === user.id) s.isRevoked = true;
          });
        }
      }

      if (oldRole !== user.role) {
        storage.addAuditLog({
          userId: req.user?.id || 'admin',
          username: req.user?.username || 'admin',
          companyId: user.companyId,
          action: 'ROLE_CHANGED',
          module: 'KULLANICILAR',
          ipAddress: req.ip || '127.0.0.1',
          details: `Kullanıcı rolü değiştirildi: ${user.username} (${oldRole} -> ${user.role})`,
        });
      } else {
        storage.addAuditLog({
          userId: req.user?.id || 'admin',
          username: req.user?.username || 'admin',
          companyId: user.companyId,
          action: 'USER_UPDATED',
          module: 'KULLANICILAR',
          ipAddress: req.ip || '127.0.0.1',
          details: `Kullanıcı bilgileri güncellendi: ${user.username}`,
        });
      }

      const { passwordHash: _, ...safeUser } = user;
      return safeUser;
    });

    res.json({
      success: true,
      message: 'Kullanıcı bilgileri başarıyla güncellendi.',
      user: result,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/admin/users/:id/disable & enable - Toggle active state & revoke sessions
// FAZ 25.2-A (C1): Tenant izolasyonu eklendi
adminUsersRouter.post('/:id/toggle-status', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { active } = req.body;

    const result = await storage.runTransaction(async draft => {
      const user = draft.users.find(u => u.id === id);
      if (!user) throw new Error('Kullanıcı bulunamadı.');

      const isPlatformCaller = isPlatformAdmin(req.user);
      if (!isPlatformCaller) {
        if (!isSameTenant(req.user as User, user.companyId)) {
          throw new Error('Bu kullanıcıyı düzenleme yetkiniz yok.');
        }
        if (isPlatformAdminTarget(user)) {
          throw new Error('Platform yöneticisi kullanıcılar bu uçtan değiştirilemez.');
        }
      }

      user.active = Boolean(active);

      // If user is disabled, immediately revoke all active sessions
      if (!user.active && draft.sessions) {
        draft.sessions.forEach(s => {
          if (s.userId === user.id) s.isRevoked = true;
        });
      }

      const action = user.active ? 'USER_ENABLED' : 'USER_DISABLED';
      storage.addAuditLog({
        userId: req.user?.id || 'admin',
        username: req.user?.username || 'admin',
        companyId: user.companyId,
        action,
        module: 'KULLANICILAR',
        ipAddress: req.ip || '127.0.0.1',
        details: `Kullanıcı ${user.active ? 'aktifleştirildi' : 'pasife alındı'}: ${user.username}`,
      });

      const { passwordHash: _, ...safeUser } = user;
      return safeUser;
    });

    res.json({
      success: true,
      message: `Kullanıcı başarıyla ${result.active ? 'aktifleştirildi' : 'pasife alındı'}.`,
      user: result,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/admin/users/:id/reset-password - Generate Secure One-Time Token (Never expose plaintext password)
// FAZ 25.2-A (C1): Tenant izolasyonu + newPassword artık bcrypt ile hashlenir (düz metin YASAK)
adminUsersRouter.post('/:id/reset-password', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body; // Optional direct reset

    const result = await storage.runTransaction(async draft => {
      const user = draft.users.find(u => u.id === id);
      if (!user) throw new Error('Kullanıcı bulunamadı.');

      const isPlatformCaller = isPlatformAdmin(req.user);
      if (!isPlatformCaller) {
        if (!isSameTenant(req.user as User, user.companyId)) {
          throw new Error('Bu kullanıcı için şifre sıfırlama yetkiniz yok.');
        }
        if (isPlatformAdminTarget(user)) {
          throw new Error('Platform yöneticisi kullanıcıların şifresi bu uçtan sıfırlanamaz.');
        }
      }

      let token = '';
      if (newPassword && newPassword.trim()) {
        // FAZ 25.2-A (C1): Düz metin şifre saklanamaz — bcrypt zorunlu
        user.passwordHash = bcrypt.hashSync(newPassword.trim(), 10);
        user.passwordChangedAt = new Date().toISOString();
        // Revoke existing sessions to force re-login
        if (draft.sessions) {
          draft.sessions.forEach(s => {
            if (s.userId === user.id) s.isRevoked = true;
          });
        }
      } else {
        // Generate secure 24-byte hex token
        token = crypto.randomBytes(24).toString('hex');
        const tokenRecord: PasswordResetToken = {
          token,
          userId: user.id,
          userEmail: user.email,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          used: false,
          createdAt: new Date().toISOString(),
        };
        if (!draft.passwordResetTokens) draft.passwordResetTokens = [];
        draft.passwordResetTokens.push(tokenRecord);
      }

      storage.addAuditLog({
        userId: req.user?.id || 'admin',
        username: req.user?.username || 'admin',
        companyId: user.companyId,
        action: 'PASSWORD_RESET_REQUESTED',
        module: 'GÜVENLİK',
        ipAddress: req.ip || '127.0.0.1',
        details: `Şifre sıfırlama işlemi gerçekleştirildi: ${user.username}`,
      });

      return { username: user.username, token, directReset: Boolean(newPassword) };
    });

    res.json({
      success: true,
      message: result.directReset ? 'Kullanıcı şifresi başarıyla güncellendi.' : 'Şifre sıfırlama bağlantısı üretildi.',
      token: result.token,
      resetLink: result.token ? `https://isbey.com.tr/auth/reset-password?token=${result.token}` : undefined,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/admin/users/:id/revoke-sessions - Revoke active sessions
adminUsersRouter.post('/:id/revoke-sessions', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await storage.runTransaction(async draft => {
      const user = draft.users.find(u => u.id === id);
      if (!user) throw new Error('Kullanıcı bulunamadı.');

      if (draft.sessions) {
        draft.sessions.forEach(s => {
          if (s.userId === user.id) s.isRevoked = true;
        });
      }

      storage.addAuditLog({
        userId: req.user?.id || 'admin',
        username: req.user?.username || 'admin',
        companyId: user.companyId,
        action: 'SESSION_REVOKED',
        module: 'GÜVENLİK',
        ipAddress: req.ip || '127.0.0.1',
        details: `Tüm aktif oturumlar sonlandırıldı: ${user.username}`,
      });
    });

    res.json({
      success: true,
      message: 'Kullanıcının tüm aktif oturumları sonlandırıldı.',
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin/users/:id - Delete / Soft Delete User
adminUsersRouter.delete('/:id', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (id === 'usr-1') {
      return res.status(400).json({ success: false, message: 'Ana süper yönetici hesabı silinemez!' });
    }

    await storage.runTransaction(async draft => {
      const idx = draft.users.findIndex(u => u.id === id);
      if (idx === -1) throw new Error('Kullanıcı bulunamadı.');

      const user = draft.users[idx];
      draft.users.splice(idx, 1);

      if (draft.sessions) {
        draft.sessions = draft.sessions.filter(s => s.userId !== id);
      }

      storage.addAuditLog({
        userId: req.user?.id || 'admin',
        username: req.user?.username || 'admin',
        companyId: user.companyId,
        action: 'USER_DELETED',
        module: 'KULLANICILAR',
        ipAddress: req.ip || '127.0.0.1',
        details: `Kullanıcı silindi: ${user.username} (${user.fullName})`,
      });
    });

    res.json({
      success: true,
      message: 'Kullanıcı başarıyla silindi.',
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});
