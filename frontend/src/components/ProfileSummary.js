import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Award, Plus, ArrowUpFromLine } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { showPopup } from "@/components/CenterPopup";

export function ProfileSummary() {
  const [p, setP] = useState(null);
  const [all, setAll] = useState(false);
  const { user } = useAuth();
  useEffect(() => { api.get("/profile/summary").then(({ data }) => setP(data)).catch(() => {}); }, []);
  if (!p) return null;
  const S = ({ l, v, c = "text-white", t }) => <div className="rounded-xl bg-black/50 border border-amber-400/20 p-2.5 text-center"><div className={`font-mono-pz text-lg font-extrabold ${c}`} data-testid={t}>{v}</div><div className="text-[9px] uppercase tracking-wider text-white/50">{l}</div></div>;
  return (
    <div className="space-y-4 mb-4" data-testid="profile-summary">
      <div className="grid grid-cols-4 gap-2">
        <S l="Total Matches" v={p.total_matches} t="ps-matches" /><S l="Wins" v={p.wins} c="text-green-400" t="ps-wins" />
        <S l="Losses" v={p.losses} c="text-red-400" t="ps-losses" /><S l="Win Rate" v={`${p.win_rate}%`} c="text-amber-300" t="ps-winrate" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <S l="Profit" v={`₹${Math.round(p.profit).toLocaleString()}`} c={p.profit >= 0 ? "text-green-400" : "text-red-400"} t="ps-profit" />
        <S l="Favorite Game" v={<span className="text-xs">{p.favorite_game || "—"}</span>} t="ps-fav" /><S l="Rank" v={`#${p.rank}`} c="text-amber-300" t="ps-rank" />
      </div>
      <div className="grid grid-cols-4 gap-2" data-testid="ps-badges">
        {p.badges.map((b) => (
          <div key={b.id} className={`rounded-xl p-2 text-center border ${b.earned ? "border-amber-300 bg-amber-400/10" : "border-white/10 opacity-50"}`}>
            <Award className={`h-6 w-6 mx-auto ${b.earned ? "text-amber-300" : "text-white/30"}`} /><div className="text-[9px] font-bold uppercase mt-1">{b.name}</div>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-amber-400/20 bg-black/40 overflow-hidden" data-testid="ps-last-matches">
        <div className="flex items-center justify-between px-3 py-2.5"><span className="font-display pz-gold-text">LAST 20 MATCHES</span>
          <button onClick={() => setAll(!all)} className="text-xs text-amber-300" data-testid="ps-view-all">{all ? "Show less" : "View All"}</button></div>
        {p.last_matches.length === 0 && <p className="px-3 pb-3 text-xs text-white/40">No matches yet.</p>}
        {p.last_matches.slice(0, all ? 20 : 5).map((m, i) => (
          <div key={i} className="grid grid-cols-[1.4fr_1fr_1fr_auto] gap-2 px-3 py-2 border-t border-white/5 text-xs items-center">
            <span className="font-bold truncate">{m.game}</span><span className="text-white/60">{m.outcome}</span>
            <span className="font-mono-pz">₹{Math.round(m.amount || 0).toLocaleString()}</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${m.won ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>{m.won ? "Won" : "Lost"}</span>
          </div>
        ))}
      </div>
      <div id="referral" className="rounded-2xl border border-amber-400/40 bg-gradient-to-r from-[#2a1a03] to-black p-4 flex items-center gap-3" data-testid="ps-referral">
        <div className="flex-1"><div className="text-[10px] uppercase tracking-widest text-white/50">Referral code</div>
          <div className="font-mono-pz text-xl font-extrabold pz-gold-text" data-testid="ps-ref-code">{user?.referral_code || "—"}</div>
          <div className="text-[11px] text-white/60">Lifetime commission · Total earned ₹{(user?.referral_earnings || 0).toFixed(2)}</div></div>
        <button onClick={async () => { try { await navigator.clipboard.writeText(user?.referral_code || ""); showPopup({ type: "success", title: "Copied", message: "Share your code with friends." }); } catch (e) { showPopup({ type: "info", title: "Your code", message: user?.referral_code || "" }); } }}
          data-testid="ps-ref-copy" className="rounded-lg bg-pazer-red px-4 py-2 text-xs font-extrabold">COPY</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Link to="/wallet" data-testid="ps-add-cash" className="rounded-xl bg-pazer-red py-3 text-center font-extrabold text-sm flex items-center justify-center gap-1"><Plus className="h-4 w-4" />ADD CASH</Link>
        <Link to="/wallet" data-testid="ps-withdraw" className="rounded-xl border border-amber-400/40 py-3 text-center font-extrabold text-sm flex items-center justify-center gap-1"><ArrowUpFromLine className="h-4 w-4" />WITHDRAW</Link>
      </div>
    </div>
  );
}
