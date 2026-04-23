function limitWords(text, maxWords) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")}...`;
}

export default function InsightBlock({ insight, feedback, isCorrect, quickTry }) {
  if (!insight && !feedback && !quickTry) return null;

  return (
    <section className="space-y-2 pt-1">
      {feedback ? <p className={`text-sm font-bold ${isCorrect ? "text-emerald-700" : "text-amber-700"}`}>{limitWords(feedback, 14)}</p> : null}
      {insight ? <p className="text-lg font-semibold text-gray-800">Key idea: {limitWords(insight, 14)}</p> : null}
      {quickTry ? (
        <p className="text-sm text-slate-600">
          <span className="font-bold text-slate-700">Try this:</span> {limitWords(quickTry, 9)}
        </p>
      ) : null}
    </section>
  );
}