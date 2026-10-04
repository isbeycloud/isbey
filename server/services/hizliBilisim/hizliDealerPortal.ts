const ORIGIN = 'https://portal.hizliteknoloji.com.tr';

export type DealerCustomer = { externalId: string; taxNumber: string; companyName: string; city: string; dealerName: string; isActive: boolean; contactName: string; email: string; phone: string };

// Read-only adapter for the observed dealer management screen (2026-10-03).
// Cookies and CSRF tokens remain in memory and are never returned to the browser.
export class HizliDealerPortal {
  private cookies = new Map<string, string>();
  private authenticated = false;
  private loginPromise?: Promise<void>;
  private verification?: { path: string; csrf: string; fields: Record<string, string>; expiresAt: number };
  async authenticate(code?: string): Promise<{ verificationRequired: boolean }> {
    if (code) {
      if (!this.verification || Date.now() > this.verification.expiresAt || !/^[a-z0-9]{4,12}$/i.test(code)) throw new Error('Doğrulama kodu veya süresi geçersiz. Bağlantıyı yeniden başlatın.');
      const response = await this.request('/User/VerificationUserCheck', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN, Referer: ORIGIN + this.verification.path }, body: new URLSearchParams({ ...this.verification.fields, __RequestVerificationToken: this.verification.csrf, dogrulamakod: code }).toString() });
      const destination = new URL(response.headers.get('location') || '/', ORIGIN);
      if (![302, 303].includes(response.status) || destination.origin !== ORIGIN || !/^\/Home\/Index\/?$/i.test(destination.pathname)) throw new Error('Doğrulama kodu kabul edilmedi.');
      this.authenticated = true; this.verification = undefined;
    } else if (!this.authenticated && !this.verification) {
      this.loginPromise ||= this.login();
      try { await this.loginPromise; } finally { this.loginPromise = undefined; }
    }
    return { verificationRequired: !this.authenticated };
  }
  constructor(private transport: typeof fetch = fetch, private credentials = {
    username: process.env.HIZLI_BILISIM_PORTAL_USERNAME || '',
    password: process.env.HIZLI_BILISIM_PORTAL_PASSWORD || '',
  }) {}

  private async request(path: string, init: RequestInit = {}) {
    const response = await this.transport(ORIGIN + path, { ...init, redirect: 'manual', signal: AbortSignal.timeout(30_000), headers: {
      ...init.headers, Cookie: [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '),
    } });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0]; const separator = pair.indexOf('=');
      if (separator > 0) this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    return response;
  }

  private async login() {
    if (!this.credentials.username || !this.credentials.password) throw new Error('Bayi portalı kullanıcı adı ve şifresi sunucu ortamında tanımlanmamış.');
    const page = await this.request('/User/Login');
    if (!page.ok) throw new Error('Bayi portalına ulaşılamadı.');
    const html = await page.text();
    const csrf = html.match(/<input\b[^>]*name="__RequestVerificationToken"[^>]*value="([^"]+)"/i)?.[1];
    if (!csrf) throw new Error('Bayi portalı giriş formu değişmiş; bağlantı güncellenmeli.');
    const response = await this.request('/User/UserCheck', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: `${ORIGIN}/User/Login`, Origin: ORIGIN },
      body: new URLSearchParams({ username: this.credentials.username, password: this.credentials.password, __RequestVerificationToken: csrf }).toString() });
    const destination = new URL(response.headers.get('location') || '/', ORIGIN);
    if (![302, 303].includes(response.status) || destination.origin !== ORIGIN) throw new Error('Bayi portalı oturumu açılamadı.');
    if (destination.pathname === '/User/VerificationUser') {
      const path = destination.pathname + destination.search;
      const verification = await this.request(path);
      const html = await verification.text();
      const csrf = html.match(/<input\b[^>]*name="__RequestVerificationToken"[^>]*value="([^"]+)"/i)?.[1];
      if (!verification.ok || !csrf || !html.includes('dogrulamakod')) throw new Error('Bayi doğrulama ekranı okunamadı.');
      // The portal's onload script sets this named select from the challenge URL.
      // Include it as a browser form would; sending only the OTP loses the verification channel.
      const selector = html.match(/<select\b(?=[^>]*\bid="dogrulamatip")[^>]*>/i)?.[0];
      const fieldName = selector?.match(/\bname="([^"]+)"/i)?.[1];
      const verificationType = destination.searchParams.get('verificationType');
      const fields: Record<string, string> = {};
      if (selector && (!fieldName || !verificationType)) throw new Error('Bayi doğrulama kanal bilgisi okunamadı.');
      if (fieldName && verificationType) fields[fieldName] = verificationType;
      this.verification = { path, csrf, fields, expiresAt: Date.now() + 3 * 60_000 };
      return;
    }
    if (!/^\/(Home\/Index|AdminPanel\/ManagementPanel)\/?$/i.test(destination.pathname)) {
      throw new Error('Bayi portalı oturumu açılamadı. Giriş bilgilerini veya ek doğrulama gereksinimini kontrol edin.');
    }
    this.authenticated = true;
  }

  async list(start = 0, length = 50, search = '', taxId = ''): Promise<{ customers: DealerCustomer[]; total: number; filtered: number }> {
    if (!Number.isInteger(start) || start < 0 || !Number.isInteger(length) || length < 1 || length > 100) throw new Error('Geçersiz portföy sayfası.');
    if (taxId && !/^\d{10,11}$/.test(taxId)) throw new Error('Geçersiz VKN/TCKN.');
    const auth = await this.authenticate();
    if (auth.verificationRequired) throw new Error('PORTAL_VERIFICATION_REQUIRED');
    const body = new URLSearchParams({ draw: '1', start: String(start), length: String(length), 'order[0][column]': '0', 'order[0][dir]': 'desc',
      'columns[0][data]': 'FirmaId', 'columns[0][name]': '', 'columns[0][searchable]': 'true', 'columns[0][orderable]': 'true', 'columns[0][search][value]': '', 'columns[0][search][regex]': 'false',
      'search[value]': '', 'search[regex]': 'false', MusteriAdi: search.trim().slice(0, 150), Unvan: '', Ad: '', Soyad: '', VknTckn: taxId, AktifPasif: '', MusteriTipi: '', Hizmet: '', EtiketDurumu: '', Sehir: '', VergiDairesi: '', Bayi: '', HizmetDurumu: '', RecordDateStart: '', RecordDateFinish: '', TarifeTipi: '', MusteriTemsilcisi: '', SorumluAdi: '', SorumluSoyadi: '', TerminationDateStart: '', TerminationDateFinish: '', FirmaId: '', FaturaSorgu: '', DefterSorgu: '', IrsaliyeSorgu: '', MustahsilSorgu: '', SmmSorgu: '', BankaSorgu: '' });
    const response = await this.request('/AdminPanel/CustomerList', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest', Referer: `${ORIGIN}/AdminPanel/ManagementPanel` }, body: body.toString() });
    if (!response.ok || !response.headers.get('content-type')?.includes('json')) { this.authenticated = false; this.cookies.clear(); throw new Error('Bayi portföyü okunamadı; oturum veya sağlayıcı yanıtı geçersiz.'); }
    const result = await response.json() as { data: Record<string, unknown>[]; recordsTotal: number; recordsFiltered: number; error?: unknown };
    if (!result || !Array.isArray(result.data) || !Number.isInteger(result.recordsTotal) || !Number.isInteger(result.recordsFiltered) || result.recordsTotal < 0 || result.recordsFiltered < 0 || result.data.length > length || result.error) throw new Error('Bayi portföyü yanıtı beklenen biçimde değil.');
    const customers = result.data.map((row: Record<string, unknown>) => {
      if (!/^\d{10,11}$/.test(String(row.VergiNoTCKimlikNo)) || !String(row.FirmaAdi || '').trim() || !row.FirmaId) throw new Error('Bayi portföyünde müşteri kimliği eksik; kayıtlar aktarılmadı.');
      return { externalId: String(row.FirmaId), taxNumber: String(row.VergiNoTCKimlikNo), companyName: String(row.FirmaAdi), city: String(row.Sehir || ''), dealerName: String(row.Bayi || ''), isActive: row.AktifPasif === true,
        contactName: [row.Adi, row.Soyadi].filter(Boolean).join(' '), email: String(row.Eposta || ''), phone: String(row.Telefon || '') };
    });
    return { customers, total: result.recordsTotal, filtered: result.recordsFiltered };
  }
}
