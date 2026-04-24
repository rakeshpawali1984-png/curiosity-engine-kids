import pg from 'pg';
import { getEnvVar } from './env.js';
import { resolveDbSslConfig } from './dbSsl.js';

const { Pool } = pg;

const DATABASE_URL = getEnvVar('DATABASE_POOLER_URL') || getEnvVar('DATABASE_URL');

let pool;

export function getPool() {
  if (!DATABASE_URL) {
    throw new Error('Database connection is not configured');
  }

  if (!pool) {
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: resolveDbSslConfig(DATABASE_URL),
    });
  }

  return pool;
}
