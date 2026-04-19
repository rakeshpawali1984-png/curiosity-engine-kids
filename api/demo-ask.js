import { resolvePromptTemplate } from './promptTemplates.js';

const OPENAI_MODEL = String(process.env.OPENAI_SERVER_MODEL || 'gpt-4.1-mini').trim();
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const DEMO_IP_WINDOW_MS = Number(process.env.DEMO_ASK_IP_WINDOW_MS || 10 * 60 * 1000);
const DEMO_IP_MAX = Number(process.env.DEMO_ASK_IP_MAX || 60);
const DEMO_SESSION_TTL_MS = Number(process.env.DEMO_ASK_SESSION_TTL_MS || 24 * 60 * 60 * 1000);
const DEMO_SESSION_MAX_ASKS = Number(process.env.DEMO_ASK_SESSION_MAX_ASKS || 20);

const ipRateStore = globalThis.__demoAskIpRateStore || new Map();
globalThis.__demoAskIpRateStore = ipRateStore;

const sessionUsageStore = globalThis.__demoAskSessionUsageStore || new Map();
globalThis.__demoAskSessionUsageStore = sessionUsageStore;

const BLOCKED_PATTERNS = [
  /\bkill(ing|ed|er|s)?\b/,
  /\bsex(y|ual|ually|ting)?\b/,
  /\bnud(e|es|ity|ist)\b/,
  /\bgun(s|fire|shot|man)?\b/,
  /\bsuicid(e|al)\b/,
  /\bdrugs?\b/,
  /\bviolen(ce|t|tly)\b/,
  /\bporn(o|ography|ographic)?\b/,
  /\bnaked\b/,
  /\bmurder(ed|er|ing|s|ous)?\b/,
  /\brape\b/,
  /\bbomb(s|ing|ed|er)?\b/,
  /\bweapons?\b/,
  /\balcohol(ic|ism)?\b/,
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i,
  /pretend\s+(you\s+are|to\s+be)/i,
  /you\s+are\s+now\s+(a|an)\b/i,
  /disregard\s+(your\s+)?(rules|guidelines|instructions)/i,
  /jailbreak/i,
];

function nowMs() {
  return Date.now();
}

function getClientIp(req) {
  const xfwd = req.headers['x-forwarded-for'];
  if (!xfwd) return 'unknown';
  return String(xfwd).split(',')[0].trim() || 'unknown';
}

function isValidSessionId(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < 8 || trimmed.length > 128) return false;
  return /^[a-zA-Z0-9_-]+$/.test(trimmed);
}

function checkIpRateLimit(key, limit, windowMs) {
  const now = nowMs();
  const existing = ipRateStore.get(key);

  if (!existing || existing.resetAt <= now) {
    const fresh = { count: 1, resetAt: now + windowMs };
    ipRateStore.set(key, fresh);
    return { allowed: true, resetAt: fresh.resetAt, remaining: Math.max(0, limit - 1) };
  }

  existing.count += 1;
  ipRateStore.set(key, existing);
  return {
    allowed: existing.count <= limit,
    resetAt: existing.resetAt,
    remaining: Math.max(0, limit - existing.count),
  };
}

function getSessionUsage(sessionId) {
  const existing = sessionUsageStore.get(sessionId);
  if (!existing) return { count: 0, expiresAt: 0 };
  if (existing.expiresAt <= nowMs()) {
    sessionUsageStore.delete(sessionId);
    return { count: 0, expiresAt: 0 };
  }
  return existing;
}

function hasSessionCapacity(sessionId) {
  const usage = getSessionUsage(sessionId);
  return usage.count < DEMO_SESSION_MAX_ASKS;
}

function markDemoAskUsed(sessionId) {
  const existing = getSessionUsage(sessionId);
  const nextCount = Math.max(0, Number(existing.count || 0)) + 1;
  sessionUsageStore.set(sessionId, {
    count: nextCount,
    expiresAt: nowMs() + DEMO_SESSION_TTL_MS,
  });
  return nextCount;
}

function normalizeInput(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/\$/g, 's')
    .replace(/@/g, 'a')
    .replace(/!/g, 'i')
    .replace(/\|/g, 'i')
    .replace(/\*/g, '');
}

function isInputSafe(raw) {
  const text = String(raw || '').trim();
  if (!text || text.length > 120) return false;
  const normalized = normalizeInput(text);
  return !BLOCKED_PATTERNS.some((p) => p.test(normalized));
}

