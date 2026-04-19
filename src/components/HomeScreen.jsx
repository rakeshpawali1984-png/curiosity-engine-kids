const CARD_STYLES = [
  "bg-purple-50 hover:bg-purple-100 border-purple-200 hover:border-purple-300",
  "bg-indigo-50 hover:bg-indigo-100 border-indigo-200 hover:border-indigo-300",
  "bg-violet-50 hover:bg-violet-100 border-violet-200 hover:border-violet-300",
];

export default function HomeScreen({ topics, onSelect, onBrandClick, demoMode = false, onAskGrownUp, onUnlockAskAnything }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-center mb-6 mt-4">
        {onBrandClick ? (
          <button
            type="button"
            onClick={onBrandClick}
            className="group"
            aria-label="Go to Whyroo home"
          >
            <p className="text-4xl font-black text-purple-700 mb-1 tracking-tight group-hover:text-purple-800">Whyroo</p>
            <p className="text-sm font-extrabold uppercase tracking-[0.2em] text-purple-500 group-hover:text-purple-600">From why to wow</p>
          </button>
        ) : (
          <>
            <p className="text-4xl font-black text-purple-700 mb-1 tracking-tight">Whyroo</p>
            <p className="text-sm font-extrabold uppercase tracking-[0.2em] text-purple-500">From why to wow</p>
          </>
        )}
      </div>

      {demoMode && (
        <div className="w-full mt-1 mb-3 rounded-2xl border border-purple-200 bg-white/80 p-4">
          <label className="block text-xs font-bold uppercase tracking-wider text-purple-500 mb-2">
            Ask anything
          </label>
          <input
            type="text"
            disabled
            value=""
            placeholder="Ask anything..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400 cursor-not-allowed"
            aria-label="Ask anything teaser"
          />
          <p className="mt-2 text-xs text-slate-500">Available after grown-up sign-in.</p>
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => {
                if (onUnlockAskAnything) {
                  onUnlockAskAnything();
                  return;
                }
                onAskGrownUp?.();
              }}
              className="inline-flex items-center justify-center rounded-full px-4 py-2 text-xs font-bold bg-purple-600 text-white hover:bg-purple-700 transition-colors"
            >
              Ask a grown-up to unlock Ask Anything
            </button>
          </div>
        </div>
      )}

      {demoMode && (
        <div className="mb-2 text-center">
          <p className="text-sm font-bold text-slate-500">Try demo questions</p>
          <p className="text-xs text-slate-400 mt-1">These are demo topics. In full mode, you can type any question you want.</p>
        </div>
      )}

      {demoMode ? (
        <div className="w-full rounded-3xl border border-slate-200 bg-white/80 shadow-sm overflow-hidden">
          {topics.map((topic, index) => (
            <div key={topic.id}>
              <button
                onClick={() => onSelect(topic)}
                className="w-full flex items-center gap-3 px-4 py-4 text-left transition-colors duration-200 hover:bg-white active:scale-[0.99]"
              >
                <span className="text-2xl">{topic.emoji}</span>
                <span className="text-lg font-bold text-slate-800 leading-tight">{topic.title}</span>
              </button>
              {index < topics.length - 1 ? <div className="h-px bg-slate-200 mx-4" /> : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 w-full">
          {topics.map((topic, index) => (
            <button
              key={topic.id}
              onClick={() => onSelect(topic)}
              className={`w-full flex items-center gap-4 p-5 rounded-3xl border transition-all duration-200 text-left shadow-sm hover:shadow-md active:scale-[0.99] ${CARD_STYLES[index % CARD_STYLES.length]}`}
            >
              <span className="text-3xl">{topic.emoji}</span>
              <span className="text-xl font-extrabold text-slate-800 leading-snug">
                {topic.title}
              </span>
            </button>
          ))}
        </div>
      )}

      <p className="text-gray-400 text-sm mt-8 mb-4 text-center font-medium">
        Safe answers · Real-world activities · Quizzes · Reward badges
      </p>
    </div>
  );
}
