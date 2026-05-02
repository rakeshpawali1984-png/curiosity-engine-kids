import { Resend } from 'resend';
import { parseBearerToken, validateSupabaseToken } from './auth.js';
import { getPool } from './db.js';
import { getEnvVar } from './env.js';
import { logger } from './logger.js';

const FROM = 'Rakesh from Whyroo <hello@whyroo.com>';
const APP_BASE_URL = getEnvVar('APP_BASE_URL', 'https://whyroo.com');

const NO_USAGE_PROMPTS = [
  'Why do we yawn when someone else yawns?',
  'Why do bubbles always pop?',
  'Why does the moon change shape?',
  'Why do cats purr?',
  'Why does popcorn pop?',
  'Why do we get goosebumps?',
  'Why do rainbows appear after rain?',
  'Why do dogs wag their tails?',
  'How do birds know where to fly in winter?',
  'Why do we sneeze?',
  'Why is the ocean so deep?',
  'How do spiders make webs?',
  'Why do leaves fall off trees?',
  'Why does thunder come after lightning?',
  'How do fish sleep?',
  'Why do we get butterflies in our stomach?',
  'Why do some things sink and some things float?',
  'How does a rainbow form inside a raindrop?',
  'Why do we have a belly button?',
  'Why do our voices sound different in a recording?',
  'How do bees make honey?',
  'Why do we have eyebrows?',
  'Why does hot air rise?',
];

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeQuestionText(question) {
  const raw = String(question || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';

  const withoutTrailingPunctuation = raw.replace(/[.?!]+$/g, '').trim();
  if (!withoutTrailingPunctuation) return '';

  const withCapitalizedLead = withoutTrailingPunctuation.charAt(0).toUpperCase() + withoutTrailingPunctuation.slice(1);
  return `${withCapitalizedLead}?`;
}

function formatLocalDateLabel(localDate, timezone) {
  if (!localDate) return 'today';

  const raw = String(localDate).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-').map(Number);
    const dateObj = new Date(Date.UTC(year, month - 1, day));
    return new Intl.DateTimeFormat('en-AU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(dateObj);
  }

  const dateObj = localDate instanceof Date ? localDate : new Date(raw);
  if (Number.isNaN(dateObj.getTime())) {
    return String(localDate);
  }

  return new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: timezone || 'UTC',
  }).format(dateObj);
}

function toDisplayDate(localDate, timezone) {
  return `${formatLocalDateLabel(localDate, timezone)} (${timezone || 'UTC'})`;
}

function pickByDate(items, localDate, offset = 0) {
  if (!Array.isArray(items) || items.length === 0) return '';

  const raw = String(localDate || '').trim();
  const seedSource = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? raw
    : localDate instanceof Date
      ? localDate.toISOString().slice(0, 10)
      : `${new Date().toISOString().slice(0, 10)}`;

  const numeric = Number(seedSource.replace(/\D/g, '')) || 1;
  const index = (numeric + offset) % items.length;
  return items[index];
}

function toSubjectLine(localDate, timezone) {
  const shortDate = formatLocalDateLabel(localDate, timezone);
  return `Your Whyroo Daily Summary — ${shortDate}`;
}

function buildAppLink() {
  const trimmed = String(APP_BASE_URL || '').trim();
  if (!trimmed) return 'https://whyroo.com/app';

  try {
    return new URL('/app', trimmed).toString();
  } catch {
    try {
      return new URL('/app', `https://${trimmed.replace(/^https?:\/\//, '')}`).toString();
    } catch {
      return 'https://whyroo.com/app';
    }
  }
}

function buildDemoLink() {
  const trimmed = String(APP_BASE_URL || '').trim();
  if (!trimmed) return 'https://whyroo.com/demo';

  try {
    return new URL('/demo', trimmed).toString();
  } catch {
    try {
      return new URL(`/demo`, `https://${trimmed.replace(/^https?:\/\//, '')}`).toString();
    } catch {
      return 'https://whyroo.com/demo';
    }
  }
}

