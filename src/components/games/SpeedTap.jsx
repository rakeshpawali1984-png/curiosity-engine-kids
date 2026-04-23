import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import GameShell from "./GameShell";

const GRID      = 3;
const CELL      = 90;
const SHOW_MS   = 1300;
const ROUNDS    = 10;
const TARGETS   = ["⭐", "🦘", "🔬", "🌈", "⚡", "💡", "🧪", "🌟", "🎯", "🔥", "🐙", "🦋"];

function drawGrid(ctx, canvasWidth, activeCell, targetEmoji, phase) {
  const padding = (canvasWidth - GRID * CELL) / 2;
  ctx.clearRect(0, 0, canvasWidth, GRID * CELL);

  for (let i = 0; i < GRID * GRID; i++) {
    const col = i % GRID;
    const row = Math.floor(i / GRID);
    const x = padding + col * CELL + 5;
    const y = row * CELL + 5;
    const w = CELL - 10;
    const h = CELL - 10;
    const r = 16;

    const isActive = i === activeCell && phase === "playing";
    ctx.fillStyle   = isActive ? "#ede9fe" : "#f8fafc";
    ctx.strokeStyle = isActive ? "#8b5cf6" : "#e2e8f0";
    ctx.lineWidth   = isActive ? 2.5 : 1.5;

    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();

    if (isActive) {
      ctx.font         = "40px serif";
      ctx.textAlign    = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle    = "#1e293b";
      ctx.fillText(targetEmoji, padding + col * CELL + CELL / 2, row * CELL + CELL / 2);
    }
  }
}

export default function SpeedTap({ onClose }) {
  const canvasRef = useRef(null);
  const gRef      = useRef({ phase: "idle", activeCell: -1, target: "", timer: null, round: 0, score: 0 });
  const [display, setDisplay] = useState({ phase: "idle", round: 0, score: 0 });

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = gRef.current;
    drawGrid(canvas.getContext("2d"), canvas.width, g.activeCell, g.target, g.phase);
  }, []);

  const nextRound = useCallback(() => {
    const g = gRef.current;
    if (g.round >= ROUNDS) {
      g.phase = "done";
      g.activeCell = -1;
      redraw();
      setDisplay({ phase: "done", round: ROUNDS, score: g.score });
      return;
    }
    g.activeCell = Math.floor(Math.random() * GRID * GRID);
    g.target     = TARGETS[Math.floor(Math.random() * TARGETS.length)];
    g.phase      = "playing";
    redraw();
    g.timer = setTimeout(() => {
      g.round      += 1;
      g.activeCell  = -1;
      redraw();
      setDisplay({ phase: "playing", round: g.round, score: g.score });
      setTimeout(nextRound, 350);
    }, SHOW_MS);
  }, [redraw]);

  const startGame = useCallback(() => {
    const g = gRef.current;
    if (g.timer) clearTimeout(g.timer);
    g.phase      = "playing";
    g.round      = 0;
    g.score      = 0;
    g.activeCell = -1;
    setDisplay({ phase: "playing", round: 0, score: 0 });
    setTimeout(nextRound, 400);
  }, [nextRound]);

  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    const g = gRef.current;
    if (g.phase !== "playing" || g.activeCell === -1) return;
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const x  = (e.clientX - rect.left) * sx;
    const y  = (e.clientY - rect.top)  * sy;
    const padding = (canvas.width - GRID * CELL) / 2;
    const col = Math.floor((x - padding) / CELL);
    const row = Math.floor(y / CELL);
    if (col < 0 || col >= GRID || row < 0 || row >= GRID) return;
    if (row * GRID + col === g.activeCell) {
      clearTimeout(g.timer);
      g.score      += 1;
      g.round      += 1;
      g.activeCell  = -1;
      redraw();
      setDisplay({ phase: "playing", round: g.round, score: g.score });
      setTimeout(nextRound, 300);
    }
  }, [redraw, nextRound]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const setSize = () => {
      canvas.width  = canvas.parentElement?.clientWidth || 320;
      canvas.height = GRID * CELL;
      redraw();
    };
    setSize();
    const ro = new ResizeObserver(setSize);
    ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, [redraw]);

  useEffect(() => () => { if (gRef.current.timer) clearTimeout(gRef.current.timer); }, []);

  const { phase, round, score } = display;

  return (
    <GameShell title="Speed Tap" emoji="⚡" onClose={onClose}>
      {phase === "playing" && (
        <div className="flex justify-between px-5 py-2 bg-purple-50 text-sm font-bold">
          <span className="text-purple-700">⭐ {score} / {ROUNDS}</span>
          <span className="text-slate-500">Round {Math.min(round + 1, ROUNDS)} / {ROUNDS}</span>
        </div>
      )}

      <div className="relative bg-slate-50" style={{ minHeight: GRID * CELL }}>
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          className="block w-full"
          style={{ touchAction: "none", cursor: "pointer" }}
        />

        {phase === "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/90 backdrop-blur-sm">
            <p className="text-5xl">⚡</p>
            <p className="text-base font-bold text-slate-700">Tap the emoji the moment it appears!</p>
            <p className="text-xs text-slate-400">It moves fast — stay sharp</p>
            <button onClick={startGame} className="mt-2 bg-purple-600 text-white font-black px-8 py-3 rounded-2xl text-lg hover:bg-purple-700 active:scale-95 transition-all shadow-md">
              Let&apos;s go! 🚀
            </button>
          </div>
        )}

        {phase === "done" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/90 backdrop-blur-sm">
            <p className="text-5xl">{score >= ROUNDS * 0.8 ? "🏆" : score >= ROUNDS * 0.5 ? "🌟" : "😅"}</p>
            <p className="text-xl font-black text-slate-800">You tapped {score} / {ROUNDS}!</p>
            <p className="text-sm text-slate-400">{score >= ROUNDS * 0.8 ? "Lightning fast! 🔥" : score >= ROUNDS * 0.5 ? "Quick reflexes!" : "Keep practising!"}</p>
            <div className="flex gap-3 mt-1">
              <button onClick={startGame} className="bg-purple-600 text-white font-bold px-5 py-2.5 rounded-2xl text-sm hover:bg-purple-700 transition-all">Play again</button>
              <button onClick={onClose} className="bg-slate-100 text-slate-700 font-bold px-5 py-2.5 rounded-2xl text-sm hover:bg-slate-200 transition-all">Back</button>
            </div>
          </div>
        )}
      </div>
    </GameShell>
  );
}
