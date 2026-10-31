import { motion, AnimatePresence } from "framer-motion";
import { PlayingCard } from "@/components/house/Shell";

const SUITN = { S: "♠ Spades (Hukum)", H: "♥ Hearts", D: "♦ Diamonds", C: "♣ Clubs" };
const RK = { 14: "A", 13: "K", 12: "Q", 11: "J" };
const eq = (a, b) => a[0] === b[0] && a[1] === b[1];

function Seat({ i, d, pos }) {
  const st = d.state, s = d.seats[i], g = d.room.game;
  const active = st.turn === i && st.phase !== "hand_end";
  const cls = { top: "top-1 left-1/2 -translate-x-1/2", left: "left-1 top-1/2 -translate-y-1/2", right: "right-1 top-1/2 -translate-y-1/2" }[pos];
  return (
    <div className={`absolute ${cls} text-center`} data-testid={`table-seat-${i}`}>
      <div className={`mx-auto h-10 w-10 rounded-full flex items-center justify-center font-bold border-2 ${active ? "border-amber-300 shadow-[0_0_14px_#f5b301]" : "border-white/20"} ${g === "break10" ? (i % 2 ? "bg-sky-700" : "bg-red-700") : "bg-black/60"}`}>{s.name[0]}</div>
      <div className="text-[10px] font-bold max-w-[80px] truncate">{s.name}{s.bot && " 🤖"}</div>
      <div className="text-[9px] text-white/60">{st.counts[i]} cards{g === "callbreak" ? ` · ${st.tricks?.[i] ?? 0}/${st.bids?.[i] ?? "?"}` : ""}</div>
    </div>
  );
}

function Bidding({ d, send, busy }) {
  const st = d.state, g = d.room.game;
  if (st.turn !== d.my_seat) return <p className="text-center text-sm text-white/60 py-3" data-testid="bid-waiting">Waiting for {d.seats[st.turn].name} to bid…</p>;
  if (g === "callbreak") return (
    <div data-testid="cb-bid-panel"><p className="text-xs text-white/60 mb-2 text-center">Your bid: how many tricks will you win?</p>
      <div className="grid grid-cols-7 gap-1">{Array.from({ length: 13 }, (_, i) => i + 1).map((b) => <button key={b} disabled={busy} onClick={() => send({ bid: b })} data-testid={`pvp-bid-${b}`} className="rounded-lg bg-pazer-red py-2 font-extrabold">{b}</button>)}</div></div>
  );
  const bs = st.best_sequence;
  return (
    <div className="text-center space-y-2" data-testid="b10-bid-panel">
      <p className="text-xs text-white/60">Declare your best same-suit sequence. Longest (then highest) wins and picks trump.</p>
      {bs?.length >= 2 ? (
        <button disabled={busy} onClick={() => send({ suit: bs.suit, length: bs.length, top: bs.top })} data-testid="b10-declare" className="w-full rounded-xl bg-pazer-red py-3 font-extrabold">
          DECLARE {bs.length} cards {RK[bs.top] || bs.top}↓ in {SUITN[bs.suit]}</button>
      ) : <p className="text-xs text-white/40">You have no sequence of 2+ cards.</p>}
      <button disabled={busy} onClick={() => send({ pass_: true })} data-testid="b10-pass" className="w-full rounded-xl bg-white/10 py-2.5 font-bold">PASS</button>
    </div>
  );
}

