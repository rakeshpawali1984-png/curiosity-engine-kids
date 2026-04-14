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
const PARENT_PIN_MAX_ATTEMPTS = 5;
const PARENT_PIN_LOCK_MS = 60 * 1000;
const BILLING_RETURN_USER_KEY = "ce_billing_return_user";

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
  const [parentPinFailedAttempts, setParentPinFailedAttempts] = useState(0);
  const [parentPinLockedUntil, setParentPinLockedUntil] = useState(0);

  const path = window.location.pathname;
  const billingStatus = new URLSearchParams(window.location.search).get("billing");
  const isLandingRoute = path === "/";
  const isAppRoute = path === "/app";
  const isParentRoute = path === "/parent";
  const isCuriousRoute = path === "/get-curious";
  const isDemoRoute = path === "/demo";
  const isPrivacyRoute = path === "/privacy";
  const isTermsRoute = path === "/terms";

  if (isDemoRoute) {
    return (
      <MainApp
        activeChild={{ name: "Demo Explorer", avatar_emoji: "🧠" }}
        demoMode
        onAskGrownUp={() => {
          window.location.href = "/";
        }}
      />
    );
  }

  if (isLandingRoute) {
    return <LandingPage />;
  }

  if (isPrivacyRoute) {
    return (
      <LegalScreen
        title="Privacy Policy"
        updated="Last updated: April 2026"
        intro="We care about your child’s safety and privacy. This app is designed to collect as little data as possible."
        sections={[
          {
            heading: "1. Information We Collect",
            body: "We collect only what is needed to provide the service:",
            items: [
              "Parent account information (such as email via login)",
              "Child profiles created by parents (name or nickname only)",
              "Questions asked within the app (to generate responses)",
              "Subscription and payment information (handled securely by Stripe)",
            ],
          },
          {
            heading: "2. What We Do Not Collect",
            items: [
              "We do not collect personal contact details directly from children",
              "We do not intentionally collect precise location data",
              "We do not show ads",
              "We do not sell personal data",
            ],
            body: "We only share data with trusted service providers needed to operate the service, such as authentication, hosting, and payments.",
          },
          {
            heading: "3. How We Use Data",
            body: "We use data to:",
            items: [
              "Provide answers and learning experiences",
              "Improve safety and response quality",
              "Manage subscriptions and access",
            ],
          },
          {
            heading: "4. Children’s Privacy",
            body: "Parents create and control all child profiles. Children are not required to provide personal information to use the app.",
          },
          {
            heading: "5. Data Control",
            body: "Parents can:",
            items: [
              "Delete child profiles at any time",
              "Request deletion of their data, subject to legal, fraud-prevention, and billing record retention requirements",
            ],
          },
          {
            heading: "6. Third-Party Services",
            body: "We use trusted services for authentication, hosting, and payments (via Stripe). These providers handle data securely.",
          },
          {
            heading: "7. Contact",
            body: "If you have questions, contact us at hello@curiosityengine.kids.",
          },
        ]}
      />
    );
  }

  if (isTermsRoute) {
    return (
      <LegalScreen
        title="Terms of Use"
        updated="Last updated: April 2026"
        sections={[
          {
            heading: "Using the service",
            body: "Parents are responsible for account use and supervising how children use the app.",
          },
          {
            heading: "Subscriptions",
            body: "Paid subscriptions renew automatically unless cancelled. Pricing and limits are shown inside the parent portal.",
          },
          {
            heading: "Safety",
            body: "The app is designed to provide kid-friendly educational content. Parents should review outputs for their family's needs.",
          },
        ]}
      />
    );
  }

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
    const userId = session?.user?.id;
    if (!userId) {
      setParentPinFailedAttempts(0);
      setParentPinLockedUntil(0);
      return;
    }
    const { attempts, lockedUntil } = readPinGuard(userId);
    setParentPinFailedAttempts(attempts);
    setParentPinLockedUntil(lockedUntil);
  }, [session?.user?.id]);

  useEffect(() => {
    if (session && familyReady && !activeChild && !isParentRoute && (isAppRoute || isCuriousRoute)) {
      window.location.replace("/parent");
    }
  }, [session, familyReady, activeChild, isParentRoute, isAppRoute, isCuriousRoute]);

  useEffect(() => {
    if (!isParentRoute || parentPortalUnlocked) return;
    if (billingStatus !== "success" && billingStatus !== "cancel") return;

    const userId = session?.user?.id;
    if (!userId) return;

    const expectedUser = sessionStorage.getItem(BILLING_RETURN_USER_KEY);
    if (expectedUser !== userId) return;

    // One-time bypass for Stripe return initiated from checkout flow.
    setParentPortalUnlocked(true);
    setParentPinFailedAttempts(0);
    setParentPinLockedUntil(0);
    clearPinGuard(userId);
    sessionStorage.removeItem(BILLING_RETURN_USER_KEY);
  }, [billingStatus, isParentRoute, parentPortalUnlocked, session?.user?.id]);

  const handleSignOut = async () => {
    const userId = session?.user?.id;
    if (userId) clearPinGuard(userId);
    setParentPortalUnlocked(false);
    setParentPinFailedAttempts(0);
    setParentPinLockedUntil(0);
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
    const userId = session?.user?.id;
    if (!userId) {
      return { ok: false, error: "Session expired. Please sign in again." };
    }

    if (Date.now() < parentPinLockedUntil) {
      return {
        ok: false,
        error: "Too many attempts. Please wait and try again.",
        lockedUntil: parentPinLockedUntil,
      };
    }

    if (!parentPinHash || !parentPinSalt) {
      return { ok: false, error: "Parent PIN is not set up yet." };
    }
    const pinHash = await hashPin(pinInput, parentPinSalt);
    if (pinHash !== parentPinHash) {
      const nextAttempts = parentPinFailedAttempts + 1;
      if (nextAttempts >= PARENT_PIN_MAX_ATTEMPTS) {
        const nextLock = Date.now() + PARENT_PIN_LOCK_MS;
        setParentPinFailedAttempts(0);
        setParentPinLockedUntil(nextLock);
        writePinGuard(userId, 0, nextLock);
        return {
          ok: false,
          error: "Too many attempts. Parent PIN is locked for 60 seconds.",
          lockedUntil: nextLock,
        };
      }

      setParentPinFailedAttempts(nextAttempts);
      setParentPinLockedUntil(0);
      writePinGuard(userId, nextAttempts, 0);
      return {
        ok: false,
        error: `Incorrect PIN. ${PARENT_PIN_MAX_ATTEMPTS - nextAttempts} attempt(s) left.`,
      };
    }

    setParentPortalUnlocked(true);
    setParentPinFailedAttempts(0);
    setParentPinLockedUntil(0);
    clearPinGuard(userId);
    return { ok: true };
  };

  const createParentPin = async (pinInput) => {
    const salt = createPinSalt();
    const pinHash = await hashPin(pinInput, salt);
    await setParentPinSecurity(session.user.id, pinHash, salt);
    setParentPinHash(pinHash);
    setParentPinSalt(salt);
    setParentPortalUnlocked(true);
  };

  const changeParentPin = async (currentPinInput, newPinInput) => {
    if (!session?.user?.id) {
      return { ok: false, error: "Session expired. Please sign in again." };
    }
    if (!parentPinHash || !parentPinSalt) {
      return { ok: false, error: "Parent PIN is not set up yet." };
    }

    const currentHash = await hashPin(currentPinInput, parentPinSalt);
    if (currentHash !== parentPinHash) {
      return { ok: false, error: "Current PIN is incorrect." };
    }

    const nextSalt = createPinSalt();
    const nextHash = await hashPin(newPinInput, nextSalt);
    await setParentPinSecurity(session.user.id, nextHash, nextSalt);
    setParentPinHash(nextHash);
    setParentPinSalt(nextSalt);
    setParentPinFailedAttempts(0);
    setParentPinLockedUntil(0);
    clearPinGuard(session.user.id);
    return { ok: true };
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
          onBackHome={() => {
            window.location.href = "/app";
          }}
          initialLockedUntil={parentPinLockedUntil}
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
        onChangeParentPin={changeParentPin}
        onSignOut={handleSignOut}
        onDone={() => {
          window.location.href = "/app";
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

  if (isAppRoute) {
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

  if (!isCuriousRoute) {
    return <LandingPage />;
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

function LandingPage() {
  const [showSafetyModal, setShowSafetyModal] = useState(false);

  const handleTryNow = () => {
    window.location.href = "/app";
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100 text-slate-800">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <section className="bg-white/90 backdrop-blur rounded-3xl shadow-sm border border-purple-100 p-6 sm:p-10 text-center mb-8 sm:mb-10">
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-purple-500 mb-3">Curiosity Engine</p>
          <h1 className="text-3xl sm:text-5xl font-black leading-tight text-purple-800 mb-4">
            A safe place for kids to explore their curiosity
          </h1>
          <p className="text-base sm:text-xl text-slate-600 max-w-3xl mx-auto mb-6">
            Ask any question. Get simple stories, real-world ideas, and keep the curiosity going.
          </p>
          <button
            onClick={handleTryNow}
            className="inline-flex items-center justify-center rounded-2xl bg-purple-600 hover:bg-purple-700 text-white text-lg font-bold px-7 py-3 transition-transform active:scale-95"
          >
            Start exploring for free
          </button>
          <p className="mt-4 text-sm font-semibold text-slate-500">Built for kids. Controlled by parents.</p>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 italic">No ads. No distractions. Just curiosity.</p>

          <div className="mt-7 max-w-md mx-auto text-left rounded-2xl border border-purple-100 bg-white shadow-sm p-4 sm:p-5">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-purple-500 mb-2">App preview</p>
            <p className="text-sm font-black text-slate-800 mb-2">Why do stars twinkle?</p>
            <p className="text-sm text-slate-600 leading-relaxed">
              Imagine stars like tiny lanterns in the sky. Their light travels a very long way, and when it moves through moving air around Earth,
              the light wiggles a little. That makes stars look like they are twinkling.
            </p>
          </div>
        </section>

        <section className="bg-white rounded-3xl border border-purple-100 p-6 sm:p-8 mb-6">
          <h2 className="text-2xl sm:text-3xl font-black text-purple-800 mb-5">How it works</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              "Ask a question",
              "Learn through a story",
              "Keep the curiosity going",
            ].map((step, index) => (
              <div key={step} className="rounded-2xl bg-purple-50 border border-purple-100 p-4">
                <p className="text-xs font-extrabold uppercase tracking-wider text-purple-500 mb-1">Step {index + 1}</p>
                <p className="font-bold text-slate-700">{step}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-3xl border border-purple-100 p-6 sm:p-8 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-5">
            <h2 className="text-2xl sm:text-3xl font-black text-purple-800">Designed with safety in mind</h2>
            <button
              onClick={() => setShowSafetyModal(true)}
              className="text-sm font-bold text-purple-600 hover:text-purple-700 self-start sm:self-auto"
            >
              How safety works
            </button>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 text-slate-700 font-semibold">
            <li className="rounded-xl bg-purple-50 border border-purple-100 px-4 py-3">Parent login and controls</li>
            <li className="rounded-xl bg-purple-50 border border-purple-100 px-4 py-3">No ads, no distractions</li>
            <li className="rounded-xl bg-purple-50 border border-purple-100 px-4 py-3">No personal data collected from children</li>
            <li className="rounded-xl bg-purple-50 border border-purple-100 px-4 py-3">Built with dual-layer safety checks to keep content child-appropriate.</li>
          </ul>
        </section>

        <section className="bg-white rounded-3xl border border-purple-100 p-6 sm:p-8 mb-8">
          <h2 className="text-2xl sm:text-3xl font-black text-purple-800 mb-5">Simple pricing</h2>
          <div className="grid gap-4 sm:grid-cols-2 mb-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm uppercase tracking-wider font-extrabold text-slate-500 mb-2">Free</p>
              <p className="text-lg font-bold text-slate-700">5 questions per day</p>
            </div>
            <div className="rounded-2xl border border-purple-200 bg-purple-50 p-5">
              <p className="text-sm uppercase tracking-wider font-extrabold text-purple-500 mb-2">Paid</p>
              <p className="text-lg font-bold text-slate-700 mb-1">Unlimited questions</p>
              <p className="font-semibold text-slate-600">One subscription for all your kids</p>
              <p className="mt-3 text-2xl font-black text-purple-700">$6.99/month</p>
              <p className="mt-1 text-xs text-slate-500">Less than a coffee per month ☕</p>
            </div>
          </div>
          <button
            onClick={handleTryNow}
            className="inline-flex items-center justify-center rounded-2xl bg-purple-600 hover:bg-purple-700 text-white text-base sm:text-lg font-bold px-6 py-3 transition-transform active:scale-95"
          >
            Unlock unlimited curiosity
          </button>
        </section>

        <footer className="text-sm text-slate-500 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between pb-2">
          <div className="flex items-center gap-4">
            <a href="/privacy" className="hover:text-purple-700 font-semibold">Privacy Policy</a>
            <a href="/terms" className="hover:text-purple-700 font-semibold">Terms of Use</a>
          </div>
          <div className="flex flex-col sm:items-end gap-1">
            <a href="mailto:hello@curiosityengine.kids" className="hover:text-purple-700 font-semibold">hello@curiosityengine.kids</a>
            <p className="text-xs text-slate-400">Designed in Australia 🇦🇺</p>
          </div>
        </footer>
      </div>

      {showSafetyModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center px-4 z-50">
          <div className="w-full max-w-lg bg-white rounded-3xl border border-purple-100 shadow-xl p-6">
            <div className="flex items-start justify-between gap-3 mb-3">
              <h3 className="text-xl font-black text-purple-800">How safety works</h3>
              <button
                onClick={() => setShowSafetyModal(false)}
                className="text-sm font-bold text-slate-500 hover:text-slate-700"
                aria-label="Close safety details"
              >
                Close
              </button>
            </div>
            <ul className="space-y-2 text-slate-700 text-sm leading-relaxed">
              <li>Requests pass through a first safety layer that blocks harmful or inappropriate intent.</li>
              <li>A second safety layer checks content rules before answers are delivered.</li>
              <li>Parent controls and child profiles keep family access separated.</li>
              <li>No ads and no distraction-heavy feed design.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function LegalScreen({ title, updated, intro, sections }) {
  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100 text-slate-800">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="bg-white rounded-3xl border border-purple-100 p-6 sm:p-8">
          <a href="/" className="inline-flex items-center text-sm font-bold text-purple-600 hover:text-purple-700 mb-4">← Back</a>
          <h1 className="text-3xl font-black text-purple-800 mb-2">{title}</h1>
          <p className="text-sm text-slate-500 mb-6">{updated}</p>
          {intro && <p className="text-slate-600 leading-relaxed mb-6">{intro}</p>}
          <div className="space-y-5">
            {sections.map((section) => (
              <section key={section.heading}>
                <h2 className="text-lg font-black text-slate-800 mb-1">{section.heading}</h2>
                <p className="text-slate-600 leading-relaxed">{section.body}</p>
                {Array.isArray(section.items) && section.items.length > 0 && (
                  <ul className="mt-2 space-y-1 text-slate-600 list-disc pl-5">
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MainApp({
  activeChild,
  onOpenJourney,
  onOpenParentPortal,
  onRecordSearch,
  onAwardBadge,
  demoMode = false,
  onAskGrownUp,
}) {
  const [screen, setScreen] = useState("home");
  const [currentTopic, setCurrentTopic] = useState(null);
  const [pack, setPack] = useState("original"); // "original" | "spark"
  const [currentSearchId, setCurrentSearchId] = useState(null);

  const activePack = pack === "original" ? topics : topicsSpark;
  const visibleTopics = useMemo(() => {
    if (!demoMode) return activePack;
    const shuffled = [...activePack].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 4);
  }, [activePack, demoMode]);

  const selectTopic = async (topic) => {
    setCurrentTopic(topic);
    setScreen("story");
    const searchId = onRecordSearch ? await onRecordSearch(topic.title) : null;
    setCurrentSearchId(searchId);
  };

  const goHome = () => {
    setScreen("home");
    setCurrentTopic(null);
    setCurrentSearchId(null);
  };

  const handleQuizComplete = async () => {
    setScreen("badge");
    if (onAwardBadge) {
      await onAwardBadge(currentTopic?.badge, currentSearchId);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100">
      <div className="max-w-lg mx-auto min-h-[100dvh] px-4 pt-4 pb-8">
        {!demoMode && (
          <FamilyTopBar
            activeChild={activeChild}
            onOpenJourney={onOpenJourney}
            onOpenParentPortal={onOpenParentPortal}
            currentView="app"
          />
        )}

        {demoMode && (
          <div className="bg-white/85 backdrop-blur rounded-2xl border border-purple-100 px-3 py-2 mb-4 flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">Demo Mode</p>
            <button
              onClick={() => {
                window.location.href = "/";
              }}
              className="rounded-full px-3 py-1.5 text-xs font-bold bg-purple-50 text-purple-600 hover:bg-purple-100 hover:text-purple-700"
            >
              Ask a grown-up
            </button>
          </div>
        )}

        <div key={screen} className="screen-enter">
          {screen === "home" && (
            <HomeScreen
              topics={visibleTopics}
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
            <BadgeScreen
              topic={currentTopic}
              onHome={demoMode ? (onAskGrownUp || goHome) : goHome}
              ctaLabel={demoMode ? "Liked it? Ask a grown-up" : "Try another adventure ✨"}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ParentPinGateScreen({ onSubmit, onSignOut, onBackHome, initialLockedUntil = 0 }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(initialLockedUntil);
  const [nowTs, setNowTs] = useState(Date.now());

  useEffect(() => {
    setLockedUntil(initialLockedUntil || 0);
  }, [initialLockedUntil]);

  useEffect(() => {
    if (lockedUntil <= Date.now()) return undefined;
    const timer = window.setInterval(() => {
      setNowTs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [lockedUntil]);

  const lockedSeconds = Math.max(0, Math.ceil((lockedUntil - nowTs) / 1000));
  const isLocked = lockedSeconds > 0;

  const handleUnlock = async () => {
    if (isLocked) return;
    setChecking(true);
    const result = await onSubmit(pin.trim());
    if (result?.ok) {
      setError("");
      setChecking(false);
      return;
    }
    setError(result?.error || "Incorrect PIN. Please try again.");
    setLockedUntil(result?.lockedUntil || 0);
    setPin("");
    setChecking(false);
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-lg border border-purple-100 p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-purple-500 mb-2">Parent Access</p>
        <h1 className="text-2xl font-black text-gray-800 mb-2">Enter parent PIN</h1>
        <p className="text-sm text-gray-500 mb-5">This area is for parent profile and settings only.</p>

        {isLocked && (
          <p className="text-sm text-amber-700 font-semibold mb-3">
            Too many attempts. Try again in {lockedSeconds}s.
          </p>
        )}

        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          disabled={isLocked}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleUnlock();
          }}
          placeholder="Enter PIN"
          className="w-full rounded-2xl border-2 border-gray-200 focus:border-purple-400 px-4 py-3 outline-none mb-3"
        />

        {error && <p className="text-sm text-red-600 font-semibold mb-3">{error}</p>}

        <button
          onClick={handleUnlock}
          disabled={!pin.trim() || checking || isLocked}
          className="w-full rounded-2xl bg-purple-500 hover:bg-purple-600 disabled:bg-purple-300 text-white font-bold py-3 transition-all active:scale-95"
        >
          {checking ? "Checking..." : isLocked ? "Locked" : "Unlock Parent Portal"}
        </button>

        <button
          onClick={onSignOut}
          disabled={checking}
          className="w-full mt-3 rounded-2xl bg-white border border-gray-200 hover:border-gray-300 disabled:border-gray-100 disabled:text-gray-400 text-gray-600 font-semibold py-3 transition-colors"
        >
          Sign out
        </button>

        <button
          onClick={onBackHome}
          disabled={checking}
          className="w-full mt-3 rounded-2xl bg-white border border-gray-200 hover:border-purple-300 disabled:border-gray-100 disabled:text-gray-400 text-purple-600 font-semibold py-3 transition-colors"
        >
          Back to Home
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

function pinGuardAttemptsKey(userId) {
  return `parent-pin-attempts:${userId}`;
}

function pinGuardLockKey(userId) {
  return `parent-pin-locked-until:${userId}`;
}

function readPinGuard(userId) {
  const rawAttempts = Number(window.sessionStorage.getItem(pinGuardAttemptsKey(userId)) || 0);
  const rawLockedUntil = Number(window.sessionStorage.getItem(pinGuardLockKey(userId)) || 0);
  const attempts = Number.isFinite(rawAttempts) ? Math.max(0, rawAttempts) : 0;
  const lockedUntil = Number.isFinite(rawLockedUntil) ? Math.max(0, rawLockedUntil) : 0;
  return { attempts, lockedUntil };
}

function writePinGuard(userId, attempts, lockedUntil) {
  window.sessionStorage.setItem(pinGuardAttemptsKey(userId), String(attempts));
  window.sessionStorage.setItem(pinGuardLockKey(userId), String(lockedUntil));
}

function clearPinGuard(userId) {
  window.sessionStorage.removeItem(pinGuardAttemptsKey(userId));
  window.sessionStorage.removeItem(pinGuardLockKey(userId));
}
