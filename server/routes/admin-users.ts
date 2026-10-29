import { migrateMemberships, membershipFor, companyIdentity } from '../security/memberships';
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { storage } from '../db/storage';
import { requireAuth, requireRole } from '../middleware/authGuards';
import type { User, UserRole } from '../db/schema';
import { userAccounts } from '../services/userAccounts';

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
    let users = userAccounts.effectiveUsers();

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
      const { passwordHash: _password, credentialVersion: _credential, accountRevision: _revision, ...safe } = u;
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
    const user = userAccounts.effectiveUsers().find(u => u.id === req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
    }

    const sessions = (db.sessions || []).filter(s => s.userId === user.id);
    const { passwordHash: _password, credentialVersion: _credential, accountRevision: _revision, ...safeUser } = user;
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
      password,
      sendResetLink = false,
    } = req.body;

    if (typeof username !== 'string' || !username.trim() || typeof fullName !== 'string' || !fullName.trim() || (email !== undefined && typeof email !== 'string')) {
      return res.status(400).json({ success: false, message: 'Kullanıcı adı ve Ad Soyad zorunludur.' });
    }
    if (typeof password !== 'string' || Array.from(password).length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({ success: false, message: 'Şifre en az 12 karakter, en fazla 72 bayt olmalıdır.' });
    }
    if (sendResetLink !== false) {
      return res.status(400).json({ success: false, message: 'Kullanıcıyı oluşturduktan sonra Kullanıcı Hesabı ekranından şifre belirleme e-postası gönderin.' });
    }

    // FAZ 25.2-A (C1): Yetki yükseltme yasağı
    if (!canAssignRole(req.user, role as UserRole)) {
      return res.status(403).json({ success: false, message: 'Bu rolü atama yetkiniz yok.' });
    }

    const result = await storage.runTransaction(async draft => {
      // Login accepts either alias; reserve both against current effective identities.
      const normalize = (value: string) => value.trim().normalize('NFKC').toLowerCase();
      const accountEmail = email?.trim().toLowerCase() || `${username.trim()}@isbey.com.tr`;
      const aliases = [normalize(username), normalize(accountEmail)];
      if (userAccounts.effectiveUsers().some(u => aliases.includes(normalize(u.username)) || u.email && aliases.includes(normalize(u.email)))) {
        throw new Error('Kullanıcı adı veya e-posta zaten kullanılmaktadır.');
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
        email: accountEmail,
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
      return { user: safeUser };
    });

    res.json({
      success: true,
      message: 'Kullanıcı başarıyla oluşturuldu.',
      user: result.user,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/users/:id - Update User
// FAZ 25.2-A (C1): role/companyId/allowedCompanyIds/permissions artık serbest atanamaz —
// canAssignRole + tenant izolasyonu + platform-admin alan kısıtları zorunludur.
adminUsersRouter.put('/:id', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
  if (['username', 'fullName', 'email', 'phone', 'password', 'newPassword', 'passwordHash', 'passwordChangedAt', 'credentialVersion', 'accountRevision'].some(key => Object.prototype.hasOwnProperty.call(req.body || {}, key))) {
    return res.status(409).json({ success: false, message: 'Hesap ve şifre bilgilerini Kullanıcı Hesabı ekranından güncelleyin.' });
  }
  try {
    const { id } = req.params;
    const { role, companyId, allowedCompanyIds, department, branch, permissions, active } = req.body;

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

// Legacy token generation/direct reset is closed; the account service owns credential changes.
adminUsersRouter.post('/:id/reset-password', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (_req: Request, res: Response) => {
  res.status(410).json({ success: false, message: 'Şifre belirleme ve sıfırlama için Kullanıcı Hesabı ekranını kullanın.' });
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
