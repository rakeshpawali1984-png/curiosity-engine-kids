import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const THEMES = {
  ocean: {
    name: "Ocean Catch",
    emoji: "🌊",
    bg: "#e0f2fe",
    instruction: "Tap the ocean creatures!",
    hint: "ocean things",
    correct: ["🐠", "🐙", "🦈", "🐚", "🦀", "🐬", "🐳", "🦑"],
    wrong:   ["🌵", "🏔️", "🦁", "🐘", "🎸", "🌹", "🍕", "🔥"],
  },
  space: {
    name: "Space Catch",
    emoji: "🚀",
    bg: "#ede9fe",
    instruction: "Tap the space things!",
    hint: "space things",
    correct: ["⭐", "🌙", "🚀", "🪐", "☄️", "🌟", "🛸", "👨‍🚀"],
    wrong:   ["🐠", "🌊", "🌲", "🌹", "🚗", "🍕", "🎸", "🦁"],
  },
  default: {
    name: "Curiosity Catch",
    emoji: "🧠",
    bg: "#fdf4ff",
    instruction: "Tap the science things!",
    hint: "science things",
    correct: ["🔬", "🧪", "⚡", "🌈", "🧲", "💡", "🔭", "🧬"],
    wrong:   ["🎮", "🍕", "👟", "🎸", "🎪", "💄", "🎀", "🏈"],
  },
};

const DURATION   = 30;   // seconds
const TARGET     = 10;   // correct catches to win
const FONT_SIZE  = 38;   // px
const SPAWN_MS   = 850;  // ms between spawns
const MAX_ITEMS  = 9;
const HIT_RADIUS = FONT_SIZE * 0.9;

function makeItem(canvasWidth, theme) {
  const isCorrect = Math.random() > 0.42;
  const pool = isCorrect ? theme.correct : theme.wrong;
  const emoji = pool[Math.floor(Math.random() * pool.length)];
  return {
    id: Math.random(),
    emoji,
    isCorrect,
    x: FONT_SIZE + Math.random() * (canvasWidth - FONT_SIZE * 2),
    y: -FONT_SIZE,
    speed: 1.1 + Math.random() * 1.6,
    opacity: 1,
  };
}

