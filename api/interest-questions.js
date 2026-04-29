import { parseBearerToken, validateSupabaseToken } from './auth.js';
import { getPool } from './db.js';
import { logger } from './logger.js';

const API_AUTH_ENABLED = (process.env.API_AUTH_ENABLED || 'true').trim() !== 'false';
const OPENAI_MODEL = String(process.env.OPENAI_SERVER_MODEL || 'gpt-4.1-mini').trim();
const OPENAI_TIMEOUT_MS = Number(process.env.INTEREST_QUESTIONS_TIMEOUT_MS || '7000');
const INTEREST_QUESTIONS_CACHE_TTL_MS = Number(process.env.INTEREST_QUESTIONS_CACHE_TTL_MS || '300000');
const INTEREST_QUESTIONS_DEFAULT_MAX = 6;
const INTEREST_QUESTIONS_INITIAL_MAX = 10;

const ALLOWED_CATEGORIES = new Set([
  'initial_picks',
  'more_questions',
  'how_it_works',
  'amazing_facts',
  'next_level',
]);

const suggestionCache = globalThis.__interestQuestionSuggestionCache || new Map();
globalThis.__interestQuestionSuggestionCache = suggestionCache;

function normalizeInterest(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40);
}

function sanitizeCategory(value) {
  const category = String(value || '').trim().toLowerCase();
  return ALLOWED_CATEGORIES.has(category) ? category : null;
}

function sanitizeChildId(value) {
  const childId = String(value || '').trim();
  if (!childId || childId.length > 100) return null;
  return childId;
}

function sanitizeExplored(values) {
  const items = Array.isArray(values) ? values : [];
  const out = [];
  const seen = new Set();

  for (const item of items) {
    const normalized = String(item || '').replace(/\s+/g, ' ').trim();
    if (!normalized) continue;
    if (normalized.length > 180) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= 20) break;
  }

  return out;
}

function sanitizeQuestion(text) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const withQuestion = /[?]$/.test(cleaned) ? cleaned : `${cleaned}?`;
  return withQuestion.slice(0, 180);
}

function getMaxQuestionsForCategory(category) {
  return category === 'initial_picks' ? INTEREST_QUESTIONS_INITIAL_MAX : INTEREST_QUESTIONS_DEFAULT_MAX;
}

function buildFallbackQuestions(interestLabel, category, maxQuestions) {
  const interestLower = interestLabel.toLowerCase();
  const presets = {
    initial_picks: [
      `Why does ${interestLower} look different depending on conditions?`,
      `What is one hidden pattern in ${interestLower} most people miss?`,
      `How do experts make fast decisions in ${interestLower}?`,
      `Why does technique matter more than strength in many parts of ${interestLower}?`,
      `What beginner mistake teaches the biggest lesson in ${interestLower}?`,
      `How does practice in ${interestLower} change what you notice?`,
      `What is one surprising fact about ${interestLower} that kids love?`,
      `How does strategy change in ${interestLower} from start to finish?`,
      `What simple experiment can help a kid understand ${interestLower} better?`,
      `What is a great next question to ask after learning ${interestLower} basics?`,
    ],
    more_questions: [
      `What is one surprising thing most kids miss in ${interestLower}?`,
      `Why does small technique change big outcomes in ${interestLower}?`,
      `What is a smart next question to ask in ${interestLower}?`,
      `What pattern can kids notice to get better at ${interestLower}?`,
      `Why does timing matter so much in ${interestLower}?`,
      `What makes experts think differently in ${interestLower}?`,
    ],
    how_it_works: [
      `What are the first 3 ideas to understand how ${interestLower} works?`,
      `What causes things to change in ${interestLower}?`,
      `How do conditions change what happens in ${interestLower}?`,
      `Why does practice structure matter in ${interestLower}?`,
      `What basic rule explains most of ${interestLower}?`,
      `How do people break ${interestLower} into simpler parts?`,
    ],
    amazing_facts: [
      `What is a wow fact about ${interestLower} that sounds impossible but is true?`,
      `What weird thing happens in ${interestLower} and why?`,
      `What is an unusual ${interestLower} fact most adults do not know?`,
      `What hidden detail in ${interestLower} surprises kids most?`,
      `What counterintuitive thing can happen in ${interestLower}?`,
      `What real-life ${interestLower} moment feels like a magic trick?`,
    ],
    next_level: [
      `What is a slightly harder ${interestLower} idea I can learn next?`,
      `What advanced ${interestLower} concept can a curious kid still understand?`,
      `What deeper ${interestLower} question connects many smaller ideas?`,
      `How do experts make better decisions in ${interestLower}?`,
      `What mistake teaches the biggest lesson in ${interestLower}?`,
      `What should I explore after learning the basics of ${interestLower}?`,
    ],
  };

  return (presets[category] || presets.more_questions).slice(0, maxQuestions).map(sanitizeQuestion);
}

