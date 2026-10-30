import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Crown, Users, UserPlus, IndianRupee, Activity, Clock, ShieldAlert, Receipt, Plane, Palette, Landmark, Loader2 } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, CartesianGrid } from "recharts";
import api, { formatApiError } from "@/lib/api";
import { showPopup } from "@/components/CenterPopup";

const PIE = ["#f5b301", "#22c55e", "#a855f7", "#ef4444", "#38bdf8", "#f97316", "#eab308", "#14b8a6"];
const inr = (v) => `₹${Math.round(v || 0).toLocaleString("en-IN")}`;

function Kpi({ icon: I, label, value, sub, color = "text-amber-300", i, testid }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
      className="rounded-2xl border border-amber-400/25 bg-black/50 p-4" data-testid={testid}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/50"><I className="h-4 w-4 text-amber-300" />{label}</div>
      <div className={`font-mono-pz text-2xl font-extrabold mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-white/40">{sub}</div>}
    </motion.div>
  );
}

function Control({ icon: I, title, hint, target, max, placeholder, current, onDone }) {
  const [v, setV] = useState("");
  const [rounds, setRounds] = useState(1);
  const [busy, setBusy] = useState(false);
  const send = async (clear) => {
    setBusy(true);
    try {
      await api.post("/admin/house/control", { target, value: clear ? null : Number(v), rounds: Number(rounds) || 1 });
      showPopup({ type: "success", title: clear ? "Control cleared" : "Control set", message: clear ? "Results are random again." : `${title} applied.` });
      setV(""); onDone();
    } catch (e) { showPopup({ type: "warning", title: "Failed", message: formatApiError(e.response?.data?.detail) }); }
    finally { setBusy(false); }
  };
  return (
    <div className="rounded-2xl border border-amber-400/25 bg-black/50 p-4" data-testid={`control-${target}`}>
      <div className="flex items-center gap-2 font-bold"><I className="h-5 w-5 text-amber-300" />{title}</div>
      <div className="text-[11px] text-white/50 mb-2">{hint}</div>
      <div className="text-[11px] mb-2">Active: <b className="text-amber-200" data-testid={`control-${target}-current`}>{current ?? "none (random)"}</b></div>
      <div className="flex gap-2">
        <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} type="number" min="0" max={max} step="0.01"
          className="flex-1 min-w-0 rounded-lg bg-black/60 border border-white/15 px-3 py-2 text-sm outline-none focus:border-amber-300" data-testid={`control-${target}-input`} />
        {target === "aviator" && <input value={rounds} onChange={(e) => setRounds(e.target.value)} type="number" min="1" title="Rounds"
          className="w-16 rounded-lg bg-black/60 border border-white/15 px-2 py-2 text-sm" data-testid="control-aviator-rounds" />}
        <button onClick={() => send(false)} disabled={busy || v === ""} data-testid={`control-${target}-set`} className="rounded-lg bg-pazer-red px-3 text-xs font-extrabold disabled:opacity-50">SET</button>
        <button onClick={() => send(true)} disabled={busy} data-testid={`control-${target}-clear`} className="rounded-lg bg-white/10 px-3 text-xs font-bold">CLEAR</button>
      </div>
    </div>
  );
}

export function AdminDashboard() {
  const [period, setPeriod] = useState("month");
  const [d, setD] = useState(null);
  const load = useCallback(() => api.get(`/admin/dashboard?period=${period}`).then(({ data }) => setD(data)).catch(() => {}), [period]);
  useEffect(() => { load(); const iv = setInterval(load, 15000); return () => clearInterval(iv); }, [load]);
  if (!d) return <div className="py-16 flex justify-center"><Loader2 className="h-7 w-7 animate-spin text-amber-300" /></div>;
  const pie = d.game_revenue.filter((g) => g.wagered > 0);
  const af = d.controls.aviator_force;
  return (
    <div className="space-y-5" data-testid="admin-dashboard">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl flex items-center gap-2 pz-gold-text"><Crown className="h-6 w-6 text-amber-300" />ADMIN DASHBOARD</h2>
        <div className="ml-auto flex gap-1 rounded-xl bg-black/50 p-1">
          {[["today", "Today"], ["week", "This Week"], ["month", "This Month"]].map(([k, l]) => (
            <button key={k} onClick={() => setPeriod(k)} data-testid={`dash-period-${k}`} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${period === k ? "bg-pazer-red" : "text-white/60"}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Kpi i={0} icon={Users} label="Active Users" value={d.active_users.toLocaleString()} testid="kpi-active" />
        <Kpi i={1} icon={UserPlus} label="New Users" value={d.new_users.toLocaleString()} testid="kpi-new" />
        <Kpi i={2} icon={IndianRupee} label="Total Revenue" value={inr(d.total_revenue)} color={d.total_revenue >= 0 ? "text-green-400" : "text-red-400"} sub="Entries minus prizes" testid="kpi-revenue" />
      </div>
      <div className="grid lg:grid-cols-[2fr_1fr] gap-3">
        <div className="rounded-2xl border border-amber-400/25 bg-black/50 p-4" data-testid="chart-deposits">
          <div className="font-bold text-sm mb-2">Deposits vs Withdrawals</div>
          <div className="h-56">
            <ResponsiveContainer><LineChart data={d.series}><CartesianGrid stroke="#ffffff10" /><XAxis dataKey="date" tick={{ fill: "#999", fontSize: 10 }} tickFormatter={(x) => x.slice(5)} /><YAxis tick={{ fill: "#999", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#100c06", border: "1px solid #f5b30155" }} /><Line type="monotone" dataKey="deposits" stroke="#22c55e" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="withdrawals" stroke="#ef4444" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border border-amber-400/25 bg-black/50 p-4" data-testid="chart-game-revenue">
          <div className="font-bold text-sm mb-2">Game Wise Wagered</div>
          <div className="h-40"><ResponsiveContainer><PieChart><Pie data={pie} dataKey="wagered" nameKey="game" innerRadius={35} outerRadius={65}>{pie.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}</Pie><Tooltip contentStyle={{ background: "#100c06", border: "1px solid #f5b30155" }} /></PieChart></ResponsiveContainer></div>
          <div className="space-y-1 text-[11px]">{pie.slice(0, 6).map((g, i) => <div key={g.game} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: PIE[i % PIE.length] }} />{g.game}<span className="ml-auto font-mono-pz text-white/60">{inr(g.revenue)}</span></div>)}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi i={3} icon={Activity} label="Live Users" value={d.live_users} sub="Played in last 10 min" color="text-green-400" testid="kpi-live" />
        <Kpi i={4} icon={Clock} label="Pending Withdrawals" value={inr(d.pending_withdrawals.amount)} sub={`${d.pending_withdrawals.count} requests`} testid="kpi-pending" />
        <Kpi i={5} icon={ShieldAlert} label="Fraud Alerts" value={d.fraud_alerts} sub="Flagged games" color="text-red-400" testid="kpi-fraud" />
        <Kpi i={6} icon={Receipt} label="Total Transactions" value={d.total_transactions.toLocaleString()} testid="kpi-txns" />
      </div>
      <h3 className="font-display text-xl pz-gold-text">ADMIN CONTROLS</h3>
      <div className="grid md:grid-cols-3 gap-3">
        <Control icon={Plane} title="Aviator Crash Control" target="aviator" hint="Force the crash point for the next N Aviator rounds (any player)." placeholder="e.g. 1.50" current={af ? `${af.crash}× · ${af.remaining} rounds left` : null} onDone={load} />
        <Control icon={Palette} title="Color Prediction Control" target="color" max={9} hint="Set the winning number (0-9) for the current round." placeholder="0-9" current={d.controls.overrides.color} onDone={load} />
        <Control icon={Landmark} title="Matka Result Control" target="matka" max={99} hint="Set the result (00-99) for the current draw." placeholder="00-99" current={d.controls.overrides.matka} onDone={load} />
      </div>
      <p className="text-[11px] text-red-300/80">Rounds set here are not random, so their provably fair seed won't verify. Every change is written to the audit log.</p>
      <h3 className="font-display text-xl pz-gold-text">AGENT PANEL</h3>
      <div className="grid md:grid-cols-3 gap-3" data-testid="agent-panel">
        <Kpi i={7} icon={Users} label="Agents (referrers)" value={d.agents.count} sub={`Default commission ${d.agents.commission}% (edit in Config)`} testid="kpi-agents" />
        <Kpi i={8} icon={Receipt} label="Pending Deposit Approvals" value={d.agents.pending_deposits} sub="See Deposits tab" testid="kpi-pending-deposits" />
        <div className="rounded-2xl border border-amber-400/25 bg-black/50 p-4" data-testid="top-agents">
          <div className="text-[11px] uppercase tracking-wider text-white/50 mb-2">Top Agents</div>
          {d.agents.top.length === 0 && <p className="text-xs text-white/40">No commission earned yet.</p>}
          {d.agents.top.map((a, i) => <div key={i} className="flex items-center gap-2 text-sm py-0.5"><span className="text-amber-300 font-bold">#{i + 1}</span>{a.name}<span className="ml-auto font-mono-pz text-green-400">{inr(a.earned)}</span></div>)}
        </div>
      </div>
    </div>
  );
}
