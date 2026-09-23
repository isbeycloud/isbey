import 'dotenv/config'; // .env dosyasını yükle — import hoisting'den önce çalışması için side-effect import
import './config/productionGuard';
import path from 'node:path';

import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth';
import { dashboardRouter } from './routes/dashboard';
import { customersRouter } from './routes/customers';
import { productsRouter } from './routes/products';
import { invoicesRouter } from './routes/invoices';
import { cashRouter } from './routes/cash';
import { banksRouter } from './routes/banks';
import { checksRouter } from './routes/checks';
import { employeesRouter } from './routes/employees';
import { reportsRouter } from './routes/reports';
import { aiRouter } from './routes/ai';
import { settingsRouter } from './routes/settings';
import { syncRouter } from './routes/sync';
import quotesRouter from './routes/quotes';
import waybillsRouter from './routes/waybills';
import expensesRouter from './routes/expenses';
import usersRouter from './routes/users';
import efaturaRouter from './routes/efatura';
import importRouter from './routes/import';
import { searchRouter } from './routes/search';
import { costCentersRouter } from './routes/cost-centers';
import { formDesignsRouter } from './routes/form-designs';
import invoiceDesignsRouter from './routes/invoice-designs';
import reportDesignsRouter from './routes/report-designs';
import { tenantsRouter } from './routes/tenants';
import { companiesRouter } from './routes/companies';
import { adminUsersRouter } from './routes/admin-users';
import { servicesRouter } from './routes/services';
import { hizliBilisimRouter } from './routes/hizli-bilisim';
import { hizliDefterRouter } from './routes/hizli-defter';
import { documentTemplatesRouter } from './routes/document-templates';
import { hizliBayiRouter } from './routes/hizli-bayi';
import { supportRouter } from './routes/support';
import { rolesRouter } from './routes/roles';
import { permissionsRouter } from './routes/permissions';
import { invitationsRouter } from './routes/invitations';
import { impersonationRouter } from './routes/admin-impersonation';
import { v1CustomersRouter } from './routes/v1/customers';
import { v1ProductsRouter } from './routes/v1/products';
import { v1CashRouter } from './routes/v1/cash';
import { v1BanksRouter } from './routes/v1/banks';
import { v1CollectionsRouter } from './routes/v1/collections';
import { v1FinancialTransactionsRouter } from './routes/v1/financial-transactions';
import { v1ReportsRouter } from './routes/v1/reports';
import { v1InvoicesRouter } from './routes/v1/invoices';
import { v1QuotesRouter } from './routes/v1/quotes';
import { v1OrdersRouter } from './routes/v1/orders';
import { v1WaybillsRouter } from './routes/v1/waybills';
import { v1EDocumentsRouter } from './routes/v1/e-documents';
import { v1TaxpayersRouter } from './routes/v1/taxpayers';
import { v1EinvoiceSettingsRouter } from './routes/v1/e-invoice-settings';
import { v1IntegrationsRouter } from './routes/v1/integrations';
import { hizliIntegrationsRouter } from './routes/v1/hizli-integrations';
import { plansRouter } from './routes/v1/plans';
import { subscriptionsRouter } from './routes/v1/subscriptions';
import { creditsRouter } from './routes/v1/credits';
import { paymentsRouter } from './routes/v1/payments';
import { usageRouter } from './routes/v1/usage';
import { dealersRouter } from './routes/v1/dealers';
import { adminSaasRouter } from './routes/v1/admin-saas';
import { v1CheckoutRouter } from './routes/v1/checkout';
import v1MobileRouter from './routes/v1/mobile';
import v1FieldCollectionsRouter from './routes/v1/field-collections';
import v1VisitsRouter from './routes/v1/visits';
import v1PosRouter from './routes/v1/pos';
import v1BankMatchingRouter from './routes/v1/bank-matching';
import v1PaymentLinksRouter from './routes/v1/payment-links';
import v1AdvancedReportsRouter from './routes/v1/advanced-reports';
import v1AiRouter from './routes/v1/ai';
import v1AiInsightsRouter from './routes/v1/ai-insights';
import v1DocumentAiRouter from './routes/v1/document-ai';
import v1AccountantRouter from './routes/v1/accountant';
import v1AutomationsRouter from './routes/v1/automations';
import v1ClientRouter from './routes/v1/client';
import v1DocumentsRouter from './routes/v1/documents';
import v1TasksRouter from './routes/v1/tasks';
import v1ApprovalsRouter from './routes/v1/approvals';
import v1MessagesRouter from './routes/v1/messages';
import v1SupportFaz8Router from './routes/v1/support-faz8';
import v1OnboardingRouter from './routes/v1/onboarding';
import v1DevicesRouter from './routes/v1/devices';
import v1ActivityLogsRouter from './routes/v1/activity-logs';
import v1PlatformAdminRouter from './routes/v1/platform-admin';
import v1DealerRouter from './routes/v1/dealer';
import v1DeveloperRouter from './routes/v1/developer';
import v1MarketplaceRouter from './routes/v1/marketplace';
import v1BillingRouter from './routes/v1/billing';
import v1WhiteLabelRouter from './routes/v1/whitelabel';
import v1PromotionsRouter from './routes/v1/promotions';
import { monitoringRouter } from './routes/v1/monitoring';
import { MonitoringService } from './services/monitoringService';
import { HizliConnectService } from './services/hizliConnectService';
import { ElectronicDocumentQueue } from './services/electronicDocumentQueue';
// Canlı QA Test Ekranı (FAZ 25 doğrulama paneli — yalnız SUPER_ADMIN/ADMIN)
import { testScreenRouter } from './routes/test-screen';
// FAZ 25.1: DEFAULT DENY security gate — tüm router mount'larından ÖNCE bağlanır
import { defaultDeny } from './middleware/securityGate';
// FAZ 25.4: Production security layer — security headers + CORS allowlist
// (rate limit router içinde yalnızca public webhook uçlarına uygulanır —
//  mount öneki yerine route seviyesinde, kimlikli uçlar etkilenmesin diye)
import { securityHeaders, buildCorsOptions } from './middleware/productionSecurity';
// FAZ 27: Environment management & fail-closed security validation
import { validateEnvironmentConfig, getEnvironment, getDatabasePath, isProduction } from './config/environment';

