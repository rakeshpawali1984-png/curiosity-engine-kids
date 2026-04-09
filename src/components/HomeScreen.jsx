const CARD_STYLES = [
  "bg-orange-100 hover:bg-orange-200 border-orange-300 hover:border-orange-400",
  "bg-green-100 hover:bg-green-200 border-green-300 hover:border-green-400",
  "bg-violet-100 hover:bg-violet-200 border-violet-300 hover:border-violet-400",
  "bg-blue-100 hover:bg-blue-200 border-blue-300 hover:border-blue-400",
  "bg-teal-100 hover:bg-teal-200 border-teal-300 hover:border-teal-400",
  "bg-pink-100 hover:bg-pink-200 border-pink-300 hover:border-pink-400",
  "bg-yellow-100 hover:bg-yellow-200 border-yellow-300 hover:border-yellow-400",
  "bg-rose-100 hover:bg-rose-200 border-rose-300 hover:border-rose-400",
  "bg-cyan-100 hover:bg-cyan-200 border-cyan-300 hover:border-cyan-400",
  "bg-lime-100 hover:bg-lime-200 border-lime-300 hover:border-lime-400",
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
            className={`w-full flex items-center gap-4 p-5 rounded-3xl border-2 transition-all duration-200 text-left shadow-sm hover:shadow-md active:scale-95 ${CARD_STYLES[index % CARD_STYLES.length]}`}
          >
            <span className="text-4xl">{topic.emoji}</span>
            <span className="text-xl font-bold text-gray-800 leading-snug">
              {topic.title}
            </span>
          </button>
        ))}
      </div>

      <p className="text-gray-400 text-sm mt-8 mb-4">
        {topics.length} topics · Stories · Quizzes · Badges
      </p>
    </div>
  );
}
