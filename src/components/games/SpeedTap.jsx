import { useCallback, useEffect, useRef, useState } from "react";
import GameShell from "./GameShell";

const DISTRACTORS = ["🌟","🍎","🐸","🚂","🎈","🌈","🦋","🐠","🍦","🎵","🌻","🦁","🍕","🐧","🎀","🦊","🍇","🐳","🌮","⚽"];
const ROUNDS = 10;
const SHOW_MS = 1100;
const READY_COUNTDOWN_SECONDS = 3;

function pickDistractors(targetEmoji, count) {
  return DISTRACTORS.filter((e) => e !== targetEmoji).slice(0, count);
}

function buildGrid(targetEmoji, targetCell) {
  const distractors = pickDistractors(targetEmoji, 8);
  return Array.from({ length: 9 }, (_, i) => (i === targetCell ? targetEmoji : distractors[i < targetCell ? i : i - 1]));
}

export default function SpeedTap({ topicEmoji = "🦘", topicTitle = "this topic", onClose }) {
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [targetCell, setTargetCell] = useState(() => Math.floor(Math.random() * 9));
  const [grid, setGrid] = useState(() => buildGrid(topicEmoji, Math.floor(Math.random() * 9)));
  const [phase, setPhase] = useState("countdown"); // countdown | playing | done
  const [countdown, setCountdown] = useState(READY_COUNTDOWN_SECONDS);
  const [feedback, setFeedback] = useState(null); // null | "hit" | "miss"
  const timerRef = useRef(null);
  const countdownRef = useRef(null);

  useEffect(() => {
    if (phase !== "countdown") return;
    clearInterval(countdownRef.current);
    setCountdown(READY_COUNTDOWN_SECONDS);

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          setPhase("playing");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownRef.current);
  }, [phase]);

  const nextRound = useCallback((newScore) => {
    if (round + 1 >= ROUNDS) {
      setScore(newScore);
      setPhase("done");
      return;
    }
    const cell = Math.floor(Math.random() * 9);
    setTargetCell(cell);
    setGrid(buildGrid(topicEmoji, cell));
    setRound((r) => r + 1);
    setFeedback(null);
  }, [round, topicEmoji]);

  // Auto-advance if kid doesn't tap in time
  useEffect(() => {
    if (phase !== "playing") return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setFeedback("miss");
      setTimeout(() => nextRound(score), 400);
    }, SHOW_MS);
    return () => clearTimeout(timerRef.current);
  }, [round, phase, nextRound, score]);

  const handleTap = (i) => {
    if (phase !== "playing" || feedback !== null) return;
    clearTimeout(timerRef.current);
    if (i === targetCell) {
      const newScore = score + 1;
      setScore(newScore);
      setFeedback("hit");
      setTimeout(() => nextRound(newScore), 350);
    } else {
      setFeedback("miss");
      setTimeout(() => nextRound(score), 400);
    }
  };

  const pct = Math.round((score / ROUNDS) * 100);
  const msg = pct === 100 ? "Perfect! 🏆" : pct >= 70 ? "Great reflexes! ⚡" : pct >= 40 ? "Nice try! 💪" : "Keep practising! 🎯";

  return (
    <GameShell title="Speed Tap" emoji="⚡" onClose={onClose}>
      {phase === "done" ? (
        <div className="text-center">
          <p className="text-5xl mb-3">{pct === 100 ? "🏆" : pct >= 70 ? "⚡" : "💪"}</p>
          <p className="text-xl font-black text-slate-800 mb-1">{msg}</p>
          <p className="text-slate-500 text-sm mb-5">{score} / {ROUNDS} taps</p>
          <button
            onClick={onClose}
            className="bg-purple-500 hover:bg-purple-600 text-white font-black px-8 py-3 rounded-2xl text-base transition-all hover:scale-105 active:scale-95"
          >
            Done 🦘
          </button>
        </div>
      ) : (
        <>
          {phase === "countdown" ? (
            <div className="min-h-[270px] flex flex-col items-center justify-center text-center">
              <p className="text-slate-500 font-semibold mb-2">Get ready!</p>
              <p className="text-7xl font-black text-purple-600 leading-none animate-pulse">{countdown || "Go!"}</p>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Round {round + 1}/{ROUNDS}</span>
                <span className="text-xs font-bold text-purple-600">Score: {score}</span>
              </div>
              <p className="text-center text-sm font-semibold text-slate-600 mb-4">
                Tap <span className="text-lg">{topicEmoji}</span> fast!
              </p>
              <div className="grid grid-cols-3 gap-3">
                {grid.map((emoji, i) => (
                  <button
                    key={i}
                    onPointerDown={() => handleTap(i)}
                    className={`
                      text-3xl h-16 rounded-2xl border-2 flex items-center justify-center transition-all select-none
                      ${feedback === "hit" && i === targetCell ? "bg-emerald-100 border-emerald-400 scale-95" : ""}
                      ${feedback === "miss" && i === targetCell ? "bg-amber-50 border-amber-300" : ""}
                      ${feedback === null ? "bg-slate-50 border-slate-200 hover:bg-purple-50 hover:border-purple-200 active:scale-95" : ""}
                    `}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </GameShell>
  );
}
