import { Link, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Trophy, Users, ShieldCheck, ArrowRight, Swords, UserPlus, Crown, Zap } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { LOGO_URL } from "@/lib/brand";
import { GAME_META, ALL_GAMES } from "@/lib/games";
import { LoopVideo } from "@/components/LoopVideo";

const fadeUp = { hidden: { opacity: 0, y: 30 }, show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.5 } }) };

function GameStrip() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="landing-games">
      {ALL_GAMES.map((k, i) => {
        const g = GAME_META[k];
        return (
          <motion.div key={k} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
            className="relative aspect-square overflow-hidden rounded-2xl border border-amber-400/25">
            <LoopVideo k={k} className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
            <div className="absolute bottom-3 left-3 flex items-center gap-1.5 font-display text-lg"><g.icon className="h-4 w-4 text-amber-300" />{g.name}</div>
          </motion.div>
        );
      })}
    </div>
  );
}

export default function Landing() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to="/home" replace />;

  return (
    <div className="relative">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 75% 30%, rgba(245,179,1,0.18), transparent 50%), radial-gradient(circle at 10% 90%, rgba(255,122,0,0.12), transparent 45%)" }} />
        <div className="relative mx-auto max-w-7xl px-4 md:px-8 pt-12 pb-20 md:pt-20 md:pb-28 grid md:grid-cols-2 gap-10 items-center">
          <motion.div initial="hidden" animate="show">
            <motion.div variants={fadeUp} custom={0} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-pazer-red/40 bg-pazer-red/10 mb-6">
              <span className="h-2 w-2 rounded-full bg-pazer-red pz-live-dot" />
              <span className="text-xs font-mono-pz uppercase tracking-widest text-pazer-red">6 games · Live rooms · 1v1</span>
            </motion.div>
            <motion.h1 variants={fadeUp} custom={1} className="font-display leading-[0.95] text-5xl sm:text-6xl lg:text-7xl">
              Play like <span className="pz-gold-text">royalty.</span> Win the pot.
            </motion.h1>
            <motion.p variants={fadeUp} custom={2} className="mt-6 text-base md:text-lg text-white/60 max-w-xl">
              POT24 brings six realistic 3D games together: Stopwatch, Aviator, T Mines, Chicken Quest, Tower and Vortex Spin. Play solo, duel 1v1 or race friends in private rooms. Every round is provably fair.
            </motion.p>
            <motion.div variants={fadeUp} custom={3} className="mt-9 flex flex-wrap items-center gap-4">
              <Link to="/register" data-testid="hero-cta"
                className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors pz-shine">
                Claim your throne <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link to="/login" data-testid="hero-login" className="px-6 py-3.5 rounded-full border border-amber-400/30 hover:border-amber-400/70 font-medium transition-colors text-white/80">Log in</Link>
            </motion.div>
            <motion.div variants={fadeUp} custom={4} className="mt-12 grid grid-cols-3 gap-6 max-w-md">
              {[["100×", "Top multiplier"], ["1.8×", "1v1 duel"], ["24/7", "Live rooms"]].map(([a, b]) => (
                <div key={b}><div className="font-mono-pz text-2xl font-bold pz-gold-text">{a}</div><div className="text-xs text-white/40 uppercase tracking-wider mt-1">{b}</div></div>
              ))}
            </motion.div>
          </motion.div>
          <motion.img initial={{ opacity: 0, scale: 0.85, rotate: -4 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ duration: 0.8, delay: 0.2 }}
            src={LOGO_URL} alt="POT24" className="w-full max-w-md mx-auto" style={{ filter: "drop-shadow(0 0 40px rgba(245,179,1,0.35))" }} />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 md:px-8 py-12">
        <h2 className="font-display text-3xl md:text-4xl mb-3">The royal arcade</h2>
        <p className="text-white/50 mb-8 max-w-xl">Six games, one wallet. Tap in and play in seconds.</p>
        <GameStrip />
      </section>

      <section className="mx-auto max-w-7xl px-4 md:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { icon: Swords, t: "1v1 Duels", d: "Same round for both players. Better score takes 1.8×.", tag: "Head to head" },
            { icon: Users, t: "Multiplayer Rooms", d: "Up to 8 racers on one seed. Top score takes the pool.", tag: "Live rooms" },
            { icon: UserPlus, t: "Play with Friends", d: "Private room code. No platform fee. Winner takes it all.", tag: "Private" },
          ].map((f, i) => (
            <motion.div key={f.t} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
              className="rounded-2xl pz-glass p-6">
              <f.icon className="h-7 w-7 text-pazer-red mb-4" />
              <div className="text-[10px] font-mono-pz uppercase tracking-widest text-pazer-red/70 mb-1">{f.tag}</div>
              <h3 className="font-semibold text-lg mb-1">{f.t}</h3>
              <p className="text-white/50 text-sm">{f.d}</p>
            </motion.div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          {[
            { icon: ShieldCheck, t: "Provably fair", d: "Seeds are hashed before you play and revealed after." },
            { icon: Zap, t: "Realistic 3D", d: "Smooth 3D games with sound, tuned for every phone." },
            { icon: Trophy, t: "Instant payouts", d: "Prizes hit your wallet the moment you win." },
          ].map((f, i) => (
            <motion.div key={f.t} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
              className="rounded-2xl pz-glass p-6 flex items-center gap-4">
              <f.icon className="h-6 w-6 text-pazer-red shrink-0" />
              <div><h3 className="font-semibold">{f.t}</h3><p className="text-white/50 text-sm">{f.d}</p></div>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 md:px-8 py-12 pb-24">
        <div className="relative rounded-3xl overflow-hidden border border-amber-400/40 p-10 md:p-16 text-center bg-gradient-to-br from-[#2a1a02] via-[#120b02] to-black">
          <Crown className="h-10 w-10 text-amber-300 mx-auto mb-4" />
          <h2 className="font-display text-3xl md:text-5xl mb-4"><span className="pz-gold-text">The crown is waiting.</span></h2>
          <p className="text-white/70 mb-8 max-w-lg mx-auto">Join POT24 and play your first round in under a minute.</p>
          <Link to="/register" data-testid="footer-cta" className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors pz-shine">
            Get Started Free <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-amber-400/15 py-8 text-center text-white/40 text-sm">
        <img src={LOGO_URL} alt="POT24" className="h-14 w-auto mx-auto mb-2 opacity-90" />
        <p>Play responsibly · 18+</p>
      </footer>
    </div>
  );
}
