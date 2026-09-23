/**
 * İŞBEY CLOUD — FAZ 28: Monitoring & Observability Service
 * =======================================================
 * Yapılandırılmış loglama, gerçek zamanlı API metrikleri,
 * login denemeleri ve webhook gözlemlenebilirlik motoru.
 */

export type LogLevel = 'info' | 'warn' | 'error';
export type LogCategory = 'AUTH' | 'PAYMENT' | 'ERROR' | 'ADMIN' | 'WEBHOOK' | 'EDOCUMENT' | 'SYSTEM';

export interface StructuredLog {
  id: string;
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  tenantId?: string;
  userId?: string;
  ip?: string;
  details?: Record<string, any>;
}

export interface RequestMetricItem {
  timestamp: number;
  method: string;
  url: string;
  statusCode: number;
  durationMs: number;
  tenantId?: string;
}

export interface LoginAttempt {
  timestamp: string;
  username: string;
  ip: string;
  status: 'SUCCESS' | 'FAILED' | 'RATE_LIMIT';
  reason?: string;
}

export interface WebhookEventRecord {
  timestamp: string;
  provider: string;
  endpoint: string;
  status: 'SUCCESS' | 'REJECTED' | 'INVALID_SIGNATURE' | 'FAILED';
  details?: string;
}

class MonitoringServiceImpl {
  private static instance: MonitoringServiceImpl;

  private readonly MAX_LOGS = 2000;
  private readonly MAX_REQUEST_METRICS = 5000;
  private readonly MAX_LOGIN_ATTEMPTS = 500;
  private readonly MAX_WEBHOOK_EVENTS = 500;

  private logs: StructuredLog[] = [];
  private requestMetrics: RequestMetricItem[] = [];
  private loginAttempts: LoginAttempt[] = [];
  private webhookEvents: WebhookEventRecord[] = [];

  private startTime = Date.now();

  private constructor() {}

  public static getInstance(): MonitoringServiceImpl {
    if (!MonitoringServiceImpl.instance) {
      MonitoringServiceImpl.instance = new MonitoringServiceImpl();
    }
    return MonitoringServiceImpl.instance;
  }

  // ─────────────────────────────────────────────────────────────
  // 1. YAPILANDIRILMIŞ LOGLAMA
  // ─────────────────────────────────────────────────────────────

  public log(
    level: LogLevel,
    category: LogCategory,
    message: string,
    meta?: { tenantId?: string; userId?: string; ip?: string; details?: Record<string, any> }
  ): StructuredLog {
    const entry: StructuredLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      tenantId: meta?.tenantId,
      userId: meta?.userId,
      ip: meta?.ip,
      details: meta?.details,
    };

    this.logs.unshift(entry);
    if (this.logs.length > this.MAX_LOGS) {
      this.logs.pop();
    }

