import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { showPopup } from "@/components/CenterPopup";
import { showWin } from "@/components/WinCelebration";
import { GameShell, QuickBet } from "@/components/house/Shell";

const COL = { red: "#ef4444", green: "#22c55e", violet: "#a855f7" };
export const colorsOf = (n) => (n === 0 ? ["red", "violet"] : n === 5 ? ["green", "violet"] : n % 2 === 0 ? ["red"] : ["green"]);

function Ball({ n, size = "h-8 w-8 text-sm" }) {
  const c = colorsOf(n);
  const bg = c.length > 1 ? `linear-gradient(135deg, ${COL[c[0]]} 50%, ${COL.violet} 50%)` : COL[c[0]];
  return <span className={`${size} rounded-full flex items-center justify-center font-extrabold text-white shadow`} style={{ background: bg }}>{n}</span>;
}

function useRound(game) {
  const [st, setSt] = useState(null);
  const [now, setNow] = useState(Date.now());
  const load = useCallback(() => api.get(`/house/${game}/state`).then(({ data }) => setSt(data)).catch(() => {}), [game]);
  useEffect(() => { load(); const a = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(a); }, [load]);
  const left = st ? Math.max(0, (new Date(st.round.ends_at) - now) / 1000) : 0;
  const locked = st ? now >= new Date(st.round.lock_at) : true;
  useEffect(() => { if (st && left <= 0) { const t = setTimeout(load, 1500); return () => clearTimeout(t); } return undefined; }, [st, left, load]);
  return { st, left, locked, load };
}

function Countdown({ left, total, locked, period }) {
  const pct = Math.max(0, Math.min(1, left / total));
  const R = 54, C = 2 * Math.PI * R;
  return (
    <div className="flex flex-col items-center" data-testid="round-countdown">
      <div className="relative h-36 w-36">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle cx="60" cy="60" r={R} stroke="rgba(255,255,255,0.08)" strokeWidth="8" fill="none" />
          <circle cx="60" cy="60" r={R} stroke={locked ? "#ef4444" : "#f5b301"} strokeWidth="8" fill="none" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - pct)} style={{ transition: "stroke-dashoffset .25s linear", filter: "drop-shadow(0 0 6px #f5b301)" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono-pz text-3xl font-extrabold" data-testid="round-time">{`00:${String(Math.ceil(left)).padStart(2, "0")}`.slice(-5)}</span>
          <span className="text-[10px] uppercase tracking-widest text-white/50">{locked ? "Bets closed" : "Count down"}</span>
        </div>
      </div>
      <div className="text-[11px] text-white/50 mt-1">Period <span className="font-mono-pz text-amber-200" data-testid="round-period">#{period}</span></div>
    </div>
  );
}

