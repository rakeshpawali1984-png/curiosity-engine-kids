import ProgressBar from "./ProgressBar";

export default function StoryScreen({ topic, onNext, onHome }) {
  return (
    <div>
      <button onClick={onHome} className="mb-4 flex items-center gap-1 text-gray-400 hover:text-purple-600 font-semibold text-base transition-colors">
        ← Home
      </button>
      <ProgressBar step={1} />

      <div className="bg-white rounded-3xl shadow-lg p-6 mb-6">
        <div className="flex items-center gap-3 mb-5">
          <span className="text-4xl">{topic.emoji}</span>
          <div>
            <p className="text-xs text-purple-500 font-semibold uppercase tracking-wide">
              Story Time
            </p>
            <h2 className="text-xl font-black text-gray-800 leading-snug">
              {topic.title}
            </h2>
          </div>
        </div>

        <div className="bg-amber-50 rounded-2xl p-5 border border-amber-100">
          <p className="text-gray-700 text-lg leading-relaxed">{topic.story}</p>
        </div>
      </div>

      <button
        onClick={onNext}
        className="w-full bg-purple-500 hover:bg-purple-600 active:scale-95 text-white font-bold py-5 rounded-2xl text-xl transition-all shadow-md"
      >
        Next →
      </button>
    </div>
  );
}
