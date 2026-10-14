import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Loader2, HandCoins, Footprints, Egg, Flame } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { showPopup } from "@/components/CenterPopup";
import { showWin } from "@/components/WinCelebration";
import { BetBox, apiErrorPopup } from "@/components/BetBox";
import { FairnessPanel } from "@/components/FairnessPanel";
import { fbTrack } from "@/lib/siteConfig";

const MODES = ["easy", "medium", "hard", "hardcore"];
const START_W = 110;
const LANE_W = 96;
const CAR_COLORS = ["#ef4444", "#f59e0b", "#3b82f6", "#a855f7", "#10b981", "#f97316"];

function Chicken({ dead }) {
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16 drop-shadow-[0_6px_10px_rgba(0,0,0,.6)]">
      <g style={{ filter: dead ? "grayscale(1) brightness(.5)" : "none" }}>
        <path d="M22 50 l-3 9 M30 51 l0 9" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="30" cy="38" rx="18" ry="15" fill="#fafafa" />
        <path d="M14 34 q-8 -2 -10 6 q8 2 12 -1z" fill="#e5e7eb" />
        <ellipse cx="34" cy="40" rx="8" ry="6" fill="#e5e7eb" />
        <circle cx="42" cy="22" r="11" fill="#fafafa" />
        <path d="M37 11 q2 -6 5 -1 q3 -6 5 1 q3 -3 3 3 l-13 1z" fill="#ef4444" />
        <path d="M52 22 l8 3 l-8 3z" fill="#f59e0b" />
        <path d="M49 29 q2 5 -1 7 q-3 -2 -1 -7z" fill="#ef4444" />
        {dead ? <path d="M42 18 l4 4 M46 18 l-4 4" stroke="#111" strokeWidth="2" /> : <circle cx="45" cy="20" r="2.2" fill="#111" />}
      </g>
    </svg>
  );
}

function Lane({ i, mult, state, hardcore, showCar }) {
  // state: passed | current-next | future | hazard
  return (
    <div className="relative h-full shrink-0 overflow-hidden border-r-2 border-dashed border-white/15" style={{ width: LANE_W }} data-testid={`chicken-lane-${i + 1}`}>
      <div className={`absolute inset-0 ${hardcore ? "bg-[#1c0606]" : "bg-[#141418]"}`} />
      {showCar && state === "future" && (
        <div className="absolute left-1/2 -translate-x-1/2 top-0 cq-car" style={{ animationDuration: `${1.6 + ((i * 7) % 10) / 6}s`, animationDelay: `${(i % 5) * 0.37}s` }}>
          <div className="h-16 w-11 rounded-lg shadow-lg" style={{ background: `linear-gradient(${CAR_COLORS[i % CAR_COLORS.length]}, #111)` }}>
            <div className="mx-1.5 mt-2 h-4 rounded bg-sky-200/60" />
            <div className="mx-1.5 mt-5 h-3 rounded bg-sky-200/30" />
          </div>
        </div>
      )}
      {state === "passed" && <div className="absolute top-6 left-2 right-2 h-3 rounded bg-gradient-to-r from-amber-300 via-zinc-100 to-amber-300 shadow-[0_0_10px_rgba(251,191,36,.5)]" />}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className={`h-[70px] w-[70px] rounded-full border-4 flex items-center justify-center font-mono-pz text-sm font-extrabold transition-colors ${
          state === "hazard" ? "border-pazer-red bg-pazer-red/40 text-white" :
          state === "passed" ? "border-amber-300 bg-amber-400/25 text-amber-100" :
          state === "next" ? "border-white bg-white/10 text-white shadow-[0_0_20px_rgba(255,255,255,.35)]" :
          "border-zinc-600 bg-zinc-800/80 text-white/60"}`}>
          {state === "hazard" ? <Flame className="h-8 w-8 text-orange-300 cq-flame" /> : `${mult}×`}
        </div>
      </div>
      {hardcore && state === "future" && <Flame className="absolute bottom-3 left-1/2 -translate-x-1/2 h-5 w-5 text-orange-500/70 cq-flame" />}
    </div>
  );
}

