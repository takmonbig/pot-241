import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plane, Coins, Loader2, ArrowLeft, Zap } from "lucide-react";
import { MuteButton } from "@/components/MuteButton";
import api, { formatApiError } from "@/lib/api";
import { AviatorCanvas } from "@/components/AviatorCanvas";
import { showPopup } from "@/components/CenterPopup";
import { showWin } from "@/components/WinCelebration";
import { fbTrack } from "@/lib/siteConfig";
import { HowToPlay } from "@/components/HowToPlay";
import { useRace, RaceBar } from "@/components/Race";

const QUICK = [20, 50, 100, 200, 500];
const HKEY = "tu_aviator_hist";

const pillColor = (m) => (m >= 10 ? "text-amber-300 border-amber-400/40" : m >= 2 ? "text-orange-300 border-orange-400/40" : "text-white/60 border-white/15");

function History({ list }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3 no-scrollbar" data-testid="aviator-history">
      {list.length === 0 && <span className="text-xs text-white/30">No rounds yet</span>}
      {list.map((m, i) => (
        <span key={i} className={`shrink-0 rounded-full border bg-black/40 px-2.5 py-0.5 font-mono-pz text-xs font-bold ${pillColor(m)}`}>{m.toFixed(2)}x</span>
      ))}
    </div>
  );
}

function BigMultiplier({ phase, mult, cashed }) {
  const crashed = phase === "crashed";
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
      {phase === "idle" ? (
        <div className="text-center">
          <Plane className="mx-auto h-8 w-8 text-pazer-red mb-2 animate-pulse" />
          <div className="font-display font-bold text-lg text-white/80">Place your bet</div>
          <div className="text-xs text-white/40">Cash out before the plane flies away</div>
        </div>
      ) : (
        <>
          {crashed && <div className="font-display font-bold text-sm tracking-[0.3em] text-pazer-red mb-1" data-testid="aviator-flew-away">FLEW AWAY!</div>}
          <div data-testid="aviator-multiplier"
            className={`font-display font-extrabold text-6xl sm:text-7xl tabular-nums ${crashed ? "text-pazer-red" : "text-white"}`}
            style={{ textShadow: crashed ? "0 0 30px rgba(255,42,42,0.8)" : "0 0 28px rgba(255,120,40,0.7)" }}>
            {mult.toFixed(2)}x
          </div>
          {cashed && <div className="mt-2 rounded-full bg-green-500/20 border border-green-400/50 px-3 py-1 text-green-300 text-sm font-bold" data-testid="aviator-cashed-badge">Cashed out @ {cashed.toFixed(2)}x</div>}
        </>
      )}
    </div>
  );
}

