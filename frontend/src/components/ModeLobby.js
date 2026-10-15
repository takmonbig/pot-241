import { useCallback, useEffect, useState } from "react";
import { LoopVideo } from "@/components/LoopVideo";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Coins, Loader2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { showPopup } from "@/components/CenterPopup";
import { RoomList } from "@/components/RoomList";
import { HowToPlay } from "@/components/HowToPlay";
import { GAME_META, MODE_META, ALL_GAMES } from "@/lib/games";

function GameTabs({ game, setGame }) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 mb-5" data-testid="mode-game-tabs">
      {ALL_GAMES.map((k) => {
        const g = GAME_META[k];
        return (
          <button key={k} onClick={() => setGame(k)} data-testid={`mode-game-${k}`}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold border transition-colors ${game === k ? "text-black" : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10"}`}
            style={game === k ? { background: g.color, borderColor: g.color } : undefined}>
            <g.icon className="h-4 w-4" /> {g.name}
          </button>
        );
      })}
    </div>
  );
}

function RaceCard({ r, i, onJoin, nav }) {
  const g = GAME_META[r.game];
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.05, 0.4) }}
      data-testid="race-card" className="relative overflow-hidden rounded-2xl border border-white/10 p-4">
      <LoopVideo k={r.game} className="absolute inset-0 h-full w-full object-cover opacity-25" />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 font-display text-lg"><g.icon className="h-5 w-5" style={{ color: g.color }} />{g.name}</div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${r.status === "LIVE" ? "bg-pazer-red/20 text-pazer-red" : r.status === "OPEN" ? "bg-green-400/10 text-green-400" : "bg-white/5 text-white/50"}`}>{r.status}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs text-white/50 mb-3">
          <div><div className="font-mono-pz text-base text-white flex items-center justify-center gap-1"><Coins className="h-3.5 w-3.5" />{r.entry_fee}</div>entry</div>
          <div><div className="font-mono-pz text-base text-green-400">{r.prize}</div>{r.is_1v1 ? "winner gets" : "pool"}</div>
          <div><div className="font-mono-pz text-base text-white">{r.current_players}/{r.max_players}</div>players</div>
        </div>
        {r.status === "COMPLETED" ? (
          <button onClick={() => nav(`/race/${r.id}`)} className="w-full py-2.5 rounded-full border border-white/15 text-sm text-white/70">Winner: {r.winner}</button>
        ) : r.joined ? (
          <button onClick={() => nav(`/race/${r.id}`)} data-testid={`race-open-${r.id}`} className="w-full py-2.5 rounded-full bg-white/10 font-bold text-sm">Open my race</button>
        ) : (
          <button onClick={() => onJoin(r)} data-testid={`race-join-${r.id}`} className="w-full py-2.5 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold text-sm transition-colors">Join race</button>
        )}
      </div>
    </motion.div>
  );
}

function RaceList({ game, kind }) {
  const [tab, setTab] = useState("active");
  const [rooms, setRooms] = useState([]);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const load = useCallback(() => api.get(`/race/rooms?game=${game}&kind=${kind}&tab=${tab}`).then(({ data }) => setRooms(data)).catch(() => {}), [game, kind, tab]);
  useEffect(() => { setRooms([]); load(); const i = setInterval(load, 4000); return () => clearInterval(i); }, [load]);
  const join = async () => {
    setBusy(true);
    try {
      await api.post(`/race/${confirm.id}/join`);
      window.dispatchEvent(new Event("wallet:refresh"));
      nav(`/race/${confirm.id}`);
    } catch (e) {
      const d = formatApiError(e.response?.data?.detail);
      if (/insufficient/i.test(d)) showPopup({ type: "wallet", title: "Insufficient balance", message: "Add coins to join this race." });
      else showPopup({ type: "warning", title: "Can't join", message: d });
    } finally { setBusy(false); setConfirm(null); }
  };
  return (
    <>
      <div className="flex gap-2 mb-4">
        {["active", "completed"].map((t) => (
          <button key={t} onClick={() => setTab(t)} data-testid={`race-tab-${t}`}
            className={`px-4 py-2 rounded-full text-sm font-medium capitalize ${tab === t ? "bg-pazer-red text-white" : "bg-white/5 text-white/60"}`}>{t}</button>
        ))}
      </div>
      <p className="text-xs text-white/50 mb-4">{GAME_META[game].race}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {rooms.map((r, i) => <RaceCard key={r.id} r={r} i={i} onJoin={setConfirm} nav={nav} />)}
        {rooms.length === 0 && <p className="text-white/40 col-span-full text-center py-12">No races here yet.</p>}
      </div>
      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="bg-pazer-card border-white/10 text-white">
          <DialogHeader><DialogTitle className="font-display">Join {GAME_META[game].name} race</DialogTitle></DialogHeader>
          {confirm && (
            <div className="space-y-4">
              <div className="space-y-2 bg-black/40 rounded-xl p-4 text-sm">
                <div className="flex justify-between"><span className="text-white/50">Entry fee</span><span className="font-mono-pz">{confirm.entry_fee} coins</span></div>
                <div className="flex justify-between"><span className="text-white/50">{confirm.is_1v1 ? "Winner gets" : "Prize pool"}</span><span className="font-mono-pz text-green-400">{confirm.prize}</span></div>
              </div>
              <p className="text-xs text-white/40">The race starts when the room fills. You get one run. If nobody scores or too few players join, your entry is refunded.</p>
              <button onClick={join} disabled={busy} data-testid="race-confirm-join"
                className="w-full py-3 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold flex items-center justify-center gap-2 disabled:opacity-60">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Confirm join
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ModeLobby({ kind, roomMode, subtitle, payoutLabel }) {
  const [game, setGame] = useState(() => sessionStorage.getItem(`tu_mode_game_${kind}`) || "stopwatch");
  const pick = (k) => { sessionStorage.setItem(`tu_mode_game_${kind}`, k); setGame(k); };
  const m = MODE_META[kind];
  return (
    <div className="mx-auto max-w-5xl px-4 py-6" data-testid={`mode-lobby-${kind}`}>
      <div className="flex items-center gap-2 mb-1">
        <m.icon className="h-5 w-5 text-pazer-red" />
        <h1 className="font-display text-2xl">{m.name}</h1>
        <HowToPlay k={kind} />
      </div>
      <p className="text-white/50 text-sm mb-4">{subtitle}</p>
      <GameTabs game={game} setGame={pick} />
      {game === "stopwatch"
        ? <RoomList mode={roomMode} payoutLabel={payoutLabel} embedded />
        : <RaceList game={game} kind={kind} />}
    </div>
  );
}

