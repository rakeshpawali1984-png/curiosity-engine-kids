import { useCallback, useRef, useState } from "react";

const STORAGE_KEY = "whyroo_achievements_v1";

export const BADGES = [
  { id: "first_why",        label: "First Why ❓" },
  { id: "curious_mind",     label: "Curious Mind 🧠" },
  { id: "why_explorer",     label: "Why Explorer 🌍" },
  { id: "on_a_roll",        label: "On a roll 🔥" },
  { id: "curiosity_streak", label: "Curiosity streak 🔥🔥" },
  { id: "ocean_explorer",   label: "Ocean Explorer 🌊" },
  { id: "space_curious",    label: "Space Curious 🚀" },
];

function detectCategory(topic) {
  const text = [topic?.title, topic?.story, topic?.explanation]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/ocean|sea|salty|saltiness|wave|marine|coral/.test(text)) return "ocean";
  if (/space|star|planet|galaxy|moon|solar|asteroid|comet|orbit|cosmos/.test(text)) return "space";
  return null;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.total !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // silently ignore storage quota errors
  }
}

function defaultState() {
  return { total: 0, categories: [], unlocked: [] };
}

// Session badges fire every session (not stored in unlocked).
// Lifetime badges fire once ever.
const SESSION_BADGES = new Set(["first_why", "on_a_roll", "curiosity_streak"]);

function checkBadges(state, streak) {
  const newlyUnlocked = [];
  const already = state.unlocked;

  // Session badges: check streak only, no localStorage guard
  if (streak === 1) newlyUnlocked.push("first_why");
  if (streak === 2) newlyUnlocked.push("on_a_roll");
  if (streak === 5) newlyUnlocked.push("curiosity_streak");

  // Lifetime badges: only unlock once ever
  const checkOnce = (id, condition) => {
    if (!already.includes(id) && condition()) newlyUnlocked.push(id);
  };
  checkOnce("curious_mind",   () => state.total >= 5);
  checkOnce("why_explorer",   () => state.total >= 10);
  checkOnce("ocean_explorer", () => state.categories.includes("ocean"));
  checkOnce("space_curious",  () => state.categories.includes("space"));

  return newlyUnlocked;
}

export default function useAchievements() {
  const streakRef = useRef(0);
  const [newBadge, setNewBadge] = useState(null);
  const [gameUnlocked, setGameUnlocked] = useState(false);

  const recordQuestion = useCallback((topic) => {
    const persisted = loadState() ?? defaultState();
    streakRef.current += 1;

    const category = detectCategory(topic);
    const updatedCategories =
      category && !persisted.categories.includes(category)
        ? [...persisted.categories, category]
        : persisted.categories;

    const updatedState = {
      ...persisted,
      total: persisted.total + 1,
      categories: updatedCategories,
    };

    const newIds = checkBadges(updatedState, streakRef.current);
    if (newIds.length > 0) {
      // Only persist lifetime badges to localStorage; session badges fire every session
      const lifetimeIds = newIds.filter((id) => !SESSION_BADGES.has(id));
      updatedState.unlocked = [...persisted.unlocked, ...lifetimeIds];
      const badge = BADGES.find((b) => b.id === newIds[0]);
      if (badge) setNewBadge(badge);
    }

    // Unlock mini game every 25 questions
    if (updatedState.total > 0 && updatedState.total % 25 === 0) {
      setGameUnlocked(true);
    }

    saveState(updatedState);
  }, []);

  // Top category the child has explored most
  const topCategory = (() => {
    const state = loadState();
    const cats = state?.categories || [];
    return cats[0] || "default";
  })();

  const clearNewBadge    = useCallback(() => setNewBadge(null), []);
  const clearGameUnlock  = useCallback(() => setGameUnlocked(false), []);

  return { recordQuestion, newBadge, clearNewBadge, gameUnlocked, clearGameUnlock, topCategory };
}
