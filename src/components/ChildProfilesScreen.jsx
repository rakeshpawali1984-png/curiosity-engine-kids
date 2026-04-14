import { useEffect, useMemo, useState } from "react";
import {
  createCheckoutSession,
  createCustomerPortalSession,
  createChildProfile,
  deleteChildHistory,
  deleteChildProfile,
  getBillingStatus,
  listChildBadges,
  listChildSearchHistory,
} from "../lib/familyData";
import { summarizeCuriositySuperpowers } from "../lib/curiositySuperpowers";

const AVATARS = ["🦊", "🐼", "🦄", "🧠", "🚀", "🌈", "🐙", "🦕"];
const BILLING_RETURN_USER_KEY = "ce_billing_return_user";

export default function ChildProfilesScreen({
  parent,
  children,
  activeChildId,
  onSelectChild,
  onChildrenUpdated,
  onChangeParentPin,
  onSignOut,
  onDone,
}) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("🧠");
  const [ageRange, setAgeRange] = useState("6-8");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("badges");
  const [badges, setBadges] = useState([]);
  const [history, setHistory] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [runningAction, setRunningAction] = useState(false);
  const [expandProfiles, setExpandProfiles] = useState(true);
  const [expandSelected, setExpandSelected] = useState(true);
  const [expandAdd, setExpandAdd] = useState(children.length === 0);
  const [expandSecurity, setExpandSecurity] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [nextPin, setNextPin] = useState("");
  const [confirmNextPin, setConfirmNextPin] = useState("");
  const [updatingPin, setUpdatingPin] = useState(false);
  const [pinMessage, setPinMessage] = useState("");
  const [pinError, setPinError] = useState("");
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingActionLoading, setBillingActionLoading] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [billingStatus, setBillingStatus] = useState(null);
  const canCreate = children.length < 3;

  const activeChild = useMemo(
    () => children.find((c) => c.id === activeChildId) || null,
    [children, activeChildId]
  );

  const handleCreate = async () => {
    if (!canCreate || !name.trim()) return;
    setSaving(true);
    try {
      await createChildProfile(parent.id, {
        name: name.trim(),
        avatar_emoji: avatar,
        age_range: ageRange,
      });
      setName("");
      setExpandAdd(false);
      await onChildrenUpdated();
    } catch (e) {
      alert(e.message || "Could not create profile");
    } finally {
      setSaving(false);
    }
  };

  const refreshChildData = async () => {
    if (!activeChild) return;
    setLoadingData(true);
    try {
      const [badgeRows, historyRows] = await Promise.all([
        listChildBadges(activeChild.id),
        listChildSearchHistory(activeChild.id),
      ]);
      setBadges(badgeRows);
      setHistory(historyRows);
    } catch (e) {
      alert(e.message || "Could not load child data");
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (!activeChild) {
      setBadges([]);
      setHistory([]);
      return;
    }
    setExpandProfiles(false);
    setExpandSelected(true);
    refreshChildData();
  }, [activeChildId]);

  const handleDeleteHistory = async () => {
    if (!activeChild || runningAction) return;
    const ok = window.confirm(
      `Delete all search history for ${activeChild.name}? Badges will be kept.`
    );
    if (!ok) return;
    setRunningAction(true);
    try {
      await deleteChildHistory(activeChild.id);
      await refreshChildData();
    } catch (e) {
      alert(e.message || "Could not delete history");
    } finally {
      setRunningAction(false);
    }
  };

  const handleDeleteChildProfile = async () => {
    if (!activeChild || runningAction) return;
    const phrase = `${activeChild.name}`;
    const typed = window.prompt(
      `Type ${phrase} to permanently delete this child profile, including badges and search history.`
    );
    if (typed !== phrase) return;
    setRunningAction(true);
    try {
      await deleteChildProfile(activeChild.id);
      await onChildrenUpdated();
    } catch (e) {
      alert(e.message || "Could not delete child profile");
    } finally {
      setRunningAction(false);
    }
  };

  const handleChangePin = async () => {
    if (!onChangeParentPin || updatingPin) return;

    const nextPinTrimmed = nextPin.trim();
    const confirmTrimmed = confirmNextPin.trim();
    if (!/^\d{4,8}$/.test(nextPinTrimmed)) {
      setPinError("New PIN must be 4 to 8 digits.");
      setPinMessage("");
      return;
    }
    if (nextPinTrimmed !== confirmTrimmed) {
      setPinError("New PIN and confirm PIN do not match.");
      setPinMessage("");
      return;
    }

    setPinError("");
    setPinMessage("");
    setUpdatingPin(true);
    try {
      const result = await onChangeParentPin(currentPin.trim(), nextPinTrimmed);
      if (!result?.ok) {
        setPinError(result?.error || "Could not change PIN.");
        return;
      }
      setCurrentPin("");
      setNextPin("");
      setConfirmNextPin("");
      setPinError("");
      setPinMessage("Parent PIN updated successfully.");
    } catch (e) {
      setPinError(e.message || "Could not change PIN.");
      setPinMessage("");
    } finally {
      setUpdatingPin(false);
    }
  };

  const refreshBillingStatus = async () => {
    setBillingLoading(true);
    setBillingError("");
    try {
      const status = await getBillingStatus();
      setBillingStatus(status);
    } catch (e) {
      setBillingError(e.message || "Could not load billing status");
    } finally {
      setBillingLoading(false);
    }
  };

  const handleUpgrade = async () => {
    setBillingActionLoading(true);
    setBillingError("");
    try {
      sessionStorage.setItem(BILLING_RETURN_USER_KEY, parent.id);
      const { checkoutUrl } = await createCheckoutSession();
      window.location.href = checkoutUrl;
    } catch (e) {
      setBillingError(e.message || "Could not start checkout");
      setBillingActionLoading(false);
    }
  };

  const handleManageBilling = async () => {
    setBillingActionLoading(true);
    setBillingError("");
    try {
      const { portalUrl } = await createCustomerPortalSession();
      window.location.href = portalUrl;
    } catch (e) {
      setBillingError(e.message || "Could not open billing portal");
      setBillingActionLoading(false);
    }
  };

  useEffect(() => {
    refreshBillingStatus();
  }, []);

  const isPaidPlan = billingStatus?.subscriptionStatus === "active";
  const usedToday = Number(billingStatus?.usedToday || 0);
  const dailyLimit = Number(billingStatus?.dailyLimit || 5);
  const billingFlowStatus = new URLSearchParams(window.location.search).get("billing");
  const superpowerSummary = summarizeCuriositySuperpowers(history);
  const dominantPower = superpowerSummary.dominant;

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100">
      <div className="max-w-lg mx-auto min-h-[100dvh] px-4 py-6">
        <div className="mb-3 flex items-center justify-between">
          {activeChild && onDone ? (
            <button
              onClick={onDone}
              className="flex items-center gap-1 text-gray-400 hover:text-purple-600 font-semibold text-base transition-colors"
            >
              ← Back to Home
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={onSignOut}
            className="text-xs font-semibold text-gray-400 hover:text-purple-600 transition-colors"
          >
            Sign out
          </button>
        </div>

        {billingFlowStatus === "success" && (
          <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3">
            <p className="text-sm font-semibold text-green-700">
              Payment successful. Your subscription status will refresh in a few seconds.
            </p>
          </div>
        )}

        <div className="bg-white rounded-3xl shadow-lg p-6 border border-purple-100 mb-5">
          <button
            onClick={() => setExpandProfiles((v) => !v)}
            className="w-full flex items-center justify-between text-left"
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-purple-500 mb-1">
                Family Profiles
              </p>
              <h1 className="text-2xl font-black text-gray-800">Manage children</h1>
              <p className="text-gray-500 text-sm mt-1">Signed in as {parent.email}</p>
            </div>
            <span className="text-purple-500 font-bold text-xl">{expandProfiles ? "−" : "+"}</span>
          </button>

          {expandProfiles && (
            children.length === 0 ? (
              <p className="mt-4 text-sm text-amber-600 font-semibold">
                Create the first child profile to continue.
              </p>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-2">
                {children.map((child) => {
                  const selected = child.id === activeChildId;
                  return (
                    <button
                      key={child.id}
                      onClick={() => onSelectChild(child.id)}
                      className={`w-full rounded-2xl border-2 px-4 py-3 text-left transition-all ${
                        selected
                          ? "border-purple-400 bg-purple-50"
                          : "border-gray-200 hover:border-purple-300 bg-white"
                      }`}
                    >
                      <p className="font-bold text-gray-800">
                        {child.avatar_emoji || "🧠"} {child.name}
                      </p>
                      <p className="text-xs text-gray-500">Age range: {child.age_range || "6-8"}</p>
                    </button>
                  );
                })}
              </div>
            )
          )}
        </div>

        {activeChild && (
          <div className="bg-white rounded-3xl shadow-lg p-6 border border-blue-100 mb-5">
            <button
              onClick={() => setExpandSelected((v) => !v)}
              className="w-full flex items-center justify-between"
            >
              <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
                Selected Child: {activeChild.avatar_emoji || "🧠"} {activeChild.name}
              </p>
              <span className="text-blue-500 font-bold text-xl">{expandSelected ? "−" : "+"}</span>
            </button>

            {expandSelected && (
              <>
                <div className="flex justify-end mb-3 mt-2">
                  <button
                    onClick={refreshChildData}
                    disabled={loadingData}
                    className="text-xs font-semibold text-blue-500 hover:text-blue-700 disabled:text-blue-300"
                  >
                    {loadingData ? "Refreshing..." : "Refresh"}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  <button
                    onClick={() => setTab("badges")}
                    className={`rounded-xl px-3 py-2 text-sm font-semibold border ${
                      tab === "badges"
                        ? "bg-purple-50 border-purple-300 text-purple-700"
                        : "bg-white border-gray-200 text-gray-500"
                    }`}
                  >
                    Badges ({badges.length})
                  </button>
                  <button
                    onClick={() => setTab("history")}
                    className={`rounded-xl px-3 py-2 text-sm font-semibold border ${
                      tab === "history"
                        ? "bg-blue-50 border-blue-300 text-blue-700"
                        : "bg-white border-gray-200 text-gray-500"
                    }`}
                  >
                    History ({history.length})
                  </button>
                </div>

                {history.length > 0 && (
                  <div className="mb-4 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-indigo-600 mb-2">
                      Parent Insight
                    </p>
                    <p className="text-sm font-semibold text-gray-700">
                      Strongest style right now: {dominantPower.emoji} {dominantPower.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Next nudge: {dominantPower.parentTip}
                    </p>
                  </div>
                )}

                {tab === "badges" && (
                  <div className="space-y-2 max-h-56 overflow-auto pr-1">
                    {badges.length === 0 ? (
                      <p className="text-sm text-gray-500">No badges yet for this child.</p>
                    ) : (
                      badges.map((b) => (
                        <div key={b.id} className="rounded-xl border border-purple-100 bg-purple-50 px-3 py-2">
                          <p className="text-sm font-semibold text-purple-800">{b.badge_title}</p>
                          <p className="text-xs text-purple-500">
                            {new Date(b.awarded_at).toLocaleString()}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {tab === "history" && (
                  <div className="space-y-2 max-h-56 overflow-auto pr-1">
                    {history.length === 0 ? (
                      <p className="text-sm text-gray-500">No searches yet for this child.</p>
                    ) : (
                      history.map((row) => (
                        <div key={row.id} className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
                          <p className="text-sm font-semibold text-blue-800">{row.query_text}</p>
                          <p className="text-xs text-blue-500">
                            {row.search_type} · {new Date(row.created_at).toLocaleString()}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                )}

                <div className="mt-5 pt-4 border-t border-red-100">
                  <p className="text-xs font-bold uppercase tracking-widest text-red-500 mb-2">
                    Privacy Controls
                  </p>
                  <div className="space-y-3">
                    <button
                      onClick={handleDeleteHistory}
                      disabled={runningAction}
                      className="w-full rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 font-semibold py-3 transition-colors disabled:opacity-60"
                    >
                      Delete Search History (keep badges)
                    </button>

                    <button
                      onClick={handleDeleteChildProfile}
                      disabled={runningAction}
                      className="w-full rounded-2xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-semibold py-3 transition-colors disabled:opacity-60"
                    >
                      Permanently Delete Child Profile
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div className="bg-white rounded-3xl shadow-lg p-6 border border-green-100 mb-5">
          <button
            onClick={() => setExpandAdd((v) => !v)}
            className="w-full flex items-center justify-between"
          >
            <div className="text-left">
              <p className="text-xs font-bold uppercase tracking-widest text-green-600 mb-2">
                Add Child Profile
              </p>
              <p className="text-sm text-gray-500">
                You can create up to 3 child profiles. ({children.length}/3 used)
              </p>
            </div>
            <span className="text-green-600 font-bold text-xl">{expandAdd ? "−" : "+"}</span>
          </button>

          {expandAdd && (
            <div className="mt-4">
              {!canCreate ? (
                <div className="rounded-2xl bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-700 font-semibold">
                  Max 3 profiles reached.
                </div>
              ) : (
                <>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Child name"
                    className="w-full rounded-2xl border-2 border-gray-200 focus:border-purple-400 px-4 py-3 outline-none mb-3"
                  />

                  <div className="flex flex-wrap gap-2 mb-3">
                    {AVATARS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => setAvatar(emoji)}
                        className={`w-10 h-10 rounded-xl border-2 text-xl ${
                          avatar === emoji
                            ? "border-purple-400 bg-purple-50"
                            : "border-gray-200 bg-white"
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>

                  <select
                    value={ageRange}
                    onChange={(e) => setAgeRange(e.target.value)}
                    className="w-full rounded-2xl border-2 border-gray-200 focus:border-purple-400 px-4 py-3 outline-none mb-3 bg-white"
                  >
                    <option value="4-5">4-5</option>
                    <option value="6-8">6-8</option>
                    <option value="9-12">9-12</option>
                  </select>

                  <button
                    onClick={handleCreate}
                    disabled={saving || !name.trim()}
                    className="w-full rounded-2xl bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white font-bold py-3 transition-all active:scale-95"
                  >
                    {saving ? "Creating..." : "Create child profile"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {onChangeParentPin && (
          <div className="bg-white rounded-3xl shadow-lg p-6 border border-indigo-100 mb-5">
            <button
              onClick={() => setExpandSecurity((v) => !v)}
              className="w-full flex items-center justify-between"
            >
              <div className="text-left">
                <p className="text-xs font-bold uppercase tracking-widest text-indigo-600 mb-2">
                  Parent Security
                </p>
                <p className="text-sm text-gray-500">Change your parent PIN</p>
              </div>
              <span className="text-indigo-600 font-bold text-xl">{expandSecurity ? "−" : "+"}</span>
            </button>

            {expandSecurity && (
              <div className="mt-4">
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value)}
                  placeholder="Current PIN"
                  className="w-full rounded-2xl border-2 border-gray-200 focus:border-indigo-400 px-4 py-3 outline-none mb-3"
                />

                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={nextPin}
                  onChange={(e) => setNextPin(e.target.value)}
                  placeholder="New PIN (4-8 digits)"
                  className="w-full rounded-2xl border-2 border-gray-200 focus:border-indigo-400 px-4 py-3 outline-none mb-3"
                />

                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={confirmNextPin}
                  onChange={(e) => setConfirmNextPin(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleChangePin();
                  }}
                  placeholder="Confirm new PIN"
                  className="w-full rounded-2xl border-2 border-gray-200 focus:border-indigo-400 px-4 py-3 outline-none mb-3"
                />

                {pinError && (
                  <p className="text-sm text-red-600 font-semibold mb-3">{pinError}</p>
                )}
                {pinMessage && (
                  <p className="text-sm text-green-700 font-semibold mb-3">{pinMessage}</p>
                )}

                <button
                  onClick={handleChangePin}
                  disabled={updatingPin || !currentPin.trim() || !nextPin.trim() || !confirmNextPin.trim()}
                  className="w-full rounded-2xl bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-300 text-white font-bold py-3 transition-all active:scale-95"
                >
                  {updatingPin ? "Updating..." : "Change PIN"}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-3xl shadow-lg p-6 border border-emerald-100 mb-5">
          <div className="flex items-center justify-between">
            <div className="text-left">
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 mb-2">
                Subscription
              </p>
              <p className="text-sm text-gray-500">
                {isPaidPlan
                  ? "Whyroo Unlimited is active"
                  : "Free plan: 5 questions per day"}
              </p>
            </div>
            <button
              onClick={refreshBillingStatus}
              disabled={billingLoading || billingActionLoading}
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 disabled:text-emerald-300"
            >
              {billingLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <p className="text-sm text-emerald-800 font-semibold mb-2">
              Plan: {isPaidPlan ? "Unlimited ($6.99/month)" : "Free"}
            </p>
            {!isPaidPlan && (
              <p className="text-sm text-emerald-700">
                Usage today: {usedToday}/{dailyLimit} questions
              </p>
            )}
            {isPaidPlan && billingStatus?.currentPeriodEnd && (
              <p className="text-sm text-emerald-700">
                Current period ends: {new Date(billingStatus.currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
          </div>

          {billingError && (
            <p className="mt-3 text-sm text-red-600 font-semibold">{billingError}</p>
          )}

          <div className="mt-4">
            {isPaidPlan ? (
              <button
                onClick={handleManageBilling}
                disabled={billingActionLoading}
                className="w-full rounded-2xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white font-bold py-3 transition-all active:scale-95"
              >
                {billingActionLoading ? "Opening..." : "Manage Billing"}
              </button>
            ) : (
              <button
                onClick={handleUpgrade}
                disabled={billingActionLoading}
                className="w-full rounded-2xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white font-bold py-3 transition-all active:scale-95"
              >
                {billingActionLoading ? "Starting checkout..." : "Unlock Whyroo Unlimited — $6.99/month"}
              </button>
            )}
          </div>
        </div>

        {activeChild && onDone && (
          <button
            onClick={onDone}
            className="w-full rounded-2xl bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 transition-all active:scale-95"
          >
            Go to Home as {activeChild.name}
          </button>
        )}
      </div>
    </div>
  );
}
