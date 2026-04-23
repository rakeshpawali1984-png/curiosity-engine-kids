import { useMemo, useState } from "react";

function firstSentence(text, fallback = "") {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return fallback;
  return cleaned.split(/(?<=[.!?])\s+/).filter(Boolean)[0] || cleaned;
}

function buildTwoOptionCheck(check, title) {
  const titleText = String(title || "").toLowerCase();

  if (titleText.includes("ocean") && titleText.includes("salt")) {
    return {
      question: "Where does most ocean salt come from?",
      options: [
        { label: "From rivers", isCorrect: true },
        { label: "From rain", isCorrect: false },
      ],
      correctFeedback: "Exactly! Rivers carry tiny bits of salt into the ocean.",
      wrongFeedback: "Good thought — rain is actually fresh water. Rivers bring the salt.",
      insight: "Over time, this builds up — making the ocean salty.",
    };
  }

  if (!check) return null;

  if (check.type === "truefalse") {
    const prompt = String(check.question || "")
      .replace(/^quick\s*check\s*:\s*/i, "")
      .replace(/true\s*or\s*false\s*[-:—]?\s*/i, "")
      .trim();
    return {
      question: prompt || "Does that match what we just learned?",
      options: [
        { label: "Yes, that's right", isCorrect: Boolean(check.answer) },
        { label: "No, that's wrong", isCorrect: !Boolean(check.answer) },
      ],
      correctFeedback: "Spot on! That's exactly what the story showed.",
      wrongFeedback: "Good thought — the story pointed the other way on this one.",
      insight: firstSentence(check.question, ""),
    };
  }

  const rawOptions = Array.isArray(check.options) ? check.options.filter(Boolean) : [];
  if (rawOptions.length < 2) return null;

  const correctIndex = Number.isInteger(check.answer) ? check.answer : 0;
  const safeCorrectIndex = Math.min(Math.max(correctIndex, 0), rawOptions.length - 1);
  const correct = rawOptions[safeCorrectIndex];
  const distractor = rawOptions.find((_, idx) => idx !== safeCorrectIndex) || "Something else";

  const question = String(check.question || "Which one fits the story?").trim();
  const options =
    safeCorrectIndex === 0
      ? [{ label: correct, isCorrect: true }, { label: distractor, isCorrect: false }]
      : [{ label: distractor, isCorrect: false }, { label: correct, isCorrect: true }];

  return {
    question,
    options,
    correctFeedback: `Exactly! "${firstSentence(correct, "that's the one")}" is the right idea.`,
    wrongFeedback: `Good thought — "${firstSentence(correct, "the other option")}" fits the story better.`,
    insight: null,
  };
}

export default function MicroCheck({ check, topicTitle, keyIdea, onInteracted, onComplete }) {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [pendingResult, setPendingResult] = useState(null);

  const normalized = useMemo(() => buildTwoOptionCheck(check, topicTitle), [check, topicTitle]);
  const options = normalized?.options || [];

  if (!normalized || options.length < 2) return null;

  const hasPicked = selectedIndex !== null;

  const handlePick = (index) => {
    if (hasPicked) return;
    const picked = options[index];
    const pickedIsCorrect = Boolean(picked.isCorrect);
    const feedback = pickedIsCorrect ? normalized.correctFeedback : normalized.wrongFeedback;
    setSelectedIndex(index);
    onInteracted?.({ label: picked.label, correct: pickedIsCorrect });
    setPendingResult({ correct: pickedIsCorrect, feedback });
  };

  const insightLine = normalized.insight || firstSentence(keyIdea, "");

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-purple-400 mb-1">Quick thought?</p>
        <p className="text-xl font-black leading-snug text-slate-800">{normalized.question}</p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((option, index) => {
          const isSelected = index === selectedIndex;
          return (
            <button
              key={`${option.label}-${index}`}
              type="button"
              onClick={() => handlePick(index)}
              disabled={hasPicked}
              className={`rounded-2xl border px-4 py-4 text-left font-bold text-base transition-all ${
                hasPicked
                  ? option.isCorrect
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : isSelected
                      ? "border-slate-200 bg-slate-100 text-slate-400 opacity-70"
                      : "border-slate-100 bg-slate-50 text-slate-400 opacity-40"
                  : "border-slate-200 bg-white text-slate-700 hover:border-purple-300 hover:bg-purple-50 active:scale-[0.99]"
              }`}
            >
              {option.isCorrect && hasPicked ? "✓ " : ""}{option.label}
            </button>
          );
        })}
      </div>

      {pendingResult && (
        <div className="space-y-4 pt-1">
          <div className="px-1 space-y-1">
            <p className="text-sm font-semibold leading-snug text-slate-700">
              {pendingResult.feedback}
            </p>
            {insightLine ? (
              <p className="text-xs text-slate-400 leading-snug">{insightLine}</p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => onComplete?.(pendingResult)}
            className="w-full rounded-2xl px-5 py-5 text-xl font-bold bg-purple-600 text-white hover:bg-purple-700 hover:scale-[1.02] active:scale-95 transition-all shadow-md"
          >
            Find another wow {String.fromCodePoint(0x1F998)}
          </button>
        </div>
      )}
    </section>
  );
}


