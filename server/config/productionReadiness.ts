import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { getDatabasePath, validateEnvironmentConfig } from './environment';
import { initialDatabaseState } from '../db/seed';

/** Read-only preflight: never initializes or modifies the production database. */
export function productionReadinessErrors(): string[] {
  const errors = [...validateEnvironmentConfig().errors];
  const origins = (process.env.CORS_ALLOW_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!origins.length || origins.some(origin => {
    try { const url = new URL(origin); return url.protocol !== 'https:' || url.origin !== origin; }
    catch { return true; }
  })) errors.push('CORS_ALLOW_ORIGINS must contain explicit HTTPS origins.');
  if (process.env.LOCAL_DEV_ALLOW === 'true') errors.push('LOCAL_DEV_ALLOW must be disabled in production.');
  if (process.env.TRUST_PROXY === 'true') errors.push('TRUST_PROXY must identify trusted proxies, not trust every client.');
  if (!fs.existsSync(path.resolve('dist/index.html'))) errors.push('Production assets are missing; run npm run build.');

  const dbPath = getDatabasePath();
  try {
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    if (!Array.isArray(db.users) || !db.users.length || !Array.isArray(db.tenants) || !db.tenants.length) {
      errors.push('Production database must contain provisioned users and tenants.');
    } else {
      const demoPasswords = initialDatabaseState.users.map(user => user.passwordHash);
      if (db.users.some((user: { passwordHash?: string }) => {
        const hash = user.passwordHash || '';
        return !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash) || demoPasswords.some(password => bcrypt.compareSync(password, hash));
      })) errors.push('Production users contain plaintext or demo passwords; provision unique bcrypt passwords before deployment.');
    }
  } catch {
    errors.push('Production database is missing or invalid; restore/provision it explicitly. No development fallback is allowed.');
  }
  return errors;
}
