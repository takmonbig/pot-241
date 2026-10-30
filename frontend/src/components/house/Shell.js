import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { HowToPlay } from "@/components/HowToPlay";
import { GAME_META, art } from "@/lib/games";

const SUIT = { S: "♠", H: "♥", D: "♦", C: "♣" };
const RANK = { 1: "A", 11: "J", 12: "Q", 13: "K", 14: "A" };

export function PlayingCard({ c, hidden, i = 0, small }) {
  const red = c && (c.suit === "H" || c.suit === "D");
  const sz = small ? "h-14 w-10 text-sm" : "h-20 w-14 text-lg";
  return (
    <motion.div initial={{ opacity: 0, y: -24, rotateY: 90 }} animate={{ opacity: 1, y: 0, rotateY: 0 }} transition={{ delay: i * 0.12, duration: 0.3 }}
      className={`${sz} shrink-0 rounded-lg border flex flex-col items-center justify-center font-extrabold shadow-lg ${hidden ? "bg-gradient-to-br from-amber-500 to-amber-800 border-amber-300" : "bg-white border-amber-300"}`}
      data-testid="playing-card">
      {!hidden && c && <><span className={red ? "text-red-600" : "text-black"}>{RANK[c.rank] || c.rank}</span><span className={red ? "text-red-600" : "text-black"}>{SUIT[c.suit]}</span></>}
    </motion.div>
  );
}

export function GameShell({ k, children, right }) {
  const g = GAME_META[k];
  return (
    <div className="mx-auto max-w-xl px-4 py-4 pb-40" data-testid={`game-${k}`}>
      <div className="flex items-center gap-2 mb-3">
        <Link to="/home" data-testid={`${k}-back`} className="h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center"><ArrowLeft className="h-4 w-4" /></Link>
        <h1 className="font-display text-2xl uppercase tracking-wide pz-gold-text">{g.name}</h1>
        <HowToPlay k={k} />
        {right}
      </div>
      <div className="relative h-24 rounded-2xl overflow-hidden border border-amber-400/30 mb-4">
        <img src={art(k)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-transparent" />
        <div className="relative h-full flex items-center px-4"><g.icon className="h-7 w-7 mr-2" style={{ color: g.color }} /><span className="text-sm text-white/80 max-w-[70%]">{g.steps[g.steps.length - 1]}</span></div>
      </div>
      {children}
    </div>
  );
}

export function QuickBet({ bet, setBet, min = 10, disabled, prefix }) {
  return (
    <div className="space-y-2" data-testid={`${prefix}-bet`}>
      <div className="flex items-center justify-between rounded-xl bg-black/60 border border-amber-400/25 px-3 py-2">
        <span className="text-xs uppercase tracking-widest text-white/50">Bet amount</span>
        <div className="flex items-center gap-2">
          <button disabled={disabled} onClick={() => setBet(Math.max(min, bet - 10))} className="h-7 w-7 rounded-full bg-white/10 font-bold" data-testid={`${prefix}-bet-minus`}>−</button>
          <input value={bet} disabled={disabled} onChange={(e) => setBet(Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0))}
            className="w-20 bg-transparent text-center font-mono-pz text-lg font-bold text-amber-200 outline-none" data-testid={`${prefix}-bet-input`} />
          <button disabled={disabled} onClick={() => setBet(bet + 10)} className="h-7 w-7 rounded-full bg-white/10 font-bold" data-testid={`${prefix}-bet-plus`}>+</button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[100, 500, 1000, 5000].map((v) => (
          <button key={v} disabled={disabled} onClick={() => setBet(bet + v)} data-testid={`${prefix}-add-${v}`}
            className="rounded-lg bg-white/5 border border-white/10 py-1.5 text-xs font-bold hover:border-amber-300/60">+{v}</button>
        ))}
      </div>
    </div>
  );
}