function buildParentPortalLink() {
  const trimmed = String(APP_BASE_URL || '').trim();
  if (!trimmed) return 'https://whyroo.com/parent';

  try {
    return new URL('/parent', trimmed).toString();
  } catch {
    try {
      return new URL(`/parent`, `https://${trimmed.replace(/^https?:\/\//, '')}`).toString();
    } catch {
      return 'https://whyroo.com/parent';
    }
  }
}

function buildUnsubscribeLink(parentEmail) {
  const trimmed = String(APP_BASE_URL || '').trim();
  const base = trimmed ? trimmed : 'https://whyroo.com';
  try {
    const url = new URL('/parent', base);
    url.searchParams.set('tab', 'digest');
    url.searchParams.set('action', 'unsubscribe');
    if (parentEmail) url.searchParams.set('email', parentEmail);
    return url.toString();
  } catch {
    return 'https://whyroo.com/parent?tab=digest&action=unsubscribe';
  }
}

function uniqueQuestions(rows, limit = 5) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const q = normalizeQuestionText(row.query_text);
    if (!q) continue;
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
    if (out.length >= limit) break;
  }
  return out;
}

function buildChildSummaries(rows, limitPerChild = 3) {
  const byChild = new Map();

  for (const row of rows) {
    const rawName = String(row.child_name || '').trim();
    const childName = rawName || 'Child';
    const key = childName.toLowerCase();
    if (!byChild.has(key)) {
      byChild.set(key, {
        name: childName,
        questions: [],
        seen: new Set(),
      });
    }

    const entry = byChild.get(key);
    const q = normalizeQuestionText(row.query_text);
    if (!q) continue;
    const qKey = q.toLowerCase();
    if (entry.seen.has(qKey)) continue;
    if (entry.questions.length >= limitPerChild) continue;

    entry.seen.add(qKey);
    entry.questions.push(q);
  }

  return Array.from(byChild.values()).map((entry) => ({
    name: entry.name,
    questions: entry.questions,
  }));
}

function joinNames(names) {
  const filtered = names.filter(Boolean);
  if (filtered.length === 0) return 'Your child';
  if (filtered.length === 1) return filtered[0];
  if (filtered.length === 2) return `${filtered[0]} and ${filtered[1]}`;
  return `${filtered.slice(0, -1).join(', ')}, and ${filtered[filtered.length - 1]}`;
}

function extractTopicHint(question) {
  const raw = String(question || '').trim();
  if (!raw) return 'today\'s question';

  const lower = raw.toLowerCase();
  const keywordHints = [
    ['lightning', 'lightning or storms'],
    ['moon', 'the moon'],
    ['dream', 'dreams'],
    ['onion', 'onions'],
    ['rocket', 'rockets'],
    ['yawn', 'yawning'],
    ['rainbow', 'rainbows'],
    ['star', 'stars'],
  ];

  for (const [keyword, hint] of keywordHints) {
    if (lower.includes(keyword)) return hint;
  }

  const clean = raw.replace(/[?!]+$/g, '').trim();
  const parsed = clean.match(/^(why|how|what|when|where|who)\s+(does|do|did|is|are|can|could|would|should|will|have|has|had)?\s*(.+)$/i);
  const tail = parsed?.[3] ? parsed[3].trim() : clean;
  return tail.length > 60 ? `${tail.slice(0, 57).trim()}...` : tail;
}

// Maps raw interest strings (from child_profiles.interests) to digest topic keys.
const INTEREST_TO_TOPIC = {
  cricket: 'sports',
  tennis: 'sports',
  football: 'sports',
  swimming: 'sports',
  basketball: 'sports',
  dance: null,      // no matching topic pool — skip
  drawing: null,    // no matching topic pool — skip
  music: 'music',
  animals: 'animals',
  space: 'space',
  dinosaurs: 'dinosaurs',
  cooking: 'cooking',
};

