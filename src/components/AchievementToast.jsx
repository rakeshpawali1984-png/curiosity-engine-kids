import { useEffect, useState } from "react";

export default function AchievementToast({ badge, onDismiss }) {
  const [shown, setShown] = useState(false);
  const [localBadge, setLocalBadge] = useState(null);

  useEffect(() => {
    if (!badge) return;

    setLocalBadge(badge);

    const showTimer = setTimeout(() => setShown(true), 20);

    const hideTimer = setTimeout(() => {
      setShown(false);
      setTimeout(() => {
        setLocalBadge(null);
        onDismiss?.();
      }, 400);
    }, 2800);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [badge]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!localBadge) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-3 right-3 z-50 pointer-events-none transition-all duration-300 ${
        shown ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4"
      }`}
    >
      <div className="flex items-center gap-1.5 rounded-full bg-white border border-purple-200 shadow-md px-4 py-2 whitespace-nowrap">
        <span className="text-sm">✨</span>
        <span className="text-sm font-bold text-slate-700">{localBadge.label}</span>
      </div>
    </div>
  );
}
