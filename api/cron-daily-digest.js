import { Resend } from 'resend';
import { getPool } from './db.js';
import { getEnvVar } from './env.js';
import { logger } from './logger.js';
import { sendDailySummaryForParent } from './send-daily-summary-email.js';

function isAuthorizedCronRequest(req) {
  const secret = getEnvVar('CRON_SECRET');
  if (!secret) return false;

  const expected = `Bearer ${secret}`;
  const provided = String(req.headers.authorization || '').trim();
  return provided === expected;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorizedCronRequest(req)) {
    return res.status(401).json({ error: 'Unauthorized cron request' });
  }

  const apiKey = getEnvVar('RESEND_API_KEY');
  if (!apiKey) {
    logger.warn('cron-daily-digest: RESEND_API_KEY not set - skipping');
    return res.status(200).json({ ok: true, skipped: true, reason: 'missing_resend_key' });
  }

  const client = await getPool().connect();
  const resend = new Resend(apiKey);

  try {
    const dueParentsRes = await client.query(
      `
        select
          p.id,
          p.email,
          p.display_name,
          coalesce(p.daily_digest_timezone, 'Australia/Sydney') as timezone
        from public.parents p
        where p.daily_digest_enabled = true
          and p.email is not null
          and p.email <> ''
          and to_char((now() at time zone coalesce(p.daily_digest_timezone, 'Australia/Sydney')), 'HH24:MI') = coalesce(p.daily_digest_time, '18:30')
          and coalesce(p.daily_digest_last_sent_local_date, date '1900-01-01') < ((now() at time zone coalesce(p.daily_digest_timezone, 'Australia/Sydney'))::date)
        order by p.id
        limit 500
      `
    );

    const dueParents = dueParentsRes.rows || [];
    if (dueParents.length === 0) {
      return res.status(200).json({ ok: true, processed: 0, sent: 0, failed: 0 });
    }

    let sent = 0;
    let failed = 0;

    for (const parent of dueParents) {
      try {
        await sendDailySummaryForParent({
          client,
          resend,
          parentId: parent.id,
          parentEmail: parent.email,
          parentDisplayName: parent.display_name,
          timezone: parent.timezone,
        });
        sent += 1;
      } catch (error) {
        failed += 1;
        logger.error('cron-daily-digest: failed sending digest', {
          parentId: parent.id,
          message: error?.message || 'Unknown error',
        });
      }
    }

    return res.status(200).json({ ok: true, processed: dueParents.length, sent, failed });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Failed running daily digest cron' });
  } finally {
    client.release();
  }
}
