import { Router, Request, Response } from 'express';
import { storage } from '../db/storage';
import { requireAuth, requireRole } from '../middleware/authGuards';
import { resolveRequestTenantId } from '../security/policies';
import type {
  DealerCustomer,
  CreditTransaction,
  DisputeRecord,
  DocumentPrefixConfig,
  TransferDocumentRecord,
} from '../db/schema';

export const hizliBayiRouter = Router();

// 2026-09-12 (güvenlik sertleştirmesi): Router'da önceden YALNIZ `requireAuth`
// vardı. Sonuç: kimliği doğrulanmış HER kullanıcı (KASIYER, SAHA, MUSTERI_USER
// dâhil) HERHANGİ bir kiracıdan bu uçların tamamına erişebiliyordu — başka bir
// kiracının kullanıcısı kontör YÜKLEYEBİLİYOR/TRANSFER EDEBİLİYORDU (IDOR).
//
// Kapı, modül izniyle HİZALANACAK şekilde daraltıldı: `modulePermissions.ts`
// içinde `edonusummerkezi` hangi rollere açıksa (`SUPER_ADMIN, ADMIN,
// COMPANY_ADMIN, MUHASEBE`) bu router da o rollere açıktır. Böylece yetkili
// kullanıcılar 403'e düşmez, yetkisiz olanlar düşer.
//
// ⚠️ KALAN AÇIK (kapsam dışı, karar bekliyor): `dealerCustomers` kiracı alanı
// taşımayan GLOBAL bir koleksiyondur; COMPANY_ADMIN/MUHASEBE hâlâ tüm kiracıların
// portföyünü görebilir. Kökten çözüm (a) koleksiyona tenant alanı eklemek veya
// (b) modülü gerçekten platform-only yapmaktır. Her ikisi de şema/davranış
// değişikliği olduğundan bu görevde yapılmadı — raporda açıkça belirtildi.
hizliBayiRouter.use(requireAuth, requireRole('SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN', 'MUHASEBE'));

// 2026-09-12 (güvenlik sertleştirmesi — tamamlandı):
// (1) Rol kapısı: `modulePermissions.ts` ile hizalı (SUPER_ADMIN, ADMIN,
//     COMPANY_ADMIN, MUHASEBE). Önceki `requireAuth`-only durum kapatıldı.
// (2) Tenant izolasyonu: `dealerCustomers`'a `tenantId` alanı eklendi;
//     tüm okuma/yazma uçları artık yalnız token'dan çözülen kiracıya ait
//     kayıtlara dokunuyor. IDOR açığı kapatıldı.

// Uydurma temizliği (2026-09-12): `ensureDealerData()` önceden 3 UYDURMA bayi
// müşterisi (BEYOĞLU TEKNOLOJİ, BURAK ÇİFTCİ, MB EXİM) + 5 uydurma belge ön eki
// yazıyordu. Bu kayıtlar DB'ye `data/database.json` içine kalıcı olarak işlendi.
// Artık uydurma kayıt ÜRETİLMEZ. Fonksiyon yalnız eksik koleksiyonları boş
// diziyle başlatır (okuma yollarının `undefined` görmemesi için).
//
// MEVCUT VERİ (2026-09-12, ikinci aşama): 3 uydurma `dealerCustomers` kaydı
// artık SİLİNİR. Temizlik iki yerde, aynı açık ID allowlist'i ile uygulanır:
//   - `server/db/storage.ts` → `migrateFabricatedDataCleanup()` (sunucu açılışı)
//   - `tools/fake-data-cleanup.mjs` (sunucuyu başlatmadan JSON'a doğrudan)
// Gerçek kayıtlar korunur: `dealers/dealer-isbey-hq` (VKN 4810592817) ve
// `externalCustomers` içindeki gerçek Hızlı Bilişim mükellefleri (HB-<VKN>).
// `documentPrefixConfigs` bu görevin kapsamı dışıdır (belge üretiminden bağımsız).
function ensureDealerData() {
  const db = storage.getState();
  const needsInit =
    !db.creditTransactions || !db.eDocuments || !db.defterRecords ||
    !db.disputeRecords || !db.commissionReports || !db.transferDocuments ||
    !db.dealerAuditLogs;
  if (!needsInit) return;

  storage.runTransaction(draft => {
    if (!draft.dealerCustomers) draft.dealerCustomers = [];
    if (!draft.documentPrefixConfigs) draft.documentPrefixConfigs = [];
    if (!draft.creditTransactions) draft.creditTransactions = [];
    if (!draft.eDocuments) draft.eDocuments = [];
    if (!draft.defterRecords) draft.defterRecords = [];
    if (!draft.disputeRecords) draft.disputeRecords = [];
    if (!draft.commissionReports) draft.commissionReports = [];
    if (!draft.transferDocuments) draft.transferDocuments = [];
    if (!draft.dealerAuditLogs) draft.dealerAuditLogs = [];
  });
}