export function TimedGame({ game }) {
  const { st, left, locked, load } = useRound(game);
  const [sel, setSel] = useState(null);
  const [bet, setBet] = useState(10);
  const [busy, setBusy] = useState(false);
  const [jodi, setJodi] = useState("");
  const seenRef = useRef(null);
  const c = st?.config;

  useEffect(() => {
    if (!st) return;
    const won = st.my_bets.filter((b) => b.status === "won");
    if (seenRef.current) won.filter((b) => !seenRef.current.has(b.id)).forEach((b) => { showWin(b.prize); window.dispatchEvent(new Event("wallet:refresh")); });
    seenRef.current = new Set(won.map((b) => b.id));
  }, [st]);

  const place = async () => {
    const pick = game === "matka" && sel?.kind === "jodi" ? { kind: "jodi", pick: jodi } : sel;
    if (!pick || (pick.kind === "jodi" && !/^\d{1,2}$/.test(jodi))) return showPopup({ type: "warning", title: "Pick first", message: "Choose what to bet on." });
    setBusy(true);
    try {
      await api.post(`/house/${game}/bet`, { ...pick, amount: bet });
      window.dispatchEvent(new Event("wallet:refresh"));
      showPopup({ type: "success", title: "Bet placed", message: `${bet} on ${pick.pick} · period #${st.round.period}` });
      setSel(null); load();
    } catch (e) { showPopup({ type: "warning", title: "Bet not placed", message: formatApiError(e.response?.data?.detail) }); }
    finally { setBusy(false); }
  };
  const isSel = (kind, pick) => sel?.kind === kind && String(sel.pick) === String(pick);
  const pickBtn = (kind, pick) => () => setSel({ kind, pick: String(pick) });

  if (!st) return <GameShell k={game}><div className="py-16 flex justify-center"><Loader2 className="h-7 w-7 animate-spin text-amber-300" /></div></GameShell>;
  return (
    <GameShell k={game}>
      <div className="rounded-3xl border border-amber-400/30 bg-[radial-gradient(circle_at_50%_30%,rgba(245,179,1,0.18),transparent_60%)] p-4">
        <Countdown left={left} total={st.round.round_seconds} locked={locked} period={st.round.period} />
        {game === "color" ? (
          <>
            <div className="grid grid-cols-3 gap-2 mt-4">
              {["green", "violet", "red"].map((k) => (
                <button key={k} onClick={pickBtn("color", k)} data-testid={`color-pick-${k}`}
                  className={`rounded-xl py-3 font-extrabold uppercase text-sm text-white transition-transform ${isSel("color", k) ? "ring-4 ring-amber-300 scale-105" : ""}`} style={{ background: COL[k] }}>
                  {k}<div className="text-[10px] font-bold opacity-80">{k === "violet" ? `${c.payout_violet}×` : `${c.payout_color}×`}</div>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-5 gap-2 mt-3" data-testid="color-numbers">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <button key={n} onClick={pickBtn("number", n)} data-testid={`color-num-${n}`} className={`flex justify-center rounded-xl p-1 ${isSel("number", n) ? "ring-4 ring-amber-300" : ""}`}><Ball n={n} size="h-11 w-11 text-lg" /></button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              {["small", "big"].map((k) => (
                <button key={k} onClick={pickBtn("size", k)} data-testid={`color-size-${k}`}
                  className={`rounded-xl py-2.5 font-extrabold uppercase ${k === "big" ? "bg-amber-500 text-black" : "bg-sky-500 text-black"} ${isSel("size", k) ? "ring-4 ring-white" : ""}`}>{k} <span className="text-xs">({k === "big" ? "5-9" : "0-4"}) {c.payout_size}×</span></button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="text-xs uppercase tracking-widest text-white/50 mt-4 mb-2">Single digit · {c.payout_single}×</div>
            <div className="grid grid-cols-5 gap-2" data-testid="matka-singles">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <button key={n} onClick={pickBtn("single", n)} data-testid={`matka-single-${n}`}
                  className={`h-12 rounded-xl font-mono-pz text-xl font-extrabold border ${isSel("single", n) ? "bg-pazer-red border-amber-200" : "bg-purple-900/40 border-purple-400/40"}`}>{n}</button>
              ))}
            </div>
            <div className="text-xs uppercase tracking-widest text-white/50 mt-4 mb-2">Jodi (00-99) · {c.payout_jodi}×</div>
            <div className="flex gap-2">
              <input value={jodi} maxLength={2} onChange={(e) => { setJodi(e.target.value.replace(/\D/g, "")); setSel({ kind: "jodi", pick: e.target.value }); }} placeholder="42"
                data-testid="matka-jodi-input" className="flex-1 rounded-xl bg-black/60 border border-purple-400/40 px-4 py-3 font-mono-pz text-2xl text-center outline-none focus:border-amber-300" />
            </div>
          </>
        )}
      </div>

      <div className="mt-4"><QuickBet bet={bet} setBet={setBet} min={c.min_bet} prefix={game} /></div>
      <div className="grid grid-cols-[1fr_2fr] gap-2 mt-3">
        <button onClick={() => { setSel(null); setJodi(""); }} data-testid={`${game}-clear`} className="rounded-xl bg-white/10 py-3.5 font-extrabold">CLEAR</button>
        <button onClick={place} disabled={busy || locked} data-testid={`${game}-place-bet`} className="rounded-xl bg-pazer-red py-3.5 font-extrabold disabled:opacity-50 flex items-center justify-center gap-2">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}{locked ? "WAIT FOR NEXT ROUND" : `PLACE BET${sel ? ` · ${sel.pick.toUpperCase()}` : ""}`}
        </button>
      </div>

      <h3 className="font-display text-lg mt-6 mb-2 pz-gold-text">RECENT RESULTS</h3>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-3" data-testid={`${game}-recent`}>
        {st.history.map((h) => game === "color" ? <Ball key={h.period} n={h.result} /> :
          <span key={h.period} className="h-8 min-w-[2.5rem] px-1 rounded-lg bg-purple-800 flex items-center justify-center font-mono-pz text-sm font-bold">{String(h.result).padStart(2, "0")}</span>)}
      </div>
      <div className="rounded-2xl border border-white/10 overflow-hidden text-xs" data-testid={`${game}-results-table`}>
        <div className="grid grid-cols-4 bg-white/5 px-3 py-2 font-bold text-white/60"><span>Period</span><span className="text-center">Number</span><span className="text-center">{game === "color" ? "Big/Small" : "Single"}</span><span className="text-right">{game === "color" ? "Color" : "Jodi"}</span></div>
        {st.history.slice(0, 10).map((h) => (
          <motion.div key={h.period} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-4 px-3 py-2 border-t border-white/5 items-center">
            <span className="font-mono-pz text-white/60">{h.period.slice(-7, -1)}</span>
            <span className="text-center font-mono-pz font-bold">{game === "color" ? h.result : String(h.result).padStart(2, "0")}</span>
            <span className="text-center">{game === "color" ? (h.result >= 5 ? "Big" : "Small") : h.result % 10}</span>
            <span className="flex justify-end gap-1">{game === "color" ? colorsOf(h.result).map((x) => <span key={x} className="h-3 w-3 rounded-full" style={{ background: COL[x] }} />) : String(h.result).padStart(2, "0")}</span>
          </motion.div>
        ))}
      </div>

      {st.my_bets.length > 0 && <h3 className="font-display text-lg mt-6 mb-2 pz-gold-text">MY BETS</h3>}
      <div className="space-y-1.5" data-testid={`${game}-my-bets`}>
        {st.my_bets.map((b) => (
          <div key={b.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-xs">
            <span className="font-mono-pz text-white/50">#{b.period.slice(-7, -1)}</span><span className="uppercase font-bold">{b.kind}: {b.pick}</span>
            <span className="font-mono-pz">₹{b.amount}</span>
            <span className={b.status === "won" ? "text-green-400 font-bold" : b.status === "lost" ? "text-red-400" : "text-amber-300"}>{b.status === "won" ? `+${b.prize}` : b.status}</span>
          </div>
        ))}
      </div>
    </GameShell>
  );
}
