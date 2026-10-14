import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, ChevronDown, RefreshCw, ExternalLink } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { shortHash } from "@/lib/fair";
import { showPopup } from "@/components/CenterPopup";

/**
 * Provably-fair seed panel.
 * props: game ("vortex"|"chicken"), param (theme/mode), locked (round active), round (fair obj of current/last round), refreshKey
 */
export function FairnessPanel({ game, param, locked, round, refreshKey }) {
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState(null);
  const [cs, setCs] = useState("");

  const load = () => api.get("/fair/seed").then(({ data }) => { setSeed(data); setCs(data.client_seed); }).catch(() => {});
  useEffect(() => { load(); }, [refreshKey]);

  const save = async () => {
    try { const { data } = await api.post("/fair/client-seed", { client_seed: cs }); setSeed(data); showPopup({ type: "success", title: "Client seed updated", message: "Your next round will use this seed." }); }
    catch (e) { showPopup({ type: "warning", title: "Invalid seed", message: formatApiError(e.response?.data?.detail) }); }
  };
  const randomize = () => setCs([...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join(""));

  const revealed = round?.server_seed;
  const verifyHref = revealed
    ? `/games/fairness?game=${game}&p=${param}&s=${round.server_seed}&c=${encodeURIComponent(round.client_seed)}&n=${round.nonce}`
    : null;

  return (
    <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.04]" data-testid={`${game}-fair-panel`}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-4 py-3 text-sm" data-testid={`${game}-fair-toggle`}>
        <span className="flex items-center gap-2 text-emerald-300 font-semibold"><ShieldCheck className="h-4 w-4" /> Provably Fair</span>
        <ChevronDown className={`h-4 w-4 text-white/50 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 text-xs">
          {round && !revealed && (
            <Row label="This round · server seed hash" value={round.server_seed_hash} testid={`${game}-fair-round-hash`} />
          )}
          {revealed && (
            <div className="rounded-xl bg-black/40 p-3 space-y-2">
              <div className="text-emerald-300 font-semibold">Last round revealed</div>
              <Row label="Server seed" value={round.server_seed} testid={`${game}-fair-revealed-seed`} />
              <Row label="Hash (committed before play)" value={round.server_seed_hash} />
              <div className="flex justify-between text-white/60"><span>Client seed: <b className="text-white">{round.client_seed}</b></span><span>Nonce: <b className="text-white">{round.nonce}</b></span></div>
              <Link to={verifyHref} data-testid={`${game}-fair-verify-link`} className="inline-flex items-center gap-1 text-emerald-300 hover:underline">Verify this round <ExternalLink className="h-3 w-3" /></Link>
            </div>
          )}
          {seed && (
            <>
              <Row label="Next server seed hash" value={seed.server_seed_hash} testid={`${game}-fair-next-hash`} />
              <div>
                <div className="text-white/40 uppercase tracking-wider mb-1">Client seed · next nonce {seed.nonce}</div>
                <div className="flex gap-2">
                  <input value={cs} disabled={locked} onChange={(e) => setCs(e.target.value)} data-testid={`${game}-fair-client-seed`}
                    className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 font-mono-pz outline-none focus:border-emerald-400 disabled:opacity-50" />
                  <button disabled={locked} onClick={randomize} className="px-3 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40"><RefreshCw className="h-3.5 w-3.5" /></button>
                  <button disabled={locked || cs === seed.client_seed} onClick={save} data-testid={`${game}-fair-save-seed`}
                    className="px-3 rounded-lg bg-emerald-500/80 hover:bg-emerald-500 font-semibold disabled:opacity-40">Save</button>
                </div>
              </div>
            </>
          )}
          <Link to="/games/fairness" className="block text-white/50 hover:text-white">Game rules & how verification works →</Link>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, testid }) {
  return (
    <div>
      <div className="text-white/40 uppercase tracking-wider mb-0.5">{label}</div>
      <div className="font-mono-pz text-white/80 break-all" title={value} data-testid={testid}>{value?.length > 40 ? value : shortHash(value)}</div>
    </div>
  );
}
