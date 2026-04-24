import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";

// Module-level dedup: Supabase fires SIGNED_IN twice during OAuth flows.
// Track which user IDs already had a welcome email queued this page session.
const _welcomeEmailSent = new Set();
import { topics } from "./data/topics";
import { topicsSparkRaw } from "./data/topics-spark.js";
import { normalizeTopicsSpark } from "./data/normalize";
import LoginScreen from "./components/LoginScreen"; // eager — first paint
const HomeScreen = lazy(() => import("./components/HomeScreen"));
const StoryScreen = lazy(() => import("./components/StoryScreen"));
const ExplanationScreen = lazy(() => import("./components/ExplanationScreen"));
const ActivityScreen = lazy(() => import("./components/ActivityScreen"));
const QuizScreen = lazy(() => import("./components/QuizScreen"));
const BadgeScreen = lazy(() => import("./components/BadgeScreen"));
const CuriousScreen = lazy(() => import("./components/CuriousScreen"));
const ChildProfilesScreen = lazy(() => import("./components/ChildProfilesScreen"));
const FamilyTopBar = lazy(() => import("./components/FamilyTopBar"));
const JourneyScreen = lazy(() => import("./components/JourneyScreen"));
import { hasSupabaseConfig, supabase } from "./lib/supabaseClient";
import { trackEvent, trackReturnNextDay } from "./lib/analytics";
import {
  awardChildBadge,
  createCheckoutSession,
  getBillingStatus,
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

function normalizePathname(pathname) {
  return pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
}

function AppLoadingFallback() {
  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100 flex items-center justify-center">
      <div className="bg-white px-6 py-4 rounded-2xl shadow-md text-gray-600 font-semibold">
        Loading...
      </div>
    </div>
  );
}