function stripFences(raw) {
  return String(raw || '')
    .replace(/^```json\s*\n?/i, '')
    .replace(/^```\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();
}

function parseJsonSafe(raw) {
  const stripped = stripFences(raw);
  return JSON.parse(stripped);
}

function firstSentence(text) {
  const clean = String(text || '').trim();
  if (!clean) return 'Curiosity helps us understand how the world works.';
  const idx = clean.indexOf('.');
  if (idx === -1) return clean;
  return clean.slice(0, idx + 1);
}

function normalizeMcqQuestion(row) {
  const options = Array.isArray(row?.options)
    ? row.options.map((opt) => String(opt || '').trim()).filter(Boolean).slice(0, 3)
    : [];

  while (options.length < 3) {
    options.push(options.length === 0 ? 'I am not sure yet' : `Option ${options.length + 1}`);
  }

  const rawAnswer = Number(row?.answer);
  const answer = Number.isInteger(rawAnswer) && rawAnswer >= 0 && rawAnswer <= 2 ? rawAnswer : 0;

  return {
    type: 'mcq',
    question: String(row?.question || '').trim() || 'Choose the best answer.',
    options,
    answer,
  };
}

function normalizeTrueFalseQuestion(row) {
  return {
    type: 'truefalse',
    question: String(row?.question || '').trim() || 'Is this true or false?',
    answer: Boolean(row?.answer),
  };
}

function normalizeQuiz(rawQuiz, title) {
  const normalized = [];
  const rows = Array.isArray(rawQuiz) ? rawQuiz : [];

  for (const row of rows) {
    const type = String(row?.type || '').toLowerCase();
    if (type === 'mcq' && normalized.filter((q) => q.type === 'mcq').length < 3) {
      normalized.push(normalizeMcqQuestion(row));
      continue;
    }
    if ((type === 'truefalse' || type === 'true_false') && normalized.filter((q) => q.type === 'truefalse').length < 2) {
      normalized.push(normalizeTrueFalseQuestion(row));
    }
  }

  while (normalized.filter((q) => q.type === 'mcq').length < 3) {
    normalized.push({
      type: 'mcq',
      question: `What is a key idea about ${title}?`,
      options: ['It helps explain how things work', 'It is only magic', 'No one can learn it'],
      answer: 0,
    });
  }

  while (normalized.filter((q) => q.type === 'truefalse').length < 2) {
    normalized.push({
      type: 'truefalse',
      question: `We can learn more about ${title} by observing the world around us.`,
      answer: true,
    });
  }

  return normalized.slice(0, 5);
}

async function callOpenAiJson({ systemPrompt, userPrompt, temperature = 0.5 }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY');
  }

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      response_format: { type: 'json_object' },
      temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`OpenAI request failed: ${response.status} ${errorBody.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  return parseJsonSafe(content);
}

function buildTopicFromParts(question, fast, deep) {
  const safeTitle = String(fast?.title || question).trim() || question;
  const safeEmoji = String(fast?.emoji || '✨').trim() || '✨';

  const activityTitle = String(deep?.activity?.title || `Try this: ${safeTitle}`).trim();
  const activitySteps = Array.isArray(deep?.activity?.steps)
    ? deep.activity.steps.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 5)
    : [];

  return {
    id: `demo_${Date.now().toString(36)}`,
    title: safeTitle,
    emoji: safeEmoji,
    story: String(fast?.story || '').trim(),
    explanation: String(fast?.explanation || '').trim(),
    keyLesson: String(fast?.keyLesson || '').trim() || firstSentence(fast?.explanation),
    wow: String(fast?.wow || '').trim(),
    activity: {
      title: activityTitle || 'Try this activity',
      steps: activitySteps.length > 0 ? activitySteps : [
        'Find one simple example of this idea around you.',
        'Draw or explain what you noticed.',
        'Share it with a grown-up and compare ideas.',
        'Try one small variation and observe what changes.',
      ],
    },
    quiz: normalizeQuiz(deep?.quiz, safeTitle),
    badge: String(fast?.badge || 'Curiosity Explorer 🦘').trim() || 'Curiosity Explorer 🦘',
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = getClientIp(req);
  const ipLimiter = checkIpRateLimit(`demo:${ip}`, DEMO_IP_MAX, DEMO_IP_WINDOW_MS);
  res.setHeader('x-ratelimit-limit', String(DEMO_IP_MAX));
  res.setHeader('x-ratelimit-remaining', String(ipLimiter.remaining));
  res.setHeader('x-ratelimit-reset', String(ipLimiter.resetAt));

  if (!ipLimiter.allowed) {
    return res.status(429).json({ error: 'Rate limit exceeded. Please try again soon.' });
  }

  const question = String(req.body?.question || '').trim();
  const sessionId = String(req.body?.sessionId || '').trim();

  if (!isValidSessionId(sessionId)) {
    return res.status(400).json({ error: 'Invalid request payload' });
  }

  if (!isInputSafe(question)) {
    return res.status(400).json({ error: 'Please ask a safe, short question for kids.' });
  }

  if (!hasSessionCapacity(sessionId)) {
    return res.status(429).json({
      error: `Demo ask limit reached for this session (${DEMO_SESSION_MAX_ASKS}).`,
      limit: DEMO_SESSION_MAX_ASKS,
    });
  }

  try {
    const [creatorFastPrompt, creatorDeepPrompt, bouncerPrompt] = await Promise.all([
      resolvePromptTemplate('creator_fast'),
      resolvePromptTemplate('creator_deep'),
      resolvePromptTemplate('bouncer_system'),
    ]);

    if (!creatorFastPrompt || !creatorDeepPrompt || !bouncerPrompt) {
      return res.status(500).json({ error: 'Prompt configuration unavailable' });
    }

    const fast = await callOpenAiJson({
      systemPrompt: creatorFastPrompt,
      userPrompt: question,
      temperature: 0.6,
    });

    const deepSeed = JSON.stringify({
      title: fast?.title || question,
      explanation: fast?.explanation || '',
      keyLesson: fast?.keyLesson || '',
    });

    const deep = await callOpenAiJson({
      systemPrompt: creatorDeepPrompt,
      userPrompt: deepSeed,
      temperature: 0.4,
    });

    const topic = buildTopicFromParts(question, fast, deep);

    const safety = await callOpenAiJson({
      systemPrompt: bouncerPrompt,
      userPrompt: JSON.stringify(topic),
      temperature: 0,
    });

    if (String(safety?.status || '').toUpperCase() !== 'SAFE') {
      return res.status(400).json({ error: 'Could not create a safe demo answer for that question.' });
    }

    const used = markDemoAskUsed(sessionId);
    return res.status(200).json({
      topic,
      demoAskUsed: used,
      demoAskRemaining: Math.max(0, DEMO_SESSION_MAX_ASKS - used),
    });
  } catch {
    return res.status(500).json({ error: 'Could not generate demo answer right now.' });
  }
}
