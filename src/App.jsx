import { useEffect, useMemo, useState } from "react";
import { topics } from "./data/topics";
import { topicsSparkRaw } from "./data/topics-spark.js";
import { normalizeTopicsSpark } from "./data/normalize";
import HomeScreen from "./components/HomeScreen";
import StoryScreen from "./components/StoryScreen";
import ExplanationScreen from "./components/ExplanationScreen";
import ActivityScreen from "./components/ActivityScreen";
import QuizScreen from "./components/QuizScreen";
import BadgeScreen from "./components/BadgeScreen";
import CuriousScreen from "./components/CuriousScreen";
import LoginScreen from "./components/LoginScreen";
import ChildProfilesScreen from "./components/ChildProfilesScreen";
import FamilyTopBar from "./components/FamilyTopBar";
import JourneyScreen from "./components/JourneyScreen";
import { hasSupabaseConfig, supabase } from "./lib/supabaseClient";
import {
  awardChildBadge,
  getParentSecurity,
  listChildProfiles,
  logChildSearch,
  setParentPinSecurity,
  upsertParentFromSession,
} from "./lib/familyData";

const topicsSpark = normalizeTopicsSpark(topicsSparkRaw);
const MAIN_EXPERIENCE = import.meta.env.VITE_MAIN_EXPERIENCE || "classic";

