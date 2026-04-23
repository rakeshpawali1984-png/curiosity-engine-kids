const GAMES = [
  { id: "catch",      emoji: "🎣", name: "Catch!",       desc: "Tap the right things" },
  { id: "flashfacts", emoji: "🧠", name: "Flash Facts",  desc: "True or False — quick!" },
  { id: "sortit",     emoji: "🗂️", name: "Sort It",      desc: "Group things together" },
  { id: "speedtap",   emoji: "⚡", name: "Speed Tap",    desc: "Tap it before it moves" },
];

export default function GameLauncher({ onSelect }) {
  return (
    <div className="mb-5">
      <p className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-3 text-center">🎮 Play a game</p>
      <div className="grid grid-cols-2 gap-2">
        {GAMES.map((game) => (
          <button
            key={game.id}
            onClick={() => onSelect(game.id)}
            className="flex items-center gap-3 bg-white border-2 border-purple-100 hover:border-purple-300 hover:bg-purple-50 rounded-2xl px-4 py-3 transition-all active:scale-95 text-left shadow-sm"
          >
            <span className="text-2xl">{game.emoji}</span>
            <div>
              <p className="text-sm font-black text-slate-700 leading-tight">{game.name}</p>
              <p className="text-xs text-slate-400">{game.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
