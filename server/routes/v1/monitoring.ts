import { Router, Request, Response } from 'express';
import { MonitoringService, LogCategory, LogLevel } from '../../services/monitoringService';
import { requireAuth, requireRole } from '../../middleware/authGuards';

export const monitoringRouter = Router();

// FAZ 28: Monitoring uç noktaları yalnızca SUPER_ADMIN ve ADMIN platform rollerine açıktır
monitoringRouter.use(requireAuth);
monitoringRouter.use(requireRole('SUPER_ADMIN', 'ADMIN'));

/**
 * GET /api/v1/monitoring/metrics
 * Sistem, API istekleri, gecikme p95, hata oranları, login ve webhook istatistikleri
 */
monitoringRouter.get('/metrics', (req: Request, res: Response) => {
  const aggregated = MonitoringService.getAggregatedMetrics();
  const loginStats = MonitoringService.getLoginStats();
  const webhookStats = MonitoringService.getWebhookStats();

  return res.json({
    success: true,
    timestamp: new Date().toISOString(),
    metrics: {
      ...aggregated,
      auth: loginStats,
      webhooks: webhookStats,
    },
  });
});

/**
 * GET /api/v1/monitoring/logs
 * Yapılandırılmış log sorgulama (kategori, seviye, tenant, arama filtreleri)
 */
monitoringRouter.get('/logs', (req: Request, res: Response) => {
  const { category, level, tenantId, search, limit } = req.query;

  const logs = MonitoringService.getStructuredLogs({
    category: category ? (String(category).toUpperCase() as LogCategory) : undefined,
    level: level ? (String(level).toLowerCase() as LogLevel) : undefined,
    tenantId: tenantId ? String(tenantId) : undefined,
    search: search ? String(search) : undefined,
    limit: limit ? parseInt(String(limit), 10) : 50,
  });

  return res.json({
    success: true,
    count: logs.length,
    logs,
  });
});

/**
 * GET /api/v1/monitoring/health
 * Genişletilmiş sistem sağlık ve kaynak kullanımı bilgisi
 */
monitoringRouter.get('/health', (req: Request, res: Response) => {
  const aggregated = MonitoringService.getAggregatedMetrics();

  const isDegraded = aggregated.requests.errorRatePercent > 5;
  const status = isDegraded ? 'degraded' : 'healthy';

  return res.json({
    status,
    uptimeSeconds: aggregated.system.uptimeSeconds,
    memoryMb: aggregated.system.memoryMb,
    requestCount: aggregated.requests.total,
    errorRatePercent: aggregated.requests.errorRatePercent,
    p95LatencyMs: aggregated.requests.latencyMs.p95,
    timestamp: new Date().toISOString(),
  });
});
