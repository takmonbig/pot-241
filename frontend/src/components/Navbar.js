import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Menu, Wallet, LogOut, Shield, Home, Swords, Users, Trophy, User, Gamepad2, Crown, Gift, Tag, Award, LifeBuoy, Plus } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { LOGO_URL } from "@/lib/brand";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

const LINKS = [
  ["/home", "Home", Home], ["/bet-on-player", "Bet on Player", Gamepad2], ["/1v1", "1v1 Duels", Swords],
  ["/multiplayer", "Multiplayer Rooms", Users], ["/leaderboard", "Leaderboard", Trophy], ["/wallet", "Wallet", Wallet],
  ["/profile", "My Profile", User], ["/club/vip", "VIP Club", Crown], ["/club/bonus", "Daily Bonus", Gift],
  ["/club/offers", "Offers", Tag], ["/club/rewards", "Rewards", Award], ["/support", "Support", LifeBuoy],
];

function useBalance(user) {
  const loc = useLocation();
  const [balance, setBalance] = useState(null);
  useEffect(() => {
    if (user) api.get("/wallet").then(({ data }) => setBalance(data.total_balance)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, loc.pathname]);
  useEffect(() => {
    const refetch = () => api.get("/wallet").then(({ data }) => setBalance(data.total_balance)).catch(() => {});
    window.addEventListener("wallet:refresh", refetch);
    const tick = () => { if (!document.hidden) window.dispatchEvent(new Event("wallet:refresh")); };
    const iv = setInterval(tick, 8000);
    window.addEventListener("focus", tick);
    return () => { window.removeEventListener("wallet:refresh", refetch); clearInterval(iv); window.removeEventListener("focus", tick); };
  }, []);
  return balance;
}

function Drawer({ open, setOpen, user }) {
  const nav = useNavigate();
  const go = (to) => { setOpen(false); nav(to); };
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" className="w-[280px] bg-[#080603] border-r border-amber-400/20 text-white p-0" data-testid="nav-drawer">
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <div className="p-5 border-b border-amber-400/15">
          <img src={LOGO_URL} alt="POT24" className="h-20 w-auto mx-auto" />
          <p className="mt-2 text-center text-[10px] tracking-[0.35em] text-amber-200/70">PLAY • WIN • EARN</p>
        </div>
        <nav className="p-3 space-y-0.5 overflow-y-auto max-h-[calc(100vh-190px)]">
          {LINKS.map(([to, label, Icon]) => (
            <button key={to} onClick={() => go(to)} data-testid={`drawer-${to.replace(/\//g, "-").slice(1)}`}
              className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/80 hover:bg-amber-400/10 hover:text-amber-200 transition-colors">
              <Icon className="h-4 w-4 text-amber-300" /> {label}
            </button>
          ))}
          {user?.role === "admin" && (
            <button onClick={() => go("/admin")} data-testid="nav-admin" className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/80 hover:bg-amber-400/10">
              <Shield className="h-4 w-4 text-amber-300" /> Admin
            </button>
          )}
          <button onClick={() => go("/bye")} data-testid="nav-logout" className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-red-300 hover:bg-red-500/10">
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export function Navbar() {
  const { user } = useAuth();
  const balance = useBalance(user);
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 pz-glass border-b border-amber-400/15">
      <div className="mx-auto max-w-6xl px-3 md:px-8 h-16 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div>
          {user ? (
            <button onClick={() => setOpen(true)} data-testid="nav-menu" aria-label="Menu"
              className="h-10 w-10 rounded-xl flex items-center justify-center text-amber-300 hover:bg-amber-400/10 transition-colors">
              <Menu className="h-6 w-6" />
            </button>
          ) : null}
        </div>
        <Link to={user ? "/home" : "/"} className="flex items-center" data-testid="nav-logo">
          <img src={LOGO_URL} alt="POT24" className="h-12 md:h-14 w-auto -my-1" style={{ filter: "drop-shadow(0 0 10px rgba(245,179,1,0.35))" }} />
        </Link>
        <div className="flex justify-end">
          {user ? (
            <Link to="/wallet" data-testid="nav-balance"
              className="flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-full bg-black/60 border border-amber-400/40 hover:border-amber-300 transition-colors">
              <span className="font-mono-pz text-sm font-bold text-amber-200" data-testid="header-balance">₹{balance != null ? balance.toLocaleString() : "…"}</span>
              <span className="h-6 w-6 rounded-full bg-pazer-red flex items-center justify-center"><Plus className="h-3.5 w-3.5" /></span>
            </Link>
          ) : (
            <Link to="/login" data-testid="nav-login" className="px-4 py-2 text-sm font-bold rounded-full bg-pazer-red">Log in</Link>
          )}
        </div>
      </div>
      {user && <Drawer open={open} setOpen={setOpen} user={user} />}
    </header>
  );
}