// FAZ 27: Ortam konfigürasyonu güvenlik doğrulaması
const envValidation = validateEnvironmentConfig();
if (!envValidation.isValid && isProduction()) {
  console.error('❌ [FATAL CONFIG] Production environment validation failed:');
  for (const err of envValidation.errors) {
    console.error('   - ' + err);
  }
  process.exit(1);
}
if (envValidation.warnings.length > 0) {
  for (const warn of envValidation.warnings) {
    console.warn('⚠️  [CONFIG WARN] ' + warn);
  }
}

const app = express();
const PORT = process.env.PORT || 4000;

// 2026-09-12 (XFF bypass düzeltmesi): Rate limiter'ın doğru istemci IP'sini
// görebilmesi için proxy güveni AÇIKÇA ve env ile yapılandırılır. Express
// varsayılanı `trust proxy = false`'tur: bu durumda `req.ip` gerçek socket
// adresidir ve istemcinin uydurduğu `X-Forwarded-For` başlığı YOK SAYILIR
// (güvenli varsayılan). Ters proxy arkasında dağıtımda TRUST_PROXY ayarlanmalı:
//   TRUST_PROXY=true      → tüm proxy'ler güvenilir (yalnızca tümü sizinse)
//   TRUST_PROXY=1         → 1 atlama (ör. tek nginx/cloudflare tüneli)
//   TRUST_PROXY=loopback  → yalnızca loopback proxy (ör. aynı makinede nginx)
// Tanımsızsa hiçbir şey yapılmaz = mevcut/güvenli davranış korunur.
const trustProxyRaw = (process.env.TRUST_PROXY || '').trim();
if (trustProxyRaw) {
  if (trustProxyRaw === 'true') {
    app.set('trust proxy', true);
  } else if (/^\d+$/.test(trustProxyRaw)) {
    app.set('trust proxy', Number.parseInt(trustProxyRaw, 10));
  } else {
    app.set('trust proxy', trustProxyRaw);
  }
}

