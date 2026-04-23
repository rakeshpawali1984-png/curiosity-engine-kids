export default function GameShell({ title, emoji, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <span className="text-lg font-black text-slate-800">{emoji} {title}</span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 font-bold text-xl leading-none transition-colors"
            aria-label="Close game"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}
