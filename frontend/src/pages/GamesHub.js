import { Link } from "react-router-dom";
import { LoopVideo } from "@/components/LoopVideo";
import { motion } from "framer-motion";
import { Timer, Plane, Gem, ChevronRight, Gamepad2, Tornado, Egg, Layers, Star } from "lucide-react";
import { DailyReward } from "@/components/DailyReward";
import { Guide } from "@/components/Guide";

const IMG = "https://static.prod-images.emergentagent.com/jobs/670c5923-c1f4-4298-9135-36fea583d12c/images/";
const IMG2 = "https://static.prod-images.emergentagent.com/jobs/1d2db223-cf0e-4ebf-b00c-a47a46100ac9/images/";
const GAMES = [
  { id: "stopwatch", to: "/games/stopwatch", t1: "Stop", t2: "watch", tag: "New Game", star: true, desc: "Stop the clock exactly on target.", icon: Timer, color: "#facc15", wide: true,
    img: IMG + "3e91b1e43f580947843cce37c5bd3b2f78409a9a5bd0c0b6760c17c331142988.jpeg" },
  { id: "chicken", to: "/games/chicken", t1: "Chicken", t2: "Quest", tag: "3 Modes", desc: "Cross the lanes, dodge the traps.", icon: Egg, color: "#f59e0b",
    img: IMG2 + "2b1125721182200da6a6b79fdd9afe0d2f30603b64f352eae0eecdd79162c64c.jpeg" },
  { id: "aviator", to: "/games/aviator", t1: "Aviator", t2: "", tag: "Up to 100×", desc: "Cash out before the plane flies away.", icon: Plane, color: "#ef4444",
    img: IMG + "717f36ec2192ac9731af75616c523b892cbceddb3b3b474e1298b63f7f9224ec.jpeg" },
  { id: "tower", to: "/games/tower", t1: "T", t2: "Mines", tag: "Pick & Win", desc: "Pick safe tiles, find the gems.", icon: Gem, color: "#22c55e",
    img: IMG + "ac37d044145e261752683c651aedb3895405c487573fd4143c78f26f1d74dc0e.jpeg" },
  { id: "stack", to: "/games/stack", t1: "Tower", t2: "", tag: "Skill · 20×", desc: "Stack blocks against the clock.", icon: Layers, color: "#f97316",
    img: IMG2 + "0fb7b57cd56bf803c69b78b81da7e4d698a90625ec292057993d192234bbc713.jpeg" },
  { id: "vortex", to: "/games/vortex", t1: "Vortex", t2: "Spin", tag: "Up to 100×", desc: "Fire, Water, Earth. Spin, bank or ride.", icon: Tornado, color: "#a855f7", wide: true,
    img: IMG2 + "36e7f60b73bab5c78ea993d555ceaa9dab9a32a1d0752880ab7ab474a62d6c0d.jpeg" },
];

function Sparks({ color }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 7 }, (_, i) => (
        <span key={i} className="hub-spark absolute bottom-0 h-1.5 w-1.5 rounded-full"
          style={{ left: `${45 + ((i * 37) % 50)}%`, background: color, boxShadow: `0 0 8px ${color}`, animationDuration: `${2.4 + (i % 4) * 0.7}s`, animationDelay: `${i * 0.45}s` }} />
      ))}
    </div>
  );
}

function GameCard({ g, i }) {
  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 * i, duration: 0.4 }} className={g.wide ? "col-span-2" : ""}>
      <Link to={g.to} data-testid={`hub-card-${g.id}`}
        className={`group relative block overflow-hidden rounded-3xl border-2 ${g.wide ? "h-48" : "h-60"}`}
        style={{ borderColor: g.color, boxShadow: `0 0 22px ${g.color}55, inset 0 0 24px ${g.color}22` }}>
        <LoopVideo k={g.id} poster={`/videos/poster/${g.id}.jpg`} preload="auto" data-testid={`hub-video-${g.id}`}
          className={`absolute inset-0 h-full w-full object-cover ${g.wide ? "object-right" : "object-center"}`} />
        <div className={`absolute inset-0 ${g.wide ? "bg-gradient-to-r from-black via-black/70 to-transparent" : "bg-gradient-to-t from-black via-black/60 to-transparent"}`} />
        <div className="hub-sweep pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/15 to-transparent" style={{ animationDelay: `${i * 0.6}s` }} />
        <Sparks color={g.color} />
        <div className="relative h-full flex flex-col justify-between p-4">
          <span className="self-start inline-flex items-center gap-1 rounded-full bg-pazer-red px-3 py-1 text-[11px] font-extrabold tracking-wide uppercase shadow-lg">
            {g.star && <Star className="h-3.5 w-3.5 fill-yellow-300 text-yellow-300" />}{g.tag}
          </span>
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <h2 className={`font-display leading-[0.95] drop-shadow-[0_2px_6px_rgba(0,0,0,.8)] ${g.wide ? "text-4xl" : "text-[28px]"}`}>
                {g.wide && <g.icon className="inline h-7 w-7 mr-1.5 -mt-1" style={{ color: g.color }} />}
                <span className="text-white">{g.t1}</span>{g.t2 && (g.wide ? "" : " ")}{g.t2 && <span style={{ color: g.color }}>{g.t2}</span>}
              </h2>
              <p className="text-white/75 text-[13px] mt-1 leading-snug">{g.desc}</p>
            </div>
            <span className="h-11 w-11 shrink-0 rounded-full flex items-center justify-center transition-transform group-hover:scale-110" style={{ background: g.color }}>
              <ChevronRight className="h-6 w-6 text-black" />
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

export default function GamesHub() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-40" data-testid="games-hub">
      <Guide />
      <DailyReward />
      <div className="flex items-center gap-2 mb-1">
        <Gamepad2 className="h-5 w-5 text-pazer-red" />
        <h1 className="font-display text-3xl">Games</h1>
      </div>
      <p className="text-white/60 text-sm mb-5">Pick your game. Skill, nerve and timing win coins.</p>
      <div className="grid grid-cols-2 gap-3">{GAMES.map((g, i) => <GameCard key={g.id} g={g} i={i} />)}</div>
    </div>
  );
}
