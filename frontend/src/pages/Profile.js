import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { User, ShieldCheck, BadgeCheck, Loader2, Copy, Wallet as WalletIcon, Trophy, Target, TrendingUp, Flame, Phone } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { showPopup } from "@/components/CenterPopup";
import { useSiteConfig } from "@/lib/siteConfig";
import { ProfileSummary } from "@/components/ProfileSummary";

const KYC_BADGE = {
  not_submitted: { t: "Not Submitted", c: "bg-white/10 text-white/60" },
  pending: { t: "Under Review", c: "bg-yellow-400/10 text-yellow-400" },
  verified: { t: "Verified", c: "bg-green-400/10 text-green-400" },
  rejected: { t: "Rejected", c: "bg-pazer-red/10 text-pazer-red" },
};

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const site = useSiteConfig();
  const [stats, setStats] = useState(null);
  const [byGame, setByGame] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [kyc, setKyc] = useState({ full_name: "", method: "upi", account_number: "", ifsc: "", bank_name: "", account_name: "", upi_id: "", upi_name: "", usdt_wallet_address: "", usdt_network: "TRC20", usdt_qr_url: "" });
  const [busy, setBusy] = useState(false);
  const [kycUploading, setKycUploading] = useState(false);
  const uploadKycQr = async (file) => {
    if (!file) return;
    setKycUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("folder", "profile");
      const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setKyc((k) => ({ ...k, usdt_qr_url: data.url }));
    } catch (e2) { showPopup({ type: "warning", title: "Upload failed", message: formatApiError(e2.response?.data?.detail) }); }
    finally { setKycUploading(false); }
  };

  useEffect(() => {
    api.get("/stats").then(({ data }) => setStats(data)).catch(() => {});
    api.get("/stats/by-game").then(({ data }) => setByGame(data)).catch(() => {});
    api.get("/wallet").then(({ data }) => setWallet(data)).catch(() => {});
  }, []);

  const submitKyc = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      await api.post("/kyc", kyc);
      showPopup({ type: "success", title: "KYC submitted", message: "Your details are under review." }); refreshUser();
    } catch (e2) { showPopup({ type: "warning", title: "Couldn't submit", message: formatApiError(e2.response?.data?.detail) }); }
    finally { setBusy(false); }
  };

  const badge = KYC_BADGE[user?.kyc_status] || KYC_BADGE.not_submitted;
  const played = stats?.games_played ?? 0;
  const won = stats?.games_won ?? 0;
  const lost = stats?.games_lost ?? 0;
  const winRate = stats?.win_rate ?? 0;
  const lossRate = played ? Math.round((lost / played) * 100) : 0;

  const bigStats = [
    { icon: WalletIcon, label: "Balance", value: (wallet?.total_balance ?? 0).toLocaleString(), color: "text-pazer-red" },
    { icon: Target, label: "Games Played", value: played, color: "text-white" },
    { icon: Trophy, label: "Games Won", value: won, color: "text-green-400" },
    { icon: TrendingUp, label: "Total Prizes", value: (stats?.total_prizes ?? 0).toLocaleString(), color: "text-green-400" },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* Identity card */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl pz-glass p-6 flex items-center gap-4 mb-4">
        <div className="h-16 w-16 rounded-2xl bg-pazer-red flex items-center justify-center font-display font-extrabold text-2xl shrink-0">
          {(user?.display_name || "?")[0]?.toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="font-display font-bold text-xl truncate">{user?.display_name}</h1>
          <button onClick={async () => { try { await navigator.clipboard.writeText(user?.username); showPopup({ type: "success", title: "Copied", message: "Username copied to clipboard." }); } catch (e) { showPopup({ type: "info", title: "Username", message: user?.username }); } }}
            className="text-sm text-white/50 flex items-center gap-1 hover:text-pazer-red transition-colors" data-testid="profile-username">
            @{user?.username} <Copy className="h-3 w-3" />
          </button>
          <div className="flex items-center gap-3 mt-1 text-xs text-white/40">
            <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{user?.mobile}</span>
            <span className={`px-2 py-0.5 rounded-full ${badge.c}`}>KYC · {badge.t}</span>
          </div>
        </div>
      </motion.div>

      <ProfileSummary />
        <div className="mb-4 rounded-3xl pz-glass p-4" data-testid="profile-by-game">
          <h3 className="font-display text-xl mb-3">Your games</h3>
          {byGame.length === 0 ? <p className="text-sm text-white/60">Play a game to see your per-game stats.</p> : (
            <div className="space-y-2">
              {byGame.map((g) => (
                <div key={g.mode} className="rounded-2xl bg-black/40 border border-white/5 p-3" data-testid={`profile-game-${g.mode}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-display text-lg">{g.game}</span>
                    <span className={`font-mono-pz font-bold ${g.net >= 0 ? "text-emerald-400" : "text-pazer-red"}`}>{g.net >= 0 ? "+" : ""}{g.net.toFixed(2)}</span>
                  </div>
                  <div className="mt-1 grid grid-cols-4 gap-2 text-center text-[11px] text-white/60">
                    <div><div className="font-mono-pz text-sm text-white">{g.played}</div>played</div>
                    <div><div className="font-mono-pz text-sm text-emerald-300">{g.won}</div>won</div>
                    <div><div className="font-mono-pz text-sm text-amber-300">{g.earned.toFixed(2)}</div>earned</div>
                    <div><div className="font-mono-pz text-sm text-pazer-red">{g.loss.toFixed(0)}</div>loss</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      {/* Big stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {bigStats.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.04 }}
            className="rounded-2xl pz-glass p-4">
            <s.icon className={`h-5 w-5 mb-2 ${s.color}`} />
            <div className={`font-mono-pz text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-white/40 uppercase tracking-wider mt-0.5">{s.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Win/Loss ratio bars */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-2xl pz-glass p-6 mb-4">
        <h3 className="font-display font-bold text-lg mb-4">Performance</h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1"><span className="text-green-400">Win ratio</span><span className="font-mono-pz">{winRate}%</span></div>
            <div className="h-2.5 bg-black/40 rounded-full overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${winRate}%` }} transition={{ duration: 0.8 }} className="h-full bg-green-400 rounded-full" /></div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1"><span className="text-pazer-red">Loss ratio</span><span className="font-mono-pz">{lossRate}%</span></div>
            <div className="h-2.5 bg-black/40 rounded-full overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${lossRate}%` }} transition={{ duration: 0.8 }} className="h-full bg-pazer-red rounded-full" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3 pt-2">
            <div><div className="font-mono-pz text-lg font-bold">{lost}</div><div className="text-xs text-white/40">Losses</div></div>
            <div><div className="font-mono-pz text-lg font-bold">{(stats?.total_entries ?? 0).toLocaleString()}</div><div className="text-xs text-white/40">Total Entries</div></div>
            <div><div className="font-mono-pz text-lg font-bold text-green-400">{wallet?.bonus_balance?.toLocaleString() ?? 0}</div><div className="text-xs text-white/40">Bonus Coins</div></div>
          </div>
        </div>
      </motion.div>

      {/* KYC */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="rounded-2xl pz-glass p-6">
        <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-pazer-red" />KYC Verification</h3>
        {user?.kyc_status === "verified" ? (
          <div className="text-center py-4"><BadgeCheck className="h-12 w-12 text-green-400 mx-auto mb-2" /><p className="text-white/60 text-sm">Verified. Withdrawals enabled.</p></div>
        ) : (
          <form onSubmit={submitKyc} className="space-y-3">
            <input required placeholder="Full legal name" value={kyc.full_name} onChange={(e) => setKyc({ ...kyc, full_name: e.target.value })} data-testid="kyc-name"
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:border-pazer-red outline-none transition-colors" />
            <div className="grid grid-cols-3 gap-2">
              {["upi", "bank", "usdt"].map((m) => (
                <button type="button" key={m} onClick={() => setKyc({ ...kyc, method: m })} data-testid={`kyc-method-${m}`}
                  className={`py-2.5 rounded-lg text-sm font-semibold uppercase tracking-wide transition-colors ${kyc.method === m ? "bg-pazer-red text-white" : "bg-white/5 text-white/60 hover:bg-white/10"}`}>
                  {m}
                </button>
              ))}
            </div>
            {kyc.method === "upi" ? (
              <>
                <input required placeholder="UPI ID (e.g. name@upi)" value={kyc.upi_id} onChange={(e) => setKyc({ ...kyc, upi_id: e.target.value })} data-testid="kyc-upi-id"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:border-pazer-red outline-none transition-colors" />
                <input required placeholder="Name on UPI" value={kyc.upi_name} onChange={(e) => setKyc({ ...kyc, upi_name: e.target.value })} data-testid="kyc-upi-name"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:border-pazer-red outline-none transition-colors" />
              </>
            ) : kyc.method === "usdt" ? (
              <>
                <input required placeholder="USDT wallet address (TRC20 only)" value={kyc.usdt_wallet_address} onChange={(e) => setKyc({ ...kyc, usdt_wallet_address: e.target.value })} data-testid="kyc-usdt-address"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:border-pazer-red outline-none transition-colors font-mono-pz" />
                <label data-testid="kyc-qr-label" className="flex items-center justify-center gap-2 w-full py-3 rounded-lg border border-dashed border-white/20 hover:border-pazer-red cursor-pointer transition-colors text-sm text-white/60">
                  {kycUploading ? "Uploading…" : kyc.usdt_qr_url ? "QR uploaded ✓" : "Upload your wallet QR (optional)"}
                  <input type="file" accept="image/*" className="hidden" data-testid="kyc-qr-input" onChange={(e) => uploadKycQr(e.target.files?.[0])} />
                </label>
                {kyc.usdt_qr_url && <img src={kyc.usdt_qr_url} alt="usdt qr" className="h-24 rounded-lg object-contain bg-white p-1 mx-auto" />}
                <p className="text-xs text-yellow-400">Send/receive USDT only on the TRC20 network. Minimum withdrawal 10 USDT.</p>
              </>
            ) : (
              <>
                <input required placeholder="Account number" value={kyc.account_number} onChange={(e) => setKyc({ ...kyc, account_number: e.target.value })} data-testid="kyc-account-number"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:border-pazer-red outline-none transition-colors" />
                <input required placeholder="Account holder name" value={kyc.account_name} onChange={(e) => setKyc({ ...kyc, account_name: e.target.value })} data-testid="kyc-account-name"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:border-pazer-red outline-none transition-colors" />
                <div className="grid grid-cols-2 gap-2">
                  <input required placeholder="IFSC code" value={kyc.ifsc} onChange={(e) => setKyc({ ...kyc, ifsc: e.target.value.toUpperCase() })} data-testid="kyc-ifsc"
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:border-pazer-red outline-none transition-colors" />
                  <input required placeholder="Bank name" value={kyc.bank_name} onChange={(e) => setKyc({ ...kyc, bank_name: e.target.value })} data-testid="kyc-bank-name"
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:border-pazer-red outline-none transition-colors" />
                </div>
              </>
            )}
            <button disabled={busy} data-testid="kyc-submit" className="w-full py-2.5 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Submit KYC
            </button>
          </form>
        )}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl pz-glass p-6 mt-6">
        <h2 className="font-display font-bold text-lg mb-3">Help &amp; Support</h2>
        <p className="text-sm text-white/50 mb-4">Forgot your password or need help? Our team is on Telegram.</p>
        <div className="grid grid-cols-2 gap-3">
          <a href={site?.support?.telegram_url || "https://t.me/amoratime0109"} target="_blank" rel="noreferrer" data-testid="profile-support"
            className="py-3 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold text-sm text-center transition-colors">Contact Support</a>
          <a href={site?.support?.forgot_password_url || "https://t.me/amoratime0109"} target="_blank" rel="noreferrer" data-testid="profile-forgot"
            className="py-3 rounded-full bg-white/5 hover:bg-white/10 font-bold text-sm text-center transition-colors">Forgot Password</a>
        </div>
      </motion.div>
    </div>
  );
}
