import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, Eye, EyeOff, Phone } from "lucide-react";
import { LOGO_URL } from "@/lib/brand";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";

export default function AdminLogin() {
  const { login, logout, user, loading } = useAuth();
  const nav = useNavigate();
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user && user.role === "admin") nav("/admin", { replace: true });
  }, [loading, user, nav]);

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const u = await login(mobile, password);
      if (u.role !== "admin") {
        await logout();
        setErr("These credentials do not have admin access.");
        return;
      }
      nav("/splash?to=admin", { replace: true });
    } catch (e2) {
      setErr(formatApiError(e2.response?.data?.detail) || e2.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-[#060503] flex items-center justify-center px-4"
      style={{ backgroundImage: "radial-gradient(circle at 20% 20%, rgba(245,179,1,0.14), transparent 40%), radial-gradient(circle at 80% 80%, rgba(255,122,0,0.10), transparent 50%)" }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img src={LOGO_URL} alt="POT24" className="h-28 w-auto mb-2" style={{ filter: "drop-shadow(0 0 18px rgba(245,179,1,0.35))" }} />
          <h1 className="font-display text-2xl pz-gold-text">Admin Console</h1>
          <p className="text-white/40 text-sm mt-1">Restricted access</p>
        </div>
        <div className="rounded-2xl p-8 bg-white/[0.03] border border-white/10 backdrop-blur">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-white/50">Admin Mobile</label>
              <div className="mt-1 flex items-center bg-black/40 border border-white/10 rounded-lg focus-within:border-pazer-red transition-colors">
                <Phone className="h-4 w-4 text-white/40 ml-4" />
                <input data-testid="admin-login-mobile" type="tel" inputMode="numeric" required value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
                  className="w-full bg-transparent px-3 py-3 outline-none text-white" placeholder="Mobile number" />
              </div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-white/50">Password</label>
              <div className="mt-1 flex items-center bg-black/40 border border-white/10 rounded-lg focus-within:border-pazer-red transition-colors">
                <input data-testid="admin-login-password" type={show ? "text" : "password"} required value={password}
                  onChange={(e) => setPassword(e.target.value)} className="w-full bg-transparent px-4 py-3 outline-none text-white" />
                <button type="button" onClick={() => setShow((s) => !s)} data-testid="admin-toggle-password"
                  className="px-4 text-white/40 hover:text-white transition-colors">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {err && <p data-testid="admin-login-error" className="text-sm text-red-400">{err}</p>}
            <button data-testid="admin-login-submit" disabled={busy}
              className="w-full py-3 rounded-lg bg-pazer-red hover:bg-pazer-redhover font-bold text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Sign in
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
