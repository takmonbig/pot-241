import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, HandCoins, Footprints, Egg } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { showPopup } from "@/components/CenterPopup";
import { showWin } from "@/components/WinCelebration";
import { BetBox, apiErrorPopup } from "@/components/BetBox";
import { FairnessPanel } from "@/components/FairnessPanel";
import { fbTrack } from "@/lib/siteConfig";
import { Chicken3D } from "@/components/Chicken3D";
import { MuteButton } from "@/components/MuteButton";

const MODES = ["easy", "medium", "hard", "hardcore"];
export default function ChickenQuest() {
  const [cfg, setCfg] = useState(null);
  const [mode, setMode] = useState("easy");
  const [bet, setBet] = useState(20);
  const [game, setGame] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hazardAt, setHazardAt] = useState(null);
  const [lastFair, setLastFair] = useState(null);
  const [seedKey, setSeedKey] = useState(0);

  useEffect(() => { api.get("/games/extra/config").then(({ data }) => { setCfg(data.chicken); setBet(data.chicken.min_bet || 20); }).catch(() => {}); }, []);
  const active = game?.status === "active";
  useEffect(() => { window.dispatchEvent(new CustomEvent("game:active", { detail: active })); }, [active]);
  useEffect(() => () => window.dispatchEvent(new CustomEvent("game:active", { detail: false })), []);

  const mults = game?.multipliers || cfg?.multipliers?.[mode] || [];
  const steps = mults.length;
  const step = game?.step || 0;

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
        <MuteButton />
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

      <div className={`relative h-[330px] overflow-hidden rounded-3xl border ${hardcore ? "border-pazer-red/50" : "border-white/10"} bg-[radial-gradient(ellipse_at_top,#2a0a10,#050203_70%)]`} data-testid="chicken-road">
        <Chicken3D mults={mults} step={step} status={game?.status || "idle"} hazardAt={hazardAt} hardcore={hardcore} />
        <div className="sr-only" data-testid="chicken-sprite" />
      </div>
      <div className="mt-2 flex gap-1.5 overflow-x-auto no-scrollbar pb-1" data-testid="chicken-lane-strip">
        {mults.map((m, i) => {
          const st = laneState(i);
          return (
            <div key={i} data-testid={`chicken-lane-${i + 1}`}
              className={`shrink-0 rounded-lg px-2 py-1 font-mono-pz text-[11px] font-bold border ${st === "hazard" ? "bg-pazer-red/40 border-pazer-red" : st === "passed" ? "bg-amber-400/25 border-amber-300 text-amber-100" : st === "next" ? "bg-white/15 border-white" : "bg-white/5 border-white/10 text-white/70"}`}>
              {st === "hazard" ? "🔥" : `${m}×`}
            </div>
          );
        })}
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
