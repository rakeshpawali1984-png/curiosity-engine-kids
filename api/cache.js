import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CACHE_ENABLED = process.env.CACHE_ENABLED !== 'false';
const CACHE_SEMANTIC_ON_PATH = process.env.CACHE_SEMANTIC_ON_PATH === 'true';

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

function nowMs() {
  return Date.now();
}

function setMetric(metrics, key, value) {
  if (metrics) {
    metrics[key] = value;
  }
}

function finishMetric(metrics, key, startedAt) {
  if (metrics) {
    metrics[key] = nowMs() - startedAt;
  }
}

function getPool() {
  if (!pool) {
    const connectionString = sanitizeConnectionString(DATABASE_URL);
    pool = new Pool({
      connectionString,
      ssl: connectionString?.includes('localhost') ? false : { rejectUnauthorized: false },
    });
  }

  return pool;
}

function isCacheAvailable() {
  return Boolean(CACHE_ENABLED && DATABASE_URL && OPENAI_API_KEY);
}

function normalizeQuery(value) {
  const stopWords = new Set([
    'the',
    'a',
    'an',
  ]);

  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token && !stopWords.has(token))
    .join(' ')
    .trim();
}

function toVectorLiteral(embedding) {
  return `[${embedding.join(',')}]`;
}

function getPromptVersion(promptType) {
  if (promptType === 'fast') return process.env.PROMPT_VERSION_FAST || 'v1';
  if (promptType === 'deep') return process.env.PROMPT_VERSION_DEEP || 'v1';
  if (promptType === 'bouncer') return process.env.PROMPT_VERSION_BOUNCER || 'v1';
  return 'v1';
}

function getThreshold(promptType) {
  if (promptType === 'fast') return Number(process.env.CACHE_THRESHOLD_FAST || '0.92');
  if (promptType === 'deep') return Number(process.env.CACHE_THRESHOLD_DEEP || '0.90');
  if (promptType === 'bouncer') return Number(process.env.CACHE_THRESHOLD_BOUNCER || '0.98');
  return 0.9;
}

function getTtlHours(promptType) {
  if (promptType === 'fast') return Number(process.env.CACHE_TTL_FAST_HOURS || '168');
  if (promptType === 'deep') return Number(process.env.CACHE_TTL_DEEP_HOURS || '72');
  if (promptType === 'bouncer') return Number(process.env.CACHE_TTL_BOUNCER_HOURS || '720');
  return 168;
}

function extractQuery(requestBody) {
  const messages = requestBody?.messages;
  if (!Array.isArray(messages)) return null;

  const userMessage = [...messages].reverse().find((message) => message?.role === 'user');
  return typeof userMessage?.content === 'string' ? userMessage.content : null;
}

function extractPromptType(requestBody) {
  return requestBody?.cacheMeta?.promptType || 'generic';
}

