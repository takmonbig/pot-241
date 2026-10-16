import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Flame, Droplets, Mountain, Loader2, HandCoins, Split, RotateCw, Skull, Tornado } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { showPopup } from "@/components/CenterPopup";
import { showWin } from "@/components/WinCelebration";
import { BetBox, apiErrorPopup } from "@/components/BetBox";
import { HowToPlay } from "@/components/HowToPlay";
import { useRace, RaceBar } from "@/components/Race";
import { fbTrack } from "@/lib/siteConfig";
import { Vortex3D } from "@/components/Vortex3D";
import { MuteButton } from "@/components/MuteButton";
import { sfx } from "@/lib/sfx";

const THEMES = {
  earth: { icon: Mountain, bg: "from-[#1c1407] via-[#0d1608] to-black", accent: "#8bd36b", safe: ["#3d6b29", "#5d8f3b"], glow: "rgba(139,211,107,.45)", particle: "earth", swirl: "conic-gradient(from 0deg, transparent, rgba(139,211,107,.35), transparent 40%, rgba(192,138,62,.35), transparent 75%)" },
  water: { icon: Droplets, bg: "from-[#03121f] via-[#041b2e] to-black", accent: "#38bdf8", safe: ["#0e5a8a", "#1683c4"], glow: "rgba(56,189,248,.45)", particle: "water", swirl: "conic-gradient(from 0deg, transparent, rgba(56,189,248,.4), transparent 40%, rgba(14,165,233,.3), transparent 75%)" },
  fire: { icon: Flame, bg: "from-[#250803] via-[#1a0604] to-black", accent: "#ff6a2a", safe: ["#b3361a", "#e0561f"], glow: "rgba(255,106,42,.5)", particle: "fire", swirl: "conic-gradient(from 0deg, transparent, rgba(255,106,42,.45), transparent 40%, rgba(255,210,122,.3), transparent 75%)" },
};

