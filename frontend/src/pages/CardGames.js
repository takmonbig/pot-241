import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { showPopup } from "@/components/CenterPopup";
import { showWin } from "@/components/WinCelebration";
import { GameShell, PlayingCard, QuickBet } from "@/components/house/Shell";

function useHousePlay() {
  const [busy, setBusy] = useState(false);
  const run = async (fn) => {
    setBusy(true);
    try { const { data } = await fn(); window.dispatchEvent(new Event("wallet:refresh")); return data; }
    catch (e) {
      const d = formatApiError(e.response?.data?.detail);
      showPopup({ type: /insufficient/i.test(d) ? "wallet" : "warning", title: /insufficient/i.test(d) ? "Insufficient balance" : "Oops", message: d });
      return null;
    } finally { setBusy(false); }
  };
  return { busy, run };
}

function Result({ r, testid }) {
  return (
    <AnimatePresence>
      {r && (
        <motion.div key={r.text} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} data-testid={testid}
          className={`mt-3 rounded-2xl py-3 text-center font-display text-2xl ${r.win ? "bg-green-500/15 text-green-400 border border-green-400/40" : r.push ? "bg-white/10 text-white" : "bg-red-500/10 text-red-400 border border-red-400/30"}`}>
          {r.text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const Table = ({ children }) => <div className="rounded-3xl border-2 border-amber-400/40 bg-[radial-gradient(ellipse_at_center,#0f3d22,#06170d_70%)] p-4 min-h-[220px]">{children}</div>;

export function AndarBahar() {
  const [bet, setBet] = useState(10);
  const [side, setSide] = useState("andar");
  const [d, setD] = useState(null);
  const [res, setRes] = useState(null);
  const { busy, run } = useHousePlay();
  const play = async () => {
    setRes(null); setD(null);
    const data = await run(() => api.post("/house/andar/play", { bet, side }));
    if (!data) return;
    setD(data);
    setTimeout(() => { setRes({ win: data.won, text: data.won ? `${data.winner.toUpperCase()} WINS · +${data.prize}` : `${data.winner.toUpperCase()} wins` }); if (data.won) showWin(data.prize); }, Math.min(3000, (data.andar.length + data.bahar.length) * 120 + 400));
  };
  return (
    <GameShell k="andar">
      <Table>
        <div className="flex flex-col items-center"><span className="text-[10px] uppercase tracking-widest text-amber-200 mb-1">Joker</span>{d ? <PlayingCard c={d.joker} /> : <PlayingCard hidden />}</div>
        {["andar", "bahar"].map((s) => (
          <div key={s} className="mt-3" data-testid={`andar-row-${s}`}>
            <div className={`text-xs font-extrabold uppercase mb-1 ${d?.winner === s ? "text-green-400" : "text-white/60"}`}>{s} {d?.winner === s && "✓"}</div>
            <div className="flex gap-1 overflow-x-auto no-scrollbar min-h-[56px]">{(d?.[s] || []).map((c, i) => <PlayingCard key={i} c={c} i={i * 2 + (s === "bahar" ? 1 : 0)} small />)}</div>
          </div>
        ))}
      </Table>
      <Result r={res} testid="andar-result" />
      <div className="grid grid-cols-2 gap-2 mt-4">
        {[["andar", "1.9×"], ["bahar", "2×"]].map(([s, m]) => (
          <button key={s} onClick={() => setSide(s)} disabled={busy} data-testid={`andar-side-${s}`}
            className={`rounded-xl py-3 font-extrabold uppercase ${side === s ? "bg-pazer-red" : "bg-white/5 border border-white/10"}`}>{s} <span className="text-xs">{m}</span></button>
        ))}
      </div>
      <div className="mt-3"><QuickBet bet={bet} setBet={setBet} prefix="andar" disabled={busy} /></div>
      <button onClick={play} disabled={busy} data-testid="andar-play" className="mt-3 w-full rounded-xl bg-pazer-red py-4 font-extrabold text-lg flex items-center justify-center gap-2">{busy && <Loader2 className="h-5 w-5 animate-spin" />}DEAL · ₹{bet}</button>
    </GameShell>
  );
}

export function TeenPatti() {
  const [bet, setBet] = useState(10);
  const [d, setD] = useState(null);
  const [res, setRes] = useState(null);
  const { busy, run } = useHousePlay();
  const play = async () => {
    setRes(null); setD(null);
    const data = await run(() => api.post("/house/teen/play", { bet }));
    if (!data) return;
    setD(data);
    setTimeout(() => { setRes({ win: data.won, push: data.push, text: data.won ? `YOU WIN · +${data.prize}` : data.push ? "TIE · bet refunded" : "DEALER WINS" }); if (data.won) showWin(data.prize); }, 1000);
  };
  const Hand = ({ who, cards, label }) => (
    <div className="flex flex-col items-center" data-testid={`teen-${who}`}>
      <span className="text-[10px] uppercase tracking-widest text-amber-200 mb-1">{who === "you" ? "You" : "Dealer"}{label && ` · ${label}`}</span>
      <div className="flex gap-1.5">{(cards || [null, null, null]).map((c, i) => <PlayingCard key={i} c={c} hidden={!c} i={i + (who === "dealer" ? 3 : 0)} />)}</div>
    </div>
  );
  return (
    <GameShell k="teen">
      <Table><div className="flex flex-col gap-5"><Hand who="dealer" cards={d?.dealer} label={d?.dealer_hand} /><Hand who="you" cards={d?.you} label={d?.you_hand} /></div></Table>
      <Result r={res} testid="teen-result" />
      <div className="mt-4"><QuickBet bet={bet} setBet={setBet} prefix="teen" disabled={busy} /></div>
      <button onClick={play} disabled={busy} data-testid="teen-play" className="mt-3 w-full rounded-xl bg-pazer-red py-4 font-extrabold text-lg flex items-center justify-center gap-2">{busy && <Loader2 className="h-5 w-5 animate-spin" />}DEAL · ₹{bet}</button>
    </GameShell>
  );
}

export function Break10() {
  const [bet, setBet] = useState(10);
  const [s, setS] = useState(null);
  const [res, setRes] = useState(null);
  const { busy, run } = useHousePlay();
  const start = async () => {
    setRes(null);
    const data = await run(() => api.post("/house/break10/start", { bet }));
    if (data) setS({ ...data, done: false, you_total: data.you.reduce((a, c) => a + (c.rank >= 10 ? 0 : c.rank), 0) });
  };
  const act = async (action) => {
    const data = await run(() => api.post("/house/break10/act", { session_id: s.session_id, action }));
    if (!data) return;
    setS({ ...s, ...data });
    if (data.done) {
      const t = { win: data.outcome === "win", push: data.outcome === "push", text: data.outcome === "win" ? `YOU WIN · +${data.prize}` : data.outcome === "push" ? "PUSH · refunded" : data.outcome === "bust" ? `BROKE THE 10 (${data.you_total})` : `DEALER WINS (${data.dealer_total})` };
      setTimeout(() => { setRes(t); if (t.win) showWin(data.prize); }, 600);
    }
  };
  const active = s && !s.done;
  return (
    <GameShell k="break10">
      <Table>
        <div className="flex flex-col items-center gap-5">
          <div className="flex flex-col items-center" data-testid="break10-dealer"><span className="text-[10px] uppercase tracking-widest text-amber-200 mb-1">Dealer {s?.done && `· ${s.dealer_total}`}</span>
            <div className="flex gap-1.5">{s ? s.dealer.map((c, i) => <PlayingCard key={i} c={c} i={i} />) : <PlayingCard hidden />}{active && <PlayingCard hidden />}</div></div>
          <div className="flex flex-col items-center" data-testid="break10-you"><span className="text-[10px] uppercase tracking-widest text-amber-200 mb-1">You · <b className="text-white text-sm" data-testid="break10-total">{s?.you_total ?? 0}</b> / 10</span>
            <div className="flex gap-1.5 flex-wrap justify-center">{s ? s.you.map((c, i) => <PlayingCard key={i} c={c} i={i} />) : <PlayingCard hidden />}</div></div>
        </div>
      </Table>
      <Result r={res} testid="break10-result" />
      {active ? (
        <div className="grid grid-cols-2 gap-2 mt-4">
          <button onClick={() => act("hit")} disabled={busy} data-testid="break10-hit" className="rounded-xl bg-white/10 py-4 font-extrabold">HIT</button>
          <button onClick={() => act("stand")} disabled={busy} data-testid="break10-stand" className="rounded-xl bg-pazer-red py-4 font-extrabold">STAND</button>
        </div>
      ) : (
        <>
          <div className="mt-4"><QuickBet bet={bet} setBet={setBet} prefix="break10" disabled={busy} /></div>
          <button onClick={start} disabled={busy} data-testid="break10-play" className="mt-3 w-full rounded-xl bg-pazer-red py-4 font-extrabold text-lg flex items-center justify-center gap-2">{busy && <Loader2 className="h-5 w-5 animate-spin" />}DEAL · ₹{bet}</button>
        </>
      )}
    </GameShell>
  );
}

export { useHousePlay, Result, Table };
