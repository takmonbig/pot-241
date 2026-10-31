import { useEffect, useState } from "react";
import { Loader2, Clock, RefreshCw } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { showPopup } from "@/components/CenterPopup";
import { GameShell, QuickBet } from "@/components/house/Shell";

const KINDS = [["open_single", "Open Single", 1], ["close_single", "Close Single", 1], ["jodi", "Jodi", 2], ["open_panna", "Open Panna", 3], ["close_panna", "Close Panna", 3]];

export default function MatkaLive() {
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(null);
  const [res, setRes] = useState(null);
  const [kind, setKind] = useState("jodi");
  const [pick, setPick] = useState("");
  const [bet, setBet] = useState(10);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState([]);
  const [q, setQ] = useState("");
  const loadMine = () => api.get("/matka/my-bets").then(({ data: d }) => setMine(d)).catch(() => {});
  useEffect(() => { api.get("/matka/markets").then(({ data: d }) => setData(d)).catch(() => setData({ markets: [], payout: {} })); loadMine(); }, []);
  const choose = (m) => { setSel(m); setRes(null); api.get(`/matka/result/${encodeURIComponent(m.name)}`).then(({ data: d }) => setRes(d)).catch(() => {}); };
  const len = KINDS.find((k) => k[0] === kind)[2];
  const place = async () => {
    setBusy(true);
    try {
      await api.post("/matka/bet", { market: sel.name, kind, pick, amount: bet });
      window.dispatchEvent(new Event("wallet:refresh"));
      showPopup({ type: "success", title: "Bet placed", message: `${sel.name} · ${kind.replace("_", " ")} ${pick} · ₹${bet}` });
      setPick(""); loadMine();
    } catch (e) { showPopup({ type: "warning", title: "Bet not placed", message: formatApiError(e.response?.data?.detail) }); }
    finally { setBusy(false); }
  };
  if (!data) return <GameShell k="matka"><div className="py-16 flex justify-center"><Loader2 className="h-7 w-7 animate-spin text-amber-300" /></div></GameShell>;
  const list = data.markets.filter((m) => m.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <GameShell k="matka">
      {!sel ? (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search market (Kalyan, Milan Day…)" data-testid="matka-search" className="w-full rounded-xl bg-black/60 border border-purple-400/40 px-4 py-3 mb-3 outline-none focus:border-amber-300" />
          <div className="space-y-2" data-testid="matka-markets">
            {list.length === 0 && <p className="text-center text-white/40 py-8">No markets open today.</p>}
            {list.slice(0, 60).map((m) => (
              <button key={m.name} onClick={() => choose(m)} data-testid={`matka-market-${m.name.replace(/\s+/g, "-")}`} className="w-full flex items-center gap-3 rounded-2xl border border-purple-400/30 bg-black/50 p-3 text-left hover:border-amber-300">
                <div className="flex-1"><div className="font-display">{m.name}</div><div className="text-[11px] text-white/50 flex items-center gap-1"><Clock className="h-3 w-3" />Open {m.open_time} · Close {m.close_time}</div></div>
                <span className={`rounded-lg px-2 py-1 text-[10px] font-extrabold ${m.close_bets ? "bg-green-500/20 text-green-400" : "bg-red-500/15 text-red-400"}`}>{m.open_bets ? "BETTING OPEN" : m.close_bets ? "CLOSE OPEN" : "CLOSED"}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div data-testid="matka-market-detail">
          <button onClick={() => setSel(null)} className="text-xs text-amber-300 mb-2" data-testid="matka-back-list">← All markets</button>
          <div className="rounded-2xl border border-purple-400/40 bg-gradient-to-br from-purple-900/40 to-black p-4 text-center">
            <div className="font-display text-2xl">{sel.name}</div>
            <div className="text-xs text-white/60">Open {sel.open_time} · Close {sel.close_time}</div>
            <div className="mt-2 font-mono-pz text-3xl font-extrabold pz-gold-text" data-testid="matka-live-result">{res ? (res.result || "***-**-***") : "…"}</div>
            <button onClick={() => choose(sel)} className="text-[11px] text-white/50 flex items-center gap-1 mx-auto mt-1"><RefreshCw className="h-3 w-3" />Refresh result</button>
          </div>
          <div className="grid grid-cols-3 gap-1.5 mt-4">{KINDS.map(([k, l]) => (
            <button key={k} onClick={() => { setKind(k); setPick(""); }} data-testid={`matka-kind-${k}`} className={`rounded-lg py-2 text-[11px] font-extrabold ${kind === k ? "bg-pazer-red" : "bg-white/5"}`}>{l}<div className="text-[9px] opacity-70">{data.payout[k]}×</div></button>
          ))}</div>
          <input value={pick} maxLength={len} onChange={(e) => setPick(e.target.value.replace(/\D/g, ""))} placeholder={"0".repeat(len)} data-testid="matka-pick-input"
            className="mt-3 w-full rounded-xl bg-black/60 border border-purple-400/40 px-4 py-3 font-mono-pz text-3xl text-center tracking-[0.5em] outline-none focus:border-amber-300" />
          <div className="mt-3"><QuickBet bet={bet} setBet={setBet} prefix="matka" /></div>
          <button onClick={place} disabled={busy || pick.length !== len || !(kind.startsWith("close") ? sel.close_bets : sel.open_bets)} data-testid="matka-place"
            className="mt-3 w-full rounded-xl bg-pazer-red py-4 font-extrabold disabled:opacity-50 flex items-center justify-center gap-2">{busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {(kind.startsWith("close") ? sel.close_bets : sel.open_bets) ? `PLACE BET · ₹${bet}` : "BETTING CLOSED"}</button>
          <p className="mt-2 text-[11px] text-white/40">Results come from the official market feed and are settled automatically within a few minutes of being declared.</p>
        </div>
      )}
      <h3 className="font-display text-lg mt-6 mb-2 pz-gold-text">MY BETS</h3>
      <div className="space-y-1.5" data-testid="matka-my-bets">
        {mine.length === 0 && <p className="text-xs text-white/40">No bets yet.</p>}
        {mine.map((b) => <div key={b.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-xs"><span className="truncate max-w-[35%]">{b.market}</span><span className="uppercase">{b.kind.replace("_", " ")} {b.pick}</span><span>₹{b.amount}</span><span className={b.status === "won" ? "text-green-400 font-bold" : b.status === "lost" ? "text-red-400" : "text-amber-300"}>{b.status === "won" ? `+${b.prize}` : b.status}</span></div>)}
      </div>
    </GameShell>
  );
}
