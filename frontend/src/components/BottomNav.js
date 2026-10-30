import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Gamepad2, Swords, Users, User, Trophy } from "lucide-react";

const items = [
  { to: "/home", label: "Games", icon: Gamepad2 },
  { to: "/1v1", label: "1v1", icon: Swords },
  { to: "/multiplayer", label: "Rooms", icon: Users },
  { to: "/leaderboard", label: "Ranks", icon: Trophy },
  { to: "/profile", label: "Profile", icon: User },
];

export function BottomNav() {
  const loc = useLocation();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 pz-glass border-t border-white/10" data-testid="bottom-nav">
      <div className="mx-auto max-w-lg grid grid-cols-5">
        {items.map((it) => {
          const active = it.to === "/home" ? (loc.pathname === "/home" || loc.pathname.startsWith("/games")) : loc.pathname.startsWith(it.to);
          return (
            <Link key={it.to} to={it.to} data-testid={`bottomnav-${it.label.toLowerCase()}`}
              className="relative flex flex-col items-center gap-1 py-2.5 group">
              {active && <motion.span layoutId="bnav-pill" className="absolute -top-px h-0.5 w-10 rounded-full bg-pazer-red" style={{ boxShadow: "0 0 10px #f5b301" }} />}
              <it.icon className={`h-5 w-5 transition-colors ${active ? "text-pazer-red" : "text-white/45 group-hover:text-white/80"}`} strokeWidth={active ? 2.5 : 2} />
              <span className={`text-[10px] font-medium transition-colors ${active ? "text-pazer-red" : "text-white/45 group-hover:text-white/80"}`}>{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
