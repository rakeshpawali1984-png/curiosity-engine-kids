import { getEnvVar } from './env.js';

function normalizeSslMode(mode) {
  const value = String(mode || '').trim().toLowerCase();
  if (!value) return 'auto';
  if (value === 'disable' || value === 'disabled' || value === 'off') return 'disable';
  if (value === 'insecure' || value === 'allow-self-signed') return 'insecure';
  if (value === 'auto') return 'auto';
  return 'strict';
}

export function resolveDbSslConfig(databaseUrl) {
  if (String(databaseUrl || '').includes('localhost')) {
    return false;
  }

  const mode = normalizeSslMode(getEnvVar('DATABASE_SSL_MODE'));
  if (mode === 'disable') {
    return false;
  }

  if (mode === 'insecure') {
    return { rejectUnauthorized: false };
  }

  if (mode === 'auto' && process.env.NODE_ENV !== 'production') {
    return { rejectUnauthorized: false };
  }

  const ca = getEnvVar('DATABASE_SSL_CA');
  if (ca) {
    return {
      rejectUnauthorized: true,
      ca: ca.replace(/\\n/g, '\n'),
    };
  }

  return { rejectUnauthorized: true };
}
