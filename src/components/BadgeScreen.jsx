import { useEffect } from "react";
import confetti from "canvas-confetti";

export default function BadgeScreen({ topic, onHome }) {
  useEffect(() => {
    confetti({
      particleCount: 160,
      spread: 80,
      origin: { y: 0.55 },
      colors: ["#a855f7", "#f59e0b", "#3b82f6", "#10b981", "#f43f5e"],
    });
  }, []);
  return (
    <div className="flex flex-col items-center justify-center min-h-[75vh] text-center px-2">
      {/* Trophy animation */}
      <div className="text-8xl mb-4 animate-bounce">🏆</div>

      <p className="text-xs text-yellow-600 font-bold uppercase tracking-widest mb-1">
        🏆 You unlocked!
      </p>
      <h1 className="text-3xl font-black text-purple-700 mb-1">
        You did it!
      </h1>
      <p className="text-gray-500 text-lg mb-2 max-w-xs">
        You discovered something awesome! 🌟
      </p>
      <p className="text-gray-400 text-sm mb-5 max-w-xs">
        You completed the whole <span className="font-bold text-gray-500">{topic.title}</span> adventure.
      </p>

      {/* Badge */}
      <div className="animate-pop-in bg-gradient-to-r from-yellow-400 to-orange-400 text-white px-8 py-5 rounded-3xl shadow-xl mb-3">
        <p className="text-xs font-bold uppercase tracking-widest mb-1 opacity-80">
          Your badge
        </p>
        <p className="text-2xl font-black">{topic.badge}</p>
      </div>

      <p className="text-gray-400 text-sm mb-10">
        Keep exploring — more badges await! ⭐
      </p>

      <button
        onClick={onHome}
        className="bg-purple-500 hover:bg-purple-600 hover:scale-105 active:scale-95 text-white font-black py-5 px-10 rounded-2xl text-xl transition-all shadow-md"
      >
        Try another adventure 🚀
      </button>
    </div>
  );
}