// FAZ 25.4 #1: Temel güvenlik başlıkları (nosniff, frame-deny, referrer-policy; HSTS/CSP env ile)
app.use(securityHeaders);

// FAZ 25.4 #2: CORS — CORS_ALLOW_ORIGINS env tanımlıysa allowlist devrede;
// tanımsızsa mevcut geliştirme davranışı KORUNUR (çalışan akışı bozmamak için).
app.use(cors(buildCorsOptions() as cors.CorsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// FAZ 25.1: Security Gate — allowlist dışındaki HER /api/* isteği requireAuth'tan geçer.
// Not: Tüm router mount'larından ÖNCE gelmelidir (bypass önleme — FAZ 25 planı §25.2).
app.use('/api', defaultDeny);

// FAZ 28: Request logger & API metrik kaydı
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    MonitoringService.recordRequest(req.method, req.originalUrl, res.statusCode, duration, (req as any).user?.companyId);
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[API] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/search', searchRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/customers', customersRouter);
app.use('/api/products', productsRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/quotes', quotesRouter);
app.use('/api/waybills', waybillsRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/users', usersRouter);
app.use('/api/efatura', efaturaRouter);
app.use('/api/import', importRouter);
app.use('/api/cash', cashRouter);
app.use('/api/banks', banksRouter);
app.use('/api/checks', checksRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/form-designs', formDesignsRouter);
app.use('/api/invoice-designs', invoiceDesignsRouter);
app.use('/api/report-designs', reportDesignsRouter);
app.use('/api/document-templates', documentTemplatesRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/sync', syncRouter);
app.use('/api/cost-centers', costCentersRouter);
app.use('/api/tenants', tenantsRouter);
app.use('/api/admin/companies', companiesRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/admin/users', adminUsersRouter);
app.use('/api/admin/services', servicesRouter);
app.use('/api/admin/hizli-bilisim', hizliBilisimRouter);
app.use('/api/edefter', hizliDefterRouter);
app.use('/api/hizli-bayi', hizliBayiRouter);
app.use('/api/support', supportRouter);
app.use('/api/roles', rolesRouter);
app.use('/api/permissions', permissionsRouter);
app.use('/api/invitations', invitationsRouter);
app.use('/api/admin', impersonationRouter);

// ──────────────────────────────────────────────────────────
// FAZ 2: V1 REST API ROTARI
// ──────────────────────────────────────────────────────────
app.use('/api/v1/customers', v1CustomersRouter);
app.use('/api/v1/products', v1ProductsRouter);
app.use('/api/v1/invoices', v1InvoicesRouter);
app.use('/api/v1/quotes', v1QuotesRouter);
app.use('/api/v1/orders', v1OrdersRouter);
app.use('/api/v1/waybills', v1WaybillsRouter);
app.use('/api/v1/e-documents', v1EDocumentsRouter);
app.use('/api/v1/taxpayers', v1TaxpayersRouter);
app.use('/api/v1/e-invoice', v1EinvoiceSettingsRouter);
app.use('/api/v1/integrations', v1IntegrationsRouter);
app.use('/api/admin/integrations/hizli-bilisim', hizliIntegrationsRouter);
app.use('/api/v1/plans', plansRouter);
app.use('/api/v1/subscriptions', subscriptionsRouter);
app.use('/api/v1/credits', creditsRouter);
app.use('/api/v1/payments', paymentsRouter);
app.use('/api/v1/usage', usageRouter);
app.use('/api/v1/dealers', dealersRouter);
app.use('/api/v1/admin/saas', adminSaasRouter);
app.use('/api/v1/checkout', v1CheckoutRouter);
app.use('/api/v1/cash', v1CashRouter);
app.use('/api/v1/banks', v1BanksRouter);
app.use('/api/v1/collections', v1CollectionsRouter);
app.use('/api/v1/financial-transactions', v1FinancialTransactionsRouter);
app.use('/api/v1/reports', v1ReportsRouter);

// FAZ 6: Mobil + Saha + POS + Banka Mutabakat + QR + Raporlama
app.use('/api/v1/mobile', v1MobileRouter);
app.use('/api/v1/field-collections', v1FieldCollectionsRouter);
app.use('/api/v1/visits', v1VisitsRouter);
app.use('/api/v1/pos', v1PosRouter);
app.use('/api/v1/bank-matching', v1BankMatchingRouter);
app.use('/api/v1/payment-links', v1PaymentLinksRouter);
app.use('/api/v1/reports/advanced', v1AdvancedReportsRouter);

// FAZ 7: AI Muhasebe + OCR + Akıllı Finans + Otomasyon + Mali Müşavir Platformu
app.use('/api/v1/ai', v1AiRouter);
app.use('/api/v1/ai-insights', v1AiInsightsRouter);
app.use('/api/v1/document-ai', v1DocumentAiRouter);
app.use('/api/v1/accountant', v1AccountantRouter);
app.use('/api/v1/automations', v1AutomationsRouter);

// FAZ 8: Müşteri Portalı + Belge Merkezi + Görev & Onay + İletişim + Güvenlik
app.use('/api/v1/client', v1ClientRouter);
app.use('/api/v1/documents', v1DocumentsRouter);
app.use('/api/v1/tasks', v1TasksRouter);
app.use('/api/v1/approvals', v1ApprovalsRouter);
app.use('/api/v1/messages', v1MessagesRouter);
app.use('/api/v1/support-faz8', v1SupportFaz8Router);
app.use('/api/v1/onboarding', v1OnboardingRouter);
app.use('/api/v1/devices', v1DevicesRouter);
app.use('/api/v1/activity-logs', v1ActivityLogsRouter);

// FAZ 9: SaaS Platform + Bayi + Marketplace + API Platformu + White-Label
app.use('/api/v1/platform-admin', v1PlatformAdminRouter);
app.use('/api/v1/dealer', v1DealerRouter);
app.use('/api/v1/developer', v1DeveloperRouter);
app.use('/api/v1/marketplace', v1MarketplaceRouter);
app.use('/api/v1/billing', v1BillingRouter);
app.use('/api/v1/whitelabel', v1WhiteLabelRouter);
app.use('/api/v1/promotions', v1PromotionsRouter);

// FAZ 28: Monitoring & Observability API
app.use('/api/v1/monitoring', monitoringRouter);

// Geriye dönük uyumluluk alias'ları
app.use('/api/v1/categories', (req, res, next) => { req.url = '/categories'; v1ProductsRouter(req, res, next); });
app.use('/api/v1/units', (req, res, next) => { req.url = '/units'; v1ProductsRouter(req, res, next); });
app.use('/api/v1/warehouses', (req, res, next) => { req.url = '/warehouses'; v1ProductsRouter(req, res, next); });



// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    system: 'İŞBEY Ön Muhasebe & ERP',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Canlı QA Test Ekranı (docs/20 zincirinin tarayıcı karşılığı)
app.use('/api/test-screen', testScreenRouter);

// Global Error Handler
// API misses stay JSON; SPA fallback must never turn them into successful HTML.
app.use('/api', (_req, res) => res.status(404).json({ success: false, message: 'API endpoint bulunamadı.' }));
if (isProduction() || process.env.SERVE_STATIC === 'true') {
  const distPath = path.resolve('dist');
  app.use(express.static(distPath, { index: false, maxAge: 0 }));
  app.get('/{*path}', (req, res, next) => {
    if (path.extname(req.path)) return next();
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[SERVER ERROR]', err);
  MonitoringService.recordError('EXPRESS_GLOBAL_HANDLER', err, {
    method: req.method,
    url: req.originalUrl,
    tenantId: (req as any).user?.companyId,
    ip: req.ip,
  });
  res.status(err.status || 500).json({
    success: false,
    message: isProduction() && (!err.status || err.status >= 500)
      ? 'Sunucu tarafında beklenmeyen bir hata oluştu.'
      : err.message || 'Sunucu tarafında beklenmeyen bir hata oluştu.',
    errorId: `ERR-${Date.now()}`,
  });
});

app.listen(Number(PORT), process.env.HOST || '127.0.0.1', () => {
  console.log(`====================================================`);
  console.log(`🚀 İŞBEY API Sunucusu http://localhost:${PORT} üzerinde aktif!`);
  console.log(`🌍 Ortam: ${getEnvironment().toUpperCase()} | DB: ${getDatabasePath()}`);
  console.log(`💼 Ön Muhasebe & İşletme Yönetim Motoru Hazır.`);
  console.log(`====================================================`);

  // ──────────────────────────────────────────────────────────
  // Hızlı Teknoloji e-Connect: Otomatik kimlik doğrulama
  // Sunucu başladıktan 3 saniye sonra çalışır (env yüklenmesi için bekler)
  // ──────────────────────────────────────────────────────────
  const integrationJobsEnabled = getEnvironment() !== 'test' && process.env.INTEGRATION_JOBS_ENABLED !== 'false';
  if (integrationJobsEnabled) setTimeout(async () => {
    try {
      await HizliConnectService.autoInitialize();
    } catch (e) {
      console.warn('[HIZLI_CONNECT] Startup init hatası (uygulama çalışmaya devam ediyor):', e);
    }
  }, 3000);

  // ──────────────────────────────────────────────────────────
  // 2026-09-12: Elektronik belge kuyruğu işleyicisi.
  // Önceden `ElectronicDocumentQueue.processQueue()` HİÇBİR YERDEN ÇAĞRILMIYORDU:
  // `queueInvoice` yalnızca tek belgeyi işliyor, ilk denemesi başarısız olan belge
  // (veya entegratör yapılandırması sonradan düzeltilen belge) sonsuza kadar
  // QUEUED kalıyordu — ne yeniden deneniyor ne de rezerve kontör iade ediliyordu.
  // Bu tur, biriken belgeleri gerçek gönderim/retry akışına sokar.
  // Test ortamında (NODE_ENV=test) ÇALIŞMAZ: suitlerin ürettiği fixture belgeler
  // arka planda entegratöre gitmemelidir. Ayrıca reentrancy koruması vardır
  // (isProcessing) → iç içe tur başlamaz.
  const E_DOC_QUEUE_INTERVAL_MS = 60 * 1000; // 1 dakika
  if (integrationJobsEnabled) {
    setInterval(async () => {
      try {
        await ElectronicDocumentQueue.processQueue();
      } catch (e) {
        console.warn('[E-DOC QUEUE] Periyodik işleme hatası:', e);
      }
    }, E_DOC_QUEUE_INTERVAL_MS);
  }

  // Her 23 saatte bir token yenile (token 24 saat geçerli)
  const TOKEN_REFRESH_INTERVAL_MS = 23 * 60 * 60 * 1000; // 23 saat
  if (integrationJobsEnabled) setInterval(async () => {
    try {
      console.log('[HIZLI_CONNECT] ⏰ Periyodik token yenileme başlatıldı...');
      await HizliConnectService.refreshToken();
    } catch (e) {
      console.warn('[HIZLI_CONNECT] Periyodik token yenileme hatası:', e);
    }
  }, TOKEN_REFRESH_INTERVAL_MS);
});
