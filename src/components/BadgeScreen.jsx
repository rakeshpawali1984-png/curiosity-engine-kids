import { useEffect } from "react";
import confetti from "canvas-confetti";
import { inferCuriositySuperpower } from "../lib/curiositySuperpowers";

export default function BadgeScreen({ topic, quizResult = null, onHome, ctaLabel = "Try another adventure ✨" }) {
  const superpower = inferCuriositySuperpower(
    [topic?.title, topic?.story, topic?.explanation, topic?.badge].filter(Boolean).join(" ")
  );
  const topicBadge = topic?.badge || "Whyroo Explorer 🦘";

  useEffect(() => {
    confetti({
      particleCount: 160,
      spread: 80,
      origin: { y: 0.55 },
      colors: ["#a855f7", "#f59e0b", "#3b82f6", "#10b981", "#f43f5e"],
    });
  }, []);
  return (
    <div className="flex flex-col items-center justify-center min-h-[75vh] text-center px-2">
      <div className="text-8xl mb-4 animate-bounce">{superpower.emoji}</div>

      <p className="text-xs text-yellow-600 font-bold uppercase tracking-widest mb-1">
        You earned
      </p>
      <h1 className="text-3xl font-black text-purple-700 mb-1">
        {topicBadge}
      </h1>
      <p className="text-gray-500 text-lg mb-2 max-w-xs">
        You finished this adventure and earned a topic badge.
      </p>
      <p className="text-gray-400 text-sm mb-5 max-w-xs">
        In <span className="font-bold text-gray-500">{topic.title}</span>, your learning style was <span className="font-bold text-gray-500">{superpower.name}</span>.
      </p>

      <div className="animate-pop-in bg-gradient-to-r from-sky-500 to-emerald-500 text-white px-8 py-5 rounded-3xl shadow-xl mb-3">
        <p className="text-xs font-bold uppercase tracking-widest mb-1 opacity-80">
          Today&apos;s learning superpower
        </p>
        <p className="text-2xl font-black">{superpower.emoji} {superpower.name}</p>
      </div>

      {quizResult?.gradedCount > 0 && (
        <div
          className={`mb-4 rounded-2xl px-4 py-3 text-sm font-bold ${
            quizResult.masteryAchieved
              ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
              : "bg-amber-50 border border-amber-200 text-amber-700"
          }`}
        >
          {quizResult.masteryAchieved
            ? `Mastery unlocked: ${quizResult.correctCount}/${quizResult.gradedCount} correct 🎯`
            : `Great effort: ${quizResult.correctCount}/${quizResult.gradedCount} correct. Try again for mastery ⭐`}
        </div>
      )}

      <p className="text-gray-400 text-sm mb-10 max-w-xs">
        {superpower.summary}
      </p>

      <button
        onClick={onHome}
        className="bg-purple-500 hover:bg-purple-600 hover:scale-105 active:scale-95 text-white font-black py-6 px-10 rounded-2xl text-xl transition-all shadow-md"
      >
        {ctaLabel}
      </button>
    </div>
  );
}
