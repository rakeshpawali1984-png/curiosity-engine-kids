const CARD_STYLES = [
  "bg-purple-50 hover:bg-purple-100 border-purple-200 hover:border-purple-300",
  "bg-indigo-50 hover:bg-indigo-100 border-indigo-200 hover:border-indigo-300",
  "bg-violet-50 hover:bg-violet-100 border-violet-200 hover:border-violet-300",
];

export default function HomeScreen({ topics, onSelect, onBrandClick }) {
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

      <p className="text-gray-400 text-sm mt-8 mb-4 text-center font-medium">
        Safe answers · Real-world activities · Quizzes · Reward badges
      </p>
    </div>
  );
}
