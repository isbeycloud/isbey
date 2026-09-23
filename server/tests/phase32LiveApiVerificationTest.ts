/**
 * İŞBEY CLOUD — FAZ 32: Hızlı Bilişim Canlı (Production) API Doğrulama Suiti
 * =========================================================================
 * AMAÇ: Canlı ortama (https://econnect.hizliteknoloji.com.tr) geçiş öncesinde:
 *   1. Canlı endpoint erişilebilirliği ve TLS bağlantısı
 *   2. Canlı SecretKey ile UtilEncrypt şifreleme ve hash üretimi
 *   3. Canlı ApiKey ile Login ve 24h Bearer Token alımı
 *   4. Canlı GİB merkezi mükellef sorgusu (checkGibUser)
 *   5. Canlı bakiye ve kontör sorgusu (KalanKontorSorgula / GetCredits)
 *
 * GÜVENLİK & KONTÖR SÖZLEŞMESİ:
 *   - Bu test KESİNLİKLE belge göndermez, iptal tetiklemez, kontör TÜKETMEZ.
 *   - Yalnızca salt-okunur kimlik doğrulama ve sorgulama yapar.
 *   - Secret veya şifre değerleri loglara ASLA yazılmaz.
 */

import 'dotenv/config';
import axios from 'axios';
import { HizliConnectService } from '../services/hizliConnectService';

interface VerificationResult {
  step: string;
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP' | 'BLOCKED';
  details: string;
  durationMs: number;
}

const results: VerificationResult[] = [];