function interestToTopicLabel(interest) {
  const key = String(interest || '').toLowerCase().trim();
  return INTEREST_TO_TOPIC[key] ?? null;
}

function inferTopicLabel(question) {
  const lower = String(question || '').toLowerCase();
  const mappings = [
    [/\bdinosaur/, 'dinosaurs'],
    [/\bcricket\b/, 'sports'],
    [/\btennis\b/, 'sports'],
    [/\bfootball\b/, 'sports'],
    [/\bbasketball\b/, 'sports'],
    [/\bswim/, 'sports'],
    [/\bstar\b/, 'space'],
    [/\bmoon\b/, 'space'],
    [/\brocket\b/, 'space'],
    [/\bocean\b/, 'nature'],
    [/\banimal\b/, 'animals'],
    [/\bbird\b/, 'nature'],
    [/\brainbow\b/, 'nature'],
    [/\blightning\b/, 'how things work'],
    [/\bdream\b/, 'how things work'],
    [/\byawn\b/, 'how things work'],
    [/\bhiccup\b/, 'how things work'],
    [/\bonion\b/, 'how things work'],
  ];

  for (const [pattern, label] of mappings) {
    if (pattern.test(lower)) return label;
  }

  return 'how things work';
}

/**
 * Build topic labels for the digest.
 * Priority: child interests selected in profile → keyword inference from queries.
 * Interests are authoritative — if a child has selected 'space', use that even if
 * today's questions were about something else.
 */
function getFamilyTopicLabels(rows, limit = 3) {
  const labels = [];
  const seen = new Set();

  // 1. Collect unique interests across all active children (order = first child first).
  for (const row of rows) {
    const interests = Array.isArray(row.child_interests) ? row.child_interests : [];
    for (const interest of interests) {
      const label = interestToTopicLabel(interest);
      if (!label || seen.has(label)) continue;
      seen.add(label);
      labels.push(label);
      if (labels.length >= limit) return labels;
    }
  }

  // 2. Fall back to keyword matching on today's questions to fill remaining slots.
  for (const row of rows) {
    const q = normalizeQuestionText(row?.query_text);
    if (!q) continue;
    const label = inferTopicLabel(q);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
    if (labels.length >= limit) return labels;
  }

  return labels;
}

function summarizeFamilyContext(topicLabels) {
  const labels = Array.isArray(topicLabels) ? topicLabels : [];

  if (labels.length === 0) {
    return "Your kids explored big why-questions today.";
  }
  if (labels.length === 1) {
    return `Your kids explored ${labels[0]} today.`;
  }
  if (labels.length === 2) {
    return `Your kids explored ${labels[0]} and ${labels[1]} today.`;
  }
  return `Your kids explored ${labels[0]}, ${labels[1]}, and ${labels[2]} today.`;
}