export default function ChickenQuest() {
  const [cfg, setCfg] = useState(null);
  const [mode, setMode] = useState("easy");
  const [bet, setBet] = useState(20);
  const [game, setGame] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hazardAt, setHazardAt] = useState(null);
  const [lastFair, setLastFair] = useState(null);
  const [seedKey, setSeedKey] = useState(0);
  const scroller = useRef(null);

  useEffect(() => { api.get("/games/extra/config").then(({ data }) => { setCfg(data.chicken); setBet(data.chicken.min_bet || 20); }).catch(() => {}); }, []);
  const active = game?.status === "active";
  useEffect(() => { window.dispatchEvent(new CustomEvent("game:active", { detail: active })); }, [active]);
  useEffect(() => () => window.dispatchEvent(new CustomEvent("game:active", { detail: false })), []);

  const mults = game?.multipliers || cfg?.multipliers?.[mode] || [];
  const steps = mults.length;
  const step = game?.step || 0;
  const dead = game?.status === "lost";
  const chickenStep = dead ? hazardAt : step;
  const pos = chickenStep === 0 || chickenStep == null ? START_W / 2 : START_W + (chickenStep - 1) * LANE_W + LANE_W / 2;

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ left: Math.max(0, pos - el.clientWidth / 2.6), behavior: "smooth" });
  }, [pos]);

  const start = async () => {
    if (bet < (cfg?.min_bet || 20)) return showPopup({ type: "warning", title: "Bet too low", message: `Minimum bet is ${cfg?.min_bet || 20} coins.` });
    setBusy(true);
    try {
      const { data } = await api.post("/games/chicken/start", { bet, mode });
      setGame({ ...data, step: 0, status: "active" }); setHazardAt(null); setLastFair(null);
      fbTrack("game_play", { value: bet, currency: "INR" });
      window.dispatchEvent(new Event("wallet:refresh"));
    } catch (e) { apiErrorPopup(showPopup, formatApiError(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const go = async () => {
    if (busy || !active) return;
    setBusy(true);
    try {
      const { data } = await api.post("/games/chicken/step", { session_id: game.session_id, token: game.token });
      if (!data.safe) {
        setHazardAt(data.step); setGame((g) => ({ ...g, status: "lost" })); setLastFair(data.fair); setSeedKey((k) => k + 1);
        window.dispatchEvent(new Event("wallet:refresh"));
        setTimeout(() => showPopup({ type: "warning", title: "Fried chicken!", message: `A trap was waiting on lane ${data.step}.` }), 650);
      } else if (data.finished) {
        setGame((g) => ({ ...g, step: data.step, status: "won" })); setHazardAt(data.hazard_step); setLastFair(data.fair); setSeedKey((k) => k + 1);
        window.dispatchEvent(new Event("wallet:refresh")); showWin(data.prize);
      } else setGame((g) => ({ ...g, step: data.step }));
    } catch (e) { showPopup({ type: "warning", title: "Something went wrong", message: formatApiError(e.response?.data?.detail) }); }
    finally { setBusy(false); }
  };

  const collect = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/games/chicken/collect", { session_id: game.session_id, token: game.token });
      setGame((g) => ({ ...g, status: "won" })); setHazardAt(data.hazard_step); setLastFair(data.fair); setSeedKey((k) => k + 1);
      window.dispatchEvent(new Event("wallet:refresh")); showWin(data.prize);
    } catch (e) { showPopup({ type: "warning", title: "Can't collect", message: formatApiError(e.response?.data?.detail) }); }
    finally { setBusy(false); }
  };

  const laneState = (i) => {
    const n = i + 1;
    if (game && game.status !== "active" && hazardAt === n) return "hazard";
    if (n <= step) return "passed";
    if (active && n === step + 1) return "next";
    return "future";
  };
  const hardcore = mode === "hardcore";
  const cashValue = step > 0 ? (game.entry_fee * mults[step - 1]).toFixed(2) : "0.00";

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 pb-40" data-testid="chicken-page">
      <div className="flex items-center gap-3 mb-4">
        <Link to="/home" data-testid="chicken-back" className="h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center"><ArrowLeft className="h-4 w-4" /></Link>
        <Egg className="h-5 w-5 text-pazer-red" />
        <h1 className="font-display font-bold text-2xl tracking-tight">Chicken Quest</h1>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-4">
        {MODES.map((k) => (
          <button key={k} disabled={active || busy} onClick={() => { setMode(k); setGame(null); setHazardAt(null); }} data-testid={`chicken-mode-${k}`}
            className={`py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 ${mode === k ? (k === "hardcore" ? "bg-gradient-to-r from-red-700 to-pazer-red" : "bg-pazer-red") + " text-white pz-glow-box" : "bg-white/5 text-white/60 hover:bg-white/10"}`}>
            {cfg?.modes?.[k]?.label || k}
            <span className="block text-[10px] font-normal opacity-70">{cfg?.modes?.[k]?.steps} lanes · {Math.round((cfg?.modes?.[k]?.hazard || 0) * 100)}% trap</span>
          </button>
        ))}
      </div>

      <div ref={scroller} className={`relative overflow-x-auto overflow-y-hidden rounded-3xl border ${hardcore ? "border-pazer-red/50" : "border-white/10"} no-scrollbar`} data-testid="chicken-road">
        <div className="relative flex h-64" style={{ width: START_W + steps * LANE_W + 120 }}>
          <div className="relative h-full shrink-0 bg-gradient-to-b from-zinc-700 to-zinc-800 border-r-4 border-zinc-500" style={{ width: START_W }}>
            <div className="absolute bottom-3 inset-x-0 text-center text-[10px] uppercase tracking-widest text-white/50">Start</div>
          </div>
          {mults.map((m, i) => <Lane key={i} i={i} mult={m} state={laneState(i)} hardcore={hardcore} showCar={i % 2 === 0 || hardcore} />)}
          <div className="relative h-full w-[120px] shrink-0 bg-gradient-to-b from-amber-500/30 to-amber-900/30 flex flex-col items-center justify-center">
            <Egg className="h-10 w-10 text-amber-300" />
            <div className="text-[10px] uppercase tracking-widest text-amber-200 mt-1">Golden nest</div>
            <div className="font-mono-pz text-sm font-bold text-amber-200">{mults[steps - 1]}×</div>
          </div>
          <motion.div className="absolute top-1/2 z-20" style={{ marginTop: -60, marginLeft: -32 }} animate={{ x: pos }}
            transition={{ type: "spring", stiffness: 180, damping: 20 }} data-testid="chicken-sprite">
            <motion.div key={`${chickenStep}-${dead}`} initial={{ y: 0 }} animate={dead ? { y: [0, -20, 8], rotate: [0, -20, 90] } : { y: [0, -34, 0] }} transition={{ duration: 0.45 }}>
              <Chicken dead={dead} />
            </motion.div>
            <AnimatePresence>
              {dead && (
                <motion.div initial={{ scale: 0, opacity: 1 }} animate={{ scale: 2.4, opacity: 0 }} transition={{ duration: 0.9 }}
                  className="absolute inset-0 rounded-full" style={{ background: "radial-gradient(circle, #ffd27a, #ff4d1f 50%, transparent 70%)" }} />
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>

      <div className="mt-5 rounded-3xl pz-glass p-5 space-y-4">
        {active ? (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-white/50">Lane <b className="text-white" data-testid="chicken-step">{step}</b> / {steps}</span>
              <span className="text-white/50">Next <b className="font-mono-pz text-amber-300">{mults[step]}×</b></span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={go} disabled={busy} data-testid="chicken-go-btn"
                className="py-4 rounded-2xl bg-pazer-red hover:bg-pazer-redhover font-extrabold text-lg flex items-center justify-center gap-2 disabled:opacity-50">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Footprints className="h-5 w-5" />} {step === 0 ? "GO" : "CONTINUE"}
              </button>
              <button onClick={collect} disabled={busy || step === 0} data-testid="chicken-collect-btn"
                className="py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 font-extrabold text-lg flex items-center justify-center gap-2 disabled:opacity-40">
                <HandCoins className="h-5 w-5" /> <span className="font-mono-pz">{cashValue}</span>
              </button>
            </div>
          </>
        ) : (
          <>
            {game && (
              <div data-testid="chicken-result" className={`text-center font-display font-extrabold text-lg ${game.status === "won" ? "text-emerald-300" : "text-pazer-red"}`}>
                {game.status === "won" ? `Collected at lane ${step}${hazardAt ? ` · trap was on lane ${hazardAt}` : " · path was clear!"}` : `Fried on lane ${hazardAt}`}
              </div>
            )}
            <BetBox bet={bet} setBet={setBet} min={cfg?.min_bet || 20} prefix="chicken" disabled={busy} />
            <div className="flex justify-between text-sm text-white/50">
              <span>Golden nest prize</span><span className="font-mono-pz text-green-400 font-bold" data-testid="chicken-top-prize">{(bet * (mults[steps - 1] || 0)).toFixed(2)}</span>
            </div>
            <button onClick={start} disabled={busy} data-testid="chicken-start-btn"
              className="w-full py-4 rounded-2xl bg-pazer-red hover:bg-pazer-redhover font-extrabold text-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
              {busy && <Loader2 className="h-5 w-5 animate-spin" />} {game ? "Play Again" : "Start Quest"} · {bet}
            </button>
          </>
        )}
        <FairnessPanel game="chicken" param={mode} locked={active} round={active ? game.fair : lastFair} refreshKey={seedKey} />
      </div>
    </div>
  );
}
