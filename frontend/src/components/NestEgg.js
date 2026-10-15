import { motion, AnimatePresence } from "framer-motion";

const COINS = Array.from({ length: 10 }, (_, i) => i);

function Nest() {
  return (
    <svg viewBox="0 0 200 70" className="absolute bottom-0 left-1/2 -translate-x-1/2 w-56" aria-hidden>
      <ellipse cx="100" cy="40" rx="92" ry="26" fill="#5b3a1a" />
      {Array.from({ length: 14 }, (_, i) => (
        <path key={i} d={`M${12 + i * 13} ${30 + (i % 3) * 6} q 22 ${i % 2 ? -14 : 14} 44 0`} stroke={i % 2 ? "#a06a32" : "#7a4a20"} strokeWidth="5" fill="none" strokeLinecap="round" />
      ))}
      <ellipse cx="100" cy="24" rx="70" ry="12" fill="#2b1708" />
    </svg>
  );
}

/** Golden egg in a nest that wobbles, cracks open and reveals the amount. */
export function NestEggReveal({ show, amount, sub, onDone }) {
  return (
    <AnimatePresence onExitComplete={onDone}>
      {show && (
        <motion.div key="nest" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="chicken-nest-reveal"
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/70">
          <div className="relative h-64 w-64">
            <Nest />
            <motion.div className="absolute left-1/2 bottom-8 -translate-x-1/2 h-28 w-20"
              initial={{ y: -160, rotate: 0 }} animate={{ y: 0, rotate: [0, -12, 12, -10, 10, 0] }}
              transition={{ y: { type: "spring", stiffness: 180, damping: 14 }, rotate: { delay: 0.5, duration: 0.8 } }}>
              <motion.div className="absolute inset-x-0 top-0 h-1/2 overflow-hidden" initial={{ y: 0, rotate: 0 }}
                animate={{ y: -46, x: -18, rotate: -35, opacity: [1, 1, 0.9] }} transition={{ delay: 1.35, duration: 0.5 }}>
                <div className="h-28 w-20 rounded-[50%_50%_46%_46%/60%_60%_40%_40%] bg-gradient-to-br from-yellow-200 via-amber-400 to-amber-600 shadow-[0_0_40px_rgba(251,191,36,.8)]" />
              </motion.div>
              <div className="absolute inset-x-0 bottom-0 h-1/2 overflow-hidden">
                <div className="absolute bottom-0 h-28 w-20 rounded-[50%_50%_46%_46%/60%_60%_40%_40%] bg-gradient-to-br from-yellow-200 via-amber-400 to-amber-600 shadow-[0_0_40px_rgba(251,191,36,.8)]" />
              </div>
            </motion.div>
            {COINS.map((i) => (
              <motion.span key={i} className="absolute left-1/2 bottom-20 h-4 w-4 rounded-full bg-amber-300 border border-amber-600"
                initial={{ opacity: 0, x: 0, y: 0 }} animate={{ opacity: [0, 1, 0], x: (i - 4.5) * 22, y: -90 - (i % 3) * 25 }}
                transition={{ delay: 1.45 + i * 0.03, duration: 1.1 }} />
            ))}
            <motion.div className="absolute inset-x-0 top-6 text-center" initial={{ opacity: 0, scale: 0.4, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: 1.5, type: "spring", stiffness: 220 }}>
              <div className="text-[11px] uppercase tracking-[0.3em] text-amber-200">Golden nest</div>
              <div className="font-mono-pz text-4xl font-extrabold text-amber-300 drop-shadow-[0_0_14px_rgba(251,191,36,.9)]" data-testid="chicken-nest-amount">{amount}</div>
              {sub && <div className="text-xs text-white/70">{sub}</div>}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