const DINNER_QUESTIONS = {
  space: [
    'If you found out tomorrow that life existed somewhere else in the universe, what would you want to ask them first?',
    'If you could live on any planet other than Earth, which one would you pick — and what would you have to figure out to survive?',
    'Do you think space is mostly empty, or mostly full of things we just cannot see yet?',
    'If you could send one message into space knowing someone might find it in a thousand years, what would you say?',
    'What do you think is the biggest question about space that nobody has answered yet?',
  ],
  sports: [
    'If you could change one rule in your favourite sport to make it more interesting, what would it be?',
    'Do you think the best athletes are born that way, or do they become that way? What makes you think so?',
    'If you had to invent a completely new sport using only things in this room, what would it look like?',
    'What do you think goes through a player\'s head in the last second of a close game?',
    'If you were coaching a team that kept losing, what is the one thing you would change first?',
  ],
  dinosaurs: [
    'If dinosaurs had never disappeared, what do you think the world would look like right now?',
    'Do you think dinosaurs were more like reptiles or more like birds? What makes you think that?',
    'If you could spend one day in the time of dinosaurs but had to stay safe, what would your plan be?',
    'What do you think is the most important thing scientists still do not know about dinosaurs?',
    'If you discovered a brand-new dinosaur fossil, what would you name it and why?',
  ],
  nature: [
    'If you could be any plant or animal for a week, what would you choose — and what do you think you would notice that humans never do?',
    'What do you think nature does better than any machine humans have ever built?',
    'If you could ask a tree one question and it could answer, what would you ask?',
    'What is something in nature that looks simple but is probably much more complicated underneath?',
    'If humans disappeared tomorrow, what do you think nature would do first?',
  ],
  animals: [
    'If you could understand what one animal was thinking for a day, which would you pick?',
    'What do you think an animal notices about humans that we never think about?',
    'If animals had a meeting to talk about the biggest problem on Earth, what do you think they would say?',
    'What do you think is the cleverest thing any animal does — and why has no human copied it yet?',
    'If you could give one animal a new superpower, what would it be and why would that animal need it?',
  ],
  'how things work': [
    'Pick something in the room right now. What do you think is actually happening inside it?',
    'What is one thing that works every day but you have never stopped to wonder how?',
    'If you had to build the thing you thought about today from scratch, where would you even start?',
    'What do you think would happen if we took away one thing everyone relies on and nobody noticed it was gone?',
    'What is something that seems like magic until you understand how it works — and then seems even more amazing?',
  ],
  cooking: [
    'If you could only eat food from one country for the rest of your life, which would you pick and why?',
    'What do you think is the hardest part of cooking that nobody talks about?',
    'If you could invent a brand-new flavour that does not exist yet, what would it taste like?',
    'What do you think changes inside food when you cook it? What is actually happening in there?',
    'If you had to cook a meal that told a story, what story would you tell and what would you make?',
  ],
  music: [
    'Why do you think a song can make you feel happy one day and sad the next — even if the song has not changed?',
    'If you could only ever listen to one song again, which would you pick — and what would you miss about everything else?',
    'If you invented a new instrument, what would it sound like and what feelings would it make people have?',
    'What do you think music does for people that nothing else can?',
    'If you could turn one emotion into a piece of music, which emotion would you pick and what would it sound like?',
  ],
};

const DINNER_QUESTIONS_FALLBACK = [
  'What is the most interesting thing you thought about today — even if you cannot fully explain it yet?',
  'If you could know the answer to one question in the world right now, what would you ask?',
  'What is something that everyone around you seems to accept, but you are not sure you believe?',
  'What is one thing that happened today that made you want to know more?',
  'If you could go back and change one decision from today, what would it be and why?',
];

function buildSharedDinnerQuestion(topicLabels, localDate) {
  const labels = Array.isArray(topicLabels) ? topicLabels : [];
  const primary = labels[0] || '';

  const pool = DINNER_QUESTIONS[primary] || DINNER_QUESTIONS_FALLBACK;
  return pickByDate(pool, localDate);
}

const HOOK_LINES = {
  space: [
    'Most kids think space is just darkness and distance — until they find the patterns hiding in it.',
    'Space seems impossibly big, until you realise everything in it follows the same simple rules.',
    'The further you look into space, the further back in time you see.',
  ],
  sports: [
    'Most kids think sport is all about strength — until they see how much of it is pattern recognition.',
    'The best athletes are not just fast. They have learned to see what others miss.',
    'Sport looks simple from the outside, until you notice how many tiny decisions happen every second.',
  ],
  dinosaurs: [
    'Dinosaurs were not slow and clumsy — scientists now think many of them were fast, warm-blooded, and clever.',
    'Most of what we know about dinosaurs comes from clues smaller than your fingernail.',
    'Dinosaurs did not really disappear — the birds outside your window are their descendants.',
  ],
  nature: [
    'Most of what keeps nature running is completely invisible — until you know what to look for.',
    'Every plant and animal alive today has been solving the same problems for millions of years.',
    'Nature has no waste. Everything becomes something else.',
  ],
  animals: [
    'Animals solve problems most humans have not even thought about yet.',
    'The cleverest animal behaviour often looks completely random — until you see the pattern.',
    'Most animals communicate in ways we are only just starting to understand.',
  ],
  'how things work': [
    'Most kids think understanding everyday things is guesswork, until they start noticing the patterns.',
    'Once you understand how one system works, you start seeing the same pattern everywhere.',
    'The most surprising part of how the world works is usually the part nobody thought to question.',
  ],
  cooking: [
    'Cooking is just chemistry — heat, time, and the right ingredients in the right order.',
    'Every great recipe is a solved problem that someone spent years figuring out.',
    'The difference between a good meal and a great one is usually one tiny detail.',
  ],
  music: [
    'Music is mathematics your brain has learned to feel.',
    'Every great song follows rules — the trick is knowing exactly when to break them.',
    'Most of what makes music powerful happens in the silences between the notes.',
  ],
};