export default function Aviator() {
  const [cfg, setCfg] = useState(null);
  const [bet, setBet] = useState(20);
  const [auto, setAuto] = useState(false);
  const [autoX, setAutoX] = useState(2);
  const [phase, setPhase] = useState("idle");
  const [mult, setMult] = useState(1);
  const [cashed, setCashed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hist, setHist] = useState(() => { try { return JSON.parse(localStorage.getItem(HKEY)) || []; } catch { return []; } });
  const canvas = useRef(null);
  const sess = useRef(null);
  const settled = useRef(false);
  const race = useRace();
  const autoRef = useRef({ auto, autoX });
  autoRef.current = { auto, autoX };

  useEffect(() => { api.get("/config/public").then(({ data }) => { setCfg(data.aviator_config); setBet(data.aviator_config.min_bet || 20); }).catch(() => {}); }, []);
  useEffect(() => { window.dispatchEvent(new CustomEvent("game:active", { detail: phase === "flying" })); }, [phase]);
  useEffect(() => () => window.dispatchEvent(new CustomEvent("game:active", { detail: false })), []);

  const start = async () => {
    if (!race.id && bet < (cfg?.min_bet || 20)) return showPopup({ type: "warning", title: "Bet too low", message: `Minimum bet is ${cfg?.min_bet || 20} coins.` });
    setBusy(true);
    try {
      const { data } = race.id ? await race.play() : await api.post("/games/aviator/start", { bet });
      sess.current = data; settled.current = false;
      setCashed(null); setMult(1); setPhase("flying");
      canvas.current?.fly(data.growth_rate, data.crash_point ?? 1e9);
      if (data.crash_point == null) pollCrash(data);
      fbTrack("game_play", { value: bet, currency: "INR" });
      window.dispatchEvent(new Event("wallet:refresh"));
    } catch (e) {
      const d = formatApiError(e.response?.data?.detail);
      if (/insufficient/i.test(d)) showPopup({ type: "wallet", title: "Insufficient balance", message: "Add coins to your wallet to keep playing." });
      else showPopup({ type: "warning", title: "Can't start", message: d });
    } finally { setBusy(false); }
  };

  const pollCrash = (s) => {
    const iv = setInterval(async () => {
      if (sess.current !== s) return clearInterval(iv);
      try {
        const { data } = await api.post("/games/aviator/status", { session_id: s.session_id, nonce: s.nonce, multiplier: 0 });
        if (data.crashed) { clearInterval(iv); canvas.current?.setCrash(data.crash_point); }
      } catch (e) { clearInterval(iv); }
    }, 250);
  };

  const settle = async (m, manual) => {
    if (settled.current || !sess.current) return;
    settled.current = true;
    const s = sess.current;
    try {
      const { data } = await api.post("/games/aviator/cashout", { session_id: s.session_id, nonce: s.nonce, multiplier: m });
      window.dispatchEvent(new Event("wallet:refresh"));
      if (data.race) { race.finished(); if (data.won) setCashed(data.multiplier); showPopup({ type: data.won ? "success" : "warning", title: data.won ? `Race score: ${data.multiplier}×` : "Flew away", message: "Check the lobby to see how you rank." }); }
      else if (data.won) { setCashed(data.multiplier); showWin(data.prize); }
      else if (manual) showPopup({ type: "warning", title: "Too late!", message: `The plane flew away at ${data.crash_point.toFixed(2)}x.` });
    } catch (e) { showPopup({ type: "warning", title: "Something went wrong", message: formatApiError(e.response?.data?.detail) }); }
  };

  const onTick = (m) => {
    setMult(Math.floor(m * 100) / 100);
    const a = autoRef.current;
    if (a.auto && a.autoX > 1 && m >= a.autoX) settle(a.autoX, false);
  };

  const onCrash = (cp) => {
    setMult(cp); setPhase("crashed");
    settle(cp, false);
    setHist((h) => { const n = [cp, ...h].slice(0, 20); localStorage.setItem(HKEY, JSON.stringify(n)); return n; });
    setTimeout(() => { canvas.current?.reset(); setPhase("idle"); setMult(1); }, 2800);
  };

  const flying = phase === "flying";
  const canCash = flying && !settled.current;

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 pb-40" data-testid="aviator-page">
      <div className="flex items-center gap-3 mb-3">
        <Link to="/home" data-testid="aviator-back" className="h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center"><ArrowLeft className="h-4 w-4" /></Link>
        <Plane className="h-5 w-5 text-pazer-red" />
        <h1 className="font-display font-bold text-2xl tracking-tight">Aviator</h1>
        <HowToPlay k="aviator" /><MuteButton className="!ml-0" />
      </div>
      <RaceBar race={race} />
      <History list={hist} />

      <div className="relative h-72 sm:h-80 rounded-3xl overflow-hidden border border-pazer-red/30 pz-glow-box">
        <AviatorCanvas ref={canvas} onTick={onTick} onCrash={onCrash} />
        <BigMultiplier phase={phase} mult={mult} cashed={cashed} />
      </div>

      <div className="mt-5 rounded-3xl pz-glass p-5 space-y-4">
        {!race.id && <BetControls cfg={cfg} bet={bet} setBet={setBet} disabled={flying} />}
        <AutoControls auto={auto} setAuto={setAuto} autoX={autoX} setAutoX={setAutoX} disabled={flying} />
        <AnimatePresence mode="wait">
          {canCash ? (
            <motion.button key="cash" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
              whileTap={{ scale: 0.96 }} onClick={() => settle(mult, true)} data-testid="aviator-cashout-btn"
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 font-extrabold text-lg shadow-lg shadow-orange-500/40">
              CASH OUT <span className="font-mono-pz">{race.id ? `${mult.toFixed(2)}×` : (bet * mult).toFixed(2)}</span>
            </motion.button>
          ) : (
            <motion.button key="bet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={start} disabled={busy || phase !== "idle" || (race.id && race.locked)} data-testid="aviator-bet-btn"
              className="w-full py-4 rounded-2xl bg-pazer-red hover:bg-pazer-redhover font-extrabold text-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
              {busy && <Loader2 className="h-5 w-5 animate-spin" />}
              {phase === "idle" ? (race.id ? (race.locked ? "Race run used" : "Start race run") : `BET ${bet}`) : flying ? "Waiting for landing…" : "Next round…"}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function BetControls({ cfg, bet, setBet, disabled }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-white/50 mb-2">Bet (min {cfg?.min_bet || 20})</div>
      <div className="flex items-center bg-black/40 border border-white/10 rounded-xl focus-within:border-pazer-red transition-colors mb-2">
        <Coins className="h-5 w-5 text-pazer-red ml-4" />
        <input data-testid="aviator-bet-input" type="number" disabled={disabled} value={bet || ""} placeholder="Enter amount"
          onChange={(e) => setBet(Math.max(0, parseInt(e.target.value) || 0))} onFocus={(e) => e.target.select()}
          className="w-full bg-transparent px-3 py-3 outline-none font-mono-pz text-xl font-bold disabled:opacity-50" />
      </div>
      <div className="flex gap-2">
        {QUICK.map((v) => (
          <button key={v} disabled={disabled} onClick={() => setBet(v)} data-testid={`aviator-quickbet-${v}`}
            className={`flex-1 py-2 rounded-lg text-sm font-mono-pz transition-colors disabled:opacity-40 ${bet === v ? "bg-pazer-red/30 text-white" : "bg-white/5 hover:bg-white/10"}`}>{v}</button>
        ))}
      </div>
    </div>
  );
}

function AutoControls({ auto, setAuto, autoX, setAutoX, disabled }) {
  return (
    <div className="flex items-center gap-3">
      <button disabled={disabled} onClick={() => setAuto(!auto)} data-testid="aviator-auto-toggle"
        className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${auto ? "bg-orange-500/25 text-orange-200 border border-orange-400/50" : "bg-white/5 text-white/60 border border-white/10"}`}>
        <Zap className="h-4 w-4" /> Auto Cash-out {auto ? "ON" : "OFF"}
      </button>
      <div className={`flex-1 flex items-center bg-black/40 border border-white/10 rounded-xl ${auto ? "" : "opacity-40"}`}>
        <input data-testid="aviator-auto-input" type="number" step="0.1" min="1.1" disabled={disabled || !auto} value={autoX}
          onChange={(e) => setAutoX(parseFloat(e.target.value) || 0)}
          className="w-full bg-transparent px-3 py-2.5 outline-none font-mono-pz font-bold" />
        <span className="pr-3 text-white/40 font-mono-pz">x</span>
      </div>
    </div>
  );
}
