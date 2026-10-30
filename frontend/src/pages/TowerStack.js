import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Layers, Loader2, Timer, Users, Trophy, Bot, Zap, Play } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { showPopup } from "@/components/CenterPopup";
import { showWin } from "@/components/WinCelebration";
import { BetBox, apiErrorPopup } from "@/components/BetBox";
import { StackScene } from "@/components/StackScene";
import { initialState, offsetAt, placeBlock, endlessMultiplier } from "@/lib/stackEngine";
import { fbTrack } from "@/lib/siteConfig";
import { MuteButton } from "@/components/MuteButton";
import { sfx } from "@/lib/sfx";
import { HowToPlay } from "@/components/HowToPlay";
import { useRace, RaceBar } from "@/components/Race";

const TABS = [{ id: "timed", label: "Timed Challenges", icon: Timer }];

export default function TowerStack() {
  const [cfg, setCfg] = useState(null);
  const [tab, setTab] = useState("timed");
  const [bet, setBet] = useState(20);
  const [challengeId, setChallengeId] = useState("sprint");
  const [phase, setPhase] = useState("idle"); // idle | playing | submitting | done
  const [hud, setHud] = useState({ height: 0, perfects: 0, combo: 0 });
  const [flash, setFlash] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [result, setResult] = useState(null);
  const [rooms, setRooms] = useState(null);
  const [busy, setBusy] = useState(false);
  const sceneRef = useRef(null);
  const run = useRef(null);
  const playRef = useRef(null);
  const race = useRace();
  const raceRef = useRef(race);
  raceRef.current = race;

  useEffect(() => { api.get("/games/extra/config").then(({ data }) => { setCfg(data.stack); setBet(data.stack.min_bet || 20); }).catch(() => {}); }, []);
  const playing = phase === "playing";
  useEffect(() => { window.dispatchEvent(new CustomEvent("game:active", { detail: playing })); }, [playing]);
  useEffect(() => () => window.dispatchEvent(new CustomEvent("game:active", { detail: false })), []);

  const loadRooms = useCallback(() => api.get("/games/stack/rooms").then(({ data }) => setRooms(data)).catch(() => {}), []);
  useEffect(() => {
    if (tab !== "versus") return undefined;
    loadRooms();
    const iv = setInterval(loadRooms, 3000);
    return () => clearInterval(iv);
  }, [tab, loadRooms]);

  const onFrame = useCallback((now) => {
    const r = run.current;
    if (!r?.running) return;
    const t = now - r.spawn;
    const i = r.st.height;
    const off = offsetAt(r.eng, i, t);
    const box = i % 2 === 0 ? { ...r.st.top, x: r.st.top.x + off } : { ...r.st.top, z: r.st.top.z + off };
    sceneRef.current?.setMoving(box, i + 1);
  }, []);

  const finishRun = useCallback(async () => {
    const r = run.current;
    if (!r || r.finishing) return;
    r.running = false; r.finishing = true;
    setPhase("submitting"); setTimeLeft(null);
    try {
      const { data } = await api.post("/games/stack/finish", { session_id: r.session.session_id, token: r.session.token, taps: r.taps });
      setResult({ ...data, kind: data.race ? "mp" : r.kind, challenge: r.session.challenge });
      window.dispatchEvent(new Event("wallet:refresh"));
      setTimeout(() => playRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      if (data.race) raceRef.current.finished();
      else if (data.won && data.prize > 0) showWin(data.prize); else if (!data.won) sfx.lose();
      if (r.kind === "mp") loadRooms();
    } catch (e) { showPopup({ type: "warning", title: "Couldn't submit run", message: formatApiError(e.response?.data?.detail) }); }
    finally { setPhase("done"); }
  }, [loadRooms]);

  const spawn = () => { run.current.spawn = performance.now(); };

  const beginRun = (session, kind) => {
    sceneRef.current?.reset();
    run.current = { session, kind, eng: session.engine, st: initialState(), taps: [], running: true, finishing: false, startedAt: performance.now() };
    setHud({ height: 0, perfects: 0, combo: 0 }); setResult(null); setFlash(null);
    setPhase("playing");
    spawn();
  };

  const tap = useCallback(() => {
    const r = run.current;
    if (!r?.running) return;
    const t = Math.round(performance.now() - r.spawn);
    if (t < (r.eng.min_tap_ms || 100)) return;
    const res = placeBlock(r.eng, r.st, t);
    r.taps.push(t);
    const level = r.st.height + 1;
    if (!res.ok) {
      sceneRef.current?.hideMoving();
      sceneRef.current?.addFalling(res.cut, level);
      sfx.crash();
      finishRun();
      return;
    }
    sceneRef.current?.addPlaced(res.placed, level);
    if (res.cut) sceneRef.current?.addFalling(res.cut, level);
    if (res.perfect) {
      sceneRef.current?.perfectFx(res.placed, level);
      sfx.perfect(res.state.combo);
      setFlash({ text: res.state.combo >= 2 ? `PERFECT ×${res.state.combo}` : "PERFECT", key: Date.now() });
    } else sfx.place(0);
    r.st = res.state;
    setHud({ height: res.state.height, perfects: res.state.perfects, combo: res.state.combo });
    const ch = r.session.challenge;
    if (ch && res.state.height >= ch.height) { finishRun(); return; }
    spawn();
  }, [finishRun]);

  useEffect(() => {
    const onKey = (e) => { if (e.code === "Space" && run.current?.running) { e.preventDefault(); tap(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tap]);

  useEffect(() => {
    if (!playing || !run.current?.session?.challenge) return undefined;
    const ch = run.current.session.challenge;
    const iv = setInterval(() => {
      const left = ch.seconds - (performance.now() - run.current.startedAt) / 1000;
      setTimeLeft(Math.max(0, left));
      if (left <= 0) finishRun();
    }, 100);
    return () => clearInterval(iv);
  }, [playing, finishRun]);

  const startSolo = async () => {
    if (!race.id && bet < (cfg?.min_bet || 20)) return showPopup({ type: "warning", title: "Bet too low", message: `Minimum bet is ${cfg?.min_bet || 20} coins.` });
    setBusy(true);
    try {
      const body = tab === "timed" ? { bet, mode: "timed", challenge_id: challengeId } : { bet, mode: "endless" };
      const { data } = race.id ? await race.play() : await api.post("/games/stack/start", body);
      setTimeout(() => playRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      fbTrack("game_play", { value: bet, currency: "INR" });
      window.dispatchEvent(new Event("wallet:refresh"));
      beginRun(data, tab);
    } catch (e) { apiErrorPopup(showPopup, formatApiError(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const joinRoom = async (id) => {
    setBusy(true);
    try { await api.post(`/games/stack/rooms/${id}/join`); window.dispatchEvent(new Event("wallet:refresh")); loadRooms(); }
    catch (e) { apiErrorPopup(showPopup, formatApiError(e.response?.data?.detail), "Can't join"); }
    finally { setBusy(false); }
  };

  const playRoom = async (id) => {
    setBusy(true);
    try { const { data } = await api.post(`/games/stack/rooms/${id}/play`); beginRun(data, "mp"); }
    catch (e) { showPopup({ type: "warning", title: "Can't play", message: formatApiError(e.response?.data?.detail) }); }
    finally { setBusy(false); }
  };

  const liveMult = endlessMultiplier(cfg, hud.height, hud.perfects);
  const challenges = cfg?.challenges || [];
  const ch = challenges.find((c) => c.id === challengeId);

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 pb-40" data-testid="stack-page">
      <div className="flex items-center gap-3 mb-4">
        <Link to="/home" data-testid="stack-back" className="h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center"><ArrowLeft className="h-4 w-4" /></Link>
        <Layers className="h-5 w-5 text-pazer-red" />
        <h1 className="font-display font-bold text-2xl tracking-tight">Tower</h1><span className="hidden sm:inline rounded-full bg-emerald-500/15 text-emerald-300 text-[11px] px-2.5 py-1 font-semibold">Skill game</span>
        <HowToPlay k="stack" /><MuteButton className="!ml-0" />
      </div>
      <RaceBar race={race} />

      <div className="hidden">
        {TABS.map((t) => (
          <button key={t.id} disabled={playing || phase === "submitting"} onClick={() => { setTab(t.id); setResult(null); setPhase("idle"); }} data-testid={`stack-tab-${t.id}`}
            className={`py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 ${tab === t.id ? "bg-pazer-red text-white pz-glow-box" : "bg-white/5 text-white/60 hover:bg-white/10"}`}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      <div ref={playRef} className="relative h-[460px] scroll-mt-20 overflow-hidden rounded-3xl border border-pazer-red/25 bg-[radial-gradient(ellipse_at_top,#3a0a12,#0a0306_60%,#000)] select-none touch-none"
        onPointerDown={(e) => { if (run.current?.running) { e.preventDefault(); tap(); } }} data-testid="stack-play-area">
        <StackScene ref={sceneRef} onFrame={onFrame} className="absolute inset-0" />
        <div className="pointer-events-none absolute inset-x-0 top-0 p-4 flex items-start justify-between">
          <div>
            <div className="font-mono-pz text-5xl font-extrabold drop-shadow-[0_0_12px_rgba(245,179,1,.6)]" data-testid="stack-height">{hud.height}</div>
            <div className="text-[11px] uppercase tracking-widest text-white/50">Height · {hud.perfects} perfect</div>
          </div>
          <div className="text-right">
            {run.current?.session?.challenge && timeLeft != null && (
              <div className={`font-mono-pz text-3xl font-bold ${timeLeft < 5 ? "text-pazer-red" : "text-white"}`} data-testid="stack-timer">{timeLeft.toFixed(1)}s</div>
            )}
            {run.current?.kind === "endless" && playing && (
              <div className="font-mono-pz text-2xl font-bold text-amber-300" data-testid="stack-live-mult">{liveMult.toFixed(2)}×</div>
            )}
            {run.current?.session?.challenge && playing && <div className="text-[11px] text-white/50">Target {run.current.session.challenge.height}</div>}
          </div>
        </div>
        <AnimatePresence>
          {flash && (
            <motion.div key={flash.key} initial={{ opacity: 0, y: 10, scale: 0.8 }} animate={{ opacity: 1, y: -10, scale: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }} onAnimationComplete={() => setTimeout(() => setFlash(null), 350)}
              className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 font-display font-extrabold text-2xl text-white drop-shadow-[0_0_14px_rgba(255,255,255,.9)]">
              <Zap className="inline h-5 w-5 -mt-1 text-amber-300" /> {flash.text}
            </motion.div>
          )}
        </AnimatePresence>
        {playing && hud.height === 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-white/70 text-sm animate-pulse">Tap anywhere or press Space to drop the block</div>
        )}
        {phase === "submitting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40"><Loader2 className="h-8 w-8 animate-spin" /></div>
        )}
        {phase === "done" && result && <ResultCard result={result} />}
        {phase === "idle" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-white/60 text-sm">Align each block. Perfect drops build combos and grow your tower back.</div>
        )}
      </div>

      {!playing && phase !== "submitting" && tab !== "versus" && (
        <div className="mt-5 rounded-3xl pz-glass p-5 space-y-4">
          {tab === "timed" && !race.id && (
            <div className="grid grid-cols-3 gap-2">
              {challenges.map((c) => (
                <button key={c.id} onClick={() => setChallengeId(c.id)} data-testid={`stack-challenge-${c.id}`}
                  className={`rounded-xl p-3 text-left border transition-colors ${challengeId === c.id ? "border-pazer-red bg-pazer-red/15" : "border-white/10 bg-white/5 hover:bg-white/10"}`}>
                  <div className="font-bold">{c.label}</div>
                  <div className="text-[11px] text-white/60">{c.height} blocks in {c.seconds}s</div>
                  <div className="font-mono-pz text-amber-300 font-bold">{c.multiplier}×</div>
                </button>
              ))}
            </div>
          )}
          {tab === "endless" && cfg && (
            <div className="text-xs text-white/50 leading-relaxed" data-testid="stack-endless-rules">
              Payout = <b className="text-white">{cfg.per_level}× per block</b> + <b className="text-white">{cfg.per_perfect}× per perfect</b> (min height {cfg.min_height}, max {cfg.max_multiplier}×).
              Height 15 ≈ <span className="font-mono-pz text-amber-300">{endlessMultiplier(cfg, 15, 0)}×</span>, 25 ≈ <span className="font-mono-pz text-amber-300">{endlessMultiplier(cfg, 25, 0)}×</span>, 40 ≈ <span className="font-mono-pz text-amber-300">{endlessMultiplier(cfg, 40, 0)}×</span>.
            </div>
          )}
          {!race.id && <BetBox bet={bet} setBet={setBet} min={cfg?.min_bet || 20} prefix="stack" disabled={busy} />}
          {race.id && <div className="text-sm text-white/60" data-testid="stack-race-rules">Race: build as high as you can in the challenge time. Reaching the target faster ranks higher.</div>}
          {tab === "timed" && ch && !race.id && (
            <div className="flex justify-between text-sm text-white/50"><span>Win if you reach {ch.height} in {ch.seconds}s</span><span className="font-mono-pz text-green-400 font-bold">{(bet * ch.multiplier).toFixed(2)}</span></div>
          )}
          <button onClick={startSolo} disabled={busy || (race.id && race.locked)} data-testid="stack-start-btn"
            className="w-full py-4 rounded-2xl bg-pazer-red hover:bg-pazer-redhover font-extrabold text-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
            {busy && <Loader2 className="h-5 w-5 animate-spin" />} {race.id ? (race.locked ? "Race run used" : "Start race run") : `${result ? "Play Again" : "Start Stacking"} · ${bet}`}
          </button>
        </div>
      )}

      {tab === "versus" && !playing && phase !== "submitting" && (
        <VersusPanel rooms={rooms} busy={busy} onJoin={joinRoom} onPlay={playRoom} />
      )}
    </div>
  );
}

function ResultCard({ result }) {
  const r = result.result || {};
  let title, tone;
  if (result.kind === "mp") { title = `Tower submitted · ${r.height} block${r.height === 1 ? "" : "s"}`; tone = "text-white"; }
  else if (result.kind === "timed") { title = result.won ? "Challenge complete!" : "Challenge failed"; tone = result.won ? "text-emerald-300" : "text-pazer-red"; }
  else if (result.won) { title = `${result.multiplier}× tower!`; tone = "text-emerald-300"; }
  else { title = result.prize > 0 ? `Tower toppled · ${result.multiplier}× back` : "Tower toppled"; tone = result.prize > 0 ? "text-amber-300" : "text-pazer-red"; }
  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} data-testid="stack-result"
      className="absolute inset-x-6 bottom-6 rounded-2xl bg-black/80 backdrop-blur border border-white/10 p-4 text-center">
      <div className={`font-display font-extrabold text-xl ${tone}`}>{title}</div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-white/60">
        <div><div className="font-mono-pz text-lg text-white">{r.height}</div>height</div>
        <div><div className="font-mono-pz text-lg text-white">{r.perfects}</div>perfects</div>
        <div><div className="font-mono-pz text-lg text-white">{result.kind === "mp" ? "-" : (result.prize ?? 0).toFixed(2)}</div>{result.kind === "mp" ? "see standings" : "won"}</div>
      </div>
      {result.flagged && <div className="mt-2 text-xs text-pazer-red">Run flagged by anti-cheat — not counted.</div>}
    </motion.div>
  );
}

function Countdown({ to }) {
  const [, force] = useState(0);
  useEffect(() => { const iv = setInterval(() => force((x) => x + 1), 1000); return () => clearInterval(iv); }, []);
  const s = Math.max(0, Math.round((new Date(to) - Date.now()) / 1000));
  return <span className="font-mono-pz">{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}</span>;
}

function VersusPanel({ rooms, busy, onJoin, onPlay }) {
  if (!rooms) return <div className="mt-5 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  const me = rooms.mine || [];
  const joinedKeys = new Set(me.filter((r) => r.status === "OPEN").map((r) => r.id));
  return (
    <div className="mt-5 space-y-4" data-testid="stack-versus">
      {me.map((room) => <MyRoom key={room.id} room={room} busy={busy} onPlay={onPlay} />)}
      <div className="rounded-3xl pz-glass p-5">
        <h3 className="font-display font-bold text-lg mb-1 flex items-center gap-2"><Users className="h-4 w-4 text-pazer-red" /> Open rooms</h3>
        <p className="text-xs text-white/50 mb-4">Everyone pays the same entry and gets one run. Highest tower takes the pool (minus {rooms.platform_fee_percent}% fee). Ties: more perfects, then earliest finish.</p>
        <div className="grid grid-cols-2 gap-3">
          {rooms.open.map((r) => {
            const pool = r.entry_fee * r.max_players * (1 - r.platform_fee_percent / 100);
            return (
              <div key={r.id} className="rounded-2xl border border-white/10 bg-black/30 p-4" data-testid={`stack-room-${r.entry_fee}-${r.max_players}`}>
                <div className="flex items-center justify-between">
                  <span className="font-mono-pz font-bold text-lg">{r.entry_fee}</span>
                  <span className="text-xs rounded-full bg-white/10 px-2 py-0.5">{r.players.length}/{r.max_players}</span>
                </div>
                <div className="text-xs text-white/50 mb-3">{r.max_players} players · win <span className="text-green-400 font-mono-pz">{pool.toFixed(0)}</span></div>
                <button onClick={() => onJoin(r.id)} disabled={busy || joinedKeys.has(r.id)} data-testid={`stack-join-${r.entry_fee}-${r.max_players}`}
                  className="w-full py-2 rounded-xl bg-pazer-red hover:bg-pazer-redhover text-sm font-bold disabled:opacity-40">{joinedKeys.has(r.id) ? "Joined" : "Join"}</button>
              </div>
            );
          })}
        </div>
      </div>
      {(rooms.recent || []).length > 0 && (
        <div className="rounded-3xl pz-glass p-5">
          <h3 className="font-display font-bold text-lg mb-3 flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-300" /> Recent results</h3>
          <div className="space-y-3">{rooms.recent.map((r) => <Standings key={r.id} room={r} />)}</div>
        </div>
      )}
    </div>
  );
}

function MyRoom({ room, busy, onPlay }) {
  return (
    <div className="rounded-3xl border border-pazer-red/40 bg-pazer-red/[0.06] p-5" data-testid={`stack-myroom-${room.id}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="font-display font-bold">Room {room.code} · {room.entry_fee} entry</div>
        <span className={`text-xs font-bold rounded-full px-2.5 py-1 ${room.status === "LIVE" ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/70"}`} data-testid="stack-myroom-status">{room.status}</span>
      </div>
      {room.status === "OPEN" && <p className="text-xs text-white/60">Waiting for players ({room.players.length}/{room.max_players})… practice bots join if the room isn't full soon.</p>}
      {room.status === "LIVE" && (
        <>
          <p className="text-xs text-white/60 mb-3">Room is live! Time left to play: <Countdown to={room.deadline} /></p>
          {!room.me_started && (
            <button onClick={() => onPlay(room.id)} disabled={busy} data-testid="stack-play-room-btn"
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-700 font-extrabold flex items-center justify-center gap-2 disabled:opacity-50">
              <Play className="h-4 w-4" /> Play your run
            </button>
          )}
        </>
      )}
      <div className="mt-3"><Standings room={room} compact /></div>
    </div>
  );
}

function Standings({ room, compact }) {
  const sorted = [...room.players].sort((a, b) => (b.height ?? -1) - (a.height ?? -1));
  return (
    <div>
      {!compact && <div className="text-xs text-white/50 mb-1">Room {room.code} · prize {room.prize} · winner <b className="text-white">{room.winner?.username}</b></div>}
      <div className="space-y-1">
        {sorted.map((p, i) => (
          <div key={p.user_id} className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-sm ${room.winner?.user_id === p.user_id ? "bg-amber-400/15" : "bg-black/30"}`}>
            <span className="flex items-center gap-2">
              <span className="text-white/40 w-4">{p.rank || i + 1}</span>
              {p.username}{p.is_me && <span className="text-[10px] text-pazer-red">(you)</span>}
              {p.is_bot && <span className="inline-flex items-center gap-0.5 text-[10px] text-white/40"><Bot className="h-3 w-3" />practice bot</span>}
            </span>
            <span className="font-mono-pz">{p.submitted ? `${p.height}` : p.started ? "playing…" : "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