const HOOK_LINES_FALLBACK = [
  'Most kids think understanding the world is guesswork, until they start noticing the patterns.',
  'The best questions are the ones that make you realise how much there is still to find out.',
  'Curiosity does not need a reason. The reason shows up once you start looking.',
];

function buildHookLine(topicLabels, localDate) {
  const labels = Array.isArray(topicLabels) ? topicLabels : [];
  const primary = labels[0] || '';
  const pool = HOOK_LINES[primary] || HOOK_LINES_FALLBACK;
  return pickByDate(pool, localDate, 2);
}

function buildCommonHeader(localDate, timezone) {
  return `
          <tr>
            <td style="background:#a855f7;padding:36px 40px;text-align:center;">
              <p style="margin:0;font-size:48px;line-height:1;">🦘</p>
                <h1 style="margin:10px 0 0;color:#ffffff;font-family:'Nunito',sans-serif;font-size:28px;font-weight:900;letter-spacing:-0.5px;line-height:1.2;">Welcome back to Whyroo!</h1>
                <p style="margin:6px 0 0;color:#f3e8ff;font-family:'Nunito',sans-serif;font-size:15px;font-weight:700;font-style:italic;">From why to wow.</p>
                <p style="margin:10px 0 0;color:#f3e8ff;font-family:'Nunito',sans-serif;font-size:13px;font-weight:600;">${escapeHtml(toDisplayDate(localDate, timezone))}</p>
            </td>
          </tr>`;
}

