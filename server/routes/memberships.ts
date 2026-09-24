import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { storage } from '../db/storage';
import { requireAuth, requireRole } from '../middleware/authGuards';
import { isPlatformUser, membershipFor, activeMembership, membershipRoles } from '../security/memberships';
import { ERP_MENUS } from '../../src/data/erpMenus';

export const membershipsRouter = Router();
membershipsRouter.use(requireAuth, requireRole('SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'));

membershipsRouter.get('/:id/memberships', (req, res) => {
  const db = storage.getState();
  const platform = isPlatformUser(req.user);
  if (!db.users.some(u => u.id === req.params.id) || (!platform && !membershipFor(db, String(req.params.id), req.tenantId!))) {
    return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
  }
  const companies = db.tenants.filter(t => !t.isArchived && (platform || t.id === req.tenantId));
  res.json({ success: true,
    companies: companies.map(t => ({ id: t.id, name: t.name })),
    roles: (db.roles || []).filter(r => r.slug !== 'platform_admin' && (r.isSystem || companies.some(t => t.id === r.tenantId))),
    memberships: (db.tenantUsers || []).filter(m => m.userId === req.params.id && !m.deletedAt && companies.some(t => t.id === m.tenantId))
      .map(m => ({ ...m, roleIds: membershipRoles(db, m).map(r => r.id) })),
  });
});

membershipsRouter.put('/:id/memberships/:tenantId', async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const userId = String(req.params.id);
  const { roleIds, status, isOwner, allowedMenuIds } = req.body;
  if (allowedMenuIds !== undefined && allowedMenuIds !== null && (!Array.isArray(allowedMenuIds) || allowedMenuIds.some(id => !ERP_MENUS.some(m => m.id === id)) || new Set(allowedMenuIds).size !== allowedMenuIds.length)) return res.status(400).json({ success: false, message: 'Geçerli menüler seçin.' });
  const platform = isPlatformUser(req.user);
  if (isOwner !== undefined && (typeof isOwner !== 'boolean' || !platform)) return res.status(403).json({ success: false, message: 'Firma sahipliğini yalnızca platform yöneticisi belirleyebilir.' });
  if (!platform && req.user.allowedMenuIds != null && allowedMenuIds !== undefined && (allowedMenuIds === null || allowedMenuIds.some((id: string) => !req.user.allowedMenuIds.includes(id)))) return res.status(403).json({ success: false, message: 'Kendi menü erişiminizin dışında yetki atayamazsınız.' });
  if (!platform && tenantId !== req.tenantId) return res.status(403).json({ success: false, message: 'Yalnızca aktif firma üyeliğini yönetebilirsiniz.' });
  if (!Array.isArray(roleIds) || !roleIds.length || roleIds.some(id => typeof id !== 'string') || new Set(roleIds).size !== roleIds.length || !['active', 'passive'].includes(status)) {
    return res.status(400).json({ success: false, message: 'En az bir rol ve geçerli üyelik durumu seçin.' });
  }
  try {
    await storage.runTransaction(draft => {
      const user = draft.users.find(u => u.id === userId);
      const tenant = draft.tenants.find(t => t.id === tenantId && !t.isArchived);
      if (!user || !tenant || isPlatformUser(user)) throw new Error('Geçerli firma kullanıcısı bulunamadı.');
      const current = membershipFor(draft, userId, tenantId);
      if (!platform && (!current || current.deletedAt)) throw new Error('Mevcut hesapları yeni firmalara yalnızca platform yöneticisi bağlayabilir.');
      if (userId === req.user.id) throw new Error('Kendi üyeliğinizi değiştiremezsiniz; başka bir yönetici kullanın.');
      const roles = roleIds.map(id => draft.roles?.find(r => r.id === id && r.slug !== 'platform_admin' && (r.isSystem || r.tenantId === tenantId)));
      if (roles.some(r => !r)) throw new Error('Rol bu firmaya atanamaz.');
      if (isOwner === true && !roles.some(r => r?.slug === 'company_admin')) throw new Error('Firma sahibi için firma yöneticisi rolü gerekir.');
      if (!platform && roles.some(r => r!.permissions.some(p => !(req.userPermissions || []).includes(p)))) throw new Error('Sahip olmadığınız yetkileri atayamazsınız.');
      if (status === 'active' && !activeMembership(current) && tenant.maxUsers) {
        const count = (draft.tenantUsers || []).filter(m => m.tenantId === tenantId && activeMembership(m) && draft.users.some(u => u.id === m.userId && u.active)).length;
        if (count >= tenant.maxUsers) throw new Error('Firmanın kullanıcı limiti doldu.');
      }
      const now = new Date().toISOString();
      const membership = current || { id: randomUUID(), userId, tenantId, isOwner: false, joinedAt: now, createdAt: now, updatedAt: now, roleSlug: '', status: 'active' as const };
      membership.roleIds = roleIds;
      membership.roleSlug = roles[0]!.slug; // Compatibility display only; authorization uses roleIds.
      membership.status = status;
      if (allowedMenuIds !== undefined) membership.allowedMenuIds = allowedMenuIds;
      if (isOwner !== undefined) membership.isOwner = isOwner;
      membership.updatedAt = now;
      delete membership.deletedAt;
      draft.tenantUsers ||= [];
      if (!current) draft.tenantUsers.push(membership);
    });
    storage.addAuditLog({ userId: req.user.id, username: req.user.username, companyId: tenantId,
      action: 'UPDATE', module: 'MEMBERSHIPS', details: `Firma üyeliği güncellendi: ${userId}`, ipAddress: req.ip || '' });
    res.json({ success: true, message: 'Firma üyeliği ve rolleri kaydedildi.' });
  } catch (error) {
    res.status(400).json({ success: false, message: (error as Error).message });
  }
});

membershipsRouter.delete('/:id/memberships/:tenantId', async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!isPlatformUser(req.user) && tenantId !== req.tenantId) return res.status(403).json({ success: false, message: 'Firma yetkisi bulunamadı.' });
  if (req.params.id === req.user.id) return res.status(400).json({ success: false, message: 'Kendi üyeliğinizi kaldıramazsınız.' });
  try {
    await storage.runTransaction(draft => {
      const m = membershipFor(draft, String(req.params.id), tenantId);
      if (!m) throw new Error('Üyelik bulunamadı.');
      m.status = 'passive';
      m.deletedAt = m.updatedAt = new Date().toISOString();
    });
    storage.addAuditLog({ userId: req.user.id, username: req.user.username, companyId: tenantId,
      action: 'DELETE', module: 'MEMBERSHIPS', details: `Firma üyeliği kaldırıldı: ${req.params.id}`, ipAddress: req.ip || '' });
    res.json({ success: true, message: 'Firma üyeliği kaldırıldı; kullanıcı hesabı ve diğer üyelikleri korundu.' });
  } catch (error) { res.status(400).json({ success: false, message: (error as Error).message }); }
});
