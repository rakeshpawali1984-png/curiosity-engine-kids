function clipSentences(text, maxSentences = 2) {
  const chunks = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  return chunks.slice(0, maxSentences).join(" ");
}

function normalizeKeyLesson(topic, lesson) {
  const title = String(topic?.title || "").toLowerCase();
  if (title.includes("ocean") && title.includes("salt")) {
    return "The ocean is salty because rivers carry tiny bits of salt from land, and the salt stays in the water.";
  }
  return lesson;
}

function normalizeExplanation(topic, explanation) {
  const title = String(topic?.title || "").toLowerCase();
  if (title.includes("ocean") && title.includes("salt")) {
    return "Rivers carry tiny bits of salt and minerals from rocks on land into the ocean. Water can evaporate, but salt stays behind, so the salt slowly builds up over a very long time.";
  }
  return explanation;
}

export default function StoryBlock({ topic, onContinue }) {
  const story = clipSentences(topic?.story, 2);
  const explanation = clipSentences(normalizeExplanation(topic, topic?.explanation), 2);
  const keyLesson = clipSentences(normalizeKeyLesson(topic, topic?.keyLesson || ""), 1);

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="text-3xl">{topic?.emoji || "🦘"}</span>
        <h2 className="text-xl font-black text-slate-800 leading-tight">{topic?.title || "Curiosity"}</h2>
      </div>

      <div className="space-y-3">
        <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
          <p className="text-lg leading-relaxed text-gray-700">{story}</p>
        </div>
        {explanation ? (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
            <p className="text-lg leading-relaxed text-gray-700">{explanation}</p>
          </div>
        ) : null}
      </div>

      {keyLesson ? (
        <div className="bg-blue-50 border-2 border-blue-200 border-l-4 border-l-blue-400 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-xl">💡</span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-blue-600 mb-1">Key Idea</p>
            <p className="text-base font-bold text-blue-900 leading-snug">{keyLesson}</p>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onContinue}
        className="w-full rounded-2xl px-5 py-6 text-xl font-bold bg-purple-600 text-white hover:bg-purple-700 hover:scale-[1.02] active:scale-95 transition-all shadow-md"
      >
        Got it →
      </button>
    </section>
  );
}