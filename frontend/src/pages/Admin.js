import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Shield, Settings, Users, Banknote, ScrollText, Loader2, Save, CreditCard, Activity, Upload, Check, Trash2, KeyRound, Coins, Trophy, Eye, Facebook, LifeBuoy, UserCog } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { showPopup } from "@/components/CenterPopup";

const TABS = [
  { id: "overview", label: "Overview", icon: Shield },
  { id: "config", label: "Game Config", icon: Settings },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "tracking", label: "Pixel & Support", icon: Facebook },
  { id: "deposits", label: "Deposits", icon: Banknote },
  { id: "users", label: "Users", icon: Users },
  { id: "withdrawals", label: "Withdrawals", icon: Banknote },
  { id: "live", label: "Live", icon: Activity },
  { id: "account", label: "Account", icon: UserCog },
  { id: "logs", label: "Audit Logs", icon: ScrollText },
];

function Field({ label, value, onChange, type = "number" }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-white/40">{label}</label>
      <input type={type} value={value ?? ""} onChange={(e) => onChange(type === "number" ? parseFloat(e.target.value) : e.target.value)}
        className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-pazer-red outline-none font-mono-pz transition-colors" />
    </div>
  );
}

function ToggleRow({ label, checked, onChange, testid }) {
  return (
    <div className="flex items-center gap-3">
      <Switch checked={!!checked} onCheckedChange={onChange} data-testid={testid} className="data-[state=checked]:bg-pazer-red" />
      <span className="text-sm text-white/70">{label}</span>
    </div>
  );
}

function QrUpload({ label, url, onUploaded }) {
  const [up, setUp] = useState(false);
  const upload = async (file) => {
    if (!file) return;
    setUp(true);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("folder", "payment_qr");
      const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      onUploaded(data.url);
    } catch (e) { showPopup({ type: "warning", title: "Upload failed", message: formatApiError(e.response?.data?.detail) }); }
    finally { setUp(false); }
  };
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-white/40">{label}</label>
      <div className="mt-1 flex items-center gap-3">
        {url ? <img src={url} alt="qr" className="h-20 w-20 rounded-lg object-contain bg-white p-1" /> : <div className="h-20 w-20 rounded-lg bg-black/40 flex items-center justify-center text-white/30 text-xs">No QR</div>}
        <label className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer text-sm transition-colors">
          {up ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload QR
          <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
        </label>
      </div>
    </div>
  );
}

