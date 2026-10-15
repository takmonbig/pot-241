import { useEffect, useRef, useState } from "react";
import { LoopVideo } from "@/components/LoopVideo";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Copy, Check, Play, Crown, Loader2, Users, Clock, Share2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { GAME_META } from "@/lib/games";
import { KIND_LABEL } from "@/components/Race";
import { showPopup } from "@/components/CenterPopup";
import { showWin } from "@/components/WinCelebration";

function useCountdown(deadline) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!deadline) return undefined;
    const tick = () => setLeft(Math.max(0, Math.round((new Date(deadline) - new Date()) / 1000)));
    tick(); const i = setInterval(tick, 1000); return () => clearInterval(i);
  }, [deadline]);
  return `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
}

function PlayerRow({ p, done, i }) {
  return (
    <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} data-testid="race-player"
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${p.is_you ? "bg-pazer-red/15 border border-pazer-red/40" : "bg-white/5"}`}>
      <span className="w-6 font-mono-pz text-sm text-white/50">{done ? `#${p.rank}` : i + 1}</span>
      {done && p.rank === 1 && <Crown className="h-4 w-4 text-amber-300" />}
      <span className="font-semibold truncate">{p.username}{p.is_you && <span className="text-white/40"> (you)</span>}</span>
      <span className="ml-auto text-xs text-white/60 font-mono-pz">{p.label || (p.played ? "Played ✓" : "Waiting…")}</span>
      {done && p.prize > 0 && <span className="font-mono-pz text-sm font-bold text-green-400">+{p.prize}</span>}
    </motion.div>
  );
}

