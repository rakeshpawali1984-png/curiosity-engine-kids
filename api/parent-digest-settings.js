import { parseBearerToken, validateSupabaseToken } from './auth.js';
import { getPool } from './db.js';

const ALLOWED_TIMEZONES = new Set([
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Brisbane',
  'Australia/Perth',
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Asia/Singapore',
  'Asia/Kolkata',
]);

function parseTimeString(value) {
  const time = String(value || '').trim();
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  const [hh, mm] = time.split(':').map(Number);
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function normalizeTimezone(value) {
  const tz = String(value || '').trim();
  if (!ALLOWED_TIMEZONES.has(tz)) return null;
  return tz;
}

async function ensureParentRow(client, userId, email) {
  await client.query(
    `
      insert into public.parents (id, email)
      values ($1, $2)
      on conflict (id) do nothing
    `,
    [userId, email || `${userId}@unknown.local`]
  );
}

export default async function handler(req, res) {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  const authResult = await validateSupabaseToken(token);
  if (!authResult.ok) {
    return res.status(authResult.status || 401).json({ error: authResult.error || 'Unauthorized' });
  }

  const client = await getPool().connect();
  try {
    await ensureParentRow(client, authResult.userId, authResult.email);

    if (req.method === 'GET') {
      const result = await client.query(
        `
          select
            daily_digest_enabled,
            daily_digest_time,
            daily_digest_timezone,
            daily_digest_last_sent_local_date
          from public.parents
          where id = $1
          limit 1
        `,
        [authResult.userId]
      );

      const row = result.rows[0] || {};
      return res.status(200).json({
        enabled: typeof row.daily_digest_enabled === 'boolean' ? row.daily_digest_enabled : true,
        time: row.daily_digest_time || '18:30',
        timezone: row.daily_digest_timezone || 'Australia/Sydney',
        lastSentLocalDate: row.daily_digest_last_sent_local_date || null,
        allowedTimezones: Array.from(ALLOWED_TIMEZONES),
      });
    }

    if (req.method === 'PATCH') {
      const enabled = typeof req.body?.enabled === 'boolean' ? req.body.enabled : null;
      const time = parseTimeString(req.body?.time);
      const timezone = normalizeTimezone(req.body?.timezone);

      if (enabled === null || !time || !timezone) {
        return res.status(400).json({ error: 'Invalid request payload' });
      }

      await client.query(
        `
          update public.parents
          set
            daily_digest_enabled = $2,
            daily_digest_time = $3,
            daily_digest_timezone = $4
          where id = $1
        `,
        [authResult.userId, enabled, time, timezone]
      );

      return res.status(200).json({ ok: true, enabled, time, timezone });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Failed to load digest settings' });
  } finally {
    client.release();
  }
}
