function firstLine(text, fallback = "") {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return fallback;
  return cleaned.split(/(?<=[.!?])\s+/).filter(Boolean)[0] || cleaned;
}

export default function NextStepChoice({ topic, experimentHint, onExperiment, onQuiz, onTrySomethingNew }) {
  const experimentText = firstLine(experimentHint, "Try it right now.");

  return (
    <section className="space-y-5">
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-purple-600">🎉 You did it!</p>
        <h2 className="text-2xl font-black text-slate-800 leading-tight">What's next for you?</h2>
        <p className="text-sm text-slate-600">Pick your favourite way to keep the wow going!</p>
      </div>

      <div className="grid gap-3">
        <button
          type="button"
          onClick={onExperiment}
          className="rounded-3xl border border-green-200 bg-green-50 p-4 text-left transition-all hover:border-green-300 hover:bg-green-100 active:scale-[0.99]"
        >
          <p className="text-xs font-bold uppercase tracking-wide text-green-700 mb-2">🧪 Try it!</p>
          <p className="text-lg font-black text-slate-800 mb-1">Do a fun experiment</p>
          <p className="text-sm font-semibold text-slate-600">{experimentText}</p>
        </button>

        <button
          type="button"
          onClick={onQuiz}
          className="rounded-3xl border border-blue-200 bg-blue-50 p-4 text-left transition-all hover:border-blue-300 hover:bg-blue-100 active:scale-[0.99]"
        >
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700 mb-2">🧠 Brain check!</p>
          <p className="text-lg font-black text-slate-800 mb-1">Test what you know</p>
          <p className="text-sm font-semibold text-slate-600">Can you remember the big idea?</p>
        </button>
      </div>

      <div className="pt-1 text-center">
        <button
          type="button"
          onClick={onTrySomethingNew}
          className="text-sm font-bold text-purple-700 transition-colors hover:text-purple-800"
        >
          Or explore something new →
        </button>
      </div>
    </section>
  );
}
