import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronRight, Plus, Trophy, ArrowDownToLine, ArrowUpFromLine, Swords, Users, Gift } from "lucide-react";
import api from "@/lib/api";
import { Guide } from "@/components/Guide";
import { LoopVideo } from "@/components/LoopVideo";
import { GAME_META, POPULAR, BET_ON_PLAYER, art } from "@/lib/games";

const VIDEO_GAMES = new Set(["aviator", "tower", "chicken", "vortex", "stack", "stopwatch"]);

function SectionHead({ title, to, testid }) {
  return (
    <div className="flex items-center justify-between mb-3 mt-7">
      <h2 className="font-display text-xl tracking-wide uppercase pz-gold-text">{title}</h2>
      {to && <Link to={to} data-testid={testid} className="text-xs font-bold text-amber-300 flex items-center">View All <ChevronRight className="h-4 w-4" /></Link>}
    </div>
  );
}

function GameTile({ k, i, playing, live }) {
  const g = GAME_META[k];
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="shrink-0 w-[132px]">
      <Link to={g.to} data-testid={`hub-card-${k}`} className="block group">
        <div className="relative aspect-square overflow-hidden rounded-2xl border-2 border-amber-400/40 group-hover:border-amber-300 transition-colors shadow-[0_0_18px_rgba(245,179,1,0.15)]">
          {VIDEO_GAMES.has(k) ? <LoopVideo k={k} className="absolute inset-0 h-full w-full object-cover" /> : <img src={art(k)} alt={g.name} className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />}
          {live && <span className="absolute top-2 right-2 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-extrabold">LIVE</span>}
        </div>
        <div className="mt-2 text-center">
          <div className="font-display text-sm uppercase leading-tight">{g.name}</div>
          <div className="text-[10px] text-green-400 flex items-center justify-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-green-400" />{playing} Playing</div>
        </div>
      </Link>
    </motion.div>
  );
}

function Feed({ title, icon: Icon, items, color, testid }) {
  return (
    <div className="rounded-2xl border border-amber-400/20 bg-black/50 p-3" data-testid={testid}>
      <div className="flex items-center gap-1.5 mb-2 text-xs font-extrabold uppercase" style={{ color }}><Icon className="h-4 w-4" />{title}</div>
      <div className="space-y-1.5">
        {items.length === 0 && <p className="text-[11px] text-white/40">No activity yet</p>}
        {items.slice(0, 4).map((x, i) => (
          <div key={i} className="flex items-center justify-between text-[11px]">
            <span className="text-white/75 truncate">{x.name}</span><span className="font-mono-pz font-bold" style={{ color }}>₹{Math.round(x.amount).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function GamesHub() {
  const [w, setW] = useState(null);
  const [feed, setFeed] = useState({ deposit: [], withdrawal: [], playing: {} });
  useEffect(() => {
    const load = () => {
      api.get("/wallet").then(({ data }) => setW(data)).catch(() => {});
      api.get("/feed/live").then(({ data }) => setFeed(data)).catch(() => {});
    };
    load(); const iv = setInterval(load, 15000);
    window.addEventListener("wallet:refresh", load);
    return () => { clearInterval(iv); window.removeEventListener("wallet:refresh", load); };
  }, []);
  const playing = (k) => (feed.playing?.[k === "stopwatch" ? "fixed" : k] || 0) + 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 pb-44" data-testid="games-hub">
      <Guide />
      <div className="rounded-2xl border border-amber-400/40 bg-gradient-to-br from-[#2a1a03] via-[#120b02] to-black p-4 flex items-center justify-between" data-testid="hub-balance-card">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-amber-200/70">Total Balance</div>
          <div className="font-mono-pz text-3xl font-extrabold pz-gold-text" data-testid="hub-balance">₹{w ? w.total_balance.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "…"}</div>
        </div>
        <Link to="/wallet" data-testid="hub-add-cash" className="inline-flex items-center gap-1.5 rounded-xl bg-pazer-red px-4 py-2.5 font-extrabold text-sm pz-shine"><Plus className="h-4 w-4" /> ADD CASH</Link>
      </div>

      <div className="relative mt-4 overflow-hidden rounded-2xl border border-amber-400/40 h-36" data-testid="hub-jackpot">
        <img src={art("jackpot")} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-transparent" />
        <div className="relative h-full p-4 flex flex-col justify-center">
          <div className="font-display text-3xl tracking-wider pz-gold-text">JACKPOT</div>
          <div className="font-mono-pz text-2xl font-extrabold text-white">₹{feed.jackpot ? Math.round(feed.jackpot.amount).toLocaleString() : "0"}</div>
          <div className="text-[11px] text-white/60 flex items-center gap-1"><Trophy className="h-3 w-3 text-amber-300" />{feed.jackpot ? `Biggest win today · ${feed.jackpot.game}` : "Be today's biggest winner"}</div>
        </div>
      </div>

      <SectionHead title="Popular Games" to="/games/all" testid="hub-popular-all" />
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1" data-testid="hub-popular">
        {POPULAR.map((k, i) => <GameTile key={k} k={k} i={i} playing={playing(k)} />)}
      </div>

      <SectionHead title="Bet on Player" to="/bet-on-player" testid="hub-bop-all" />
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1" data-testid="hub-bet-on-player">
        {BET_ON_PLAYER.map((k, i) => <GameTile key={k} k={k} i={i} playing={playing(k)} live />)}
      </div>

      <div className="grid grid-cols-2 gap-3 mt-6">
        <Link to="/1v1" data-testid="hub-1v1" className="rounded-2xl border border-amber-400/30 bg-black/50 p-4 flex items-center gap-3 hover:border-amber-300"><Swords className="h-6 w-6 text-amber-300" /><div><div className="font-display">1v1 Duels</div><div className="text-[11px] text-white/50">Same round, best wins</div></div></Link>
        <Link to="/multiplayer" data-testid="hub-rooms" className="rounded-2xl border border-amber-400/30 bg-black/50 p-4 flex items-center gap-3 hover:border-amber-300"><Users className="h-6 w-6 text-amber-300" /><div><div className="font-display">Rooms</div><div className="text-[11px] text-white/50">Race up to 8 players</div></div></Link>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-6">
        <Feed title="Live Deposits" icon={ArrowDownToLine} items={feed.deposit || []} color="#4ade80" testid="hub-live-deposits" />
        <Feed title="Live Withdrawals" icon={ArrowUpFromLine} items={feed.withdrawal || []} color="#fbbf24" testid="hub-live-withdrawals" />
      </div>

      <div className="relative mt-6 overflow-hidden rounded-2xl border border-amber-400/40 bg-gradient-to-r from-[#2a1a03] to-black p-4 pr-32 min-h-[130px]" data-testid="hub-refer">
        <img src={art("refer")} alt="" className="absolute right-0 bottom-0 h-full w-32 object-cover object-top" />
        <div className="flex items-center gap-1.5 font-display text-xl pz-gold-text"><Gift className="h-5 w-5 text-amber-300" />REFER &amp; EARN</div>
        <p className="text-xs text-white/70 mt-1">Invite friends and earn commission on every game they play, for life.</p>
        <Link to="/profile#referral" data-testid="hub-invite" className="mt-3 inline-block rounded-lg bg-pazer-red px-4 py-2 text-xs font-extrabold">INVITE NOW</Link>
      </div>
    </div>
  );
}