function cacheKey({ childId, interest, category, explored, maxQuestions }) {
  return `${childId}|${interest}|${category}|${maxQuestions}|${explored.map((q) => q.toLowerCase()).join('||')}`;
}

function getCached(key) {
  const cached = suggestionCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    suggestionCache.delete(key);
    return null;
  }
  return cached.questions;
}

function setCached(key, questions) {
  suggestionCache.set(key, {
    questions,
    expiresAt: Date.now() + Math.max(1000, INTEREST_QUESTIONS_CACHE_TTL_MS),
  });
}

async function loadChildProfile({ childId, parentId }) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `
        select id, parent_id, age_range, interests
        from public.child_profiles
        where id = $1 and parent_id = $2
        limit 1
      `,
      [childId, parentId]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

async function generateQuestionsWithOpenAi({ interest, category, ageRange, explored, maxQuestions }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing');
  }

  const categoryHints = {
    initial_picks: 'Generate a strong first batch of specific questions a kid can tap immediately.',
    more_questions: 'Give broad, fresh curiosity directions in this same topic.',
    how_it_works: 'Focus on mechanisms, cause-effect, and core principles.',
    amazing_facts: 'Focus on surprising but true facts with short why-hooks.',
    next_level: 'Give a slightly harder progression suitable for a child.',
  };

  const exploredBlock = explored.length
    ? explored.map((q, index) => `${index + 1}. ${q}`).join('\n')
    : 'None';

  const systemPrompt = [
    'You create safe curiosity questions for children aged 4-12.',
    'Return ONLY valid JSON with shape: {"questions": ["...", "..."]}.',
    `Return exactly ${maxQuestions} questions.`,
    'Each question must be specific, child-friendly, and under 150 characters.',
    'Do not repeat questions in the explored list.',
    'Do not include harmful, scary, sexual, medical-treatment, or violent content.',
  ].join(' ');

  const userPrompt = [
    `Interest: ${interest}`,
    `Category: ${category}`,
    `Age range: ${ageRange || '6-8'}`,
    `Category guidance: ${categoryHints[category] || categoryHints.more_questions}`,
    'Already explored questions (avoid overlap):',
    exploredBlock,
    'Output JSON only.',
  ].join('\n');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1500, OPENAI_TIMEOUT_MS));

  try {
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.3,
        max_tokens: 260,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      throw new Error(`OpenAI upstream failed with status ${upstream.status}`);
    }

    const payload = await upstream.json();
    const content = payload?.choices?.[0]?.message?.content;
    const parsed = JSON.parse(String(content || '{}'));
    const questions = Array.isArray(parsed?.questions) ? parsed.questions : [];

    const normalized = [];
    const seen = new Set();
    for (const question of questions) {
      const cleaned = sanitizeQuestion(question);
      if (!cleaned) continue;
      const key = cleaned.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push(cleaned);
      if (normalized.length >= maxQuestions) break;
    }

    if (normalized.length < maxQuestions) {
      throw new Error('OpenAI returned insufficient valid questions');
    }

    return normalized;
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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

  const childId = sanitizeChildId(req.body?.childId);
  const category = sanitizeCategory(req.body?.category);
  const requestedInterest = normalizeInterest(req.body?.interest);
  const explored = sanitizeExplored(req.body?.explored);

  if (!childId || !category || !requestedInterest) {
    return res.status(400).json({ error: 'Invalid request payload' });
  }

  const maxQuestions = getMaxQuestionsForCategory(category);

  let childProfile;
  try {
    childProfile = await loadChildProfile({ childId, parentId: req.authUserId });
  } catch (error) {
    logger.error('[interest-questions] failed to load child profile', error);
    return res.status(500).json({ error: 'Could not load child profile' });
  }

  if (!childProfile) {
    return res.status(404).json({ error: 'Child profile not found' });
  }

  const childInterests = Array.isArray(childProfile.interests)
    ? childProfile.interests.map((interest) => normalizeInterest(interest)).filter(Boolean)
    : [];

  if (!childInterests.includes(requestedInterest)) {
    return res.status(403).json({ error: 'Interest is not enabled for this child profile' });
  }

  const key = cacheKey({
    childId,
    interest: requestedInterest,
    category,
    explored,
    maxQuestions,
  });
  const cached = getCached(key);
  if (cached) {
    return res.status(200).json({ questions: cached });
  }

  const interestLabel = requestedInterest
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  try {
    const questions = await generateQuestionsWithOpenAi({
      interest: interestLabel,
      category,
      ageRange: childProfile.age_range || '6-8',
      explored,
      maxQuestions,
    });

    setCached(key, questions);
    return res.status(200).json({ questions });
  } catch (error) {
    logger.warn('[interest-questions] OpenAI generation failed, using fallback', error?.message || error);
    const fallbackQuestions = buildFallbackQuestions(interestLabel, category, maxQuestions);
    setCached(key, fallbackQuestions);
    return res.status(200).json({ questions: fallbackQuestions });
  }
}