export default function VortexSpin() {
  const [cfg, setCfg] = useState(null);
  const [theme, setTheme] = useState("earth");
  const [bet, setBet] = useState(20);
  const [game, setGame] = useState(null); // {session_id, token, table, stage, at_risk, collected, status}
  const wheelRef = useRef(null);
  const [spinning, setSpinning] = useState(false);
  const [wheelStage, setWheelStage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const [lastFair, setLastFair] = useState(null);
  const [seedKey, setSeedKey] = useState(0);
  const [partialStage, setPartialStage] = useState(-1);
  const race = useRace();
  useEffect(() => { if (race.room?.param) setTheme(race.room.param); }, [race.room?.param]);
  const winOrRace = (p) => { if (race.id) { race.finished(); showPopup({ type: "success", title: "Race score submitted", message: "Check the lobby to see how you rank." }); } else showWin(p); };

  useEffect(() => { api.get("/games/extra/config").then(({ data }) => { setCfg(data.vortex); setBet(data.vortex.min_bet || 20); }).catch(() => {}); }, []);
  const active = game?.status === "active";
  useEffect(() => { window.dispatchEvent(new CustomEvent("game:active", { detail: active })); }, [active]);
  useEffect(() => () => window.dispatchEvent(new CustomEvent("game:active", { detail: false })), []);

  const table = game?.table || cfg?.tables?.[theme];
  const stages = table?.stages || [];
  const segs = table?.segments || 12;
  const ws = Math.min(wheelStage, Math.max(0, stages.length - 1));
  const loseSlots = stages[ws]?.lose_slots || [];
  const pct = cfg?.partial_collect_percent ?? 50;
  const t = THEMES[theme];

  const spinTo = (landing) => { setSpinning(true); wheelRef.current?.spinTo(landing, 2800); };

  const doSpin = async (g) => {
    setBusy(true);
    try {
      const { data } = await api.post("/games/vortex/spin", { session_id: g.session_id, token: g.token });
      setWheelStage(g.stage);
      spinTo(data.landing);
      setTimeout(() => {
        setSpinning(false);
        if (!data.survived) {
          wheelRef.current?.lose();
          setShake(true); setTimeout(() => setShake(false), 600);
          setGame((x) => ({ ...x, status: "lost", at_risk: 0 }));
          setLastFair(data.fair); setSeedKey((k) => k + 1);
          window.dispatchEvent(new Event("wallet:refresh")); if (race.id) race.finished();
          setTimeout(() => showPopup({ type: "warning", title: "The vortex broke!", message: data.total_prize > 0 ? `You kept ${data.total_prize} coins from partial collects.` : "Spin again and read the elements." }), 400);
        } else if (data.finished) {
          wheelRef.current?.win();
          setGame((x) => ({ ...x, stage: data.stage, at_risk: 0, status: "won" }));
          setLastFair(data.fair); setSeedKey((k) => k + 1);
          window.dispatchEvent(new Event("wallet:refresh")); winOrRace(data.total_prize);
        } else {
          sfx.gem();
          setGame((x) => ({ ...x, stage: data.stage, at_risk: data.at_risk }));
          setWheelStage(data.stage);
        }
        setBusy(false);
      }, 2900);
    } catch (e) { setBusy(false); showPopup({ type: "warning", title: "Spin failed", message: formatApiError(e.response?.data?.detail) }); }
  };

  const startAndSpin = async () => {
    if (!race.id && bet < (cfg?.min_bet || 20)) return showPopup({ type: "warning", title: "Bet too low", message: `Minimum bet is ${cfg?.min_bet || 20} coins.` });
    setBusy(true);
    try {
      const { data } = race.id ? await race.play() : await api.post("/games/vortex/start", { bet, theme });
      const g = { ...data, stage: 0, at_risk: data.entry_fee, collected: 0, status: "active" };
      setGame(g); setWheelStage(0); setLastFair(null); setPartialStage(-1);
      fbTrack("game_play", { value: bet, currency: "INR" });
      window.dispatchEvent(new Event("wallet:refresh"));
      await doSpin(g);
    } catch (e) { setBusy(false); apiErrorPopup(showPopup, formatApiError(e.response?.data?.detail)); }
  };

  const collect = async (partial) => {
    setBusy(true);
    try {
      const { data } = await api.post("/games/vortex/collect", { session_id: game.session_id, token: game.token, partial });
      window.dispatchEvent(new Event("wallet:refresh"));
      if (data.finished) {
        wheelRef.current?.win(); sfx.coin();
        setGame((x) => ({ ...x, status: "won", at_risk: 0 })); setLastFair(data.fair); setSeedKey((k) => k + 1);
        winOrRace(data.total_prize);
      } else {
        sfx.coin(); setGame((x) => ({ ...x, at_risk: data.at_risk, collected: data.collected })); setPartialStage(game.stage);
        showPopup({ type: "success", title: `+${data.collected_now} coins banked`, message: `${data.at_risk} still riding the vortex.` });
      }
    } catch (e) { showPopup({ type: "warning", title: "Can't collect", message: formatApiError(e.response?.data?.detail) }); }
    finally { setBusy(false); }
  };

  const nextStage = stages[game?.stage ?? 0];
  const curMult = game && game.stage > 0 ? stages[game.stage - 1]?.multiplier : 1;

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 pb-40" data-testid="vortex-page">
      <div className="flex items-center gap-3 mb-4">
        <Link to="/home" data-testid="vortex-back" className="h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center"><ArrowLeft className="h-4 w-4" /></Link>
        <Tornado className="h-5 w-5 text-pazer-red" />
        <h1 className="font-display font-bold text-2xl tracking-tight">Vortex Spin</h1>
        <HowToPlay k="vortex" /><MuteButton className="!ml-0" />
      </div>
      <RaceBar race={race} />

      <div className="grid grid-cols-3 gap-2 mb-4">
        {Object.keys(THEMES).map((k) => {
          const T = THEMES[k]; const tb = cfg?.tables?.[k];
          return (
            <button key={k} disabled={active || busy || !!race.id} onClick={() => { setTheme(k); setGame(null); setWheelStage(0); }} data-testid={`vortex-theme-${k}`}
              className={`relative overflow-hidden py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50 border ${theme === k ? "border-white/60 scale-[1.02]" : "border-white/10 opacity-80 hover:opacity-100"}`}
              style={{ background: `linear-gradient(160deg, ${T.safe[1]}55, #000)`, boxShadow: theme === k ? `0 0 22px ${T.glow}` : "none" }}>
              <T.icon className="h-5 w-5 mx-auto mb-1" style={{ color: T.accent }} />
              {cfg?.themes?.[k]?.label || k}
              <span className="block text-[10px] font-normal opacity-70">{cfg?.themes?.[k]?.risk} risk · up to {tb?.stages?.[tb.stages.length - 1]?.multiplier}×</span>
            </button>
          );
        })}
      </div>

      <div className={`relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b ${t.bg} p-5 ${shake ? "vx-shake" : ""}`}>
        <div className="relative flex items-center justify-between gap-1 mb-6" data-testid="vortex-stages">
          {stages.map((s, i) => {
            const cleared = game && i < game.stage;
            const current = game?.status === "active" && i === game.stage;
            return (
              <div key={i} className="flex-1 flex flex-col items-center" data-testid={`vortex-stage-${i}`}>
                <motion.div animate={current ? { scale: [1, 1.12, 1] } : { scale: 1 }} transition={{ repeat: current ? Infinity : 0, duration: 1.2 }}
                  className={`h-9 w-full max-w-[64px] rounded-lg flex items-center justify-center font-mono-pz text-xs font-bold border ${cleared ? "bg-emerald-500/25 border-emerald-400/60 text-emerald-200" : current ? "border-white text-white" : "border-white/10 text-white/40 bg-black/30"}`}
                  style={current ? { boxShadow: `0 0 16px ${t.glow}`, background: `${t.accent}33` } : {}}>
                  {s.multiplier}×
                </motion.div>
                <span className="text-[11px] text-white/70 mt-1">{Math.round(s.survival * 100)}% safe</span>
              </div>
            );
          })}
        </div>
        <div className="relative mx-auto aspect-square w-full max-w-[400px]">
          <Vortex3D ref={wheelRef} segments={segs} loseSlots={loseSlots} theme={theme} />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center rounded-full bg-black/70 px-3 py-1">
              <div className="font-mono-pz font-extrabold text-xl" data-testid="vortex-center-mult">{`${(curMult || 1).toFixed(2)}×`}</div>
              <div className="text-[10px] uppercase tracking-widest text-white/70">Stage {Math.min((game?.stage ?? 0) + (active ? 1 : 0), stages.length) || 1}</div>
            </div>
          </div>
        </div>
        <AnimatePresence>
          {game && game.status !== "active" && !spinning && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} data-testid="vortex-result"
              className={`relative mt-5 text-center font-display font-extrabold text-xl ${game.status === "won" ? "text-emerald-300" : "text-pazer-red"}`}>
              {game.status === "won" ? "Collected!" : <span className="inline-flex items-center gap-2"><Skull className="h-5 w-5" /> Vortex broke</span>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-5 rounded-3xl pz-glass p-5 space-y-4">
        {active ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label={race.id ? "Score" : "Riding"} value={race.id ? `${curMult}×` : game.at_risk?.toFixed(2)} testid="vortex-at-risk" color="text-white" />
              <Stat label={race.id ? "Stage" : "Banked"} value={race.id ? `${game.stage}/${stages.length}` : (game.collected || 0).toFixed(2)} testid="vortex-collected" color="text-emerald-300" />
              <Stat label="Next spin" value={nextStage ? `×${nextStage.step_multiplier.toFixed(2)}` : "-"} color="text-amber-300" />
            </div>
            <button onClick={() => doSpin(game)} disabled={busy || spinning} data-testid="vortex-spin-btn"
              className="w-full py-4 rounded-2xl font-extrabold text-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-transform active:scale-[.98]"
              style={{ background: `linear-gradient(90deg, ${t.safe[0]}, ${t.accent})` }}>
              {busy || spinning ? <Loader2 className="h-5 w-5 animate-spin" /> : <RotateCw className="h-5 w-5" />}
              {spinning ? "Spinning…" : game.stage === 0 ? "SPIN" : `SPIN STAGE ${game.stage + 1} · ${nextStage ? Math.round(nextStage.survival * 100) : 0}% safe`}
            </button>
            {game.stage > 0 && (
              <div className={`grid gap-2 ${race.id ? "grid-cols-1" : "grid-cols-2"}`}>
                {!race.id && <button onClick={() => collect(true)} disabled={busy || spinning || partialStage === game.stage} data-testid="vortex-partial-btn"
                  className="py-3 rounded-2xl bg-white/10 hover:bg-white/15 font-bold flex items-center justify-center gap-2 disabled:opacity-40">
                  <Split className="h-4 w-4" /> Take {pct}% · <span className="font-mono-pz">{(game.at_risk * pct / 100).toFixed(2)}</span>
                </button>}
                <button onClick={() => collect(false)} disabled={busy || spinning} data-testid="vortex-collect-btn"
                  className="py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 font-extrabold flex items-center justify-center gap-2 disabled:opacity-50">
                  <HandCoins className="h-4 w-4" /> Collect <span className="font-mono-pz">{race.id ? `${curMult}×` : game.at_risk?.toFixed(2)}</span>
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            {!race.id && <BetBox bet={bet} setBet={setBet} min={cfg?.min_bet || 20} prefix="vortex" disabled={busy} />}
            <div className={`flex justify-between text-sm text-white/50 ${race.id ? "hidden" : ""}`}>
              <span>Max win (all {stages.length} stages)</span>
              <span className="font-mono-pz text-green-400 font-bold" data-testid="vortex-top-prize">{(bet * (stages[stages.length - 1]?.multiplier || 0)).toFixed(2)}</span>
            </div>
            <button onClick={startAndSpin} disabled={busy || spinning || (race.id && race.locked)} data-testid="vortex-start-btn"
              className="w-full py-4 rounded-2xl bg-pazer-red hover:bg-pazer-redhover font-extrabold text-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
              {(busy || spinning) && <Loader2 className="h-5 w-5 animate-spin" />} {race.id ? (race.locked ? "Race run used" : "Start race run") : `${game ? "Spin Again" : "Start & Spin"} · ${bet}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color, testid }) {
  return (
    <div className="rounded-xl bg-black/30 py-2">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`font-mono-pz font-bold text-lg ${color}`} data-testid={testid}>{value}</div>
    </div>
  );
}
