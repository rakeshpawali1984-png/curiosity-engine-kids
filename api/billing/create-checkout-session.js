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
const STRIPE_PRICE_MONTHLY_699 = getEnvVar('STRIPE_PRICE_MONTHLY_699');
const APP_BASE_URL_RAW = getEnvVar('APP_BASE_URL');
const VITE_AUTH_REDIRECT_URL = getEnvVar('VITE_AUTH_REDIRECT_URL');
const VERCEL_URL = getEnvVar('VERCEL_URL');

function normalizeOrigin(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed).origin;
  } catch {
    try {
      return new URL(`https://${trimmed.replace(/^https?:\/\//, '')}`).origin;
    } catch {
      return null;
    }
  }
}

function getAllowedOrigins() {
  return new Set(
    [APP_BASE_URL, VITE_AUTH_REDIRECT_URL, VERCEL_URL]
      .map(normalizeOrigin)
      .filter(Boolean)
  );
}

function resolveBaseUrl(req) {
  const fallbackOrigin = normalizeOrigin(APP_BASE_URL) || 'http://localhost:5173';
  const requestedOrigin = normalizeOrigin(req?.headers?.origin || '');
  if (requestedOrigin && getAllowedOrigins().has(requestedOrigin)) {
    return requestedOrigin;
  }

  return fallbackOrigin;
}

async function getOrCreateStripeCustomer(userId, email) {
  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error('Billing is not configured');
  }

  const client = await getPool().connect();

  try {
    await client.query('begin');
    if (email) {
      await client.query(
        `
          insert into public.parents (id, email)
          values ($1, $2)
          on conflict (id) do nothing
        `,
        [userId, email]
      );
    }

    const parentRes = await client.query(
      `
        select stripe_customer_id
        from public.parents
        where id = $1
        for update
      `,
      [userId]
    );

    let stripeCustomerId = parentRes.rows[0]?.stripe_customer_id || null;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: email || undefined,
        metadata: { parent_user_id: userId },
      });
      stripeCustomerId = customer.id;

      await client.query(
        `
          update public.parents
          set stripe_customer_id = $2
          where id = $1
        `,
        [userId, stripeCustomerId]
      );
    }

    await client.query('commit');
    return stripeCustomerId;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripe = getStripeClient();
  if (!stripe || !STRIPE_PRICE_MONTHLY_699) {
    return res.status(500).json({
      error: 'Billing is not configured',
      details: {
        stripeSecretConfigured: Boolean(getEnvVar('STRIPE_SECRET_KEY')),
        stripePriceConfigured: Boolean(STRIPE_PRICE_MONTHLY_699),
        appBaseUrlConfigured: Boolean(APP_BASE_URL_RAW),
      },
    });
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
    const customerId = await getOrCreateStripeCustomer(authResult.userId, authResult.email);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{
        price: STRIPE_PRICE_MONTHLY_699,
        quantity: 1,
      }],
      success_url: `${baseUrl}/parent?billing=success`,
      cancel_url: `${baseUrl}/parent?billing=cancel`,
      allow_promotion_codes: true,
      metadata: {
        parent_user_id: authResult.userId,
      },
      subscription_data: {
        metadata: {
          parent_user_id: authResult.userId,
        },
      },
    });

    return res.status(200).json({ ok: true, checkoutUrl: session.url });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}
