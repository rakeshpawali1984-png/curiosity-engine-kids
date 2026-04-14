// Vercel serverless proxy — keeps the OpenAI key server-side only.
// The browser calls /api/spark; this function forwards to OpenAI and returns
// the response. The key is never sent to or bundled into the client.

import { getCache, setCache } from './cache.js';
import { parseBearerToken, validateSupabaseToken } from './auth.js';
import { enforceDailyQuestionQuota } from './subscription.js';
import { resolvePromptTemplate } from './promptTemplates.js';
import { logger } from './logger.js';

const CACHE_ASYNC_STORE = (process.env.CACHE_ASYNC_STORE || '').trim() === 'true';
const CACHE_READ_ENABLED = (process.env.CACHE_READ_ENABLED || '').trim() === 'true';
const API_AUTH_ENABLED = (process.env.API_AUTH_ENABLED || '').trim() === 'true';
const API_RATE_LIMIT_ENABLED = (process.env.API_RATE_LIMIT_ENABLED || '').trim() === 'true';
const API_RATE_LIMIT_WINDOW_MS = Number(process.env.API_RATE_LIMIT_WINDOW_MS || '60000');
const API_RATE_LIMIT_MAX_REQUESTS = Number(process.env.API_RATE_LIMIT_MAX_REQUESTS || '30');
const OPENAI_MAX_REQUEST_BYTES = Number(process.env.OPENAI_MAX_REQUEST_BYTES || '60000');
const OPENAI_MAX_MESSAGE_COUNT = Number(process.env.OPENAI_MAX_MESSAGE_COUNT || '20');
const OPENAI_MAX_MESSAGE_CHARS = Number(process.env.OPENAI_MAX_MESSAGE_CHARS || '4000');
const OPENAI_MAX_COMPLETION_TOKENS = Number(process.env.OPENAI_MAX_COMPLETION_TOKENS || '700');
const OPENAI_ALLOWED_MODELS = String(process.env.OPENAI_ALLOWED_MODELS || 'gpt-4.1-mini')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
const OPENAI_SERVER_MODEL = String(process.env.OPENAI_SERVER_MODEL || OPENAI_ALLOWED_MODELS[0] || 'gpt-4.1-mini').trim();
const FREE_DAILY_QUESTION_LIMIT = Number(process.env.FREE_DAILY_QUESTION_LIMIT || '5');

const rateLimitStore = globalThis.__sparkRateLimitStore || new Map();
globalThis.__sparkRateLimitStore = rateLimitStore;

function nowMs() {
  return Date.now();
}

function shouldLogTimings() {
  return process.env.NODE_ENV !== 'production' || process.env.CACHE_TIMING_LOGS === 'true';
}

function createRequestId() {
  return Math.random().toString(36).slice(2, 8);
}

function logPerf(requestId, payload) {
  if (!shouldLogTimings()) {
    return;
  }

  logger.debug(`[perf][spark][${requestId}] ${JSON.stringify(payload)}`);
}

function getClientIp(req) {
  const xfwd = req.headers['x-forwarded-for'];
  if (!xfwd) return 'unknown';
  return String(xfwd).split(',')[0].trim() || 'unknown';
}

function checkRateLimit(key, limit, windowMs) {
  const now = Date.now();
  const existing = rateLimitStore.get(key);

  if (!existing || existing.resetAt <= now) {
    const fresh = { count: 1, resetAt: now + windowMs };
    rateLimitStore.set(key, fresh);
    return {
      allowed: true,
      remaining: Math.max(0, limit - fresh.count),
      resetAt: fresh.resetAt,
      resetInMs: windowMs,
      limit,
    };
  }

  existing.count += 1;
  rateLimitStore.set(key, existing);
  const remaining = Math.max(0, limit - existing.count);
  return {
    allowed: existing.count <= limit,
    remaining,
    resetAt: existing.resetAt,
    resetInMs: Math.max(0, existing.resetAt - now),
    limit,
  };
}