function buildCommonLayout(bodyHtml, localDate, timezone) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Whyroo Daily Curiosity Summary</title>
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
</head>
<body style="margin:0;padding:0;background:#f3f0ff;font-family:'Nunito',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
    <tr>
      <td align="center">
        <table width="620" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e9ddff;box-shadow:0 10px 30px rgba(124,58,237,0.12);">
          ${buildCommonHeader(localDate, timezone)}
          ${bodyHtml}
          <tr>
            <td style="padding:0 24px 20px;">
              <div style="display:inline-block;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;padding:10px 14px;color:#6d28d9;font-weight:700;font-size:12px;">
                🦘 Helping curious kids ask better questions 🧠✨
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildActiveUsageHtml({ parentName, parentEmail, childSummaries, inactiveChildNames, localDate, timezone, contextLine, askTonightQuestion, hookLine, effortLine, personalizationLine }) {
  const safeParentName = escapeHtml(parentName || 'Parent');
  const safeContextLine = escapeHtml(contextLine || 'Your kids explored great questions today.');
  const safeAskTonightQuestion = escapeHtml(askTonightQuestion || 'What surprised you most about what you learned today?');
  const safeHookLine = escapeHtml(hookLine || 'Most kids think it is guesswork, until they spot the patterns behind it.');
  const safeEffortLine = escapeHtml(effortLine || 'Takes 2 minutes, at dinner, in the car, or before bed.');
  const safePersonalizationLine = escapeHtml(personalizationLine || '');
  const safeParentPortalLink = escapeHtml(buildParentPortalLink());
  const safeUnsubscribeLink = escapeHtml(buildUnsubscribeLink(parentEmail));

  // Build questions grouped by child
  const questionLines = childSummaries.length > 1
    ? childSummaries.map((entry) => {
        const qs = (entry.questions || []);
        if (!qs.length) return '';
        const items = qs.map((q) =>
          `<li style="margin:0 0 5px;font-family:'Nunito',sans-serif;font-size:14px;color:#374151;line-height:1.5;">${escapeHtml(q)}</li>`
        ).join('');
        return `<p style="margin:0 0 4px;font-family:'Nunito',sans-serif;font-size:13px;font-weight:800;color:#7c3aed;">${escapeHtml(entry.name)}</p>
              <ul style="margin:0 0 14px;padding-left:18px;">${items}</ul>`;
      }).join('')
    : (() => {
        const qs = childSummaries[0]?.questions || [];
        const items = qs.length
          ? qs.map((q) => `<li style="margin:0 0 5px;font-family:'Nunito',sans-serif;font-size:14px;color:#374151;line-height:1.5;">${escapeHtml(q)}</li>`).join('')
          : `<li style="margin:0;font-family:'Nunito',sans-serif;font-size:14px;color:#374151;">A great curiosity question was explored today.</li>`;
        return `<ul style="margin:0;padding-left:18px;">${items}</ul>`;
      })();

  const inactiveLine = inactiveChildNames.length > 0
    ? `<p style="margin:0 0 16px;font-size:13px;color:#9ca3af;">Also today: ${escapeHtml(joinNames(inactiveChildNames))} took a little Whyroo break 🙂</p>`
    : '';

  const bodyHtml = `
          <tr>
            <td style="padding:28px 28px 24px;">
              <p style="margin:0 0 6px;font-size:15px;color:#6b7280;">Hi ${safeParentName},</p>
              <p style="margin:0 0 18px;font-size:15px;color:#374151;line-height:1.5;">${safeContextLine}</p>

              <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.08em;color:#9ca3af;text-transform:uppercase;">Your conversation starter today</p>
              <p style="margin:0 0 14px;font-size:19px;line-height:1.4;color:#111827;font-weight:900;">${safeAskTonightQuestion}</p>

              <p style="margin:0 0 10px;font-size:13px;color:#6b7280;line-height:1.5;">${safeHookLine}</p>
              <p style="margin:0 0 0;font-size:13px;color:#9ca3af;">${safeEffortLine}</p>
              ${safePersonalizationLine ? `<p style="margin:10px 0 0;font-size:13px;color:#6b7280;">${safePersonalizationLine}</p>` : ''}

              <hr style="margin:24px 0;border:none;border-top:1px solid #f3f4f6;" />

              <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.08em;color:#9ca3af;text-transform:uppercase;">Questions explored today</p>
              ${questionLines}
              ${inactiveLine}

              <p style="margin:0;font-size:12px;color:#9ca3af;">Change digest preferences in <a href="${safeParentPortalLink}" style="color:#7c3aed;text-decoration:none;">Parent Portal</a> &middot; <a href="${safeUnsubscribeLink}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a></p>
            </td>
          </tr>`;

  return buildCommonLayout(bodyHtml, localDate, timezone);
}

