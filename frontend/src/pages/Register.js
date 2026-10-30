import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, Eye, EyeOff, Phone, User, Gift } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";
import { LOGO_URL } from "@/lib/brand";
import { COUNTRIES } from "@/lib/countries";
import { fbTrack } from "@/lib/siteConfig";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ full_name: "", mobile: "", password: "", referral_code: "" });
  const [dial, setDial] = useState("91");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      await register({ ...form, mobile: dial + form.mobile });
      fbTrack("register");
      nav("/splash");
    } catch (e2) {
      setErr(formatApiError(e2.response?.data?.detail) || e2.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen pz-radial pz-grain flex items-center justify-center px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <Link to="/" className="flex justify-center mb-8">
          <img src={LOGO_URL} alt="POT24" className="h-32 w-auto" style={{ filter: "drop-shadow(0 0 12px rgba(245,179,1,0.4))" }} />
        </Link>
        <div className="pz-glass rounded-2xl p-8">
          <h1 className="font-display font-bold text-2xl mb-1">Create account</h1>
          <p className="text-white/50 text-sm mb-6">Join the timing masters.</p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-white/50">Full Name</label>
              <div className="mt-1 flex items-center bg-black/40 border border-white/10 rounded-lg focus-within:border-pazer-red transition-colors">
                <User className="h-4 w-4 text-white/40 ml-4" />
                <input data-testid="register-fullname" required value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="w-full bg-transparent px-3 py-3 outline-none" placeholder="Your name" />
              </div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-white/50">Country &amp; Mobile Number</label>
              <div className="mt-1 flex items-center gap-2">
                <select data-testid="register-country" value={dial} onChange={(e) => setDial(e.target.value)}
                  className="bg-black/40 border border-white/10 rounded-lg px-2 py-3 outline-none focus:border-pazer-red text-sm max-w-[120px]">
                  {COUNTRIES.map((c) => <option key={c.code} value={c.dial} className="bg-pazer-card">{c.flag} +{c.dial}</option>)}
                </select>
                <div className="flex-1 flex items-center bg-black/40 border border-white/10 rounded-lg focus-within:border-pazer-red transition-colors">
                  <Phone className="h-4 w-4 text-white/40 ml-4" />
                  <input data-testid="register-mobile" type="tel" inputMode="numeric" required value={form.mobile}
                    onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, "") })}
                    className="w-full bg-transparent px-3 py-3 outline-none" placeholder="Mobile number" />
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-white/50">Password</label>
              <div className="mt-1 flex items-center bg-black/40 border border-white/10 rounded-lg focus-within:border-pazer-red transition-colors">
                <input data-testid="register-password" type={show ? "text" : "password"} required value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full bg-transparent px-4 py-3 outline-none" />
                <button type="button" onClick={() => setShow((s) => !s)} data-testid="toggle-password"
                  className="px-4 text-white/40 hover:text-white transition-colors">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-white/50">Referral Code (optional)</label>
              <div className="mt-1 flex items-center bg-black/40 border border-white/10 rounded-lg focus-within:border-pazer-red transition-colors">
                <Gift className="h-4 w-4 text-white/40 ml-4" />
                <input data-testid="register-referral" value={form.referral_code}
                  onChange={(e) => setForm({ ...form, referral_code: e.target.value.toUpperCase() })}
                  className="w-full bg-transparent px-3 py-3 outline-none" placeholder="Have a code? Get 10 bonus coins" />
              </div>
            </div>
            {err && <p data-testid="register-error" className="text-sm text-pazer-red">{err}</p>}
            <button data-testid="register-submit" disabled={busy}
              className="w-full py-3 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create account
            </button>
          </form>
          <p className="text-center text-sm text-white/50 mt-6">
            Already have an account? <Link to="/login" className="text-pazer-red hover:underline">Log in</Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
