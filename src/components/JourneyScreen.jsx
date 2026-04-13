import { useEffect, useState } from "react";
import { listChildBadges, listChildSearchHistory } from "../lib/familyData";

function formatFriendlyDate(value) {
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return "Today";

  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

  return date.toLocaleDateString();
}

export default function JourneyScreen({ activeChild, onBackHome }) {
  const [badges, setBadges] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!activeChild?.id) return;
      setLoading(true);
      try {
        const [badgeRows, historyRows] = await Promise.all([
          listChildBadges(activeChild.id),
          listChildSearchHistory(activeChild.id),
        ]);
        if (!cancelled) {
          setBadges(badgeRows);
          setHistory(historyRows.slice(0, 5));
        }
      } catch (e) {
        if (!cancelled) {
          setBadges([]);
          setHistory([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [activeChild?.id]);

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100">
      <div className="max-w-lg mx-auto min-h-[100dvh] px-4 pt-4 pb-8">
        <button
          onClick={onBackHome}
          className="mb-3 flex items-center gap-1 text-gray-400 hover:text-purple-600 font-semibold text-base transition-colors"
        >
          ← Back to Home
        </button>

        <div className="bg-white rounded-3xl shadow-lg p-6 border border-purple-100 mb-5">
          <p className="text-xs font-bold uppercase tracking-widest text-purple-500 mb-2">
            My Journey
          </p>
          <h1 className="text-3xl font-black text-gray-800 mb-2">
            {activeChild?.avatar_emoji || "🧠"} {activeChild?.name}&apos;s Journey
          </h1>
          <p className="text-gray-500 text-sm mb-5">
            Look at all the amazing things you&apos;ve explored.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-purple-50 border border-purple-200 px-4 py-4">
              <p className="text-xs font-bold uppercase tracking-wide text-purple-500 mb-1">Badges</p>
              <p className="text-3xl font-black text-purple-700">{badges.length}</p>
            </div>
            <div className="rounded-2xl bg-blue-50 border border-blue-200 px-4 py-4">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-500 mb-1">Discoveries</p>
              <p className="text-3xl font-black text-blue-700">{history.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-lg p-6 border border-yellow-100 mb-5">
          <p className="text-xs font-bold uppercase tracking-widest text-yellow-600 mb-3">
            My Badges
          </p>

          {loading ? (
            <p className="text-sm text-gray-500">Loading badges...</p>
          ) : badges.length === 0 ? (
            <p className="text-sm text-gray-500">Finish an adventure to earn your first badge.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {badges.map((badge) => (
                <div
                  key={badge.id}
                  className="rounded-2xl bg-gradient-to-br from-yellow-100 to-orange-100 border border-yellow-200 px-3 py-4 text-center"
                >
                  <div className="text-3xl mb-2">🏅</div>
                  <p className="text-sm font-bold text-gray-800 leading-snug">{badge.badge_title}</p>
                  <p className="text-xs text-gray-500 mt-1">Earned {formatFriendlyDate(badge.awarded_at)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-3xl shadow-lg p-6 border border-green-100 mb-6">
          <p className="text-xs font-bold uppercase tracking-widest text-green-600 mb-3">
            Recent Adventures
          </p>

          {loading ? (
            <p className="text-sm text-gray-500">Loading adventures...</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-gray-500">Explore something new to start your journey.</p>
          ) : (
            <div className="space-y-3">
              {history.map((entry) => (
                <div key={entry.id} className="rounded-2xl bg-green-50 border border-green-100 px-4 py-3">
                  <p className="text-sm font-semibold text-gray-800 leading-snug">{entry.query_text}</p>
                  <p className="text-xs text-green-700 mt-1">Explored {formatFriendlyDate(entry.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={onBackHome}
          className="w-full rounded-2xl bg-purple-500 hover:bg-purple-600 text-white font-black py-4 transition-all active:scale-95"
        >
          Explore Something New ✨
        </button>
      </div>
    </div>
  );
}