import Stripe from 'stripe';
import { getPool } from '../db.js';
import { getEnvVar } from '../env.js';
import { clearPaidStatusCache } from '../subscription.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

function getStripeClient() {
  const key = getEnvVar('STRIPE_SECRET_KEY');
  if (!key) {
    return null;
  }

  return new Stripe(key, {
    apiVersion: '2025-03-31.basil',
  });
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function extractParentUserId(eventObject) {
  return (
    eventObject?.metadata?.parent_user_id ||
    eventObject?.client_reference_id ||
    null
  );
}

async function updateParentSubscriptionByStripeCustomer({
  stripeCustomerId,
  subscriptionId,
  status,
  periodEnd,
  planKey,
}) {
  if (!stripeCustomerId) return;

  const client = await getPool().connect();
  try {
    await client.query(
      `
        update public.parents
        set
          stripe_subscription_id = coalesce($2, stripe_subscription_id),
          subscription_status = $3,
          plan_key = $4,
          subscription_current_period_end = $5
        where stripe_customer_id = $1
      `,
      [stripeCustomerId, subscriptionId || null, status, planKey, periodEnd]
    );
  } finally {
    client.release();
  }
}

async function updateParentSubscriptionByUserId({
  parentUserId,
  stripeCustomerId,
  subscriptionId,
  status,
  periodEnd,
  planKey,
}) {
  if (!parentUserId) return;

  const client = await getPool().connect();
  try {
    await client.query(
      `
        update public.parents
        set
          stripe_customer_id = coalesce($2, stripe_customer_id),
          stripe_subscription_id = coalesce($3, stripe_subscription_id),
          subscription_status = $4,
          plan_key = $5,
          subscription_current_period_end = $6
        where id = $1
      `,
      [parentUserId, stripeCustomerId || null, subscriptionId || null, status, planKey, periodEnd]
    );
  } finally {
    client.release();
  }
}

function normalizeSubscriptionStatus(status) {
  const s = String(status || 'free').toLowerCase();
  if (s === 'active' || s === 'trialing') return 'active';
  if (s === 'past_due') return 'past_due';
  if (s === 'canceled' || s === 'unpaid' || s === 'incomplete_expired') return 'canceled';
  return 'free';
}

function planKeyFromStatus(status) {
  return normalizeSubscriptionStatus(status) === 'active' ? 'unlimited_monthly' : 'free';
}

function toPeriodEndIso(subscription) {
  const ts = subscription?.current_period_end;
  return ts ? new Date(ts * 1000).toISOString() : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripe = getStripeClient();
  const webhookSecret = getEnvVar('STRIPE_WEBHOOK_SECRET');
  if (!stripe || !webhookSecret) {
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  const signature = req.headers['stripe-signature'];
  if (!signature) {
    return res.status(400).json({ error: 'Missing Stripe signature' });
  }

  try {
    const rawBody = await readRawBody(req);
    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret
    );

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const parentUserId = extractParentUserId(session);
        if (parentUserId) {
          let periodEnd = null;
          const subscriptionId = typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;

          if (subscriptionId) {
            try {
              const subscription = await stripe.subscriptions.retrieve(subscriptionId);
              periodEnd = toPeriodEndIso(subscription);
            } catch {
              // Period end will be filled by customer.subscription.updated/create events.
              periodEnd = null;
            }
          }

          await updateParentSubscriptionByUserId({
            parentUserId,
            stripeCustomerId: session.customer,
            subscriptionId: session.subscription,
            status: 'active',
            periodEnd,
            planKey: 'unlimited_monthly',
          });
          clearPaidStatusCache();
        }
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.created': {
        const subscription = event.data.object;
        const normalized = normalizeSubscriptionStatus(subscription.status);
        const periodEnd = toPeriodEndIso(subscription);

        await updateParentSubscriptionByStripeCustomer({
          stripeCustomerId: subscription.customer,
          subscriptionId: subscription.id,
          status: normalized,
          periodEnd,
          planKey: planKeyFromStatus(normalized),
        });
        clearPaidStatusCache();
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        // Keep plan_key as unlimited_monthly — Stripe retries for several days.
        // Downgrading immediately would lock the user out during the retry window.
        // If payment ultimately fails, customer.subscription.deleted fires and downgrades then.
        await updateParentSubscriptionByStripeCustomer({
          stripeCustomerId: invoice.customer,
          subscriptionId: invoice.subscription,
          status: 'past_due',
          periodEnd: null,
          planKey: 'unlimited_monthly',
        });
        clearPaidStatusCache();
        break;
      }

      default:
        break;
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    return res.status(400).json({ error: 'Invalid webhook payload' });
  }
}