function buildNoUsageHtml({ parentName, parentEmail, childNames, localDate, timezone, simplePrompt, appLink }) {
  const safeParentName = escapeHtml(parentName || 'Parent');
  const safePrompt = escapeHtml(simplePrompt || 'Why do we yawn when someone else yawns?');
  const safeAppLink = escapeHtml(appLink || 'https://whyroo.com/app');
  const safeParentPortalLink = escapeHtml(buildParentPortalLink());
  const safeUnsubscribeLink = escapeHtml(buildUnsubscribeLink(parentEmail));
  const childLabel = childNames.length > 0 ? childNames.map((name) => escapeHtml(name)).join(', ') : 'your child';

  const bodyHtml = `
          <tr>
            <td style="padding:28px 28px 24px;">
              <p style="margin:0 0 6px;font-size:15px;color:#6b7280;">Hi ${safeParentName},</p>
              <p style="margin:0 0 18px;font-size:15px;color:#374151;line-height:1.5;">No Whyroo sessions today. Here is a question to explore together with ${childLabel}.</p>

              <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.08em;color:#9ca3af;text-transform:uppercase;">Your conversation starter today</p>
              <p style="margin:0 0 14px;font-size:20px;line-height:1.4;color:#111827;font-weight:900;">${safePrompt}</p>

              <p style="margin:0 0 10px;font-size:13px;color:#6b7280;line-height:1.5;">Most kids think understanding the world is guesswork, until they start noticing the patterns.</p>

              <p style="margin:0 0 24px;font-size:13px;color:#9ca3af;">Takes 2 minutes, at dinner, in the car, or before bed.</p>

              <p style="margin:0;font-size:12px;color:#9ca3af;">Change digest preferences in <a href="${safeParentPortalLink}" style="color:#7c3aed;text-decoration:none;">Parent Portal</a> &middot; <a href="${safeUnsubscribeLink}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a></p>
            </td>
          </tr>`;

  return buildCommonLayout(bodyHtml, localDate, timezone);
}

async function ensureParentRow(client, userId, email) {
  await client.query(
    `
      insert into public.parents (id, email)
      values ($1, $2)
      on conflict (id) do nothing
    `,
    [userId, email || `${userId}@unknown.local`]
  );
}

