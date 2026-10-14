import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Flame, Droplets, Mountain, Loader2, HandCoins, Split, RotateCw, Skull, Tornado } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { showPopup } from "@/components/CenterPopup";
import { showWin } from "@/components/WinCelebration";
import { BetBox, apiErrorPopup } from "@/components/BetBox";
import { FairnessPanel } from "@/components/FairnessPanel";
import { fbTrack } from "@/lib/siteConfig";

const THEMES = {
  earth: { icon: Mountain, bg: "from-[#1c1407] via-[#0d1608] to-black", accent: "#8bd36b", safe: ["#3d6b29", "#5d8f3b"], glow: "rgba(139,211,107,.45)", particle: "earth", swirl: "conic-gradient(from 0deg, transparent, rgba(139,211,107,.35), transparent 40%, rgba(192,138,62,.35), transparent 75%)" },
  water: { icon: Droplets, bg: "from-[#03121f] via-[#041b2e] to-black", accent: "#38bdf8", safe: ["#0e5a8a", "#1683c4"], glow: "rgba(56,189,248,.45)", particle: "water", swirl: "conic-gradient(from 0deg, transparent, rgba(56,189,248,.4), transparent 40%, rgba(14,165,233,.3), transparent 75%)" },
  fire: { icon: Flame, bg: "from-[#250803] via-[#1a0604] to-black", accent: "#ff6a2a", safe: ["#b3361a", "#e0561f"], glow: "rgba(255,106,42,.5)", particle: "fire", swirl: "conic-gradient(from 0deg, transparent, rgba(255,106,42,.45), transparent 40%, rgba(255,210,122,.3), transparent 75%)" },
};

