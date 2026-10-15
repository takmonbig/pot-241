import { useState, useEffect } from "react";
import { LoopVideo } from "@/components/LoopVideo";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Users, Swords, Gift, Loader2, Copy, Share2, Check } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { showPopup } from "@/components/CenterPopup";
import { GAME_META, MODE_META, ALL_GAMES } from "@/lib/games";

export function QuickActions() {
  const [custom, setCustom] = useState(false);
  const [refer, setRefer] = useState(false);
  const [gameActive, setGameActive] = useState(false);
  useEffect(() => {
    const h = (e) => setGameActive(!!e.detail);
    window.addEventListener("game:active", h);
    return () => window.removeEventListener("game:active", h);
  }, []);
  const { pathname } = useLocation();
  if (gameActive || pathname.startsWith("/games/")) return null;
  return (
    <>
      <div className="fixed bottom-[70px] inset-x-0 z-40 pointer-events-none" data-testid="quick-actions">
        <div className="mx-auto max-w-md px-3">
          <button data-testid="open-custom-room" onClick={() => setCustom(true)}
            className="pointer-events-auto w-full flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-pazer-red to-pazer-redhover px-5 py-3.5 text-base font-extrabold shadow-lg shadow-pazer-red/30 active:scale-[0.98] transition-transform">
            <Users className="h-5 w-5" /> Play with Friends
          </button>
        </div>
      </div>

      {/* round animated Refer & Earn badge */}
      <motion.button data-testid="open-referral" onClick={() => setRefer(true)}
        initial={{ scale: 0 }} animate={{ scale: 1 }}
        className="fixed bottom-[132px] right-4 z-40 h-14 w-14 rounded-full bg-black/80 border border-pazer-red flex flex-col items-center justify-center shadow-lg shadow-pazer-red/40">
        <span className="absolute inset-0 rounded-full bg-pazer-red/40 animate-ping" />
        <Gift className="h-5 w-5 text-pazer-red relative z-10" />
        <span className="text-[7px] font-bold text-white/80 relative z-10 mt-0.5">REFER</span>
      </motion.button>
      <CustomRoomModal open={custom} onClose={() => setCustom(false)} />
      <ReferralModal open={refer} onClose={() => setRefer(false)} />
    </>
  );
}