function setRateLimitHeaders(res, result) {
  res.setHeader('x-ratelimit-limit', String(result.limit));
  res.setHeader('x-ratelimit-remaining', String(result.remaining));
  res.setHeader('x-ratelimit-reset', String(result.resetAt));
}

function clampNumber(value, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

function normalizePromptType(value) {
  const allowed = new Set(['fast', 'deep', 'bouncer', 'generic']);
  const normalized = String(value || 'generic').toLowerCase();
  return allowed.has(normalized) ? normalized : 'generic';
}

function normalizeExperience(value) {
  return String(value || 'generic').toLowerCase();
}

function isValidQuestionId(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 120) return false;
  return /^[a-zA-Z0-9_-]+$/.test(trimmed);
}

function invalidPayload() {
  return { ok: false, status: 400, error: 'Invalid request payload' };
}

function normalizeSafetyInput(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/\$/g, 's')
    .replace(/@/g, 'a')
    .replace(/!/g, 'i')
    .replace(/\|/g, 'i')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const UNSAFE_INPUT_RULES = [
  {
    pattern: /\b(hurt|harm|injure|attack|poison|kill|murder|stab|shoot|strangle|suffocate)\s+(someone|somebody|a person|person|people|them|him|her)\b/,
    reason: 'Requests about hurting a person are not allowed.',
  },
  {
    pattern: /\b(without leaving marks|without getting caught|secretly hurt|secretly poison)\b/,
    reason: 'Hidden harm requests are not allowed.',
  },
  {
    pattern: /\b(dangerous trap|booby trap|trap someone|trap a person|make a trap|build a trap)\b/,
    reason: 'Dangerous trap instructions are not allowed.',
  },
  {
    pattern: /\b(kill myself|hurt myself|self harm|suicide|end my life)\b/,
    reason: 'Self-harm content is not allowed.',
  },
  {
    pattern: /\b(make|build|create)\b[^.\n]{0,40}\b(bomb|weapon|poison)\b/,
    reason: 'Dangerous weapon or poison requests are not allowed.',
  },
  {
    pattern: /\b(get revenge|take revenge|pay them back physically)\b/,
    reason: 'Revenge or violence requests are not allowed.',
  },
];

function validateUserContentSafety(userContent) {
  const normalized = normalizeSafetyInput(userContent);
  if (!normalized) {
    return { ok: false, status: 400, error: 'Invalid request payload' };
  }

  for (const rule of UNSAFE_INPUT_RULES) {
    if (rule.pattern.test(normalized)) {
      return {
        ok: false,
        status: 400,
        error: 'BLOCKED',
        code: 'UNSAFE_INPUT',
        reason: rule.reason,
      };
    }
  }

  return { ok: true };
}

