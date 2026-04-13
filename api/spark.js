// Vercel serverless proxy — keeps the OpenAI key server-side only.
// The browser calls /api/spark; this function forwards to OpenAI and returns
// the response. The key is never sent to or bundled into the client.

import { getCache, setCache } from './cache.js';

const CACHE_ASYNC_STORE = process.env.CACHE_ASYNC_STORE === 'true';
const CACHE_READ_ENABLED = process.env.CACHE_READ_ENABLED === 'true';
const API_AUTH_ENABLED = process.env.API_AUTH_ENABLED === 'true';
const API_RATE_LIMIT_ENABLED = process.env.API_RATE_LIMIT_ENABLED === 'true';
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

const tokenValidationCache = globalThis.__sparkTokenValidationCache || new Map();
globalThis.__sparkTokenValidationCache = tokenValidationCache;

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

  console.log(`[perf][spark][${requestId}] ${JSON.stringify(payload)}`);
}

function getClientIp(req) {
  const xfwd = req.headers['x-forwarded-for'];
  if (!xfwd) return 'unknown';
  return String(xfwd).split(',')[0].trim() || 'unknown';
}

function parseBearerToken(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') return null;
  const [scheme, token] = authHeader.trim().split(/\s+/);
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

async function validateSupabaseToken(token) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnon = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseAnon) {
    return { ok: false, status: 500, error: 'Supabase auth config is missing on server' };
  }

  const cached = tokenValidationCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: true, userId: cached.userId };
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnon,
    },
  });

  if (!response.ok) {
    return { ok: false, status: 401, error: 'Invalid or expired access token' };
  }

  const user = await response.json().catch(() => null);
  if (!user?.id) {
    return { ok: false, status: 401, error: 'Token did not resolve to a valid user' };
  }

  const jwtPayload = decodeJwtPayload(token);
  const expMs = jwtPayload?.exp ? Number(jwtPayload.exp) * 1000 : Date.now() + 60_000;
  const cacheExpiry = Math.min(expMs, Date.now() + 60_000);
  tokenValidationCache.set(token, { userId: user.id, expiresAt: cacheExpiry });
  return { ok: true, userId: user.id };
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

function invalidPayload() {
  return { ok: false, status: 400, error: 'Invalid request payload' };
}

function sanitizeOpenAiRequest(rawBody) {
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

  if (!Array.isArray(rawBody.messages) || rawBody.messages.length === 0) {
    return invalidPayload();
  }

  if (rawBody.messages.length > OPENAI_MAX_MESSAGE_COUNT) {
    return invalidPayload();
  }

  const messages = [];
  for (const message of rawBody.messages) {
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
  return { ok: true, sanitized, promptType };
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
  const validated = sanitizeOpenAiRequest(req.body || {});
  if (!validated.ok) {
    return res.status(validated.status || 400).json({ error: validated.error || 'Invalid request payload' });
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
        console.log(`[cache] hit (${cacheResult.hitType})`);
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
      console.error('Cache lookup error:', err);
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
            console.log('[cache] async store complete');
          })
          .catch((err) => {
            console.error('Cache async store error:', err);
          });
      } else {
        try {
          await setCache(cacheInput, data, storeMetrics);
          console.log('[cache] store complete');
        } catch (err) {
          console.error('Cache store error:', err);
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
