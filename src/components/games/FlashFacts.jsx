import { useCallback, useEffect, useRef, useState } from "react";
import GameShell from "./GameShell";

const FACTS = [
  { text: "The ocean covers more than 70% of Earth's surface.", answer: true },
  { text: "Lightning is hotter than the surface of the Sun.", answer: true },
  { text: "The Moon has weather like rain and wind.", answer: false },
  { text: "Honey never goes bad — it can last thousands of years.", answer: true },
  { text: "Sharks are older than trees.", answer: true },
  { text: "Sound travels faster in water than in air.", answer: true },
  { text: "Stars twinkle because they are spinning very fast.", answer: false },
  { text: "A snail can sleep for up to 3 years.", answer: true },
  { text: "The Sun is a planet.", answer: false },
  { text: "Butterflies taste with their feet.", answer: true },
  { text: "Octopuses have three hearts.", answer: true },
  { text: "The Great Wall of China is clearly visible from space.", answer: false },
  { text: "Humans share about 50% of their DNA with bananas.", answer: true },
  { text: "A day on Venus is longer than a year on Venus.", answer: true },
  { text: "Fish can drown.", answer: true },
];

const ROUNDS = 8;
const SHOW_MS = 2200;

export default function FlashFacts({ onClose }) {
  const [phase, setPhase] = useState("idle");
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [lastCorrect, setLastCorrect] = useState(null);
  const [facts] = useState(() =>
    [...FACTS].sort(() => Math.random() - 0.5).slice(0, ROUNDS)
  );
  const timerRef = useRef(null);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const startRound = useCallback((r) => {
    setPhase("showing");
    clearTimer();
    timerRef.current = setTimeout(() => setPhase("answering"), SHOW_MS);
  }, []);

  const handleStart = () => {
    setRound(0);
    setScore(0);
    setLastCorrect(null);
    startRound(0);
  };

  const handleAnswer = (answer) => {
    clearTimer();
    const correct = answer === facts[round].answer;
    if (correct) setScore((s) => s + 1);
    setLastCorrect(correct);
    setPhase("result");
    timerRef.current = setTimeout(() => {
      const next = round + 1;
      setLastCorrect(null);
      if (next >= ROUNDS) {
        setPhase("done");
      } else {
        setRound(next);
        startRound(next);
      }
    }, 900);
  };

  useEffect(() => () => clearTimer(), []);

  const fact = facts[round];

  return (
    <GameShell title="Flash Facts" emoji="🧠" onClose={onClose}>
      <div className="p-5 min-h-[280px] flex flex-col items-center justify-center">

        {phase === "idle" && (
          <div className="text-center space-y-4">
            <p className="text-5xl">🧠</p>
            <p className="text-base font-bold text-slate-700">A fact flashes — is it True or False?</p>
            <p className="text-xs text-slate-400">{ROUNDS} facts · answer fast!</p>
            <button onClick={handleStart} className="bg-purple-600 text-white font-black px-8 py-3 rounded-2xl text-lg hover:bg-purple-700 active:scale-95 transition-all shadow-md">
              Let&apos;s go! 🚀
            </button>
          </div>
        )}

        {(phase === "showing" || phase === "answering") && (
          <div className="w-full space-y-5">
            <div className="flex justify-between text-xs text-slate-400 font-semibold">
              <span>Round {round + 1} / {ROUNDS}</span>
              <span>⭐ {score}</span>
            </div>
            <div className={`rounded-2xl bg-purple-50 border-2 border-purple-100 p-5 text-center transition-all duration-200 ${phase === "showing" ? "opacity-100 scale-100" : "opacity-70 scale-[0.98]"}`}>
              <p className="text-lg font-black text-slate-800 leading-snug">{fact.text}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleAnswer(true)}
                disabled={phase === "showing"}
                className="bg-emerald-500 text-white font-black py-4 rounded-2xl text-xl hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none"
              >
                ✓ True
              </button>
              <button
                onClick={() => handleAnswer(false)}
                disabled={phase === "showing"}
                className="bg-rose-400 text-white font-black py-4 rounded-2xl text-xl hover:bg-rose-500 active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none"
              >
                ✗ False
              </button>
            </div>
          </div>
        )}

        {phase === "result" && (
          <div className="text-center space-y-2">
            <p className="text-5xl">{lastCorrect ? "🎉" : "💭"}</p>
            <p className={`text-xl font-black ${lastCorrect ? "text-emerald-600" : "text-slate-600"}`}>
              {lastCorrect ? "Correct!" : `Nope — it was ${fact.answer ? "True" : "False"}`}
            </p>
          </div>
        )}

        {phase === "done" && (
          <div className="text-center space-y-3">
            <p className="text-5xl">{score >= ROUNDS * 0.8 ? "🏆" : score >= ROUNDS * 0.5 ? "🌟" : "😊"}</p>
            <p className="text-xl font-black text-slate-800">You got {score} / {ROUNDS}!</p>
            <p className="text-sm text-slate-400">
              {score >= ROUNDS * 0.8 ? "Amazing curiosity brain!" : score >= ROUNDS * 0.5 ? "Nice work!" : "Keep exploring — you'll know more next time!"}
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
