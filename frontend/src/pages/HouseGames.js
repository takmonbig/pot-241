import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Star } from "lucide-react";
import api from "@/lib/api";
import { showWin } from "@/components/WinCelebration";
import { GameShell, PlayingCard, QuickBet } from "@/components/house/Shell";
import { TimedGame } from "@/components/house/TimedGame";
import { useHousePlay, Result } from "@/pages/CardGames";

export const ColorPrediction = () => <TimedGame game="color" />;
export const Matka = () => <TimedGame game="matka" />;

const DICE = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

function Track({ st, end, safe }) {
  const cells = Array.from({ length: end + 1 }, (_, i) => i);
  return (
    <div className="grid grid-cols-8 gap-1" data-testid="ludo-track">
      {cells.map((i) => {
        const you = st.you.filter((p) => p === i).length, bot = st.bot.filter((p) => p === i).length;
        return (
          <div key={i} className={`relative h-9 rounded-md border text-[9px] flex items-center justify-center ${i === end ? "bg-amber-400/30 border-amber-300" : safe.includes(i) ? "bg-green-500/15 border-green-400/40" : "bg-white/5 border-white/10"}`}>
            <span className="absolute top-0 left-0.5 text-white/30">{i}</span>
            {safe.includes(i) && i !== 0 && <Star className="absolute h-3 w-3 text-green-400/60" />}
            <div className="flex gap-0.5">
              {Array.from({ length: you }).map((_, k) => <motion.span layout key={`y${k}`} className="h-3.5 w-3.5 rounded-full bg-amber-400 border border-white" />)}
              {Array.from({ length: bot }).map((_, k) => <motion.span layout key={`b${k}`} className="h-3.5 w-3.5 rounded-full bg-sky-500 border border-white" />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Ludo() {
  const [bet, setBet] = useState(20);
  const [g, setG] = useState(null);
  const [res, setRes] = useState(null);
  const { busy, run } = useHousePlay();
  const start = async () => {
    setRes(null);
    const data = await run(() => api.post("/house/ludo/start", { bet }));
    if (data) setG({ ...data, done: false });
  };
  const move = async (tok) => {
    const data = await run(() => api.post("/house/ludo/move", { session_id: g.session_id, value: tok }));
    if (!data) return;
    setG({ ...g, ...data });
    if (data.done) { setRes({ win: data.won, text: data.won ? `YOU WIN · +${data.prize}` : "BOT WINS" }); if (data.won) showWin(data.prize); }
  };
  const roll = g?.state?.roll;
  const canMove = (i) => g && !g.done && g.state.you[i] + roll <= g.end;
  return (
    <GameShell k="ludo">
      {g ? (
        <div className="rounded-3xl border-2 border-amber-400/40 bg-black/60 p-3">
          <Track st={g.state} end={g.end} safe={g.safe} />
          <div className="flex items-center justify-between mt-3 text-xs">
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-amber-400" /> You: {g.state.you.join(" · ")}</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-sky-500" /> Bot: {g.state.bot.join(" · ")}{g.bot_roll ? ` (rolled ${g.bot_roll})` : ""}</span>
          </div>
          {g.state.log?.length > 0 && <div className="text-[11px] text-amber-200 mt-1">{g.state.log.join(" · ")}</div>}
        </div>
      ) : <div className="rounded-3xl border-2 border-amber-400/40 bg-black/60 p-8 text-center text-white/60 text-sm">Race 2 tokens home before the bot.</div>}
      <Result r={res} testid="ludo-result" />
      {g && !g.done ? (
        <div className="mt-4 text-center">
          <motion.div key={roll + "-" + g.state.rolls} initial={{ rotate: -180, scale: 0.4 }} animate={{ rotate: 0, scale: 1 }} className="text-6xl leading-none" data-testid="ludo-dice">{DICE[roll]}</motion.div>
          <div className="text-xs text-white/50 mb-2">You rolled {roll}. Pick a token to move.</div>
          <div className="grid grid-cols-2 gap-2">
            {[0, 1].map((i) => (
              <button key={i} onClick={() => move(i)} disabled={busy || (!canMove(i) && (canMove(0) || canMove(1)))} data-testid={`ludo-move-${i}`}
                className="rounded-xl bg-pazer-red py-3.5 font-extrabold disabled:opacity-40">Token {i + 1} ({g.state.you[i]} → {Math.min(g.end, g.state.you[i] + roll)})</button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4"><QuickBet bet={bet} setBet={setBet} min={20} prefix="ludo" disabled={busy} /></div>
          <button onClick={start} disabled={busy} data-testid="ludo-play" className="mt-3 w-full rounded-xl bg-pazer-red py-4 font-extrabold text-lg flex items-center justify-center gap-2">{busy && <Loader2 className="h-5 w-5 animate-spin" />}START MATCH · ₹{bet}</button>
        </>
      )}
    </GameShell>
  );
}

export function CallBreak() {
  const [bet, setBet] = useState(20);
  const [g, setG] = useState(null);
  const [res, setRes] = useState(null);
  const { busy, run } = useHousePlay();
  const start = async () => {
    setRes(null);
    const data = await run(() => api.post("/house/callbreak/start", { bet }));
    if (data) setG(data);
  };
  const act = async (value) => {
    const data = await run(() => api.post("/house/callbreak/act", { session_id: g.session_id, value }));
    if (!data) return;
    setG({ ...g, ...data });
    if (data.phase === "done") { setRes({ win: data.won, text: data.won ? `YOU WON · +${data.prize}` : `YOU LOST · your score ${data.scores[0]} vs best ${Math.max(...data.scores.slice(1))}` }); if (data.won) showWin(data.prize); }
  };
  const s = g?.state;
  const lead = s?.trick?.[0]?.card?.suit;
  const legal = (c) => !lead || c.suit === lead || !s.hand.some((x) => x.suit === lead);
  return (
    <GameShell k="callbreak">
      <div className="rounded-3xl border-2 border-amber-400/40 bg-[radial-gradient(ellipse_at_center,#0f3d22,#06170d_70%)] p-3 min-h-[220px]">
        {s ? (
          <>
            <div className="grid grid-cols-4 gap-1 text-center text-[10px]" data-testid="cb-scoreboard">
              {s.seats.map((n, i) => <div key={n} className={`rounded-lg py-1 ${s.turn === i ? "bg-amber-400/20 text-amber-200" : "bg-black/30"}`}>{n}<div className="font-mono-pz text-xs">{s.tricks[i]}/{s.bids[i] || "?"}</div></div>)}
            </div>
            <div className="flex justify-center gap-2 mt-4 min-h-[60px]" data-testid="cb-trick">
              {(s.trick.length ? s.trick : s.last_trick?.cards || []).map((t, i) => (
                <div key={i} className="flex flex-col items-center"><PlayingCard c={t.card} small i={i} /><span className="text-[9px] mt-0.5 text-white/60">{s.seats[t.seat]}</span></div>
              ))}
            </div>
            {!s.trick.length && s.last_trick && <div className="text-center text-[11px] text-amber-200 mt-1">{s.seats[s.last_trick.winner]} took the trick</div>}
          </>
        ) : <div className="p-6 text-center text-white/60 text-sm">You vs 3 bots · 5 cards · spades are trump.</div>}
      </div>
      <Result r={res} testid="cb-result" />
      {g && g.phase === "bid" && (
        <div className="mt-4"><div className="text-xs text-white/50 mb-2">How many tricks will you win?</div>
          <div className="grid grid-cols-5 gap-2">{[1, 2, 3, 4, 5].map((b) => <button key={b} onClick={() => act(b)} disabled={busy} data-testid={`cb-bid-${b}`} className="rounded-xl bg-pazer-red py-3 font-extrabold">{b}</button>)}</div>
          <div className="flex gap-1 mt-3 justify-center">{s.hand.map((c, i) => <PlayingCard key={i} c={c} small i={i} />)}</div>
        </div>
      )}
      {g && g.phase === "play" && (
        <div className="mt-4"><div className="text-xs text-white/50 mb-2 text-center">{s.turn === 0 ? "Your turn, tap a card" : "Waiting…"}</div>
          <div className="flex gap-1.5 justify-center" data-testid="cb-hand">
            {s.hand.map((c, i) => (
              <button key={`${c.rank}${c.suit}`} onClick={() => act(i)} disabled={busy || !legal(c)} data-testid={`cb-card-${i}`} className={`transition-transform ${legal(c) ? "hover:-translate-y-2" : "opacity-40"}`}><PlayingCard c={c} /></button>
            ))}
          </div>
        </div>
      )}
      {(!g || g.phase === "done") && (
        <>
          <div className="mt-4"><QuickBet bet={bet} setBet={setBet} min={20} prefix="cb" disabled={busy} /></div>
          <button onClick={start} disabled={busy} data-testid="cb-play" className="mt-3 w-full rounded-xl bg-pazer-red py-4 font-extrabold text-lg flex items-center justify-center gap-2">{busy && <Loader2 className="h-5 w-5 animate-spin" />}DEAL · ₹{bet}</button>
        </>
      )}
    </GameShell>
  );
}