export default function MiniGame({ category = "default", onClose }) {
  const theme = THEMES[category] || THEMES.default;
  const canvasRef  = useRef(null);
  const gameRef    = useRef({
    items: [], score: 0, timeLeft: DURATION,
    phase: "idle", lastSpawn: 0, startTime: 0, rafId: null,
  });
  const [display, setDisplay] = useState({ score: 0, timeLeft: DURATION, phase: "idle" });

  // Size canvas to container
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const setSize = () => {
      const w = canvas.parentElement?.clientWidth || 340;
      canvas.width  = w;
      canvas.height = 300;
    };
    setSize();
    const ro = new ResizeObserver(setSize);
    ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font      = `${FONT_SIZE}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const item of gameRef.current.items) {
      ctx.globalAlpha = item.opacity;
      ctx.fillText(item.emoji, item.x, item.y);
    }
    ctx.globalAlpha = 1;
  }, []);

  const tick = useCallback((ts) => {
    const g = gameRef.current;
    if (g.phase !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const elapsed = (ts - g.startTime) / 1000;
    g.timeLeft = Math.max(0, DURATION - elapsed);

    // Spawn
    if (ts - g.lastSpawn > SPAWN_MS && g.items.length < MAX_ITEMS) {
      g.items.push(makeItem(canvas.width, theme));
      g.lastSpawn = ts;
    }

    // Move
    for (const item of g.items) item.y += item.speed;

    // Remove off-screen
    g.items = g.items.filter((item) => item.y < canvas.height + FONT_SIZE);

    draw();

    const timeInt = Math.ceil(g.timeLeft);
    setDisplay({ score: g.score, timeLeft: timeInt, phase: "playing" });

    if (g.score >= TARGET) {
      g.phase = "won";
      setDisplay({ score: g.score, timeLeft: timeInt, phase: "won" });
      return;
    }
    if (g.timeLeft <= 0) {
      g.phase = "lost";
      setDisplay({ score: g.score, timeLeft: 0, phase: "lost" });
      return;
    }

    g.rafId = requestAnimationFrame(tick);
  }, [theme, draw]);

  const startGame = useCallback(() => {
    const g = gameRef.current;
    if (g.rafId) cancelAnimationFrame(g.rafId);
    g.items     = [];
    g.score     = 0;
    g.timeLeft  = DURATION;
    g.phase     = "playing";
    g.lastSpawn = 0;
    g.startTime = performance.now();
    setDisplay({ score: 0, timeLeft: DURATION, phase: "playing" });
    g.rafId = requestAnimationFrame(tick);
  }, [tick]);

  const handleTap = useCallback((clientX, clientY) => {
    const g = gameRef.current;
    if (g.phase !== "playing") return;
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top)  * scaleY;

    for (let i = g.items.length - 1; i >= 0; i--) {
      const item = g.items[i];
      const dx = item.x - x, dy = item.y - y;
      if (Math.sqrt(dx * dx + dy * dy) < HIT_RADIUS) {
        if (item.isCorrect) g.score += 1;
        g.items.splice(i, 1);
        setDisplay((d) => ({ ...d, score: g.score }));
        break;
      }
    }
  }, []);

  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    const touch = e.touches?.[0] ?? e;
    handleTap(touch.clientX ?? e.clientX, touch.clientY ?? e.clientY);
  }, [handleTap]);

  useEffect(() => {
    return () => {
      const g = gameRef.current;
      if (g.rafId) cancelAnimationFrame(g.rafId);
    };
  }, []);

  const phase = display.phase;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-purple-400">Reward Game 🎮</p>
            <p className="text-lg font-black text-slate-800">{theme.emoji} {theme.name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-2xl leading-none font-bold"
          >×</button>
        </div>

        {/* Score bar */}
        {phase === "playing" && (
          <div className="flex items-center justify-between px-5 py-2 bg-purple-50">
            <span className="text-sm font-bold text-purple-700">⭐ {display.score} / {TARGET}</span>
            <span className={`text-sm font-bold ${display.timeLeft <= 10 ? "text-rose-500" : "text-slate-600"}`}>
              ⏱ {display.timeLeft}s
            </span>
          </div>
        )}

        {/* Canvas area */}
        <div className="relative select-none" style={{ background: theme.bg }}>
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            className="block w-full"
            style={{ touchAction: "none", height: 300, cursor: "pointer" }}
          />

          {phase === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/80 backdrop-blur-sm">
              <p className="text-5xl">{theme.emoji}</p>
              <p className="text-base font-bold text-slate-700">{theme.instruction}</p>
              <p className="text-xs text-slate-400">Catch {TARGET} correct ones in {DURATION}s</p>
              <button
                onClick={startGame}
                className="mt-2 bg-purple-600 text-white font-black px-8 py-3 rounded-2xl text-lg hover:bg-purple-700 active:scale-95 transition-all shadow-md"
              >
                Let&apos;s go! 🚀
              </button>
            </div>
          )}

          {phase === "won" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/90 backdrop-blur-sm">
              <p className="text-5xl">🏆</p>
              <p className="text-xl font-black text-emerald-700">You got it!</p>
              <p className="text-sm text-slate-500">Caught {display.score} {theme.hint}</p>
              <div className="flex gap-3 mt-2">
                <button onClick={startGame} className="bg-purple-600 text-white font-bold px-5 py-2.5 rounded-2xl text-sm hover:bg-purple-700 transition-all">Play again</button>
                <button onClick={onClose}   className="bg-slate-100 text-slate-700 font-bold px-5 py-2.5 rounded-2xl text-sm hover:bg-slate-200 transition-all">Back to exploring</button>
              </div>
            </div>
          )}

          {phase === "lost" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/90 backdrop-blur-sm">
              <p className="text-5xl">😅</p>
              <p className="text-xl font-black text-slate-700">Almost!</p>
              <p className="text-sm text-slate-500">You caught {display.score} — need {TARGET}</p>
              <div className="flex gap-3 mt-2">
                <button onClick={startGame} className="bg-purple-600 text-white font-bold px-5 py-2.5 rounded-2xl text-sm hover:bg-purple-700 transition-all">Try again</button>
                <button onClick={onClose}   className="bg-slate-100 text-slate-700 font-bold px-5 py-2.5 rounded-2xl text-sm hover:bg-slate-200 transition-all">Back to exploring</button>
              </div>
            </div>
          )}
        </div>

        {phase === "idle" && (
          <p className="text-center text-xs text-slate-400 py-3">
            Tap only the {theme.hint} — wrong ones don&apos;t count!
          </p>
        )}
      </div>
    </div>
  );
}
