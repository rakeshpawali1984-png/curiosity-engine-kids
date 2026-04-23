import { useEffect, useRef, useState } from "react";
import FamilyTopBar from "./FamilyTopBar";
import CuriosityFlow from "./CuriosityFlow";
import AchievementToast from "./AchievementToast";
import MiniGame from "./MiniGame";
import FlashFacts from "./games/FlashFacts";
import SortIt from "./games/SortIt";
import SpeedTap from "./games/SpeedTap";
import GameLauncher from "./GameLauncher";
import useAchievements from "../lib/useAchievements";
import { getBillingStatus } from "../lib/familyData";
import { hasSupabaseConfig, supabase } from "../lib/supabaseClient";
import { incrementSessionQuestionsCount, trackEvent } from "../lib/analytics";
import { logger } from "../lib/logger";

const PROMPT_KEY_FAST = "creator_fast_v2";
const PROMPT_KEY_DEEP = "creator_deep_v2";
const PROMPT_KEY_BOUNCER = "bouncer_system";
const OPENAI_PROXY = "/api/spark";
const MAX_INPUT_LENGTH = 120;
const SURPRISE_QUESTIONS = [
  "Why is the ocean salty?",
  "Why do stars twinkle?",
  "Why do we yawn?",
  "Why is the sky blue?",
  "Why do cats purr?",
  "How does lightning happen?",
];

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
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/,
  /pretend\s+(you\s+are|to\s+be)/,
  /you\s+are\s+now\s+(a|an)\b/,
  /disregard\s+(your\s+)?(rules|guidelines|instructions)/,
  /jailbreak/,
];

function normalizeInput(str) {
  return str
    .toLowerCase()
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/\$/g, "s")
    .replace(/@/g, "a")
    .replace(/!/g, "i")
    .replace(/\|/g, "i")
    .replace(/\*/g, "");
}

function isInputSafe(raw) {
  if (!raw || raw.trim().length === 0) return false;
  if (raw.length > MAX_INPUT_LENGTH) return false;
  const normalized = normalizeInput(raw);
  return !BLOCKED_PATTERNS.some((p) => p.test(normalized));
}

