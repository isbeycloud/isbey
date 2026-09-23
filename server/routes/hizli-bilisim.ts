import { validateProviderMatch } from '../security/providerMatching';
import { migrateMemberships } from '../security/memberships';
import { Router, Request, Response } from 'express';
import { storage } from '../db/storage';
import { requireAuth, requireRole } from '../middleware/authGuards';
import { HizliBilisimClient } from '../services/hizliBilisim/hizliBilisimClient';
import { HizliConnectService, tokenStore } from '../services/hizliConnectService';
import { HizliBilisimSyncService } from '../services/hizliBilisim/hizliBilisimSyncService';
import { HizliBilisimMapper } from '../services/hizliBilisim/hizliBilisimMapper';
import type { ExternalCustomer, TenantPlan } from '../db/schema';
import { encryptSecret, decryptSecret } from '../security/credentialVault';
// 2026-09-15: yanıtlardan secret temizliği + PUT'ta sentinel çözümü (iki taraflı).
import {
  maskSecretField,
  maskHizliBilisimSettings,
  resolveSecretField,
  MASKED_SECRET,
} from '../security/credentialMask';

export const hizliBilisimRouter = Router();

// GET /api/admin/hizli-bilisim/customers - List all external customers with KPIs & filters
hizliBilisimRouter.get('/customers', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: Request, res: Response) => {
  try {
    const { status, search } = req.query;
    const db = storage.getState();
    let list: ExternalCustomer[] = db.externalCustomers || [];

    if (status && status !== 'ALL') {
      list = list.filter(c => c.status === status);
    }

    if (search) {
      const q = String(search).toLowerCase().trim();
      list = list.filter(c =>
        (c.companyName || '').toLowerCase().includes(q) ||
        (c.title || '').toLowerCase().includes(q) ||
        (c.contactName || '').toLowerCase().includes(q) ||
        (c.taxNumber || '').includes(q) ||
        (c.phone || '').includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.externalId || '').toLowerCase().includes(q)
      );
    }

    const all = db.externalCustomers || [];
    const kpis = {
      total: all.length,
      new: all.filter(c => c.status === 'NEW').length,
      imported: all.filter(c => c.status === 'IMPORTED').length,
      userCreated: all.filter(c => c.status === 'USER_CREATED').length,
      matched: all.filter(c => c.status === 'MATCHED').length,
      error: all.filter(c => c.status === 'ERROR').length,
    };

    res.json({
      success: true,
      customers: list,
      kpis,
      // 2026-09-15: Önceden `db.hizliBilisimSettings` OLDUĞU GİBİ dönüyordu ve
      // içindeki `apiKey` düz metin olarak tarayıcıya gidiyordu. Artık secret
      // alanları maskelenir; frontend "ayarlı mı" bilgisini `hasApiKey`'den alır.
      // Karşılığı: PUT /settings maskelenmiş değeri gerçek anahtar sanıp
      // ÜZERİNE YAZMAZ (bkz. resolveSecretField kullanımı).
      settings: maskHizliBilisimSettings(db.hizliBilisimSettings),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/hizli-bilisim/customers/:id - Single customer details with matched company/user
hizliBilisimRouter.get('/customers/:id', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: Request, res: Response) => {
  try {
    const db = storage.getState();
    const customer = (db.externalCustomers || []).find(c => c.id === req.params.id || c.externalId === req.params.id);

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Hızlı Bilişim müşteri kaydı bulunamadı.' });
    }

    let linkedCompany = null;
    let linkedUser = null;

    if (customer.isbeyCompanyId) {
      linkedCompany = (db.tenants || []).find(t => t.id === customer.isbeyCompanyId);
    }
    if (customer.isbeyUserId) {
      linkedUser = (db.users || []).find(u => u.id === customer.isbeyUserId);
    }

    const duplicateCheck = HizliBilisimSyncService.checkDuplicate({
      taxNumber: customer.taxNumber,
      externalId: customer.externalId,
      email: customer.email,
    });

    res.json({
      success: true,
      customer,
      linkedCompany,
      linkedUser,
      duplicateCheck,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/hizli-bilisim/sync - Trigger sync with Hızlı Bilişim API
hizliBilisimRouter.post('/sync', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    // 2026-09-12 (uydurma temizliği): İşlem logunda operatör kimliği, token'da
    // username yoksa SABİT 'admin' yazıyordu — yani işlemi kimin yaptığı
    // bilinmediğinde log "admin yaptı" diyordu. Denetim izi (audit trail)
    // uydurma kimlik taşıyamaz; bilinmiyorsa açıkça belirtilir.
    const username = req.user?.username || 'bilinmeyen-kullanici';
    const result = await HizliBilisimSyncService.executeSync(username);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/hizli-bilisim/create-company - Atomic Conversion: Customer -> Company (+ Company Admin + Activation Token)
hizliBilisimRouter.post('/create-company', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const {
      customerId,
      plan = 'PRO',
      isTrial = false,
      trialDays = 14,
      createAdminUser = true,
      customAdminUsername,
      customAdminFullName,
      customAdminEmail,
      customAdminPhone,
    } = req.body;

    const db = storage.getState();
    const ext = (db.externalCustomers || []).find(c => c.id === customerId || c.externalId === customerId);

    if (!ext) {
      return res.status(404).json({ success: false, message: 'Hızlı Bilişim müşteri kaydı bulunamadı.' });
    }

    // Portföy firmasında kayıtlı yetkili yerine, İŞBEY'i kullanacak kişi
    // seçilebilir. Aktivasyon bağlantısı güvenli biçimde hedef e-postaya
    // bağlandığından yönetici hesabı için geçerli bir e-posta zorunludur.
    const adminFullName = String(customAdminFullName || ext.contactName || '').trim();
    const adminEmail = String(customAdminEmail || ext.email || '').trim().toLowerCase();
    const adminPhone = String(customAdminPhone || ext.phone || '').trim();
    if (createAdminUser && (!adminFullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail))) {
      return res.status(400).json({
        success: false,
        message: 'İŞBEY Company Admin hesabı için yetkili adı ve geçerli e-posta adresi zorunludur.',
      });
    }

    // Zaten dönüştürülmüş müşteri kontrolü
    if (ext.isbeyCompanyId || ext.status === 'IMPORTED' || ext.status === 'USER_CREATED') {
      const existingCompany = (db.tenants || []).find(t => t.id === ext.isbeyCompanyId);
      return res.status(400).json({
        success: false,
        message: `Bu Hızlı Bilişim müşterisi zaten İŞBEY firmasına dönüştürülmüştür (${existingCompany?.name || ext.companyName} - ${ext.isbeyCompanyCode || ''}).`,
        company: existingCompany,
      });
    }

    // Duplicate Check (VKN / ExternalId)
    const dup = HizliBilisimSyncService.checkDuplicate({
      taxNumber: ext.taxNumber,
      externalId: ext.externalId,
    });

    if (dup.hasDuplicate && dup.matchedTenant?.id !== ext.isbeyCompanyId) {
      return res.status(400).json({
        success: false,
        message: dup.message || 'Bu müşteri İŞBEY sisteminde zaten kayıtlıdır.',
        matchedTenant: dup.matchedTenant,
      });
    }

    // Execute in Atomic Transaction
    const result = await storage.runTransaction(async draft => {
      // Map to Tenant + Default Resources
      const mapped = HizliBilisimMapper.mapToTenant(ext, {
        plan: plan as TenantPlan,
        isTrial,
        trialDays: Number(trialDays),
      });

      const { tenant, defaultWarehouse, defaultCashRegister, defaultBankAccount } = mapped;

      // Push to collections
      draft.tenants.push(tenant);
      validateProviderMatch(draft, ext.id, tenant.id);
      draft.warehouses.push(defaultWarehouse);
      draft.cashRegisters.push(defaultCashRegister);
      draft.bankAccounts.push(defaultBankAccount);

      let createdUser = null;
      let activationLink = '';
      let activationToken = '';
      let activationExpiresAt = '';

      if (createAdminUser) {
        const adminSource = {
          ...ext,
          contactName: adminFullName,
          email: adminEmail,
          phone: adminPhone,
        };
        const adminMap = HizliBilisimMapper.mapToCompanyAdmin(adminSource, tenant.id, tenant.companyCode || 'ISB-000000');
        createdUser = adminMap.user;
        if (customAdminUsername?.trim()) {
          createdUser.username = customAdminUsername.trim();
        }

        draft.users.push(createdUser);
        migrateMemberships(draft);

        // Create 24h single-use password reset / activation token
        if (!draft.passwordResetTokens) draft.passwordResetTokens = [];
        draft.passwordResetTokens.push({
          token: adminMap.token,
          userId: createdUser.id,
          userEmail: adminEmail,
          expiresAt: adminMap.expiresAt,
          used: false,
          createdAt: new Date().toISOString(),
        });

        activationLink = `/activate?token=${adminMap.token}&email=${encodeURIComponent(adminEmail)}`;
        activationToken = adminMap.token;
        activationExpiresAt = adminMap.expiresAt;
      }

      // Update external customer record
      const targetExt = draft.externalCustomers?.find(c => c.id === ext.id);
      if (targetExt) {
        targetExt.status = createAdminUser ? 'USER_CREATED' : 'IMPORTED';
        targetExt.isbeyCompanyId = tenant.id;
        targetExt.isbeyCompanyCode = tenant.companyCode;
        if (createdUser) {
          targetExt.isbeyUserId = createdUser.id;
          targetExt.isbeyUsername = createdUser.username;
          targetExt.activationToken = activationToken;
          targetExt.activationExpiresAt = activationExpiresAt;
        }
        targetExt.syncedAt = new Date().toISOString();
      }

      return {
        company: tenant,
        user: createdUser,
        activationLink,
      };
    });

    storage.addSyncLog({
      provider: 'HIZLI_BILISIM',
      action: 'COMPANY_CREATED',
      username: req.user?.username || 'bilinmeyen-kullanici',
      companyId: result.company.id,
      externalCustomerId: ext.externalId,
      customerName: ext.companyName,
      details: `Hızlı Bilişim müşterisi İŞBEY Firmasına (${result.company.companyCode} - ${result.company.name}) dönüştürüldü.${result.user ? ` Company Admin (${result.user.username}) ve aktivasyon linki oluşturuldu.` : ''}`,
      status: 'SUCCESS',
    });

    res.json({
      success: true,
      company: result.company,
      user: result.user,
      activationLink: result.activationLink,
      message: `"${result.company.name}" firması ve çalışma ortamı başarıyla oluşturuldu.${result.user ? ' Yönetici hesabı ve aktivasyon bağlantısı hazırlandı.' : ''}`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/hizli-bilisim/create-user - Create Company Admin for an already created company
hizliBilisimRouter.post('/create-user', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const { customerId, username: customUsername } = req.body;
    const db = storage.getState();
    const ext = (db.externalCustomers || []).find(c => c.id === customerId);

    if (!ext) {
      return res.status(404).json({ success: false, message: 'Müşteri kaydı bulunamadı.' });
    }

    if (!ext.isbeyCompanyId) {
      return res.status(400).json({ success: false, message: 'Önce müşteri için İŞBEY firması oluşturulmalıdır.' });
    }

    const company = (db.tenants || []).find(t => t.id === ext.isbeyCompanyId);
    if (!company) {
      return res.status(404).json({ success: false, message: 'İlişkili İŞBEY firması bulunamadı.' });
    }

    const result = await storage.runTransaction(async draft => {
      const adminMap = HizliBilisimMapper.mapToCompanyAdmin(ext, company.id, company.companyCode || 'ISB-000000');
      const newUser = adminMap.user;
      if (customUsername?.trim()) {
        newUser.username = customUsername.trim();
      }

      draft.users.push(newUser);

      if (!draft.passwordResetTokens) draft.passwordResetTokens = [];
      draft.passwordResetTokens.push({
        token: adminMap.token,
        userId: newUser.id,
        userEmail: ext.email,
        expiresAt: adminMap.expiresAt,
        used: false,
        createdAt: new Date().toISOString(),
      });

      const targetExt = draft.externalCustomers?.find(c => c.id === ext.id);
      if (targetExt) {
        targetExt.status = 'USER_CREATED';
        targetExt.isbeyUserId = newUser.id;
        targetExt.isbeyUsername = newUser.username;
      }

      // Update tenant currentUsers count
      const t = draft.tenants.find(ten => ten.id === company.id);
      if (t) {
        t.currentUsers = (t.currentUsers || 0) + 1;
      }

      return {
        user: newUser,
        activationLink: `/activate?token=${adminMap.token}&email=${encodeURIComponent(ext.email)}`,
      };
    });

    storage.addSyncLog({
      provider: 'HIZLI_BILISIM',
      action: 'USER_CREATED',
      username: req.user?.username || 'bilinmeyen-kullanici',
      companyId: company.id,
      externalCustomerId: ext.externalId,
      customerName: ext.companyName,
      details: `Firma için Company Admin kullanıcısı (${result.user.username}) oluşturuldu.`,
      status: 'SUCCESS',
    });

    res.json({
      success: true,
      user: result.user,
      activationLink: result.activationLink,
      message: `"${result.user.fullName}" kullanıcısı oluşturuldu ve aktivasyon bağlantısı hazırlandı.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/hizli-bilisim/match-company - Match customer with an existing İŞBEY company
hizliBilisimRouter.post('/match-company', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const { customerId, companyId } = req.body;
    const db = storage.getState();
    const ext = (db.externalCustomers || []).find(c => c.id === customerId);
    const company = (db.tenants || []).find(t => t.id === companyId);

    if (!ext || !company) {
      return res.status(404).json({ success: false, message: 'Müşteri veya Firma kaydı bulunamadı.' });
    }

    await storage.runTransaction(draft => {
      validateProviderMatch(draft, customerId, companyId);
      const targetExt = draft.externalCustomers?.find(c => c.id === customerId);
      if (targetExt) {
        targetExt.isbeyCompanyId = company.id;
        targetExt.isbeyCompanyCode = company.companyCode;
        targetExt.status = 'MATCHED';
        targetExt.syncedAt = new Date().toISOString();
      }

      const targetTenant = draft.tenants.find(t => t.id === companyId);
      if (targetTenant) {
        targetTenant.externalProvider = 'HIZLI_BILISIM';
        targetTenant.externalCustomerId = ext.externalId;
        targetTenant.syncedAt = new Date().toISOString();
      }
    });

    storage.addSyncLog({
      provider: 'HIZLI_BILISIM',
      action: 'CUSTOMER_MATCHED',
      username: req.user?.username || 'bilinmeyen-kullanici',
      companyId: company.id,
      externalCustomerId: ext.externalId,
      customerName: ext.companyName,
      details: `Hızlı Bilişim müşterisi (${ext.companyName}) mevcut İŞBEY firmasıyla (${company.name}) eşleştirildi.`,
      status: 'SUCCESS',
    });

    res.json({
      success: true,
      message: `"${ext.companyName}" müşterisi "${company.name}" firması ile başarıyla eşleştirildi.`,
    });
  } catch (err: any) {
    res.status(409).json({ success: false, message: err.message });
  }
});

// POST /api/admin/hizli-bilisim/bulk-convert - Batch convert selected customers to companies
hizliBilisimRouter.post('/bulk-convert', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const { customerIds, plan = 'PRO', createAdminUser = true } = req.body;

    if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Dönüştürülecek müşteriler seçilmelidir.' });
    }

    let successCount = 0;
    const errors: string[] = [];

    for (const id of customerIds) {
      const db = storage.getState();
      const ext = (db.externalCustomers || []).find(c => c.id === id);
      if (!ext) continue;

      if (ext.status === 'IMPORTED' || ext.status === 'USER_CREATED') {
        continue; // already converted
      }

      try {
        await storage.runTransaction(async draft => {
          const mapped = HizliBilisimMapper.mapToTenant(ext, { plan });
          draft.tenants.push(mapped.tenant);
          validateProviderMatch(draft, ext.id, mapped.tenant.id);
          draft.warehouses.push(mapped.defaultWarehouse);
          draft.cashRegisters.push(mapped.defaultCashRegister);
          draft.bankAccounts.push(mapped.defaultBankAccount);

          let createdUser = null;
          if (createAdminUser) {
            const adminMap = HizliBilisimMapper.mapToCompanyAdmin(ext, mapped.tenant.id, mapped.tenant.companyCode || 'ISB-000000');
            createdUser = adminMap.user;
            draft.users.push(createdUser);
        migrateMemberships(draft);

            if (!draft.passwordResetTokens) draft.passwordResetTokens = [];
            draft.passwordResetTokens.push({
              token: adminMap.token,
              userId: createdUser.id,
              userEmail: ext.email,
              expiresAt: adminMap.expiresAt,
              used: false,
              createdAt: new Date().toISOString(),
            });
          }

          const targetExt = draft.externalCustomers?.find(c => c.id === ext.id);
          if (targetExt) {
            targetExt.status = createAdminUser ? 'USER_CREATED' : 'IMPORTED';
            targetExt.isbeyCompanyId = mapped.tenant.id;
            targetExt.isbeyCompanyCode = mapped.tenant.companyCode;
            if (createdUser) {
              targetExt.isbeyUserId = createdUser.id;
              targetExt.isbeyUsername = createdUser.username;
            }
            targetExt.syncedAt = new Date().toISOString();
          }
        });

        successCount++;
      } catch (err: any) {
        errors.push(`${ext.companyName}: ${err.message}`);
      }
    }

    res.json({
      success: true,
      processed: customerIds.length,
      successCount,
      errors,
      message: `${successCount} adet müşteri başarıyla İŞBEY firmasına dönüştürüldü.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/hizli-bilisim/test-connection - Test API Connection
hizliBilisimRouter.post('/test-connection', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const result = await HizliBilisimClient.testConnection();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/hizli-bilisim/stats - Integration stats & recent logs
hizliBilisimRouter.get('/stats', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: Request, res: Response) => {
  try {
    const db = storage.getState();
    const customers = db.externalCustomers || [];
    const logs = (db.integrationSyncLogs || []).slice(0, 30);

    res.json({
      success: true,
      stats: {
        totalCustomers: customers.length,
        newCustomers: customers.filter(c => c.status === 'NEW').length,
        importedCustomers: customers.filter(c => c.status === 'IMPORTED' || c.status === 'USER_CREATED').length,
        matchedCustomers: customers.filter(c => c.status === 'MATCHED').length,
        lastSyncAt: db.hizliBilisimSettings?.lastSyncAt,
        lastSyncStatus: db.hizliBilisimSettings?.lastSyncStatus || 'SUCCESS',
        isTestMode: db.hizliBilisimSettings?.isTestMode ?? true,
      },
      logs,
      // 2026-09-15: Aynı sızıntı — settings içindeki apiKey maskelenir.
      settings: maskHizliBilisimSettings(db.hizliBilisimSettings),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/hizli-bilisim/settings - Update Integration Settings
hizliBilisimRouter.put('/settings', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const data = req.body;
    // 2026-09-15: GET artık `apiKey`'i maskeli ('****') döndürdüğü için, PUT'un
    // gövdeyi körlemesine yazması anahtarı SİLERDİ (sentinel gerçek değerin
    // üzerine yazılırdı). Bu yüzden secret alanlar burada ÇÖZÜMLENİR:
    //   - alan hiç gönderilmedi / '****' / boş  → mevcut değer KORUNUR
    //   - gerçek yeni değer gönderildi          → o değer yazılır
    const mevcutAyar = (storage.getState().hizliBilisimSettings || {}) as Record<string, any>;
    const mevcutSecretlar = {
      apiKey: mevcutAyar.apiKey,
      apiSecret: mevcutAyar.apiSecret,
      wsPassword: mevcutAyar.wsPassword,
    };
    const guvenliSecretlar = {
      apiKey: resolveSecretField(data?.apiKey, mevcutSecretlar.apiKey),
      apiSecret: resolveSecretField(data?.apiSecret, mevcutSecretlar.apiSecret),
      wsPassword: resolveSecretField(data?.wsPassword, mevcutSecretlar.wsPassword),
    };
    await storage.runTransaction(draft => {
      const onceki = draft.hizliBilisimSettings || {
        // E-7: PUT /settings varsayılanı TEST URL'idir (canlı URL yanıltıcı izdi).
        apiUrl: 'https://econnecttest.hizliteknoloji.com.tr',
        apiKey: process.env.HIZLI_BILISIM_API_KEY || '', // FAZ 10: hardcode kaldırıldı
        apiUsername: 'isbey_admin',
        isTestMode: true,
        autoSyncEnabled: false,
        autoSyncIntervalMinutes: 15,
        autoCreateCompany: false,
        defaultPlan: 'PRO',
        sendActivationEmail: true,
      };
      draft.hizliBilisimSettings = {
        ...onceki,
        ...data,
        // Secret'lar en SON yazılır: `...data` içinde '****' gelse bile burada
        // gerçek değerle (veya korunmuş mevcut değerle) ezilir.
        ...(guvenliSecretlar.apiKey !== undefined ? { apiKey: guvenliSecretlar.apiKey } : {}),
        ...(guvenliSecretlar.apiSecret !== undefined ? { apiSecret: guvenliSecretlar.apiSecret } : {}),
        ...(guvenliSecretlar.wsPassword !== undefined ? { wsPassword: guvenliSecretlar.wsPassword } : {}),
      };
    });

    // ENV override kullanılıyorsa uyar
    const envPortalUser = process.env.HIZLI_BILISIM_PORTAL_USERNAME;
    const envPortalPass = process.env.HIZLI_BILISIM_PORTAL_PASSWORD;
    const usingEnvCredentials = !!(envPortalUser && envPortalPass);

    res.json({
      success: true,
      settings: storage.getState().hizliBilisimSettings,
      usingEnvCredentials,
      message: 'Hızlı Bilişim entegrasyon ayarları başarıyla güncellendi.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/hizli-bilisim/logs - Audit & integration logs (paged)
hizliBilisimRouter.get('/logs', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: Request, res: Response) => {
  try {
    const db = storage.getState();
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 50;
    const allLogs = (db.integrationSyncLogs || []).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const total = allLogs.length;
    const logs = allLogs.slice((page - 1) * pageSize, page * pageSize);

    res.json({ success: true, logs, total, page, pageSize });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/hizli-bilisim/portal-mapping-matrix - Detailed ERP Company <-> Hizli Portal Mapping Matrix
hizliBilisimRouter.get('/portal-mapping-matrix', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: Request, res: Response) => {
  try {
    const db = storage.getState();
    const tenants = (db.tenants || []).filter(t => !t.isArchived);
    const externalCustomers = db.externalCustomers || [];
    const invoices = db.invoices || [];

    const matrix = tenants.map(t => {
      // Find matching external customer by isbeyCompanyId or taxNumber
      const matchedCustomer = externalCustomers.find(
        c => c.isbeyCompanyId === t.id || (c.taxNumber && c.taxNumber === t.taxNumber)
      );

      // Invoices for this company
      const companyInvoices = invoices.filter(i => !i.companyId || i.companyId === t.id);
      const outgoingCount = companyInvoices.filter(i => i.type === 'SALES').length;
      const incomingCount = companyInvoices.filter(i => i.type === 'PURCHASE').length;
      // 2026-09-16 (`docs/47` §6/C): Bu sayım "SENKRONİZE E-BELGELER — Giden & Gelen
      // GİB ONAYLI Faturalar" kartını besliyor; GİB'e hiç GÖNDERİLMEMİŞ belgeleri
      // saymamalı. Önceden ölçüt `!== 'DRAFT'` idi ve iki sınıfı yanlışlıkla
      // "GİB onaylı" sayıyordu (`docs/47` §4):
      //   • 'MOCK_SENT' — yalnız test sağlayıcısından geçti, entegratöre UĞRAMADI;
      //   • 'CANCELLED' — belge iptal edildi, onaylı sayılamaz.
      // DÜRÜSTLÜK NOTU (bu turda geri alınan bir hata): ilk denemede ölçüt "gönderim
      // izi" (`electronicDocuments`te MOCK olmayan + SENT/DELIVERED/ACCEPTED) yapıldı.
      // Gerçek veride bu, `EFT202600009988` kaydını da düşürdü — oysa kayıt
      // `gibStatusCode='1300'` + "BAŞARIYLA TAMAMLANDI" + `urn:uuid:` ETTN taşıyor,
      // yani GÖNDERİLMİŞ görünüyor; yalnız `electronicDocuments` izi yok (tablo
      // sonradan eklendiği için eski kayıtta iz bulunmuyor). Yerel iz YOKLUĞU
      // "gönderilmedi" KANITI DEĞİLDİR — fail-closed ölçüt burada gerçek bir
      // gönderimi gizlerdi. Bu yüzden ölçüt, kanıtı olan iki sınıfı dışlamakla
      // sınırlı tutuldu; tanıdık olmayan durumlar (ör. 'APPROVED') ESKİSİ GİBİ
      // sayılır, sessizce düşürülmez.
      const GONDERILMEMIS_DURUMLAR = ['DRAFT', 'MOCK_SENT', 'CANCELLED'];
      const eInvoiceCount = companyInvoices.filter(
        i => i.eInvoiceStatus && !GONDERILMEMIS_DURUMLAR.includes(i.eInvoiceStatus)
      ).length;

      const isMatched = !!matchedCustomer;
      // 2026-09-12: `edonusumConfig` yoksa sabit `defaultgb@hizlibilisimteknolojileri.net`
      // URN'i yazmak, firmanın gerçek posta kutusu atanmamışken atanmış gibi
      // gösteriyordu. Artık alan boş kalır — panel "atanmamış" olarak gösterir.
      const gbUrn = t.edonusumConfig?.gbUrn || '';
      const pkUrn = t.edonusumConfig?.pkUrn || '';
      // Aktif hizmet yoksa `?? true` ile "var" varsaymak uydurmaydı; artık
      // servis listesi yoksa `false` (atanmamış) döner.
      const hasService = (code: string) =>
        !!t.activeServices?.some(s => s.serviceCode === code && s.status === 'ACTIVE');

      return {
        companyId: t.id,
        companyCode: t.companyCode,
        companyName: t.name,
        title: t.title || t.name,
        taxNumber: t.taxNumber,
        taxOffice: t.taxOffice,
        city: t.city,
        plan: t.plan,
        status: t.status,
        isMatched,
        matchedCustomer: matchedCustomer ? {
          id: matchedCustomer.id,
          externalId: matchedCustomer.externalId,
          companyName: matchedCustomer.companyName,
          status: matchedCustomer.status,
          syncedAt: matchedCustomer.syncedAt,
        } : null,
        portalConfig: {
          // 2026-09-15: Burada `apiKey` düz metin dönüyordu (mevcut anahtar ya
          // da env'deki canlı anahtar). Frontend bu değeri kullanmıyor; artık
          // yalnızca "ayarlı mı" bilgisi döner.
          apiKey: maskSecretField(t.edonusumConfig?.apiKey || db.hizliBilisimSettings?.apiKey || process.env.HIZLI_BILISIM_API_KEY),
          hasApiKey: !!(
            t.edonusumConfig?.apiKey ||
            db.hizliBilisimSettings?.apiKey ||
            process.env.HIZLI_BILISIM_API_KEY
          ),
          gbUrn,
          pkUrn,
          isTestMode: t.edonusumConfig?.isTestMode ?? db.hizliBilisimSettings?.isTestMode ?? true,
          autoCheckGibUser: t.edonusumConfig?.autoCheckGibUser ?? true,
          defaultProfile: t.edonusumConfig?.defaultProfile || 'TEMELFATURA',
          customUsername: t.edonusumConfig?.username || '',
        },
        services: {
          eFatura: hasService('EFATURA'),
          eArsiv: hasService('EARSIV'),
          eIrsaliye: hasService('EIRSALIYE'),
          eDefter: hasService('EDEFTER'),
          eMustahsil: hasService('EMUSTAHSIL'),
        },
        // 2026-09-12: `total: credits+100`, `remaining: credits || 250`, `used: 100`
        // üçlüsü tamamen uydurmaydı (kontör hareketi yokken 250 kontör "var" gibi).
        // Gerçek kaynak `eInvoiceCredits` alanıdır; yoksa `null` = bilinmiyor.
        credits: {
          total: typeof t.eInvoiceCredits === 'number' ? t.eInvoiceCredits : null,
          remaining: typeof t.eInvoiceCredits === 'number' ? t.eInvoiceCredits : null,
          used: null,
        },
        stats: {
          outgoingInvoices: outgoingCount,
          incomingInvoices: incomingCount,
          syncedEInvoices: eInvoiceCount,
          // Eşleşme/senkron kaydı yoksa `new Date()` yazmak "şimdi senkronize
          // edildi" izlenimi veriyordu. Bilinmiyorsa null.
          lastSyncAt: matchedCustomer?.syncedAt || t.syncedAt || null,
        },
      };
    });

    const totalCompanies = tenants.length;
    const matchedCompanies = matrix.filter(m => m.isMatched).length;
    const unmappedCompanies = totalCompanies - matchedCompanies;
    // Kontör bilinmiyorsa (null) toplama katılmaz — uydurma 0 da sayılmaz.
    const knownCredits = matrix
      .map(m => m.credits.remaining)
      .filter((v): v is number => typeof v === 'number');
    const totalRemainingCredits = knownCredits.length
      ? knownCredits.reduce((acc, v) => acc + v, 0)
      : null;
    const totalSyncedDocs = matrix.reduce((acc, m) => acc + (m.stats.syncedEInvoices || 0), 0);

    res.json({
      success: true,
      matrix,
      summary: {
        totalCompanies,
        matchedCompanies,
        unmappedCompanies,
        totalRemainingCredits,
        creditsKnownFor: knownCredits.length,
        totalSyncedDocs,
        // 2026-09-12: `portalConnected: true` sabiti kaldırıldı — hiçbir bağlantı
        // testi yapılmadan "bağlı" demek uydurmaydı. Gerçek gösterge, oturum
        // token'ının varlığıdır.
        portalConnected: !!tokenStore.token,
        isTestMode: db.hizliBilisimSettings?.isTestMode ?? tokenStore.isTestMode,
        lastSyncAt: db.hizliBilisimSettings?.lastSyncAt,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/hizli-bilisim/map-company-portal - Save/Update company-specific portal config & credentials
hizliBilisimRouter.post('/map-company-portal', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const {
      companyId,
      apiKey,
      username,
      gbUrn,
      pkUrn,
      isTestMode,
      autoCheckGibUser,
      defaultProfile,
      eInvoiceCredits,
      services,
    } = req.body;

    if (!companyId) {
      return res.status(400).json({ success: false, message: 'Firma ID zorunludur.' });
    }

    const db = storage.getState();
    const tenant = (db.tenants || []).find(t => t.id === companyId);
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Firma bulunamadı.' });
    }

    await storage.runTransaction(draft => {
      const targetTenant = draft.tenants.find(t => t.id === companyId);
      if (targetTenant) {
        targetTenant.edonusumConfig = {
          // 2026-09-15: `apiKey` artık sentinel'e duyarlı çözülür. GET maskeli
          // ('****') döndürdüğü için, maskeyi gerçek değer sanıp yazmak anahtarı
          // bozardı; resolveSecretField bu durumda mevcut değeri korur.
          apiKey: resolveSecretField(
            apiKey,
            targetTenant.edonusumConfig?.apiKey || db.hizliBilisimSettings?.apiKey || process.env.HIZLI_BILISIM_API_KEY,
          ) || '',
          username: username || targetTenant.edonusumConfig?.username,
          // 2026-09-12 (uydurma temizliği): Kullanıcı URN girmemişse sabit
          // `defaultgb@hizlibilisimteknolojileri.net` yazılıyordu; bu, firmanın
          // gerçek GİB posta kutusu atanmamışken atanmış gibi görünmesine yol
          // açıyordu. URN verilmediyse ve kayıtta yoksa boş kalır.
          gbUrn: gbUrn || targetTenant.edonusumConfig?.gbUrn || '',
          pkUrn: pkUrn || targetTenant.edonusumConfig?.pkUrn || '',
          isTestMode: isTestMode !== undefined ? isTestMode : targetTenant.edonusumConfig?.isTestMode ?? true,
          autoCheckGibUser: autoCheckGibUser !== undefined ? autoCheckGibUser : true,
          defaultProfile: defaultProfile || targetTenant.edonusumConfig?.defaultProfile || 'TEMELFATURA',
          updatedAt: new Date().toISOString(),
        };

        if (eInvoiceCredits !== undefined) {
          targetTenant.eInvoiceCredits = Number(eInvoiceCredits);
        }

        // Update services if provided
        if (services && typeof services === 'object') {
          if (!targetTenant.activeServices) targetTenant.activeServices = [];
          const serviceCodes = ['EFATURA', 'EARSIV', 'EIRSALIYE', 'EDEFTER', 'EMUSTAHSIL'];
          for (const code of serviceCodes) {
            const isEnabled = services[code] ?? services[code.toLowerCase()] ?? services[code === 'EFATURA' ? 'eFatura' : code === 'EARSIV' ? 'eArsiv' : code === 'EIRSALIYE' ? 'eIrsaliye' : code === 'EDEFTER' ? 'eDefter' : 'eMustahsil'];
            if (isEnabled !== undefined) {
              const existing = targetTenant.activeServices.find(s => s.serviceCode === code);
              if (existing) {
                existing.status = isEnabled ? 'ACTIVE' : 'INACTIVE';
              } else if (isEnabled) {
                targetTenant.activeServices.push({
                  serviceCode: code,
                  serviceName: code,
                  startDate: new Date().toISOString().split('T')[0],
                  endDate: '2028-12-31',
                  status: 'ACTIVE',
                });
              }
            }
          }
        }
      }
    });

    storage.addSyncLog({
      provider: 'HIZLI_BILISIM',
      action: 'PORTAL_MAPPING_UPDATED',
      username: req.user?.username || 'bilinmeyen-kullanici',
      companyId: tenant.id,
      customerName: tenant.name,
      details: `"${tenant.name}" firması için Hızlı Bilişim E-Fatura portal ayarları ve posta kutusu URN eşlemesi güncellendi.`,
      status: 'SUCCESS',
    });

    res.json({
      success: true,
      message: `"${tenant.name}" firmasının e-Fatura portal eşleme ayarları başarıyla kaydedildi.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/hizli-bilisim/auto-match-matrix - Scan all companies & automatically match with portal customers by VKN/TCKN
hizliBilisimRouter.post('/auto-match-matrix', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    let matchedCount = 0;
    const matchResults: Array<{ companyName: string; externalName: string; taxNumber: string }> = [];

    await storage.runTransaction(draft => {
      for (const tenant of draft.tenants) {
        if (tenant.isArchived) continue;

        // Check if matching customer exists by taxNumber
        const ext = draft.externalCustomers?.find(
          c => c.taxNumber && tenant.taxNumber && c.taxNumber.trim() === tenant.taxNumber.trim()
        );

        if (ext) {
          validateProviderMatch(draft, ext.id, tenant.id);
          ext.isbeyCompanyId = tenant.id;
          ext.isbeyCompanyCode = tenant.companyCode;
          ext.status = ext.isbeyUserId ? 'USER_CREATED' : 'MATCHED';
          ext.syncedAt = new Date().toISOString();

          tenant.externalProvider = 'HIZLI_BILISIM';
          tenant.externalCustomerId = ext.externalId;
          tenant.syncedAt = new Date().toISOString();

          if (!tenant.edonusumConfig) {
            tenant.edonusumConfig = {
              apiKey: process.env.HIZLI_BILISIM_API_KEY || '', // FAZ 10
              // 2026-09-12 (uydurma temizliği): Sabit GİB/PK posta kutusu URN'leri
              // yazılıyordu — eşleştirme yapılır yapılmaz firma "posta kutusu
              // atanmış" gibi görünüyordu, oysa URN hiçbir API'den alınmamıştı.
              // Gerçek atama yapılana kadar boş bırakılır.
              gbUrn: '',
              pkUrn: '',
              isTestMode: draft.hizliBilisimSettings?.isTestMode ?? true,
              autoCheckGibUser: true,
              defaultProfile: 'TEMELFATURA',
              updatedAt: new Date().toISOString(),
            };
          }

          matchedCount++;
          matchResults.push({
            companyName: tenant.name,
            externalName: ext.companyName,
            taxNumber: tenant.taxNumber,
          });
        }
      }
    });

    storage.addSyncLog({
      provider: 'HIZLI_BILISIM',
      action: 'AUTO_MATCH_COMPLETED',
      username: req.user?.username || 'bilinmeyen-kullanici',
      details: `${matchedCount} adet İŞBEY firması Hızlı Bilişim Portal mükellefleriyle VKN üzerinden otomatik eşleştirildi.`,
      status: 'SUCCESS',
    });

    res.json({
      success: true,
      matchedCount,
      matches: matchResults,
      message: `${matchedCount} adet firma Hızlı Bilişim e-Fatura portal kayıtlarıyla başarıyla eşleştirildi.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/hizli-bilisim/sync-portal-invoices - Giden belgelerin GİB durumunu GERÇEK API'den tazele
//
// 2026-09-12 (uydurma temizliği): Bu uç önceden tamamen uydurmaydı:
//   (a) DRAFT/PROCESSING giden faturaları hiçbir API çağrısı yapmadan
//       `eInvoiceStatus: 'APPROVED'` + `gibStatusCode: '1300'` ("GİB ONAYLI")
//       yapıyor, eksik UUID'leri `urn:uuid:${id}-4810-5928-1700` diye UYDURUYORDU.
//       GİB onayı bildirmek hukuki sonuç doğurur — uydurma onay kabul edilemez.
//   (b) Sabit UUID'li, sabit 18.500 + 3.700 TL tutarlı bir "MEGA TAŞ" gelen
//       faturasını DB'ye yazıp "portal senkronizasyonu yapıldı" diye log'luyordu.
// Artık YALNIZ gerçek sorgu sonucu yazılır: eInvoiceUUID'si olan giden faturalar
// için `GetDocumentListGUID` çağrılır ve dönen gerçek durum kodu işlenir. UUID'si
// olmayan belgeye durum yazılmaz; gelen belge UYDURULMAZ (gelen belgeler
// GetDocumentReceiverAllList ile ayrı akıştan alınır).
hizliBilisimRouter.post('/sync-portal-invoices', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const token = tokenStore.token;
    if (!token) {
      return res.status(400).json({
        success: false,
        updatedCount: 0,
        newIncomingCount: 0,
        message:
          'Hızlı Bilişim oturumu yok — GİB durum sorgusu için önce bağlantı kurulmalı ' +
          '(Ayarlar → Hızlı Bilişim → Bağlantı Testi). Hiçbir belge durumu değiştirilmedi.',
      });
    }

    const db = storage.getState();
    // 2026-09-16 (`docs/46` §2): Burada eskiden `eInvoiceUUID.startsWith('urn:uuid:')`
    // filtresi vardı. O önek ETTN KANITI DEĞİL, yalnız biçimdir ve ölçümde filtrenin
    // İKİ YÖNDE de yanıldığı görüldü: (a) uydurma `urn:uuid:<id>-<yıl>` değerini
    // gerçek ETTN gibi GİB durum sorgusuna SOKUYOR, (b) e-Arşiv'de göndericinin
    // ürettiği çıplak UUID'li GERÇEK belgeleri sorgudan DÜŞÜRÜYORDU.
    // Belgenin gerçekten gönderildiğinin kanıtı, elektronik belge kaydındaki
    // GÖNDERİM İZİDİR: MOCK olmayan bir sağlayıcıyla oluşmuş VE gönderim
    // durumuna ilerlemiş bir kayıt. Sırada bekleyen/başarısız kayıtlar dışarıda
    // kalır — entegratöre hiç ulaşmamış belgenin durumu sorgulanamaz.
    const GONDERILDI_DURUMLARI = ['SENT', 'DELIVERED', 'ACCEPTED'];
    const gonderimIzli = new Set(
      (db.electronicDocuments || [])
        .filter(d => d.documentType === 'INVOICE'
          && typeof d.providerId === 'string'
          && d.providerId.trim().toUpperCase() !== 'MOCK'
          && GONDERILDI_DURUMLARI.includes(String(d.status)))
        .map(d => d.internalDocumentId)
    );
    const tracked = (db.invoices || []).filter(
      inv => inv.type === 'SALES'
        && typeof inv.eInvoiceUUID === 'string' && inv.eInvoiceUUID.trim().length > 0
        && gonderimIzli.has(inv.id)
    );

    if (tracked.length === 0) {
      return res.json({
        success: true,
        updatedCount: 0,
        newIncomingCount: 0,
        message: 'GİB durumu sorgulanabilecek (gönderim izi olan) giden belge bulunamadı.',
      });
    }

    const isTest = tokenStore.isTestMode;
    // Belge başına sorgu yerine tek çağrıda toplu sorgu (UUID listesi).
    const res1 = await HizliConnectService.getDocumentListByGUID(
      tracked.map(i => i.eInvoiceUUID as string),
      1, // AppType 1: e-Fatura
      token,
      isTest
    );

    if (!res1.success) {
      storage.addSyncLog({
        provider: 'HIZLI_BILISIM',
        action: 'PORTAL_INVOICES_SYNC_ERROR',
        username: req.user?.username || 'bilinmeyen-kullanici',
        details: `GİB durum sorgusu başarısız: ${res1.message || 'bilinmeyen hata'}`,
        status: 'ERROR',
      });
      return res.status(502).json({
        success: false,
        updatedCount: 0,
        newIncomingCount: 0,
        message: `GİB durum sorgusu başarısız: ${res1.message || 'bilinmeyen hata'}`,
      });
    }

    // Gerçek yanıttan gelen belgeler: yalnız API'nin döndürdüğü durum yazılır.
    const docs = Array.isArray(res1.data?.documents) ? res1.data.documents
      : Array.isArray(res1.data) ? res1.data
      : [];

    let updatedCount = 0;
    await storage.runTransaction(draft => {
      for (const doc of docs) {
        const uuid = doc?.uuid || doc?.UUID || doc?.ettn;
        const statusCode = doc?.statusCode ?? doc?.gibStatusCode;
        if (!uuid || statusCode === undefined || statusCode === null) continue;

        const inv = draft.invoices.find(i => i.eInvoiceUUID === uuid);
        if (!inv) continue;

        const desc = doc?.statusDescription || doc?.gibStatusDescription || '';
        // Yalnız GERÇEKTEN değişen kaydı say.
        if (String(inv.gibStatusCode) === String(statusCode)) continue;
        inv.gibStatusCode = String(statusCode);
        if (desc) inv.gibStatusDescription = String(desc);
        inv.updatedAt = new Date().toISOString();
        updatedCount++;
      }

      if (draft.hizliBilisimSettings) {
        draft.hizliBilisimSettings.lastSyncAt = new Date().toISOString();
        draft.hizliBilisimSettings.lastSyncStatus = 'SUCCESS';
      }
    });

    storage.addSyncLog({
      provider: 'HIZLI_BILISIM',
      action: 'PORTAL_INVOICES_SYNCED',
      username: req.user?.username || 'bilinmeyen-kullanici',
      details: `Hızlı Bilişim GİB durum senkronizasyonu: ${tracked.length} belge sorgulandı, ${updatedCount} belgenin durumu güncellendi.`,
      status: 'SUCCESS',
    });

    res.json({
      success: true,
      updatedCount,
      newIncomingCount: 0,
      message: `${tracked.length} giden belge sorgulandı, ${updatedCount} tanesinin GİB durumu güncellendi.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// HIZLI BİLİŞİM BAYİ / MÜKELLEF YÖNETİMİ (PLAN B — UYDURMA ENTEGRASYON YOK)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/hizli-bilisim/dealers - Alt bayiler / mükellefler listesi & KPI'lar
hizliBilisimRouter.get('/dealers', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: Request, res: Response) => {
  try {
    const db = storage.getState();
    const rawList: any[] = db.dealerCustomers || [];

    // Maskeli ve güvenli sunum listesi (WS şifresi ASLA frontend'e gönderilmez)
    const sanitizedList = rawList.map(c => {
      const creds = c.portalCredentials || {};
      const hasPassword = !!creds.wsPassword;
      const lastLogin = c.lastLoginAt ? new Date(c.lastLoginAt).getTime() : 0;
      const tokenExpires = c.tokenExpiresAt ? new Date(c.tokenExpiresAt).getTime() : (lastLogin > 0 ? lastLogin + 24 * 60 * 60 * 1000 : 0);
      const now = Date.now();

      let tokenStatus: 'VALID' | 'EXPIRING' | 'EXPIRED' | 'NONE' = 'NONE';
      if (tokenExpires > 0) {
        if (tokenExpires < now) {
          tokenStatus = 'EXPIRED';
        } else if (tokenExpires - now < 2 * 60 * 60 * 1000) {
          // Son 2 saat kala
          tokenStatus = 'EXPIRING';
        } else {
          tokenStatus = 'VALID';
        }
      }

      const connectionStatus = c.connectionStatus || (creds.wsUsername ? 'ACTIVE' : 'PENDING');

      return {
        id: c.id,
        companyName: c.companyName || c.title || '',
        title: c.title || c.companyName || '',
        taxNumber: c.taxNumber || '',
        taxOffice: c.taxOffice || '',
        contactName: c.contactName || '',
        phone: c.phone || '',
        email: c.email || '',
        // 2026-09-12 (uydurma temizliği): şehir için sabit 'ADANA' fallback'i
        // kaldırıldı; durum için `|| 'ACTIVE'` varsayımı da kaldırıldı — durumu
        // girilmemiş bir firma "aktif" görünüyordu. `createdAt` yoksa `new Date()`
        // yazmak kayıt tarihini "şimdi" gibi gösteriyordu; boş bırakılır.
        // (connectionStatus / tokenStatus / lastLoginAt UYDURMA DEĞİL: bu alanlar
        //  canlı bağlantı testinde gerçekten yazılıyor — bkz. satır ~1032-1094.)
        city: c.city || '',
        district: c.district || '',
        customerType: c.customerType || '',
        status: c.status || '',
        wsUsername: creds.wsUsername || '',
        hasWsPassword: hasPassword,
        connectionStatus,
        tokenStatus,
        tokenExpiresAt: tokenExpires > 0 ? new Date(tokenExpires).toISOString() : null,
        lastLoginAt: c.lastLoginAt || null,
        isbeyStatus: c.isbeyStatus || null,
        isbeyCompanyId: c.isbeyCompanyId || null,
        createdAt: c.createdAt || null,
      };
    });

    const kpis = {
      total: sanitizedList.length,
      activeIntegration: sanitizedList.filter(c => c.connectionStatus === 'ACTIVE' && c.tokenStatus === 'VALID').length,
      tokenIssue: sanitizedList.filter(c => c.tokenStatus === 'EXPIRING' || c.tokenStatus === 'EXPIRED').length,
      pendingSetup: sanitizedList.filter(c => c.status === 'PENDING_APPROVAL' || c.connectionStatus === 'PENDING').length,
    };

    res.json({
      success: true,
      dealers: sanitizedList,
      kpis,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/hizli-bilisim/dealers/test-connection - Belirli bir firma için canlı UtilEncrypt + Login testi
hizliBilisimRouter.post('/dealers/test-connection', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id, wsUsername, wsPassword } = req.body;
    let targetUsername = wsUsername;
    let targetPassword = wsPassword;
    let dealerName = 'Yeni Firma Adayı';
    let taxNumber = '';

    if (id) {
      const db = storage.getState();
      const dealer = (db.dealerCustomers || []).find(d => d.id === id);
      if (!dealer) {
        return res.status(404).json({ success: false, message: 'Firma kaydı bulunamadı.' });
      }
      dealerName = dealer.companyName;
      taxNumber = dealer.taxNumber;
      if (!targetUsername) targetUsername = dealer.portalCredentials?.wsUsername;
      // 2026-09-14: Kayıtlı şifre kasada şifreli tutulur — kullanmadan önce çözülür.
      if (!targetPassword) targetPassword = decryptSecret((dealer.portalCredentials as any)?.wsPassword, 'plaintext');
    }

    if (!targetUsername || !targetPassword) {
      return res.status(400).json({
        success: false,
        message: 'Bağlantı testi için Web Servis Kullanıcı Adı ve Şifresi zorunludur.',
      });
    }

    // Gerçek UtilEncrypt + Login çağrısı
    const authResult = await HizliBilisimClient.authenticateWithCredentials(targetUsername, targetPassword);

    // Durumu veritabanına işle
    if (id) {
      storage.update((draft) => {
        const d = (draft.dealerCustomers || []).find(item => item.id === id);
        if (d) {
          (d as any).connectionStatus = authResult.success ? 'ACTIVE' : 'ERROR';
          (d as any).tokenStatus = authResult.success ? 'VALID' : 'EXPIRED';
          if (authResult.success) {
            d.lastLoginAt = new Date().toISOString();
            (d as any).tokenExpiresAt = authResult.expiresAt;
          }
        }
      });
    }

    // Audit log ekle
    storage.addSyncLog({
      provider: 'HIZLI_BILISIM',
      action: 'DEALER_CONNECTION_TEST',
      username: req.user?.username || 'bilinmeyen-kullanici',
      details: `${dealerName} (${taxNumber || targetUsername}) için Hızlı Bilişim WS testi yapıldı. Sonuç: ${authResult.success ? 'BAŞARILI' : 'HATA: ' + authResult.error}`,
      status: authResult.success ? 'SUCCESS' : 'ERROR',
      errorMessage: authResult.error,
    });

    res.json({
      success: authResult.success,
      message: authResult.success
        ? 'Hızlı Bilişim bağlantısı ve 24 saatlik token alımı başarılı.'
        : authResult.error || 'Hızlı Bilişim oturumu açılamadı.',
      expiresAt: authResult.expiresAt,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/hizli-bilisim/dealers/:id/refresh-token - Firma token'ını yenileme
hizliBilisimRouter.post('/dealers/:id/refresh-token', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = storage.getState();
    const dealer = (db.dealerCustomers || []).find(d => d.id === id);

    if (!dealer) {
      return res.status(404).json({ success: false, message: 'Firma kaydı bulunamadı.' });
    }

    const wsUsername = dealer.portalCredentials?.wsUsername;
    // 2026-09-14: Kasadaki şifreli kayıt kullanımdan önce çözülür.
    const wsPassword = decryptSecret((dealer.portalCredentials as any)?.wsPassword, 'plaintext');

    if (!wsUsername || !wsPassword) {
      return res.status(400).json({
        success: false,
        message: 'Bu firmanın kayıtlı Web Servis kimlik bilgileri eksik. Lütfen önce düzenleyip şifreyi girin.',
      });
    }

    const authResult = await HizliBilisimClient.authenticateWithCredentials(wsUsername, wsPassword);

    storage.update((draft) => {
      const d = (draft.dealerCustomers || []).find(item => item.id === id);
      if (d) {
        (d as any).connectionStatus = authResult.success ? 'ACTIVE' : 'ERROR';
        (d as any).tokenStatus = authResult.success ? 'VALID' : 'EXPIRED';
        if (authResult.success) {
          d.lastLoginAt = new Date().toISOString();
          (d as any).tokenExpiresAt = authResult.expiresAt;
        }
      }
    });

    storage.addSyncLog({
      provider: 'HIZLI_BILISIM',
      action: 'DEALER_TOKEN_REFRESH',
      username: req.user?.username || 'bilinmeyen-kullanici',
      details: `${dealer.companyName} (${dealer.taxNumber}) için token yenilendi. Sonuç: ${authResult.success ? 'BAŞARILI' : 'HATA: ' + authResult.error}`,
      status: authResult.success ? 'SUCCESS' : 'ERROR',
      errorMessage: authResult.error,
    });

    res.json({
      success: authResult.success,
      message: authResult.success ? 'Token başarıyla yenilendi (24 saat geçerli).' : authResult.error,
      expiresAt: authResult.expiresAt,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/hizli-bilisim/dealers - Yeni Alt Bayi / Mükellef oluşturma
hizliBilisimRouter.post('/dealers', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const {
      companyName,
      title,
      taxNumber,
      taxOffice,
      contactName,
      phone,
      email,
      city,
      district,
      address,
      wsUsername,
      wsPassword,
      createIsbeyAccount,
    } = req.body;

    if (!companyName || !taxNumber) {
      return res.status(400).json({ success: false, message: 'Firma Ünvanı ve VKN/TCKN zorunludur.' });
    }

    const cleanVkn = String(taxNumber).trim();
    const db = storage.getState();
    const existing = (db.dealerCustomers || []).find(d => d.taxNumber === cleanVkn);
    if (existing) {
      return res.status(400).json({ success: false, message: `Bu VKN/TCKN (${cleanVkn}) ile kayıtlı bir firma zaten mevcut: ${existing.companyName}` });
    }

    // İŞBEY Tenant hesabı oluşturulması isteniyorsa
    let createdTenantId: string | undefined = undefined;
    if (createIsbeyAccount) {
      const existingTenant = (db.tenants || []).find(t => t.taxNumber === cleanVkn);
      if (existingTenant) {
        createdTenantId = existingTenant.id;
      } else {
        createdTenantId = `tnt-${cleanVkn}`;
        const newTenant: any = {
          id: createdTenantId,
          name: companyName,
          title: title || companyName,
          taxNumber: cleanVkn,
          // 2026-09-12 (uydurma temizliği): `'Merkez V.D.'` ve `'ADANA'` sabitleri
          // kaldırıldı — kullanıcı girmemişse firma kaydına uydurma vergi dairesi
          // ve şehir yazılıyordu.
          taxOffice: taxOffice || '',
          phone: phone || '',
          email: email || '',
          address: address || '',
          city: city || '',
          district: district || '',
          plan: 'PRO',
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        storage.update((draft) => {
          if (!draft.tenants) draft.tenants = [];
          draft.tenants.push(newTenant);
        });
      }
    }

    // Eğer WS şifresi ve kullanıcı adı girildiyse arka planda bağlantıyı test et
    let connStatus = 'PENDING';
    let tokStatus = 'NONE';
    let tokenExpiresAt: string | null = null;
    let lastLoginAt: string | null = null;

    if (wsUsername && wsPassword) {
      const testRes = await HizliBilisimClient.authenticateWithCredentials(wsUsername, wsPassword);
      if (testRes.success) {
        connStatus = 'ACTIVE';
        tokStatus = 'VALID';
        tokenExpiresAt = testRes.expiresAt || null;
        lastLoginAt = new Date().toISOString();
      } else {
        connStatus = 'ERROR';
      }
    }

    const newDealerId = `dc-${cleanVkn}-${Date.now()}`;
    const newDealer: any = {
      id: newDealerId,
      companyName,
      title: title || companyName,
      companyType: cleanVkn.length === 11 ? 'SAHIS' : 'LIMITED',
      taxNumber: cleanVkn,
      taxOffice: taxOffice || '',
      contactName: contactName || '',
      phone: phone || '',
      email: email || '',
      city: city || '',
      district: district || '',
      address: address || '',
      customerType: 'DEALER_SUB',
      status: 'ACTIVE',
      // 2026-09-12 (uydurma temizliği): Hizmet listesi HABERSİZCE
      // eFatura/eArşiv/eİrsaliye/eDefter = true olarak yazılıyordu. Hiçbir
      // hizmet atama işlemi yapılmadan firma "e-Fatura mükellefi" gibi
      // görünüyordu. Artık hiçbiri varsayılan olarak açık değildir.
      services: {
        eFatura: false,
        eArsiv: false,
        eIrsaliye: false,
        eSmm: false,
        eMustahsil: false,
        eDefter: false,
        eDoviz: false,
        eKiymetliMaden: false,
      },
      // 2026-09-12: `total/remaining: 1000` sabiti kaldırıldı — gerçek bir kontör
      // yüklemesi olmadan firmaya 1.000 kontör bakiye yazıyordu. Bakiye 0 başlar;
      // kontör panelden (credits/add) yüklenir.
      credits: {
        total: 0,
        used: 0,
        remaining: 0,
        warningLimit: 100,
      },
      portalCredentials: {
        wsUsername: wsUsername || '',
        // 2026-09-14 (kimlik bilgisi sertleştirmesi): Önceden burada DÜZ METİN
        // yazılıyordu ve yorumu "Backend'de güvenle saklanır" diyordu — bu gerekçe
        // yanlıştı: düz metin, `data/database.json` okuyan herkese açıktır.
        // Artık AES-256-GCM ile şifrelenir (server/security/credentialVault.ts).
        // Dışa açık gönderilmemesi ayrıca sanitize katmanıyla korunuyor.
        wsPassword: encryptSecret(wsPassword) || '',
        // 2026-09-12: `defaultgb@...` / `defaultpk@...` sabit posta kutuları
        // UYDURMADI — bunlar Hızlı Bilişim'in varsayılan GİB posta kutusu
        // şablonudur ve gerçek GİB atamasının yerine geçemez. Kullanıcının
        // girdiği e-posta alan adıyla üretmek de "atanmış" izlenimi veriyordu.
        // Gerçek URN atanana kadar boş bırakılır (panel "atanmamış" gösterir).
        gbUrn: '',
        pkUrn: '',
      },
      userCount: 1,
      isbeyCompanyId: createdTenantId,
      isbeyStatus: createdTenantId ? 'ACTIVE' : 'PENDING',
      connectionStatus: connStatus,
      tokenStatus: tokStatus,
      tokenExpiresAt,
      lastLoginAt,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    storage.update((draft) => {
      if (!draft.dealerCustomers) draft.dealerCustomers = [];
      draft.dealerCustomers.push(newDealer);
    });

    storage.addSyncLog({
      provider: 'HIZLI_BILISIM',
      action: 'DEALER_CREATED',
      username: req.user?.username || 'bilinmeyen-kullanici',
      details: `Yeni mükellef/bayi eklendi: ${companyName} (${cleanVkn}). İŞBEY Hesabı: ${createIsbeyAccount ? 'Oluşturuldu' : 'Bağlanmadı'}. WS Durumu: ${connStatus}`,
      status: 'SUCCESS',
    });

    res.json({
      success: true,
      message: 'Firma başarıyla kaydedildi.',
      dealerId: newDealerId,
      connectionStatus: connStatus,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/hizli-bilisim/dealers/:id - Firma ve WS bilgilerini güncelleme
hizliBilisimRouter.put('/dealers/:id', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      companyName,
      title,
      taxOffice,
      contactName,
      phone,
      email,
      city,
      district,
      address,
      wsUsername,
      wsPassword,
    } = req.body;

    const db = storage.getState();
    const dealer = (db.dealerCustomers || []).find(d => d.id === id);
    if (!dealer) {
      return res.status(404).json({ success: false, message: 'Firma kaydı bulunamadı.' });
    }

    storage.update((draft) => {
      const d = (draft.dealerCustomers || []).find(item => item.id === id);
      if (d) {
        if (companyName) d.companyName = companyName;
        if (title) d.title = title;
        if (taxOffice) d.taxOffice = taxOffice;
        if (contactName) d.contactName = contactName;
        if (phone) d.phone = phone;
        if (email) d.email = email;
        if (city) d.city = city;
        if (district) d.district = district;
        if (address) d.address = address;

        if (!d.portalCredentials) d.portalCredentials = {};
        if (wsUsername !== undefined) d.portalCredentials.wsUsername = wsUsername;
        // Eğer yeni şifre girilmişse güncelle; boş bırakılmışsa mevcut şifreyi koru.
        // 2026-09-14: Yeni değer artık kasadan geçer (düz metin yazılmaz).
        if (wsPassword && wsPassword.trim().length > 0) {
          (d.portalCredentials as any).wsPassword = encryptSecret(wsPassword.trim()) || '';
        }

        d.updatedAt = new Date().toISOString();
      }
    });

    storage.addSyncLog({
      provider: 'HIZLI_BILISIM',
      action: 'DEALER_UPDATED',
      username: req.user?.username || 'bilinmeyen-kullanici',
      details: `Firma güncellendi: ${companyName || dealer.companyName} (${dealer.taxNumber})`,
      status: 'SUCCESS',
    });

    res.json({ success: true, message: 'Firma bilgileri başarıyla güncellendi.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/hizli-bilisim/dealers/logs - Entegrasyon & işlem logları
hizliBilisimRouter.get('/dealers/logs', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: Request, res: Response) => {
  try {
    const db = storage.getState();
    const logs = (db.integrationSyncLogs || [])
      .filter(l => l.provider === 'HIZLI_BILISIM')
      .slice(-100)
      .reverse();

    res.json({ success: true, logs });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});