function Particles({ kind }) {
  const items = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    left: `${(i * 53) % 100}%`, size: 4 + ((i * 7) % 10), dur: 3 + ((i * 13) % 50) / 10, delay: ((i * 17) % 40) / 10,
    top: kind === "earth" ? `${10 + ((i * 37) % 80)}%` : undefined,
  })), [kind]);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {items.map((p, i) => (
        <span key={i} className={`absolute vx-particle-${kind}`}
          style={{ left: p.left, bottom: kind === "earth" ? undefined : "-10px", top: p.top, width: p.size * (kind === "earth" ? 1.6 : 1), height: p.size * (kind === "earth" ? 1.3 : 1), animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s` }} />
      ))}
    </div>
  );
}

function arcPath(r, a0, a1) {
  const rad = (a) => ((a - 90) * Math.PI) / 180;
  const [x0, y0, x1, y1] = [r * Math.cos(rad(a0)), r * Math.sin(rad(a0)), r * Math.cos(rad(a1)), r * Math.sin(rad(a1))];
  return `M0 0 L${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1} Z`;
}

function Wheel({ segments, loseSlots, rotation, theme, centerLabel, spinning, stageNo }) {
  const t = THEMES[theme];
  const step = 360 / segments;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[340px]" data-testid="vortex-wheel">
      <div className="absolute -inset-6 rounded-full vx-swirl opacity-80 blur-md" style={{ background: t.swirl }} />
      <div className="absolute -inset-2 rounded-full" style={{ boxShadow: `0 0 60px ${t.glow}, inset 0 0 30px ${t.glow}` }} />
      <div className="absolute left-1/2 -top-3 z-20 -translate-x-1/2">
        <div className="h-0 w-0 border-l-[14px] border-r-[14px] border-t-[26px] border-l-transparent border-r-transparent drop-shadow-[0_0_8px_rgba(255,255,255,.7)]" style={{ borderTopColor: "#fff" }} />
      </div>
      <motion.svg viewBox="-150 -150 300 300" className="relative z-10 h-full w-full"
        animate={{ rotate: rotation }} transition={{ duration: spinning ? 2.8 : 0, ease: [0.12, 0.8, 0.18, 1] }}>
        <circle r="148" fill="#050505" stroke={t.accent} strokeWidth="3" />
        {Array.from({ length: segments }, (_, j) => {
          const lose = loseSlots.includes(j);
          const mid = (j + 0.5) * step;
          const rad = ((mid - 90) * Math.PI) / 180;
          return (
            <g key={j}>
              <path d={arcPath(140, j * step, (j + 1) * step)} fill={lose ? "#140404" : t.safe[j % 2]} stroke="#000" strokeWidth="2" />
              <text x={Math.cos(rad) * 102} y={Math.sin(rad) * 102} textAnchor="middle" dominantBaseline="central"
                fontSize="18" fill={lose ? "#ff3b3b" : "#ffffff"} transform={`rotate(${mid} ${Math.cos(rad) * 102} ${Math.sin(rad) * 102})`}>
                {lose ? "✕" : "◆"}
              </text>
            </g>
          );
        })}
        {Array.from({ length: segments }, (_, j) => {
          const rad = ((j * step - 90) * Math.PI) / 180;
          return <circle key={`d${j}`} cx={Math.cos(rad) * 144} cy={Math.sin(rad) * 144} r="3" fill={t.accent} />;
        })}
      </motion.svg>
      <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
        <div className="h-28 w-28 rounded-full border-2 flex flex-col items-center justify-center bg-black/85 backdrop-blur"
          style={{ borderColor: t.accent, boxShadow: `0 0 30px ${t.glow}` }}>
          <t.icon className="h-6 w-6" style={{ color: t.accent }} />
          <div className="font-mono-pz font-extrabold text-xl" data-testid="vortex-center-mult">{centerLabel}</div>
          <div className="text-[10px] uppercase tracking-widest text-white/50">Stage {stageNo}</div>
        </div>
      </div>
    </div>
  );
}

export default function VortexSpin() {
  const [cfg, setCfg] = useState(null);
  const [theme, setTheme] = useState("earth");
  const [bet, setBet] = useState(20);
  const [game, setGame] = useState(null); // {session_id, token, table, stage, at_risk, collected, status}
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [wheelStage, setWheelStage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const [lastFair, setLastFair] = useState(null);
  const [seedKey, setSeedKey] = useState(0);
  const [partialStage, setPartialStage] = useState(-1);

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

  const spinTo = (landing) => {
    const center = (landing + 0.5) * (360 / segs);
    const base = rotation - (rotation % 360);
    setSpinning(true);
    setRotation(base + 360 * 6 + (360 - center));
  };

  const doSpin = async (g) => {
    setBusy(true);
    try {
      const { data } = await api.post("/games/vortex/spin", { session_id: g.session_id, token: g.token });
      setWheelStage(g.stage);
      spinTo(data.landing);
      setTimeout(() => {
        setSpinning(false);
        if (!data.survived) {
          setShake(true); setTimeout(() => setShake(false), 600);
          setGame((x) => ({ ...x, status: "lost", at_risk: 0 }));
          setLastFair(data.fair); setSeedKey((k) => k + 1);
          window.dispatchEvent(new Event("wallet:refresh"));
          setTimeout(() => showPopup({ type: "warning", title: "The vortex broke!", message: data.total_prize > 0 ? `You kept ${data.total_prize} coins from partial collects.` : "Spin again and read the elements." }), 400);
        } else if (data.finished) {
          setGame((x) => ({ ...x, stage: data.stage, at_risk: 0, status: "won" }));
          setLastFair(data.fair); setSeedKey((k) => k + 1);
          window.dispatchEvent(new Event("wallet:refresh")); showWin(data.total_prize);
        } else {
          setGame((x) => ({ ...x, stage: data.stage, at_risk: data.at_risk }));
          setWheelStage(data.stage);
        }
        setBusy(false);
      }, 2900);
    } catch (e) { setBusy(false); showPopup({ type: "warning", title: "Spin failed", message: formatApiError(e.response?.data?.detail) }); }
  };

  const startAndSpin = async () => {
    if (bet < (cfg?.min_bet || 20)) return showPopup({ type: "warning", title: "Bet too low", message: `Minimum bet is ${cfg?.min_bet || 20} coins.` });
    setBusy(true);
    try {
      const { data } = await api.post("/games/vortex/start", { bet, theme });
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
        setGame((x) => ({ ...x, status: "won", at_risk: 0 })); setLastFair(data.fair); setSeedKey((k) => k + 1);
        showWin(data.total_prize);
      } else {
        setGame((x) => ({ ...x, at_risk: data.at_risk, collected: data.collected })); setPartialStage(game.stage);
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
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        {Object.keys(THEMES).map((k) => {
          const T = THEMES[k]; const tb = cfg?.tables?.[k];
          return (
            <button key={k} disabled={active || busy} onClick={() => { setTheme(k); setGame(null); setWheelStage(0); }} data-testid={`vortex-theme-${k}`}
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
        <Particles kind={t.particle} />
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
                <span className="text-[10px] text-white/40 mt-1">{Math.round(s.survival * 100)}% safe</span>
              </div>
            );
          })}
        </div>
        <Wheel segments={segs} loseSlots={loseSlots} rotation={rotation} theme={theme} spinning={spinning}
          centerLabel={`${(curMult || 1).toFixed(2)}×`} stageNo={Math.min((game?.stage ?? 0) + (active ? 1 : 0), stages.length) || 1} />
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
              <Stat label="Riding" value={game.at_risk?.toFixed(2)} testid="vortex-at-risk" color="text-white" />
              <Stat label="Banked" value={(game.collected || 0).toFixed(2)} testid="vortex-collected" color="text-emerald-300" />
              <Stat label="Next spin" value={nextStage ? `×${nextStage.step_multiplier.toFixed(2)}` : "-"} color="text-amber-300" />
            </div>
            <button onClick={() => doSpin(game)} disabled={busy || spinning} data-testid="vortex-spin-btn"
              className="w-full py-4 rounded-2xl font-extrabold text-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-transform active:scale-[.98]"
              style={{ background: `linear-gradient(90deg, ${t.safe[0]}, ${t.accent})` }}>
              {busy || spinning ? <Loader2 className="h-5 w-5 animate-spin" /> : <RotateCw className="h-5 w-5" />}
              {spinning ? "Spinning…" : game.stage === 0 ? "SPIN" : `SPIN STAGE ${game.stage + 1} · ${nextStage ? Math.round(nextStage.survival * 100) : 0}% safe`}
            </button>
            {game.stage > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => collect(true)} disabled={busy || spinning || partialStage === game.stage} data-testid="vortex-partial-btn"
                  className="py-3 rounded-2xl bg-white/10 hover:bg-white/15 font-bold flex items-center justify-center gap-2 disabled:opacity-40">
                  <Split className="h-4 w-4" /> Take {pct}% · <span className="font-mono-pz">{(game.at_risk * pct / 100).toFixed(2)}</span>
                </button>
                <button onClick={() => collect(false)} disabled={busy || spinning} data-testid="vortex-collect-btn"
                  className="py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 font-extrabold flex items-center justify-center gap-2 disabled:opacity-50">
                  <HandCoins className="h-4 w-4" /> Collect <span className="font-mono-pz">{game.at_risk?.toFixed(2)}</span>
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <BetBox bet={bet} setBet={setBet} min={cfg?.min_bet || 20} prefix="vortex" disabled={busy} />
            <div className="flex justify-between text-sm text-white/50">
              <span>Max win (all {stages.length} stages)</span>
              <span className="font-mono-pz text-green-400 font-bold" data-testid="vortex-top-prize">{(bet * (stages[stages.length - 1]?.multiplier || 0)).toFixed(2)}</span>
            </div>
            <button onClick={startAndSpin} disabled={busy || spinning} data-testid="vortex-start-btn"
              className="w-full py-4 rounded-2xl bg-pazer-red hover:bg-pazer-redhover font-extrabold text-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
              {(busy || spinning) && <Loader2 className="h-5 w-5 animate-spin" />} {game ? "Spin Again" : "Start & Spin"} · {bet}
            </button>
          </>
        )}
        <FairnessPanel game="vortex" param={theme} locked={active} round={active ? game.fair : lastFair} refreshKey={seedKey} />
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
