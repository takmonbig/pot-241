import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Users, Clock, Coins, Loader2, Swords } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { showPopup } from "@/components/CenterPopup";

function Countdown({ deadline }) {
  const [left, setLeft] = useState("");
  useEffect(() => {
    const tick = () => {
      const ms = new Date(deadline) - new Date();
      if (ms <= 0) return setLeft("00:00");
      const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
      setLeft(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick(); const i = setInterval(tick, 1000); return () => clearInterval(i);
  }, [deadline]);
  return <span className="font-mono-pz">{left}</span>;
}

const STATUS_COLORS = {
  OPEN: "text-green-400 bg-green-400/10", FULL: "text-yellow-400 bg-yellow-400/10",
  LIVE: "text-pazer-red bg-pazer-red/10", STARTING: "text-pazer-red bg-pazer-red/10",
  COMPLETED: "text-white/50 bg-white/5", CANCELLED: "text-white/40 bg-white/5",
  REFUNDED: "text-blue-400 bg-blue-400/10",
};

export function RoomList({ mode, title, subtitle, Icon = Users, payoutLabel, embedded }) {
  const [tab, setTab] = useState("active");
  const [rooms, setRooms] = useState([]);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const load = useCallback(() => {
    const url = tab === "completed" ? `/rooms/completed?mode=${mode}` : `/rooms?mode=${mode}`;
    api.get(url).then(({ data }) => setRooms(data)).catch(() => {});
  }, [tab, mode]);

  useEffect(() => { load(); const i = setInterval(load, 4000); return () => clearInterval(i); }, [load]);

  const join = async () => {
    setBusy(true);
    try {
      await api.post(`/rooms/${confirm.id}/join`);
      window.dispatchEvent(new Event("wallet:refresh"));
      const id = confirm.id; setConfirm(null); nav(`/room/${id}`);
    } catch (e) {
      const detail = formatApiError(e.response?.data?.detail);
      if (/insufficient/i.test(detail)) showPopup({ type: "wallet", title: "Insufficient balance", message: "Add coins to join this room." });
      else showPopup({ type: "warning", title: "Can't join", message: detail });
    }
    finally { setBusy(false); }
  };

  return (
    <div className={embedded ? "" : "mx-auto max-w-5xl px-4 py-6"}>
      {!embedded && (<>
        <div className="flex items-center gap-2 mb-1">
          <Icon className="h-5 w-5 text-pazer-red" />
          <h1 className="font-display font-bold text-2xl tracking-tight">{title}</h1>
        </div>
        <p className="text-white/50 text-sm mb-5">{subtitle}</p>
      </>)}

      <div className="flex gap-2 mb-5">
        {["active", "completed"].map((t) => (
          <button key={t} onClick={() => setTab(t)} data-testid={`rooms-tab-${t}`}
            className={`px-4 py-2 rounded-full text-sm font-medium capitalize transition-colors ${
              tab === t ? "bg-pazer-red text-white" : "bg-white/5 text-white/60 hover:text-white"}`}>{t}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rooms.map((r, i) => (
          <motion.div key={r.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.4) }}
            data-testid="room-card" className="rounded-2xl pz-glass p-5 hover:border-pazer-red/40 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-mono-pz font-extrabold text-3xl text-pazer-red">{r.target}s</div>
                <div className="text-[10px] text-white/40">{r.room_code}</div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[r.status] || "text-white/50 bg-white/5"}`}>
                {r.status === "LIVE" && <span className="inline-block h-1.5 w-1.5 rounded-full bg-pazer-red mr-1 animate-pulse" />}{r.status}
              </span>
            </div>
            <div className="space-y-1.5 text-sm mb-3">
              <div className="flex items-center justify-between text-white/60"><span className="flex items-center gap-1.5"><Coins className="h-4 w-4" />Entry</span><span className="font-mono-pz text-white">{r.entry_fee}</span></div>
              <div className="flex items-center justify-between text-white/60"><span className="flex items-center gap-1.5"><Users className="h-4 w-4" />Players</span><span className="font-mono-pz text-white">{r.display_players ?? r.current_players}/{r.max_players}</span></div>
              <div className="flex items-center justify-between text-white/60"><span>{payoutLabel}</span><span className="font-mono-pz text-green-400">{mode === "1v1" ? Math.round(r.entry_fee * (r.win_multiplier || 1.5)) : r.prize_pool}</span></div>
              {tab === "active" && r.status === "OPEN" && <div className="flex items-center justify-between text-white/60"><span className="flex items-center gap-1.5"><Clock className="h-4 w-4" />Closes</span><Countdown deadline={r.join_deadline} /></div>}
              {tab === "completed" && r.winner && <div className="flex items-center justify-between text-white/60"><span>Winner</span><span className="text-pazer-red font-semibold">{r.winner}</span></div>}
            </div>
            <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden mb-3">
              <div className="h-full bg-pazer-red rounded-full transition-all" style={{ width: `${Math.min(100, ((r.display_players ?? r.current_players) / r.max_players) * 100)}%` }} />
            </div>
            {r.status === "OPEN" || r.status === "FULL" ? (
              <button onClick={() => setConfirm(r)} data-testid={`join-room-${r.id}`}
                className="w-full py-2.5 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold text-sm transition-colors">Join Room</button>
            ) : r.status === "LIVE" || r.status === "STARTING" ? (
              <button onClick={() => nav(`/room/${r.id}`)} className="w-full py-2.5 rounded-full bg-white/10 hover:bg-white/15 font-bold text-sm transition-colors">Enter Live</button>
            ) : (
              <button onClick={() => nav(`/room/${r.id}`)} className="w-full py-2.5 rounded-full border border-white/10 text-white/60 font-medium text-sm hover:text-white transition-colors">View Result</button>
            )}
          </motion.div>
        ))}
        {rooms.length === 0 && <p className="text-white/40 col-span-full text-center py-16">No rooms here yet.</p>}
      </div>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="bg-pazer-card border-white/10 text-white">
          <DialogHeader><DialogTitle className="font-display">Confirm Join</DialogTitle></DialogHeader>
          {confirm && (
            <div className="space-y-4">
              <div className="space-y-2 bg-black/40 rounded-xl p-4 text-sm">
                <div className="flex justify-between"><span className="text-white/50">Entry fee</span><span className="font-mono-pz">{confirm.entry_fee} coins</span></div>
                <div className="flex justify-between"><span className="text-white/50">Target</span><span className="font-mono-pz">{confirm.target} seconds</span></div>
                <div className="flex justify-between"><span className="text-white/50">Players</span><span className="font-mono-pz">{confirm.display_players ?? confirm.current_players}/{confirm.max_players}</span></div>
                <div className="flex justify-between"><span className="text-white/50">{payoutLabel}</span><span className="font-mono-pz text-green-400">{mode === "1v1" ? Math.round(confirm.entry_fee * (confirm.win_multiplier || 1.5)) : confirm.prize_pool || "Pool"}</span></div>
              </div>
              <p className="text-xs text-white/40">If the minimum players isn't reached, your entry is fully refunded.</p>
              <button onClick={join} disabled={busy} data-testid="confirm-join-btn"
                className="w-full py-3 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Confirm Join
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
