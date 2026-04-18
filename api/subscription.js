import { getPool } from './db.js';

const PAID_STATUS_CACHE_TTL_MS = Math.max(0, Number(process.env.PAID_STATUS_CACHE_TTL_MS || '30000'));
const paidStatusCache = globalThis.__paidStatusCache || new Map();
globalThis.__paidStatusCache = paidStatusCache;

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
  // past_due retains access during Stripe's automatic retry window.
  return s === 'active' || s === 'past_due';
}

function hasActiveFullOverride(override) {
  if (!override) return false;
  const level = String(override.access_level || '').toLowerCase();
  if (level !== 'full') return false;
  if (!override.expires_at) return true;
  return new Date(override.expires_at).getTime() > Date.now();
}

function isMissingOverridesTableError(error) {
  return error?.code === '42P01' && String(error?.message || '').includes('parent_access_overrides');
}

function getCachedPaidStatus(userId) {
  if (!userId || PAID_STATUS_CACHE_TTL_MS <= 0) return null;
  const entry = paidStatusCache.get(userId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    paidStatusCache.delete(userId);
    return null;
  }
  return entry.value;
}

function setCachedPaidStatus(userId, value) {
  if (!userId || PAID_STATUS_CACHE_TTL_MS <= 0 || !value) return;
  paidStatusCache.set(userId, {
    value,
    expiresAt: Date.now() + PAID_STATUS_CACHE_TTL_MS,
  });
}

export function invalidatePaidStatusCache(userId) {
  if (!userId) return;
  paidStatusCache.delete(userId);
}

export function clearPaidStatusCache() {
  paidStatusCache.clear();
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
    let parentRes;
    try {
      parentRes = await client.query(
        `
          select
            coalesce(p.plan_key, 'free') as plan_key,
            coalesce(p.subscription_status, 'free') as subscription_status,
            p.subscription_current_period_end,
            o.access_level as override_access_level,
            o.expires_at as override_expires_at
          from (select $1::uuid as user_id) u
          left join public.parents p
            on p.id = u.user_id
          left join public.parent_access_overrides o
            on o.user_id = u.user_id
          limit 1
        `,
        [userId]
      );
    } catch (error) {
      if (!isMissingOverridesTableError(error)) throw error;
      parentRes = await client.query(
        `
          select
            coalesce(p.plan_key, 'free') as plan_key,
            coalesce(p.subscription_status, 'free') as subscription_status,
            p.subscription_current_period_end,
            null::text as override_access_level,
            null::timestamptz as override_expires_at
          from (select $1::uuid as user_id) u
          left join public.parents p
            on p.id = u.user_id
          limit 1
        `,
        [userId]
      );
    }

    const parent = parentRes.rows[0] || {
      plan_key: 'free',
      subscription_status: 'free',
      subscription_current_period_end: null,
      override_access_level: null,
      override_expires_at: null,
    };

    const hasAccessOverride = hasActiveFullOverride({
      access_level: parent.override_access_level,
      expires_at: parent.override_expires_at,
    });
    const normalizedSubscription = normalizeSubscriptionStatus(parent.subscription_status);
    const effectiveSubscriptionStatus = hasAccessOverride ? 'active' : normalizedSubscription;
    const accessSource = hasAccessOverride
      ? 'override'
      : (isPaidStatus(normalizedSubscription) ? 'subscription' : 'free');

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
      subscriptionStatus: effectiveSubscriptionStatus,
      currentPeriodEnd: parent.subscription_current_period_end,
      hasAccessOverride,
      accessSource,
      overrideExpiresAt: parent.override_expires_at,
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

  const safeLimit = Number.isInteger(dailyLimit) && dailyLimit > 0 ? dailyLimit : 10;
  const usageDate = todayUtcDateString();
  const cachedPaid = getCachedPaidStatus(userId);
  if (cachedPaid) {
    return {
      allowed: true,
      plan: cachedPaid.plan,
      subscriptionStatus: 'active',
      hasAccessOverride: Boolean(cachedPaid.hasAccessOverride),
      accessSource: cachedPaid.accessSource,
      cached: true,
    };
  }

  const client = await getPool().connect();

  try {
    let statusAndUsageRes;
    try {
      statusAndUsageRes = await client.query(
        `
          select
            coalesce(p.subscription_status, 'free') as subscription_status,
            exists (
              select 1
              from public.parent_access_overrides o
              where o.user_id = i.user_id
                and lower(o.access_level) = 'full'
                and (o.expires_at is null or o.expires_at > now())
            ) as has_access_override,
            count(u.*)::int as used,
            coalesce(bool_or(u.question_id = $3), false) as already_counted
          from (select $1::uuid as user_id) i
          left join public.parents p
            on p.id = i.user_id
          left join public.parent_daily_question_usage u
            on u.parent_id = i.user_id
           and u.usage_date = $2
          group by p.subscription_status, i.user_id
        `,
        [userId, usageDate, questionId]
      );
    } catch (error) {
      if (!isMissingOverridesTableError(error)) throw error;
      statusAndUsageRes = await client.query(
        `
          select
            coalesce(p.subscription_status, 'free') as subscription_status,
            false as has_access_override,
            count(u.*)::int as used,
            coalesce(bool_or(u.question_id = $3), false) as already_counted
          from (select $1::uuid as user_id) i
          left join public.parents p
            on p.id = i.user_id
          left join public.parent_daily_question_usage u
            on u.parent_id = i.user_id
           and u.usage_date = $2
          group by p.subscription_status, i.user_id
        `,
        [userId, usageDate, questionId]
      );
    }

    const state = statusAndUsageRes.rows[0] || {};
    const subscriptionStatus = normalizeSubscriptionStatus(state.subscription_status || 'free');
    const hasAccessOverride = Boolean(state.has_access_override);

    if (isPaidStatus(subscriptionStatus) || hasAccessOverride) {
      const paidValue = {
        plan: hasAccessOverride ? 'override' : 'paid',
        hasAccessOverride,
        accessSource: hasAccessOverride ? 'override' : 'subscription',
      };
      setCachedPaidStatus(userId, paidValue);
      return {
        allowed: true,
        plan: paidValue.plan,
        subscriptionStatus: 'active',
        hasAccessOverride,
        accessSource: paidValue.accessSource,
      };
    }

    const alreadyCounted = Boolean(state.already_counted);
    const used = Number(state.used || 0);

    if (!alreadyCounted && used >= safeLimit) {
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
    let inserted = false;

    if (!alreadyCounted && shouldConsumeNow) {
      await ensureParentRow(client, userId, email);
      const insertRes = await client.query(
        `
          insert into public.parent_daily_question_usage (parent_id, usage_date, question_id)
          values ($1, $2, $3)
          on conflict (parent_id, usage_date, question_id) do nothing
          returning 1 as inserted
        `,
        [userId, usageDate, questionId]
      );
      inserted = Boolean(insertRes.rows[0]?.inserted);
    }
    const usedAfter = used + (inserted ? 1 : 0);

    return {
      allowed: true,
      plan: 'free',
      subscriptionStatus,
      limit: safeLimit,
      used: usedAfter,
      resetAt: nextUtcMidnightIso(),
      counted: inserted,
    };
  } catch (error) {
    throw error;
  } finally {
    client.release();
  }
}
