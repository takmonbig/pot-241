import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, Crown, Gift, Tag, Award } from "lucide-react";

const items = [
  { to: "/home", label: "Home", icon: Home, id: "games" },
  { to: "/club/vip", label: "VIP Club", icon: Crown, id: "vip" },
  { to: "/club/bonus", label: "Daily Bonus", icon: Gift, id: "bonus" },
  { to: "/club/offers", label: "Offers", icon: Tag, id: "offers" },
  { to: "/club/rewards", label: "Rewards", icon: Award, id: "rewards" },
];

export function BottomNav() {
  const loc = useLocation();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 bg-[#070502]/95 backdrop-blur border-t border-amber-400/25" data-testid="bottom-nav">
      <div className="mx-auto max-w-lg grid grid-cols-5">
        {items.map((it) => {
          const active = it.to === "/home" ? (loc.pathname === "/home" || loc.pathname.startsWith("/games")) : loc.pathname.startsWith(it.to);
          return (
            <Link key={it.to} to={it.to} data-testid={`bottomnav-${it.id}`} className="relative flex flex-col items-center gap-1 py-2.5 group">
              {active && <motion.span layoutId="bnav-pill" className="absolute -top-px h-0.5 w-10 rounded-full bg-amber-300" style={{ boxShadow: "0 0 10px #f5b301" }} />}
              <it.icon className={`h-5 w-5 transition-colors ${active ? "text-amber-300" : "text-amber-100/45 group-hover:text-amber-100/80"}`} strokeWidth={active ? 2.5 : 2} />
              <span className={`text-[9px] font-bold uppercase tracking-wide transition-colors ${active ? "text-amber-300" : "text-white/45"}`}>{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
