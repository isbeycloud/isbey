import { Router, Request, Response } from 'express';
import { storage } from '../db/storage';
import { requireAuth, requireRole, requirePermission } from '../middleware/authGuards';
import { ALL_PERMISSION_CODES } from '../security/permissions';
import { Role } from '../db/schema';

export const rolesRouter = Router();

rolesRouter.use(requireAuth);

rolesRouter.use((req, res, next) => {
  if (['POST', 'PUT'].includes(req.method) && req.body.permissions !== undefined) {
    const permissions = req.body.permissions;
    if (!Array.isArray(permissions) || permissions.some(p => typeof p !== 'string' || !(ALL_PERMISSION_CODES as readonly string[]).includes(p) || (!(req.userPermissions || []).includes('*') && !(req.userPermissions || []).includes(p)))) {
      return res.status(400).json({ success: false, message: 'Geçersiz veya atamaya yetkili olmadığınız izin.' });
    }
  }
  next();
});

// GET /api/roles - List available roles for current tenant
rolesRouter.get('/', (req: Request, res: Response) => {
  const db = storage.getState();
  const tenantId = req.tenantId;
  const user = req.user;

  // Sistem rolleri + firmanın özel rolleri
  const list = (db.roles || []).filter(r => r.isSystem || r.tenantId === tenantId);
  res.json({ success: true, roles: list });
});

// GET /api/roles/:id - Role details
rolesRouter.get('/:id', (req: Request, res: Response) => {
  const db = storage.getState();
  const tenantId = req.tenantId;
  const role = (db.roles || []).find(r => r.id === req.params.id && (r.isSystem || r.tenantId === tenantId));

  if (!role) {
    return res.status(404).json({ success: false, message: 'Rol bulunamadı.' });
  }

  res.json({ success: true, role });
});

// POST /api/roles - Create custom role for company
rolesRouter.post('/', requireRole('SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'), async (req: Request, res: Response) => {
  const { name, description, permissions = [] } = req.body;
  const user = req.user;
  const tenantId = req.tenantId || 'tnt-isbey';

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Rol adı zorunludur.' });
  }

  const slug = `custom_${name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now().toString().slice(-4)}`;
  const now = new Date().toISOString();

  const newRole: Role = {
    id: `role-${Date.now()}`,
    tenantId,
    name: name.trim(),
    slug,
    description: description?.trim() || '',
    isSystem: false,
    permissions,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await storage.runTransaction(draft => {
      if (!draft.roles) draft.roles = [];
      draft.roles.push(newRole);
    });

    storage.addAuditLog({
      userId: user.id,
      username: user.username,
      companyId: tenantId,
      action: 'ROLE_CREATED',
      module: 'ROLES',
      details: `Yeni özel rol tanımlandı: ${name} (${slug})`,
      ipAddress: req.ip || '127.0.0.1',
    });

    res.status(201).json({ success: true, message: 'Özel rol başarıyla oluşturuldu.', role: newRole });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/roles/:id - Update custom role
rolesRouter.put('/:id', requireRole('SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'), async (req: Request, res: Response) => {
  const { name, description, permissions } = req.body;
  const user = req.user;
  const tenantId = req.tenantId;

  try {
    const updated = await storage.runTransaction(draft => {
      const r = (draft.roles || []).find(item => item.id === req.params.id);
      if (!r) throw new Error('Rol bulunamadı.');
      if (!r.isSystem && r.tenantId !== tenantId) throw new Error('Başka firmanın rolü düzenlenemez.');

      if (r.isSystem && user.role !== 'SUPER_ADMIN') {
        throw new Error('Sistem varsayılan rolleri değiştirilemez.');
      }

      if (name) r.name = name.trim();
      if (description !== undefined) r.description = description.trim();
      if (Array.isArray(permissions)) r.permissions = permissions;
      r.updatedAt = new Date().toISOString();
      return r;
    });

    storage.addAuditLog({
      userId: user.id,
      username: user.username,
      companyId: tenantId,
      action: 'ROLE_UPDATED',
      module: 'ROLES',
      details: `Rol güncellendi: ${updated.name}`,
      ipAddress: req.ip || '127.0.0.1',
    });

    res.json({ success: true, message: 'Rol güncellendi.', role: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE /api/roles/:id - Delete custom role
rolesRouter.delete('/:id', requireRole('SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'), async (req: Request, res: Response) => {
  const user = req.user;
  const tenantId = req.tenantId;

  try {
    await storage.runTransaction(draft => {
      const idx = (draft.roles || []).findIndex(r => r.id === req.params.id);
      if (idx === -1) throw new Error('Rol bulunamadı.');

      const r = draft.roles![idx];
      if (r.isSystem) throw new Error('Sistem rolleri silinemez.');
      if (r.tenantId !== tenantId && user.role !== 'SUPER_ADMIN') {
        throw new Error('Bu rolü silme yetkiniz bulunmamaktadır.');
      }

      draft.roles!.splice(idx, 1);
    });

    storage.addAuditLog({
      userId: user.id,
      username: user.username,
      companyId: tenantId,
      action: 'ROLE_DELETED',
      module: 'ROLES',
      details: `Özel rol silindi: ${req.params.id}`,
      ipAddress: req.ip || '127.0.0.1',
    });

    res.json({ success: true, message: 'Özel rol silindi.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

export default rolesRouter;