export default function App() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [familyReady, setFamilyReady] = useState(false);
  const [children, setChildren] = useState([]);
  const [activeChildId, setActiveChildId] = useState(null);
  const [showJourney, setShowJourney] = useState(false);
  const [parentPortalUnlocked, setParentPortalUnlocked] = useState(false);
  const [parentPinHash, setParentPinHash] = useState(null);
  const [parentPinSalt, setParentPinSalt] = useState(null);
  const [parentSecurityReady, setParentSecurityReady] = useState(false);

  const path = window.location.pathname;
  const isParentRoute = path === "/parent";
  const isCuriousRoute = path === "/get-curious";
  const useCuriousAsMain = MAIN_EXPERIENCE === "curious" && path === "/";

  const activeChild = useMemo(
    () => children.find((c) => c.id === activeChildId) || null,
    [children, activeChildId]
  );

  const refreshChildren = async (userId) => {
    const rows = await listChildProfiles(userId);
    setChildren(rows);
    setActiveChildId((prev) => {
      if (prev && rows.some((c) => c.id === prev)) return prev;
      return rows[0]?.id || null;
    });
  };

  const syncFamilyData = async (nextSession) => {
    if (!nextSession?.user) {
      setFamilyReady(true);
      return;
    }
    try {
      await upsertParentFromSession(nextSession);
      const security = await getParentSecurity(nextSession.user.id);
      setParentPinHash(security?.parent_pin_hash || null);
      setParentPinSalt(security?.parent_pin_salt || null);
      setParentSecurityReady(true);
      await refreshChildren(nextSession.user.id);
    } catch (e) {
      console.error("Failed loading parent/children:", e.message);
      setParentPinHash(null);
      setParentPinSalt(null);
      setParentSecurityReady(true);
    } finally {
      setFamilyReady(true);
    }
  };

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) {
      setAuthReady(true);
      setFamilyReady(true);
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const currentSession = data.session;
      setSession(currentSession);
      setAuthReady(true);
      setFamilyReady(false);
      setParentPortalUnlocked(false);
      setParentSecurityReady(false);
      // Load parent/children in the background so auth UI never gets stuck.
      syncFamilyData(currentSession);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setAuthReady(true);
      setFamilyReady(false);
      setParentPortalUnlocked(false);
      setParentSecurityReady(false);
      if (!nextSession?.user) {
        setChildren([]);
        setActiveChildId(null);
        setParentPinHash(null);
        setParentPinSalt(null);
        setFamilyReady(true);
        setParentSecurityReady(true);
        return;
      }
      syncFamilyData(nextSession);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session && familyReady && !activeChild && !isParentRoute) {
      window.location.replace("/parent");
    }
  }, [session, familyReady, activeChild, isParentRoute]);

  const handleSignOut = async () => {
    setParentPortalUnlocked(false);
    await supabase.auth.signOut();
    setShowJourney(false);
  };

  const handleTrackSearch = async (queryText, searchType) => {
    if (!activeChild) return null;
    try {
      const row = await logChildSearch(activeChild.id, queryText, searchType);
      return row?.id || null;
    } catch (e) {
      console.error("Could not log child search:", e.message);
      return null;
    }
  };

  const handleTrackBadge = async (badgeTitle, sourceSearchId = null) => {
    if (!activeChild || !badgeTitle) return;
    try {
      await awardChildBadge(activeChild.id, badgeTitle, sourceSearchId);
    } catch (e) {
      console.error("Could not save badge:", e.message);
    }
  };

  const openParentPortal = () => {
    window.location.href = "/parent";
  };

  const verifyParentPin = async (pinInput) => {
    if (!parentPinHash || !parentPinSalt) return false;
    const pinHash = await hashPin(pinInput, parentPinSalt);
    if (pinHash !== parentPinHash) return false;

    setParentPortalUnlocked(true);
    return true;
  };

  const createParentPin = async (pinInput) => {
    const salt = createPinSalt();
    const pinHash = await hashPin(pinInput, salt);
    await setParentPinSecurity(session.user.id, pinHash, salt);
    setParentPinHash(pinHash);
    setParentPinSalt(salt);
    setParentPortalUnlocked(true);
  };

  if (!hasSupabaseConfig) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100 flex items-center justify-center px-4">
        <div className="max-w-lg bg-white rounded-3xl shadow-lg border border-amber-100 p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-600 mb-2">
            Setup Required
          </p>
          <h1 className="text-2xl font-black text-gray-800 mb-3">Supabase auth is not configured</h1>
          <p className="text-gray-600 text-sm leading-relaxed">
            Add <span className="font-semibold">SUPABASE_URL</span> and <span className="font-semibold">SUPABASE_PUBLISHABLE_KEY</span> to .env.local,
            then restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  if (!authReady) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100 flex items-center justify-center">
        <div className="bg-white px-6 py-4 rounded-2xl shadow-md text-gray-600 font-semibold">
          Loading...
        </div>
      </div>
    );
  }

  if (session && !familyReady) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100 flex items-center justify-center">
        <div className="bg-white px-6 py-4 rounded-2xl shadow-md text-gray-600 font-semibold">
          Loading profile...
        </div>
      </div>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  if (isParentRoute) {
    if (!parentSecurityReady) {
      return <ParentGateLoadingScreen />;
    }

    if (!parentPinHash || !parentPinSalt) {
      return (
        <ParentPinSetupScreen
          onCreatePin={createParentPin}
          onSignOut={handleSignOut}
        />
      );
    }

    if (!parentPortalUnlocked) {
      return (
        <ParentPinGateScreen
          onSubmit={verifyParentPin}
          onSignOut={handleSignOut}
        />
      );
    }

    return (
      <ChildProfilesScreen
        parent={{ id: session.user.id, email: session.user.email }}
        children={children}
        activeChildId={activeChildId}
        onSelectChild={(id) => setActiveChildId(id)}
        onChildrenUpdated={() => refreshChildren(session.user.id)}
        onSignOut={handleSignOut}
        onDone={() => {
          window.location.href = "/";
        }}
      />
    );
  }

  if (!activeChild) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-lg border border-purple-100 p-6 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-purple-500 mb-2">
            Parent Portal
          </p>
          <h1 className="text-2xl font-black text-gray-800 mb-2">Opening parent portal...</h1>
          <p className="text-sm text-gray-500">Please wait while we redirect.</p>
        </div>
      </div>
    );
  }

  if (showJourney) {
    return <JourneyScreen activeChild={activeChild} onBackHome={() => setShowJourney(false)} />;
  }

  if (isCuriousRoute || useCuriousAsMain) {
    return (
      <CuriousScreen
        activeChild={activeChild}
        onOpenJourney={() => setShowJourney(true)}
        onOpenParentPortal={openParentPortal}
        onRecordSearch={(query) => handleTrackSearch(query, "curious")}
        onAwardBadge={(badgeTitle, sourceSearchId) =>
          handleTrackBadge(badgeTitle, sourceSearchId)
        }
      />
    );
  }

  return (
    <MainApp
      activeChild={activeChild}
      onOpenJourney={() => setShowJourney(true)}
      onOpenParentPortal={openParentPortal}
      onRecordSearch={(query) => handleTrackSearch(query, "topic_card")}
      onAwardBadge={(badgeTitle, sourceSearchId) =>
        handleTrackBadge(badgeTitle, sourceSearchId)
      }
    />
  );
}

function MainApp({ activeChild, onOpenJourney, onOpenParentPortal, onRecordSearch, onAwardBadge }) {
  const [screen, setScreen] = useState("home");
  const [currentTopic, setCurrentTopic] = useState(null);
  const [pack, setPack] = useState("original"); // "original" | "spark"
  const [currentSearchId, setCurrentSearchId] = useState(null);

  const activePack = pack === "original" ? topics : topicsSpark;

  const selectTopic = async (topic) => {
    setCurrentTopic(topic);
    setScreen("story");
    const searchId = await onRecordSearch(topic.title);
    setCurrentSearchId(searchId);
  };

  const goHome = () => {
    setScreen("home");
    setCurrentTopic(null);
    setCurrentSearchId(null);
  };

  const handleQuizComplete = async () => {
    setScreen("badge");
    await onAwardBadge(currentTopic?.badge, currentSearchId);
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100">
      <div className="max-w-lg mx-auto min-h-[100dvh] px-4 pt-4 pb-8">
        <FamilyTopBar
          activeChild={activeChild}
          onOpenJourney={onOpenJourney}
          onOpenParentPortal={onOpenParentPortal}
          currentView="app"
        />

        <div key={screen} className="screen-enter">
          {screen === "home" && (
            <HomeScreen
              topics={activePack}
              pack={pack}
              onPackChange={setPack}
              onSelect={selectTopic}
            />
          )}

          {screen === "story" && (
            <StoryScreen
              topic={currentTopic}
              onNext={() => setScreen("explanation")}
              onHome={goHome}
            />
          )}

          {screen === "explanation" && (
            <ExplanationScreen
              topic={currentTopic}
              onNext={() => setScreen("activity")}
              onHome={goHome}
            />
          )}

          {screen === "activity" && (
            <ActivityScreen
              topic={currentTopic}
              onNext={() => setScreen("quiz")}
              onHome={goHome}
            />
          )}

          {screen === "quiz" && (
            <QuizScreen
              key={currentTopic.id}
              topic={currentTopic}
              onHome={goHome}
              onComplete={handleQuizComplete}
            />
          )}

          {screen === "badge" && (
            <BadgeScreen topic={currentTopic} onHome={goHome} />
          )}
        </div>
      </div>
    </div>
  );
}

