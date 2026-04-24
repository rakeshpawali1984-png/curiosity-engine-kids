import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL;

let pool;

export function getPool() {
  if (!DATABASE_URL) {
    throw new Error('Database connection is not configured');
  }

  if (!pool) {
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
    });
  }

  return pool;
}
