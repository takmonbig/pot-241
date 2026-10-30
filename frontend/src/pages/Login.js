import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, Eye, EyeOff, Phone } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";
import { LOGO_URL } from "@/lib/brand";
import { COUNTRIES } from "@/lib/countries";

import { useSiteConfig } from "@/lib/siteConfig";

export default function Login() {
  const { login, logout } = useAuth();
  const nav = useNavigate();
  const site = useSiteConfig();
  const [mobile, setMobile] = useState("");
  const [dial, setDial] = useState("91");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const u = await login(dial + mobile, password);
      if (u.role === "admin") {
        await logout();
        setErr("Invalid credentials.");
        return;
      }
      nav("/splash");
    } catch (e2) {
      setErr(formatApiError(e2.response?.data?.detail) || e2.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen pz-radial pz-grain flex items-center justify-center px-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <Link to="/" className="flex justify-center mb-8">
          <img src={LOGO_URL} alt="POT24" className="h-32 w-auto" style={{ filter: "drop-shadow(0 0 12px rgba(245,179,1,0.4))" }} />
        </Link>
        <div className="pz-glass rounded-2xl p-8">
          <h1 className="font-display font-bold text-2xl mb-1">Log in</h1>
          <p className="text-white/50 text-sm mb-6">Welcome back. Your throne awaits.</p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-white/50">Country &amp; Mobile Number</label>
              <div className="mt-1 flex items-center gap-2">
                <select data-testid="login-country" value={dial} onChange={(e) => setDial(e.target.value)}
                  className="bg-black/40 border border-white/10 rounded-lg px-2 py-3 outline-none focus:border-pazer-red text-sm max-w-[120px]">
                  {COUNTRIES.map((c) => <option key={c.code} value={c.dial} className="bg-pazer-card">{c.flag} +{c.dial}</option>)}
                </select>
                <div className="flex-1 flex items-center bg-black/40 border border-white/10 rounded-lg focus-within:border-pazer-red transition-colors">
                  <Phone className="h-4 w-4 text-white/40 ml-4" />
                  <input data-testid="login-mobile" type="tel" inputMode="numeric" required value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
                    className="w-full bg-transparent px-3 py-3 outline-none" placeholder="Mobile number" />
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-white/50">Password</label>
              <div className="mt-1 flex items-center bg-black/40 border border-white/10 rounded-lg focus-within:border-pazer-red transition-colors">
                <input data-testid="login-password" type={show ? "text" : "password"} required value={password}
                  onChange={(e) => setPassword(e.target.value)} className="w-full bg-transparent px-4 py-3 outline-none" />
                <button type="button" onClick={() => setShow((s) => !s)} data-testid="toggle-password"
                  className="px-4 text-white/40 hover:text-white transition-colors">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {err && <p data-testid="login-error" className="text-sm text-pazer-red">{err}</p>}
            <div className="text-right -mt-1">
              <a href={site?.support?.forgot_password_url || "https://t.me/amoratime0109"} target="_blank" rel="noreferrer"
                data-testid="forgot-password" className="text-xs text-white/50 hover:text-pazer-red transition-colors">Forgot password?</a>
            </div>
            <button data-testid="login-submit" disabled={busy}
              className="w-full py-3 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Log in
            </button>
          </form>
          <p className="text-center text-sm text-white/50 mt-6">
            No account? <Link to="/register" className="text-pazer-red hover:underline">Create one</Link>
          </p>
          <p className="text-center text-xs text-white/40 mt-3">
            Need help? <a href={site?.support?.telegram_url || "https://t.me/amoratime0109"} target="_blank" rel="noreferrer" data-testid="login-support" className="text-pazer-red hover:underline">Contact support on Telegram</a>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