function ParentPinGateScreen({ onSubmit, onSignOut }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const handleUnlock = async () => {
    setChecking(true);
    if (await onSubmit(pin.trim())) {
      setError("");
      setChecking(false);
      return;
    }
    setError("Incorrect PIN. Please try again.");
    setPin("");
    setChecking(false);
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-lg border border-purple-100 p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-purple-500 mb-2">Parent Access</p>
        <h1 className="text-2xl font-black text-gray-800 mb-2">Enter parent PIN</h1>
        <p className="text-sm text-gray-500 mb-5">This area is for parent profile and settings only.</p>

        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleUnlock();
          }}
          placeholder="Enter PIN"
          className="w-full rounded-2xl border-2 border-gray-200 focus:border-purple-400 px-4 py-3 outline-none mb-3"
        />

        {error && <p className="text-sm text-red-600 font-semibold mb-3">{error}</p>}

        <button
          onClick={handleUnlock}
          disabled={!pin.trim() || checking}
          className="w-full rounded-2xl bg-purple-500 hover:bg-purple-600 disabled:bg-purple-300 text-white font-bold py-3 transition-all active:scale-95"
        >
          {checking ? "Checking..." : "Unlock Parent Portal"}
        </button>

        <button
          onClick={onSignOut}
          disabled={checking}
          className="w-full mt-3 rounded-2xl bg-white border border-gray-200 hover:border-gray-300 disabled:border-gray-100 disabled:text-gray-400 text-gray-600 font-semibold py-3 transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function ParentPinSetupScreen({ onCreatePin, onSignOut }) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isValidPin = /^\d{4,8}$/.test(pin);

  const handleCreate = async () => {
    if (!isValidPin) {
      setError("PIN must be 4 to 8 digits.");
      return;
    }
    if (pin !== confirmPin) {
      setError("PIN and confirm PIN do not match.");
      return;
    }

    setError("");
    setSaving(true);
    try {
      await onCreatePin(pin);
    } catch (e) {
      setError(e.message || "Could not create PIN.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-lg border border-amber-100 p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-600 mb-2">First-Time Setup</p>
        <h1 className="text-2xl font-black text-gray-800 mb-2">Create parent PIN</h1>
        <p className="text-sm text-gray-600 leading-relaxed mb-5">
          This PIN protects parent tools like profile switching and sign out.
        </p>

        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Create PIN (4-8 digits)"
          className="w-full rounded-2xl border-2 border-gray-200 focus:border-purple-400 px-4 py-3 outline-none mb-3"
        />

        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
          placeholder="Confirm PIN"
          className="w-full rounded-2xl border-2 border-gray-200 focus:border-purple-400 px-4 py-3 outline-none mb-3"
        />

        {error && <p className="text-sm text-red-600 font-semibold mb-3">{error}</p>}

        <button
          onClick={handleCreate}
          disabled={saving || !pin || !confirmPin}
          className="w-full rounded-2xl bg-purple-500 hover:bg-purple-600 disabled:bg-purple-300 text-white font-bold py-3 transition-all active:scale-95"
        >
          {saving ? "Saving..." : "Create PIN"}
        </button>

        <button
          onClick={onSignOut}
          className="w-full mt-3 rounded-2xl bg-white border border-gray-200 hover:border-gray-300 text-gray-600 font-semibold py-3 transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function ParentGateLoadingScreen() {
  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-lg border border-purple-100 p-6 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-purple-500 mb-2">Parent Access</p>
        <h1 className="text-2xl font-black text-gray-800 mb-2">Checking security...</h1>
        <p className="text-sm text-gray-500">Please wait a moment.</p>
      </div>
    </div>
  );
}

function createPinSalt() {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPin(pin, salt) {
  const text = `${salt}:${pin}`;
  const encoded = new TextEncoder().encode(text);
  const digest = await window.crypto.subtle.digest("SHA-256", encoded);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
