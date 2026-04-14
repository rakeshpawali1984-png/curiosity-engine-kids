import { getPool } from './db.js';

function todayUtcDateString() {
  return new Date().toISOString().slice(0, 10);
}

function nextUtcMidnightIso() {
  const next = new Date();
  next.setUTCHours(24, 0, 0, 0);
  return next.toISOString();
}

function normalizeSubscriptionStatus(status) {
  const s = String(status || 'free').toLowerCase();
  if (s === 'active' || s === 'trialing') return 'active';
  return s;
}

function isPaidStatus(status) {
  const s = normalizeSubscriptionStatus(status);
  return s === 'active';
}

async function ensureParentRow(client, userId, email) {
  if (!userId || !email) return;
  await client.query(
    `
      insert into public.parents (id, email)
      values ($1, $2)
      on conflict (id) do nothing
    `,
    [userId, email]
  );
}

export async function getBillingStatus(userId) {
  const client = await getPool().connect();
  const date = todayUtcDateString();

  try {
    const parentRes = await client.query(
      `
        select
          coalesce(plan_key, 'free') as plan_key,
          coalesce(subscription_status, 'free') as subscription_status,
          subscription_current_period_end
        from public.parents
        where id = $1
        limit 1
      `,
      [userId]
    );

    const parent = parentRes.rows[0] || {
      plan_key: 'free',
      subscription_status: 'free',
      subscription_current_period_end: null,
    };

    const usageRes = await client.query(
      `
        select count(*)::int as used
        from public.parent_daily_question_usage
        where parent_id = $1
          and usage_date = $2
      `,
      [userId, date]
    );

    return {
      planKey: parent.plan_key,
      subscriptionStatus: normalizeSubscriptionStatus(parent.subscription_status),
      currentPeriodEnd: parent.subscription_current_period_end,
      usedToday: usageRes.rows[0]?.used || 0,
      usageDate: date,
      resetAt: nextUtcMidnightIso(),
    };
  } finally {
    client.release();
  }
}

export async function enforceDailyQuestionQuota({
  userId,
  email,
  questionId,
  experience,
  dailyLimit,
  mode = 'consume',
}) {
  if (!userId) {
    return { allowed: false, status: 401, code: 'UNAUTHORIZED', error: 'Unauthorized' };
  }

  if (experience !== 'curious') {
    return { allowed: true, bypassed: 'non-curious-experience' };
  }

  if (!questionId || typeof questionId !== 'string' || questionId.length > 120) {
    return { allowed: false, status: 400, code: 'INVALID_QUESTION_ID', error: 'Invalid request payload' };
  }

  const safeLimit = Number.isInteger(dailyLimit) && dailyLimit > 0 ? dailyLimit : 5;
  const usageDate = todayUtcDateString();
  const client = await getPool().connect();

  try {
    await client.query('begin');

    await ensureParentRow(client, userId, email);

    const parentRes = await client.query(
      `
        select
          id,
          coalesce(subscription_status, 'free') as subscription_status
        from public.parents
        where id = $1
        for update
      `,
      [userId]
    );

    const parent = parentRes.rows[0];
    const subscriptionStatus = normalizeSubscriptionStatus(parent?.subscription_status || 'free');

    if (isPaidStatus(subscriptionStatus)) {
      await client.query('commit');
      return {
        allowed: true,
        plan: 'paid',
        subscriptionStatus,
      };
    }

    const existingRes = await client.query(
      `
        select 1
        from public.parent_daily_question_usage
        where parent_id = $1
          and usage_date = $2
          and question_id = $3
        limit 1
      `,
      [userId, usageDate, questionId]
    );

    const alreadyCounted = Boolean(existingRes.rows[0]);

    const usedRes = await client.query(
      `
        select count(*)::int as used
        from public.parent_daily_question_usage
        where parent_id = $1
          and usage_date = $2
      `,
      [userId, usageDate]
    );

    const used = usedRes.rows[0]?.used || 0;

    if (!alreadyCounted && used >= safeLimit) {
      await client.query('rollback');
      return {
        allowed: false,
        status: 429,
        code: 'QUOTA_EXCEEDED',
        error: 'Daily free limit reached',
        limit: safeLimit,
        used,
        resetAt: nextUtcMidnightIso(),
      };
    }

    const shouldConsumeNow = mode === 'consume';

    if (!alreadyCounted && shouldConsumeNow) {
      await client.query(
        `
          insert into public.parent_daily_question_usage (parent_id, usage_date, question_id)
          values ($1, $2, $3)
          on conflict (parent_id, usage_date, question_id) do nothing
        `,
        [userId, usageDate, questionId]
      );
    }

    const usedAfterRes = await client.query(
      `
        select count(*)::int as used
        from public.parent_daily_question_usage
        where parent_id = $1
          and usage_date = $2
      `,
      [userId, usageDate]
    );

    await client.query('commit');

    return {
      allowed: true,
      plan: 'free',
      subscriptionStatus,
      limit: safeLimit,
      used: usedAfterRes.rows[0]?.used || used,
      resetAt: nextUtcMidnightIso(),
      counted: !alreadyCounted && shouldConsumeNow,
    };
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