export async function sendDailySummaryForParent({
  client,
  resend,
  parentId,
  parentEmail,
  parentDisplayName,
  timezone,
}) {
  const safeTimezone = timezone || 'Australia/Sydney';

  try {
    const localDateRes = await client.query(
      `
        select (now() at time zone $1)::date as local_date
      `,
      [safeTimezone]
    );
    const localDate = localDateRes.rows[0]?.local_date || null;

    const profilesRes = await client.query(
      `
        select id, name, coalesce(interests, '{}') as interests
        from public.child_profiles
        where parent_id = $1
        order by created_at asc
      `,
      [parentId]
    );
    const childProfiles = profilesRes.rows || [];

    const searchesRes = await client.query(
      `
        select
          cs.query_text,
          cs.created_at,
          cp.id as child_id,
          cp.name as child_name,
          coalesce(cp.interests, '{}') as child_interests
        from public.child_searches cs
        join public.child_profiles cp on cp.id = cs.child_id
        where cp.parent_id = $1
          and (cs.created_at at time zone $2)::date = (now() at time zone $2)::date
        order by cs.created_at desc
        limit 40
      `,
      [parentId, safeTimezone]
    );

    const rows = searchesRes.rows || [];

    let html;
    if (rows.length > 0) {
      const childSummaries = buildChildSummaries(rows, 3);
      const topicLabels = getFamilyTopicLabels(rows, 3); // uses child interests first
      const activeChildNameSet = new Set(childSummaries.map((entry) => entry.name.toLowerCase()));
      const inactiveChildNames = childProfiles
        .map((profile) => String(profile.name || '').trim())
        .filter(Boolean)
        .filter((name) => !activeChildNameSet.has(name.toLowerCase()));
      const contextLine = summarizeFamilyContext(topicLabels);
      const askTonightQuestion = buildSharedDinnerQuestion(topicLabels, localDate);
      const hookLine = buildHookLine(topicLabels, localDate);
      const effortLine = 'Takes 2 minutes, at dinner, in the car, or before bed.';
      const primaryName = childSummaries[0]?.name || '';
      const primaryQuestion = childSummaries[0]?.questions?.[0] || '';
      const primaryTopic = primaryQuestion ? inferTopicLabel(primaryQuestion) : '';
      const personalizationLine = primaryName && primaryTopic
        ? `${primaryName} was exploring ${primaryTopic} today.`
        : '';

      html = buildActiveUsageHtml({
        parentName: parentDisplayName || String(parentEmail || '').split('@')[0],
        parentEmail,
        childSummaries,
        inactiveChildNames,
        localDate,
        timezone: safeTimezone,
        contextLine,
        askTonightQuestion,
        hookLine,
        effortLine,
        personalizationLine,
      });
    } else {
      const profileNames = Array.from(new Set(childProfiles.map((row) => row.name).filter(Boolean)));
      // Derive topic labels from child profile interests (no sessions today)
      const profileRows = childProfiles.flatMap((p) =>
        (Array.isArray(p.interests) && p.interests.length > 0)
          ? [{ child_interests: p.interests, query_text: null }]
          : []
      );
      const noUsageTopicLabels = getFamilyTopicLabels(profileRows, 1);
      const primaryTopic = noUsageTopicLabels[0] || '';
      // Use interest-matched dinner question if available, else fall back to generic prompt
      const prompt = primaryTopic && DINNER_QUESTIONS[primaryTopic]
        ? pickByDate(DINNER_QUESTIONS[primaryTopic], localDate)
        : pickByDate(NO_USAGE_PROMPTS, localDate);
      const appLink = buildAppLink();

      html = buildNoUsageHtml({
        parentName: parentDisplayName || String(parentEmail || '').split('@')[0],
        parentEmail,
        childNames: profileNames,
        localDate,
        timezone: safeTimezone,
        simplePrompt: prompt,
        appLink,
      });
    }

    await resend.emails.send({
      from: FROM,
      to: parentEmail,
      subject: toSubjectLine(localDate, safeTimezone),
      html,
    });

    await client.query(
      `
        update public.parents
        set daily_digest_last_sent_local_date = $2
        where id = $1
      `,
      [parentId, localDate]
    );

    await client.query(
      `
        insert into public.parent_daily_digest_logs (
          parent_id,
          local_date,
          timezone,
          searches_count,
          status,
          error_message
        )
        values ($1, $2, $3, $4, 'sent', null)
        on conflict (parent_id, local_date)
        do update set
          sent_at = now(),
          searches_count = excluded.searches_count,
          status = 'sent',
          error_message = null
      `,
      [parentId, localDate, safeTimezone, rows.length]
    );

    return { ok: true, sent: true, searchesCount: rows.length, localDate, timezone: safeTimezone };
  } catch (error) {
    try {
      await client.query(
        `
          insert into public.parent_daily_digest_logs (
            parent_id,
            local_date,
            timezone,
            searches_count,
            status,
            error_message
          )
          values ($1, (now() at time zone 'UTC')::date, $3, 0, 'failed', $2)
        `,
        [parentId, String(error?.message || 'Unknown error').slice(0, 400), safeTimezone]
      );
    } catch {
      // Best-effort logging only.
    }

    throw error;
  }
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
    return res.status(authResult.status || 401).json({ error: authResult.error || 'Unauthorized' });
  }

  const apiKey = getEnvVar('RESEND_API_KEY');
  if (!apiKey) {
    logger.warn('send-daily-summary-email: RESEND_API_KEY not set - skipping');
    return res.status(200).json({ ok: true, skipped: true, reason: 'missing_resend_key' });
  }

  const resend = new Resend(apiKey);

  const client = await getPool().connect();
  try {
    await ensureParentRow(client, authResult.userId, authResult.email);

    const parentRes = await client.query(
      `
        select id, email, display_name, daily_digest_timezone
        from public.parents
        where id = $1
        limit 1
      `,
      [authResult.userId]
    );

    const parent = parentRes.rows[0];
    if (!parent?.email) {
      return res.status(400).json({ error: 'Parent email not found' });
    }

    const result = await sendDailySummaryForParent({
      client,
      resend,
      parentId: authResult.userId,
      parentEmail: parent.email,
      parentDisplayName: parent.display_name,
      timezone: parent.daily_digest_timezone || 'Australia/Sydney',
    });

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Failed to send daily summary' });
  } finally {
    client.release();
  }
}
