import { useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Trophy } from "lucide-react";

const NAMES = ["Palak", "Rohan", "Aisha", "Vikram", "Neha", "Arjun", "Sana", "Karan", "Priya", "Dev",
  "Meera", "Aditya", "Riya", "Sahil", "Tanvi", "Yash", "Isha", "Kabir", "Anaya", "Manish",
  "Simran", "Rahul", "Diya", "Nikhil", "Pooja", "Aryan", "Kavya", "Harsh", "Zoya", "Varun",
  "Alexei", "Daniel", "Sofia", "Lucas", "Emma", "Mateo", "Olivia", "Liam", "Nadia", "Marco",
  "Chloe", "Diego", "Aiko", "Hassan", "Elena", "Omar", "Viktor", "Layla", "Yuki", "Ivan"];

function make() {
  const name = NAMES[Math.floor(Math.random() * NAMES.length)];
  const dice = Math.random();
  let bet, mult, mode;
  if (dice < 0.5) { bet = [20, 50, 100, 200, 500, 1000][Math.floor(Math.random() * 6)]; mult = 5; mode = "Fixed"; }
  else if (dice < 0.8) { bet = 50; mult = 1.5; mode = "1v1"; }
  else { bet = 50; mult = [3, 5, 8, 12][Math.floor(Math.random() * 4)]; mode = "Multiplayer"; }
  const win = Math.round(bet * mult);
  return { id: Math.random().toString(36).slice(2), name, bet, win, mode };
}

export function WinTicker() {
  const [item, setItem] = useState(make());
  const [gameActive, setGameActive] = useState(false);
  useEffect(() => {
    const h = (e) => setGameActive(!!e.detail);
    window.addEventListener("game:active", h);
    return () => window.removeEventListener("game:active", h);
  }, []);
  useEffect(() => {
    const i = setInterval(() => setItem(make()), 5000);
    return () => clearInterval(i);
  }, []);
  const { pathname } = useLocation();
  if (gameActive || pathname.startsWith("/games/")) return null;
  return (
    <div className="fixed bottom-[130px] inset-x-0 z-30 pointer-events-none" data-testid="win-ticker">
      <div className="mx-auto max-w-md px-3">
        <AnimatePresence mode="wait">
          <motion.div key={item.id}
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.4 }}
            className="flex items-center gap-2 rounded-full bg-black/70 border border-pazer-red/30 backdrop-blur px-3.5 py-1.5 text-xs">
            <Trophy className="h-3.5 w-3.5 text-pazer-red shrink-0" />
            <span className="text-white/80 truncate">
              <span className="font-semibold text-white">{item.name}</span> won{" "}
              <span className="font-mono-pz font-bold text-green-400">₹{item.win.toLocaleString()}</span> from{" "}
              <span className="font-mono-pz text-white/60">₹{item.bet}</span>
            </span>
            <span className="ml-auto text-[9px] uppercase tracking-wider text-pazer-red/80 shrink-0">{item.mode}</span>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
