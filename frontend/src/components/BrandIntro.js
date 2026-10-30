import { motion } from "framer-motion";
import { CROWN_URL, LOGO_BASE_URL, LOGO_URL, TAGLINE } from "@/lib/brand";

const SPARKS = Array.from({ length: 14 }, (_, i) => i);

/** POT24 brand animation: logo rises, crown drops onto it, gold shine sweeps across. */
export function BrandIntro({ caption = TAGLINE, outro = false }) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-[#060503]" data-testid={outro ? "brand-outro" : "brand-intro"}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 50% 42%, rgba(245,179,1,0.22), transparent 55%)" }} />
      <motion.div className="absolute h-[70vmin] w-[70vmin] rounded-full border border-amber-400/20"
        initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: [0.4, 1.15, 1], opacity: [0, 0.8, 0.35] }} transition={{ delay: 0.75, duration: 1 }} />
      <div className="relative w-[78vw] max-w-[420px] aspect-[512/373]">
        <motion.img src={LOGO_BASE_URL} alt="" className="absolute inset-0 h-full w-full"
          initial={{ opacity: 0, scale: 0.85, y: 20 }} animate={outro ? { opacity: [0, 1, 1, 0], scale: [0.85, 1, 1, 0.9] } : { opacity: 1, scale: 1, y: 0 }}
          transition={outro ? { duration: 2.1, times: [0, 0.25, 0.8, 1] } : { duration: 0.6, ease: "easeOut" }} />
        <motion.img src={CROWN_URL} alt="" className="absolute" style={{ left: "27.34%", width: "42.38%", top: 0 }}
          initial={{ y: "-260%", rotate: -14, opacity: 0 }}
          animate={outro ? { y: ["0%", "0%", "-40%", "-300%"], rotate: [0, 0, -6, 12], opacity: [1, 1, 1, 0] } : { y: "0%", rotate: 0, opacity: 1 }}
          transition={outro ? { duration: 1.6, times: [0, 0.35, 0.6, 1] } : { delay: 0.55, type: "spring", stiffness: 260, damping: 13 }} />
        <motion.div className="absolute inset-0 pz-logo-mask pointer-events-none"
          style={{ WebkitMaskImage: `url(${LOGO_URL})`, maskImage: `url(${LOGO_URL})` }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.05 }}>
          <motion.div className="absolute inset-y-0 w-1/3 -skew-x-12"
            style={{ background: "linear-gradient(90deg, transparent, rgba(255,247,214,0.95), transparent)" }}
            initial={{ x: "-120%" }} animate={{ x: "380%" }} transition={{ delay: 1.1, duration: 0.9, ease: "easeInOut" }} />
        </motion.div>
        {SPARKS.map((i) => (
          <motion.span key={i} className="absolute h-1.5 w-1.5 rounded-full bg-amber-200 shadow-[0_0_8px_#fbbf24]"
            style={{ left: "49%", top: "22%" }}
            initial={{ opacity: 0, x: 0, y: 0 }}
            animate={{ opacity: [0, 1, 0], x: Math.cos((i / 14) * Math.PI * 2) * 130, y: Math.sin((i / 14) * Math.PI * 2) * 70 }}
            transition={{ delay: outro ? 0.2 : 0.95, duration: 0.9, ease: "easeOut" }} />
        ))}
      </div>
      <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: outro ? [0, 1, 1, 0] : 1, y: 0 }}
        transition={outro ? { duration: 2.1, times: [0, 0.2, 0.8, 1] } : { delay: 1.35 }}
        className="relative mt-8 font-display text-lg sm:text-xl uppercase tracking-[0.35em] pz-gold-text" data-testid="brand-caption">
        {caption}
      </motion.p>
    </div>
  );
}
