import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
fs.mkdirSync('.verify-tmp', { recursive: true });
const directory = fs.mkdtempSync(path.resolve('.verify-tmp/local-'));
const suites = [
  'hizliSendContractTest.ts',
  'hizliReconcileContractTest.ts',
  'hizliSendingLockTest.ts',
  'hizliInvoiceNumberContractTest.ts',
  'hizliRegistryContractTest.ts',
  'xsltSecurityTest.ts',
  'eInvoiceLivePreparationTest.ts',
  'eServicesTest.ts',
  'productionProvisioningTest.ts', 'productionTenantTest.ts', 'membershipIsolationTest.ts', 'credentialVaultRegressionTest.ts', 'credentialMaskRegressionTest.ts',
  'faz252bPermissionRegistryTest.mjs', 'faz252dFrontendMatrixAlignmentTest.mjs',
  'faz27EnvironmentConfigTest.ts', 'phase19GuidFindUnitTest.ts',
  'faz29UatScenarioSuite.ts', 'phase32CreditLifecycleTest.ts', 'productionReadinessTest.ts', 'storageWriteFailureTest.ts',
];
let failures = 0;
for (const suite of suites) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', `server/tests/${suite}`], {
    stdio: 'inherit', timeout: 120000,
    env: { ...process.env, NODE_ENV: 'test',
      DATABASE_PATH: path.join(directory, suite === 'phase32CreditLifecycleTest.ts' ? 'phase32-credit-lifecycle.test.json' : `${suite}.json`),
      JWT_SECRET: crypto.randomBytes(48).toString('hex'),
      HIZLI_BILISIM_ALLOW_PROD: 'false', HIZLI_BILISIM_IS_TEST_MODE: 'true',
    },
  });
  if (result.status !== 0) { failures++; console.error(`FAIL: ${suite}`, result.error?.message || ''); }
}
console.log(`Local suites: ${suites.length - failures} PASS / ${failures} FAIL`);
process.exitCode = failures ? 1 : 0;
