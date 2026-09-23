/**
 * İŞBEY CLOUD — FAZ 25.2-B test köprüsü (registry barrel üreteci)
 * ==============================================================
 * NEDEN VAR:
 *   `server/tests/faz252bPermissionRegistryTest.mjs` çalışmak için
 *   `<dizin>/index.js` arar (VM senaryosu: `tsc` ile derlenmiş çıktı).
 *   Geliştirme ortamında derlenmiş çıktı yoktur → test exit 2 verir.
 *   Bu script, tsx yükleyicisi altında çalışırken TS barrel'ını yeniden
 *   dışa aktaran küçük bir ESM köprüsü üretir; böylece registry testi
 *   derleme yapmadan da gerçek kaynağı doğrular.
 *
 * ÜRETİLEN DOSYA: .verify-tmp/securitybarrel/index.js  (geçici — commit edilmez)
 * KULLANIM:
 *   node tools/gen-security-barrel.mjs
 *   npx tsx server/tests/faz252bPermissionRegistryTest.mjs .verify-tmp/securitybarrel
 *
 * NOT: Bu dosya test mantığını DEĞİŞTİRMEZ; yalnızca modül çözümlemesini köprüler.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const barrelSource = path.join(root, 'server', 'security', 'index.ts');
const outDir = path.join(root, '.verify-tmp', 'securitybarrel');
const outFile = path.join(outDir, 'index.js');

if (!fs.existsSync(barrelSource)) {
  console.error(`HATA: barrel kaynağı bulunamadı: ${barrelSource}`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

// file:// URL — windows sürücü harfi ve Türkçe karakterleri güvenli biçimde kodlar.
const href = pathToFileURL(barrelSource).href;
fs.writeFileSync(outFile, `export * from ${JSON.stringify(href)};\n`, 'utf8');

console.log(`KOPRU-HAZIR ${path.relative(root, outFile)} -> ${href}`);
