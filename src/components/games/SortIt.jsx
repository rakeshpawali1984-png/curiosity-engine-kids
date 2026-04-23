import { useState } from "react";
import GameShell from "./GameShell";

const THEMES = [
  {
    bucketA: { label: "🌊 Ocean", items: ["🐠", "🦈", "🐙", "🦀", "🐚", "🐬", "🦑", "🐳", "🐡", "🦞"] },
    bucketB: { label: "🚀 Space", items: ["⭐", "🌙", "🪐", "☄️", "🛸", "👨‍🚀", "🌟", "🔭", "💫", "🌌"] },
  },
  {
    bucketA: { label: "🌿 Living", items: ["🐕", "🌸", "🦋", "🐸", "🌲", "🐦", "🦁", "🐟", "🌺", "🐘"] },
    bucketB: { label: "⚡ Forces", items: ["🔥", "❄️", "⚡", "💧", "☁️", "☀️", "🌊", "🌬️", "🌋", "🪨"] },
  },
  {
    bucketA: { label: "🌍 Earth", items: ["🏔️", "🌲", "🌊", "🏜️", "🌺", "🌿", "🦁", "🐘", "🌋", "🏝️"] },
    bucketB: { label: "🚀 Space", items: ["🌙", "⭐", "🪐", "☄️", "🌟", "💫", "🛸", "🔭", "🌌", "👨‍🚀"] },
  },
];

const ROUNDS = 10;

function buildRounds(theme) {
  const all = [
    ...theme.bucketA.items.map((e) => ({ emoji: e, bucket: "A" })),
    ...theme.bucketB.items.map((e) => ({ emoji: e, bucket: "B" })),
  ];
  return all.sort(() => Math.random() - 0.5).slice(0, ROUNDS);
}

export default function SortIt({ onClose }) {
  const [phase, setPhase] = useState("idle");
  const [theme] = useState(() => THEMES[Math.floor(Math.random() * THEMES.length)]);
  const [rounds, setRounds] = useState([]);
  const [current, setCurrent] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState(null); // "correct" | "wrong"

  const handleStart = () => {
    setRounds(buildRounds(theme));
    setCurrent(0);
    setScore(0);
    setFeedback(null);
    setPhase("playing");
  };

  const handleSort = (bucket) => {
    if (phase !== "playing" || feedback) return;
    const correct = rounds[current].bucket === bucket;
    if (correct) setScore((s) => s + 1);
    setFeedback(correct ? "correct" : "wrong");
    setTimeout(() => {
      setFeedback(null);
      const next = current + 1;
      if (next >= ROUNDS) setPhase("done");
      else setCurrent(next);
    }, 700);
  };

  const item = rounds[current];

  return (
    <GameShell title="Sort It!" emoji="🗂️" onClose={onClose}>
      <div className="p-5 min-h-[280px] flex flex-col items-center justify-center">

        {phase === "idle" && (
          <div className="text-center space-y-4">
            <p className="text-5xl">🗂️</p>
            <p className="text-base font-bold text-slate-700">Sort each thing into the right group!</p>
            <div className="flex gap-2 justify-center text-sm font-bold text-slate-500">
              <span className="bg-sky-100 text-sky-700 px-3 py-1 rounded-full">{theme.bucketA.label}</span>
              <span className="self-center text-slate-300">vs</span>
              <span className="bg-violet-100 text-violet-700 px-3 py-1 rounded-full">{theme.bucketB.label}</span>
            </div>
            <button onClick={handleStart} className="bg-purple-600 text-white font-black px-8 py-3 rounded-2xl text-lg hover:bg-purple-700 active:scale-95 transition-all shadow-md">
              Let&apos;s go! 🚀
            </button>
          </div>
        )}

        {phase === "playing" && item && (
          <div className="w-full space-y-4">
            <div className="flex justify-between text-xs text-slate-400 font-semibold">
              <span>{current + 1} / {ROUNDS}</span>
              <span>⭐ {score}</span>
            </div>

            <div className={`text-center py-3 transition-all duration-200 ${feedback === "correct" ? "scale-110" : feedback === "wrong" ? "scale-90 opacity-50" : "scale-100"}`}>
              <span className="text-8xl">{item.emoji}</span>
              {feedback && (
                <p className={`mt-3 font-black text-lg ${feedback === "correct" ? "text-emerald-600" : "text-rose-500"}`}>
                  {feedback === "correct"
                    ? "✓ Correct!"
                    : `→ That was ${item.bucket === "A" ? theme.bucketA.label : theme.bucketB.label}`}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleSort("A")}
                disabled={!!feedback}
                className="bg-sky-100 hover:bg-sky-200 border-2 border-sky-300 text-sky-800 font-black py-4 rounded-2xl text-sm transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
              >
                {theme.bucketA.label}
              </button>
              <button
                onClick={() => handleSort("B")}
                disabled={!!feedback}
                className="bg-violet-100 hover:bg-violet-200 border-2 border-violet-300 text-violet-800 font-black py-4 rounded-2xl text-sm transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
              >
                {theme.bucketB.label}
              </button>
            </div>
          </div>
        )}

        {phase === "done" && (
          <div className="text-center space-y-3">
            <p className="text-5xl">{score >= ROUNDS * 0.8 ? "🏆" : score >= ROUNDS * 0.5 ? "🌟" : "😊"}</p>
            <p className="text-xl font-black text-slate-800">You sorted {score} / {ROUNDS} correctly!</p>
            <p className="text-sm text-slate-400">
              {score >= ROUNDS * 0.8 ? "Outstanding!" : score >= ROUNDS * 0.5 ? "Great job!" : "Keep exploring!"}
            </p>
            <div className="flex gap-3 justify-center pt-2">
              <button onClick={handleStart} className="bg-purple-600 text-white font-bold px-5 py-2.5 rounded-2xl text-sm hover:bg-purple-700 transition-all">Play again</button>
              <button onClick={onClose} className="bg-slate-100 text-slate-700 font-bold px-5 py-2.5 rounded-2xl text-sm hover:bg-slate-200 transition-all">Back</button>
            </div>
          </div>
        )}

      </div>
    </GameShell>
  );
}
