import { parseBearerToken, validateSupabaseToken } from '../auth.js';
import { getBillingStatus } from '../subscription.js';

const FREE_DAILY_QUESTION_LIMIT = Number(process.env.FREE_DAILY_QUESTION_LIMIT || '5');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
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
    const status = await getBillingStatus(authResult.userId);
    return res.status(200).json({
      ok: true,
      ...status,
      dailyLimit: FREE_DAILY_QUESTION_LIMIT,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}
