#!/usr/bin/env tsx
/**
 * İŞBEY — HIZLI BİLİŞİM BELGE LİSTESİ (SALT OKUNUR, tanı aracı)
 * ==============================================================
 * `GetDocumentListGUID` ucu `guids` filtresini UYGULAMAYABİLİR (ölçüldü:
 * docs/50 S-G4, 8/8 sorguda istenen kimlik dönmedi). Bu betik dönen TÜM
 * belgelerin kimlik/zarf alanlarını listeler ki "aradığımız belge gerçekten
 * yok mu, yoksa farklı bir ETTN ile mi kayıtlı" sorusu ölçülebilsin.
 *
 * Göndermez, iptal etmez, DB'ye yazmaz.
 *
 * Kullanım:
 *   npx tsx tools/hizli-belge-liste.ts [--app 1|2]
 */
import 'dotenv/config';
import { HizliConnectService } from '../server/services/hizliConnectService';

async function main(): Promise<number> {
  const i = process.argv.indexOf('--app');
  const tekApp = i > 0 ? Number(process.argv[i + 1]) : 0;
  const isTest = (process.env.HIZLI_BILISIM_IS_TEST_MODE || 'true') !== 'false';

  const apiKey = (process.env.HIZLI_BILISIM_API_KEY || '').trim();
  const secretKey = (process.env.HIZLI_BILISIM_SECRET_KEY || '').trim();
  const wsUser = (process.env.HIZLI_BILISIM_WS_USERNAME || '').trim();
  const wsPass = (process.env.HIZLI_BILISIM_WS_PASSWORD || '').trim();
  if (!apiKey || !secretKey || !wsUser || !wsPass) {
    console.error('Kimlik env eksik — sorgu yapılamaz.');
    return 2;
  }

  const enc = await HizliConnectService.utilEncrypt(secretKey, wsUser, wsPass, isTest);
  if (!enc.success || !enc.hashedUsername || !enc.hashedPassword) {
    console.error(`UtilEncrypt başarısız: ${enc.message}`);
    return 2;
  }
  const login = await HizliConnectService.login(apiKey, enc.hashedUsername, enc.hashedPassword, isTest);
  if (!login.success || !login.token) {
    console.error(`Login başarısız: ${login.message}`);
    return 2;
  }

  const kapsam = tekApp ? [tekApp] : [1, 2];
  let herhangi = false;
  for (const appType of kapsam) {
    // Boş guids listesi: uç filtresiz liste döndürür (ölçülen davranış).
    const res = await HizliConnectService.getDocumentListByGUID([], appType, login.token, isTest);
    console.log(`\n── appType=${appType} ──`);
    if (!res.success) {
      console.log(`  SORGU HATASI: ${res.message}`);
      continue;
    }
    if (res.data?.IsSucceeded !== true) {
      console.log(`  İŞ HATASI: ${res.data?.Message || 'sağlayıcı doğrulamadı'}`);
      continue;
    }
    const docs = Array.isArray(res.data.documents) ? res.data.documents : [];
    console.log(`  ${docs.length} belge`);
    for (const d of docs) {
      herhangi = true;
      const env = d?.EnvelopeStatus ?? d?.envelopeStatus;
      console.log(`  · ${d?.UUID ?? d?.uuid ?? '?'}`
        + ` | no=${d?.DocumentNumber ?? d?.documentNumber ?? '?'}`
        + ` | zarf=${env ?? '?'}${Number(env) === 1300 ? ' (GİB\'e iletildi)' : ''}`
        + ` | GİB=${d?.StatusCode ?? d?.statusCode ?? '?'}`
        + ` | ${String(d?.StatusExp ?? d?.statusDescription ?? d?.EnvelopeExp ?? '').slice(0, 90)}`
        + ` | ${d?.IssueDate ?? d?.issueDate ?? d?.CreateDate ?? '?'}`);
    }
  }
  if (!herhangi) console.log('\nHiç belge dönmedi.');
  return 0;
}

main().then((k) => process.exit(k)).catch((e) => { console.error(`HATA: ${e?.message || e}`); process.exit(2); });
