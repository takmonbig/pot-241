import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ShieldCheck, Tornado, Egg, Layers, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { sha256Hex, verifyVortex, verifyChicken, shortHash } from "@/lib/fair";

export default function Fairness() {
  const [params] = useSearchParams();
  const [cfg, setCfg] = useState(null);
  const [rounds, setRounds] = useState([]);
  const [form, setForm] = useState({ game: params.get("game") || "vortex", p: params.get("p") || "", s: params.get("s") || "", c: params.get("c") || "", n: params.get("n") || "0", h: "" });
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/games/extra/config").then(({ data }) => setCfg(data)).catch(() => {});
    api.get("/fair/rounds").then(({ data }) => setRounds(data)).catch(() => {});
  }, []);

  const paramOptions = form.game === "vortex" ? Object.keys(cfg?.vortex?.themes || {}) : Object.keys(cfg?.chicken?.modes || {});
  const p = paramOptions.includes(form.p) ? form.p : paramOptions[0];

  const verify = async (f = form) => {
    if (!cfg || !f.s) return;
    setBusy(true);
    try {
      const hash = await sha256Hex(f.s);
      const param = (f.game === "vortex" ? Object.keys(cfg.vortex.themes) : Object.keys(cfg.chicken.modes)).includes(f.p) ? f.p : (f.game === "vortex" ? "earth" : "easy");
      if (f.game === "vortex") {
        const vt = cfg.vortex.themes[param];
        const res = await verifyVortex({ serverSeed: f.s, clientSeed: f.c, nonce: parseInt(f.n) || 0, segments: cfg.vortex.segments, loseCounts: vt.lose });
        setOut({ game: "vortex", hash, stages: res, param });
      } else {
        const m = cfg.chicken.modes[param];
        const res = await verifyChicken({ serverSeed: f.s, clientSeed: f.c, nonce: parseInt(f.n) || 0, steps: m.steps, hazard: m.hazard });
        setOut({ game: "chicken", hash, hazardStep: res.hazardStep, steps: m.steps, param });
      }
    } finally { setBusy(false); }
  };

  // auto-verify when opened from a game's "Verify this round" link
  useEffect(() => { if (cfg && params.get("s")) verify({ ...form }); }, [cfg]); // eslint-disable-line react-hooks/exhaustive-deps

  const fill = (r) => {
    const game = r.mode;
    const f = { game, p: r.details?.theme || r.details?.difficulty || "", s: r.fair.server_seed, c: r.fair.client_seed, n: String(r.fair.nonce), h: r.fair.server_seed_hash };
    setForm(f); verify(f);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const set = (k) => (e) => setForm((x) => ({ ...x, [k]: e.target.value }));
  const inp = "w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono-pz outline-none focus:border-emerald-400";
  const vc = cfg?.vortex; const cc = cfg?.chicken; const sc = cfg?.stack;

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 pb-40" data-testid="fairness-page">
      <div className="flex items-center gap-3 mb-5">
        <Link to="/home" className="h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center"><ArrowLeft className="h-4 w-4" /></Link>
        <ShieldCheck className="h-5 w-5 text-emerald-400" />
        <h1 className="font-display font-bold text-2xl tracking-tight">Fairness & Game Rules</h1>
      </div>

      <section className="rounded-3xl pz-glass p-5 mb-5 text-sm text-white/70 space-y-2">
        <h2 className="font-display font-bold text-lg text-white">How Provably Fair works</h2>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Before you play, we commit to a secret <b>server seed</b> by showing you its SHA-256 <b>hash</b>.</li>
          <li>You control the <b>client seed</b> (change it anytime between rounds). Each round uses a new <b>nonce</b>.</li>
          <li>The outcome is <span className="font-mono-pz text-white">HMAC_SHA256(server_seed, "client_seed:nonce:cursor")</span>, split into 4-byte numbers between 0 and 1.</li>
          <li>When the round ends we reveal the server seed. Hash it yourself. If it matches the hash you saw, the result was fixed before you played and we could not change it.</li>
        </ol>
      </section>

      <section className="rounded-3xl border border-emerald-400/25 bg-emerald-500/[0.04] p-5 mb-5" data-testid="fair-verify-tool">
        <h2 className="font-display font-bold text-lg mb-3">Verify a round</h2>
        <div className="grid grid-cols-2 gap-3">
          <select value={form.game} onChange={set("game")} className={inp} data-testid="fair-game-select">
            <option value="vortex">Vortex Spin</option><option value="chicken">Chicken Quest</option>
          </select>
          <select value={p || ""} onChange={set("p")} className={inp} data-testid="fair-param-select">
            {paramOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <input placeholder="Server seed (revealed)" value={form.s} onChange={set("s")} className={`${inp} col-span-2`} data-testid="fair-server-seed" />
          <input placeholder="Client seed" value={form.c} onChange={set("c")} className={inp} data-testid="fair-client-seed" />
          <input placeholder="Nonce" value={form.n} onChange={set("n")} className={inp} data-testid="fair-nonce" />
          <input placeholder="Hash shown before play (optional)" value={form.h} onChange={set("h")} className={`${inp} col-span-2`} />
        </div>
        <button onClick={() => verify({ ...form, p })} disabled={busy || !form.s} data-testid="fair-verify-btn"
          className="mt-3 w-full py-3 rounded-xl bg-emerald-500/80 hover:bg-emerald-500 font-bold disabled:opacity-40 flex items-center justify-center gap-2">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Verify
        </button>
        {out && (
          <div className="mt-4 rounded-xl bg-black/40 p-4 text-sm space-y-2" data-testid="fair-verify-result">
            <div className="text-white/50">SHA-256(server seed) = <span className="font-mono-pz text-white break-all">{out.hash}</span></div>
            {form.h && (out.hash === form.h.trim()
              ? <div className="text-emerald-300 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Hash matches the committed hash</div>
              : <div className="text-pazer-red flex items-center gap-1"><XCircle className="h-4 w-4" /> Hash does NOT match</div>)}
            {out.game === "vortex" ? (
              <div className="grid grid-cols-5 gap-2">
                {out.stages.map((s) => (
                  <div key={s.stage} className={`rounded-lg p-2 text-center ${s.safe ? "bg-emerald-500/15" : "bg-pazer-red/20"}`}>
                    <div className="text-[10px] text-white/50">Stage {s.stage}</div>
                    <div className="font-mono-pz font-bold">slot {s.landing}</div>
                    <div className="text-[10px]">{s.safe ? "safe" : "break"}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="font-bold" data-testid="fair-chicken-hazard">{out.hazardStep ? `Trap on lane ${out.hazardStep} of ${out.steps}` : `No trap. All ${out.steps} lanes were safe`}</div>
            )}
          </div>
        )}
      </section>

      {rounds.length > 0 && (
        <section className="rounded-3xl pz-glass p-5 mb-5">
          <h2 className="font-display font-bold text-lg mb-3">My recent fair rounds</h2>
          <div className="space-y-2">
            {rounds.slice(0, 15).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl bg-black/30 px-3 py-2 text-sm">
                <span className="capitalize">{r.mode} · {r.details?.theme || r.details?.difficulty}</span>
                <span className="font-mono-pz text-xs text-white/50">nonce {r.fair.nonce} · {shortHash(r.fair.server_seed_hash)}</span>
                <span className={r.prize > 0 ? "text-emerald-300 font-mono-pz" : "text-white/40 font-mono-pz"}>{r.prize}</span>
                <button onClick={() => fill(r)} className="text-emerald-300 text-xs font-bold hover:underline" data-testid={`fair-round-verify-${r.id}`}>Verify</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4 text-sm text-white/70" data-testid="game-rules">
        <Rule icon={Tornado} title="Vortex Spin">
          <p>Pick an element: Earth (low risk), Water (medium) or Fire (high). Each round has {vc?.themes?.earth?.lose?.length || 5} stages. Every stage spins a {vc?.segments || 12}-slot wheel with some ✕ break slots. If you land on a safe slot, your riding amount is multiplied. If you land on ✕, you lose whatever is still riding.</p>
          <p>After each safe spin you can <b>Collect</b> everything, <b>Take {vc?.partial_collect_percent ?? 50}%</b> (banked straight to your wallet while the rest keeps riding, once per stage), or spin again. Clearing the final stage collects automatically.</p>
          <p>Landing slot for stage k = floor(float[k] × {vc?.segments || 12}). Break slots for stage k with L breaks = floor(j × {vc?.segments || 12} / L) for j = 0…L−1. House edge {vc?.house_edge_percent}% per stage.</p>
          {vc && <table className="w-full text-xs mt-2"><thead><tr className="text-white/40"><th className="text-left">Element</th>{vc.tables.earth.stages.map((_, i) => <th key={i}>S{i + 1}</th>)}</tr></thead>
            <tbody>{Object.keys(vc.themes).map((k) => <tr key={k}><td className="capitalize">{k}</td>{vc.tables[k].stages.map((s, i) => <td key={i} className="text-center font-mono-pz">{s.multiplier}×</td>)}</tr>)}</tbody></table>}
        </Rule>
        <Rule icon={Egg} title="Chicken Quest">
          <p>Guide the chicken across the lanes. Each Continue moves one lane forward and raises your multiplier. A hidden trap ends the quest and you lose your bet. Collect at any lane to cash out bet × that lane's multiplier. Reach the golden nest to collect the top prize automatically.</p>
          <p>The trap lane is the first lane k where float[k] &lt; trap chance. It is decided at the start from your seeds. Multiplier at lane k = (1 − {cc?.house_edge_percent}%) ÷ (1 − trap chance)<sup>k</sup>.</p>
          {cc && <ul className="list-disc pl-5">{Object.entries(cc.modes).map(([k, m]) => <li key={k}><b>{m.label}</b>: {m.steps} lanes, {Math.round(m.hazard * 100)}% trap chance per lane, top {cc.multipliers[k][m.steps - 1]}×</li>)}</ul>}
        </Rule>
        <Rule icon={Layers} title="Tower Stack (skill)">
          <p>Tap to drop the sliding block onto the tower. Any overhang is cut off, so the next block is narrower. A perfect drop (within {sc?.perfect_tolerance} of centre) keeps full width. {sc?.combo_growth_after} perfects in a row start growing the block back. The blocks speed up as the tower grows.</p>
          <p><b>Endless:</b> payout = height × {sc?.per_level} + perfects × {sc?.per_perfect} (minimum height {sc?.min_height}, max {sc?.max_multiplier}×). <b>Timed:</b> reach the target height before the clock runs out to win the fixed multiplier. <b>Versus:</b> 2 to 4 players pay the same entry and each gets one run. The highest tower takes the pool minus a {sc?.mp_platform_fee_percent}% fee.</p>
          <p>Block motion is fully deterministic. The server replays your exact tap timings to calculate your height, so no randomness affects the result.</p>
        </Rule>
      </section>
    </div>
  );
}

function Rule({ icon: Icon, title, children }) {
  return (
    <div className="rounded-3xl pz-glass p-5 space-y-2">
      <h3 className="font-display font-bold text-lg text-white flex items-center gap-2"><Icon className="h-5 w-5 text-pazer-red" /> {title}</h3>
      {children}
    </div>
  );
}
