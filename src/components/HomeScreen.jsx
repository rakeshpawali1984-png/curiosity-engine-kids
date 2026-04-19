const CARD_STYLES = [
  "bg-purple-50 hover:bg-purple-100 border-purple-200 hover:border-purple-300",
  "bg-indigo-50 hover:bg-indigo-100 border-indigo-200 hover:border-indigo-300",
  "bg-violet-50 hover:bg-violet-100 border-violet-200 hover:border-violet-300",
];

export default function HomeScreen({
  topics,
  onSelect,
  onBrandClick,
  demoMode = false,
  onAskGrownUp,
  onUnlockAskAnything,
  demoAskQuestion = "",
  onDemoAskQuestionChange,
  onDemoAsk,
  demoAskLoading = false,
  demoAskError = "",
  demoAskUsed = false,
  demoAskMaxChars = 120,
}) {
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
        <div className="w-full mt-1 mb-3 bg-white rounded-3xl shadow-lg p-5 border-2 border-purple-100">
          <label className="block text-xs font-bold uppercase tracking-wider text-purple-500 mb-2">
            Ask anything
          </label>
          <textarea
            value={demoAskQuestion}
            onChange={(event) => {
              const next = event.target.value.slice(0, demoAskMaxChars);
              onDemoAskQuestionChange?.(next);
            }}
            disabled={demoAskLoading || demoAskUsed}
            rows={3}
            placeholder="What are you curious about? e.g. Why is the ocean salty?"
            className="w-full border-2 border-purple-100 focus:border-purple-400 bg-purple-50 focus:bg-white rounded-2xl p-4 text-base text-gray-800 placeholder:text-gray-400 resize-none outline-none transition-all disabled:opacity-70 disabled:cursor-not-allowed"
            aria-label="Ask anything"
          />
          <div className="mt-2 flex justify-end">
            <p className="text-xs text-gray-400">
              {demoAskQuestion.length}/{demoAskMaxChars}
            </p>
          </div>

          {!demoAskUsed ? (
            <button
              type="button"
              onClick={() => onDemoAsk?.()}
              disabled={demoAskLoading || !demoAskQuestion.trim()}
              className={`mt-4 w-full text-white font-black py-5 rounded-2xl text-xl transition-all hover:scale-105 active:scale-95 shadow-md ${demoAskQuestion.trim() && !demoAskLoading ? "bg-purple-500 hover:bg-purple-600" : "bg-purple-300 animate-pulse cursor-not-allowed"}`}
            >
              {demoAskLoading ? "Exploring..." : "Explore →"}
            </button>
          ) : (
            <div className="mt-4">
              <p className="text-sm font-semibold text-amber-700 text-center">
                Great question! Explore more with a grown-up.
              </p>
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
                  Continue exploring with a grown-up
                </button>
              </div>
            </div>
          )}

          {demoAskError ? (
            <p className="mt-3 text-sm text-red-600 font-semibold text-center">{demoAskError}</p>
          ) : null}

          {!demoAskUsed ? (
            <p className="mt-3 text-sm text-slate-500">Try a few asks in demo. Sign in with a grown-up for unlimited questions.</p>
          ) : null}
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