    return entry;
  }

  public recordLog(
    level: LogLevel,
    category: LogCategory,
    message: string,
    tenantId?: string,
    userId?: string,
    ip?: string,
    details?: Record<string, any>
  ): StructuredLog {
    return this.log(level, category, message, { tenantId, userId, ip, details });
  }

  public getStructuredLogs(filter?: {
    category?: LogCategory;
    level?: LogLevel;
    tenantId?: string;
    search?: string;
    limit?: number;
  }): StructuredLog[] {
    let result = this.logs;

    if (filter?.category) {
      result = result.filter(l => l.category === filter.category);
    }
    if (filter?.level) {
      result = result.filter(l => l.level === filter.level);
    }
    if (filter?.tenantId) {
      result = result.filter(l => l.tenantId === filter.tenantId);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      result = result.filter(l => l.message.toLowerCase().includes(q) || JSON.stringify(l.details || {}).toLowerCase().includes(q));
    }

    const limit = filter?.limit && filter.limit > 0 ? filter.limit : 100;
    return result.slice(0, limit);
  }

  // ─────────────────────────────────────────────────────────────
  // 2. REQUEST & API METRİKLERİ
  // ─────────────────────────────────────────────────────────────

  public recordRequest(
    method: string,
    url: string,
    statusCode: number,
    durationMs: number,
    tenantId?: string
  ): void {
    this.requestMetrics.push({
      timestamp: Date.now(),
      method,
      url,
      statusCode,
      durationMs,
      tenantId,
    });

    if (this.requestMetrics.length > this.MAX_REQUEST_METRICS) {
      this.requestMetrics.shift();
    }

    // 5xx hatalarını doğrudan hata loguna işle
    if (statusCode >= 500) {
      this.log('error', 'ERROR', `HTTP ${statusCode} Sunucu Hatası: ${method} ${url}`, {
        tenantId,
        details: { statusCode, durationMs, url },
      });
    }
  }

  public recordError(context: string, error: any, details?: Record<string, any>): void {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    this.log('error', 'ERROR', `[${context}] ${errorMsg}`, {
      details: { ...details, stack },
    });
  }

  public getAggregatedMetrics() {
    const totalRequests = this.requestMetrics.length;
    const now = Date.now();
    const oneMinAgo = now - 60 * 1000;
    const oneHourAgo = now - 60 * 60 * 1000;

    const lastMinRequests = this.requestMetrics.filter(r => r.timestamp >= oneMinAgo).length;
    const lastHourRequests = this.requestMetrics.filter(r => r.timestamp >= oneHourAgo).length;

    let status2xx = 0;
    let status3xx = 0;
    let status4xx = 0;
    let status5xx = 0;
    let totalDuration = 0;
    let maxLatency = 0;
    const durations: number[] = [];
    let slowRequests = 0;

    for (const r of this.requestMetrics) {
      if (r.statusCode >= 200 && r.statusCode < 300) status2xx++;
      else if (r.statusCode >= 300 && r.statusCode < 400) status3xx++;
      else if (r.statusCode >= 400 && r.statusCode < 500) status4xx++;
      else if (r.statusCode >= 500) status5xx++;

      totalDuration += r.durationMs;
      durations.push(r.durationMs);
      if (r.durationMs > maxLatency) maxLatency = r.durationMs;
      if (r.durationMs >= 1000) slowRequests++;
    }

    durations.sort((a, b) => a - b);
    const p95Index = Math.floor(durations.length * 0.95);
    const p95Latency = durations.length > 0 ? durations[p95Index] || 0 : 0;
    const avgLatency = totalRequests > 0 ? Math.round((totalDuration / totalRequests) * 10) / 10 : 0;
    const errorRate = totalRequests > 0 ? Math.round(((status5xx) / totalRequests) * 1000) / 10 : 0;
    const clientErrorRate = totalRequests > 0 ? Math.round(((status4xx) / totalRequests) * 1000) / 10 : 0;

    const memoryUsage = process.memoryUsage();

    return {
      system: {
        uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
        memoryMb: {
          rss: Math.round(memoryUsage.rss / (1024 * 1024)),
          heapTotal: Math.round(memoryUsage.heapTotal / (1024 * 1024)),
          heapUsed: Math.round(memoryUsage.heapUsed / (1024 * 1024)),
        },
        nodeEnv: process.env.NODE_ENV || 'development',
      },
      requests: {
        total: totalRequests,
        lastMinute: lastMinRequests,
        lastHour: lastHourRequests,
        statusBreakdown: {
          '2xx': status2xx,
          '3xx': status3xx,
          '4xx': status4xx,
          '5xx': status5xx,
        },
        errorRatePercent: errorRate,
        clientErrorRatePercent: clientErrorRate,
        latencyMs: {
          avg: avgLatency,
          max: maxLatency,
          p95: p95Latency,
        },
        slowRequestsCount: slowRequests,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 3. LOGIN DENEMELERİ İZLEME
  // ─────────────────────────────────────────────────────────────

  public recordAuthEvent(
    status: 'SUCCESS' | 'FAILED' | 'RATE_LIMIT',
    username: string,
    ip: string,
    details?: { reason?: string; tenantId?: string; userId?: string }
  ): void {
    const attempt: LoginAttempt = {
      timestamp: new Date().toISOString(),
      username: username || 'unknown',
      ip: ip || '127.0.0.1',
      status,
      reason: details?.reason,
    };

    this.loginAttempts.unshift(attempt);
    if (this.loginAttempts.length > this.MAX_LOGIN_ATTEMPTS) {
      this.loginAttempts.pop();
    }

    const level: LogLevel = status === 'SUCCESS' ? 'info' : status === 'RATE_LIMIT' ? 'error' : 'warn';
    this.log(level, 'AUTH', `Giriş denemesi [${status}]: ${username} (${ip})`, {
      tenantId: details?.tenantId,
      userId: details?.userId,
      ip,
      details: { status, reason: details?.reason },
    });
  }

  public getLoginStats() {
    let successCount = 0;
    let failCount = 0;
    let rateLimitCount = 0;
    const ipFailMap: Record<string, number> = {};

    for (const a of this.loginAttempts) {
      if (a.status === 'SUCCESS') successCount++;
      else if (a.status === 'FAILED') {
        failCount++;
        ipFailMap[a.ip] = (ipFailMap[a.ip] || 0) + 1;
      } else if (a.status === 'RATE_LIMIT') {
        rateLimitCount++;
        ipFailMap[a.ip] = (ipFailMap[a.ip] || 0) + 1;
      }
    }

    const topFailedIps = Object.entries(ipFailMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([ip, count]) => ({ ip, failedAttempts: count }));

    return {
      totalRecorded: this.loginAttempts.length,
      successCount,
      failCount,
      rateLimitCount,
      topFailedIps,
      recentAttempts: this.loginAttempts.slice(0, 20),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 4. WEBHOOK & ÖDEME DURUMU İZLEME
  // ─────────────────────────────────────────────────────────────

  public recordWebhookEvent(
    provider: string,
    endpoint: string,
    status: 'SUCCESS' | 'REJECTED' | 'INVALID_SIGNATURE' | 'FAILED',
    details?: string
  ): void {
    const record: WebhookEventRecord = {
      timestamp: new Date().toISOString(),
      provider: provider || 'unknown',
      endpoint,
      status,
      details,
    };

    this.webhookEvents.unshift(record);
    if (this.webhookEvents.length > this.MAX_WEBHOOK_EVENTS) {
      this.webhookEvents.pop();
    }

    const level: LogLevel = status === 'SUCCESS' ? 'info' : 'warn';
    this.log(level, 'WEBHOOK', `Webhook [${provider} -> ${status}]: ${endpoint}`, {
      details: { status, details },
    });
  }

  public recordPaymentEvent(
    type: 'SUCCESS' | 'FAILED' | 'WEBHOOK' | 'REFUND',
    provider: string,
    amount?: number,
    reference?: string,
    meta?: { tenantId?: string; details?: Record<string, any> }
  ): void {
    const level: LogLevel = type === 'FAILED' ? 'error' : 'info';
    this.log(level, 'PAYMENT', `Ödeme olayı [${type}]: ${provider} ${amount ? `₺${amount}` : ''} (${reference || 'no-ref'})`, {
      tenantId: meta?.tenantId,
      details: { type, provider, amount, reference, ...meta?.details },
    });
  }

  public getWebhookStats() {
    const providerStats: Record<string, { total: number; success: number; failed: number; invalidSignature: number }> = {};

    for (const w of this.webhookEvents) {
      if (!providerStats[w.provider]) {
        providerStats[w.provider] = { total: 0, success: 0, failed: 0, invalidSignature: 0 };
      }
      const p = providerStats[w.provider];
      p.total++;
      if (w.status === 'SUCCESS') p.success++;
      else if (w.status === 'INVALID_SIGNATURE') p.invalidSignature++;
      else p.failed++;
    }

    return {
      totalRecorded: this.webhookEvents.length,
      byProvider: providerStats,
      recentEvents: this.webhookEvents.slice(0, 20),
    };
  }

  /**
   * Test ortamları için belleği sıfırlama
   */
  public resetForTesting(): void {
    this.logs = [];
    this.requestMetrics = [];
    this.loginAttempts = [];
    this.webhookEvents = [];
    this.startTime = Date.now();
  }
}

export const MonitoringService = MonitoringServiceImpl.getInstance();
