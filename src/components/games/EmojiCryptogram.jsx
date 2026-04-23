import { useEffect, useRef, useState } from "react";
import GameShell from "./GameShell";

const READY_COUNTDOWN_SECONDS = 3;

const WORD_EMOJI = {
  sun: "🌞",
  star: "⭐",
  earth: "🌍",
  planet: "🪐",
  moon: "🌙",
  water: "💧",
  plant: "🌱",
  animal: "🐾",
  rocket: "🚀",
  volcano: "🌋",
  brain: "🧠",
  cloud: "☁️",
  light: "💡",
  energy: "⚡",
  gravity: "🧲",
  oxygen: "🫧",
  air: "🌬️",
  bone: "🦴",
  heart: "❤️",
  tree: "🌳",
  ocean: "🌊",
  fire: "🔥",
  diamond: "💎",
  magnet: "🧲",
  ball: "⚽",
};

const DEMO_FACTS = [
  "The sun is a star at the center of our solar system!",
  "Plants make oxygen during photosynthesis.",
  "The moon changes shape because of how sunlight hits it.",
  "A rocket burns fuel to escape Earth's gravity.",
  "Volcanoes erupt when magma pushes through Earth's crust.",
  "Your brain uses about 20% of your body's energy.",
  "Clouds are made of tiny drops of water.",
  "Diamonds are made of carbon arranged in a crystal pattern.",
  "Magnets have a north and south pole.",
  "A ball bounces because it stores energy when it hits the ground.",
];

function pickFact() {
  const fact = DEMO_FACTS[Math.floor(Math.random() * DEMO_FACTS.length)];
  return toTokens(fact);
}

function baseWord(raw) {
  const w = String(raw || "").toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return "";
  if (WORD_EMOJI[w]) return w;
  if (w.endsWith("ies") && WORD_EMOJI[`${w.slice(0, -3)}y`]) return `${w.slice(0, -3)}y`;
  if (w.endsWith("es") && WORD_EMOJI[w.slice(0, -2)]) return w.slice(0, -2);
  if (w.endsWith("s") && WORD_EMOJI[w.slice(0, -1)]) return w.slice(0, -1);
  return w;
}

function toTokens(sentence) {
  const words = sentence.split(/([ .,!?:;])/g);
  const replaced = [];
  let replacedCount = 0;

  for (let i = 0; i < words.length; i++) {
    const w = baseWord(words[i]);
    if (WORD_EMOJI[w] && replacedCount < 3) {
      replaced.push({
        type: "emoji",
        word: w,
        emoji: WORD_EMOJI[w],
        options: shuffle([w, ...distractors(w)]),
        guess: null,
      });
      replacedCount++;
    } else if (w) {
      replaced.push({ type: "text", text: words[i] });
    } else {
      replaced.push({ type: "punct", text: words[i] });
    }
  }
  return replacedCount > 0 ? replaced : null;
}

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function distractors(correct) {
  const pool = Object.keys(WORD_EMOJI).filter((w) => w !== correct);
  return shuffle(pool).slice(0, 2);
}

function topicFactCandidates(topic) {
  const candidates = [];

  const deepSentence = topic?.emojiCryptogram?.sentence;
  if (typeof deepSentence === "string" && deepSentence.trim()) {
    candidates.push(deepSentence.trim());
  }

  if (typeof topic?.wow === "string" && topic.wow.trim()) {
    candidates.push(topic.wow.trim());
  }

  if (typeof topic?.keyLesson === "string" && topic.keyLesson.trim()) {
    candidates.push(topic.keyLesson.trim());
  }

  if (Array.isArray(topic?.quiz)) {
    topic.quiz
      .filter((q) => q?.type === "truefalse" && typeof q?.question === "string")
      .slice(0, 2)
      .forEach((q) => candidates.push(q.question.trim()));
  }

  return candidates.filter(Boolean);
}

function buildPuzzle(topic) {
  const candidates = topicFactCandidates(topic);
  for (const sentence of candidates) {
    const tokens = toTokens(sentence);
    if (tokens) return tokens;
  }
  return pickFact();
}

export default function EmojiCryptogram({ topic, onClose }) {
  const [tokens, setTokens] = useState(() => buildPuzzle(topic));
  const [phase, setPhase] = useState("countdown"); // countdown | playing
  const [countdown, setCountdown] = useState(READY_COUNTDOWN_SECONDS);
  const countdownRef = useRef(null);

  const emojiTokens = tokens.filter((t) => t.type === "emoji");
  const solvedCount = emojiTokens.filter((t) => t.guess === t.word).length;
  const done = emojiTokens.length > 0 && emojiTokens.every((t) => Boolean(t.guess));

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

  useEffect(() => () => clearInterval(countdownRef.current), []);

  const handleGuess = (idx, guess) => {
    if (phase !== "playing") return;
    setTokens((prev) =>
      prev.map((t, i) =>
        i === idx ? { ...t, guess } : t
      )
    );
  };

  return (
    <GameShell title="Emoji Cryptogram" emoji="🕵️‍♂️" onClose={onClose}>
      {phase === "countdown" ? (
        <div className="min-h-[270px] flex flex-col items-center justify-center text-center">
          <p className="text-slate-500 font-semibold mb-2">Get ready!</p>
          <p className="text-7xl font-black text-purple-600 leading-none animate-pulse">{countdown || "Go!"}</p>
        </div>
      ) : (
        <>
          <div className="mb-5 text-lg text-center font-semibold text-slate-700">
            Crack this topic code! Tap each emoji and pick the right word.
          </div>
          <div className="flex flex-wrap justify-center gap-1 text-xl mb-6">
            {tokens.map((t, i) =>
              t.type === "emoji" ? (
                <span key={i} className="inline-block">
                  {t.guess ? (
                    <span className="font-bold text-emerald-700 border-b-2 border-emerald-300 px-1 cursor-pointer" onClick={() => handleGuess(i, null)}>{t.guess}</span>
                  ) : (
                    <span className="cursor-pointer" title="Tap to guess">
                      {t.emoji}
                      <div className="mt-1 flex gap-1">
                        {t.options.map((opt) => (
                          <button
                            key={opt}
                            onClick={() => handleGuess(i, opt)}
                            className="bg-white border border-purple-200 hover:bg-purple-50 text-purple-700 font-bold rounded px-2 py-1 text-xs mt-1"
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </span>
                  )}
                </span>
              ) : t.type === "text" ? (
                <span key={i}>{t.text}</span>
              ) : (
                <span key={i}>{t.text}</span>
              )
            )}
          </div>
          {done && (
            <div className="text-center mb-3">
              <p className="text-2xl font-black text-emerald-700 mb-1">Great job!</p>
              <p className="text-slate-500 text-sm mb-2">You solved {solvedCount} / {emojiTokens.length} codes.</p>
            </div>
          )}
        </>
      )}
      <button
        onClick={onClose}
        className="w-full bg-purple-500 hover:bg-purple-600 text-white font-black py-3 rounded-2xl text-base transition-all hover:scale-105 active:scale-95"
      >
        {done ? "Done 🦘" : "Skip"}
      </button>
    </GameShell>
  );
}
