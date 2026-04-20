import { track } from "@vercel/analytics";

const LAST_ACTIVE_DATE_KEY = "whyroo_last_active_date";
const SESSION_ID_KEY = "whyroo_session_id";
const SESSION_QUESTION_COUNT_KEY = "whyroo_session_question_count";

function getLocalDateKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const [y, m, d] = String(value).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function getOrCreateSessionId() {
  if (typeof window === "undefined") return "server";

  const current = sessionStorage.getItem(SESSION_ID_KEY);
  if (current) return current;

  const generated =
    (typeof crypto !== "undefined" && crypto.randomUUID && crypto.randomUUID()) ||
    `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  sessionStorage.setItem(SESSION_ID_KEY, generated);
  return generated;
}

export function trackEvent(eventName, properties = {}) {
  if (typeof window === "undefined") return;

  const payload = {
    ...properties,
    session_id: getOrCreateSessionId(),
  };

  try {
    track(eventName, payload);
  } catch {
    // Best-effort only.
  }
}

export function incrementSessionQuestionsCount() {
  if (typeof window === "undefined") return 1;

  const raw = sessionStorage.getItem(SESSION_QUESTION_COUNT_KEY);
  const current = Number.parseInt(raw || "0", 10);
  const nextCount = Number.isFinite(current) ? current + 1 : 1;
  sessionStorage.setItem(SESSION_QUESTION_COUNT_KEY, String(nextCount));
  return nextCount;
}

export function trackReturnNextDay() {
  if (typeof window === "undefined") return;

  const todayKey = getLocalDateKey();
  const lastKey = localStorage.getItem(LAST_ACTIVE_DATE_KEY);

  const today = parseDateKey(todayKey);
  const last = parseDateKey(lastKey);

  if (today && last) {
    const diffDays = Math.round((today.getTime() - last.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays === 1) {
      trackEvent("return_next_day", { days_since_last: 1 });
    }
  }

  localStorage.setItem(LAST_ACTIVE_DATE_KEY, todayKey);
}
