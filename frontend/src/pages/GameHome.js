import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { Target, Loader2, RotateCcw, Coins, Sparkles, ArrowLeft } from "lucide-react";
import { MuteButton } from "@/components/MuteButton";
import { HowToPlay } from "@/components/HowToPlay";
import api, { formatApiError } from "@/lib/api";
import Stopwatch from "@/components/Stopwatch";
import { showPopup } from "@/components/CenterPopup";
import { showWin } from "@/components/WinCelebration";
import { fbTrack } from "@/lib/siteConfig";

const QUICK_BETS = [20, 50, 100, 200, 500];

export default function GameHome() {
  const [cfg, setCfg] = useState(null);
  const [target, setTarget] = useState(null);
  const [bet, setBet] = useState(20);
  const [phase, setPhase] = useState("select"); // select, countdown, running, result
  const [count, setCount] = useState(3);
  const [session, setSession] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [lossModal, setLossModal] = useState(false);
  const swRef = useRef(null);
  const elapsedRef = useRef(0);
  const autoWinRef = useRef(false);
  const phaseRef = useRef("select");
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("game:active", { detail: phase !== "select" }));
  }, [phase]);
  useEffect(() => () => window.dispatchEvent(new CustomEvent("game:active", { detail: false })), []);

  useEffect(() => {
    api.get("/config/public").then(({ data }) => {
      setCfg(data.fixed_config);
      setBet(data.fixed_config.min_bet);
      setTarget(data.fixed_config.targets[0]);
    }).catch(() => {});
  }, []);

  const startWith = async (useBet, useTarget) => {
    if (useBet < (cfg?.min_bet || 20)) {
      showPopup({ type: "warning", title: "Bet too low", message: `Minimum bet is ${cfg.min_bet} coins.` });
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/games/fixed/start", { target: useTarget, bet: useBet });
      setSession(data);
      autoWinRef.current = !!data.auto_win;
      fbTrack("game_play", { value: useBet, currency: "INR" });
      setResult(null);
      setLossModal(false);
      setPhase("countdown");
      setCount(3);
      window.dispatchEvent(new Event("wallet:refresh"));
    } catch (e) {
      const detail = formatApiError(e.response?.data?.detail);
      if (/insufficient/i.test(detail)) {
        showPopup({ type: "wallet", title: "Insufficient balance", message: "Add coins to your wallet to keep playing." });
      } else {
        showPopup({ type: "warning", title: "Can't start", message: detail });
      }
    } finally { setBusy(false); }
  };

  const start = () => startWith(bet, target);

  useEffect(() => {
    if (phase !== "countdown") return;
    if (count === 0) {
      setPhase("running");
      setTimeout(() => swRef.current?.start(), 50);
      if (autoWinRef.current) setTimeout(() => stop(), target * 1000 + 50);
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, count]);

  const stop = async () => {
    if (busy || phaseRef.current !== "running") return;
    const elapsed = swRef.current?.stop() ?? elapsedRef.current;
    setBusy(true);
    try {
      const { data } = await api.post("/games/fixed/stop", { session_id: session.session_id, elapsed, nonce: session.nonce });
      setResult(data);
      setPhase("result");
      window.dispatchEvent(new Event("wallet:refresh"));
      if (data.won) showWin(data.prize);
      else setTimeout(() => setLossModal(true), 500);
    } catch (e) {
      showPopup({ type: "warning", title: "Something went wrong", message: formatApiError(e.response?.data?.detail) });
      setPhase("select");
    } finally { setBusy(false); }
  };

  const reset = () => { swRef.current?.reset(); setSession(null); setResult(null); setLossModal(false); setPhase("select"); };
  const potential = Math.round(bet * (cfg?.win_multiplier || 5));

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="flex items-center gap-2 mb-1">
        <Link to="/home" data-testid="stopwatch-back" className="h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center mr-1"><ArrowLeft className="h-4 w-4" /></Link>
        <Target className="h-5 w-5 text-pazer-red" />
        <h1 className="font-display font-bold text-2xl tracking-tight">Fixed Challenge</h1>
        <HowToPlay k="stopwatch" /><MuteButton className="!ml-0" />
      </div>
      <p className="text-white/50 text-sm mb-6">Stop the clock <span className="text-pazer-red font-semibold">exactly</span> at the target to win {cfg?.win_multiplier || 5}×.</p>

      <AnimatePresence mode="wait">
        {phase === "select" && cfg && (
          <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
            <div>
              <div className="text-xs uppercase tracking-wider text-white/50 mb-2">Target Time</div>
              <div className="grid grid-cols-4 gap-2">
                {cfg.targets.map((t) => (
                  <button key={t} onClick={() => setTarget(t)} data-testid={`target-${t}`}
                    className={`py-3 rounded-xl font-mono-pz font-bold text-lg transition-colors ${target === t ? "bg-pazer-red text-white pz-glow-box" : "bg-white/5 text-white/70 hover:bg-white/10"}`}>
                    {t}<span className="text-xs opacity-60">s</span></button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-white/50 mb-2">Your Bet (min {cfg.min_bet})</div>
              <div className="flex items-center bg-black/40 border border-white/10 rounded-xl focus-within:border-pazer-red transition-colors mb-2">
                <Coins className="h-5 w-5 text-pazer-red ml-4" />
                <input data-testid="bet-input" type="number" min={cfg.min_bet} value={bet || ""} placeholder="Enter amount"
                  onChange={(e) => setBet(e.target.value === "" ? 0 : Math.max(0, parseInt(e.target.value) || 0))}
                  onFocus={(e) => e.target.select()}
                  className="w-full bg-transparent px-3 py-3.5 outline-none font-mono-pz text-xl font-bold" />
              </div>
              <div className="flex gap-2">
                {QUICK_BETS.map((v) => (
                  <button key={v} onClick={() => setBet(v)} data-testid={`quickbet-${v}`}
                    className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm font-mono-pz transition-colors">{v}</button>
                ))}
              </div>
            </div>
            <div className="rounded-2xl pz-glass p-5 flex items-center justify-between">
              <div>
                <div className="text-xs text-white/40 uppercase tracking-wider">Win Payout</div>
                <div className="font-mono-pz font-extrabold text-3xl text-green-400">{potential.toLocaleString()}</div>
              </div>
              <div className="text-right text-sm text-white/50">
                <div>Bet <span className="font-mono-pz text-white">{bet}</span></div>
                <div>Target <span className="font-mono-pz text-white">{target}s</span></div>
              </div>
            </div>
            <button onClick={start} disabled={busy} data-testid="start-challenge-btn"
              className="w-full py-4 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold text-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {busy && <Loader2 className="h-5 w-5 animate-spin" />} Pay {bet} & Start
            </button>
          </motion.div>
        )}

        {(phase === "countdown" || phase === "running" || phase === "result") && (
          <motion.div key="game" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center pt-2">
            <div className="relative flex items-center justify-center">
              <Stopwatch ref={swRef} target={target} running={phase === "running"} onTick={(e) => (elapsedRef.current = e)} />
              {phase === "countdown" && (
                <motion.div key={count} initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  className="absolute inset-0 flex items-center justify-center font-display font-extrabold text-7xl text-pazer-red pz-glow">
                  {count === 0 ? "GO" : count}
                </motion.div>
              )}
            </div>

            {phase !== "result" ? (
              <>
                <motion.button whileTap={{ scale: 0.92 }} onClick={stop} disabled={phase !== "running" || busy}
                  data-testid="stopwatch-stop-button"
                  className="mt-10 h-32 w-32 rounded-full bg-pazer-red font-display font-extrabold text-3xl pz-glow-box disabled:opacity-40 hover:bg-pazer-redhover transition-colors active:scale-95">
                  STOP
                </motion.button>
                <p className="text-white/40 text-sm mt-5">Tap STOP once, exactly at {target}.00</p>
              </>
            ) : result && (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full mt-8 rounded-2xl pz-glass p-6 text-center">
                <div className="grid grid-cols-3 gap-3 mb-5">
                  <div className="bg-black/40 rounded-xl p-3"><div className="text-[10px] text-white/40 uppercase mb-1">You</div><div className="font-mono-pz text-lg font-bold" data-testid="result-time">{result.recorded?.toFixed(2)}</div></div>
                  <div className="bg-black/40 rounded-xl p-3"><div className="text-[10px] text-white/40 uppercase mb-1">Target</div><div className="font-mono-pz text-lg font-bold">{result.target?.toFixed(2)}</div></div>
                  <div className="bg-black/40 rounded-xl p-3"><div className="text-[10px] text-white/40 uppercase mb-1">Off by</div><div className="font-mono-pz text-lg font-bold text-pazer-red">{result.diff?.toFixed(2)}</div></div>
                </div>
                <div className={`font-display font-bold text-xl mb-4 ${result.won ? "text-green-400" : "text-white/60"}`} data-testid="result-status">
                  {result.won ? `You won +${result.prize} coins!` : "Just missed it!"}
                </div>
                <button onClick={reset} data-testid="play-again-btn"
                  className="w-full py-3 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors flex items-center justify-center gap-2">
                  <RotateCcw className="h-4 w-4" /> New Challenge
                </button>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loss -> encouraging replay popup */}
      <AnimatePresence>
        {lossModal && result && !result.won && (
          <motion.div className="fixed inset-0 z-[95] flex items-center justify-center px-6"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="loss-replay-popup">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setLossModal(false)} />
            <motion.div initial={{ scale: 0.75, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="relative w-full max-w-sm rounded-3xl pz-glass border border-pazer-red/40 p-7 text-center pz-glow-box">
              <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-pazer-red/15 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-pazer-red" />
              </div>
              <h3 className="font-display font-bold text-xl mb-1">Don't worry — play again!</h3>
              <p className="text-white/60 text-sm mb-1">You stopped at <span className="font-mono-pz text-white">{result.recorded?.toFixed(2)}s</span> (target {result.target}s).</p>
              <p className="text-white/70 text-sm mb-6">Nail it this time and win <span className="text-green-400 font-bold">{potential.toLocaleString()} coins</span> (5×).</p>
              <button onClick={() => startWith(bet, target)} disabled={busy} data-testid="loss-replay-btn"
                className="w-full py-3.5 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Play Again ({bet}) & Win {potential.toLocaleString()}
              </button>
              <button onClick={() => setLossModal(false)} className="mt-3 text-white/40 text-sm hover:text-white">Maybe later</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
