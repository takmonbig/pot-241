import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Wallet, LogOut, Shield } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { LOGO_URL } from "@/lib/brand";

export function Navbar() {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const [balance, setBalance] = useState(null);

  useEffect(() => {
    if (user) api.get("/wallet").then(({ data }) => setBalance(data.total_balance)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, loc.pathname]);

  useEffect(() => {
    const refetch = () => api.get("/wallet").then(({ data }) => setBalance(data.total_balance)).catch(() => {});
    window.addEventListener("wallet:refresh", refetch);
    // silent auto-refresh: balance stays live (admin approvals, room payouts) without reloading the page
    const tick = () => { if (!document.hidden) window.dispatchEvent(new Event("wallet:refresh")); };
    const iv = setInterval(tick, 8000);
    window.addEventListener("focus", tick);
    return () => { window.removeEventListener("wallet:refresh", refetch); clearInterval(iv); window.removeEventListener("focus", tick); };
  }, []);

  const doLogout = async () => { await logout(); nav("/welcome"); };

  return (
    <header className="sticky top-0 z-50 pz-glass">
      <div className="mx-auto max-w-6xl px-4 md:px-8 h-16 flex items-center justify-between gap-4">
        <Link to={user ? "/home" : "/"} className="flex items-center" data-testid="nav-logo">
          <img src={LOGO_URL} alt="TIMEUP" className="h-8 md:h-9 w-auto" style={{ filter: "drop-shadow(0 0 10px rgba(255,42,42,0.35))" }} />
        </Link>

        <div className="flex items-center gap-2.5">
          {user ? (
            <>
              <Link to="/wallet" data-testid="nav-balance"
                className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-black/50 border border-pazer-red/40 hover:border-pazer-red transition-colors">
                <Wallet className="h-4 w-4 text-pazer-red" />
                <span className="font-mono-pz text-sm font-bold" data-testid="header-balance">{balance != null ? balance.toLocaleString() : "…"}</span>
                <span className="text-[10px] text-white/40 uppercase">coins</span>
              </Link>
              {user.role === "admin" && (
                <Link to="/admin" data-testid="nav-admin"
                  className="hidden sm:flex items-center justify-center h-9 w-9 rounded-lg text-white/60 hover:text-pazer-red hover:bg-white/5 transition-colors">
                  <Shield className="h-4 w-4" />
                </Link>
              )}
              <button onClick={doLogout} data-testid="nav-logout"
                className="flex items-center justify-center h-9 w-9 rounded-lg text-white/50 hover:text-pazer-red hover:bg-white/5 transition-colors">
                <LogOut className="h-4 w-4" />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login" data-testid="nav-login" className="px-4 py-2 text-sm font-medium text-white/70 hover:text-white transition-colors">Log in</Link>
              <Link to="/register" data-testid="nav-signup" className="px-4 py-2 text-sm font-bold rounded-full bg-pazer-red hover:bg-pazer-redhover transition-colors">Get Started</Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