async function getAuthHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (!hasSupabaseConfig || !supabase) {
    return headers;
  }

  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [familyReady, setFamilyReady] = useState(false);
  const [children, setChildren] = useState([]);
  const [activeChildId, setActiveChildId] = useState(
    () => sessionStorage.getItem("activeChildId") || null
  );
  const [landingSubscriptionStatus, setLandingSubscriptionStatus] = useState(null);
  const [landingSubscriptionLoading, setLandingSubscriptionLoading] = useState(false);
  const [showJourney, setShowJourney] = useState(false);
  const [parentPortalUnlocked, setParentPortalUnlocked] = useState(false);
  const [parentPinIsSet, setParentPinIsSet] = useState(false);
  const [parentSecurityReady, setParentSecurityReady] = useState(false);
  const [parentPinFailedAttempts, setParentPinFailedAttempts] = useState(0);
  const [parentPinLockedUntil, setParentPinLockedUntil] = useState(0);
  const sessionUserIdRef = useRef(null);

  const [path, setPath] = useState(() => normalizePathname(window.location.pathname));
  const [search, setSearch] = useState(() => window.location.search);

  const billingStatus = new URLSearchParams(search).get("billing");
  const isLandingRoute = path === "/";
  const isAppRoute = path === "/app";
  const isParentRoute = path === "/parent";
  const isCuriousRoute = path === "/get-curious";
  const isDemoRoute = path === "/demo";
  const isPrivacyRoute = path === "/privacy";
  const isTermsRoute = path === "/terms";

  const syncRouteState = () => {
    setPath(normalizePathname(window.location.pathname));
    setSearch(window.location.search);
  };

  const navigateTo = (nextPath, { replace = false } = {}) => {
    if (replace) {
      window.history.replaceState({}, "", nextPath);
    } else {
      window.history.pushState({}, "", nextPath);
    }
    syncRouteState();
  };

  const clearBillingSearchParam = () => {
    const params = new URLSearchParams(search);
    params.delete("billing");
    const nextSearch = params.toString();
    const nextPath = nextSearch ? `${path}?${nextSearch}` : path;
    navigateTo(nextPath, { replace: true });
  };

  useEffect(() => {
    trackReturnNextDay();
  }, []);

  useEffect(() => {
    if (isLandingRoute) {
      trackEvent("landing_viewed", {
        is_authenticated: Boolean(session?.user?.id),
        has_children: children.length > 0,
        source: "landing_page",
      });
    }
  }, [isLandingRoute, session, children]);

  useEffect(() => {
    const handlePopState = () => {
      syncRouteState();
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const activeChild = useMemo(
    () => children.find((c) => c.id === activeChildId) || null,
    [children, activeChildId]
  );

  const persistActiveChildId = (id) => {
    if (id) {
      sessionStorage.setItem("activeChildId", id);
    } else {
      sessionStorage.removeItem("activeChildId");
    }
    setActiveChildId(id);
  };

  const resolveActiveChildId = (rows, prev) => {
    const storedId = sessionStorage.getItem("activeChildId");
    if (storedId && rows.some((c) => c.id === storedId)) return storedId;
    if (prev && rows.some((c) => c.id === prev)) return prev;
    return rows[0]?.id || null;
  };

  const refreshChildren = async (userId) => {
    const rows = await listChildProfiles(userId);
    setChildren(rows);
    setActiveChildId((prev) => resolveActiveChildId(rows, prev));
  };

  const syncFamilyData = async (nextSession) => {
    if (!nextSession?.user) {
      setFamilyReady(true);
      return;
    }
    try {
      await upsertParentFromSession(nextSession);
      const [security, rows] = await Promise.all([
        getParentSecurity(nextSession.user.id),
        listChildProfiles(nextSession.user.id),
      ]);
      setParentPinIsSet(Boolean(security?.parent_pin_set_at));
      setParentSecurityReady(true);
      setChildren(rows);
      setActiveChildId((prev) => resolveActiveChildId(rows, prev));
    } catch (e) {
      console.error("Failed loading parent/children:", e.message);
      setParentPinIsSet(false);
      setParentSecurityReady(true);
    } finally {
      setFamilyReady(true);
    }
  };

  useEffect(() => {
    sessionUserIdRef.current = session?.user?.id || null;
  }, [session?.user?.id]);

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

      const previousUserId = sessionUserIdRef.current;
      const nextUserId = nextSession?.user?.id || null;
      const isSameUserSession =
        Boolean(previousUserId) &&
        Boolean(nextUserId) &&
        previousUserId === nextUserId;

      // Supabase can emit SIGNED_IN/TOKEN_REFRESHED for the same user when
      // focus changes between tabs. Do not reset family state in this case.
      if (isSameUserSession) {
        setSession(nextSession);
        setAuthReady(true);
        if (_event === "USER_UPDATED") {
          syncFamilyData(nextSession);
        }
        return;
      }

      setSession(nextSession);
      setAuthReady(true);
      setFamilyReady(false);
      setParentPortalUnlocked(false);
      setParentSecurityReady(false);
      if (!nextSession?.user) {
        setChildren([]);
        persistActiveChildId(null);
        setParentPinIsSet(false);
        setFamilyReady(true);
        setParentSecurityReady(true);
        return;
      }
      // Send welcome email on first sign-up (created_at within last 60 s)
      if (_event === "SIGNED_IN") {
        const user = nextSession.user;
        const createdAt = user.created_at;
        const isNewUser = createdAt && Date.now() - new Date(createdAt).getTime() < 60_000;
        if (isNewUser && !_welcomeEmailSent.has(user.id)) {
          _welcomeEmailSent.add(user.id);
          const name =
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email?.split("@")[0] ||
            "";
          getAuthHeaders().then((headers) => fetch("/api/send-welcome-email", {
            method: "POST",
            headers,
            body: JSON.stringify({ name }),
          })).catch(() => {/* fire-and-forget — never block sign-in */});
        }
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
    let cancelled = false;

    const loadLandingSubscription = async () => {
      if (!session?.user?.id) {
        setLandingSubscriptionStatus(null);
        setLandingSubscriptionLoading(false);
        return;
      }

      setLandingSubscriptionLoading(true);
      try {
        const status = await getBillingStatus();
        if (cancelled) return;
        setLandingSubscriptionStatus(status?.subscriptionStatus || null);
      } catch {
        if (cancelled) return;
        setLandingSubscriptionStatus(null);
      } finally {
        if (!cancelled) {
          setLandingSubscriptionLoading(false);
        }
      }
    };

    loadLandingSubscription();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (session && familyReady && !activeChild && !isParentRoute && (isAppRoute || isCuriousRoute)) {
      navigateTo("/parent", { replace: true });
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
    navigateTo("/parent");
  };

  // Calls the server-side verify endpoint. Hash/salt never leave the server.
  const callVerifyPinApi = async (pinInput) => {
    const headers = await getAuthHeaders();
    const response = await fetch("/api/verify-pin", {
      method: "POST",
      headers,
      body: JSON.stringify({ pin: pinInput }),
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok && data.ok === true, ...data };
  };

  const verifyParentPin = async (pinInput) => {
    if (!session?.user?.id) {
      return { ok: false, error: "Session expired. Please sign in again." };
    }

    const result = await callVerifyPinApi(pinInput);
    if (result.ok) {
      setParentPortalUnlocked(true);
      setParentPinFailedAttempts(0);
      setParentPinLockedUntil(0);
    } else {
      if (result.attemptsLeft !== undefined) setParentPinFailedAttempts(PARENT_PIN_MAX_ATTEMPTS - result.attemptsLeft);
      if (result.lockedUntil) setParentPinLockedUntil(result.lockedUntil);
    }
    return result;
  };

  const startChildUpgradeCheckout = async (pinInput) => {
    const result = await verifyParentPin(pinInput);
    if (!result?.ok) {
      return result;
    }

    sessionStorage.setItem(BILLING_RETURN_USER_KEY, session.user.id);

    try {
      const { checkoutUrl } = await createCheckoutSession({ returnPath: "/app" });
      window.location.href = checkoutUrl;
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message || "Could not start checkout." };
    }
  };

  const startLandingUpgradeCheckout = async (pinInput) => {
    const result = await verifyParentPin(pinInput);
    if (!result?.ok) {
      return result;
    }

    sessionStorage.setItem(BILLING_RETURN_USER_KEY, session.user.id);

    try {
      const { checkoutUrl } = await createCheckoutSession({ returnPath: "/parent" });
      window.location.href = checkoutUrl;
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message || "Could not start checkout." };
    }
  };

  const createParentPin = async (pinInput) => {
    const salt = createPinSalt();
    const pinHash = await hashPin(pinInput, salt);
    await setParentPinSecurity(session.user.id, pinHash, salt);
    setParentPinIsSet(true);
    setParentPortalUnlocked(true);
  };

  const changeParentPin = async (currentPinInput, newPinInput) => {
    if (!session?.user?.id) {
      return { ok: false, error: "Session expired. Please sign in again." };
    }
    if (!parentPinIsSet) {
      return { ok: false, error: "Parent PIN is not set up yet." };
    }

    // Verify the current PIN server-side before allowing the change.
    const verifyResult = await callVerifyPinApi(currentPinInput);
    if (!verifyResult.ok) {
      return { ok: false, error: verifyResult.error || "Current PIN is incorrect." };
    }

    const nextSalt = createPinSalt();
    const nextHash = await hashPin(newPinInput, nextSalt);
    await setParentPinSecurity(session.user.id, nextHash, nextSalt);
    setParentPinFailedAttempts(0);
    setParentPinLockedUntil(0);
    return { ok: true };
  };

  let staticRouteContent = null;

  if (isDemoRoute) {
    staticRouteContent = (
      <MainApp
        activeChild={{ name: "Demo Explorer", avatar_emoji: "🧠" }}
        demoMode
        onAskGrownUp={() => {
          navigateTo("/");
        }}
        onUnlockAskAnything={() => {
          navigateTo("/app");
        }}
      />
    );
  } else if (isLandingRoute) {
    staticRouteContent = (
      <LandingPage
        isAuthenticated={Boolean(session?.user)}
        subscriptionStatus={landingSubscriptionStatus}
        subscriptionLoading={landingSubscriptionLoading}
        onStartUpgradeCheckout={startLandingUpgradeCheckout}
        onSignInForUpgrade={() => navigateTo("/app")}
        onOpenParentPortal={() => navigateTo("/parent")}
      />
    );
  } else if (isPrivacyRoute) {
    staticRouteContent = (
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
            body: "If you have questions, contact us at hello@whyroo.com.",
          },
        ]}
      />
    );
  } else if (isTermsRoute) {
    staticRouteContent = (
      <LegalScreen
        title="Terms of Use"
        updated="Last updated: April 2026"
        intro="By creating an account or using Whyroo, you agree to these Terms of Use. Please read them carefully. These terms apply to parents and guardians who register accounts on behalf of children."
        sections={[
          {
            heading: "1. Who Can Use This Service",
            body: "Whyroo is designed for children aged 4–12, under direct parental or guardian supervision. To create an account, you must:",
            items: [
              "Be at least 18 years old",
              "Have legal authority to consent on behalf of the child",
              "Ensure the child uses the app with your knowledge and oversight",
            ],
          },
          {
            heading: "2. Parent and Guardian Responsibilities",
            body: "As the account holder, you are responsible for:",
            items: [
              "All activity that occurs under your account",
              "Supervising your child's use of the app",
              "Keeping your login credentials secure",
              "Reviewing AI-generated content to ensure it meets your family's standards",
              "Contacting us immediately if you suspect unauthorised account use",
            ],
          },
          {
            heading: "3. Subscriptions and Billing",
            body: "Whyroo offers a free tier and a paid subscription plan.",
            items: [
              "Paid subscriptions are billed monthly or annually and renew automatically until cancelled",
              "You can cancel at any time from the parent portal — cancellation takes effect at the end of the current billing period",
              "Prices are displayed in Australian dollars (AUD) and include GST where applicable",
              "We reserve the right to update pricing with reasonable notice",
              "Refunds are not provided for partial billing periods, except where required by Australian Consumer Law",
            ],
          },
          {
            heading: "4. Content and Intellectual Property",
            body: "All content generated by Whyroo — including stories, explanations, and quiz questions — is produced with the assistance of AI and is provided for personal, non-commercial educational use only.",
            items: [
              "You may not reproduce, distribute, or sell content from the app without our written consent",
              "Whyroo retains ownership of the app, its design, and its underlying systems",
              "You retain no rights to AI-generated content beyond personal use",
            ],
          },
          {
            heading: "5. Acceptable Use",
            body: "You agree not to use Whyroo to:",
            items: [
              "Submit harmful, abusive, or inappropriate content",
              "Attempt to bypass safety filters or prompt the AI to produce unsafe content",
              "Reverse-engineer, scrape, or copy the app's code or systems",
              "Use the service for any commercial purpose without permission",
              "Violate any applicable laws or regulations",
            ],
          },
          {
            heading: "6. Child Safety",
            body: "We have implemented multi-layer safety measures to keep content appropriate for children. However, no system is perfect. We strongly encourage parents to:",
            items: [
              "Review conversations and generated content periodically",
              "Use the app together with your child when possible",
              "Report any content that seems inappropriate via hello@whyroo.com",
            ],
          },
          {
            heading: "7. Limitation of Liability",
            body: "To the extent permitted by law, Whyroo and its operators are not liable for any indirect, incidental, or consequential damages arising from your use of the service. We do not guarantee that the app will be error-free or uninterrupted. Nothing in these terms limits your rights under the Australian Consumer Law.",
          },
          {
            heading: "8. Changes to These Terms",
            body: "We may update these Terms of Use from time to time. When we do, we will update the date at the top of this page. Continued use of the service after changes are posted constitutes acceptance of the revised terms. For significant changes, we will notify you by email.",
          },
          {
            heading: "9. Contact",
            body: "If you have questions about these terms, please contact us at hello@whyroo.com.",
          },
        ]}
      />
    );
  }

  if (staticRouteContent) {
    return (
      <Suspense fallback={<AppLoadingFallback />}>
        {staticRouteContent}
      </Suspense>
    );
  }

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

  if (session && !familyReady) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100 flex items-center justify-center">
        <div className="bg-white px-6 py-4 rounded-2xl shadow-md text-gray-600 font-semibold">
          Loading profile...
        </div>
      </div>
    );
  }

  if (!authReady || !session) {
    return <LoginScreen />;
  }

  if (isParentRoute) {
    if (!parentSecurityReady) {
      return <ParentGateLoadingScreen />;
    }

    if (!parentPinIsSet) {
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
            navigateTo("/app");
          }}
          initialLockedUntil={parentPinLockedUntil}
        />
      );
    }

    return (
      <Suspense fallback={<AppLoadingFallback />}>
        <ChildProfilesScreen
          parent={{ id: session.user.id, email: session.user.email }}
          children={children}
          activeChildId={activeChildId}
          onSelectChild={(id) => persistActiveChildId(id)}
          onChildrenUpdated={() => refreshChildren(session.user.id)}
          onChangeParentPin={changeParentPin}
          onSignOut={handleSignOut}
          onDone={() => {
            navigateTo("/app");
          }}
        />
      </Suspense>
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
    return (
      <Suspense fallback={<AppLoadingFallback />}>
        <JourneyScreen activeChild={activeChild} onBackHome={() => setShowJourney(false)} />
      </Suspense>
    );
  }

  if (isAppRoute) {
    return (
      <Suspense fallback={<AppLoadingFallback />}>
        <CuriousScreen
          activeChild={activeChild}
          onOpenJourney={() => setShowJourney(true)}
          onOpenParentPortal={openParentPortal}
          onOpenSite={() => navigateTo("/")}
          onStartUpgradeCheckout={startChildUpgradeCheckout}
          billingFlowStatus={billingStatus}
          onDismissBillingFlow={clearBillingSearchParam}
          onRecordSearch={(query) => handleTrackSearch(query, "curious")}
          onAwardBadge={(badgeTitle, sourceSearchId) =>
            handleTrackBadge(badgeTitle, sourceSearchId)
          }
        />
      </Suspense>
    );
  }

  if (!isCuriousRoute) {
    return (
      <LandingPage
        isAuthenticated={Boolean(session?.user)}
        subscriptionStatus={landingSubscriptionStatus}
        subscriptionLoading={landingSubscriptionLoading}
        onStartUpgradeCheckout={startLandingUpgradeCheckout}
        onSignInForUpgrade={() => navigateTo("/app")}
        onOpenParentPortal={() => navigateTo("/parent")}
      />
    );
  }

  return (
    <Suspense fallback={<AppLoadingFallback />}>
      <MainApp
        activeChild={activeChild}
        onOpenJourney={() => setShowJourney(true)}
        onOpenParentPortal={openParentPortal}
        onRecordSearch={(query) => handleTrackSearch(query, "topic_card")}
        onAwardBadge={(badgeTitle, sourceSearchId) =>
          handleTrackBadge(badgeTitle, sourceSearchId)
        }
      />
    </Suspense>
  );
}

