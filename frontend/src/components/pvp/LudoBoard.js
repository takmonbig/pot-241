import { motion } from "framer-motion";
import { Star } from "lucide-react";

const PATH = [[6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,7],[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],[7,14],[8,14],[8,13],[8,12],[8,11],[8,10],[8,9],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],[14,7],[14,6],[13,6],[12,6],[11,6],[10,6],[9,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],[7,0],[6,0]];
const OFF = { red: 0, green: 13, yellow: 26, blue: 39 };
const LANE = { red: [[7,1],[7,2],[7,3],[7,4],[7,5]], green: [[1,7],[2,7],[3,7],[4,7],[5,7]], yellow: [[7,13],[7,12],[7,11],[7,10],[7,9]], blue: [[13,7],[12,7],[11,7],[10,7],[9,7]] };
const BASE = { red: [[1.5,1.5],[1.5,3.5],[3.5,1.5],[3.5,3.5]], green: [[1.5,10.5],[1.5,12.5],[3.5,10.5],[3.5,12.5]], yellow: [[10.5,10.5],[10.5,12.5],[12.5,10.5],[12.5,12.5]], blue: [[10.5,1.5],[10.5,3.5],[12.5,1.5],[12.5,3.5]] };
const HEX = { red: "#ef4444", green: "#22c55e", yellow: "#facc15", blue: "#3b82f6" };
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const DICE = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

function pos(col, p, i) {
  if (p === -1) return BASE[col][i];
  if (p <= 50) return PATH[(OFF[col] + p) % 52];
  if (p <= 55) return LANE[col][p - 51];
  return [7 + (i % 2) * 0.3 - 0.15, 7 + (i > 1 ? 0.3 : -0.15)];
}

export function LudoBoard({ d, send, busy }) {
  const st = d.state;
  const me = d.my_seat;
  const myTurn = st.turn === me && d.match.status === "playing";
  const movable = st.movable || [];
  const cell = (r, c) => {
    const idx = PATH.findIndex(([a, b]) => a === r && b === c);
    const lane = Object.entries(LANE).find(([, l]) => l.some(([a, b]) => a === r && b === c));
    let bg = "transparent";
    if (r < 6 && c < 6) bg = "#7f1d1d"; else if (r < 6 && c > 8) bg = "#14532d"; else if (r > 8 && c > 8) bg = "#713f12"; else if (r > 8 && c < 6) bg = "#1e3a8a";
    if (idx >= 0) bg = idx % 13 === 0 ? HEX[["red", "green", "yellow", "blue"][idx / 13]] + "aa" : "#f8f5ec";
    if (lane) bg = HEX[lane[0]] + "cc";
    if (r >= 6 && r <= 8 && c >= 6 && c <= 8) bg = "#f5b301";
    return <div key={`${r}-${c}`} className="relative border-[0.5px] border-black/20" style={{ background: bg }}>{idx >= 0 && SAFE.has(idx) && idx % 13 !== 0 && <Star className="absolute inset-0 m-auto h-3 w-3 text-black/40" />}</div>;
  };
  return (
    <div data-testid="ludo-board">
      <div className="flex gap-1 mb-2">{st.colors.map((c, i) => (
        <span key={c} className={`flex-1 rounded-lg px-2 py-1 text-[10px] font-bold text-center ${st.turn === i ? "ring-2 ring-white" : "opacity-70"}`} style={{ background: HEX[c] + "55" }}>
          {d.seats[i]?.name}{i === me && " (you)"} · {st.tokens[c].filter((p) => p === 56).length}/4</span>
      ))}</div>
      <div className="relative aspect-square w-full rounded-2xl overflow-hidden border-4 border-amber-600/70">
        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: "repeat(15,1fr)", gridTemplateRows: "repeat(15,1fr)" }}>
          {Array.from({ length: 225 }, (_, k) => cell(Math.floor(k / 15), k % 15))}
        </div>
        {st.colors.map((col, si) => st.tokens[col].map((p, i) => {
          const [r, c] = pos(col, p, i);
          const can = myTurn && si === me && st.phase === "move" && movable.includes(i);
          return (
            <motion.button key={`${col}${i}`} initial={false} animate={{ left: `${(c / 15) * 100}%`, top: `${(r / 15) * 100}%` }} transition={{ type: "spring", stiffness: 200, damping: 20 }}
              disabled={!can || busy} onClick={() => send({ type: "move", token: i })} data-testid={`ludo-token-${col}-${i}`}
              className={`absolute w-[6.67%] h-[6.67%] p-[1px] ${can ? "z-20" : "z-10"}`}>
              <span className={`block h-full w-full rounded-full border-2 border-white shadow ${can ? "animate-bounce ring-2 ring-white" : ""}`} style={{ background: HEX[col] }} />
            </motion.button>
          );
        }))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <motion.div key={`${st.last?.seat}-${st.last?.roll}-${d.match.version}`} initial={{ rotate: -200, scale: 0.4 }} animate={{ rotate: 0, scale: 1 }} className="text-6xl leading-none" data-testid="ludo-dice-face">{DICE[st.roll || st.last?.roll || 1]}</motion.div>
        <div className="flex-1 text-xs text-white/70">
          {st.last && <div>{d.seats[st.last.seat]?.name} rolled {st.last.roll}{st.last.note ? ` · ${st.last.note}` : ""}</div>}
          <div className={myTurn ? "text-amber-300 font-bold" : ""} data-testid="ludo-turn">{d.match.status !== "playing" ? "Match over" : myTurn ? (st.phase === "roll" ? "Your turn: roll the dice" : "Pick a glowing token") : `${d.seats[st.turn]?.name}'s turn`}</div>
        </div>
        {myTurn && st.phase === "roll" && <button onClick={() => send({ type: "roll" })} disabled={busy} data-testid="ludo-roll" className="rounded-xl bg-pazer-red px-6 py-3 font-extrabold">ROLL</button>}
      </div>
    </div>
  );
}
