import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Trophy, ChevronRight } from "lucide-react";
import api from "@/lib/api";

export const KIND_LABEL = { "1v1": "1v1 Duel", rooms: "Multiplayer Room", friends: "Friends Room" };

export function useRace() {
  const [sp] = useSearchParams();
  const id = sp.get("race");
  const [room, setRoom] = useState(null);
  const load = useCallback(() => { if (id) api.get(`/race/${id}`).then(({ data }) => setRoom(data)).catch(() => {}); }, [id]);
  useEffect(() => { load(); }, [load]);
  const play = () => api.post(`/race/${id}/play`);
  const finished = () => setTimeout(load, 500);
  return { id, room, play, finished, locked: !!room?.played || (room && room.status !== "LIVE") };
}

export function RaceBar({ race }) {
  if (!race.id) return null;
  const r = race.room;
  return (
    <div data-testid="race-bar" className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-300/40 bg-amber-400/10 px-4 py-3">
      <Trophy className="h-5 w-5 shrink-0 text-amber-300" />
      <div className="min-w-0">
        <div className="text-sm font-bold truncate">Race · {KIND_LABEL[r?.kind] || "…"} <span className="font-mono-pz text-white/50">{r?.room_code}</span></div>
        <div className="text-xs text-white/60" data-testid="race-bar-status">
          {!r ? "Loading…" : r.played ? "Your score is in. See how you rank." : r.status === "LIVE" ? `Entry paid · prize ${r.prize} · one run counts` : `Race is ${r.status.toLowerCase()}`}
        </div>
      </div>
      <Link to={`/race/${race.id}`} data-testid="race-bar-lobby"
        className="ml-auto shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-400 px-3 py-1.5 text-xs font-extrabold text-black">
        {r?.played ? "Results" : "Lobby"} <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
