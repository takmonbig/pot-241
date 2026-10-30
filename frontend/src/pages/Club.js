import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Clock, Users, ShieldCheck, Crown, Gift, Tag, Award, Lock, Check, Youtube } from "lucide-react";
import api from "@/lib/api";
import { DailyReward } from "@/components/DailyReward";
import { GAME_META, BET_ON_PLAYER, POPULAR, art } from "@/lib/games";

const SLOT_HOURS = [9, 11, 13, 15, 17, 19, 21];

function slotsFor(k) {
  const now = new Date();
  return SLOT_HOURS.map((h) => {
    const start = new Date(now); start.setHours(h, 0, 0, 0);
    const end = new Date(start); end.setHours(h + 2);
    return { id: `#${k.slice(0, 2).toUpperCase()}${String(h).padStart(2, "0")}00`, start, end };
  }).filter((s) => s.end > now).slice(0, 4);
}
const fmt = (d) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const startsIn = (d) => { const m = Math.max(0, Math.round((d - new Date()) / 60000)); return m === 0 ? "LIVE NOW" : `${String(Math.floor(m / 60)).padStart(2, "0")}h ${String(m % 60).padStart(2, "0")}m`; };

export function BetOnPlayer() {
  const [tab, setTab] = useState("all");
  const [pick, setPick] = useState("callbreak");
  const nav = useNavigate();
  const [mine, setMine] = useState(() => JSON.parse(localStorage.getItem("pot24_slots") || "[]"));
  const join = (s) => { const n = [...new Set([...mine, `${pick}${s.id}`])]; setMine(n); localStorage.setItem("pot24_slots", JSON.stringify(n)); nav(GAME_META[pick].to); };
  return (
    <div className="mx-auto max-w-xl px-4 py-5 pb-40" data-testid="bet-on-player">
      <h1 className="font-display text-2xl uppercase pz-gold-text mb-3">Bet on Player</h1>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {[["all", "All Games"], ["mine", "My Slots"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} data-testid={`bop-tab-${k}`} className={`rounded-xl py-2.5 font-extrabold text-sm uppercase ${tab === k ? "bg-red-700 border border-amber-300" : "bg-white/5"}`}>{l}</button>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {BET_ON_PLAYER.map((k) => (
          <button key={k} onClick={() => setPick(k)} data-testid={`bop-game-${k}`} className={`shrink-0 w-24 rounded-xl overflow-hidden border-2 ${pick === k ? "border-amber-300" : "border-white/10"}`}>
            <img src={art(k)} alt="" className="h-20 w-full object-cover" /><div className="py-1 text-[10px] font-extrabold uppercase">{GAME_META[k].name}</div>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between mt-5 mb-2"><h2 className="font-display text-lg pz-gold-text">DAILY SLOTS</h2><span className="text-[11px] text-white/50">Unlimited players</span></div>
      <div className="space-y-2" data-testid="bop-slots">
        {(tab === "all" ? slotsFor(pick) : slotsFor(pick).filter((s) => mine.includes(`${pick}${s.id}`))).map((s, i) => (
          <motion.div key={s.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
            className="flex items-center gap-3 rounded-2xl border border-amber-400/25 bg-black/50 p-3">
            <div className="flex-1"><div className="font-bold text-sm">{fmt(s.start)} – {fmt(s.end)}</div><div className="text-[11px] text-white/50">Slot ID: {s.id}</div></div>
            <div className="text-right"><div className="text-[10px] text-white/40">STARTS IN</div><div className="font-mono-pz text-xs text-amber-200">{startsIn(s.start)}</div></div>
            <button onClick={() => join(s)} data-testid={`bop-join-${i}`} className="rounded-lg bg-pazer-red px-3 py-2 text-xs font-extrabold">{mine.includes(`${pick}${s.id}`) ? "PLAY" : "JOIN SLOT"}</button>
          </motion.div>
        ))}
        {tab === "mine" && !slotsFor(pick).some((s) => mine.includes(`${pick}${s.id}`)) && <p className="text-center text-white/40 text-sm py-6">No slots joined for this game yet.</p>}
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-xl bg-red-900/20 border border-red-500/30 px-3 py-2 text-xs"><Youtube className="h-4 w-4 text-red-500" />Live stream of featured slots starts 5 minutes before the match.</div>
      <div className="grid grid-cols-3 gap-2 mt-4 text-center">
        {[[Clock, "5 MIN", "Before match"], [Users, "UNLIMITED", "No player limit"], [ShieldCheck, "FAIR PLAY", "Anti-fraud system"]].map(([I, a, b]) => (
          <div key={a} className="rounded-xl border border-amber-400/20 bg-black/50 p-3"><I className="h-5 w-5 mx-auto text-amber-300" /><div className="font-display text-sm mt-1">{a}</div><div className="text-[10px] text-white/50">{b}</div></div>
        ))}
      </div>
    </div>
  );
}

export function AllGames() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-5 pb-40" data-testid="all-games">
      <h1 className="font-display text-2xl uppercase pz-gold-text mb-4">All Games</h1>
      <div className="grid grid-cols-3 gap-3">
        {[...POPULAR, ...BET_ON_PLAYER].map((k) => (
          <Link key={k} to={GAME_META[k].to} data-testid={`all-${k}`} className="rounded-2xl overflow-hidden border-2 border-amber-400/30 hover:border-amber-300">
            <img src={art(k)} alt="" className="aspect-square w-full object-cover" />
            <div className="py-1.5 text-center text-[11px] font-extrabold uppercase">{GAME_META[k].name}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

const VIP = [["Bronze", 0], ["Silver", 5000], ["Gold", 25000], ["Platinum", 100000], ["Crown", 500000]];
const OFFERS = [
  ["First deposit bonus", "Get bonus coins on your first deposit. See Wallet for current rates."],
  ["Refer & earn", "Earn a commission on every game your friends play, for life."],
  ["Daily streak", "Claim your daily bonus every day and keep your streak alive."],
  ["Weekend races", "Play 1v1 and Rooms races on weekends for bigger pools."],
];

export function Club() {
  const { tab = "vip" } = useParams();
  const nav = useNavigate();
  const [p, setP] = useState(null);
  const [me, setMe] = useState(null);
  useEffect(() => {
    api.get("/profile/summary").then(({ data }) => setP(data)).catch(() => {});
    api.get("/auth/me").then(({ data }) => setMe(data)).catch(() => {});
  }, []);
  const wag = me?.stats?.total_entries || 0;
  const lvl = VIP.filter(([, t]) => wag >= t).length - 1;
  const tabs = [["vip", "VIP Club", Crown], ["bonus", "Daily Bonus", Gift], ["offers", "Offers", Tag], ["rewards", "Rewards", Award]];
  return (
    <div className="mx-auto max-w-xl px-4 py-5 pb-40" data-testid={`club-${tab}`}>
      <div className="grid grid-cols-4 gap-1.5 mb-5">
        {tabs.map(([k, l, I]) => (
          <button key={k} onClick={() => nav(`/club/${k}`)} data-testid={`club-tab-${k}`} className={`rounded-xl py-2 text-[10px] font-extrabold uppercase flex flex-col items-center gap-1 ${tab === k ? "bg-pazer-red" : "bg-white/5 text-white/60"}`}><I className="h-4 w-4" />{l}</button>
        ))}
      </div>
      {tab === "vip" && (
        <div className="space-y-2" data-testid="vip-levels">
          <div className="rounded-2xl border border-amber-400/40 bg-gradient-to-br from-[#2a1a03] to-black p-4 mb-3">
            <div className="text-xs text-white/50 uppercase tracking-widest">Your level</div>
            <div className="font-display text-3xl pz-gold-text" data-testid="vip-current">{VIP[Math.max(0, lvl)][0]}</div>
            <div className="text-xs text-white/60">Total played: ₹{Math.round(wag).toLocaleString()}{VIP[lvl + 1] && ` · ₹${(VIP[lvl + 1][1] - wag).toLocaleString()} to ${VIP[lvl + 1][0]}`}</div>
          </div>
          {VIP.map(([n, t], i) => (
            <div key={n} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${i <= lvl ? "bg-amber-400/10 border border-amber-400/40" : "bg-white/5"}`}>
              <Crown className={`h-5 w-5 ${i <= lvl ? "text-amber-300" : "text-white/30"}`} /><span className="font-bold">{n}</span>
              <span className="ml-auto text-xs text-white/50">₹{t.toLocaleString()}+ played</span>{i <= lvl ? <Check className="h-4 w-4 text-green-400" /> : <Lock className="h-4 w-4 text-white/30" />}
            </div>
          ))}
        </div>
      )}
      {tab === "bonus" && <div><DailyReward /><p className="text-xs text-white/50">Come back every day. Missing a day resets your streak.</p></div>}
      {tab === "offers" && <div className="space-y-2" data-testid="offers-list">{OFFERS.map(([a, b]) => <div key={a} className="rounded-2xl border border-amber-400/25 bg-black/50 p-4"><div className="font-display text-lg pz-gold-text">{a}</div><div className="text-xs text-white/60">{b}</div></div>)}</div>}
      {tab === "rewards" && (
        <div className="grid grid-cols-2 gap-2" data-testid="rewards-badges">
          {(p?.badges || []).map((b) => (
            <div key={b.id} className={`rounded-2xl p-4 text-center border ${b.earned ? "border-amber-300 bg-amber-400/10" : "border-white/10 bg-white/5 opacity-60"}`}>
              <Award className={`h-8 w-8 mx-auto ${b.earned ? "text-amber-300" : "text-white/30"}`} /><div className="font-bold text-sm mt-1">{b.name}</div><div className="text-[10px] text-white/50">{b.earned ? "Unlocked" : "Locked"}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
