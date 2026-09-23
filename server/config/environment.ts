import path from 'path';

export type AppEnvironment = 'development' | 'staging' | 'production' | 'test';

export interface EnvironmentValidationResult {
  isValid: boolean;
  environment: AppEnvironment;
  errors: string[];
  warnings: string[];
}

/**
 * Resolves current execution environment.
 */
export function getEnvironment(): AppEnvironment {
  const env = (process.env.NODE_ENV || 'development').toLowerCase().trim();
  if (env === 'production' || env === 'prod') return 'production';
  if (env === 'staging' || env === 'stage') return 'staging';
  if (env === 'test') return 'test';
  return 'development';
}

export function isProduction(): boolean {
  return getEnvironment() === 'production';
}

export function isStaging(): boolean {
  return getEnvironment() === 'staging';
}

export function isDevelopment(): boolean {
  return getEnvironment() === 'development';
}

export function isTest(): boolean {
  return getEnvironment() === 'test';
}

/**
 * FAZ 27: Database path resolution.
 * Supports explicit DATABASE_PATH env var, or environment-based pathing.
 * Production/staging never fall back to the development database.
 */
export function getDatabasePath(): string {
  if (process.env.DATABASE_PATH && process.env.DATABASE_PATH.trim()) {
    return path.resolve(process.cwd(), process.env.DATABASE_PATH.trim());
  }

  const env = getEnvironment();
  const dataDir = path.resolve(process.cwd(), 'data');

  if (env === 'production') {
    return path.join(dataDir, 'database.prod.json');
  } else if (env === 'staging') {
    return path.join(dataDir, 'database.staging.json');
  }

  return path.join(dataDir, 'database.json');
}

/**
 * FAZ 27: Fail-closed Environment Validator.
 * Validates critical security and configuration constraints per environment.
 */
export function validateEnvironmentConfig(): EnvironmentValidationResult {
  const env = getEnvironment();
  const errors: string[] = [];
  const warnings: string[] = [];

  // Production security constraints
  if (env === 'production') {
    const jwtSecret = process.env.JWT_SECRET || '';
    if (!jwtSecret || jwtSecret.length < 32) {
      errors.push('CRITICAL [FAZ 27]: In production, JWT_SECRET must be set and at least 32 characters long.');
    }
    const weakPatterns = [
      'changeme',
      'isbey-dev-jwt-secret',
      '1234567890',
      'your-super-secret-jwt-key',
      'default-secret'
    ];
    if (weakPatterns.some(weak => jwtSecret.toLowerCase().includes(weak)) || jwtSecret.toLowerCase() === 'secret') {
      errors.push('CRITICAL [FAZ 27]: In production, JWT_SECRET contains weak or default placeholder pattern.');
    }

    if (!process.env.WEBHOOK_SECRET || process.env.WEBHOOK_SECRET.length < 16) {
      errors.push('CRITICAL [FAZ 27]: In production, WEBHOOK_SECRET must be set and at least 16 characters long.');
    }

    const allowProd = process.env.HIZLI_BILISIM_ALLOW_PROD === 'true';
    if (!allowProd) {
      warnings.push('[FAZ 27] HIZLI_BILISIM_ALLOW_PROD is not true. Integrator remains locked to sandbox/test endpoints.');
    }
  } else {
    // Non-production guard: Live production integrator URL should NEVER be active
    if (process.env.HIZLI_BILISIM_ALLOW_PROD === 'true') {
      warnings.push('[FAZ 27] CAUTION: HIZLI_BILISIM_ALLOW_PROD is enabled in a non-production environment!');
    }
  }

  return {
    isValid: errors.length === 0,
    environment: env,
    errors,
    warnings
  };
}
