import ProgressBar from "./ProgressBar";

export default function ExplanationScreen({ topic, onNext, onHome }) {
  // Split explanation text into paragraphs
  const paragraphs = topic.explanation.split("\n").filter(Boolean);

  return (
    <div>
      <button onClick={onHome} className="mb-4 flex items-center gap-1 text-gray-400 hover:text-purple-600 font-semibold text-base transition-colors">
        ← Home
      </button>
      <ProgressBar step={2} />

      <div className="bg-white rounded-3xl shadow-lg p-6 mb-6">
        <div className="flex items-center gap-2 mb-5">
          <span className="text-3xl">🧠</span>
          <div>
            <p className="text-xs text-blue-500 font-semibold uppercase tracking-wide">
              How It Works
            </p>
            <h2 className="text-xl font-black text-gray-800">Let&apos;s Learn!</h2>
          </div>
        </div>

        <div className="space-y-3 mb-5">
          {paragraphs.map((para, i) => (
            <p key={i} className="text-gray-700 text-lg leading-relaxed">
              {para}
            </p>
          ))}
        </div>

        {/* Key lesson callout */}
        <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-4 flex gap-3 items-start">
          <span className="text-2xl">💡</span>
          <div>
            <p className="text-xs text-blue-500 font-bold uppercase tracking-wide mb-1">
              Key Idea
            </p>
            <p className="text-blue-800 font-bold text-base">
              {topic.keyLesson}
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={onNext}
        className="w-full bg-blue-500 hover:bg-blue-600 active:scale-95 text-white font-bold py-5 rounded-2xl text-xl transition-all shadow-md"
      >
        Next →
      </button>
    </div>
  );
}
