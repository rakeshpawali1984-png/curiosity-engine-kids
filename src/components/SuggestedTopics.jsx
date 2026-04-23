function firstLine(text, fallback = "") {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return fallback;
  return cleaned.split(/(?<=[.!?])\s+/).filter(Boolean)[0] || cleaned;
}

export default function SuggestedTopics({ suggestions, observe, wow, onPick, onAskOwnWhy }) {
  const items = Array.isArray(suggestions) ? suggestions.filter(Boolean).slice(0, 2) : [];
  const missionText = firstLine(observe, "");

  return (
    <section className="space-y-5">
      <div className="rounded-2xl bg-purple-50 border-2 border-purple-200 p-4 flex items-start gap-3">
        <span className="text-2xl shrink-0">🤯</span>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-purple-500 mb-1">Did you know...</p>
          <p className="text-base font-bold leading-snug text-purple-800">{firstLine(wow, "Keep asking why — every answer leads to a bigger question!")}</p>
        </div>
      </div>

      <div className="space-y-3 rounded-3xl border border-blue-100 bg-blue-50 p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-blue-600">And something even stranger happened...</p>
        <div className="space-y-3">
          {items.map((question, index) => (
            <button
              key={`${question}-${index}`}
              type="button"
              onClick={() => onPick(question)}
              className={`w-full rounded-2xl border px-4 py-4 text-left transition-all ${index === 0 ? "border-purple-200 bg-white hover:border-purple-300" : "border-blue-200 bg-white hover:border-blue-300"}`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className={`text-base font-bold leading-snug ${index === 0 ? "text-purple-800" : "text-blue-800"}`}>{question}</p>
                <span className={`shrink-0 text-sm font-black ${index === 0 ? "text-purple-600" : "text-blue-600"}`}>Let&apos;s find out →</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {missionText && (
      <div className="space-y-2 rounded-3xl border border-green-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-green-700">✏️ Real-world mission...</p>
        <p className="text-gray-700 text-base leading-relaxed">🕵️ Mission: {missionText} You might discover something surprising 👀</p>
      </div>
      )}

      <div className="pt-1 text-center">
        <p className="mb-3 text-sm font-semibold text-slate-500">One more before you go?</p>
        <button
          type="button"
          onClick={onAskOwnWhy}
          className="w-full rounded-2xl bg-purple-600 px-5 py-6 text-xl font-bold text-white transition-all shadow-md hover:bg-purple-700 hover:scale-[1.02] active:scale-95"
        >
          Find another wow {'\u{1F998}'}
        </button>
      </div>
    </section>
  );
}
