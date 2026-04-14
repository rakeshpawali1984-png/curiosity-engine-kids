import { useEffect, useState } from "react";
import { listChildSearchHistory } from "../lib/familyData";
import { summarizeCuriositySuperpowers } from "../lib/curiositySuperpowers";

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
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!activeChild?.id) return;
      setLoading(true);
      try {
        const historyRows = await listChildSearchHistory(activeChild.id);
        if (!cancelled) {
          setHistory(historyRows);
        }
      } catch (e) {
        if (!cancelled) {
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

  const recentHistory = history.slice(0, 5);
  const superpowerSummary = summarizeCuriositySuperpowers(history);
  const superpowers = superpowerSummary.ranked.slice(0, 2);
  const dominantPower = superpowerSummary.dominant;

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
            My Whyroo Journey
          </p>
          <h1 className="text-3xl font-black text-gray-800 mb-2">
            {activeChild?.avatar_emoji || "🧠"} {activeChild?.name}&apos;s Journey
          </h1>
          <p className="text-gray-500 text-sm mb-5">
            Look at all the amazing things you&apos;ve explored.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-purple-50 border border-purple-200 px-4 py-4">
              <p className="text-xs font-bold uppercase tracking-wide text-purple-500 mb-1">Top Superpower</p>
              <p className="text-lg font-black text-purple-700 leading-tight">
                {dominantPower.emoji} {dominantPower.name}
              </p>
            </div>
            <div className="rounded-2xl bg-blue-50 border border-blue-200 px-4 py-4">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-500 mb-1">Adventures</p>
              <p className="text-3xl font-black text-blue-700">{history.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-lg p-6 border border-yellow-100 mb-5">
          <p className="text-xs font-bold uppercase tracking-widest text-yellow-600 mb-3">
            Whyroo Superpowers
          </p>

          {loading ? (
            <p className="text-sm text-gray-500">Loading superpowers...</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-gray-500">Finish an adventure to discover the first superpower.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {superpowers.map((power) => (
                <div
                  key={power.key}
                  className="rounded-2xl bg-gradient-to-br from-yellow-100 to-orange-100 border border-yellow-200 px-4 py-4"
                >
                  <p className="text-base font-black text-gray-800 leading-snug">
                    {power.emoji} {power.name}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">{power.journeyText}</p>
                  <p className="text-xs text-gray-500 mt-2">Seen in {power.count} adventure{power.count === 1 ? "" : "s"}</p>
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
          ) : recentHistory.length === 0 ? (
            <p className="text-sm text-gray-500">Explore something new to start your journey.</p>
          ) : (
            <div className="space-y-3">
              {recentHistory.map((entry) => (
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