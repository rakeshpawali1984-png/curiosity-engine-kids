import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import { inferCuriositySuperpower } from "../lib/curiositySuperpowers";
import SpeedTap from "./games/SpeedTap";
import FlashFacts from "./games/FlashFacts";
import EmojiCryptogram from "./games/EmojiCryptogram";

function pickGame() {
  try {
    const last = sessionStorage.getItem("whyroo_last_game");
    let next;
    if (last === "speedtap") next = "flashfacts";
    else if (last === "flashfacts") next = "emoji";
    else next = "speedtap";
    sessionStorage.setItem("whyroo_last_game", next);
    return next;
  } catch {
    return "speedtap";
  }
}

export default function BadgeScreen({ topic, quizResult = null, onHome, ctaLabel = "Try another adventure ✨" }) {
  const [activeGame, setActiveGame] = useState(null);
  const [gameUsed, setGameUsed] = useState(false);
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

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={onHome}
          className="bg-purple-500 hover:bg-purple-600 hover:scale-[1.02] active:scale-95 text-white font-black py-4 px-8 rounded-2xl text-lg transition-all shadow-md"
        >
          {ctaLabel}
        </button>
        <button
          onClick={() => { if (!gameUsed) { setGameUsed(true); setActiveGame(pickGame()); } }}
          disabled={gameUsed}
          className={`font-bold py-3 px-5 rounded-2xl text-sm transition-all shadow-sm border-2 ${
            gameUsed
              ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
              : "bg-white hover:bg-slate-50 border-purple-200 hover:border-purple-300 text-purple-700"
          }`}
        >
          {gameUsed ? "🎮 Game played!" : "🎮 Play a Quick Game"}
        </button>
      </div>

      {activeGame === "speedtap" && (
        <SpeedTap
          topicEmoji={topic?.emoji || "🦘"}
          topicTitle={topic?.title || "this topic"}
          onClose={() => setActiveGame(null)}
        />
      )}
      {activeGame === "flashfacts" && (
        <FlashFacts
          topic={topic}
          onClose={() => setActiveGame(null)}
        />
      )}
      {activeGame === "emoji" && (
        <EmojiCryptogram
          topic={topic}
          onClose={() => setActiveGame(null)}
        />
      )}
    </div>
  );
}
