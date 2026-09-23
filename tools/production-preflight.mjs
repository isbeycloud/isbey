process.env.NODE_ENV = 'production';
await import('dotenv/config');
const { productionReadinessErrors } = await import('../server/config/productionReadiness.ts');
const errors = productionReadinessErrors();
for (const error of errors) console.error(`FAIL: ${error}`);
if (!errors.length) console.log('PASS: Production configuration, database credentials and assets preflight.');
process.exitCode = errors.length ? 1 : 0;