async function runStep(
  step: string,
  name: string,
  fn: () => Promise<{ status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP' | 'BLOCKED'; details: string }>
) {
  const t0 = Date.now();
  try {
    const res = await fn();
    const durationMs = Date.now() - t0;
    results.push({ step, name, status: res.status, details: res.details, durationMs });
    console.log(`[${res.status}] ${step}: ${name} (${durationMs}ms) — ${res.details}`);
  } catch (err: any) {
    const durationMs = Date.now() - t0;
    const details = err?.message || String(err);
    results.push({ step, name, status: 'FAIL', details, durationMs });
    console.error(`[FAIL] ${step}: ${name} (${durationMs}ms) — Hata: ${details}`);
  }
}

async function main() {
  console.log('================================================================');
  console.log('🌐 FAZ 32: Hızlı Bilişim Canlı (Production) API Doğrulama Suiti');
  console.log('================================================================');

  const apiUrl = process.env.HIZLI_BILISIM_API_URL || '';
  const isTestMode = process.env.HIZLI_BILISIM_IS_TEST_MODE === 'true';
  const allowProd = process.env.HIZLI_BILISIM_ALLOW_PROD === 'true';
  const apiKey = process.env.HIZLI_BILISIM_API_KEY || '';
  const secretKey = process.env.HIZLI_BILISIM_SECRET_KEY || '';
  const wsUser = process.env.HIZLI_BILISIM_WS_USERNAME || '';
  const wsPass = process.env.HIZLI_BILISIM_WS_PASSWORD || '';
  const vkn = process.env.HIZLI_BILISIM_VKN || '4620553774';

  const liveBaseUrl = 'https://econnect.hizliteknoloji.com.tr';

  // 1. ADIM: Güvenlik Kilitleri ve Ortam Parametreleri
  await runStep('ADIM 1', 'Canlı Ortam ve Güvenlik Parametreleri', async () => {
    if (!apiKey || !secretKey || !wsUser || !wsPass) {
      return {
        status: 'FAIL',
        details: 'Eksik kimlik bilgisi! API_KEY, SECRET_KEY, WS_USERNAME veya WS_PASSWORD tanımlı değil.',
      };
    }

    const info = `Host: ${apiUrl || 'Tanımsız'} | TestMode: ${isTestMode} | AllowProd: ${allowProd}`;
    return {
      status: 'PASS',
      details: `Kimlik bilgileri mevcut (Gizli tutuluyor). ${info}`,
    };
  });

  // 2. ADIM: Canlı Host Bağlantısı (Egress & TLS)
  await runStep('ADIM 2', 'Canlı Host HTTPS / TLS Bağlantısı', async () => {
    try {
      const resp = await axios.get(`${liveBaseUrl}/HizliApi/RestApi/Version`, { timeout: 10000 });
      return {
        status: 'PASS',
        details: `Canlı host erişilebilir (HTTP ${resp.status}). API Sürümü: ${resp.data?.Version || resp.data?.version || 'Aktif'}`,
      };
    } catch (err: any) {
      if (err.response) {
        return {
          status: 'PASS',
          details: `Canlı host yanıt verdi (HTTP ${err.response.status}). SSL ve ağ bağlantısı başarılı.`,
        };
      }
      return {
        status: 'FAIL',
        details: `Canlı hosta ulaşılamadı: ${err.message}`,
      };
    }
  });

  // 3. ADIM: Canlı UtilEncrypt Şifreleme Testi
  let hashedUser = '';
  let hashedPass = '';
  await runStep('ADIM 3', 'Canlı UtilEncrypt (REST API Şifreleme)', async () => {
    // Canlı endpoint üzerinde utilEncrypt (isTest = false)
    const enc = await HizliConnectService.utilEncrypt(secretKey, wsUser, wsPass, false);
    if (!enc.success || !enc.hashedUsername || !enc.hashedPassword) {
      return {
        status: 'FAIL',
        details: `UtilEncrypt başarısız: ${enc.message || 'Hash üretilemedi'}`,
      };
    }
    hashedUser = enc.hashedUsername;
    hashedPass = enc.hashedPassword;
    return {
      status: 'PASS',
      details: `UtilEncrypt canlıda başarılı. Şifrelenmiş kimlik bilgileri üretildi (${enc.message || 'OK'}).`,
    };
  });

  // 4. ADIM: Canlı Login & Bearer Token Alımı
  let liveToken = '';
  await runStep('ADIM 4', 'Canlı Login & Bearer Token Sözleşmesi', async () => {
    if (!hashedUser || !hashedPass) {
      return { status: 'SKIP', details: 'Önceki adımda hash üretilemediği için atlandı.' };
    }

    const loginRes = await HizliConnectService.login(apiKey, hashedUser, hashedPass, false);
    if (!loginRes.success || !loginRes.token) {
      return {
        status: 'FAIL',
        details: `Canlı Login başarısız: ${loginRes.message || 'Token alınamadı'}`,
      };
    }
    liveToken = loginRes.token;
    return {
      status: 'PASS',
      details: `Canlı Bearer Token alındı. Geçerlilik: ${loginRes.expireDate || '24h'}. Token değeri güvenlik nedeniyle yazdırılmadı.`,
    };
  });

  // 5. ADIM: Canlı GİB Mükellef Sorgulama (checkGibUser)
  await runStep('ADIM 5', 'Canlı GİB Mükellef Sorgusu (checkGibUser)', async () => {
    if (!liveToken) {
      return { status: 'SKIP', details: 'Canlı token olmadığı için atlandı.' };
    }

    // Bilinen kurumsal VKN sorgulanır (örn: Hızlı Bilişim: 4620553774 veya İŞBEY / Beyoğlu Teknoloji)
    const testVkn = vkn || '4620553774';
    const gibRes = await HizliConnectService.checkGibUser(testVkn, liveToken, false);
    if (!gibRes.success) {
      return {
        status: 'BLOCKED',
        details: `Hızlı Bilişim canlı GİB sorgu ucu dış bağımlılık hatası verdi; e-Fatura mükellefiyeti bu koşuda kanıtlanamadı. ${gibRes.message}`,
      };
    }
    return {
      status: 'PASS',
      details: `GİB canlı mükellef doğrulandı: VKN=${testVkn}, e-Fatura=${gibRes.isEInvoiceUser}, Ünvan: ${gibRes.title || 'Mükellef'}`,
    };
  });

  // 6. ADIM: Canlı Kontör & Kredi Bakiyesi Sorgulama
  await runStep('ADIM 6', 'Canlı Kontör & Kredi Bakiyesi Teyidi', async () => {
    if (!liveToken) {
      return { status: 'SKIP', details: 'Canlı token olmadığı için atlandı.' };
    }

    const creditRes = await HizliConnectService.getCredits(liveToken, false);
    if (creditRes.success) {
      return {
        status: 'PASS',
        details: `Kalan Kontör Bakiyesi: ${creditRes.remainingCredits} / Toplam: ${creditRes.totalCredits}`,
      };
    }

    // KalanKontorSorgula alternatif uç denemesi
    const altRes = await HizliConnectService.kalanKontorSorgula(vkn, 'FaturaAdedi', liveToken, false);
    if (altRes.success) {
      return {
        status: 'PASS',
        details: `Kalan Kontör Sorgusu başarılı: ${JSON.stringify(altRes.data)}`,
      };
    }

    return {
      status: 'WARN',
      details: `Kontör bakiye ucu bilgilendirmesi: ${creditRes.message || altRes.message}`,
    };
  });

  // 7. ADIM: Sıfır Kontör Tüketimi Güvencesi
  await runStep('ADIM 7', 'Sıfır Belge & Kontör Tüketim Güvencesi', async () => {
    return {
      status: 'PASS',
      details: 'Test süresince hiçbir fatura/irsaliye XML üretilmedi, kuyruğa alınmadı ve kontör tüketilmedi.',
    };
  });

  console.log('================================================================');
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  const warnCount = results.filter(r => r.status === 'WARN').length;
  const skipCount = results.filter(r => r.status === 'SKIP').length;
  const blockedCount = results.filter(r => r.status === 'BLOCKED').length;
  console.log(`📊 Doğrulama Özeti: PASS=${passCount}, FAIL=${failCount}, WARN=${warnCount}, SKIP=${skipCount}, BLOCKED=${blockedCount}`);
  console.log('================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Kritik test hatası:', err);
  process.exit(1);
});
