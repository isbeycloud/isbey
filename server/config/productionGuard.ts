import { isProduction } from './environment';
import { productionReadinessErrors } from './productionReadiness';

// Imported before routes/storage: a failed preflight cannot seed or mutate the DB.
if (isProduction()) {
  const errors = productionReadinessErrors();
  if (errors.length) throw new Error(`Production preflight failed:\n${errors.join('\n')}`);
}
