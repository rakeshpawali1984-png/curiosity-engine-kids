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
              📖 Story Time
            </p>
            <h2 className="text-xl font-black text-gray-800 leading-snug">
              {topic.title}
            </h2>
          </div>
        </div>

        <div className="bg-amber-50 rounded-2xl p-5 border border-amber-100 mb-4">
          <p className="text-gray-700 text-lg leading-relaxed break-words hyphens-none">{topic.story}</p>
        </div>

        {topic.wow && (
          <div className="wow-line bg-purple-50 border-2 border-purple-200 rounded-2xl p-4 flex items-center gap-3">
            <span className="text-2xl">🤯</span>
            <p className="text-purple-800 font-bold text-base leading-snug">{topic.wow}</p>
          </div>
        )}
      </div>

      <button
        onClick={onNext}
        className="w-full bg-purple-500 hover:bg-purple-600 hover:scale-105 active:scale-95 text-white font-bold py-6 rounded-2xl text-xl transition-all shadow-md"
      >
        Let&apos;s find out! →
      </button>
    </div>
  );
}
