import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL;

let pool;

function sanitizeConnectionString(connectionString) {
  if (!connectionString) return connectionString;
  try {
    const parsed = new URL(connectionString);
    // These query params can make pg ignore/override the ssl object config.
    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('sslcert');
    parsed.searchParams.delete('sslkey');
    parsed.searchParams.delete('sslrootcert');
    return parsed.toString();
  } catch {
    return connectionString;
  }
}

export function getPool() {
  if (!DATABASE_URL) {
    throw new Error('Database connection is not configured');
  }

  if (!pool) {
    const connectionString = sanitizeConnectionString(DATABASE_URL);
    pool = new Pool({
      connectionString,
      ssl: connectionString?.includes('localhost') ? false : { rejectUnauthorized: false },
    });
  }

  return pool;
}