export default function Admin() {
  const [tab, setTab] = useState("overview");
  const [stats, setStats] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [users, setUsers] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [live, setLive] = useState(null);
  const [customRooms, setCustomRooms] = useState([]);
  const [selected, setSelected] = useState([]);
  const [bulkAmt, setBulkAmt] = useState("");
  const [logs, setLogs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState(null);
  const [rejectFor, setRejectFor] = useState(null);
  const [rejectMsg, setRejectMsg] = useState("");
  const [adjust, setAdjust] = useState(null);
  const [adjAmt, setAdjAmt] = useState("");
  const [pwUser, setPwUser] = useState(null);
  const [pw, setPw] = useState("");
  const [acc, setAcc] = useState({ new_mobile: "", new_password: "" });

  const saveAccount = async () => {
    const payload = {};
    if (acc.new_mobile.trim()) payload.new_mobile = acc.new_mobile.trim();
    if (acc.new_password.trim()) payload.new_password = acc.new_password.trim();
    if (!payload.new_mobile && !payload.new_password) return showPopup({ type: "warning", title: "Nothing to update", message: "Enter a new mobile and/or password." });
    try {
      const { data } = await api.post("/admin/account", payload);
      setAcc({ new_mobile: "", new_password: "" });
      showPopup({ type: "success", title: "Account updated", message: data.message });
    } catch (e) { showPopup({ type: "warning", title: "Failed", message: formatApiError(e.response?.data?.detail) }); }
  };

  const loadAll = useCallback(() => {
    api.get("/admin/stats").then(({ data }) => setStats(data)).catch(() => {});
    api.get("/admin/config").then(({ data }) => setCfg(data)).catch(() => {});
    api.get("/admin/users").then(({ data }) => setUsers(data)).catch(() => {});
    api.get("/admin/withdrawals").then(({ data }) => setWithdrawals(data)).catch(() => {});
    api.get("/admin/deposits").then(({ data }) => setDeposits(data)).catch(() => {});
    api.get("/admin/audit-logs").then(({ data }) => setLogs(data)).catch(() => {});
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    if (tab !== "live") return;
    const f = () => { api.get("/admin/live").then(({ data }) => setLive(data)).catch(() => {}); api.get("/admin/custom-rooms").then(({ data }) => setCustomRooms(data)).catch(() => {}); };
    f(); const i = setInterval(f, 3000); return () => clearInterval(i);
  }, [tab]);
  useEffect(() => {
    if (tab !== "deposits") return;
    const f = () => api.get("/admin/deposits").then(({ data }) => setDeposits(data)).catch(() => {});
    f(); const i = setInterval(f, 4000); return () => clearInterval(i);
  }, [tab]);

  const saveConfig = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/admin/config", { data: cfg });
      setCfg(data);
      showPopup({ type: "success", title: "Saved", message: "Configuration updated." });
    } catch (e) { showPopup({ type: "warning", title: "Save failed", message: formatApiError(e.response?.data?.detail) }); }
    finally { setSaving(false); }
  };

  const reloadUsers = () => api.get("/admin/users", { params: { search } }).then(({ data }) => setUsers(data));

  const userAction = async (uid, action) => {
    try { await api.post(`/admin/users/${uid}/action`, { action }); reloadUsers(); showPopup({ type: "success", title: "Done", message: `${action.replace(/_/g, " ")} applied.` }); }
    catch (e) { showPopup({ type: "warning", title: "Failed", message: formatApiError(e.response?.data?.detail) }); }
  };

  const withdrawalAction = async (txnId, action) => {
    try { await api.post(`/admin/withdrawals/${txnId}/action`, { action }); loadAll(); showPopup({ type: "success", title: "Done", message: `Withdrawal ${action}d.` }); }
    catch (e) { showPopup({ type: "warning", title: "Failed", message: formatApiError(e.response?.data?.detail) }); }
  };

  const depositApprove = async (reqId) => {
    try { await api.post(`/admin/deposits/${reqId}/action`, { action: "approve" }); api.get("/admin/deposits").then(({ data }) => setDeposits(data)); showPopup({ type: "success", title: "Approved", message: "Coins credited to the user's wallet." }); }
    catch (e) { showPopup({ type: "warning", title: "Failed", message: formatApiError(e.response?.data?.detail) }); }
  };
  const depositReject = async () => {
    try { await api.post(`/admin/deposits/${rejectFor}/action`, { action: "reject", problem: rejectMsg }); api.get("/admin/deposits").then(({ data }) => setDeposits(data)); setRejectFor(null); setRejectMsg(""); showPopup({ type: "success", title: "Rejected", message: "The user has been notified with your message." }); }
    catch (e) { showPopup({ type: "warning", title: "Failed", message: formatApiError(e.response?.data?.detail) }); }
  };

  const doAdjust = async (act) => {
    const amt = parseFloat(adjAmt);
    if (!amt || amt <= 0) return;
    try { await api.post(`/admin/users/${adjust.id}/wallet`, { amount: amt, action: act }); setAdjust(null); setAdjAmt(""); reloadUsers(); showPopup({ type: "success", title: "Wallet updated", message: `${act === "add" ? "Added" : "Removed"} ${amt} coins.` }); }
    catch (e) { showPopup({ type: "warning", title: "Failed", message: formatApiError(e.response?.data?.detail) }); }
  };
  const doResetPw = async () => {
    if (pw.length < 4) return showPopup({ type: "warning", title: "Too short", message: "Password must be at least 4 characters." });
    try { await api.post(`/admin/users/${pwUser.id}/reset-password`, { password: pw }); setPwUser(null); setPw(""); showPopup({ type: "success", title: "Password reset", message: "The user's password was changed." }); }
    catch (e) { showPopup({ type: "warning", title: "Failed", message: formatApiError(e.response?.data?.detail) }); }
  };
  const doDelete = async (uid) => {
    try { await api.delete(`/admin/users/${uid}`); reloadUsers(); showPopup({ type: "success", title: "Deleted", message: "User removed." }); }
    catch (e) { showPopup({ type: "warning", title: "Failed", message: formatApiError(e.response?.data?.detail) }); }
  };
  const viewDetail = async (uid) => {
    try { const { data } = await api.get(`/admin/users/${uid}`); setDetail(data); }
    catch (e) { showPopup({ type: "warning", title: "Failed", message: formatApiError(e.response?.data?.detail) }); }
  };

  const toggleSel = (id) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const nonAdmin = users.filter((u) => u.role !== "admin");
  const allSelected = nonAdmin.length > 0 && selected.length === nonAdmin.length;
  const toggleAll = () => setSelected(allSelected ? [] : nonAdmin.map((u) => u.id));
  const bulk = async (action) => {
    if (selected.length === 0) return showPopup({ type: "warning", title: "No users selected", message: "Select users first." });
    const payload = { user_ids: selected, action };
    if (action === "recharge") {
      const amt = parseFloat(bulkAmt);
      if (!amt || amt <= 0) return showPopup({ type: "warning", title: "Enter amount", message: "Enter a recharge amount." });
      payload.amount = amt;
    }
    try {
      const { data } = await api.post("/admin/users/bulk", payload);
      setSelected([]); setBulkAmt(""); reloadUsers();
      showPopup({ type: "success", title: "Done", message: data.message });
    } catch (e) { showPopup({ type: "warning", title: "Failed", message: formatApiError(e.response?.data?.detail) }); }
  };

  const updWallet = (k, v) => setCfg((c) => ({ ...c, wallet: { ...c.wallet, [k]: v } }));
  const updRoom = (k, v) => setCfg((c) => ({ ...c, room_config: { ...c.room_config, [k]: v } }));
  const updFixed = (k, v) => setCfg((c) => ({ ...c, fixed_config: { ...c.fixed_config, [k]: v } }));
  const updV1 = (k, v) => setCfg((c) => ({ ...c, room_1v1_config: { ...c.room_1v1_config, [k]: v } }));
  const updBot = (k, v) => setCfg((c) => ({ ...c, bot_config: { ...c.bot_config, [k]: v } }));
  const updStreak = (k, v) => setCfg((c) => ({ ...c, streak_config: { ...c.streak_config, [k]: v } }));
  const updLb = (k, v) => setCfg((c) => ({ ...c, leaderboard_config: { ...c.leaderboard_config, [k]: v } }));
  const updRef = (k, v) => setCfg((c) => ({ ...c, referral_config: { ...c.referral_config, [k]: v } }));
  const updUpi = (k, v) => setCfg((c) => ({ ...c, payment_config: { ...c.payment_config, upi: { ...c.payment_config.upi, [k]: v } } }));
  const updUsdt = (k, v) => setCfg((c) => ({ ...c, payment_config: { ...c.payment_config, usdt: { ...c.payment_config.usdt, [k]: v } } }));
  const updMeta = (k, v) => setCfg((c) => ({ ...c, meta_pixel: { ...c.meta_pixel, [k]: v } }));
  const updMetaEvent = (k, v) => setCfg((c) => ({ ...c, meta_pixel: { ...c.meta_pixel, events: { ...c.meta_pixel.events, [k]: v } } }));
  const updSupport = (k, v) => setCfg((c) => ({ ...c, support_config: { ...c.support_config, [k]: v } }));
  const updGame = (key, k, v) => setCfg((c) => ({ ...c, [key]: { ...c[key], [k]: v } }));
  const updMode = (mode, k, v) => setCfg((c) => ({ ...c, chicken_config: { ...c.chicken_config, modes: { ...c.chicken_config.modes, [mode]: { ...c.chicken_config.modes[mode], [k]: v } } } }));
  const csv = (v) => String(v).split(",").map((x) => parseFloat(x.trim())).filter((x) => !isNaN(x));

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-8 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="h-6 w-6 text-pazer-red" />
        <h1 className="font-display font-bold text-3xl tracking-tight">Admin Panel</h1>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-black/40 border border-white/10 flex-wrap h-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id} data-testid={`admin-tab-${t.id}`} className="data-[state=active]:bg-pazer-red data-[state=active]:text-white gap-2">
              <t.icon className="h-4 w-4" /> {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {stats && [
              ["Total Users", stats.total_users], ["Total Games", stats.total_games], ["Active Rooms", stats.active_rooms],
              ["Deposits", stats.total_deposits], ["Prizes Paid", stats.total_prizes_paid],
            ].map(([l, v]) => (
              <motion.div key={l} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl pz-glass p-5">
                <div className="font-mono-pz text-3xl font-bold text-pazer-red">{v?.toLocaleString?.() ?? v}</div>
                <div className="text-xs text-white/40 uppercase tracking-wider mt-1">{l}</div>
              </motion.div>
            ))}
          </div>
        </TabsContent>

        {/* CONFIG */}
        <TabsContent value="config" className="mt-6">
          {cfg && (
            <div className="space-y-6">
              <div className="rounded-2xl pz-glass p-6 flex flex-wrap items-center gap-6">
                <ToggleRow label="Games Enabled" checked={cfg.game_enabled} onChange={(v) => setCfg({ ...cfg, game_enabled: v })} testid="toggle-game" />
                <ToggleRow label="Deposit Bonus" checked={cfg.wallet.bonus_enabled} onChange={(v) => updWallet("bonus_enabled", v)} testid="toggle-bonus" />
              </div>
              <div className="rounded-2xl pz-glass p-6">
                <h3 className="font-display font-bold text-lg mb-4">Wallet Settings</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Field label="Min Deposit ₹" value={cfg.wallet.min_deposit} onChange={(v) => updWallet("min_deposit", v)} />
                  <Field label="Max Deposit ₹" value={cfg.wallet.max_deposit} onChange={(v) => updWallet("max_deposit", v)} />
                  <Field label="Bonus %" value={cfg.wallet.bonus_percentage} onChange={(v) => updWallet("bonus_percentage", v)} />
                  <Field label="Max Bonus" value={cfg.wallet.max_bonus} onChange={(v) => updWallet("max_bonus", v)} />
                  <Field label="Min Withdrawal" value={cfg.wallet.min_withdrawal} onChange={(v) => updWallet("min_withdrawal", v)} />
                  <Field label="Max Withdrawal" value={cfg.wallet.max_withdrawal} onChange={(v) => updWallet("max_withdrawal", v)} />
                  <Field label="Min USDT Deposit" value={cfg.wallet.min_usdt_deposit} onChange={(v) => updWallet("min_usdt_deposit", v)} />
                  <Field label="Min USDT Withdrawal" value={cfg.wallet.min_usdt_withdrawal} onChange={(v) => updWallet("min_usdt_withdrawal", v)} />
                </div>
              </div>
              <div className="rounded-2xl pz-glass p-6">
                <h3 className="font-display font-bold text-lg mb-4">Fixed Challenge (Home)</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Field label="Min Bet" value={cfg.fixed_config.min_bet} onChange={(v) => updFixed("min_bet", v)} />
                  <Field label="Max Bet" value={cfg.fixed_config.max_bet} onChange={(v) => updFixed("max_bet", v)} />
                  <Field label="Win Multiplier" value={cfg.fixed_config.win_multiplier} onChange={(v) => updFixed("win_multiplier", v)} />
                  <div className="flex items-end"><ToggleRow label="Enabled" checked={cfg.fixed_config.enabled} onChange={(v) => updFixed("enabled", v)} /></div>
                  <div className="col-span-2 md:col-span-4"><Field label="Target Times (CSV seconds)" type="text" value={(cfg.fixed_config.targets || []).join(",")} onChange={(v) => updFixed("targets", csv(v))} /></div>
                </div>
              </div>
              <div className="rounded-2xl pz-glass p-6">
                <h3 className="font-display font-bold text-lg mb-1">1v1 Duel</h3>
                <p className="text-xs text-white/40 mb-4">Durations are fixed at 5s, 10s, 15s. Set the entry-fee variants below — one room is auto-created per duration × fee.</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Field label="Win Multiplier" value={cfg.room_1v1_config.win_multiplier} onChange={(v) => updV1("win_multiplier", v)} />
                  <div className="flex items-end"><ToggleRow label="Enabled" checked={cfg.room_1v1_config.enabled} onChange={(v) => updV1("enabled", v)} /></div>
                  <div className="col-span-2 md:col-span-3"><Field label="Entry Fee Variants (CSV coins)" type="text" value={(cfg.room_1v1_config.entry_fees || []).join(", ")} onChange={(v) => updV1("entry_fees", csv(v))} /></div>
                </div>
              </div>
              <div className="rounded-2xl pz-glass p-6">
                <h3 className="font-display font-bold text-lg mb-1">Multiplayer Rooms</h3>
                <p className="text-xs text-white/40 mb-4">Durations fixed at 5s, 10s, 15s. Set entry-fee variants — one room per duration × fee.</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Field label="Min Players" value={cfg.room_config.min_players} onChange={(v) => updRoom("min_players", v)} />
                  <Field label="Max Players" value={cfg.room_config.max_players} onChange={(v) => updRoom("max_players", v)} />
                  <Field label="Platform Fee %" value={cfg.room_config.platform_fee_percent} onChange={(v) => updRoom("platform_fee_percent", v)} />
                  <div className="col-span-2 md:col-span-4"><Field label="Entry Fee Variants (CSV coins)" type="text" value={(cfg.room_config.entry_fees || []).join(", ")} onChange={(v) => updRoom("entry_fees", csv(v))} /></div>
                </div>
              </div>
              {cfg.vortex_config && (
                <div className="rounded-2xl pz-glass p-6" data-testid="admin-vortex-config">
                  <h3 className="font-display font-bold text-lg mb-1">Vortex Spin</h3>
                  <p className="text-xs text-white/40 mb-4">Provably fair. Break slots per stage are set as CSV, one list per element (out of the segment count).</p>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <Field label="Min Bet" value={cfg.vortex_config.min_bet} onChange={(v) => updGame("vortex_config", "min_bet", v)} />
                    <Field label="Max Bet" value={cfg.vortex_config.max_bet} onChange={(v) => updGame("vortex_config", "max_bet", v)} />
                    <Field label="House Edge %" value={cfg.vortex_config.house_edge_percent} onChange={(v) => updGame("vortex_config", "house_edge_percent", v)} />
                    <Field label="Partial Collect %" value={cfg.vortex_config.partial_collect_percent} onChange={(v) => updGame("vortex_config", "partial_collect_percent", v)} />
                    <div className="flex items-end"><ToggleRow label="Enabled" checked={cfg.vortex_config.enabled} onChange={(v) => updGame("vortex_config", "enabled", v)} testid="toggle-vortex" /></div>
                    {Object.keys(cfg.vortex_config.themes || {}).map((k) => (
                      <div key={k} className="col-span-2 md:col-span-5"><Field label={`${k} break slots per stage (CSV)`} type="text" value={(cfg.vortex_config.themes[k].lose || []).join(",")}
                        onChange={(v) => setCfg((c) => ({ ...c, vortex_config: { ...c.vortex_config, themes: { ...c.vortex_config.themes, [k]: { ...c.vortex_config.themes[k], lose: csv(v).map((x) => Math.round(x)) } } } }))} /></div>
                    ))}
                  </div>
                </div>
              )}
              {cfg.chicken_config && (
                <div className="rounded-2xl pz-glass p-6" data-testid="admin-chicken-config">
                  <h3 className="font-display font-bold text-lg mb-1">Chicken Quest</h3>
                  <p className="text-xs text-white/40 mb-4">Provably fair. Trap chance is per lane (0–1).</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Field label="Min Bet" value={cfg.chicken_config.min_bet} onChange={(v) => updGame("chicken_config", "min_bet", v)} />
                    <Field label="Max Bet" value={cfg.chicken_config.max_bet} onChange={(v) => updGame("chicken_config", "max_bet", v)} />
                    <Field label="House Edge %" value={cfg.chicken_config.house_edge_percent} onChange={(v) => updGame("chicken_config", "house_edge_percent", v)} />
                    <div className="flex items-end"><ToggleRow label="Enabled" checked={cfg.chicken_config.enabled} onChange={(v) => updGame("chicken_config", "enabled", v)} testid="toggle-chicken" /></div>
                    {Object.entries(cfg.chicken_config.modes || {}).map(([k, m]) => (
                      <div key={k} className="col-span-2 grid grid-cols-2 gap-2">
                        <Field label={`${k} lanes`} value={m.steps} onChange={(v) => updMode(k, "steps", v)} />
                        <Field label={`${k} trap chance`} value={m.hazard} onChange={(v) => updMode(k, "hazard", v)} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {cfg.stack_config && (
                <div className="rounded-2xl pz-glass p-6" data-testid="admin-stack-config">
                  <h3 className="font-display font-bold text-lg mb-1">Tower Stack</h3>
                  <p className="text-xs text-white/40 mb-4">Skill game. Endless payout = height × per-level + perfects × per-perfect. Versus rooms: one per entry fee × room size.</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Field label="Min Bet" value={cfg.stack_config.min_bet} onChange={(v) => updGame("stack_config", "min_bet", v)} />
                    <Field label="Max Bet" value={cfg.stack_config.max_bet} onChange={(v) => updGame("stack_config", "max_bet", v)} />
                    <Field label="Min Height" value={cfg.stack_config.min_height} onChange={(v) => updGame("stack_config", "min_height", v)} />
                    <Field label="Per Level ×" value={cfg.stack_config.per_level} onChange={(v) => updGame("stack_config", "per_level", v)} />
                    <Field label="Per Perfect ×" value={cfg.stack_config.per_perfect} onChange={(v) => updGame("stack_config", "per_perfect", v)} />
                    <Field label="Max Multiplier" value={cfg.stack_config.max_multiplier} onChange={(v) => updGame("stack_config", "max_multiplier", v)} />
                    <Field label="Base Speed" value={cfg.stack_config.base_speed} onChange={(v) => updGame("stack_config", "base_speed", v)} />
                    <Field label="Max Speed" value={cfg.stack_config.max_speed} onChange={(v) => updGame("stack_config", "max_speed", v)} />
                    <Field label="Perfect Tolerance" value={cfg.stack_config.perfect_tolerance} onChange={(v) => updGame("stack_config", "perfect_tolerance", v)} />
                    <Field label="Versus Platform Fee %" value={cfg.stack_config.mp_platform_fee_percent} onChange={(v) => updGame("stack_config", "mp_platform_fee_percent", v)} />
                    <Field label="Versus Play Window (s)" value={cfg.stack_config.mp_play_window_seconds} onChange={(v) => updGame("stack_config", "mp_play_window_seconds", v)} />
                    <Field label="Bot Fill After (s)" value={cfg.stack_config.mp_bot_fill_seconds} onChange={(v) => updGame("stack_config", "mp_bot_fill_seconds", v)} />
                    <div className="col-span-2"><Field label="Versus Entry Fees (CSV)" type="text" value={(cfg.stack_config.mp_entry_fees || []).join(",")} onChange={(v) => updGame("stack_config", "mp_entry_fees", csv(v))} /></div>
                    <div className="col-span-2"><Field label="Versus Room Sizes (CSV, 2-4)" type="text" value={(cfg.stack_config.mp_sizes || []).join(",")} onChange={(v) => updGame("stack_config", "mp_sizes", csv(v).map((x) => Math.max(2, Math.min(4, Math.round(x)))))} /></div>
                    <div className="flex items-end"><ToggleRow label="Enabled" checked={cfg.stack_config.enabled} onChange={(v) => updGame("stack_config", "enabled", v)} testid="toggle-stack" /></div>
                    <div className="flex items-end"><ToggleRow label="Versus Enabled" checked={cfg.stack_config.mp_enabled} onChange={(v) => updGame("stack_config", "mp_enabled", v)} /></div>
                  </div>
                </div>
              )}
              <div className="rounded-2xl pz-glass p-6">
                <h3 className="font-display font-bold text-lg mb-4">Bots</h3>
                <div className="flex flex-wrap items-center gap-6 mb-4">
                  <ToggleRow label="Bots Enabled" checked={cfg.bot_config?.enabled} onChange={(v) => updBot("enabled", v)} testid="toggle-bots" />
                  <ToggleRow label="Fill 1v1" checked={cfg.bot_config?.fill_1v1} onChange={(v) => updBot("fill_1v1", v)} />
                  <ToggleRow label="Fill Multiplayer" checked={cfg.bot_config?.fill_multiplayer} onChange={(v) => updBot("fill_multiplayer", v)} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Field label="Join Delay (s)" value={cfg.bot_config?.join_delay_seconds} onChange={(v) => updBot("join_delay_seconds", v)} />
                  <Field label="Error Range (s)" value={cfg.bot_config?.error_range} onChange={(v) => updBot("error_range", v)} />
                </div>
              </div>
              <div className="rounded-2xl pz-glass p-6">
                <h3 className="font-display font-bold text-lg mb-4">Referral Program</h3>
                <div className="flex flex-wrap items-center gap-6 mb-4">
                  <ToggleRow label="Enabled" checked={cfg.referral_config?.enabled} onChange={(v) => updRef("enabled", v)} testid="toggle-referral" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Field label="Signup Bonus (both)" value={cfg.referral_config?.signup_bonus} onChange={(v) => updRef("signup_bonus", v)} />
                  <Field label="Loss Commission %" value={cfg.referral_config?.loss_commission_percent} onChange={(v) => updRef("loss_commission_percent", v)} />
                  <Field label="Win Commission %" value={cfg.referral_config?.win_commission_percent} onChange={(v) => updRef("win_commission_percent", v)} />
                </div>
              </div>
              <div className="rounded-2xl pz-glass p-6">
                <h3 className="font-display font-bold text-lg mb-4">Daily Streak &amp; Leaderboard</h3>
                <div className="flex flex-wrap items-center gap-6 mb-4">
                  <ToggleRow label="Streak Enabled" checked={cfg.streak_config?.enabled} onChange={(v) => updStreak("enabled", v)} />
                  <div className="w-40"><Field label="Daily Bonus" value={cfg.streak_config?.daily_bonus} onChange={(v) => updStreak("daily_bonus", v)} /></div>
                  <ToggleRow label="Leaderboard Auto" checked={cfg.leaderboard_config?.auto_generate} onChange={(v) => updLb("auto_generate", v)} />
                </div>
                <Field label="Name Pool (comma separated)" type="text" value={(cfg.leaderboard_config?.name_pool || []).join(", ")}
                  onChange={(v) => updLb("name_pool", String(v).split(",").map((x) => x.trim()).filter(Boolean))} />
              </div>
              <button onClick={saveConfig} disabled={saving} data-testid="save-config-btn"
                className="flex items-center gap-2 px-8 py-3 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Configuration
              </button>
            </div>
          )}
        </TabsContent>

        {/* PAYMENTS */}
        <TabsContent value="payments" className="mt-6">
          {cfg && (
            <div className="space-y-6">
              <div className="rounded-2xl pz-glass p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display font-bold text-lg">UPI Recharge</h3>
                  <ToggleRow label="Enabled" checked={cfg.payment_config?.upi?.enabled} onChange={(v) => updUpi("enabled", v)} testid="toggle-upi" />
                </div>
                <div className="space-y-4">
                  <QrUpload label="UPI QR Image" url={cfg.payment_config?.upi?.qr_url} onUploaded={(u) => updUpi("qr_url", u)} />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Field label="UPI ID" type="text" value={cfg.payment_config?.upi?.upi_id} onChange={(v) => updUpi("upi_id", v)} />
                    <Field label="Name (above QR)" type="text" value={cfg.payment_config?.upi?.name} onChange={(v) => updUpi("name", v)} />
                    <Field label="Use-UPI-ID above ₹" value={cfg.payment_config?.upi?.upi_id_threshold} onChange={(v) => updUpi("upi_id_threshold", v)} />
                  </div>
                  <Field label="Instruction Note" type="text" value={cfg.payment_config?.upi?.note} onChange={(v) => updUpi("note", v)} />
                </div>
              </div>
              <div className="rounded-2xl pz-glass p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display font-bold text-lg">USDT Recharge (TRC20)</h3>
                  <ToggleRow label="Enabled" checked={cfg.payment_config?.usdt?.enabled} onChange={(v) => updUsdt("enabled", v)} testid="toggle-usdt" />
                </div>
                <div className="space-y-4">
                  <QrUpload label="USDT QR Image" url={cfg.payment_config?.usdt?.qr_url} onUploaded={(u) => updUsdt("qr_url", u)} />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2"><Field label="TRC20 Wallet Address" type="text" value={cfg.payment_config?.usdt?.wallet_address} onChange={(v) => updUsdt("wallet_address", v)} /></div>
                    <Field label="Rate (coins per USDT)" value={cfg.payment_config?.usdt?.rate} onChange={(v) => updUsdt("rate", v)} />
                  </div>
                  <Field label="Instruction Note" type="text" value={cfg.payment_config?.usdt?.note} onChange={(v) => updUsdt("note", v)} />
                </div>
              </div>
              <button onClick={saveConfig} disabled={saving} data-testid="save-payments-btn"
                className="flex items-center gap-2 px-8 py-3 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Payment Settings
              </button>
            </div>
          )}
        </TabsContent>

        {/* PIXEL & SUPPORT */}
        <TabsContent value="tracking" className="mt-6">
          {cfg && (
            <div className="space-y-6">
              <div className="rounded-2xl pz-glass p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display font-bold text-lg flex items-center gap-2"><Facebook className="h-5 w-5 text-pazer-red" />Meta Pixel</h3>
                  <ToggleRow label="Enabled" checked={cfg.meta_pixel?.enabled} onChange={(v) => updMeta("enabled", v)} testid="toggle-pixel" />
                </div>
                <p className="text-xs text-white/40 mb-4">If your Meta ad account gets banned, just paste a NEW Pixel ID (or full custom snippet) from your new account here — no code changes needed.</p>
                <div className="space-y-4">
                  <Field label="Pixel ID" type="text" value={cfg.meta_pixel?.pixel_id} onChange={(v) => updMeta("pixel_id", v)} />
                  <div>
                    <label className="text-xs uppercase tracking-wider text-white/40">Custom Head Code (optional — overrides Pixel ID)</label>
                    <textarea value={cfg.meta_pixel?.custom_head_code || ""} onChange={(e) => updMeta("custom_head_code", e.target.value)} rows={5} data-testid="pixel-custom-code"
                      placeholder="Paste a full <script>...</script> pixel snippet here to fully replace the default" 
                      className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono-pz focus:border-pazer-red outline-none" />
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-white/40 mb-2">Event Mapping (fbq event fired on each action)</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Field label="On Register" type="text" value={cfg.meta_pixel?.events?.register} onChange={(v) => updMetaEvent("register", v)} />
                      <Field label="On Deposit" type="text" value={cfg.meta_pixel?.events?.deposit} onChange={(v) => updMetaEvent("deposit", v)} />
                      <Field label="On Game Play" type="text" value={cfg.meta_pixel?.events?.game_play} onChange={(v) => updMetaEvent("game_play", v)} />
                      <Field label="On Win" type="text" value={cfg.meta_pixel?.events?.win} onChange={(v) => updMetaEvent("win", v)} />
                    </div>
                    <p className="text-[11px] text-white/30 mt-2">Leave an event blank to not fire it. Standard values: CompleteRegistration, Purchase, Lead, or your own custom names.</p>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl pz-glass p-6">
                <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2"><LifeBuoy className="h-5 w-5 text-pazer-red" />Support &amp; Forgot Password (Telegram)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Support Telegram URL" type="text" value={cfg.support_config?.telegram_url} onChange={(v) => updSupport("telegram_url", v)} />
                  <Field label="Forgot-Password Telegram URL" type="text" value={cfg.support_config?.forgot_password_url} onChange={(v) => updSupport("forgot_password_url", v)} />
                </div>
              </div>
              <button onClick={saveConfig} disabled={saving} data-testid="save-tracking-btn"
                className="flex items-center gap-2 px-8 py-3 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Pixel &amp; Support
              </button>
            </div>
          )}
        </TabsContent>

        {/* DEPOSITS */}
        <TabsContent value="deposits" className="mt-6">
          <div className="rounded-2xl pz-glass p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-white/40 text-xs uppercase border-b border-white/10">
                <th className="text-left py-3">User</th><th className="text-left py-3">Method</th><th className="text-right py-3">Amount</th><th className="text-right py-3">Coins</th><th className="text-center py-3">Proof</th><th className="text-left py-3">Status</th><th className="text-right py-3">Action</th>
              </tr></thead>
              <tbody>
                {deposits.map((d) => (
                  <tr key={d.req_id} className="border-b border-white/5" data-testid="deposit-row">
                    <td className="py-3"><div className="font-medium">{d.display_name || d.username}</div><div className="text-xs text-white/40">{d.mobile}</div></td>
                    <td className="py-3 uppercase text-white/60">{d.method}</td>
                    <td className="py-3 text-right font-mono-pz">{d.amount_label}</td>
                    <td className="py-3 text-right font-mono-pz text-green-400">+{d.coins}</td>
                    <td className="py-3 text-center">{d.screenshot_url ? <a href={d.screenshot_url} target="_blank" rel="noreferrer"><img src={d.screenshot_url} alt="proof" className="h-10 w-10 rounded object-cover inline-block hover:scale-110 transition-transform" /></a> : "—"}</td>
                    <td className="py-3"><span className={d.status === "pending" ? "text-yellow-400" : d.status === "approved" ? "text-green-400" : "text-pazer-red"}>{d.status}</span></td>
                    <td className="py-3 text-right">
                      {d.status === "pending" ? (
                        <div className="flex gap-1.5 justify-end">
                          <button onClick={() => depositApprove(d.req_id)} data-testid={`approve-deposit-${d.req_id}`} className="text-xs px-2 py-1 rounded bg-green-400/10 text-green-400 hover:bg-green-400/20 transition-colors">Approve</button>
                          <button onClick={() => { setRejectFor(d.req_id); setRejectMsg(""); }} className="text-xs px-2 py-1 rounded bg-pazer-red/10 text-pazer-red hover:bg-pazer-red/20 transition-colors">Reject</button>
                        </div>
                      ) : <span className="text-white/30 text-xs">—</span>}
                    </td>
                  </tr>
                ))}
                {deposits.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-white/40">No recharge requests.</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* USERS */}
        <TabsContent value="users" className="mt-6">
          <div className="flex gap-2 mb-4">
            <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && reloadUsers()} placeholder="Search name or mobile" data-testid="user-search"
              className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:border-pazer-red outline-none transition-colors" />
            <button onClick={reloadUsers} className="px-5 py-2.5 rounded-lg bg-pazer-red hover:bg-pazer-redhover font-bold text-sm transition-colors">Search</button>
          </div>
          {selected.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-3 rounded-xl bg-pazer-red/10 border border-pazer-red/30 px-4 py-2.5" data-testid="bulk-bar">
              <span className="text-sm font-semibold">{selected.length} selected</span>
              <input type="number" value={bulkAmt} onChange={(e) => setBulkAmt(e.target.value)} placeholder="Coins" data-testid="bulk-amount"
                className="w-28 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm font-mono-pz focus:border-pazer-red outline-none" />
              <button onClick={() => bulk("recharge")} data-testid="bulk-recharge" className="text-xs px-3 py-1.5 rounded-full bg-green-500 hover:bg-green-400 font-bold transition-colors">Recharge all</button>
              <button onClick={() => bulk("suspend")} className="text-xs px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 font-bold transition-colors">Suspend</button>
              <button onClick={() => bulk("delete")} data-testid="bulk-delete" className="text-xs px-3 py-1.5 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors">Delete all</button>
              <button onClick={() => setSelected([])} className="text-xs text-white/50 ml-auto">Clear</button>
            </div>
          )}
          <div className="rounded-2xl pz-glass p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-white/40 text-xs uppercase border-b border-white/10">
                <th className="py-3 pl-1"><input type="checkbox" checked={allSelected} onChange={toggleAll} data-testid="select-all" /></th>
                <th className="text-left py-3">User</th><th className="text-left py-3">Balance</th><th className="text-left py-3">Played/Won</th><th className="text-left py-3">Status</th><th className="text-right py-3">Actions</th>
              </tr></thead>
              <tbody>
                {nonAdmin.map((u) => (
                  <tr key={u.id} className="border-b border-white/5" data-testid="admin-user-row">
                    <td className="py-3 pl-1"><input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggleSel(u.id)} data-testid={`select-${u.id}`} /></td>
                    <td className="py-3"><div className="font-medium">{u.display_name || u.username}</div><div className="text-xs text-white/40">{u.mobile}</div>{u.force_win && <span className="text-[10px] text-yellow-400">★ next-win set</span>}</td>
                    <td className="py-3 font-mono-pz">{((u.main_balance || 0) + (u.bonus_balance || 0)).toLocaleString()}</td>
                    <td className="py-3 font-mono-pz text-white/60">{u.stats?.games_played || 0}/{u.stats?.games_won || 0}</td>
                    <td className="py-3"><span className={u.status === "suspended" ? "text-pazer-red" : "text-green-400"}>{u.status}</span></td>
                    <td className="py-3">
                      <div className="flex gap-1.5 justify-end flex-wrap">
                        <button onClick={() => viewDetail(u.id)} title="Details" className="text-xs p-1.5 rounded bg-white/5 hover:bg-white/10 transition-colors"><Eye className="h-3.5 w-3.5" /></button>
                        <button onClick={() => { setAdjust(u); setAdjAmt(""); }} data-testid={`adjust-${u.id}`} title="Wallet" className="text-xs p-1.5 rounded bg-white/5 hover:bg-white/10 transition-colors"><Coins className="h-3.5 w-3.5" /></button>
                        <button onClick={() => { setPwUser(u); setPw(""); }} title="Reset password" className="text-xs p-1.5 rounded bg-white/5 hover:bg-white/10 transition-colors"><KeyRound className="h-3.5 w-3.5" /></button>
                        {u.force_win
                          ? <button onClick={() => userAction(u.id, "cancel_force_win")} className="text-xs px-2 py-1 rounded bg-yellow-400/20 text-yellow-400 transition-colors">Cancel Win</button>
                          : <button onClick={() => userAction(u.id, "force_win")} data-testid={`forcewin-${u.id}`} className="text-xs px-2 py-1 rounded bg-yellow-400/10 text-yellow-400 hover:bg-yellow-400/20 transition-colors flex items-center gap-1"><Trophy className="h-3 w-3" />Let Win</button>}
                        {u.status === "suspended"
                          ? <button onClick={() => userAction(u.id, "reactivate")} className="text-xs px-2 py-1 rounded bg-green-400/10 text-green-400 hover:bg-green-400/20 transition-colors">Reactivate</button>
                          : <button onClick={() => userAction(u.id, "suspend")} className="text-xs px-2 py-1 rounded bg-pazer-red/10 text-pazer-red hover:bg-pazer-red/20 transition-colors">Suspend</button>}
                        {u.kyc_status !== "verified" && <button onClick={() => userAction(u.id, "verify_kyc")} className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 transition-colors">Verify KYC</button>}
                        <button onClick={() => doDelete(u.id)} title="Delete" className="text-xs p-1.5 rounded bg-pazer-red/10 text-pazer-red hover:bg-pazer-red/20 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {nonAdmin.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-white/40">No users.</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* WITHDRAWALS */}
        <TabsContent value="withdrawals" className="mt-6">
          <div className="space-y-3">
            {withdrawals.map((w) => {
              const k = w.kyc_data || {};
              const method = k.method || w.meta?.method || "—";
              return (
                <div key={w.id} className="rounded-2xl pz-glass p-4" data-testid="withdrawal-row">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="font-semibold">{w.user_name || "User"} <span className="text-white/40 text-sm font-mono-pz">{w.user_mobile || ""}</span></div>
                      <div className="text-xs text-white/40 font-mono-pz">{w.txn_id}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono-pz font-bold text-xl text-pazer-red">{Math.abs(w.amount).toLocaleString()} coins</div>
                      <span className={`text-xs ${w.status === "pending" ? "text-yellow-400" : w.status === "success" ? "text-green-400" : "text-white/40"}`}>{w.status}</span>
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg bg-black/40 p-3 text-xs">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="uppercase tracking-wider text-white/40">KYC</span>
                      <span className={`px-2 py-0.5 rounded-full ${w.kyc_status === "verified" ? "bg-green-400/10 text-green-400" : "bg-yellow-400/10 text-yellow-400"}`}>{w.kyc_status || "not submitted"}</span>
                      <span className="text-white/40">· Payout via <b className="text-white/70 uppercase">{method}</b></span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {k.account_name && <KV l="Name" v={k.account_name || k.upi_name} />}
                      {method === "upi" && <KV l="UPI ID" v={k.upi_id} />}
                      {method === "bank" && <><KV l="Account" v={k.account_number} /><KV l="IFSC" v={k.ifsc} /><KV l="Bank" v={k.bank_name} /></>}
                      {method === "usdt" && <><KV l="USDT Wallet" v={k.usdt_wallet_address} /><KV l="Network" v={k.usdt_network} /></>}
                    </div>
                    {method === "usdt" && k.usdt_qr_url && <img src={k.usdt_qr_url} alt="usdt qr" className="mt-2 h-20 rounded bg-white p-1" />}
                  </div>
                  {w.status === "pending" && (
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => withdrawalAction(w.txn_id, "approve")} data-testid={`wd-approve-${w.txn_id}`} className="flex-1 py-2 rounded-full bg-green-500 hover:bg-green-400 font-bold text-sm transition-colors">Approve &amp; Pay</button>
                      <button onClick={() => withdrawalAction(w.txn_id, "reject")} className="flex-1 py-2 rounded-full bg-pazer-red/80 hover:bg-pazer-red font-bold text-sm transition-colors">Reject &amp; Refund</button>
                    </div>
                  )}
                </div>
              );
            })}
            {withdrawals.length === 0 && <p className="text-center py-10 text-white/40 rounded-2xl pz-glass">No withdrawal requests.</p>}
          </div>
        </TabsContent>

        {/* LIVE */}
        <TabsContent value="live" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl pz-glass p-5">
              <h3 className="font-display font-bold text-lg mb-3">Now Playing (Fixed)</h3>
              <div className="space-y-2">
                {live?.active_sessions?.map((s) => (
                  <div key={s.id} className="flex justify-between items-center bg-black/40 rounded-lg px-4 py-2.5 text-sm gap-2">
                    <span className="font-medium truncate">{s.player}</span>
                    <span className="font-mono-pz text-white/60 whitespace-nowrap">bet {s.entry_fee} · {s.target}s</span>
                    {s.force_win
                      ? <span className="text-[10px] px-2 py-1 rounded bg-yellow-400/20 text-yellow-400 whitespace-nowrap">★ will win</span>
                      : <button onClick={() => userAction(s.user_id, "force_win")} data-testid={`live-letwin-${s.user_id}`}
                          className="text-[10px] px-2 py-1 rounded bg-yellow-400/10 text-yellow-400 hover:bg-yellow-400/20 transition-colors flex items-center gap-1 whitespace-nowrap"><Trophy className="h-3 w-3" />Let Win</button>}
                  </div>
                ))}
                {(!live?.active_sessions || live.active_sessions.length === 0) && <p className="text-white/40 text-sm py-6 text-center">Nobody playing right now.</p>}
              </div>
            </div>
            <div className="rounded-2xl pz-glass p-5">
              <h3 className="font-display font-bold text-lg mb-3">Active Rooms</h3>
              <div className="space-y-2">
                {live?.rooms?.map((r) => (
                  <div key={r.id} className="flex justify-between items-center bg-black/40 rounded-lg px-4 py-2.5 text-sm">
                    <span>{r.target}s {r.mode}{r.is_custom ? " (custom)" : ""}</span>
                    <span className="font-mono-pz text-white/60">{r.current_players}/{r.max_players} · {r.status}</span>
                  </div>
                ))}
                {(!live?.rooms || live.rooms.length === 0) && <p className="text-white/40 text-sm py-6 text-center">No active rooms.</p>}
              </div>
            </div>
          </div>
          <div className="rounded-2xl pz-glass p-5 mt-4">
            <h3 className="font-display font-bold text-lg mb-3">Play with Friends (Custom Rooms)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-white/40 text-xs uppercase border-b border-white/10">
                  <th className="text-left py-2">Code</th><th className="text-left py-2">Host</th><th className="text-left py-2">Mode</th><th className="text-right py-2">Entry</th><th className="text-right py-2">Players</th><th className="text-left py-2">Status</th><th className="text-left py-2">Winner</th>
                </tr></thead>
                <tbody data-testid="admin-custom-rooms">
                  {customRooms.map((r) => (
                    <tr key={r.id} className="border-b border-white/5">
                      <td className="py-2 font-mono-pz">{r.room_code}</td>
                      <td className="py-2">{r.host_name || "—"}</td>
                      <td className="py-2">{r.mode}</td>
                      <td className="py-2 text-right font-mono-pz">{r.entry_fee}</td>
                      <td className="py-2 text-right font-mono-pz">{r.current_players}/{r.max_players}</td>
                      <td className="py-2">{r.status}</td>
                      <td className="py-2 text-pazer-red">{r.winner || "—"}</td>
                    </tr>
                  ))}
                  {customRooms.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-white/40">No custom rooms yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ACCOUNT */}
        <TabsContent value="account" className="mt-6">
          <div className="max-w-md rounded-2xl pz-glass p-6 space-y-4">
            <h3 className="font-display font-bold text-lg flex items-center gap-2"><UserCog className="h-5 w-5 text-pazer-red" />Admin Account</h3>
            <p className="text-xs text-white/40">Change the admin login mobile number and/or password. Leave a field blank to keep it unchanged.</p>
            <div>
              <label className="text-xs uppercase tracking-wider text-white/40">New Mobile Number</label>
              <input value={acc.new_mobile} onChange={(e) => setAcc({ ...acc, new_mobile: e.target.value.replace(/\D/g, "") })} data-testid="admin-new-mobile"
                placeholder="New admin mobile" className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 font-mono-pz focus:border-pazer-red outline-none" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-white/40">New Password</label>
              <input value={acc.new_password} onChange={(e) => setAcc({ ...acc, new_password: e.target.value })} data-testid="admin-new-password"
                placeholder="New admin password" className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 focus:border-pazer-red outline-none" />
            </div>
            <button onClick={saveAccount} data-testid="save-account-btn"
              className="w-full py-3 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors flex items-center justify-center gap-2">
              <Save className="h-4 w-4" /> Update Admin Account
            </button>
            <div className="pt-4 border-t border-white/10">
              <button onClick={async () => { try { const { data } = await api.post("/admin/cleanup-test-accounts"); reloadUsers(); showPopup({ type: "success", title: "Cleaned", message: data.message }); } catch (e) { showPopup({ type: "warning", title: "Failed", message: formatApiError(e.response?.data?.detail) }); } }}
                data-testid="cleanup-test-btn" className="w-full py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-sm font-semibold transition-colors">Remove Test Accounts</button>
              <p className="text-[11px] text-white/30 mt-2 text-center">Deletes accounts whose name starts with "test".</p>
            </div>
          </div>
        </TabsContent>

        {/* LOGS */}
        <TabsContent value="logs" className="mt-6">
          <div className="rounded-2xl pz-glass p-4">
            {logs.map((l) => (
              <div key={l.id} className="flex items-center justify-between py-2.5 border-b border-white/5 text-sm">
                <span className="font-mono-pz text-pazer-red">{l.action}</span>
                <span className="text-white/40 text-xs">{new Date(l.created_at).toLocaleString()}</span>
              </div>
            ))}
            {logs.length === 0 && <p className="text-center py-10 text-white/40">No logs.</p>}
          </div>
        </TabsContent>
      </Tabs>

      {/* Reject deposit dialog */}
      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent className="bg-pazer-card border-white/10 text-white">
          <DialogHeader><DialogTitle className="font-display">Reject Payment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-white/50">Describe the problem — the user will see this and can re-upload.</p>
            <textarea value={rejectMsg} onChange={(e) => setRejectMsg(e.target.value)} rows={3} data-testid="reject-message"
              placeholder="e.g. Screenshot unclear / amount mismatch / payment not received"
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:border-pazer-red outline-none" />
            <button onClick={depositReject} data-testid="confirm-reject" className="w-full py-2.5 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors">Send Rejection</button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Wallet adjust dialog */}
      <Dialog open={!!adjust} onOpenChange={(o) => !o && setAdjust(null)}>
        <DialogContent className="bg-pazer-card border-white/10 text-white">
          <DialogHeader><DialogTitle className="font-display">Adjust Wallet — {adjust?.display_name || adjust?.username}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-white/50">Current: {((adjust?.main_balance || 0) + (adjust?.bonus_balance || 0)).toLocaleString()} coins</div>
            <input type="number" value={adjAmt} onChange={(e) => setAdjAmt(e.target.value)} data-testid="adjust-amount" placeholder="Coins"
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 font-mono-pz focus:border-pazer-red outline-none" />
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => doAdjust("add")} data-testid="wallet-add" className="py-2.5 rounded-full bg-green-500 hover:bg-green-400 font-bold text-sm transition-colors">Add Coins</button>
              <button onClick={() => doAdjust("remove")} data-testid="wallet-remove" className="py-2.5 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold text-sm transition-colors">Remove Coins</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={!!pwUser} onOpenChange={(o) => !o && setPwUser(null)}>
        <DialogContent className="bg-pazer-card border-white/10 text-white">
          <DialogHeader><DialogTitle className="font-display">Reset Password — {pwUser?.display_name || pwUser?.username}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <input value={pw} onChange={(e) => setPw(e.target.value)} data-testid="new-password" placeholder="New password"
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 focus:border-pazer-red outline-none" />
            <button onClick={doResetPw} data-testid="confirm-reset-pw" className="w-full py-2.5 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors">Reset Password</button>
          </div>
        </DialogContent>
      </Dialog>

      {/* User detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="bg-pazer-card border-white/10 text-white max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">{detail?.user?.display_name || detail?.user?.username}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <Info l="Mobile" v={detail.user.mobile} />
                <Info l="Username" v={detail.user.username} />
                <Info l="Balance" v={((detail.user.main_balance || 0) + (detail.user.bonus_balance || 0)).toLocaleString()} />
                <Info l="KYC" v={detail.user.kyc_status} />
                <Info l="Games Played" v={detail.user.stats?.games_played || 0} />
                <Info l="Games Won" v={detail.user.stats?.games_won || 0} />
                <Info l="Total Entries" v={(detail.user.stats?.total_entries || 0).toLocaleString()} />
                <Info l="Total Prizes" v={(detail.user.stats?.total_prizes || 0).toLocaleString()} />
                <Info l="Referral Code" v={detail.referral_code} />
                <Info l="Referral Earnings" v={(detail.referral_earnings || 0).toLocaleString()} />
              </div>
              {detail.lost_last_3 && <div className="rounded-lg bg-yellow-400/10 text-yellow-400 px-3 py-2 text-xs">⚠️ Lost the last 3 games — consider "Let Win" to re-engage.</div>}
              <div>
                <div className="text-xs uppercase text-white/40 mb-1">Recent Games</div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {detail.games.slice(0, 12).map((g) => (
                    <div key={g.id} className="flex justify-between bg-black/40 rounded px-3 py-1.5 text-xs">
                      <span>{g.mode} · {g.target}s</span>
                      <span className={g.result === "won" ? "text-green-400" : "text-white/50"}>{g.result} {g.prize > 0 ? `+${g.prize}` : ""}</span>
                    </div>
                  ))}
                  {detail.games.length === 0 && <p className="text-white/40 text-xs">No games yet.</p>}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ l, v }) {
  return (
    <div className="bg-black/40 rounded-lg px-3 py-2">
      <div className="text-[10px] uppercase text-white/40">{l}</div>
      <div className="font-mono-pz text-white/80 break-all">{v ?? "—"}</div>
    </div>
  );
}

function KV({ l, v }) {
  if (!v) return null;
  return (
    <div>
      <div className="text-[10px] uppercase text-white/30">{l}</div>
      <div className="font-mono-pz text-white/80 break-all">{v}</div>
    </div>
  );
}