export function CardTable({ d, send, busy }) {
  const st = d.state, g = d.room.game, me = d.my_seat ?? 0;
  const rel = (k) => (me + k) % 4;
  const trick = st.trick?.length ? st.trick : st.last_trick?.cards || [];
  const legal = st.legal || [];
  return (
    <div data-testid={`table-${g}`}>
      <div className="flex flex-wrap gap-2 text-[11px] mb-2">
        <span className="rounded-full bg-amber-400/15 text-amber-200 px-2 py-0.5" data-testid="table-trump">Trump: {g === "callbreak" ? SUITN.S : st.trump ? SUITN[st.trump] : "bidding…"}</span>
        {g === "callbreak" && <span className="rounded-full bg-white/10 px-2 py-0.5">Hand {st.hand_no}</span>}
        <span className="rounded-full bg-white/10 px-2 py-0.5">Trick {Math.min(13, (st.trick_no || 0) + 1)}/13</span>
        {g === "break10" && <span className="rounded-full bg-white/10 px-2 py-0.5" data-testid="b10-points">Team 1 (red): {st.points?.[0] ?? 0} · Team 2 (blue): {st.points?.[1] ?? 0}</span>}
        {g === "callbreak" && st.totals && <span className="rounded-full bg-white/10 px-2 py-0.5" data-testid="cb-totals">Totals: {st.totals.map((t) => (t / 10).toFixed(1)).join(" / ")}</span>}
      </div>
      <div className="relative h-72 rounded-[2rem] border-4 border-amber-700/60 bg-[radial-gradient(ellipse_at_center,#13502c,#06170d_75%)]">
        <Seat i={rel(2)} d={d} pos="top" /><Seat i={rel(1)} d={d} pos="left" /><Seat i={rel(3)} d={d} pos="right" />
        <div className="absolute inset-0 flex items-center justify-center" data-testid="table-trick">
          <div className="relative h-32 w-36">
            <AnimatePresence>{trick.map(([s, c]) => {
              const k = (s - me + 4) % 4;
              const p = [{ b: 0, l: "50%" }, { t: "35%", l: 0 }, { t: 0, l: "50%" }, { t: "35%", r: 0 }][k];
              return <motion.div key={`${s}${c}`} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="absolute" style={{ top: p.t, bottom: p.b, left: p.l, right: p.r, transform: p.l === "50%" ? "translateX(-50%)" : undefined }}><PlayingCard c={{ rank: c[0], suit: c[1] }} small /></motion.div>;
            })}</AnimatePresence>
          </div>
        </div>
        {!st.trick?.length && st.last_trick && <div className="absolute bottom-16 inset-x-0 text-center text-[10px] text-amber-200">{d.seats[st.last_trick.winner].name} took the last trick</div>}
        {g === "break10" && st.captured?.length > 0 && <div className="absolute bottom-2 left-2 flex gap-1" data-testid="b10-captured">{st.captured.map((c) => <span key={c.card} className="rounded bg-white text-black text-[9px] font-bold px-1">{c.card.replace("10", "10")}</span>)}</div>}
      </div>
      <div className={`mt-2 text-center text-xs ${st.turn === me ? "text-amber-300 font-bold" : "text-white/50"}`} data-testid="table-turn">{d.match.status !== "playing" ? "Match over" : st.turn === me ? (st.phase === "bid" ? "Your bid" : "Your turn: tap a highlighted card") : `${d.seats[st.turn]?.name}'s turn`}{g === "break10" && ` · You are Team ${(me % 2) + 1}`}</div>
      {st.phase === "bid" && d.match.status === "playing" && <div className="mt-2"><Bidding d={d} send={send} busy={busy} /></div>}
      <div className="mt-3" data-testid="my-hand">
        <div className="flex flex-wrap justify-center gap-1.5">{(st.hand || []).map((c, i) => {
          const ok = st.phase === "play" && legal.some((l) => eq(l, c));
          return <button key={`${c[0]}${c[1]}`} disabled={!ok || busy} onClick={() => send({ rank: c[0], suit: c[1] })} data-testid={`hand-card-${c[0]}${c[1]}`}
            className={`rounded-lg ${ok ? "ring-2 ring-amber-300 shadow-[0_0_10px_#f5b301]" : st.phase === "play" && st.turn === me ? "opacity-40" : ""}`}><PlayingCard c={{ rank: c[0], suit: c[1] }} small i={i * 0.2} /></button>;
        })}</div>
      </div>
    </div>
  );
}
