export default function GameShell({ title, emoji, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-purple-400">Mini Game</p>
            <p className="text-lg font-black text-slate-800">{emoji} {title}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-2xl leading-none font-bold px-1"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