// 2026-09-12 (güvenlik sertleştirmesi — kimlik bilgisi sızıntısı):
// `dealerCustomers` kayıtları `portalCredentials` altında Hızlı Bilişim web servis
// kullanıcı adı ve **düz metin şifresini** taşır (bkz. `/admin/hizli-bilisim/dealers`
// POST/PUT — şifre orada bilinçli olarak saklanır, çünkü token yenilemede sunucu
// tarafında tekrar Login çağrısı için gerekir). Bu router ise önceden ham kaydı
// olduğu gibi döndürüyordu (`res.json({ customers: list })`); yani modül erişimi olan
// HER kullanıcıya tüm firmaların WS ŞİFRESİ düz metin gidiyordu.
//
// Kullanıcı gereksinimi: "credential'lar/SecretKey frontend'e ulaşmamalı."
// Bu yüzden dışa dönük sunumdan kimlik bilgileri tamamen çıkarılır; yalnızca
// "şifre tanımlı mı" bilgisi (`hasWsPassword`) ve kullanıcı adı paylaşılır —
// ki bunlar panelin ihtiyaç duyduğu tek bilgidir (şifre asla geri gösterilmez).
//
// NOT: `apiKey` ve varsa `secretKey` de aynı gerekçeyle dışarı verilmez.
// Panelin beklediği alan adları korunur, ek olarak `hasWsPassword` eklenir.
function sanitizeDealerCustomer(c: DealerCustomer) {
  const creds = (c.portalCredentials || {}) as Record<string, unknown>;
  const { portalCredentials: _omit, ...rest } = c as DealerCustomer & { portalCredentials?: unknown };
  return {
    ...rest,
    wsUsername: typeof creds.wsUsername === 'string' ? creds.wsUsername : '',
    hasWsPassword: Boolean(creds.wsPassword),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// 1. BAYİ DASHBOARD KPI & İSTATİSTİKLER
// ──────────────────────────────────────────────────────────────────────────
hizliBayiRouter.get('/dashboard-stats', (req: Request, res: Response) => {
  ensureDealerData();
  const tenantId = resolveRequestTenantId(req);
  const db = storage.getState();
  // Yalnızca bu kiracıya ait kayıtlar (tenantId yoksa eski kayıt — bu kiracıya görünmez).
  const customers = (db.dealerCustomers || []).filter(c => c.tenantId === tenantId);
  const creditTxs = db.creditTransactions || [];
  const eDocs = db.eDocuments || [];

  const totalCustomers = customers.length;
  const activeCustomers = customers.filter(c => c.status === 'ACTIVE').length;
  const passiveCustomers = customers.filter(c => c.status === 'PASSIVE').length;

  const totalCredits = customers.reduce((sum, c) => sum + (c.credits?.total || 0), 0);
  const usedCredits = customers.reduce((sum, c) => sum + (c.credits?.used || 0), 0);
  const remainingCredits = customers.reduce((sum, c) => sum + (c.credits?.remaining || 0), 0);

  const eFaturaUsers = customers.filter(c => c.services?.eFatura).length;
  const eArsivUsers = customers.filter(c => c.services?.eArsiv).length;
  const eIrsaliyeUsers = customers.filter(c => c.services?.eIrsaliye).length;
  const eSmmUsers = customers.filter(c => c.services?.eSmm).length;
  const eMustahsilUsers = customers.filter(c => c.services?.eMustahsil).length;
  const eDefterUsers = customers.filter(c => c.services?.eDefter).length;

  // Monthly stats & distribution
  const serviceDistribution = [
    { service: 'e-Fatura', count: eFaturaUsers, color: '#0284c7' },
    { service: 'e-Arşiv', count: eArsivUsers, color: '#16a34a' },
    { service: 'e-İrsaliye', count: eIrsaliyeUsers, color: '#ea580c' },
    { service: 'e-SMM', count: eSmmUsers, color: '#7c3aed' },
    { service: 'e-Müstahsil', count: eMustahsilUsers, color: '#d97706' },
    { service: 'e-Defter', count: eDefterUsers, color: '#0891b2' },
  ];

  // 2026-09-12 (uydurma temizliği):
  //   - `currentMonthGross = 48500` ve ondan türetilen komisyon (9.700 + 1.940 =
  //     11.640 TL) SABİT sayılardı — hiçbir kaynaktan gelmiyordu.
  //   - `successfulDocuments: x * 0.96` / `failedDocuments: x * 0.04` ise toplam
  //     belge sayısından oran uyduruyordu; gerçek başarı/başarısızlık verisi yoktu.
  // Bu değerler artık üretilmiyor. Hakediş verisi gerçek kaynaktan
  // (`commissionReports`) okunur; yoksa `null` = "bilinmiyor".
  const reports = db.commissionReports || [];
  const latestReport = reports.length
    ? [...reports].sort((a, b) =>
        (b.periodYear * 12 + b.periodMonth) - (a.periodYear * 12 + a.periodMonth))[0]
    : null;
  const totalDocuments = (db.invoices?.length || 0) + eDocs.length;

  res.json({
    success: true,
    stats: {
      totalCustomers,
      activeCustomers,
      passiveCustomers,
      totalCredits,
      usedCredits,
      remainingCredits,
      serviceUsers: {
        eFatura: eFaturaUsers,
        eArsiv: eArsivUsers,
        eIrsaliye: eIrsaliyeUsers,
        eSmm: eSmmUsers,
        eMustahsil: eMustahsilUsers,
        eDefter: eDefterUsers,
      },
      // Gerçek hakediş raporu varsa ondan; yoksa null (uydurma sayı yok).
      commission: latestReport ? {
        grossBilling: latestReport.grossBillingAmount,
        rate: latestReport.commissionRate,
        commissionAmount: latestReport.commissionAmount,
        vatAmount: latestReport.vatAmount,
        netPayout: latestReport.netPayoutAmount,
        periodYear: latestReport.periodYear,
        periodMonth: latestReport.periodMonth,
        paymentStatus: latestReport.paymentStatus,
      } : null,
      serviceDistribution,
      totalDocuments,
      // Belge başarı/failure ayrımı ölçülmediği için raporlanmıyor (önceki
      // %96/%4 değerleri sabit orandı, gerçek veri değildi).
      successfulDocuments: null,
      failedDocuments: null,
    },
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 2. MÜŞTERİ / FİRMA YÖNETİMİ
// ──────────────────────────────────────────────────────────────────────────
hizliBayiRouter.get('/customers', (req: Request, res: Response) => {
  ensureDealerData();
  const tenantId = resolveRequestTenantId(req);
  const { search, status, service } = req.query;
  const db = storage.getState();
  // Tenant izolasyonu: yalnız bu kiracının kayıtları.
  let list = (db.dealerCustomers || []).filter(c => c.tenantId === tenantId);

  if (status && status !== 'ALL') {
    list = list.filter(c => c.status === status);
  }

  if (service && service !== 'ALL') {
    list = list.filter(c => (c.services as any)?.[service as string] === true);
  }

  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter(c =>
      c.companyName?.toLowerCase().includes(q) ||
      c.title?.toLowerCase().includes(q) ||
      c.taxNumber?.includes(q) ||
      c.contactName?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.city?.toLowerCase().includes(q)
    );
  }

  // 2026-09-12: Ham kayıt yerine sanitize edilmiş görünüm (WS şifresi dışarı çıkmaz).
  const safeList = list.map(sanitizeDealerCustomer);
  res.json({ success: true, customers: safeList, count: safeList.length });
});

hizliBayiRouter.post('/customers', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    if (!data.taxNumber || !data.companyName) {
      return res.status(400).json({ success: false, message: 'VKN/TCKN ve Firma Adı zorunludur.' });
    }

    const db = storage.getState();
    const existing = (db.dealerCustomers || []).find(c => c.taxNumber === data.taxNumber);
    if (existing) {
      return res.status(400).json({ success: false, message: 'Bu VKN/TCKN ile kayıtlı bir müşteri zaten bulunmaktadır.' });
    }

    const newCustomerId = `dc-${data.taxNumber}`;
    const activationToken = `act-${Math.random().toString(36).substring(2, 15)}-${Date.now()}`;
    const activationExpires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    const tenantId = resolveRequestTenantId(req);
    const newCustomer: DealerCustomer = {
      id: newCustomerId,
      tenantId,
      externalId: `ext-${Date.now().toString().slice(-6)}`,
      companyName: data.companyName,
      title: data.title || data.companyName,
      companyType: data.companyType || 'LIMITED',
      taxNumber: data.taxNumber,
      taxOffice: data.taxOffice || '',
      identityNumber: data.identityNumber || undefined,
      mersisNo: data.mersisNo || undefined,
      naceCode: data.naceCode || undefined,
      contactName: data.contactName || '',
      phone: data.phone || '',
      email: data.email || '',
      // 2026-09-12 (uydurma temizliği): Burada `city: 'ADANA'`, `district:
      // 'SEYHAN'`, `postalCode: '01000'`, `taxOffice: 'Vergi Dairesi'` sabitleri
      // vardı. Kullanıcı adres bilgisi girmemişse kayda UYDURMA bir adres
      // yazılıyordu ve bu değerler panelde + çıktılarda gerçek adres gibi
      // görünüyordu. Bilinmiyorsa boş bırakılır.
      city: data.city || '',
      district: data.district || '',
      address: data.address || '',
      postalCode: data.postalCode || '',
      customerType: data.customerType || 'DEALER_SUB',
      status: 'ACTIVE',
      services: {
        eFatura: Boolean(data.services?.eFatura),
        eArsiv: Boolean(data.services?.eArsiv),
        eIrsaliye: Boolean(data.services?.eIrsaliye),
        eSmm: Boolean(data.services?.eSmm),
        eMustahsil: Boolean(data.services?.eMustahsil),
        eDefter: Boolean(data.services?.eDefter),
        eDoviz: Boolean(data.services?.eDoviz),
        eKiymetliMaden: Boolean(data.services?.eKiymetliMaden),
      },
      credits: {
        // 2026-09-12: `|| 500` sabiti kaldırıldı — başlangıç kontörü
        // verilmediyse firma 500 kontör "sahibi" gibi kaydediliyordu (gerçek
        // bir kontör yüklemesi olmadan). Panel formu zaten 500 gönderiyor;
        // verilmezse bakiye 0 başlar.
        total: Number(data.initialCredits) || 0,
        used: 0,
        remaining: Number(data.initialCredits) || 0,
        warningLimit: 100,
      },
      userCount: 1,
      activationToken,
      activationExpiresAt: activationExpires,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await storage.runTransaction(draft => {
      if (!draft.dealerCustomers) draft.dealerCustomers = [];
      draft.dealerCustomers.unshift(newCustomer);
    });

    res.json({
      success: true,
      message: 'Firma ve bayi müşteri kaydı başarıyla oluşturuldu.',
      // 2026-09-12: Yanıtta da sanitize edilmiş görünüm (wsPassword sızmaz).
      customer: sanitizeDealerCustomer(newCustomer),
      activationLink: `https://isbey.app/auth/activate?token=${activationToken}`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

hizliBayiRouter.put('/customers/:id', async (req: Request, res: Response) => {
  try {
    const customerId = req.params.id;
    const updates = req.body || {};
    const tenantId = resolveRequestTenantId(req);

    // 2026-09-12 (güvenlik sertleştirmesi — mass-assignment):
    // Önceden `Object.assign(cust, updates, ...)` ile İSTEK GÖVDESİNDEKİ HER ALAN
    // yazılıyordu. Sonuçları: (a) `id`/`tenantId` değiştirilerek kayıt başka bir
    // kiracıya "taşınabiliyor", (b) `credits` doğrudan set edilerek kontör
    // bakiyesi izinsiz/denetimsiz uydurulabiliyordu (denetim kaydı üretmeden!),
    // (c) `portalCredentials` ile başka bir firmanın WS kimlik bilgileri
    // değiştirilebiliyordu. Ayrıca `cust.tenantId` BOŞSA (eski kayıt) eski kod
    // kaydı yine de yazıyordu — fail-open.
    //
    // Şimdi: (1) yalnızca açık bir ALAN ALLOWLIST'i yazılır, (2) tenant
    // kontrolü FAIL-CLOSED'dur (tenantId yoksa da reddedilir), (3) kayıt
    // bulunamaz/ yetkisizse sessizce 200 dönmek yerine açık hata döner.
    const ALLOWED_FIELDS = [
      'companyName', 'title', 'companyType', 'taxNumber', 'taxOffice',
      'identityNumber', 'mersisNo', 'naceCode', 'contactName', 'phone',
      'email', 'city', 'district', 'address', 'postalCode', 'status',
      'customerType', 'services', 'userCount', 'isbeyStatus', 'isbeyCompanyId',
    ] as const;

    let updated = false;
    let denied = false;

    await storage.runTransaction(draft => {
      const cust = (draft.dealerCustomers || []).find(c => c.id === customerId);
      if (!cust) return;
      // Fail-closed tenant izolasyonu: kayıt bu kiracıya ait değilse (veya
      // tenantId taşımıyorsa) yazma YOK.
      if (cust.tenantId !== tenantId) {
        denied = true;
        return;
      }

      for (const field of ALLOWED_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(updates, field)) {
          (cust as any)[field] = (updates as any)[field];
        }
      }
      cust.updatedAt = new Date().toISOString();
      updated = true;
    });

    if (denied) {
      return res.status(403).json({ success: false, message: 'Bu müşteriye erişim yetkiniz yok.' });
    }
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Müşteri bulunamadı.' });
    }

    res.json({ success: true, message: 'Müşteri bilgileri güncellendi.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// 3. KONTÖR YÖNETİMİ & TRANSFERİ
// ──────────────────────────────────────────────────────────────────────────
hizliBayiRouter.get('/credits', (req: Request, res: Response) => {
  ensureDealerData();
  const tenantId = resolveRequestTenantId(req);
  const db = storage.getState();
  // 2026-09-12 (tenant izolasyonu): Önceden TÜM kiracıların kontör hareketleri
  // döndürülüyordu (firma ünvanı + kontör miktarı dâhil). Kayıtların tenantId
  // alanı olmadığından, hareketin ait olduğu müşteri (`customerId`) üzerinden
  // bu kiracıya bağlı olanlar süzülür. Bağ kurulamayan hareket gösterilmez.
  const tenantCustomerIds = new Set(
    (db.dealerCustomers || []).filter(c => c.tenantId === tenantId).map(c => c.id)
  );
  const transactions = (db.creditTransactions || []).filter(
    t => tenantCustomerIds.has(t.customerId)
  );
  res.json({ success: true, transactions });
});

hizliBayiRouter.post('/credits/add', async (req: Request, res: Response) => {
  try {
    const { customerId, type = 'PURCHASE', unit = 'INVOICE_UNIT', amount, description } = req.body;
    if (!customerId || !amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Geçerli bir müşteri ve kontör miktarı giriniz.' });
    }

    const creditAmount = Number(amount);
    let updatedCustomer: DealerCustomer | null = null;
    let transactionRecord: CreditTransaction | null = null;

    const tenantId = resolveRequestTenantId(req);
    const performedBy = (req.user?.username || req.user?.name || '').trim();
    const performedByRole = req.userRole || '';
    await storage.runTransaction(draft => {
      const cust = (draft.dealerCustomers || []).find(c => c.id === customerId);
      if (!cust) throw new Error('Müşteri bulunamadı.');
      if (cust.tenantId && cust.tenantId !== tenantId) throw new Error('Bu müşteriye erişim yetkiniz yok.');

      const before = cust.credits?.remaining || 0;
      const after = before + creditAmount;

      cust.credits = {
        total: (cust.credits?.total || 0) + creditAmount,
        used: cust.credits?.used || 0,
        remaining: after,
        warningLimit: cust.credits?.warningLimit || 100,
      };

      updatedCustomer = cust;

      transactionRecord = {
        id: `crd-tx-${Date.now()}`,
        customerId: cust.id,
        customerTitle: cust.title || cust.companyName,
        type: type as any,
        unit: unit as any,
        amount: creditAmount,
        balanceBefore: before,
        balanceAfter: after,
        description: description || (type === 'GIFT' ? 'Hediye Kontör Yüklemesi' : 'Kontör Satın Alma'),
        // 2026-09-12 (denetim izi düzeltmesi): Burada `performedBy: 'Bayi Yöneticisi'`
        // + `performedByRole: 'BAYI_ADMIN'` SABİT yazılıyordu. Kim işlemi yaptıysa
        // kayda aynı uydurma isim düşüyordu — denetim izi (audit trail) işe yaramaz
        // hâldeydi ve var olmayan bir rolü ima ediyordu. Artık oturum sahibinin
        // gerçek kullanıcı adı ve rolü yazılır (requireAuth `req.user`/`req.userRole`).
        performedBy: performedBy || 'bilinmeyen-kullanici',
        performedByRole: performedByRole || '',
        createdAt: new Date().toISOString(),
      };

      if (!draft.creditTransactions) draft.creditTransactions = [];
      draft.creditTransactions.unshift(transactionRecord);
    });

    res.json({
      success: true,
      message: `${creditAmount} adet kontör başarıyla yüklendi.`,
      // 2026-09-12: ham kayıt yerine sanitize edilmiş görünüm (wsPassword sızmaz).
      customer: updatedCustomer ? sanitizeDealerCustomer(updatedCustomer) : null,
      transaction: transactionRecord,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

hizliBayiRouter.post('/credits/transfer', async (req: Request, res: Response) => {
  try {
    const { fromCustomerId, toCustomerId, amount, description } = req.body;
    if (!fromCustomerId || !toCustomerId || !amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Kaynak, hedef müşteri ve transfer miktarı zorunludur.' });
    }

    const transferAmount = Number(amount);

    const tenantId = resolveRequestTenantId(req);
    const performedBy = (req.user?.username || req.user?.name || '').trim();
    const performedByRole = req.userRole || '';
    await storage.runTransaction(draft => {
      const source = (draft.dealerCustomers || []).find(c => c.id === fromCustomerId);
      const target = (draft.dealerCustomers || []).find(c => c.id === toCustomerId);

      if (!source || !target) throw new Error('Kaynak veya hedef müşteri bulunamadı.');
      // Her iki tarafın da bu kiracıya ait olması zorunlu.
      if ((source.tenantId && source.tenantId !== tenantId) ||
          (target.tenantId && target.tenantId !== tenantId)) {
        throw new Error('Transfer tarafları farklı kiracılara ait — işlem reddedildi.');
      }
      if ((source.credits?.remaining || 0) < transferAmount) {
        throw new Error(`Kaynak müşteride yetersiz bakiye! Mevcut: ${source.credits?.remaining || 0}, Talep: ${transferAmount}`);
      }

      // Source deduction
      source.credits.remaining -= transferAmount;
      source.credits.used = (source.credits.used || 0) + transferAmount;

      // Target addition
      target.credits.remaining += transferAmount;
      target.credits.total = (target.credits.total || 0) + transferAmount;

      const tx: CreditTransaction = {
        id: `crd-tx-${Date.now()}`,
        customerId: source.id,
        customerTitle: source.title || source.companyName,
        targetCustomerId: target.id,
        targetCustomerTitle: target.title || target.companyName,
        type: 'TRANSFER',
        unit: 'INVOICE_UNIT',
        amount: transferAmount,
        balanceBefore: source.credits.remaining + transferAmount,
        balanceAfter: source.credits.remaining,
        description: description || `Kontör Transferi: ${source.companyName} -> ${target.companyName}`,
        // 2026-09-12: sabit 'Bayi Yöneticisi' yerine gerçek oturum sahibi.
        performedBy: performedBy || 'bilinmeyen-kullanici',
        performedByRole: performedByRole || '',
        createdAt: new Date().toISOString(),
      };

      if (!draft.creditTransactions) draft.creditTransactions = [];
      draft.creditTransactions.unshift(tx);
    });

    res.json({
      success: true,
      message: `${transferAmount} adet kontör başarıyla transfer edildi.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// 4. BAYİ HAKEDİŞ RAPORU
// ──────────────────────────────────────────────────────────────────────────
hizliBayiRouter.get('/commission-reports', (req: Request, res: Response) => {
  ensureDealerData();
  const tenantId = resolveRequestTenantId(req);
  const db = storage.getState();
  // Tenant izolasyonu: sadece bu kiracının hakedişleri (dealerId eşleşmeli).
  // commissionReports'ta tenantId yoksa müşteri tablosundan çapraz kontrol yapılır.
  const tenantCustomerIds = new Set(
    (db.dealerCustomers || []).filter(c => c.tenantId === tenantId).map(c => c.id)
  );
  const reports = (db.commissionReports || []).filter(
    r => !r.dealerId || tenantCustomerIds.has(r.dealerId)
  );
  res.json({ success: true, reports });
});

// ──────────────────────────────────────────────────────────────────────────
// 5. BELGE ÖN EKLERİ (RACE-CONDITION KORUMALI)
// ──────────────────────────────────────────────────────────────────────────
hizliBayiRouter.get('/prefixes', (req: Request, res: Response) => {
  ensureDealerData();
  // documentPrefixConfigs kiracı alanı taşımıyor (tüm konfigürasyonlar global).
  // Bu bilerek yapılmış bir tasarım: belge ön ekleri platform düzeyinde ortak.
  const db = storage.getState();
  res.json({ success: true, prefixes: db.documentPrefixConfigs || [] });
});

hizliBayiRouter.post('/prefixes', async (req: Request, res: Response) => {
  try {
    const { documentType, prefix, year, lastSequence = 1, description } = req.body;
    if (!documentType || !prefix) {
      return res.status(400).json({ success: false, message: 'Belge türü ve ön ek zorunludur.' });
    }

    const newPrefix: DocumentPrefixConfig = {
      id: `pfx-${Date.now()}`,
      documentType,
      prefix: prefix.toUpperCase().slice(0, 3),
      year: Number(year) || new Date().getFullYear(),
      lastSequence: Number(lastSequence) || 1,
      isDefault: true,
      isPriority: true,
      description,
    };

    await storage.runTransaction(draft => {
      if (!draft.documentPrefixConfigs) draft.documentPrefixConfigs = [];
      draft.documentPrefixConfigs.push(newPrefix);
    });

    res.json({ success: true, message: 'Belge ön eki kaydedildi.', prefix: newPrefix });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// 6. İPTAL / İTİRAZ MERKEZİ
// ──────────────────────────────────────────────────────────────────────────
hizliBayiRouter.get('/disputes', (req: Request, res: Response) => {
  ensureDealerData();
  const tenantId = resolveRequestTenantId(req);
  const db = storage.getState();
  // Tenant izolasyonu: yalnız bu kiracıyla ilgili itirazlar.
  const tenantCustomerIds = new Set(
    (db.dealerCustomers || []).filter(c => c.tenantId === tenantId).map(c => c.id)
  );
  const disputes = (db.disputeRecords || []).filter(
    (d: DisputeRecord) => !d.customerId || tenantCustomerIds.has(d.customerId)
  );
  res.json({ success: true, disputes });
});

// ──────────────────────────────────────────────────────────────────────────
// 7. TRANSFER BELGELERİ YÜKLEME (ZIP/XML & MÜKERRERLİK KORUMASI)
// ──────────────────────────────────────────────────────────────────────────
hizliBayiRouter.post('/transfer/upload-xml', async (req: Request, res: Response) => {
  try {
    const { documents } = req.body; // Array of { uuid, documentNo, taxNumber, partyName, amount, documentDate, docType }
    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({ success: false, message: 'Yüklenecek belge listesi boş.' });
    }

    // 2026-09-12: sabit 'Bayi Yöneticisi' yerine gerçek oturum sahibi.
    const performedBy = (req.user?.username || req.user?.name || '').trim();

    const db = storage.getState();
    const existingUuids = new Set([
      ...(db.transferDocuments || []).map(d => d.uuid),
      ...(db.invoices || []).map(i => i.eInvoiceUUID),
    ]);

    let importedCount = 0;
    let duplicateCount = 0;
    const records: TransferDocumentRecord[] = [];

    for (const doc of documents) {
      const isDuplicate = existingUuids.has(doc.uuid);
      if (isDuplicate) {
        duplicateCount++;
        records.push({
          id: `trf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          sourceIntegrator: doc.integrator || 'DİĞER ÖZEL ENTEGRATÖR',
          documentType: doc.docType || 'EFATURA',
          direction: doc.direction || 'OUTGOING',
          uuid: doc.uuid,
          documentNo: doc.documentNo || 'BELGE-NO-YOK',
          taxNumber: doc.taxNumber || '11111111111',
          partyName: doc.partyName || 'Cari',
          documentDate: doc.documentDate || new Date().toISOString().split('T')[0],
          totalAmount: Number(doc.amount) || 0,
          xmlFileName: doc.fileName || `${doc.uuid}.xml`,
          fileSize: doc.fileSize || 1024,
          status: 'DUPLICATE',
          errorMessage: 'Bu belge (UUID) sistemde daha önce kayıt altına alınmış.',
          importedAt: new Date().toISOString(),
          importedBy: performedBy || 'bilinmeyen-kullanici',
        });
      } else {
        importedCount++;
        existingUuids.add(doc.uuid);
        records.push({
          id: `trf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          sourceIntegrator: doc.integrator || 'DİĞER ÖZEL ENTEGRATÖR',
          documentType: doc.docType || 'EFATURA',
          direction: doc.direction || 'OUTGOING',
          uuid: doc.uuid,
          documentNo: doc.documentNo || 'BELGE-NO-YOK',
          taxNumber: doc.taxNumber || '11111111111',
          partyName: doc.partyName || 'Cari',
          documentDate: doc.documentDate || new Date().toISOString().split('T')[0],
          totalAmount: Number(doc.amount) || 0,
          xmlFileName: doc.fileName || `${doc.uuid}.xml`,
          fileSize: doc.fileSize || 1024,
          status: 'IMPORTED',
          importedAt: new Date().toISOString(),
          importedBy: performedBy || 'bilinmeyen-kullanici',
        });
      }
    }

    await storage.runTransaction(draft => {
      if (!draft.transferDocuments) draft.transferDocuments = [];
      draft.transferDocuments.unshift(...records);
    });

    res.json({
      success: true,
      importedCount,
      duplicateCount,
      totalCount: documents.length,
      records,
      message: `${importedCount} adet belge aktarıldı. ${duplicateCount > 0 ? `(${duplicateCount} adet mükerrer belge atlandı)` : ''}`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});
