/**
 * İŞBEY CLOUD — Canlı QA Test Ekranı Servisi (FAZ 25 doğrulama paneli)
 * ====================================================================
 * AMAÇ: docs/20'deki koşulama zincirinin TARAYICI İÇİ, YAN ETKİSİZ karşılığı.
 * Sunucu kendi kendine (127.0.0.1:PORT) gerçek HTTP çağrıları yapıp
 * PASS / FAIL / WARN / SKIP etiketli kanıt üretir.
 *
 * GÜVENLİK:
 *  - Route katmanında yalnızca SUPER_ADMIN / ADMIN koşabilir.
 *  - Secret'lar ASLA yanıt içinde dönmez — yalnız SET/UNSET bilgisi.
 *  - Kontör tüketen / veri yazan işlem YOKTUR (e-belge gönderilmez,
 *    kontör rezerve edilmez; webhook istekleri imzasız gider — fail-closed beklenir).
 *  - Login rate-limit testi BİLİNÇLİ SKIP (yan etki: 15dk IP kilidi).
 *
 * Not: Webhook rate-limit testi 'webhook' bucket'ını 1 dk için doldurur;
 * test sonrası ~1 dk gerçek webhook trafiği 429 alabilir (sonuç notunda belirtilir).
 */

import { storage } from '../db/storage';

export type CheckStatus = 'PASS' | 'FAIL' | 'WARN' | 'SKIP';

export interface ScreenCheck {
  id: string;
  category: string;
  title: string;
  status: CheckStatus;
  expected?: string;
  actual?: string;
  note?: string;
}

export interface TestScreenReport {
  ranAt: string;
  base: string;
  checks: ScreenCheck[];
  summary: { pass: number; fail: number; warn: number; skip: number };
}

const BASE = 'http://127.0.0.1:' + (process.env.PORT || 4000);

interface HttpResult {
  status: number;
  headers: Record<string, string>;
  json: any | null;
  error?: string;
}

