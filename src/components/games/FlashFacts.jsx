import { useEffect, useRef, useState } from "react";
import GameShell from "./GameShell";

const FLASH_MS = 2000; // time fact is shown before buttons appear
const ANSWER_MS = 3200; // time allowed to answer once buttons appear
const TICK_MS = 100; // timer bar smoothness
const READY_COUNTDOWN_SECONDS = 3;

// Build fact cards from topic data — no AI call needed
function buildCards(topic) {
  const cards = [];

  // True/false questions from the quiz
  if (Array.isArray(topic?.quiz)) {
    topic.quiz
      .filter((q) => q.type === "truefalse")
      .forEach((q) => {
        cards.push({ statement: q.question, answer: q.answer });
      });
  }

  // wow fact is always true
  if (topic?.wow) {
    cards.push({ statement: topic.wow, answer: true });
  }

  // keyLesson is always true
  if (topic?.keyLesson) {
    cards.push({ statement: topic.keyLesson, answer: true });
  }

  // Shuffle and cap at 6
  return cards
    .sort(() => Math.random() - 0.5)
    .slice(0, 6);
}

export default function FlashFacts({ topic, onClose }) {
  const cards = useRef(buildCards(topic));
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState("countdown"); // countdown | flashing | answering | feedback | done
  const [countdown, setCountdown] = useState(READY_COUNTDOWN_SECONDS);
  const [score, setScore] = useState(0); // correct answers
  const [lastCorrect, setLastCorrect] = useState(null);
  const [lastTimedOut, setLastTimedOut] = useState(false);
  const [timeLeftMs, setTimeLeftMs] = useState(ANSWER_MS);
  const flashTimerRef = useRef(null);
  const answerTimerRef = useRef(null);
  const feedbackTimerRef = useRef(null);
  const countdownRef = useRef(null);
  const intervalRef = useRef(null);

  const total = cards.current.length;
  const card = cards.current[index];

  useEffect(() => {
    if (phase !== "countdown") return;
    clearInterval(countdownRef.current);
    setCountdown(READY_COUNTDOWN_SECONDS);

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          setPhase("flashing");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownRef.current);
  }, [phase]);

  useEffect(() => {
    if (phase !== "flashing") return;
    clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setPhase("answering"), FLASH_MS);
    return () => clearTimeout(flashTimerRef.current);
  }, [phase, index]);

  useEffect(() => {
    if (phase !== "answering") return;

    setTimeLeftMs(ANSWER_MS);
    clearTimeout(answerTimerRef.current);
    clearInterval(intervalRef.current);

    answerTimerRef.current = setTimeout(() => {
      handleAnswer(null, true);
    }, ANSWER_MS);

    intervalRef.current = setInterval(() => {
      setTimeLeftMs((prev) => Math.max(0, prev - TICK_MS));
    }, TICK_MS);

    return () => {
      clearTimeout(answerTimerRef.current);
      clearInterval(intervalRef.current);
    };
  }, [phase, index]);

  useEffect(() => {
    return () => {
      clearInterval(countdownRef.current);
      clearTimeout(flashTimerRef.current);
      clearTimeout(answerTimerRef.current);
      clearTimeout(feedbackTimerRef.current);
      clearInterval(intervalRef.current);
    };
  }, []);

  if (!total) {
    return (
      <GameShell title="Flash Facts" emoji="🧠" onClose={onClose}>
        <p className="text-center text-slate-500 text-sm py-4">No facts available for this topic yet.</p>
        <button onClick={onClose} className="w-full bg-purple-500 text-white font-black py-3 rounded-2xl mt-2">Done</button>
      </GameShell>
    );
  }

  const handleAnswer = (answer, timedOut = false) => {
    if (phase !== "answering") return;
    clearTimeout(answerTimerRef.current);
    clearInterval(intervalRef.current);

    const correct = answer === card.answer;
    if (correct) {
      setScore((s) => s + 1);
    }

    setLastCorrect(correct);
    setLastTimedOut(timedOut);
    setPhase("feedback");

    clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => {
      if (index + 1 >= total) {
        setPhase("done");
      } else {
        setIndex((i) => i + 1);
        setPhase("flashing");
      }
    }, 800);
  };

  const pct = Math.round((score / total) * 100);
  const msg = pct === 100 ? "You nailed it! 🏆" : pct >= 67 ? "Nice work! 🧠" : pct >= 34 ? "Good effort! 💪" : "Keep exploring! 🔍";
  const timerPct = Math.round((timeLeftMs / ANSWER_MS) * 100);

  return (
    <GameShell title="Flash Facts" emoji="🧠" onClose={onClose}>
      {phase === "done" ? (
        <div className="text-center">
          <p className="text-5xl mb-3">{pct === 100 ? "🏆" : pct >= 67 ? "🧠" : "💪"}</p>
          <p className="text-xl font-black text-slate-800 mb-1">{msg}</p>
          <p className="text-slate-500 text-sm mb-5">{score} / {total} correct</p>
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
              <div className="flex justify-between items-center mb-4">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">{index + 1} / {total}</span>
                <span className="text-xs font-bold text-purple-600">Score: {score}</span>
              </div>

              <div className="flex justify-end items-center mb-3">
                {phase === "answering" && (
                  <span className={`text-xs font-black ${timerPct <= 34 ? "text-rose-600" : "text-slate-500"}`}>
                    {Math.ceil(timeLeftMs / 1000)}s
                  </span>
                )}
              </div>

              {phase === "answering" && (
                <div className="mb-4 h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-[width] duration-100 ${timerPct <= 34 ? "bg-rose-500" : timerPct <= 67 ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{ width: `${timerPct}%` }}
                  />
                </div>
              )}

              <div className={`rounded-2xl p-5 mb-5 min-h-[96px] flex items-center justify-center text-center transition-colors ${
                phase === "feedback"
                  ? lastCorrect ? "bg-emerald-50 border-2 border-emerald-300" : "bg-rose-50 border-2 border-rose-200"
                  : "bg-purple-50 border-2 border-purple-100"
              }`}>
                {phase === "feedback" ? (
                  <p className={`text-base font-bold ${lastCorrect ? "text-emerald-700" : "text-rose-600"}`}>
                    {lastCorrect
                      ? "✓ Correct!"
                      : lastTimedOut
                        ? `⏰ Time's up! It's ${card.answer ? "True" : "False"}`
                        : `✗ It's ${card.answer ? "True" : "False"}`}
                  </p>
                ) : (
                  <p className="text-base font-semibold text-slate-700 leading-snug">{card.statement}</p>
                )}
              </div>

              {phase === "flashing" && (
                <p className="text-center text-xs text-slate-400 font-semibold mb-4">Read carefully...</p>
              )}

              {phase === "answering" && (
                <div className="flex gap-3">
                  <button
                    onPointerDown={() => handleAnswer(true)}
                    className="flex-1 bg-emerald-100 hover:bg-emerald-200 border-2 border-emerald-300 text-emerald-800 font-black py-4 rounded-2xl text-base transition-all active:scale-95"
                  >
                    True ✓
                  </button>
                  <button
                    onPointerDown={() => handleAnswer(false)}
                    className="flex-1 bg-rose-100 hover:bg-rose-200 border-2 border-rose-200 text-rose-800 font-black py-4 rounded-2xl text-base transition-all active:scale-95"
                  >
                    False ✗
                  </button>
                </div>
              )}

              {phase === "feedback" && (
                <div className="flex gap-3 opacity-40 pointer-events-none">
                  <div className="flex-1 bg-emerald-100 border-2 border-emerald-300 text-emerald-800 font-black py-4 rounded-2xl text-base text-center">True ✓</div>
                  <div className="flex-1 bg-rose-100 border-2 border-rose-200 text-rose-800 font-black py-4 rounded-2xl text-base text-center">False ✗</div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </GameShell>
  );
}
