import { Router } from 'express';
import { storage } from '../../db/storage';
import { TaskService } from '../../services/faz8/taskService';
// FAZ 25.2-C: tenantId yalnızca token'dan çözümlenir (query/body/header kaynağı yasak)
import { resolveRequestTenantId } from '../../security/policies';

const router = Router();

/**
 * GET /api/v1/tasks
 * Görev listesi
 */
router.get('/', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const status = req.query.status as string;
  const db = storage.getState();

  let list = (db.workspaceTasks || []).filter(
    t => t.tenantId === tenantId || (!t.tenantId && tenantId === 'tnt-isbey')
  );

  if (status) list = list.filter(t => t.status === status);

  return res.json({ success: true, count: list.length, tasks: list });
});

/**
 * POST /api/v1/tasks
 * Yeni görev oluşturur
 */
router.post('/', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const {
      title,
      description,
      assignedToUserId,
      assignedToName,
      createdByUserId = 'usr-admin',
      createdByName = 'Yönetici',
      priority,
      dueDate,
      tags,
    } = req.body;

    if (!title || !assignedToUserId) {
      return res.status(400).json({ success: false, message: 'Görev başlığı ve atanan kişi zorunludur.' });
    }

    const task = await TaskService.createTask({
      tenantId,
      title,
      description,
      assignedToUserId,
      assignedToName: assignedToName || 'Personel',
      createdByUserId,
      createdByName,
      priority,
      dueDate: dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      tags,
    });

    return res.status(201).json({ success: true, message: 'Görev başarıyla oluşturuldu.', task });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message || 'Görev oluşturulamadı.' });
  }
});

/**
 * PATCH /api/v1/tasks/:id/status
 * Görev durumunu günceller
 */
router.patch('/:id/status', async (req, res) => {
  try {
    const tenantId = resolveRequestTenantId(req);
    const { status, userId = 'usr-admin', userName = 'Yönetici' } = req.body;

    if (!status) return res.status(400).json({ success: false, message: 'Yeni durum zorunludur.' });

    const task = await TaskService.updateTaskStatus({
      tenantId,
      taskId: req.params.id,
      userId,
      userName,
      newStatus: status,
    });

    return res.json({ success: true, message: 'Görev durumu güncellendi.', task });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message || 'Durum güncellenemedi.' });
  }
});

export default router;
