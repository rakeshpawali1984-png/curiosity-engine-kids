// Vercel serverless proxy — keeps the OpenAI key server-side only.
// The browser calls /api/spark; this function forwards to OpenAI and returns
// the response. The key is never sent to or bundled into the client.

import { getCache, setCache } from './cache.js';

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  const requestStartedAt = nowMs();
  const requestId = createRequestId();
  const cacheInput = req.body;
  const { cacheMeta, ...openAiRequest } = req.body || {};
  const lookupMetrics = {};

  // 1. Try cache lookup (exact or vector)
  try {
    const cacheResult = await getCache(cacheInput, lookupMetrics);
    if (cacheResult?.output) {
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
      const storeMetrics = {};
      try {
        await setCache(cacheInput, data, storeMetrics);
        console.log('[cache] store complete');
      } catch (err) {
        console.error('Cache store error:', err);
      }

      logPerf(requestId, {
        outcome: 'openai-success',
        upstreamStatus: upstream.status,
        upstreamMs,
        totalMs: nowMs() - requestStartedAt,
        ...lookupMetrics,
        ...storeMetrics,
      });
      return res.status(200).json(data);
    } else {
      logPerf(requestId, {
        outcome: 'openai-upstream-error',
        upstreamStatus: upstream.status,
        upstreamMs,
        totalMs: nowMs() - requestStartedAt,
        ...lookupMetrics,
      });
      return res.status(upstream.status).json(data);
    }
  } catch (err) {
    logPerf(requestId, {
      outcome: 'proxy-error',
      totalMs: nowMs() - requestStartedAt,
      ...lookupMetrics,
      error: err.message || 'Proxy error',
    });
    return res.status(500).json({ error: err.message || "Proxy error" });
  }
}