function CustomRoomModal({ open, onClose }) {
  const nav = useNavigate();
  const [tab, setTab] = useState("create");
  const [mode, setMode] = useState("1v1");
  const [game, setGame] = useState("stopwatch");
  const [target, setTarget] = useState(10);
  const [fee, setFee] = useState(50);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const minFee = mode === "1v1" ? 50 : 30;

  const create = async () => {
    if (fee < minFee) return showPopup({ type: "warning", title: "Entry too low", message: `Minimum entry for custom ${mode} is ${minFee} coins.` });
    setBusy(true);
    try {
      const { data } = game === "stopwatch"
        ? await api.post("/rooms/custom", { mode, target: Number(target), entry_fee: Number(fee) })
        : await api.post("/race/custom", { game, group: mode !== "1v1", entry_fee: Number(fee) });
      window.dispatchEvent(new Event("wallet:refresh"));
      onClose();
      nav(game === "stopwatch" ? `/room/${data.id}` : `/race/${data.id}`);
    } catch (e) {
      const detail = formatApiError(e.response?.data?.detail);
      if (/insufficient/i.test(detail)) showPopup({ type: "wallet", title: "Insufficient balance", message: "Add coins to create this room." });
      else showPopup({ type: "warning", title: "Can't create room", message: detail });
    } finally { setBusy(false); }
  };

  const joinCode = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const isRace = code.trim().toUpperCase().startsWith("RF");
      const { data } = await api.post(isRace ? "/race/join-code" : "/rooms/join-code", { code: code.trim() });
      window.dispatchEvent(new Event("wallet:refresh"));
      onClose();
      nav(isRace ? `/race/${data.id}` : `/room/${data.id}`);
    } catch (e) {
      const detail = formatApiError(e.response?.data?.detail);
      if (/insufficient/i.test(detail)) showPopup({ type: "wallet", title: "Insufficient balance", message: "Add coins to join this room." });
      else showPopup({ type: "warning", title: "Can't join", message: detail });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-pazer-card border-white/10 text-white max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><Users className="h-5 w-5 text-pazer-red" />Play with Friends</DialogTitle></DialogHeader>
        <div className="relative min-h-[8.5rem] overflow-hidden rounded-2xl" data-testid="friends-demo">
          <LoopVideo k={"friends"} className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent" />
          <ol className="relative p-3 space-y-1 text-[11px] leading-snug text-white/85 max-w-[75%]">
            {MODE_META.friends.steps.map((t, i) => <li key={i}><b className="text-pazer-red">{i + 1}.</b> {t}</li>)}
          </ol>
        </div>
        <div className="flex gap-2 mb-2">
          {["create", "join"].map((t) => (
            <button key={t} data-testid={`custom-tab-${t}`} onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-full text-sm font-semibold capitalize transition-colors ${tab === t ? "bg-pazer-red text-white" : "bg-white/5 text-white/60"}`}>
              {t === "create" ? "Create Room" : "Join by Code"}
            </button>
          ))}
        </div>

        {tab === "create" ? (
          <div className="space-y-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-white/50 mb-2">Room Type</div>
              <div className="grid grid-cols-2 gap-2">
                {[["1v1", Swords, "1v1 Duel · min 50"], ["multiplayer", Users, "Multiplayer · min 30"]].map(([m, Ic, lbl]) => (
                  <button key={m} data-testid={`custom-mode-${m}`} onClick={() => { setMode(m); setFee(m === "1v1" ? 50 : 30); }}
                    className={`py-3 rounded-xl text-xs font-semibold flex flex-col items-center gap-1 transition-colors ${mode === m ? "bg-pazer-red text-white" : "bg-white/5 text-white/60"}`}>
                    <Ic className="h-4 w-4" />{lbl}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-white/50 mb-2">Game</div>
              <div className="grid grid-cols-3 gap-2">
                {ALL_GAMES.map((k) => {
                  const g = GAME_META[k];
                  return (
                    <button key={k} data-testid={`custom-game-${k}`} onClick={() => setGame(k)}
                      className={`py-2 rounded-xl text-[11px] font-bold flex flex-col items-center gap-1 border transition-colors ${game === k ? "text-black" : "bg-white/5 text-white/70 border-white/10"}`}
                      style={game === k ? { background: g.color, borderColor: g.color } : undefined}>
                      <g.icon className="h-4 w-4" />{g.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className={game === "stopwatch" ? "" : "hidden"}>
                <div className="text-xs uppercase tracking-wider text-white/50 mb-1">Target (s)</div>
                <input data-testid="custom-target" type="number" min={3} max={60} value={target} onChange={(e) => setTarget(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 font-mono-pz focus:border-pazer-red outline-none" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-white/50 mb-1">Entry (min {minFee})</div>
                <input data-testid="custom-fee" type="number" min={minFee} value={fee} onChange={(e) => setFee(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 font-mono-pz focus:border-pazer-red outline-none" />
              </div>
            </div>
            <p className="text-xs text-white/40">Room stays open 10 minutes. Share the code with friends, then start the match yourself.{game !== "stopwatch" && ` ${GAME_META[game].race}`}</p>
            <button onClick={create} disabled={busy} data-testid="create-custom-btn"
              className="w-full py-3 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create &amp; Pay {fee}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-white/50 mb-1">Room Code</div>
              <input data-testid="join-code-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. C1AB2CD"
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-3 font-mono-pz text-lg tracking-widest text-center focus:border-pazer-red outline-none" />
            </div>
            <p className="text-xs text-white/40">Enter the code your friend shared. Your entry fee is charged when you join.</p>
            <button onClick={joinCode} disabled={busy} data-testid="join-code-btn"
              className="w-full py-3 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Join Room
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReferralModal({ open, onClose }) {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const code = user?.referral_code || "—";

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const share = async () => {
    const text = `Join me on TIMEUP! Use my code ${code} to sign up and we both get 10 bonus coins. ${window.location.origin}/register`;
    try {
      if (navigator.share) await navigator.share({ title: "TIMEUP", text });
      else { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    } catch (e) { /* cancelled */ }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-pazer-card border-white/10 text-white">
        <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><Gift className="h-5 w-5 text-pazer-red" />Refer &amp; Earn</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="rounded-2xl bg-pazer-red p-5 text-center">
            <div className="text-white/80 text-xs uppercase tracking-widest mb-1">Your Referral Code</div>
            <div className="font-mono-pz font-extrabold text-3xl tracking-widest" data-testid="referral-code">{code}</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={copy} data-testid="copy-referral" className="py-2.5 rounded-full bg-white/5 hover:bg-white/10 font-semibold text-sm flex items-center justify-center gap-2 transition-colors">
              {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
            </button>
            <button onClick={share} data-testid="share-referral" className="py-2.5 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold text-sm flex items-center justify-center gap-2 transition-colors">
              <Share2 className="h-4 w-4" /> Share
            </button>
          </div>
          <div className="rounded-2xl pz-glass p-4 text-sm space-y-2">
            <div className="flex items-center gap-2 text-white/70"><span className="h-1.5 w-1.5 rounded-full bg-green-400" /> You &amp; your friend each get <span className="text-green-400 font-bold">10 coins</span> on signup.</div>
            <div className="flex items-center gap-2 text-white/70"><span className="h-1.5 w-1.5 rounded-full bg-pazer-red" /> Earn <span className="text-pazer-red font-bold">7.5%</span> every time they lose a match.</div>
            <div className="flex items-center gap-2 text-white/70"><span className="h-1.5 w-1.5 rounded-full bg-green-400" /> Earn <span className="text-green-400 font-bold">2.5%</span> of every prize they win.</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-white/40 uppercase tracking-wider">Total referral earnings</div>
            <div className="font-mono-pz font-bold text-2xl text-green-400" data-testid="referral-earnings">{Math.round(user?.referral_earnings || 0).toLocaleString()}</div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