async function getEmbedding(query) {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: query,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding failed with status ${response.status}`);
  }

  const data = await response.json();
  return data.data?.[0]?.embedding || null;
}

function parseSafetyStatus(promptType, responseData) {
  if (promptType !== 'bouncer') {
    return 'SAFE';
  }

  try {
    const content = responseData?.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);
    return String(parsed?.status || 'SAFE').toUpperCase();
  } catch {
    return 'SAFE';
  }
}

export async function getCache(requestBody, metrics = null) {
  const totalStartedAt = nowMs();

  if (!isCacheAvailable()) {
    setMetric(metrics, 'lookupStatus', 'disabled');
    finishMetric(metrics, 'lookupTotalMs', totalStartedAt);
    return null;
  }

  const query = extractQuery(requestBody);
  if (!query) {
    setMetric(metrics, 'lookupStatus', 'skipped-no-query');
    finishMetric(metrics, 'lookupTotalMs', totalStartedAt);
    return null;
  }

  const promptType = extractPromptType(requestBody);
  const promptVersion = getPromptVersion(promptType);
  const model = requestBody?.model || 'gpt-4.1-mini';
  const queryNorm = normalizeQuery(query);

  let client;
  try {
    const connectStartedAt = nowMs();
    client = await getPool().connect();
    finishMetric(metrics, 'dbConnectMs', connectStartedAt);

    const exactLookupStartedAt = nowMs();
    const exactResult = await client.query(
      `
        select id, response_json
        from curiosity_cache
        where prompt_type = $1
          and model = $2
          and prompt_version = $3
          and query_norm = $4
          and expires_at > now()
        order by created_at desc
        limit 1
      `,
      [promptType, model, promptVersion, queryNorm]
    );
    finishMetric(metrics, 'exactLookupMs', exactLookupStartedAt);

    if (exactResult.rows[0]?.response_json) {
      const trackHits = metrics?.trackHits !== false;
      if (trackHits) {
        const exactUpdateStartedAt = nowMs();
        await client.query(
          `
            update curiosity_cache
            set hit_count = hit_count + 1,
                last_accessed_at = now()
            where id = $1
          `,
          [exactResult.rows[0].id]
        );
        finishMetric(metrics, 'exactUpdateMs', exactUpdateStartedAt);
      }
      setMetric(metrics, 'lookupStatus', 'hit');
      setMetric(metrics, 'hitType', 'exact');
      finishMetric(metrics, 'lookupTotalMs', totalStartedAt);

      return {
        output: exactResult.rows[0].response_json,
        hitType: 'exact',
      };
    }

    if (!CACHE_SEMANTIC_ON_PATH) {
      setMetric(metrics, 'lookupStatus', 'miss');
      setMetric(metrics, 'semanticLookup', 'skipped');
      finishMetric(metrics, 'lookupTotalMs', totalStartedAt);
      return null;
    }

    const embeddingStartedAt = nowMs();
    const embedding = await getEmbedding(queryNorm);
    finishMetric(metrics, 'embeddingLookupMs', embeddingStartedAt);
    if (!embedding) {
      setMetric(metrics, 'lookupStatus', 'miss');
      finishMetric(metrics, 'lookupTotalMs', totalStartedAt);
      return null;
    }

    const threshold = getThreshold(promptType);
    const vectorLookupStartedAt = nowMs();
    const vectorResult = await client.query(
      `
        select id,
               response_json,
               1 - (query_embedding <=> $1::vector) as similarity
        from curiosity_cache
        where prompt_type = $2
          and model = $3
          and prompt_version = $4
          and expires_at > now()
          and query_embedding is not null
        order by query_embedding <=> $1::vector
        limit 1
      `,
      [toVectorLiteral(embedding), promptType, model, promptVersion]
    );
    finishMetric(metrics, 'vectorLookupMs', vectorLookupStartedAt);

    const bestMatch = vectorResult.rows[0];
    if (bestMatch?.response_json && Number(bestMatch.similarity) >= threshold) {
      const trackHits = metrics?.trackHits !== false;
      if (trackHits) {
        const vectorUpdateStartedAt = nowMs();
        await client.query(
          `
            update curiosity_cache
            set hit_count = hit_count + 1,
                last_accessed_at = now(),
                similarity_used = $2
            where id = $1
          `,
          [bestMatch.id, bestMatch.similarity]
        );
        finishMetric(metrics, 'vectorUpdateMs', vectorUpdateStartedAt);
      }
      setMetric(metrics, 'lookupStatus', 'hit');
      setMetric(metrics, 'hitType', 'vector');
      setMetric(metrics, 'similarity', Number(bestMatch.similarity));
      finishMetric(metrics, 'lookupTotalMs', totalStartedAt);

      return {
        output: bestMatch.response_json,
        hitType: 'vector',
      };
    }

    setMetric(metrics, 'lookupStatus', 'miss');
    finishMetric(metrics, 'lookupTotalMs', totalStartedAt);
    return null;
  } catch (error) {
    setMetric(metrics, 'lookupStatus', 'error');
    setMetric(metrics, 'lookupError', error.message);
    finishMetric(metrics, 'lookupTotalMs', totalStartedAt);
    console.error('Database cache unavailable:', error.message);
    return null;
  } finally {
    client?.release();
  }
}

export async function getCacheCorpusStats(recentWindowDays = 14) {
  if (!isCacheAvailable()) {
    return null;
  }

  try {
    const result = await getPool().query(
      `
        select
          count(*)::int as total_rows,
          count(*) filter (
            where created_at > now() - ($1 || ' days')::interval
          )::int as recent_rows
        from curiosity_cache
        where expires_at > now()
      `,
      [String(recentWindowDays)]
    );

    const row = result.rows[0] || {};
    return {
      totalRows: Number(row.total_rows || 0),
      recentRows: Number(row.recent_rows || 0),
      recentWindowDays,
    };
  } catch (error) {
    console.error('Cache corpus stats unavailable:', error.message);
    return null;
  }
}

export async function setCache(requestBody, responseData, metrics = null) {
  const totalStartedAt = nowMs();

  if (!isCacheAvailable()) {
    setMetric(metrics, 'storeStatus', 'disabled');
    finishMetric(metrics, 'storeTotalMs', totalStartedAt);
    return;
  }

  const query = extractQuery(requestBody);
  if (!query) {
    setMetric(metrics, 'storeStatus', 'skipped-no-query');
    finishMetric(metrics, 'storeTotalMs', totalStartedAt);
    return;
  }

  const promptType = extractPromptType(requestBody);
  const safetyStatus = parseSafetyStatus(promptType, responseData);
  if (safetyStatus !== 'SAFE') {
    setMetric(metrics, 'storeStatus', 'skipped-unsafe');
    finishMetric(metrics, 'storeTotalMs', totalStartedAt);
    return;
  }

  const promptVersion = getPromptVersion(promptType);
  const model = requestBody?.model || 'gpt-4.1-mini';
  const queryNorm = normalizeQuery(query);
  const embeddingStartedAt = nowMs();
  const embedding = await getEmbedding(queryNorm).catch(() => null);
  finishMetric(metrics, 'storeEmbeddingMs', embeddingStartedAt);
  const ttlHours = getTtlHours(promptType);
  const cacheKey = `${promptType}:${model}:${promptVersion}:${queryNorm}`;

  try {
    const insertStartedAt = nowMs();
    await getPool().query(
      `
        insert into curiosity_cache (
          cache_key,
          prompt_type,
          model,
          prompt_version,
          query_raw,
          query_norm,
          query_embedding,
          response_json,
          safety_status,
          similarity_used,
          expires_at
        )
        values ($1, $2, $3, $4, $5, $6, $7::vector, $8::jsonb, $9, null, now() + ($10 || ' hours')::interval)
        on conflict (cache_key) do update set
          response_json = excluded.response_json,
          query_embedding = excluded.query_embedding,
          safety_status = excluded.safety_status,
          expires_at = excluded.expires_at,
          last_accessed_at = now()
      `,
      [
        cacheKey,
        promptType,
        model,
        promptVersion,
        query,
        queryNorm,
        embedding ? toVectorLiteral(embedding) : null,
        JSON.stringify(responseData),
        safetyStatus,
        String(ttlHours),
      ]
    );
    finishMetric(metrics, 'storeWriteMs', insertStartedAt);
    setMetric(metrics, 'storeStatus', 'stored');
    finishMetric(metrics, 'storeTotalMs', totalStartedAt);
  } catch (error) {
    setMetric(metrics, 'storeStatus', 'error');
    setMetric(metrics, 'storeError', error.message);
    finishMetric(metrics, 'storeTotalMs', totalStartedAt);
    console.error('Database cache unavailable:', error.message);
  }
}
