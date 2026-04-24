// Server-side PIN verification.
// The PIN hash and salt are fetched from the DB here and never sent to the browser.
// Brute-force lockout is tracked server-side (per userId in memory).

import { createHash } from 'crypto';
import { parseBearerToken, validateSupabaseToken } from './auth.js';
import { getPool } from './db.js';
import { logger } from './logger.js';

const MAX_ATTEMPTS = 5;
const LOCK_MS = 60 * 1000; // 60 seconds

// Survives across requests on the same serverless instance.
// Better than client-side sessionStorage: cannot be cleared by the user.
const pinAttemptStore = globalThis.__pinAttemptStore || new Map();
globalThis.__pinAttemptStore = pinAttemptStore;

function getAttemptState(userId) {
  return pinAttemptStore.get(userId) || { attempts: 0, lockedUntil: 0 };
}

function recordFailedAttempt(userId) {
  const state = getAttemptState(userId);
  const attempts = state.attempts + 1;
  const lockedUntil = attempts >= MAX_ATTEMPTS ? Date.now() + LOCK_MS : 0;
  // Reset attempt counter after locking so the next window starts fresh.
  pinAttemptStore.set(userId, { attempts: lockedUntil ? 0 : attempts, lockedUntil });
  return { attempts, lockedUntil };
}

function clearAttempts(userId) {
  pinAttemptStore.delete(userId);
}

async function getPinCredentials(userId) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `SELECT parent_pin_hash, parent_pin_salt FROM public.parents WHERE id = $1 LIMIT 1`,
      [userId]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

// Matches the SubtleCrypto SHA-256 hex output produced by the client during PIN creation.
function hashPin(pin, salt) {
  return createHash('sha256').update(`${salt}:${pin}`).digest('hex');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = parseBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  const authResult = await validateSupabaseToken(token);
  if (!authResult.ok) {
    return res.status(authResult.status || 401).json({ error: authResult.error });
  }

  const userId = authResult.userId;
  const { pin } = req.body || {};

  // Accept only 4-6 digit numeric PINs.
  if (typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) {
    return res.status(400).json({ error: 'Invalid request payload' });
  }

  // Check lockout before touching the DB.
  const state = getAttemptState(userId);
  if (state.lockedUntil > Date.now()) {
    return res.status(429).json({
      ok: false,
      error: 'Too many attempts. Please wait and try again.',
      lockedUntil: state.lockedUntil,
    });
  }

  // Fetch credentials server-side — hash and salt are never returned to the client.
  let creds;
  try {
    creds = await getPinCredentials(userId);
  } catch (error) {
    logger.error('verify-pin db error:', error);
    const message = String(error?.message || 'Internal server error');
    if (message.includes('Database connection is not configured')) {
      return res.status(500).json({ error: 'PIN verification is not configured on server' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }

  if (!creds?.parent_pin_hash || !creds?.parent_pin_salt) {
    return res.status(400).json({ ok: false, error: 'Parent PIN is not set up yet.' });
  }

  const expected = hashPin(pin, creds.parent_pin_salt);

  if (expected !== creds.parent_pin_hash) {
    const { attempts, lockedUntil } = recordFailedAttempt(userId);
    const attemptsLeft = Math.max(0, MAX_ATTEMPTS - attempts);

    if (lockedUntil) {
      return res.status(429).json({
        ok: false,
        error: 'Too many attempts. Parent PIN is locked for 60 seconds.',
        lockedUntil,
        attemptsLeft: 0,
      });
    }

    return res.status(401).json({
      ok: false,
      error: `Incorrect PIN. ${attemptsLeft} attempt(s) left.`,
      attemptsLeft,
    });
  }

  clearAttempts(userId);
  return res.status(200).json({ ok: true });
}
