import { useRef } from "react";

export default function FamilyTopBar({
  activeChild,
  onOpenJourney,
  onOpenParentPortal,
  currentView = "app",
  compact = false,
}) {
  const holdTimerRef = useRef(null);

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const startParentHold = () => {
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      onOpenParentPortal?.();
    }, 2500);
  };

  return (
    <div
      className={`bg-white/85 backdrop-blur rounded-2xl border border-purple-100 px-3 ${
        compact ? "py-2 mb-3" : "py-2 mb-4"
      } flex items-center justify-between gap-3`}
    >
      <div
        className="min-w-0 select-none"
        onPointerDown={startParentHold}
        onPointerUp={clearHoldTimer}
        onPointerLeave={clearHoldTimer}
        onPointerCancel={clearHoldTimer}
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">
          Explorer
        </p>
        <p className="truncate text-sm font-black text-purple-700">
          {activeChild?.avatar_emoji || "🧠"} {activeChild?.name || "Unknown"}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {onOpenJourney && (
          <button
            onClick={onOpenJourney}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
              currentView === "journey"
                ? "bg-purple-100 text-purple-700"
                : "bg-purple-50 text-purple-600 hover:bg-purple-100 hover:text-purple-700"
            }`}
          >
            Journey
          </button>
        )}
      </div>
    </div>
  );
}
