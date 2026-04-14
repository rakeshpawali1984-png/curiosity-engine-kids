const CARD_STYLES = [
  "bg-purple-100 hover:bg-purple-200 border-purple-300 hover:border-purple-400",
  "bg-violet-100 hover:bg-violet-200 border-violet-300 hover:border-violet-400",
  "bg-fuchsia-100 hover:bg-fuchsia-200 border-fuchsia-300 hover:border-fuchsia-400",
  "bg-indigo-100 hover:bg-indigo-200 border-indigo-300 hover:border-indigo-400",
  "bg-sky-100 hover:bg-sky-200 border-sky-300 hover:border-sky-400",
  "bg-pink-100 hover:bg-pink-200 border-pink-300 hover:border-pink-400",
  "bg-rose-100 hover:bg-rose-200 border-rose-300 hover:border-rose-400",
  "bg-blue-100 hover:bg-blue-200 border-blue-300 hover:border-blue-400",
  "bg-purple-200 hover:bg-purple-300 border-purple-300 hover:border-purple-400",
  "bg-purple-50 hover:bg-purple-100 border-purple-200 hover:border-purple-300",
];

export default function HomeScreen({ topics, onSelect }) {
  return (
    <div className="flex flex-col items-center">
      {/* Header */}
      <div className="text-center mb-6 mt-4">
        <h1 className="text-4xl font-black text-purple-700 mb-2">
          Ask Anything 🔍
        </h1>
        <p className="text-gray-500 text-lg">
          Pick a topic and start your adventure!
        </p>
      </div>

      {/* Topic Cards */}
      <div className="grid grid-cols-1 gap-4 w-full">
        {topics.map((topic, index) => (
          <button
            key={topic.id}
            onClick={() => onSelect(topic)}
            className={`w-full flex items-center gap-4 p-5 rounded-3xl border transition-all duration-200 text-left shadow-sm hover:shadow-md active:scale-95 ${CARD_STYLES[index % CARD_STYLES.length]}`}
          >
            <span className="text-4xl">{topic.emoji}</span>
            <span className="text-xl font-bold text-gray-800 leading-snug">
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
