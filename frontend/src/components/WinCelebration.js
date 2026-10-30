import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Coins, Trophy } from "lucide-react";
import { fbTrack } from "@/lib/siteConfig";

// Global helper — trigger a win celebration anywhere: showWin(prize)
export function showWin(prize) {
  window.dispatchEvent(new CustomEvent("pazer:win", { detail: { prize } }));
}

// Short celebratory chord using the Web Audio API (no asset files needed)
function playWinSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.value = freq;
      const t = ctx.currentTime + i * 0.09;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.28, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.5);
    });
    setTimeout(() => ctx.close(), 1400);
  } catch (e) { /* ignore */ }
}

const COINS = Array.from({ length: 22 });

export function WinCelebrationHost() {
  const [win, setWin] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      setWin({ prize: e.detail?.prize || 0, key: Date.now() });
      playWinSound();
      fbTrack("win", { value: e.detail?.prize || 0, currency: "INR" });
      clearTimeout(window.__pzWinT);
      window.__pzWinT = setTimeout(() => setWin(null), 2600);
    };
    window.addEventListener("pazer:win", handler);
    return () => window.removeEventListener("pazer:win", handler);
  }, []);

  return (
    <AnimatePresence>
      {win && (
        <motion.div key={win.key} className="fixed inset-0 z-[110] flex items-center justify-center pointer-events-none overflow-hidden"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="win-celebration">
          {/* coin burst */}
          {COINS.map((_, i) => {
            const angle = (i / COINS.length) * Math.PI * 2;
            const dist = 160 + Math.random() * 220;
            const x = Math.cos(angle) * dist;
            const y = Math.sin(angle) * dist - 60;
            return (
              <motion.div key={i} className="absolute"
                initial={{ x: 0, y: 0, scale: 0.4, opacity: 1 }}
                animate={{ x, y: y + 260, scale: 1, opacity: 0, rotate: Math.random() * 360 }}
                transition={{ duration: 1.4 + Math.random() * 0.5, ease: "easeOut" }}>
                <Coins className="h-6 w-6 text-yellow-400" style={{ filter: "drop-shadow(0 0 6px rgba(250,204,21,0.8))" }} />
              </motion.div>
            );
          })}
          {/* center badge */}
          <motion.div
            initial={{ scale: 0.4, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.6, opacity: 0 }} transition={{ type: "spring", stiffness: 260, damping: 16 }}
            className="relative flex flex-col items-center px-10 py-8 rounded-3xl pz-glass border border-green-400/50 pz-glow-box">
            <Trophy className="h-14 w-14 text-yellow-400 mb-3" style={{ filter: "drop-shadow(0 0 12px rgba(250,204,21,0.7))" }} />
            <div className="font-display font-extrabold text-3xl text-white">You Won!</div>
            <div className="font-mono-pz font-extrabold text-4xl text-green-400 mt-1" data-testid="win-prize">+{Number(win.prize).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
            <div className="text-white/50 text-xs uppercase tracking-widest mt-1">coins</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
