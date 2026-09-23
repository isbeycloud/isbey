import { Router } from 'express';
import { storage } from '../db/storage';
// FAZ 25.2-A (C4): Backup uçları kritik yetki gerektirir (tüm DB dump)
import { requireAuth, requireRole } from '../middleware/authGuards';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

// Get all settings & company info
settingsRouter.get('/', (req, res) => {
  const db = storage.getState();
  res.json({
    success: true,
    company: db.company,
    sequences: db.sequences,
    settings: db.settings,
  });
});

// Update company info
settingsRouter.put('/company', requireRole('SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'), async (req, res) => {
  const updateData = req.body;
  try {
    const updated = await storage.runTransaction(draft => {
      const linked = draft.tenants.find(t => t.id === req.tenantId);
      if (linked?.externalCustomerId && updateData.taxNumber !== undefined && String(updateData.taxNumber).trim() !== linked.taxNumber.trim()) throw new Error('Sağlayıcıya bağlı firmanın VKN/TCKN değeri değiştirilemez.');
      const allowed = ['name', 'title', 'taxNumber', 'taxOffice', 'email', 'phone', 'address', 'city', 'district', 'postalCode', 'website', 'logoUrl', 'costingMethod'];
      const patch = Object.fromEntries(Object.entries(updateData).filter(([key]) => allowed.includes(key)));
      draft.company = { ...draft.company, ...patch, id: req.tenantId! };
      const tenant = draft.tenants.find(t => t.id === req.tenantId)!;
      Object.assign(tenant, Object.fromEntries(Object.entries(patch).filter(([key]) => key in tenant)));
      return draft.company;
    });

    storage.addAuditLog({
      userId: req.user.id,
      username: req.user.username,
      companyId: req.tenantId,
      action: 'SETTINGS_CHANGE',
      module: 'SETTINGS',
      ipAddress: req.ip || '127.0.0.1',
      details: 'Firma genel bilgileri güncellendi',
    });

    res.json({ success: true, company: updated, message: 'Firma bilgileri kaydedildi.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Update sequences (Belge Numaraları)
settingsRouter.put('/sequences', requireRole('SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'), async (req, res) => {
  const { sequences } = req.body;
  try {
    await storage.runTransaction(draft => {
      if (!sequences || typeof sequences !== 'object' || Array.isArray(sequences)) throw new Error('Geçerli belge serileri zorunludur.');
      for (const [key, value] of Object.entries(sequences)) {
        const seq = value as any;
        if (!/^[A-Z0-9_]+$/.test(key) || !seq || typeof seq.prefix !== 'string' || !Number.isInteger(seq.year) || !Number.isInteger(seq.lastNumber) || seq.lastNumber < 0 || !Number.isInteger(seq.length) || seq.length < 1 || seq.length > 20) throw new Error('Geçersiz belge serisi.');
        const previous = draft.sequences[key];
        if (previous && (seq.year < previous.year || (seq.year === previous.year && seq.lastNumber < previous.lastNumber))) throw new Error('Belge sayacı geriye alınamaz.');
      }
      draft.sequences = { ...draft.sequences, ...sequences };
      return draft.sequences;
    });

    storage.addAuditLog({
      userId: req.user.id,
      username: req.user.username,
      companyId: req.tenantId,
      action: 'SETTINGS_CHANGE',
      module: 'SETTINGS',
      ipAddress: req.ip || '127.0.0.1',
      details: 'Belge numaralandırma serileri güncellendi',
    });

    res.json({ success: true, message: 'Numaralandırma serileri kaydedildi.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Update System Settings (Yazıcı, Ses, Vergi)
settingsRouter.put('/system', requireRole('SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN'), async (req, res) => {
  const updateData = req.body;
  try {
    const updated = await storage.runTransaction(draft => {
      draft.settings = { ...draft.settings, ...updateData };
      return draft.settings;
    });

    storage.addAuditLog({
      userId: req.user.id,
      username: req.user.username,
      companyId: req.tenantId,
      action: 'SETTINGS_CHANGE',
      module: 'SETTINGS',
      ipAddress: req.ip || '127.0.0.1',
      details: 'Yazıcı ve sistem ayarları güncellendi',
    });

    res.json({ success: true, settings: updated, message: 'Sistem ayarları güncellendi.' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Create Backup (Yedek Al)
// FAZ 25.2-A (C4): Backup tüm veritabanının dump'ını üretir — yalnızca SUPER_ADMIN
// (onaylı karar: "backup.* sadece SUPER_ADMIN, diğer tüm roller 403").
// FAZ 25.5: checksum sidecar üretimi + retention prune storage.backup() içinde.
settingsRouter.post('/backup', requireAuth, requireRole('SUPER_ADMIN'), (req, res) => {
  try {
    const filename = storage.backup();
    const checksumOk = storage.verifyBackupChecksum(filename);
    if (!checksumOk) {
      // Checksum kendini doğrulamıyorsa yedek güvenilmez sayılır — operatör bilgilendirilir
      console.error('[BACKUP] Yeni yedeğin checksum doğrulaması başarısız:', filename);
    }
    storage.addAuditLog({
      userId: req.user.id,
      username: req.user.username,
      companyId: req.tenantId,
      action: 'SETTINGS_CHANGE',
      module: 'BACKUP',
      ipAddress: req.ip || '127.0.0.1',
      details: `Manuel veritabanı yedeği alındı: ${filename} (checksum: ${checksumOk ? 'DOĞRULANDI' : 'DOĞRULANAMADI'})`,
    });
    res.json({
      success: checksumOk,
      filename,
      checksumVerified: checksumOk,
      message: checksumOk
        ? `Yedekleme başarıyla oluşturuldu: ${filename}`
        : `Yedek oluşturuldu AMA checksum doğrulaması başarısız: ${filename} — yedeği kullanmadan önce kontrol edin.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get Audit Logs
settingsRouter.get('/audit-logs', (req, res) => {
  const { module, action, limit } = req.query;
  const db = storage.getState();
  let list = db.auditLogs.filter(log => log.companyId === req.tenantId);

  if (module && module !== 'ALL') {
    list = list.filter(l => l.module === module);
  }

  if (action && action !== 'ALL') {
    list = list.filter(l => l.action === action);
  }

  const max = Number(limit) || 100;
  res.json({ success: true, auditLogs: list.slice(0, max) });
});
