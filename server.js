import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { register } from 'tsx/esm/api';

// Hostinger starts an entry file directly, without npm's --import argument.
process.chdir(path.dirname(fileURLToPath(import.meta.url)));
process.env.NODE_ENV = 'production';
if (process.env.ISBEY_DATA_DIR) {
  process.env.ISBEY_DATA_DIR = path.resolve(process.env.ISBEY_DATA_DIR);
  process.env.DOTENV_CONFIG_PATH = path.join(process.env.ISBEY_DATA_DIR, '.env');
  config({ path: process.env.DOTENV_CONFIG_PATH, quiet: true });
}
register();
await import('./tools/start-production.mjs');
