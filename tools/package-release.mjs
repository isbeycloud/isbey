import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

if (!fs.existsSync('dist/index.html')) throw new Error('Run npm run release:check before packaging.');
const name = `isbey-release-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const target = path.resolve('releases', name);
fs.mkdirSync(target, { recursive: true });
const files = ['package.json', 'package-lock.json', 'server.js', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'tsconfig.server.json',
  'src/data/erpMenus.ts', 'tools/hizli-canli-hazirlik.mjs', 'docs/63_EFATURA_CANLI_HAZIRLIK_2026-09-24.md',
  'tools/start-production.mjs', 'tools/production-preflight.mjs', 'deploy/production.env.example', 'docs/57_DAGITIM_KILAVUZU.md', 'docs/60_FIRMA_UYELIK_ROLLERI_2026-09-22.md', 'docs/61_CANLI_ONCESI_TAMAMLAMA_2026-09-22.md'];
for (const file of files) {
  const destination = path.join(target, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(file, destination);
}
for (const directory of ['dist', 'server']) fs.cpSync(directory, path.join(target, directory), {
  recursive: true, filter: source => !source.split(path.sep).includes('tests') && path.basename(source) !== 'test-hizli.ts',
});
const runtimePackage = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
runtimePackage.scripts = { start: runtimePackage.scripts.start, preflight: runtimePackage.scripts.preflight, 'efatura:preflight': runtimePackage.scripts['efatura:preflight'] };
fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify(runtimePackage, null, 2) + '\n');
const manifest = {};
function hashDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) hashDirectory(file);
    else manifest[path.relative(target, file).replaceAll(path.sep, '/')] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }
}
hashDirectory(target);
fs.writeFileSync(path.join(target, 'manifest.sha256.json'), JSON.stringify(manifest, null, 2));
const archive = `${target}.tar.gz`;
const result = spawnSync('tar', ['-czf', archive, '-C', path.dirname(target), name], { stdio: 'inherit' });
if (result.status !== 0) throw new Error(`Archive failed: ${result.error?.message || result.status}`);
fs.writeFileSync(`${archive}.sha256`, `${crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex')}  ${path.basename(archive)}\n`);
console.log(`Release: ${archive}\nFiles: ${Object.keys(manifest).length}\nNo .env, database, customer uploads or node_modules included.`);
