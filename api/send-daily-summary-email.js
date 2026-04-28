import { Resend } from 'resend';
import { parseBearerToken, validateSupabaseToken } from './auth.js';
import { getPool } from './db.js';
import { getEnvVar } from './env.js';
import { logger } from './logger.js';

const FROM = 'Rakesh from Whyroo <hello@whyroo.com>';
const APP_BASE_URL = getEnvVar('APP_BASE_URL', 'https://whyroo.com');

const TOMORROW_BIG_WHY = [
  'Why do we dream?',
  'Why is the sky blue?',
  'Why do we yawn when someone else yawns?',
  'How do rockets go up if gravity pulls them down?',
  'Why do onions make us cry?',
  'Why do stars twinkle?',
  'Why do birds fly in a V shape?',
  'Why do we get hiccups?',
];

const NO_USAGE_PROMPTS = [
  'Why do we yawn when someone else yawns?',
  'Why do bubbles always pop?',
  'Why does the moon change shape?',
  'Why do cats purr?',
  'Why does popcorn pop?',
  'Why do we get goosebumps?',
  'Why do rainbows appear after rain?',
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
  return `Your Whyroo Daily Summary - ${shortDate}`;
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

function buildDinnerPrompts({ question, childName }) {
  const topicHint = extractTopicHint(question);
  const nameSuffix = childName ? `, ${childName}` : '';

  return [
    `What surprised you most about ${topicHint}${nameSuffix}?`,
    `How would you explain ${topicHint} in your own words${nameSuffix}?`,
    `Did you notice anything like ${topicHint} in real life today${nameSuffix}?`,
  ];
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

function buildActiveUsageHtml({ parentName, childSummaries, inactiveChildNames, localDate, timezone, prompts, tomorrowBigWhy }) {
  const safeParentName = escapeHtml(parentName || 'Parent');
  const safePrompts = prompts.map((p) => escapeHtml(p));
  const safeTomorrowBigWhy = escapeHtml(tomorrowBigWhy || 'Why do we dream?');
  const safeParentPortalLink = escapeHtml(buildParentPortalLink());
  const safeAppLink = escapeHtml(buildAppLink());

  const activeChildNames = childSummaries.map((entry) => entry.name);
  const primaryChildName = activeChildNames[0] || '';
  const featuredTopicHint = childSummaries[0]?.questions?.[0]
    ? extractTopicHint(childSummaries[0].questions[0])
    : 'something new';
  const primaryPrompt = safePrompts[0] || '';

  const insightLine = primaryChildName
    ? `${escapeHtml(primaryChildName)} was especially curious about ${escapeHtml(featuredTopicHint)} today.`
    : 'Your child explored a thoughtful question today.';

  // Per-child conversation starters
  const perChildPrompts = childSummaries.map((entry) => {
    const q = entry.questions?.[0] || '';
    const p = q ? buildDinnerPrompts({ question: q, childName: '' }) : null;
    return { name: escapeHtml(entry.name), prompt: p ? escapeHtml(p[0]) : '' };
  }).filter((x) => x.prompt);

  const multiChild = childSummaries.length > 1;

  const askTonightBlock = multiChild
    ? perChildPrompts.map(({ name, prompt }, i) =>
        `${i > 0 ? '<div style="margin:0 0 16px;border-top:1px solid #f3f4f6;"></div>' : ''}
              <p style="margin:0 0 6px;font-family:'Nunito',sans-serif;font-size:12px;font-weight:700;letter-spacing:0.06em;color:#9ca3af;">Ask <span style="color:#7c3aed;font-weight:900;font-size:13px;">${name}</span> tonight</p>
              <p style="margin:0 0 20px;font-family:'Nunito',sans-serif;font-size:17px;line-height:1.45;color:#1f2937;font-weight:700;">${prompt}</p>`
      ).join('')
    : `<p style="margin:0 0 6px;font-family:'Nunito',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.08em;color:#9ca3af;text-transform:uppercase;">Ask this tonight</p>
              <p style="margin:0 0 20px;font-family:'Nunito',sans-serif;font-size:19px;line-height:1.4;color:#1f2937;font-weight:800;">${primaryPrompt}</p>`;

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
              <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.5;">${insightLine}</p>

              ${askTonightBlock}

              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="background:#7c3aed;border-radius:10px;">
                    <a href="${safeAppLink}" style="display:inline-block;padding:13px 24px;color:#ffffff;font-size:15px;font-weight:900;text-decoration:none;">Open Whyroo →</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 6px;font-size:13px;color:#9ca3af;">Takes 2 minutes at dinner, in the car, or before bed.</p>

              <hr style="margin:24px 0;border:none;border-top:1px solid #f3f4f6;" />

              <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.08em;color:#9ca3af;text-transform:uppercase;">Questions explored today</p>
              ${questionLines}
              ${inactiveLine}

              <hr style="margin:24px 0;border:none;border-top:1px solid #f3f4f6;" />

              <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.08em;color:#9ca3af;text-transform:uppercase;">Tomorrow's 2-minute starter</p>
              <p style="margin:0 0 20px;font-size:16px;font-weight:800;color:#374151;">${safeTomorrowBigWhy}</p>

              <p style="margin:0;font-size:12px;color:#9ca3af;">Change digest preferences in <a href="${safeParentPortalLink}" style="color:#7c3aed;text-decoration:none;">Parent Portal</a>.</p>
            </td>
          </tr>`;

  return buildCommonLayout(bodyHtml, localDate, timezone);
}

function buildNoUsageHtml({ parentName, childNames, localDate, timezone, simplePrompt, appLink }) {
  const safeParentName = escapeHtml(parentName || 'Parent');
  const safePrompt = escapeHtml(simplePrompt || 'Why do we yawn when someone else yawns?');
  const safeAppLink = escapeHtml(appLink || 'https://whyroo.com/app');
  const safeParentPortalLink = escapeHtml(buildParentPortalLink());
  const childLabel = childNames.length > 0 ? childNames.map((name) => escapeHtml(name)).join(', ') : 'your child';

  const bodyHtml = `
          <tr>
            <td style="padding:28px 28px 24px;">
              <p style="margin:0 0 6px;font-size:15px;color:#6b7280;">Hi ${safeParentName},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.5;">No Whyroo today — but here's an easy question to try with ${childLabel} tonight.</p>

              <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.08em;color:#9ca3af;text-transform:uppercase;">Try this tonight</p>
              <p style="margin:0 0 20px;font-size:20px;line-height:1.4;color:#111827;font-weight:900;">${safePrompt}</p>

              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="background:#7c3aed;border-radius:10px;">
                    <a href="${safeAppLink}" style="display:inline-block;padding:13px 24px;color:#ffffff;font-size:15px;font-weight:900;text-decoration:none;">Open Whyroo →</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 24px;font-size:13px;color:#9ca3af;">Takes 2 minutes at dinner, in the car, or before bed.</p>

              <hr style="margin:0 0 24px;border:none;border-top:1px solid #f3f4f6;" />

              <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.08em;color:#9ca3af;text-transform:uppercase;">Tomorrow's 2-minute starter</p>
              <p style="margin:0 0 24px;font-size:16px;font-weight:800;color:#374151;">${escapeHtml(pickByDate(TOMORROW_BIG_WHY, localDate, 1))}</p>

              <p style="margin:0;font-size:12px;color:#9ca3af;">Change digest preferences in <a href="${safeParentPortalLink}" style="color:#7c3aed;text-decoration:none;">Parent Portal</a>.</p>
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
        select id, name
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
          cp.name as child_name
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
      const activeChildNameSet = new Set(childSummaries.map((entry) => entry.name.toLowerCase()));
      const inactiveChildNames = childProfiles
        .map((profile) => String(profile.name || '').trim())
        .filter(Boolean)
        .filter((name) => !activeChildNameSet.has(name.toLowerCase()));
      const promptChildName = childSummaries[0]?.name || '';
      const promptQuestion = childSummaries[0]?.questions?.[0] || '';
      const prompts = buildDinnerPrompts({ question: promptQuestion, childName: promptChildName });
      const tomorrowBigWhy = pickByDate(TOMORROW_BIG_WHY, localDate, 1);

      html = buildActiveUsageHtml({
        parentName: parentDisplayName || String(parentEmail || '').split('@')[0],
        childSummaries,
        inactiveChildNames,
        localDate,
        timezone: safeTimezone,
        prompts,
        tomorrowBigWhy,
      });
    } else {
      const profileNames = Array.from(new Set(childProfiles.map((row) => row.name).filter(Boolean)));
      const prompt = pickByDate(NO_USAGE_PROMPTS, localDate);
      const appLink = buildAppLink();

      html = buildNoUsageHtml({
        parentName: parentDisplayName || String(parentEmail || '').split('@')[0],
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