export default function RaceRoom() {
  const { id } = useParams();
  const nav = useNavigate();
  const [r, setR] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const celebrated = useRef(false);

  useEffect(() => {
    const load = () => api.get(`/race/${id}`).then(({ data }) => setR(data)).catch(() => {});
    load(); const i = setInterval(load, 2500); return () => clearInterval(i);
  }, [id]);
  useEffect(() => {
    if (r?.status === "COMPLETED" && r.my_prize > 0 && !celebrated.current) {
      celebrated.current = true; window.dispatchEvent(new Event("wallet:refresh")); showWin(r.my_prize);
    }
    if (r?.status === "REFUNDED") window.dispatchEvent(new Event("wallet:refresh"));
  }, [r]);
  const joinLeft = useCountdown(r?.join_deadline);
  const liveLeft = useCountdown(r?.live_deadline);
  if (!r) return <div className="py-24 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-pazer-red" /></div>;
  const g = GAME_META[r.game];
  const done = r.status === "COMPLETED";

  const start = async () => {
    setBusy(true);
    try { const { data } = await api.post(`/race/${id}/start`); setR(data); }
    catch (e) { showPopup({ type: "warning", title: "Can't start", message: formatApiError(e.response?.data?.detail) }); }
    finally { setBusy(false); }
  };
  const copy = async () => {
    const text = `Join my ${g.name} race on TIMEUP! Code: ${r.room_code}`;
    try { if (navigator.share) await navigator.share({ title: "TIMEUP", text }); else { await navigator.clipboard.writeText(r.room_code); } } catch (e) { /* cancelled */ }
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-5 pb-40" data-testid="race-room">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => nav(-1)} data-testid="race-back" className="h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center"><ArrowLeft className="h-4 w-4" /></button>
        <g.icon className="h-5 w-5" style={{ color: g.color }} />
        <h1 className="font-display text-2xl">{g.name} Race</h1>
      </div>

      <div className="relative overflow-hidden rounded-3xl border-2 h-44" style={{ borderColor: g.color, boxShadow: `0 0 22px ${g.color}55` }}>
        <LoopVideo k={r.game} className="absolute inset-0 h-full w-full object-cover opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-transparent" />
        <div className="relative h-full p-4 flex flex-col justify-between">
          <span className="self-start rounded-full bg-pazer-red px-3 py-1 text-[11px] font-extrabold uppercase" data-testid="race-kind">{KIND_LABEL[r.kind]}</span>
          <div>
            <div className="text-xs uppercase tracking-widest text-white/60">{r.is_1v1 ? "Winner takes" : "Prize pool"}</div>
            <div className="font-mono-pz text-4xl font-extrabold text-green-400" data-testid="race-prize">{r.prize}</div>
            <div className="text-xs text-white/70">Entry {r.entry_fee} · <Users className="inline h-3 w-3" /> {r.current_players}/{r.max_players}</div>
          </div>
        </div>
      </div>

      {r.kind === "friends" && r.status === "OPEN" && (
        <button onClick={copy} data-testid="race-share-code" className="mt-4 w-full flex items-center justify-between rounded-2xl border border-dashed border-white/20 bg-black/40 px-4 py-3">
          <span className="text-xs uppercase tracking-widest text-white/50">Room code</span>
          <span className="font-mono-pz text-2xl font-extrabold tracking-widest" data-testid="race-code">{r.room_code}</span>
          {copied ? <Check className="h-5 w-5 text-green-400" /> : navigator.share ? <Share2 className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
        </button>
      )}

      <div className="mt-4 rounded-3xl pz-glass p-4 space-y-3">
        <StatusBlock r={r} g={g} joinLeft={joinLeft} liveLeft={liveLeft} busy={busy} onStart={start} onPlay={() => nav(`${g.to}?race=${id}`)} />
        <div className="space-y-2" data-testid="race-players">
          {r.players.map((p, i) => <PlayerRow key={i} p={p} done={done} i={i} />)}
        </div>
        <p className="text-[11px] text-white/40">{g.race} Everyone gets the same provably fair round (seed {r.fair.server_seed_hash.slice(0, 10)}…{r.fair.server_seed ? `, revealed: ${r.fair.server_seed.slice(0, 10)}…` : ""}).</p>
      </div>
      <Link to={r.kind === "rooms" ? "/multiplayer" : "/1v1"} className="mt-4 block text-center text-sm text-white/50 hover:text-white">Browse more races</Link>
    </div>
  );
}

function StatusBlock({ r, g, joinLeft, liveLeft, busy, onStart, onPlay }) {
  if (r.status === "OPEN") return (
    <div data-testid="race-status-open" className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-white/70"><Clock className="h-4 w-4" /> Waiting for players · closes in <b className="font-mono-pz">{joinLeft}</b></div>
      {r.is_host && (
        <button onClick={onStart} disabled={busy || r.current_players < 2} data-testid="race-host-start"
          className="w-full py-3.5 rounded-2xl bg-pazer-red hover:bg-pazer-redhover font-extrabold disabled:opacity-50 flex items-center justify-center gap-2">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {r.current_players < 2 ? "Waiting for a friend to join…" : "Start the race"}
        </button>
      )}
    </div>
  );
  if (r.status === "LIVE") return r.played ? (
    <div data-testid="race-status-waiting" className="text-sm text-white/70 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Your score is in. Waiting for others · {liveLeft}</div>
  ) : (
    <button onClick={onPlay} data-testid="race-play-btn"
      className="w-full py-4 rounded-2xl font-extrabold text-lg text-black flex items-center justify-center gap-2 animate-pulse" style={{ background: g.color }}>
      <Play className="h-5 w-5 fill-black" /> Race is live, play now · {liveLeft}
    </button>
  );
  if (r.status === "REFUNDED") return <div data-testid="race-status-refunded" className="text-sm text-blue-300">Race cancelled. Your entry was refunded.</div>;
  return (
    <div data-testid="race-status-completed" className={`text-center font-display text-xl ${r.my_prize > 0 ? "text-green-400" : "text-white"}`}>
      {r.my_prize > 0 ? `You won ${r.my_prize} coins!` : `${r.winner} wins the race`}
    </div>
  );
}