async function http(
  method: string,
  p: string,
  body?: any,
  token?: string | null,
  extraHeaders: Record<string, string> = {}
): Promise<HttpResult> {
  try {
    const headers: Record<string, string> = { ...extraHeaders };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(BASE + p, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const flat: Record<string, string> = {};
    res.headers.forEach((v, k) => { flat[k.toLowerCase()] = v; });
    let json: any = null;
    try { json = await res.json(); } catch { /* boş gövde */ }
    return { status: res.status, headers: flat, json };
  } catch (e: any) {
    return { status: 0, headers: {}, json: null, error: String(e?.message || e) };
  }
}

export class TestScreenService {
  /** Ortam/yaşam değişkenleri — yalnız SET/UNSET (değer SIZDIRILMAZ) */
  private static envChecks(): ScreenCheck[] {
    const db = storage.getState();
    const env = process.env;
    const testMode = env.HIZLI_BILISIM_IS_TEST_MODE;
    const testUrl = (env.HIZLI_BILISIM_API_URL || '').includes('econnecttest');
    const jwtSet = !!env.JWT_SECRET;
    const paySecretSet = !!env.PAYMENT_WEBHOOK_SECRET;
    const webSecretSet = !!env.WEBHOOK_SECRET;
    const wsCredsSet = !!env.HIZLI_BILISIM_WS_USERNAME && !!env.HIZLI_BILISIM_HASHED_USERNAME;

    return [
      {
        id: 'ENV-001', category: 'Ortam', title: 'Canlı Hızlı Bilişim kilidi (değişmez kural)',
        status: testMode === 'true' && testUrl ? 'PASS' : 'FAIL',
        expected: 'HIZLI_BILISIM_IS_TEST_MODE=true + econnecttest URL',
        actual: 'IS_TEST_MODE=' + (testMode ?? 'UNSET') + ', URL=econnecttest:' + (testUrl ? 'evet' : 'HAYIR'),
        note: 'Canlı (econnect) kullanımı QA kapısı PASS olmadan AÇILMAZ (CLAUDE.md §1).',
      },
      {
        id: 'ENV-002', category: 'Ortam', title: 'JWT_SECRET tanımlı (fallback YASAK)',
        status: jwtSet ? 'PASS' : 'FAIL',
        actual: jwtSet ? 'SET' : 'UNSET — sunucu boot\'ta zaten çökerdi',
      },
      {
        id: 'ENV-003', category: 'Ortam', title: 'Webhook secret\'ları tanımlı (fail-closed önkoşulu)',
        status: paySecretSet && webSecretSet ? 'PASS' : 'WARN',
        expected: 'PAYMENT_WEBHOOK_SECRET + WEBHOOK_SECRET SET',
        actual: 'payment=' + (paySecretSet ? 'SET' : 'UNSET') + ', integrations=' + (webSecretSet ? 'SET' : 'UNSET'),
        note: 'UNSET ise webhook uçları 503 ile reddeder (fail-closed — güvenli ama işlevsiz).',
      },
      {
        id: 'ENV-004', category: 'Ortam', title: 'Bey360 WS kimlikleri (.env — kaynak kodda değil)',
        status: wsCredsSet ? 'PASS' : 'WARN',
        actual: 'WS_USERNAME/HASHED_USERNAME ' + (wsCredsSet ? 'SET' : 'UNSET'),
        note: 'Firma bazlı registry: TenantEinvoiceSettings > env fallback > fail-closed (docs/21).',
      },
      {
        id: 'DB-001', category: 'Ortam', title: 'JSON storage yüklü + tenant verisi okunur',
        status: (db.tenants || []).length > 0 ? 'PASS' : 'FAIL',
        actual: 'tenants=' + (db.tenants || []).length + ', users=' + (db.users || []).length,
      },
    ];
  }

  /** Security gate + headers + CORS + rate limit (docs/20 §7) */
  private static async gateChecks(): Promise<ScreenCheck[]> {
    const out: ScreenCheck[] = [];

    // 1) Security headers (FAZ 25.4 #1)
    const h = await http('GET', '/api/health');
    const nosniff = h.headers['x-content-type-options'] === 'nosniff';
    const frameDeny = h.headers['x-frame-options'] === 'DENY';
    const referrer = h.headers['referrer-policy'] === 'no-referrer';
    out.push({
      id: 'SEC-001', category: 'Security Gate', title: 'Security headers (FAZ 25.4 #1)',
      status: h.status === 200 && nosniff && frameDeny && referrer ? 'PASS' : 'FAIL',
      expected: '200 + nosniff + DENY + no-referrer',
      actual: h.status === 0 ? 'SUNUCU YANIT VERMEDİ' : 'status=' + h.status + ', nosniff=' + nosniff + ', deny=' + frameDeny + ', referrer=' + referrer,
      note: h.error,
    });

    // 2) DEFAULT DENY — token'sız korumalı uç 401
    const deny = await http('GET', '/api/users');
    out.push({
      id: 'SEC-002', category: 'Security Gate', title: 'DEFAULT DENY: token\'sız /api/users',
      status: deny.status === 401 ? 'PASS' : 'FAIL',
      expected: '401', actual: 'status=' + (deny.status || 'YANITSIZ'),
    });

    // 3) Sahte mob-jwt token reddi
    const fake = await http('GET', '/api/v1/mobile/bootstrap', undefined, 'mob-jwt-usr-1-1757000000-abcdef12');
    out.push({
      id: 'SEC-003', category: 'Security Gate', title: 'Sahte mob-jwt token reddi (FAZ 25.1)',
      status: fake.status === 401 ? 'PASS' : 'FAIL',
      expected: '401', actual: 'status=' + (fake.status || 'YANITSIZ'),
    });

    // 4) Webhook fail-closed — imzasız istek 401/503, ASLA 200 (FAZ 25.3 #2/#3)
    const wh = await http('POST', '/api/v1/payments/webhook', { eventType: 'PAYMENT_SUCCESS' });
    const wh2 = await http('POST', '/api/v1/integrations/hizli/webhook', { documentUuid: 'test' });
    const whOk = wh.status === 401 || wh.status === 503 || wh.status === 429;
    const wh2Ok = wh2.status === 401 || wh2.status === 503 || wh2.status === 429;
    out.push({
      id: 'SEC-004', category: 'Security Gate', title: 'Webhook fail-closed: imzasız istek (FAZ 25.3)',
      status: whOk && wh2Ok ? 'PASS' : 'FAIL',
      expected: '401/503/429 (ikisi de) — asla 200',
      actual: 'payments=' + (wh.status || 'YANITSIZ') + ', integrations=' + (wh2.status || 'YANITSIZ'),
    });

    // 5) PUBLIC allowlist uçları açık kalmalı
    const plans = await http('GET', '/api/v1/plans');
    out.push({
      id: 'SEC-005', category: 'Security Gate', title: 'PUBLIC allowlist: GET /api/v1/plans',
      status: plans.status === 200 ? 'PASS' : 'FAIL',
      expected: '200', actual: 'status=' + (plans.status || 'YANITSIZ'),
    });

    // 6) CORS allowlist davranışı (FAZ 25.4 #2)
    const corsForeign = await http('GET', '/api/health', undefined, null, { Origin: 'https://yabanci-site.example' });
    const corsAllowed = corsForeign.headers['access-control-allow-origin'];
    const corsConfigured = !!process.env.CORS_ALLOW_ORIGINS;
    out.push({
      id: 'SEC-006', category: 'Security Gate', title: 'CORS allowlist (FAZ 25.4 #2)',
      status: corsConfigured ? (corsAllowed ? 'WARN' : 'PASS') : 'PASS',
      expected: corsConfigured
        ? 'allowlist aktif: yabancı origin YANSIMAMALI'
        : 'CORS_ALLOW_ORIGINS tanımsız → eski açık davranış (bilinçli)',
      actual: 'allow-origin=' + (corsAllowed || '(yok)') + ', env=' + (corsConfigured ? 'SET' : 'UNSET'),
      note: corsConfigured && corsAllowed ? 'Yabancı origin yansıyor — allowlist değerini kontrol edin.' : undefined,
    });

    return out;
  }

  /** RBAC: seed rollerle login + pozitif/negatif uçlar (yan etkisiz GET'ler) */
  private static async rbacChecks(): Promise<ScreenCheck[]> {
    const out: ScreenCheck[] = [];

    // Login yardımcıları: her kullanıcı için en fazla 1 login (koşum başına
    // toplam 3 login — login rate limit 15dk/20'yi doldurmamak için).
    const tokenCache = new Map<string, string | null>();
    const statusCache = new Map<string, number>();
    const loginOnce = async (u: string, p: string): Promise<string | null> => {
      if (tokenCache.has(u)) return tokenCache.get(u) || null;
      const r = await http('POST', '/api/auth/login', { username: u, password: p });
      statusCache.set(u, r.status);
      const token = r.status === 200 && r.json?.token ? (r.json.token as string) : null;
      tokenCache.set(u, token);
      return token;
    };

    const admin = await loginOnce('admin', 'admin123');
    const adminLoginStatus = statusCache.get('admin') || 0;
    out.push({
      id: 'RBAC-000', category: 'RBAC', title: 'Seed SUPER_ADMIN login',
      status: admin ? 'PASS' : (adminLoginStatus === 429 ? 'SKIP' : 'FAIL'),
      actual: admin
        ? 'token alındı'
        : 'login status=' + (adminLoginStatus || 'YANITSIZ') + (adminLoginStatus === 429 ? ' (rate limit — kısa süre sonra tekrar deneyin)' : ' — seed verisi/DB kontrol edilmeli'),
    });
    if (!admin) {
      out.push({
        id: 'RBAC-REST', category: 'RBAC', title: 'Rol bazlı kontroller',
        status: 'SKIP', note: 'SUPER_ADMIN login başarısız — kalan RBAC kontrolleri koşulamadı.',
      });
      return out;
    }

    const cases: Array<{ id: string; user: string; pass: string; method: string; path: string; expect: number[]; title: string }> = [
      { id: 'RBAC-001', user: 'admin', pass: 'admin123', method: 'GET', path: '/api/users', expect: [200], title: 'SUPER_ADMIN /api/users → 200' },
      { id: 'RBAC-002', user: 'kasiyer', pass: 'kasiyer123', method: 'GET', path: '/api/users', expect: [403], title: 'SATIS /api/users → 403 (rol izolasyonu)' },
      { id: 'RBAC-003', user: 'kasiyer', pass: 'kasiyer123', method: 'GET', path: '/api/v1/mobile/bootstrap?tenantId=tnt-kadikoy', expect: [200], title: 'Mobil IDOR: query tenantId yok sayılır (token öncelikli)' },
      { id: 'RBAC-004', user: 'firmaadmin', pass: 'firmaadmin123', method: 'GET', path: '/api/tenants', expect: [403], title: 'COMPANY_ADMIN /api/tenants → 403 (INTERNAL)' },
    ];

    for (const c of cases) {
      const token = await loginOnce(c.user, c.pass);
      if (!token) {
        const st = statusCache.get(c.user) || 0;
        out.push({
          id: c.id, category: 'RBAC', title: c.title, status: 'SKIP',
          note: 'login başarısız: ' + c.user + ' (status=' + (st || 'YANITSIZ') + (st === 429 ? ' — rate limit' : '') + ')',
        });
        continue;
      }
      const r = await http(c.method, c.path, undefined, token);
      const ok = c.expect.includes(r.status);
      out.push({
        id: c.id, category: 'RBAC', title: c.title,
        status: ok ? 'PASS' : 'FAIL',
        expected: c.expect.join('/'), actual: 'status=' + (r.status || 'YANITSIZ'),
      });
    }
    return out;
  }

  /** e-belge kuyruk/kontör güvenliği + idempotency (FAZ 25.3) — yan etkisiz */
  private static edocChecks(): ScreenCheck[] {
    const db = storage.getState();
    const docs = db.electronicDocuments || [];
    const out: ScreenCheck[] = [];

    // In-flight idempotency: aynı internal belge için birden fazla aktif kayıt OLAMAZ
    const activeStatuses = ['QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'ACCEPTED'];
    const seen = new Map<string, number>();
    let dupCount = 0;
    for (const d of docs) {
      if (!activeStatuses.includes(d.status)) continue;
      const key = d.tenantId + ':' + d.documentType + ':' + d.internalDocumentId;
      const n = (seen.get(key) || 0) + 1;
      seen.set(key, n);
      if (n === 2) dupCount++;
    }
    out.push({
      id: 'EDOC-001', category: 'E-Belge', title: 'Idempotency: aktif durumda çift belge kaydı = 0 (FAZ 25.3 #5/#6)',
      status: dupCount === 0 ? 'PASS' : 'FAIL',
      actual: 'aktif belge=' + docs.filter(d => activeStatuses.includes(d.status)).length + ', çift anahtar=' + dupCount,
    });

    // Retry disiplini: backoff penceresi dışına çıkmış FAILED belge kontrolü (bilgi)
    const overRetried = docs.filter(d => d.retryCount > (d.maxRetries || 3) && d.status !== 'FAILED').length;
    out.push({
      id: 'EDOC-002', category: 'E-Belge', title: 'Retry üst sınırı aşan aktif belge = 0 (FAZ 25.3 #4)',
      status: overRetried === 0 ? 'PASS' : 'FAIL',
      actual: 'aşan=' + overRetried,
    });
    return out;
  }

  /** Webhook rate-limit kanıtı (1 dk / 60) — bucket'ı doldurur, not düşer */
  private static async webhookRateLimitCheck(): Promise<ScreenCheck> {
    let saw429 = false;
    let last = 0;
    for (let i = 0; i < 65; i++) {
      const r = await http('POST', '/api/v1/payments/webhook', {});
      last = r.status;
      if (r.status === 429) { saw429 = true; break; }
    }
    return {
      id: 'RATE-001', category: 'Rate Limit', title: 'Webhook rate limit: 1 dk / 60 → 429 (FAZ 25.4 #3)',
      status: saw429 ? 'PASS' : 'FAIL',
      expected: '61. istekte 429',
      actual: 'son status=' + (last || 'YANITSIZ') + ', 429 ' + (saw429 ? 'alındı' : 'alınmadı'),
      note: 'Bu test webhook bucket\'ını ~1 dk doldurur; gerçek sağlayıcı webhook\'ları kısa süre 429 alabilir.',
    };
  }

  /** Tam rapor: tüm kategoriler (route: SUPER_ADMIN/ADMIN) */
  public static async runFullReport(): Promise<TestScreenReport> {
    const checks: ScreenCheck[] = [];
    checks.push(...this.envChecks());
    checks.push(...(await this.gateChecks()));
    checks.push(...(await this.rbacChecks()));
    checks.push(...this.edocChecks());
    checks.push(await this.webhookRateLimitCheck());

    const summary = {
      pass: checks.filter(c => c.status === 'PASS').length,
      fail: checks.filter(c => c.status === 'FAIL').length,
      warn: checks.filter(c => c.status === 'WARN').length,
      skip: checks.filter(c => c.status === 'SKIP').length,
    };
    return { ranAt: new Date().toISOString(), base: BASE, checks, summary };
  }
}