const PREVIEW_EXAMPLES = [
  {
    emoji: "🌟",
    question: "Why do stars twinkle?",
    story:
      "Imagine stars like tiny lanterns in the sky. Their light travels a very long way, and when it moves through the moving air around Earth, it wiggles a little — that's what makes stars look like they're twinkling!",
  },
  {
    emoji: "🏏",
    question: "Why does a cricket ball swing?",
    story:
      "Think of the ball like a little airplane. One side is kept shiny and smooth, the other gets rough. When a fast bowler bowls, the rough side catches more air and the ball curves through the sky — that's swing!",
  },
  {
    emoji: "🦕",
    question: "Why did dinosaurs get so big?",
    story:
      "Millions of years ago, Earth had more oxygen in the air and HUGE forests to eat! More food and easier breathing meant dinosaurs could just keep growing… and growing… and growing. Some ended up as tall as a four-storey building!",
  },
  {
    emoji: "🌊",
    question: "Why is the ocean salty?",
    story:
      "Rivers carry tiny bits of salt from rocks on land, all the way to the ocean. The ocean never drains, so the salt just keeps collecting over millions of years. If you dried out all the world's oceans, you'd have enough salt to cover every continent!",
  },
];

function LandingPage({
  isAuthenticated,
  subscriptionStatus,
  subscriptionLoading,
  onStartUpgradeCheckout,
  onSignInForUpgrade,
  onOpenParentPortal,
}) {
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradePin, setUpgradePin] = useState("");
  const [upgradeError, setUpgradeError] = useState("");
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeLockedUntil, setUpgradeLockedUntil] = useState(0);
  const [upgradeNowTs, setUpgradeNowTs] = useState(Date.now());
  const isAlreadySubscribed =
    subscriptionStatus === "active" || subscriptionStatus === "past_due";

  const handleTryNow = () => {
    window.location.href = "/app";
  };

  useEffect(() => {
    if (!upgradeLockedUntil) return;
    const timer = window.setInterval(() => {
      setUpgradeNowTs(Date.now());
    }, 250);
    return () => window.clearInterval(timer);
  }, [upgradeLockedUntil]);

  const upgradeLockedSeconds = Math.max(
    0,
    Math.ceil((upgradeLockedUntil - upgradeNowTs) / 1000)
  );
  const upgradeIsLocked = upgradeLockedSeconds > 0;

  const openUpgradeModal = () => {
    setUpgradeError("");
    setUpgradePin("");
    setUpgradeNowTs(Date.now());
    setShowUpgradeModal(true);
  };

  const closeUpgradeModal = () => {
    if (upgradeLoading) return;
    setShowUpgradeModal(false);
    setUpgradeError("");
    setUpgradePin("");
    setUpgradeNowTs(Date.now());
  };

  const handleUnlockUnlimited = () => {
    if (isAlreadySubscribed) {
      onOpenParentPortal?.();
      return;
    }
    if (!isAuthenticated) {
      onSignInForUpgrade?.();
      return;
    }
    openUpgradeModal();
  };

  const handleUpgradeCheckout = async () => {
    if (upgradeIsLocked || upgradeLoading) {
      return;
    }
    if (!upgradePin.trim()) {
      setUpgradeError("Enter your parent PIN to continue.");
      return;
    }

    setUpgradeLoading(true);
    setUpgradeError("");

    try {
      const result = await onStartUpgradeCheckout?.(upgradePin.trim());
      if (!result?.ok) {
        setUpgradeError(result?.error || "Could not verify PIN.");
        if (result?.lockedUntil) {
          setUpgradeLockedUntil(result.lockedUntil);
          setUpgradeNowTs(Date.now());
        }
        return;
      }
      setShowUpgradeModal(false);
    } catch (error) {
      setUpgradeError(error?.message || "Could not start checkout.");
    } finally {
      setUpgradeLoading(false);
    }
  };

  const goTo = (i) => {
    trackEvent("suggested_question_clicked", {
      preview_index: i,
      total_examples: PREVIEW_EXAMPLES.length,
      source: "landing_preview",
    });
    setPreviewIndex((i + PREVIEW_EXAMPLES.length) % PREVIEW_EXAMPLES.length);
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100 text-slate-800">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <section className="bg-white/90 backdrop-blur rounded-3xl shadow-sm border border-purple-100 p-6 sm:p-10 text-center mb-8 sm:mb-10">
          <div className="mb-4">
            <p className="text-4xl sm:text-5xl font-black tracking-tight leading-none text-purple-700">Whyroo</p>
            <p className="mt-2 text-sm sm:text-base font-extrabold text-purple-500">From why to wow.</p>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight text-purple-800 mb-4">
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
          <p className="mt-1 text-xs sm:text-sm text-slate-400 italic">No ads. No distractions. Just learning.</p>

          <div className="mt-7 max-w-md mx-auto text-left rounded-2xl border border-purple-100 bg-white shadow-sm p-4 sm:p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-purple-500">What kids will see</p>
              <div className="flex items-center gap-2">
                {PREVIEW_EXAMPLES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => goTo(i)}
                    className={`w-2 h-2 rounded-full transition-colors ${i === previewIndex ? "bg-purple-500" : "bg-purple-200 hover:bg-purple-300"}`}
                    aria-label={`Preview ${i + 1}`}
                  />
                ))}
              </div>
            </div>
            <p className="text-sm font-black text-slate-800 mb-2">
              {PREVIEW_EXAMPLES[previewIndex].emoji} {PREVIEW_EXAMPLES[previewIndex].question}
            </p>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">
              {PREVIEW_EXAMPLES[previewIndex].story}
            </p>
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => goTo(previewIndex + 1)}
                className="text-xs font-bold text-purple-500 hover:text-purple-700 transition-colors"
              >
                Try another example →
              </button>
              <span className="text-slate-300">|</span>
              <a
                href="/demo"
                className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
              >
                Explore demo →
              </a>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-3xl border border-purple-100 p-6 sm:p-8 mb-6">
          <h2 className="text-2xl sm:text-3xl font-black text-purple-800 mb-5">How it works</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { icon: "💬", title: "Ask a question", desc: "Type anything your child is curious about — no topic is too big or too small." },
              { icon: "📖", title: "Learn through a story", desc: "Whyroo turns the answer into a simple, age-appropriate story that sticks." },
              { icon: "🧪", title: "Try it in the real world", desc: "Spark curiosity beyond the screen with hands-on activities kids can try in the real world." },
            ].map(({ icon, title, desc }, index) => (
              <div key={title} className="rounded-2xl bg-purple-50 border border-purple-100 p-4">
                <p className="text-xs font-extrabold uppercase tracking-wider text-purple-500 mb-2">Step {index + 1}</p>
                <p className="text-2xl mb-2">{icon}</p>
                <p className="font-bold text-slate-800 mb-1">{title}</p>
                <p className="text-sm text-slate-500 leading-snug">{desc}</p>
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

        <section className="bg-white rounded-3xl border border-purple-100 p-6 sm:p-8 mb-6">
          <h2 className="text-2xl sm:text-3xl font-black text-purple-800 mb-2">Good for kids. Great for families.</h2>
          <p className="text-sm sm:text-base text-slate-500 mb-5">Some of the best parenting moments start with "I don't know."</p>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: "✨",
                title: "Answers you'll feel good about",
                desc: "No more guessing when they ask the hard questions.",
              },
              {
                icon: "💬",
                title: "Dinner just got interesting",
                desc: "Turn their questions into real conversations.",
              },
              {
                icon: "🙌",
                title: "Know what's on their mind",
                desc: "A daily summary of their curiosity, straight to your inbox.",
              },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="rounded-2xl bg-purple-50 border border-purple-100 p-4">
                <p className="text-2xl mb-3">{icon}</p>
                <p className="font-bold text-slate-800 mb-1">{title}</p>
                <p className="text-sm text-slate-500 leading-snug">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-3xl border border-purple-100 p-6 sm:p-8 mb-6">
          <h2 className="text-2xl sm:text-3xl font-black text-purple-800 mb-4">Our Story</h2>
          <h3 className="text-lg sm:text-xl font-extrabold text-slate-800 mb-3">The Spark Behind Whyroo</h3>
          <div className="space-y-3 text-slate-600 leading-relaxed">
            <p>
              It started with questions at home.
            </p>
            <p>
              My kids, Shlok and Swara, would ask "why" about everything, from cricket balls
              swinging in the air to how the world works.
            </p>
            <p>
              As a parent, I realised how hard it is to find answers that are simple, safe, and
              truly made for kids.
            </p>
            <p>
              So I built Whyroo, a place where questions turn into simple stories and real-world
              ideas kids can explore.
            </p>
            <p>
              When I saw them thinking, exploring, and asking more, not just scrolling, I knew
              this had to exist for other families too.
            </p>
          </div>
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
              <p className="font-semibold text-slate-600">One family subscription covers up to 3 child profiles</p>
              <p className="mt-3 text-2xl font-black text-purple-700">$6.99/month</p>
              <p className="mt-1 text-xs text-slate-500">About the price of a coffee each month ☕</p>
            </div>
          </div>
          <div className="flex justify-center">
            <button
              onClick={handleUnlockUnlimited}
              className="inline-flex items-center justify-center rounded-2xl bg-purple-600 hover:bg-purple-700 text-white text-base sm:text-lg font-bold px-6 py-3 transition-transform active:scale-95"
            >
              {subscriptionLoading && isAuthenticated
                ? "Checking subscription..."
                : isAlreadySubscribed
                  ? "You have already subscribed"
                  : isAuthenticated
                    ? "Unlock unlimited curiosity"
                    : "Sign in to unlock unlimited curiosity"}
            </button>
          </div>
        </section>

        <footer className="text-sm text-slate-500 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between pb-2">
          <div className="flex items-center gap-4">
            <a href="/privacy" className="hover:text-purple-700 font-semibold">Privacy Policy</a>
            <a href="/terms" className="hover:text-purple-700 font-semibold">Terms of Use</a>
          </div>
          <div className="flex flex-col sm:items-end gap-1">
            <a href="mailto:hello@whyroo.com" className="hover:text-purple-700 font-semibold">hello@whyroo.com</a>
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

      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-3xl border border-purple-100 bg-white shadow-xl p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-purple-500 mb-2">Parent Checkout</p>
                <h3 className="text-2xl font-black text-gray-800">Unlock unlimited curiosity</h3>
              </div>
              <button
                onClick={closeUpgradeModal}
                disabled={upgradeLoading}
                className="text-sm font-bold text-slate-500 hover:text-slate-700 disabled:text-slate-300"
                aria-label="Close upgrade modal"
              >
                Close
              </button>
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 mb-4">
              <p className="text-sm font-semibold text-emerald-800">Unlimited questions for up to 3 child profiles</p>
              <p className="text-xs text-emerald-700 mt-1">$6.99/month. Enter your parent PIN to continue to secure checkout.</p>
            </div>

            <input
              type="password"
              value={upgradePin}
              onChange={(e) => setUpgradePin(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleUpgradeCheckout();
              }}
              inputMode="numeric"
              maxLength={8}
              autoFocus
              disabled={upgradeLoading || upgradeIsLocked}
              className="w-full rounded-2xl border-2 border-gray-200 focus:border-purple-400 px-4 py-3 outline-none mb-3"
              placeholder="Enter parent PIN"
            />

            {upgradeIsLocked ? (
              <p className="text-sm font-semibold text-amber-700 mb-3">
                Too many attempts. Try again in {upgradeLockedSeconds}s.
              </p>
            ) : null}

            {upgradeError ? (
              <p className="text-sm text-red-600 font-semibold mb-3">{upgradeError}</p>
            ) : null}

            <button
              onClick={handleUpgradeCheckout}
              disabled={!upgradePin.trim() || upgradeLoading || upgradeIsLocked}
              className="w-full rounded-2xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white font-bold py-3 transition-all active:scale-95"
            >
              {upgradeLoading ? "Opening checkout..." : upgradeIsLocked ? "Locked" : "Continue to secure checkout"}
            </button>

            <button
              onClick={() => {
                closeUpgradeModal();
                onOpenParentPortal?.();
              }}
              disabled={upgradeLoading}
              className="w-full mt-3 rounded-2xl bg-white border border-gray-200 hover:border-gray-300 disabled:border-gray-100 disabled:text-gray-400 text-gray-600 font-semibold py-3 transition-colors"
            >
              Open parent portal instead
            </button>
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

const DEMO_ASK_MAX_CHARS = 120;
const DEMO_ASK_SESSION_KEY = "whyroo_demo_ask_session";
const DEMO_ASK_USED_KEY = "whyroo_demo_ask_used";

function getDemoSessionId() {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(DEMO_ASK_SESSION_KEY);
  if (existing) return existing;
  const created = `demo_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
  window.localStorage.setItem(DEMO_ASK_SESSION_KEY, created);
  return created;
}

function MainApp({
  activeChild,
  onOpenJourney,
  onOpenParentPortal,
  onRecordSearch,
  onAwardBadge,
  demoMode = false,
  onAskGrownUp,
  onUnlockAskAnything,
}) {
  const DEMO_LOADING_MESSAGES = [
    "Roo is already on the trail!",
    "Roo is building your story...",
    "Roo is turning clues into a clear answer...",
  ];
  const [screen, setScreen] = useState("home");
  const [currentTopic, setCurrentTopic] = useState(null);
  const [pack, setPack] = useState("original"); // "original" | "spark"
  const [currentSearchId, setCurrentSearchId] = useState(null);
  const [quizResult, setQuizResult] = useState(null);
  const [demoLoadingMessage, setDemoLoadingMessage] = useState(DEMO_LOADING_MESSAGES[0]);
  const [demoAskQuestion, setDemoAskQuestion] = useState("");
  const [demoAskLoading, setDemoAskLoading] = useState(false);
  const [demoAskError, setDemoAskError] = useState("");
  const [demoAskUsed, setDemoAskUsed] = useState(false);
  const demoLoadingTimerRef = useRef(null);

  const activePack = pack === "original" ? topics : topicsSpark;

  const toDemoTopic = (topic) => {
    if (!topic) return topic;
    const quiz = Array.isArray(topic.quiz) ? topic.quiz : [];
    const nonOpenQuiz = quiz.filter((item) => item?.type !== "open");
    const demoQuiz = (nonOpenQuiz.length >= 4 ? nonOpenQuiz : quiz).slice(0, 4);
    return {
      ...topic,
      quiz: demoQuiz,
    };
  };

  const visibleTopics = useMemo(() => {
    if (!demoMode) return activePack;
    const shuffled = [...topics].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 4);
  }, [activePack, demoMode]);

  const clearDemoLoadingTimer = () => {
    if (demoLoadingTimerRef.current) {
      window.clearTimeout(demoLoadingTimerRef.current);
      demoLoadingTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearDemoLoadingTimer();
    };
  }, []);

  useEffect(() => {
    if (!demoMode || typeof window === "undefined") return;
    setDemoAskUsed(window.localStorage.getItem(DEMO_ASK_USED_KEY) === "true");
  }, [demoMode]);

  const startDemoFlowForTopic = (topic) => {
    clearDemoLoadingTimer();
    setCurrentTopic(toDemoTopic(topic));
    setQuizResult(null);
    setDemoLoadingMessage(DEMO_LOADING_MESSAGES[0]);
    setScreen("loading");

    let stepIndex = 0;
    const runNextStep = () => {
      stepIndex += 1;
      if (stepIndex >= DEMO_LOADING_MESSAGES.length) {
        setScreen("story");
        return;
      }

      setDemoLoadingMessage(DEMO_LOADING_MESSAGES[stepIndex]);
      demoLoadingTimerRef.current = window.setTimeout(runNextStep, 650);
    };

    demoLoadingTimerRef.current = window.setTimeout(runNextStep, 700);
  };

  const selectTopic = async (topic) => {
    clearDemoLoadingTimer();
    setCurrentTopic(topic);
    setQuizResult(null);

    if (demoMode) {
      startDemoFlowForTopic(topic);
      return;
    }

    setScreen("story");
    const searchId = onRecordSearch ? await onRecordSearch(topic.title) : null;
    setCurrentSearchId(searchId);
  };

  const goHome = () => {
    clearDemoLoadingTimer();
    setScreen("home");
    setCurrentTopic(null);
    setCurrentSearchId(null);
    setQuizResult(null);
  };

  const handleDemoAsk = async () => {
    const trimmed = demoAskQuestion.trim();
    if (demoAskLoading) return;
    if (!trimmed || trimmed.length > DEMO_ASK_MAX_CHARS) {
      setDemoAskError("Ask a short question (up to 120 characters).");
      return;
    }

    setDemoAskLoading(true);
    setDemoAskError("");
    clearDemoLoadingTimer();
    setDemoLoadingMessage(DEMO_LOADING_MESSAGES[0]);
    setScreen("loading");

    try {
      const response = await fetch("/api/demo-ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          sessionId: getDemoSessionId(),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 429) {
          setDemoAskError(payload?.error || "Too many demo asks right now. Please try again shortly.");
          setDemoAskUsed(true);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(DEMO_ASK_USED_KEY, "true");
          }
          setScreen("home");
          return;
        }
        setDemoAskError(payload?.error || "Could not create this demo question right now.");
        setScreen("home");
        return;
      }

      if (!payload?.topic) {
        setDemoAskError("Could not create this demo question right now.");
        setScreen("home");
        return;
      }

      setDemoAskUsed(true);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(DEMO_ASK_USED_KEY, "true");
      }
      setDemoAskQuestion("");
      const staticTopic =
        topics.find((item) => item.id === payload.topic?.id) ||
        topics.find((item) => item.title === payload.topic?.title) ||
        topics[Math.floor(Math.random() * topics.length)];
      startDemoFlowForTopic(staticTopic);
    } catch {
      setDemoAskError("Could not create this demo question right now.");
      setScreen("home");
    } finally {
      setDemoAskLoading(false);
    }
  };

  const buildMasteryBadgeTitle = (topic) => `${topic?.title || "Adventure"} Mastery ⭐`;

  const handleQuizComplete = async (result) => {
    setQuizResult(result || null);
    setScreen("badge");
    if (onAwardBadge) {
      // Completion badge is always awarded.
      await onAwardBadge(currentTopic?.badge, currentSearchId);
      // Mastery badge is only awarded on strong accuracy.
      if (result?.masteryAchieved) {
        await onAwardBadge(buildMasteryBadgeTitle(currentTopic), currentSearchId);
      }
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

        {demoMode && screen === "home" && (
          <div className="bg-white/90 backdrop-blur rounded-2xl border border-purple-100 px-3 py-3 mb-4">
            <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => {
                onAskGrownUp?.();
              }}
              className="text-xs font-bold text-purple-600 hover:text-purple-700 transition-colors"
            >
              ← Back to Home
            </button>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Demo mode</p>
            </div>
          </div>
        )}

        <div key={screen} className="screen-enter">
          {screen === "home" && (
            <HomeScreen
              topics={visibleTopics}
              pack={pack}
              onPackChange={setPack}
              onSelect={selectTopic}
              onBrandClick={demoMode ? () => onAskGrownUp?.() : undefined}
              demoMode={demoMode}
              onAskGrownUp={onAskGrownUp}
              onUnlockAskAnything={onUnlockAskAnything}
              demoAskQuestion={demoAskQuestion}
              onDemoAskQuestionChange={setDemoAskQuestion}
              onDemoAsk={handleDemoAsk}
              demoAskLoading={demoAskLoading}
              demoAskError={demoAskError}
              demoAskUsed={demoAskUsed}
              demoAskMaxChars={DEMO_ASK_MAX_CHARS}
            />
          )}

          {screen === "loading" && (
            <div>
              <div className="text-center mb-6 mt-4">
                <p className="text-4xl font-black text-purple-700 mb-1 tracking-tight">🦘 Whyroo</p>
                <p className="text-gray-500 text-lg">Ask anything and turn why into wow.</p>
              </div>

              <div className="bg-white rounded-3xl shadow-lg border border-purple-100 p-8 text-center">
                <div className="w-12 h-12 mx-auto mb-2 flex items-center justify-center text-4xl leading-none">
                  <span>✨</span>
                </div>
                <p className="text-xs text-purple-400 font-bold uppercase tracking-wider mb-1">
                  Building answer
                </p>
                <div className="w-6 h-6 mx-auto flex items-center justify-center leading-none mb-3">
                  <span className="inline-block animate-bounce">🦘</span>
                </div>
                <p className="text-purple-700 font-black text-xl leading-snug min-h-[3.5rem]">
                  {demoLoadingMessage}
                </p>
              </div>
            </div>
          )}

          {screen === "story" && (
            <StoryScreen
              topic={currentTopic}
              onNext={() => setScreen("explanation")}
              onHome={goHome}
              homeLabel={demoMode ? "Back to topics" : "Home"}
            />
          )}

          {screen === "explanation" && (
            <ExplanationScreen
              topic={currentTopic}
              onNext={() => setScreen("activity")}
              onHome={goHome}
              homeLabel={demoMode ? "Back to topics" : "Home"}
            />
          )}

          {screen === "activity" && (
            <ActivityScreen
              topic={currentTopic}
              onNext={() => setScreen("quiz")}
              onHome={goHome}
              homeLabel={demoMode ? "Back to topics" : "Home"}
            />
          )}

          {screen === "quiz" && (
            <QuizScreen
              key={currentTopic.id}
              topic={currentTopic}
              onHome={goHome}
              homeLabel={demoMode ? "Back to topics" : "Home"}
              onComplete={handleQuizComplete}
            />
          )}

          {screen === "badge" && (
            <BadgeScreen
              topic={currentTopic}
              quizResult={quizResult}
              onHome={goHome}
              demoMode={demoMode}
              ctaLabel={demoMode ? "Back to demo mode" : "Try another adventure ✨"}
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
