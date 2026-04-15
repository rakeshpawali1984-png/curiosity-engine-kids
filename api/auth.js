const tokenValidationCache = globalThis.__sparkTokenValidationCache || new Map();
globalThis.__sparkTokenValidationCache = tokenValidationCache;
const tokenValidationInFlight = globalThis.__sparkTokenValidationInFlight || new Map();
globalThis.__sparkTokenValidationInFlight = tokenValidationInFlight;

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

export function parseBearerToken(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') return null;
  const [scheme, token] = authHeader.trim().split(/\s+/);
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

export async function validateSupabaseToken(token) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnon = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseAnon) {
    return { ok: false, status: 500, error: 'Supabase auth config is missing on server' };
  }

  const cached = tokenValidationCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: true, userId: cached.userId, email: cached.email || null };
  }

  const inFlight = tokenValidationInFlight.get(token);
  if (inFlight) {
    return inFlight;
  }

  const validationPromise = (async () => {
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
    tokenValidationCache.set(token, {
      userId: user.id,
      email: user.email || null,
      expiresAt: cacheExpiry,
    });

    return { ok: true, userId: user.id, email: user.email || null };
  })();

  tokenValidationInFlight.set(token, validationPromise);

  try {
    return await validationPromise;
  } finally {
    tokenValidationInFlight.delete(token);
  }
}
