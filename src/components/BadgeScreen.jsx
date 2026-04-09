export default function BadgeScreen({ topic, onHome }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[75vh] text-center px-2">
      {/* Trophy animation */}
      <div className="text-8xl mb-4 animate-bounce">🏆</div>

      <h1 className="text-3xl font-black text-purple-700 mb-2">
        You did it!
      </h1>
      <p className="text-gray-500 text-lg mb-6 max-w-xs">
        Awesome! You completed the whole {topic.title} adventure.
      </p>

      {/* Badge */}
      <div className="bg-gradient-to-r from-yellow-400 to-orange-400 text-white px-8 py-5 rounded-3xl shadow-xl mb-3">
        <p className="text-xs font-bold uppercase tracking-widest mb-1 opacity-80">
          You unlocked
        </p>
        <p className="text-2xl font-black">{topic.badge}</p>
      </div>

      <p className="text-gray-400 text-sm mb-10">
        Keep exploring — more badges await! ⭐
      </p>

      <button
        onClick={onHome}
        className="bg-purple-500 hover:bg-purple-600 active:scale-95 text-white font-black py-5 px-10 rounded-2xl text-xl transition-all shadow-md"
      >
        🔍 Try Another Topic
      </button>
    </div>
  );
}
