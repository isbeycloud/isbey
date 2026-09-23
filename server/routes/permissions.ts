import { Router, Request, Response } from 'express';
import { storage } from '../db/storage';
import { requireAuth } from '../middleware/authGuards';

export const permissionsRouter = Router();

permissionsRouter.use(requireAuth);

// GET /api/permissions - List all available system permissions
permissionsRouter.get('/', (req: Request, res: Response) => {
  const db = storage.getState();
  const permissions = db.permissions || [];

  // Gruplandırılmış formatta da dön
  const grouped: Record<string, typeof permissions> = {};
  for (const p of permissions) {
    if (!grouped[p.module]) grouped[p.module] = [];
    grouped[p.module].push(p);
  }

  res.json({
    success: true,
    permissions,
    grouped,
  });
});

export default permissionsRouter;
