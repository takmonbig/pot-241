import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, Users, Lock, KeyRound, Zap, Copy, Bot, Wifi, WifiOff, Trophy, ArrowLeft } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { showPopup } from "@/components/CenterPopup";
import { showWin } from "@/components/WinCelebration";
import { HowToPlay } from "@/components/HowToPlay";
import { GAME_META, art } from "@/lib/games";
import { CardTable } from "@/components/pvp/CardTable";
import { LudoBoard } from "@/components/pvp/LudoBoard";

const MODES = { callbreak: [4], ludo: [2, 3, 4], break10: [4] };
const err = (e) => showPopup({ type: /insufficient/i.test(formatApiError(e.response?.data?.detail)) ? "wallet" : "warning", title: "Oops", message: formatApiError(e.response?.data?.detail) });

export function PvpLobby() {
  const { game } = useParams();
  const g = GAME_META[game];
  const nav = useNavigate();
  const [players, setPlayers] = useState(MODES[game][0]);
  const [fee, setFee] = useState(20);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [hist, setHist] = useState([]);
  useEffect(() => {
    setPlayers(MODES[game][0]);
    api.get(`/pvp/history?game=${game}`).then(({ data }) => setHist(data)).catch(() => {});
    api.get("/pvp/active").then(({ data }) => { if (data.id && data.game === game) nav(`/pvp/${data.id}`); }).catch(() => {});
  }, [game, nav]);
  const go = async (path, body) => {
    setBusy(true);
    try { const { data } = await api.post(path, body); window.dispatchEvent(new Event("wallet:refresh")); nav(`/pvp/${data.room_id}`); }
    catch (e) { err(e); } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto max-w-xl px-4 py-5 pb-40" data-testid={`pvp-lobby-${game}`}>
      <div className="flex items-center gap-2 mb-3">
        <Link to="/bet-on-player" className="h-9 w-9 rounded-full bg-white/5 flex items-center justify-center"><ArrowLeft className="h-4 w-4" /></Link>
        <h1 className="font-display text-2xl uppercase pz-gold-text">{g.name}</h1><HowToPlay k={game} />
      </div>
      <div className="relative h-32 rounded-2xl overflow-hidden border border-amber-400/40 mb-4">
        <img src={art(game)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/50 to-transparent" />
        <div className="relative p-4"><div className="font-display text-xl">{game === "ludo" ? "2 / 3 / 4 Players" : game === "break10" ? "4 Players · 2 Teams" : "4 Players · Individual"}</div>
          <div className="text-xs text-white/70 max-w-[60%]">Real players in real time. Empty public seats fill with clearly labelled BOTs after 25s.</div></div>
      </div>
      {MODES[game].length > 1 && (
        <div className="grid grid-cols-3 gap-2 mb-3">{MODES[game].map((n) => <button key={n} onClick={() => setPlayers(n)} data-testid={`pvp-players-${n}`} className={`rounded-xl py-2.5 font-extrabold ${players === n ? "bg-pazer-red" : "bg-white/5"}`}>{n} Players</button>)}</div>
      )}
      <div className="grid grid-cols-4 gap-2 mb-4">{[10, 20, 50, 100].map((f) => <button key={f} onClick={() => setFee(f)} data-testid={`pvp-fee-${f}`} className={`rounded-xl py-2 text-sm font-bold ${fee === f ? "bg-amber-400 text-black" : "bg-white/5"}`}>₹{f}</button>)}</div>
      <p className="text-xs text-white/50 mb-3">Pot: ₹{(fee * players * 0.9).toFixed(0)} to the winner{game === "break10" ? "s (split between teammates)" : ""}. Ties refund everyone.</p>
      <button onClick={() => go("/pvp/quick", { game, players, entry_fee: fee })} disabled={busy} data-testid="pvp-quick" className="w-full rounded-xl bg-pazer-red py-4 font-extrabold text-lg flex items-center justify-center gap-2 pz-shine">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Zap className="h-5 w-5" />} QUICK MATCH · ₹{fee}</button>
      <button onClick={() => go("/pvp/create", { game, players, entry_fee: fee, private: true })} disabled={busy} data-testid="pvp-create" className="mt-2 w-full rounded-xl border border-amber-400/40 py-3 font-extrabold flex items-center justify-center gap-2"><Lock className="h-4 w-4" />CREATE PRIVATE ROOM (PLAY WITH FRIENDS)</button>
      <div className="mt-2 flex gap-2">
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Room code" data-testid="pvp-code-input" className="min-w-0 flex-1 rounded-xl bg-black/60 border border-white/15 px-4 py-3 font-mono-pz outline-none focus:border-amber-300" />
        <button onClick={() => go("/pvp/join", { code })} disabled={busy || !code} data-testid="pvp-join-code" className="rounded-xl bg-white/10 px-4 font-extrabold flex items-center gap-1"><KeyRound className="h-4 w-4" />JOIN</button>
      </div>
      <h3 className="font-display text-lg mt-6 mb-2 pz-gold-text">MATCH HISTORY</h3>
      <div className="space-y-1.5" data-testid="pvp-history">
        {hist.length === 0 && <p className="text-xs text-white/40">No matches yet.</p>}
        {hist.map((h) => <div key={h.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-xs"><span className="truncate">{h.names.join(", ")}</span><span className={h.result?.tie ? "text-white/60" : h.won ? "text-green-400 font-bold" : "text-red-400"}>{h.result?.tie ? "Tie" : h.won ? "Won" : "Lost"}</span></div>)}
      </div>
    </div>
  );
}

function Waiting({ d, roomId }) {
  const { room, seats } = d;
  const left = d.ready_deadline ? Math.max(0, Math.round(d.ready_deadline - d.server_time)) : null;
  const me = seats[d.my_seat];
  const act = (p) => api.post(`/pvp/${roomId}/${p}`).then(() => p === "leave" && window.dispatchEvent(new Event("wallet:refresh"))).catch(err);
  return (
    <div className="rounded-3xl pz-glass p-5" data-testid="pvp-waiting">
      <div className="flex items-center justify-between"><span className="font-display text-xl">{room.status === "ready" ? "READY CHECK" : "WAITING FOR PLAYERS"}</span><span className="text-sm text-white/60"><Users className="inline h-4 w-4" /> {seats.length}/{room.players}</span></div>
      {room.private && <button onClick={() => navigator.clipboard?.writeText(room.code).catch(() => {})} data-testid="pvp-room-code" className="mt-3 w-full rounded-xl border border-dashed border-amber-300/50 py-3 font-mono-pz text-2xl tracking-widest flex items-center justify-center gap-2">{room.code}<Copy className="h-4 w-4" /></button>}
      <div className="mt-4 space-y-2">{Array.from({ length: room.players }).map((_, i) => { const s = seats[i]; return (
        <div key={i} className="flex items-center gap-2 rounded-xl bg-black/40 px-3 py-2.5" data-testid={`pvp-seat-${i}`}>
          <span className="h-8 w-8 rounded-full bg-amber-400/20 flex items-center justify-center font-bold text-amber-200">{s ? (s.bot ? <Bot className="h-4 w-4" /> : s.name[0]) : "?"}</span>
          <span className="font-semibold">{s ? s.name : "Waiting…"}</span>{s?.bot && <span className="text-[10px] rounded bg-sky-500/20 text-sky-300 px-1.5">BOT</span>}
          {s && <span className={`ml-auto text-xs ${s.ready ? "text-green-400" : "text-white/40"}`}>{s.ready ? "READY" : room.status === "ready" ? "not ready" : ""}</span>}
        </div>); })}</div>
      {room.status === "ready" && !me?.ready && <button onClick={() => act("ready")} data-testid="pvp-ready" className="mt-4 w-full rounded-xl bg-green-500 text-black py-3.5 font-extrabold animate-pulse">I'M READY {left != null && `· ${left}s`}</button>}
      {room.status === "ready" && me?.ready && <p className="mt-4 text-center text-sm text-white/60">Waiting for others to confirm… {left}s</p>}
      <button onClick={() => act("leave")} data-testid="pvp-leave" className="mt-3 w-full text-sm text-white/50">Leave room (refund)</button>
    </div>
  );
}

export function PvpRoom() {
  const { roomId } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const shown = useRef(false);
  const load = useCallback(() => api.get(`/pvp/${roomId}`).then(({ data }) => setD(data)).catch(() => {}), [roomId]);
  useEffect(() => { load(); const iv = setInterval(load, 1000); return () => clearInterval(iv); }, [load]);
  useEffect(() => {
    const r = d?.match?.result;
    if (r && !shown.current) { shown.current = true; window.dispatchEvent(new Event("wallet:refresh")); if (r.winners.includes(d.my_seat)) showWin(r.share); }
  }, [d]);
  const send = async (a) => {
    if (busy) return;
    setBusy(true);
    try { await api.post(`/pvp/${roomId}/action`, { version: d.match.version, action_id: `${Date.now()}-${Math.random()}`, ...a }); await load(); }
    catch (e) { if (e.response?.status !== 409) err(e); load(); } finally { setBusy(false); }
  };
  if (!d) return <div className="py-20 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-amber-300" /></div>;
  const g = d.room.game;
  const left = d.match ? Math.max(0, Math.round(d.match.deadline - d.server_time)) : 0;
  return (
    <div className="mx-auto max-w-xl px-3 py-4 pb-40" data-testid="pvp-room">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => nav(`/play/${g}`)} className="h-9 w-9 rounded-full bg-white/5 flex items-center justify-center"><ArrowLeft className="h-4 w-4" /></button>
        <h1 className="font-display text-xl uppercase pz-gold-text">{GAME_META[g].name}</h1>
        <span className="ml-auto text-xs text-white/60">Pot ₹{d.pot}</span>
        {d.match && d.match.status === "playing" && <span className="rounded-full bg-black/60 border border-amber-400/40 px-2 py-0.5 font-mono-pz text-xs" data-testid="pvp-timer">⏱ {left}s</span>}
      </div>
      <div className="flex gap-1 mb-2">{d.seats.map((s, i) => <span key={i} className="flex items-center gap-1 text-[10px] rounded-full bg-white/5 px-2 py-0.5">{s.online ? <Wifi className="h-3 w-3 text-green-400" /> : <WifiOff className="h-3 w-3 text-red-400" />}{s.name}</span>)}</div>
      {!d.match && <Waiting d={d} roomId={roomId} />}
      {d.match && (g === "ludo" ? <LudoBoard d={d} send={send} busy={busy} /> : <CardTable d={d} send={send} busy={busy} />)}
      {d.match?.result && (
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-4 rounded-3xl border-2 border-amber-300 bg-black/80 p-5 text-center" data-testid="pvp-result">
          <Trophy className="h-10 w-10 mx-auto text-amber-300" />
          <div className="font-display text-2xl pz-gold-text mt-1">{d.match.result.tie ? "IT'S A TIE · entries refunded" : `${d.match.result.winner_names.join(" & ")} WIN${d.match.result.winners.length > 1 ? "" : "S"}`}</div>
          {!d.match.result.tie && <div className="text-sm text-white/70">₹{d.match.result.share} each{d.match.result.winners.includes(d.my_seat) ? " · that's you!" : ""}</div>}
          {d.match.result.totals && <div className="mt-2 text-xs text-white/60">Final scores: {d.match.result.totals.map((t, i) => `${d.seats[i].name} ${(t / 10).toFixed(1)}`).join(" · ")}</div>}
          {d.match.result.points && <div className="mt-2 text-xs text-white/60">Opponent 10s captured · Team 1: {d.match.result.points[0]} · Team 2: {d.match.result.points[1]}</div>}
          <button onClick={() => nav(`/play/${g}`)} data-testid="pvp-again" className="mt-4 rounded-xl bg-pazer-red px-6 py-3 font-extrabold">PLAY AGAIN</button>
        </motion.div>
      )}
    </div>
  );
}