async function getProxyHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (!hasSupabaseConfig || !supabase) return headers;

  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function callOpenAI(promptTemplateKey, userContent, temperature = 0.7, jsonMode = false, promptType = "generic", questionId = null) {
  const headers = await getProxyHeaders();
  const res = await fetch(OPENAI_PROXY, {
    method: "POST",
    headers,
    body: JSON.stringify({
      promptTemplateKey,
      userContent,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      temperature,
      cacheMeta: {
        promptType,
        questionId,
        experience: "curious",
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const error = new Error(err?.error || `API error ${res.status}`);
    error.code = err?.code;
    error.status = res.status;
    error.payload = err;
    throw error;
  }

  const data = await res.json();
  return data.choices[0].message.content.trim();
}

function stripFences(raw) {
  return raw
    .replace(/^```json\s*\n?/i, "")
    .replace(/^```\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}

function parseJsonSafe(raw, label) {
  const stripped = stripFences(raw);
  try {
    return JSON.parse(stripped);
  } catch (error) {
    logger.error(`[WonderEngine V2] ${label} JSON parse failed`, error);
    throw error;
  }
}

function normalizeQuizType(type) {
  const t = String(type || "").toLowerCase().replace(/[^a-z]/g, "");
  if (t === "mcq" || t === "multiplechoice") return "mcq";
  if (t === "truefalse" || t === "boolean") return "truefalse";
  return "mcq";
}

function normalizeSingleCheck(row) {
  const question = typeof row?.question === "string" ? row.question.trim() : "";
  if (!question) return null;

  const type = normalizeQuizType(row?.type);
  if (type === "truefalse") {
    const answer = typeof row?.answer === "boolean"
      ? row.answer
      : String(row?.answer || "").toLowerCase().trim() === "true";
    return { question, type: "truefalse", answer };
  }

  const options = Array.isArray(row?.options)
    ? row.options.filter((option) => typeof option === "string" && option.trim()).map((option) => option.trim()).slice(0, 3)
    : [];
  if (options.length < 2) return null;

  let answer = Number(row?.answer);
  if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) answer = 0;
  return { question, type: "mcq", options, answer };
}

function firstUsefulSentence(text, fallback = "We learned something interesting.") {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return fallback;
  const match = raw.match(/[^.!?]+[.!?]?/);
  return (match?.[0] || raw).trim();
}

function normalizeTopicPhrase(title) {
  const raw = String(title || "this idea").trim();
  if (!raw) return "this idea";
  const noPunct = raw.replace(/[?!.]+$/, "");
  return noPunct
    .replace(/^why\s+(do|does|did|is|are|can|can't|cannot)\s+/i, "")
    .replace(/^how\s+(do|does|did|is|are|can|can't|cannot)\s+/i, "")
    .replace(/^what\s+(makes|causes|happens\s+to)\s+/i, "")
    .trim()
    .toLowerCase() || "this idea";
}

function buildFallbackQuickCheck(text) {
  const sentence = firstUsefulSentence(text, "The world is full of interesting patterns").replace(/[.!?]+$/, "");
  return {
    question: `Quick check: true or false — ${sentence}.`,
    type: "truefalse",
    answer: true,
  };
}

function buildFallbackActivity(title, keyLesson) {
  const lesson = firstUsefulSentence(keyLesson, "");
  return {
    title: `Try this: ${String(title || "This idea").trim()}`,
    steps: [
      "Look around the room — can you spot anything connected to this topic?",
      lesson ? `Think about this: ${lesson} Does anything nearby show that?` : "Point to something real nearby that reminds you of what you just learned.",
    ],
  };
}

function buildQuickTry(topic) {
  if (typeof topic?.quick_try === "string" && topic.quick_try.trim()) return topic.quick_try.trim();
  if (typeof topic?.quickTry === "string" && topic.quickTry.trim()) return topic.quickTry.trim();
  const firstStep = Array.isArray(topic?.activity?.steps) ? topic.activity.steps[0] : "";
  return String(firstStep || "").trim();
}

function buildFallbackCuriosity(title) {
  const phrase = normalizeTopicPhrase(title);
  return [
    `Where else can you spot ${phrase}?`,
    `What changes when ${phrase} happens more?`,
  ];
}

function parseFast(raw) {
  const obj = parseJsonSafe(raw, "parseFastV2");
  if (typeof obj.story !== "string" || !obj.story.trim()) throw new Error("V2 fast missing story");
  if (typeof obj.explanation !== "string" || !obj.explanation.trim()) throw new Error("V2 fast missing explanation");
  obj.quickCheck1 = normalizeSingleCheck(obj.quick_check_1 || obj.quickCheck1) || buildFallbackQuickCheck(obj.keyLesson || obj.explanation);
  return obj;
}

function parseDeep(raw) {
  const obj = parseJsonSafe(raw, "parseDeepV2");
  obj.quickCheck2 = normalizeSingleCheck(obj.quick_check_2 || obj.quickCheck2) || null;
  obj.observe = typeof obj.observe === "string" ? obj.observe.trim() : "";
  if (Array.isArray(obj.quiz)) {
    obj.quiz = obj.quiz.filter((q) => q && typeof q.question === "string");
  } else {
    obj.quiz = [];
  }
  return obj;
}

function parseBouncer(raw) {
  const obj = JSON.parse(stripFences(raw));
  if (typeof obj.status !== "string") throw new Error("Invalid bouncer response");
  return obj;
}

function buildPartialTopic(fast, userQuery) {
  const keyLesson = fast.keyLesson || `${firstUsefulSentence(fast.explanation, userQuery)}.`;
  return {
    id: `curious-v2-${Date.now()}`,
    title: fast.title || userQuery,
    emoji: fast.emoji || "🦘",
    story: fast.story,
    explanation: fast.explanation,
    keyLesson,
    wow: fast.wow || null,
    badge: fast.badge || "Whyroo Explorer 🦘",
    microCheck: normalizeSingleCheck(fast.quickCheck1) || buildFallbackQuickCheck(fast.explanation || keyLesson),
    followUpCheck: buildFallbackQuickCheck(fast.explanation || keyLesson),
    activity: buildFallbackActivity(fast.title || userQuery, keyLesson),
    quiz: [],
    quickTry: "",
    curiosity: buildFallbackCuriosity(fast.title || userQuery),
  };
}

function mergeDeep(partial, deep) {
  return {
    ...partial,
    followUpCheck: normalizeSingleCheck(deep?.quickCheck2) || partial.followUpCheck,
    activity: deep?.activity?.steps?.length ? deep.activity : partial.activity,
    quickTry: buildQuickTry(deep) || partial.quickTry,
    observe: deep?.observe || "",
    quiz: Array.isArray(deep?.quiz) && deep.quiz.length > 0 ? deep.quiz : partial.quiz,
    curiosity: Array.isArray(deep?.curiosity) && deep.curiosity.length >= 2 ? deep.curiosity : partial.curiosity,
  };
}

async function runPipeline(query, questionId, ageRange) {
  const agePrefix = ageRange ? `[Child age: ${ageRange}] ` : "";
  const ageContent = `${agePrefix}${query}`;

  const fastPromise = callOpenAI(PROMPT_KEY_FAST, ageContent, 0.7, true, "fast", questionId).then(parseFast);
  const deepPromise = callOpenAI(PROMPT_KEY_DEEP, ageContent, 0.7, true, "deep", questionId).then(parseDeep);
  const bouncerPromise = callOpenAI(PROMPT_KEY_BOUNCER, `User query for a kids learning app: "${query}"`, 0.1, false, "bouncer", questionId).then(parseBouncer);

  const [fastResult, bouncerResult] = await Promise.all([fastPromise, bouncerPromise]);
  if (String(bouncerResult?.status || "").toUpperCase() === "UNSAFE") {
    throw new Error("BLOCKED");
  }

  return { partial: fastResult, deepPromise };
}

export default function CuriousScreenV2({
  activeChild,
  onOpenJourney,
  onOpenParentPortal,
  onOpenSite,
  onRecordSearch,
  onAwardBadge,
}) {
  const [input, setInput] = useState("");
  const [screen, setScreen] = useState("ask");
  const [topic, setTopic] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [billingStatus, setBillingStatus] = useState(null);
  const [activeGame, setActiveGame] = useState(null);
  const deepPromiseRef = useRef(null);
  const activeSearchIdRef = useRef(null);
  const { recordQuestion, newBadge, clearNewBadge, gameUnlocked, clearGameUnlock, topCategory } = useAchievements();

  const refreshBillingStatus = async ({ silent = false } = {}) => {
    if (!silent) setBillingLoading(true);
    try {
      const status = await getBillingStatus();
      setBillingStatus(status);
    } catch {
      if (!silent) setBillingStatus(null);
    } finally {
      if (!silent) setBillingLoading(false);
    }
  };

  useEffect(() => {
    refreshBillingStatus();
  }, []);

  const goAsk = () => {
    setScreen("ask");
    setTopic(null);
    setErrorMsg("");
    deepPromiseRef.current = null;
    activeSearchIdRef.current = null;
  };

  const triggerSearch = async (query) => {
    if (!query || !isInputSafe(query)) {
      setScreen("blocked");
      return;
    }

    setScreen("loading");
    setErrorMsg("");
    window.scrollTo(0, 0);

    const sessionQuestionCount = incrementSessionQuestionsCount();
    trackEvent("question_asked", {
      question_length: query.length,
      has_active_child: Boolean(activeChild?.id),
      child_age_range: activeChild?.age_range || "unknown",
      source: "curious_screen_v2",
      flow_version: "v2",
    });
    trackEvent("session_questions_count", {
      count: sessionQuestionCount,
      source: "curious_screen_v2",
      flow_version: "v2",
    });

    try {
      const questionId = (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      if (onRecordSearch) {
        activeSearchIdRef.current = await onRecordSearch(query);
      }

      const { partial, deepPromise } = await runPipeline(query, questionId, activeChild?.age_range);
      const partialTopic = buildPartialTopic(partial, query);
      setTopic(partialTopic);
      setScreen("flow");
      if (onAwardBadge) {
        Promise.resolve(onAwardBadge(partialTopic.badge, activeSearchIdRef.current)).catch(() => {});
      }
      trackEvent("answer_viewed", {
        question_id: questionId,
        source: "curious_screen_v2",
        flow_version: "v2",
      });

      deepPromiseRef.current = deepPromise;
      deepPromise.then((deep) => {
        if (deepPromiseRef.current === deepPromise) {
          setTopic((prev) => (prev ? mergeDeep(prev, deep) : prev));
        }
      }).catch((error) => {
        logger.error("[WonderEngine V2] deep content failed", error);
      });
    } catch (error) {
      if (error.message === "BLOCKED") {
        setScreen("blocked");
      } else {
        setErrorMsg("Let's try another fun question 😊");
        setScreen("error");
      }
    } finally {
      refreshBillingStatus({ silent: true });
    }
  };

  const questionsLeftToday = (() => {
    const isPaidPlan = billingStatus?.subscriptionStatus === "active" || billingStatus?.subscriptionStatus === "past_due";
    if (isPaidPlan) return null;
    const usedToday = Number(billingStatus?.usedToday || 0);
    const dailyLimit = Number(billingStatus?.dailyLimit || 5);
    return Math.max(0, dailyLimit - usedToday);
  })();

  const wrapper = (children) => (
    <div className="min-h-[100dvh] bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100">
      <div className="max-w-lg mx-auto min-h-[100dvh] px-4 pt-4 pb-8">
        <FamilyTopBar activeChild={activeChild} onOpenJourney={onOpenJourney} onOpenParentPortal={onOpenParentPortal} currentView="app" />
        {children}
      </div>
      <AchievementToast badge={newBadge} onDismiss={clearNewBadge} />
      {activeGame === "catch"      && <MiniGame category={topCategory} onClose={() => { setActiveGame(null); clearGameUnlock(); }} />}
      {activeGame === "flashfacts" && <FlashFacts onClose={() => setActiveGame(null)} />}
      {activeGame === "sortit"     && <SortIt     onClose={() => setActiveGame(null)} />}
      {activeGame === "speedtap"   && <SpeedTap   onClose={() => setActiveGame(null)} />}
    </div>
  );

  const handleNextQuestion = () => {
    const suggestions = Array.isArray(topic?.curiosity) ? topic.curiosity.filter(Boolean) : [];
    if (suggestions.length > 0) {
      triggerSearch(suggestions[0]);
      return;
    }
    goAsk();
  };

  const handleMicroCheck = (interaction) => {
    recordQuestion(topic);
    trackEvent("micro_check_interacted", {
      source: "curious_screen_v2",
      flow_version: "v2",
      interaction: "two_option",
      selected_option: interaction?.label || "unknown",
      correct: Boolean(interaction?.correct),
    });
  };

  const handleSuggestedTopic = (question) => {
    if (!question) return;
    triggerSearch(question);
  };

  if (screen === "flow" && topic) {
    return wrapper(
      <CuriosityFlow
        topic={topic}
        onMicroCheck={handleMicroCheck}
        onNextQuestion={handleNextQuestion}
        onSearchSuggestion={handleSuggestedTopic}
        onAskOwnWhy={goAsk}
      />
    );
  }

  return wrapper(
    <div>
      <div className="text-center mb-6 mt-4">
        <button type="button" onClick={() => onOpenSite?.()} className="inline-flex items-center gap-2 text-4xl font-black text-purple-700 mb-2 cursor-pointer" aria-label="Go to Whyroo website">
          <span>🦘</span>
          <span>Whyroo V2</span>
        </button>
        <p className="text-gray-500 text-lg">Fast curiosity loop for curious minds.</p>
      </div>

      {screen === "ask" && gameUnlocked && (
        <button
          onClick={() => setActiveGame("catch")}
          className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-black rounded-2xl px-5 py-4 shadow-md hover:scale-[1.01] active:scale-95 transition-all"
        >
          <span className="text-base">🎮 You unlocked a reward game!</span>
          <span className="text-xl">→</span>
        </button>
      )}

      {screen === "ask" && (
        <div className="bg-white rounded-3xl shadow-lg p-5 mb-5 border-2 border-purple-100">
          <textarea
            className="w-full border-2 border-purple-100 focus:border-purple-400 bg-purple-50 focus:bg-white rounded-2xl p-4 text-base text-gray-800 resize-none outline-none transition-all"
            rows={3}
            placeholder="What are you curious about? e.g. Why is the ocean salty?"
            maxLength={MAX_INPUT_LENGTH}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                triggerSearch(input.trim());
              }
            }}
          />
          <div className="flex justify-between items-center mt-1 mb-3 px-1 min-h-[1.25rem]">
            <span />
            <span className="text-xs text-gray-400 shrink-0 ml-2">{input.length}/{MAX_INPUT_LENGTH}</span>
          </div>
          <button
            onClick={() => triggerSearch(input.trim())}
            disabled={!input.trim() || billingLoading || questionsLeftToday === 0}
            className={`w-full text-white font-black py-5 rounded-2xl text-xl transition-all shadow-md ${input.trim() && questionsLeftToday !== 0 ? "bg-purple-500 hover:bg-purple-600" : "bg-purple-300 cursor-not-allowed"}`}
          >
            {questionsLeftToday === 0 ? "Questions used for today" : "Explore →"}
          </button>
        </div>
      )}

      {screen === "ask" && (
        <div className="mb-6">
          <p className="text-center text-xs font-bold text-purple-400 uppercase tracking-widest mb-3">✨ Try one of these</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {SURPRISE_QUESTIONS.map((question) => (
              <button key={question} onClick={() => setInput(question)} className="flex items-center gap-1.5 bg-white hover:bg-purple-50 border-2 border-purple-100 hover:border-purple-300 text-gray-700 font-semibold text-sm px-3 py-2 rounded-2xl transition-all shadow-sm">
                <span>{question}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {screen === "ask" && <GameLauncher onSelect={setActiveGame} />}

      {screen === "loading" && (
        <div className="bg-white rounded-3xl shadow-lg p-8 text-center">
          <div className="flex justify-center mb-5">
            <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
          </div>
          <p className="text-purple-700 font-black text-xl">Preparing your adventure... ✨</p>
        </div>
      )}

      {screen === "blocked" && (
        <div className="bg-orange-50 border-2 border-orange-200 rounded-3xl p-8 text-center">
          <p className="text-5xl mb-3">😊</p>
          <p className="text-orange-700 font-bold text-lg leading-snug mb-5">Let&apos;s explore something fun and safe instead 😊</p>
          <button onClick={goAsk} className="bg-orange-400 hover:bg-orange-500 text-white font-bold py-3 px-8 rounded-2xl transition-all">Try a different question</button>
        </div>
      )}

      {screen === "error" && (
        <div className="bg-white border-2 border-gray-200 rounded-3xl p-8 text-center">
          <p className="text-5xl mb-3">😊</p>
          <p className="text-gray-600 font-bold text-lg mb-5">{errorMsg}</p>
          <button onClick={goAsk} className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 px-8 rounded-2xl transition-all">Try again 🔄</button>
        </div>
      )}
    </div>
  );
}