async function sanitizeOpenAiRequest(rawBody) {
  if (!rawBody || typeof rawBody !== 'object') {
    return invalidPayload();
  }

  if (!OPENAI_ALLOWED_MODELS.includes(OPENAI_SERVER_MODEL)) {
    return { ok: false, status: 500, error: 'Server configuration error' };
  }

  const sizeBytes = Buffer.byteLength(JSON.stringify(rawBody), 'utf8');
  if (sizeBytes > OPENAI_MAX_REQUEST_BYTES) {
    return invalidPayload();
  }

  let messagesInput = null;
  if (typeof rawBody.promptTemplateKey === 'string' && typeof rawBody.userContent === 'string') {
    const safetyCheck = validateUserContentSafety(rawBody.userContent);
    if (!safetyCheck.ok) {
      return safetyCheck;
    }

    const systemPrompt = await resolvePromptTemplate(rawBody.promptTemplateKey);
    if (!systemPrompt) {
      return invalidPayload();
    }
    messagesInput = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: rawBody.userContent },
    ];
  }

  if (!Array.isArray(messagesInput) || messagesInput.length === 0 || messagesInput.length > OPENAI_MAX_MESSAGE_COUNT) {
    return invalidPayload();
  }

  const messages = [];
  for (const message of messagesInput) {
    const role = String(message?.role || '');
    if (!['system', 'user', 'assistant'].includes(role)) {
      return invalidPayload();
    }
    if (typeof message?.content !== 'string' || !message.content.trim()) {
      return invalidPayload();
    }
    if (message.content.length > OPENAI_MAX_MESSAGE_CHARS) {
      return invalidPayload();
    }
    messages.push({ role, content: message.content });
  }

  const sanitized = { model: OPENAI_SERVER_MODEL, messages };
  const temperature = clampNumber(rawBody.temperature, 0, 2);
  if (temperature !== null) sanitized.temperature = temperature;

  const maxCompletionTokens = rawBody.max_completion_tokens;
  const maxTokens = rawBody.max_tokens;
  if (maxCompletionTokens !== undefined) {
    const n = Number(maxCompletionTokens);
    if (!Number.isInteger(n) || n <= 0 || n > OPENAI_MAX_COMPLETION_TOKENS) {
      return invalidPayload();
    }
    sanitized.max_completion_tokens = n;
  }
  if (maxTokens !== undefined) {
    const n = Number(maxTokens);
    if (!Number.isInteger(n) || n <= 0 || n > OPENAI_MAX_COMPLETION_TOKENS) {
      return invalidPayload();
    }
    sanitized.max_tokens = n;
  }

  const topP = clampNumber(rawBody.top_p, 0, 1);
  if (topP !== null) sanitized.top_p = topP;
  const frequencyPenalty = clampNumber(rawBody.frequency_penalty, -2, 2);
  if (frequencyPenalty !== null) sanitized.frequency_penalty = frequencyPenalty;
  const presencePenalty = clampNumber(rawBody.presence_penalty, -2, 2);
  if (presencePenalty !== null) sanitized.presence_penalty = presencePenalty;

  if (rawBody.response_format?.type === 'json_object') {
    sanitized.response_format = { type: 'json_object' };
  }

  const promptType = normalizePromptType(rawBody?.cacheMeta?.promptType);
  const experience = normalizeExperience(rawBody?.cacheMeta?.experience);
  const questionId = rawBody?.cacheMeta?.questionId;

  if (experience === 'curious' && !isValidQuestionId(questionId)) {
    return invalidPayload();
  }

  return {
    ok: true,
    sanitized,
    promptType,
    experience,
    questionId: typeof questionId === 'string' ? questionId.trim() : null,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (API_AUTH_ENABLED) {
    const token = parseBearerToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ error: 'Missing bearer token' });
    }

    const authResult = await validateSupabaseToken(token);
    if (!authResult.ok) {
      return res.status(authResult.status || 401).json({ error: authResult.error || 'Unauthorized' });
    }

    req.authUserId = authResult.userId;
    req.authUserEmail = authResult.email || null;
  }

  if (API_RATE_LIMIT_ENABLED) {
    const clientIp = getClientIp(req);
    const limiterKey = `${req.authUserId || 'anon'}:${clientIp}`;
    const limitResult = checkRateLimit(limiterKey, API_RATE_LIMIT_MAX_REQUESTS, API_RATE_LIMIT_WINDOW_MS);
    setRateLimitHeaders(res, limitResult);
    if (!limitResult.allowed) {
      res.setHeader('retry-after', String(Math.ceil(limitResult.resetInMs / 1000)));
      return res.status(429).json({
        error: 'Rate limit exceeded',
        retry_after_seconds: Math.ceil(limitResult.resetInMs / 1000),
      });
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  const requestStartedAt = nowMs();
  const requestId = createRequestId();
  const validated = await sanitizeOpenAiRequest(req.body || {});
  if (!validated.ok) {
    return res.status(validated.status || 400).json({
      error: validated.error || 'Invalid request payload',
      code: validated.code,
      reason: validated.reason,
    });
  }

  if (API_AUTH_ENABLED && validated.experience === 'curious') {
    try {
      const quotaResult = await enforceDailyQuestionQuota({
        userId: req.authUserId,
        email: req.authUserEmail,
        questionId: validated.questionId,
        experience: validated.experience,
        dailyLimit: FREE_DAILY_QUESTION_LIMIT,
      });

      if (!quotaResult.allowed) {
        return res.status(quotaResult.status || 429).json({
          error: quotaResult.error || 'Daily free limit reached',
          code: quotaResult.code || 'QUOTA_EXCEEDED',
          limit: quotaResult.limit || FREE_DAILY_QUESTION_LIMIT,
          used: quotaResult.used || FREE_DAILY_QUESTION_LIMIT,
          resetAt: quotaResult.resetAt,
          upgradeRequired: true,
        });
      }
    } catch (error) {
      logger.error('Quota check error:', error);
    }
  }

  const openAiRequest = validated.sanitized;
  const cacheInput = {
    ...openAiRequest,
    cacheMeta: {
      promptType: validated.promptType,
    },
  };
  const lookupMetrics = { trackHits: true };
  const shouldRunLookup = CACHE_READ_ENABLED;
  res.setHeader('x-cache-policy', `manual:${CACHE_READ_ENABLED ? 'enabled' : 'disabled'}`);

  // 1. Try cache lookup (exact or vector)
  if (shouldRunLookup) {
    try {
      const cacheResult = await getCache(cacheInput, lookupMetrics);
      if (cacheResult?.output) {
        res.setHeader('x-cache-lookup', lookupMetrics.lookupStatus || 'hit');
        res.setHeader('x-cache-status', `hit-${cacheResult.hitType}`);
        logger.info(`[cache] hit (${cacheResult.hitType})`);
        logPerf(requestId, {
          outcome: 'cache-hit',
          hitType: cacheResult.hitType,
          totalMs: nowMs() - requestStartedAt,
          ...lookupMetrics,
        });
        return res.status(200).json(cacheResult.output);
      }
    } catch (err) {
      logPerf(requestId, {
        outcome: 'cache-lookup-error',
        totalMs: nowMs() - requestStartedAt,
        lookupError: err.message,
        ...lookupMetrics,
      });
      logger.error('Cache lookup error:', err);
    }
  }

  res.setHeader('x-cache-lookup', lookupMetrics.lookupStatus || (shouldRunLookup ? 'unknown' : 'skipped'));

  // 2. Not in cache — call OpenAI
  try {
    const upstreamStartedAt = nowMs();
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(openAiRequest),
    });
    const upstreamMs = nowMs() - upstreamStartedAt;

    const data = await upstream.json();

    if (upstream.ok) {
      res.setHeader('x-cache-status', 'miss-openai');
      const storeMetrics = {};
      if (CACHE_ASYNC_STORE) {
        setCache(cacheInput, data, storeMetrics)
          .then(() => {
            logger.debug('[cache] async store complete');
          })
          .catch((err) => {
            logger.error('Cache async store error:', err);
          });
      } else {
        try {
          await setCache(cacheInput, data, storeMetrics);
          logger.debug('[cache] store complete');
        } catch (err) {
          logger.error('Cache store error:', err);
        }
      }

      logPerf(requestId, {
        outcome: 'openai-success',
        upstreamStatus: upstream.status,
        upstreamMs,
        cacheStoreMode: CACHE_ASYNC_STORE ? 'async' : 'sync',
        totalMs: nowMs() - requestStartedAt,
        ...lookupMetrics,
        ...storeMetrics,
      });
      return res.status(200).json(data);
    } else {
      res.setHeader('x-cache-status', 'upstream-error');
      logPerf(requestId, {
        outcome: 'openai-upstream-error',
        upstreamStatus: upstream.status,
        upstreamMs,
        totalMs: nowMs() - requestStartedAt,
        ...lookupMetrics,
      });
      return res.status(upstream.status).json({ error: 'Upstream service error' });
    }
  } catch (err) {
    res.setHeader('x-cache-status', 'proxy-error');
    logPerf(requestId, {
      outcome: 'proxy-error',
      totalMs: nowMs() - requestStartedAt,
      ...lookupMetrics,
      error: err.message || 'Proxy error',
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
