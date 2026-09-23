import { Router } from 'express';
// FAZ 25.2-C: tenantId yalnızca token'dan çözümlenir (query/body/header kaynağı yasak)
import { resolveRequestTenantId } from '../../security/policies';
import { ForecastService } from '../../services/ai/forecastService';
import { AnomalyService } from '../../services/ai/anomalyService';

const router = Router();

/**
 * GET /api/v1/ai-insights/forecast/cashflow
 * 7 / 30 / 90 Günlük Nakit Akış Projeksiyonu
 */
router.get('/forecast/cashflow', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const period = (req.query.period as '7_DAYS' | '30_DAYS' | '90_DAYS') || '30_DAYS';

  const result = ForecastService.calculateCashFlowForecast(tenantId, period);
  return res.json({ success: true, forecast: result });
});

/**
 * GET /api/v1/ai-insights/forecast/stock
 * Stok tükenme süresi ve satın alma sipariş önerileri
 */
router.get('/forecast/stock', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const result = ForecastService.calculateStockForecast(tenantId);
  return res.json({ success: true, count: result.length, products: result });
});

/**
 * GET /api/v1/ai-insights/audit-desk
 * Muhasebe Kontrol Masası ve Anomali Taraması
 */
router.get('/audit-desk', (req, res) => {
  const tenantId = resolveRequestTenantId(req);
  const issues = AnomalyService.detectAnomalies(tenantId);
  return res.json({ success: true, count: issues.length, issues });
});

export default router;
