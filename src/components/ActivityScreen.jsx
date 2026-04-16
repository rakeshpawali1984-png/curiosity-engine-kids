import ProgressBar from "./ProgressBar";

export default function ActivityScreen({ topic, onNext, onHome, homeLabel = "Home" }) {
  return (
    <div>
      <button onClick={onHome} className="mb-4 flex items-center gap-1 text-gray-400 hover:text-purple-600 font-semibold text-base transition-colors">
        ← {homeLabel}
      </button>
      <ProgressBar step={3} />

      <div className="bg-white rounded-3xl shadow-lg p-6 mb-6">
        <div className="flex items-center gap-2 mb-5">
          <span className="text-3xl">🎮</span>
          <div>
            <p className="text-xs text-green-600 font-semibold uppercase tracking-wide">
              🎮 Try this!
            </p>
            <h2 className="text-2xl font-black text-gray-800">
              {topic.activity.title}
            </h2>
          </div>
        </div>

        <p className="text-gray-500 text-base mb-4">
          Follow the steps below — then tell us you tried it!
        </p>

        <div className="space-y-3">
          {topic.activity.steps.map((step, i) => (
            <div
              key={i}
              className="flex items-start gap-4 bg-green-50 rounded-2xl p-4 border border-green-100"
            >
              <div className="w-10 h-10 rounded-full bg-green-400 text-white font-black flex items-center justify-center text-sm flex-shrink-0 mt-0.5">
                {i + 1}
              </div>
              <p className="text-gray-700 text-lg leading-snug break-words hyphens-none">{step}</p>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={onNext}
        className="w-full bg-green-500 hover:bg-green-600 hover:scale-105 active:scale-95 text-white font-bold py-6 rounded-2xl text-xl transition-all shadow-md"
      >
        I Tried It! ✅
      </button>
    </div>
  );
}
