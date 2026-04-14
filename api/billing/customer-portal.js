import Stripe from 'stripe';
import { parseBearerToken, validateSupabaseToken } from '../auth.js';
import { getPool } from '../db.js';
import { getEnvVar } from '../env.js';

function getStripeClient() {
  const key = getEnvVar('STRIPE_SECRET_KEY');
  if (!key) {
    return null;
  }

  return new Stripe(key, {
    apiVersion: '2025-03-31.basil',
  });
}

const APP_BASE_URL = getEnvVar('APP_BASE_URL', 'http://localhost:5173');

function resolveBaseUrl(req) {
  const originHeader = String(req?.headers?.origin || '').trim();
  if (originHeader) return originHeader;
  return APP_BASE_URL;
}

async function getStripeCustomerId(userId) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `
        select stripe_customer_id
        from public.parents
        where id = $1
        limit 1
      `,
      [userId]
    );

    return result.rows[0]?.stripe_customer_id || null;
  } finally {
    client.release();
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return res.status(500).json({ error: 'Billing is not configured' });
  }

  const token = parseBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  const authResult = await validateSupabaseToken(token);
  if (!authResult.ok) {
    return res.status(authResult.status || 401).json({ error: authResult.error || 'Unauthorized' });
  }

  try {
    const baseUrl = resolveBaseUrl(req);
    const customerId = await getStripeCustomerId(authResult.userId);
    if (!customerId) {
      return res.status(400).json({ error: 'No billing account found for this user' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl}/parent?billing=portal-return`,
    });

    return res.status(200).json({ ok: true, portalUrl: session.url });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}
