import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Timer, Zap, Trophy, Users, ShieldCheck, ArrowRight, Target, Gauge } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const HERO = "https://images.unsplash.com/photo-1542751371-adc38448a05e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDJ8MHwxfHNlYXJjaHwxfHxlc3BvcnRzJTIwZ2FtZXIlMjBkYXJrJTIwYmFja2dyb3VuZHxlbnwwfHx8fDE3ODg0MjMzMjR8MA&ixlib=rb-4.1.0&q=85";
const ARENA = "https://images.unsplash.com/photo-1676746424139-77f8bd8922a8?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzl8MHwxfHNlYXJjaHw0fHxzdGFkaXVtJTIwYXJlbmElMjBsaWdodHMlMjBkYXJrfGVufDB8fHx8MTc4ODQyMzMyNHww&ixlib=rb-4.1.0&q=85";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.5 } }),
};

export default function Home() {
  const { user } = useAuth();
  const cta = user ? "/dashboard" : "/register";

  return (
    <div className="relative">
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src={HERO} alt="" className="w-full h-full object-cover opacity-25" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/80 to-[#050505]" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 md:px-8 pt-20 pb-28 md:pt-28 md:pb-36">
          <motion.div initial="hidden" animate="show" className="max-w-3xl">
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-pazer-red/40 bg-pazer-red/10 mb-6">
              <span className="h-2 w-2 rounded-full bg-pazer-red pz-live-dot" />
              <span className="text-xs font-mono-pz uppercase tracking-widest text-pazer-red">Skill-based · Live rooms</span>
            </motion.div>
            <motion.h1 variants={fadeUp} custom={1} className="font-display font-extrabold leading-[0.95] tracking-tight text-5xl sm:text-6xl lg:text-7xl">
              Stop the clock. <span className="text-pazer-red pz-glow">Beat the room.</span>
            </motion.h1>
            <motion.p variants={fadeUp} custom={2} className="mt-6 text-lg text-white/60 max-w-xl">
              POT24 is a precision timing game. Choose a target, start the stopwatch, and stop it as close as
              possible. Your timing is your skill.
            </motion.p>
            <motion.div variants={fadeUp} custom={3} className="mt-9 flex flex-wrap items-center gap-4">
              <Link to={cta} data-testid="hero-cta"
                className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors pz-glow-box">
                Master Your Timing
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link to="/support" className="px-6 py-3.5 rounded-full border border-white/15 hover:border-white/40 font-medium transition-colors text-white/80">
                How it works
              </Link>
            </motion.div>
            <motion.div variants={fadeUp} custom={4} className="mt-12 grid grid-cols-3 gap-6 max-w-md">
              {[["0.01s", "Reaction edge"], ["25", "Players / room"], ["5x", "Prize pools"]].map(([a, b]) => (
                <div key={b}>
                  <div className="font-mono-pz text-2xl font-bold text-pazer-red">{a}</div>
                  <div className="text-xs text-white/40 uppercase tracking-wider mt-1">{b}</div>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* BENTO */}
      <section className="mx-auto max-w-7xl px-4 md:px-8 py-20">
        <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight mb-3">Two ways to compete</h2>
        <p className="text-white/50 mb-10 max-w-xl">Precision solo challenges or live multiplayer showdowns.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="md:col-span-2 relative overflow-hidden rounded-2xl pz-glass p-8 min-h-[280px] flex flex-col justify-between">
            <div className="absolute -right-16 -top-16 opacity-10"><Target className="h-64 w-64 text-pazer-red" /></div>
            <div>
              <div className="inline-flex items-center gap-2 text-pazer-red text-xs font-mono-pz uppercase tracking-widest mb-4">
                <Gauge className="h-4 w-4" /> Fixed-Time Challenge
              </div>
              <h3 className="font-display font-bold text-2xl mb-3">Hit the exact target</h3>
              <p className="text-white/55 max-w-md">Pick a target from 5s to 31s. Stop within the accuracy window and multiply your entry into a prize.</p>
            </div>
            <div className="flex flex-wrap gap-2 mt-6">
              {[5, 7, 10, 14, 16, 21, 26, 31].map((t) => (
                <span key={t} className="font-mono-pz text-sm px-3 py-1.5 rounded-lg bg-black/40 border border-white/10">{t}s</span>
              ))}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
            className="relative overflow-hidden rounded-2xl min-h-[280px] p-8 flex flex-col justify-end">
            <img src={ARENA} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-transparent" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 text-pazer-red text-xs font-mono-pz uppercase tracking-widest mb-3">
                <Users className="h-4 w-4" /> Multiplayer Rooms
              </div>
              <h3 className="font-display font-bold text-2xl mb-2">Beat the room</h3>
              <p className="text-white/60 text-sm">Closest to the target wins the pool. Up to 25 players, live.</p>
            </div>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          {[
            { icon: Zap, t: "High-res timing", d: "Millisecond precision powered by the browser's performance clock." },
            { icon: ShieldCheck, t: "Server-verified", d: "Every result is validated server-side. No client-side cheating." },
            { icon: Trophy, t: "Configurable prizes", d: "Admin-controlled entry, prize pools and payout rules." },
          ].map((f, i) => (
            <motion.div key={f.t} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
              className="rounded-2xl pz-glass p-6">
              <f.icon className="h-6 w-6 text-pazer-red mb-4" />
              <h3 className="font-semibold text-lg mb-1">{f.t}</h3>
              <p className="text-white/50 text-sm">{f.d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* HOW */}
      <section className="mx-auto max-w-7xl px-4 md:px-8 py-16">
        <div className="rounded-3xl pz-glass p-8 md:p-12">
          <h2 className="font-display font-bold text-3xl tracking-tight mb-10">How POT24 works</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              ["01", "Deposit", "Add POT24 Coins and grab your promotional bonus."],
              ["02", "Choose target", "Pick a fixed challenge or join a live room."],
              ["03", "Stop the clock", "One tap. Nail the target time."],
              ["04", "Win", "Server validates, prize hits your wallet instantly."],
            ].map(([n, t, d]) => (
              <div key={n} className="relative">
                <div className="font-mono-pz text-pazer-red/40 text-4xl font-bold mb-3">{n}</div>
                <h3 className="font-semibold text-lg mb-1">{t}</h3>
                <p className="text-white/50 text-sm">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 md:px-8 py-16 pb-28">
        <div className="relative rounded-3xl overflow-hidden bg-pazer-red p-10 md:p-16 text-center">
          <div className="absolute inset-0 opacity-20"><Timer className="h-full w-full" /></div>
          <div className="relative">
            <h2 className="font-display font-extrabold text-3xl md:text-5xl tracking-tight mb-4">Ready to test your timing?</h2>
            <p className="text-white/80 mb-8 max-w-lg mx-auto">Join POT24 and turn milliseconds into wins.</p>
            <Link to={cta} className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-black text-white font-bold hover:bg-black/80 transition-colors">
              Get Started Free <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 py-8 text-center text-white/40 text-sm">
        <p className="font-display font-bold text-white/70 mb-1">POT24</p>
        <p>Skill-based timing game · Play responsibly · 18+</p>
      </footer>
    </div>
  );
}
