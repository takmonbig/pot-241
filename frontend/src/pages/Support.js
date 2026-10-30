import { motion } from "framer-motion";
import { LifeBuoy, ChevronDown } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const FAQS = [
  ["How does the Fixed Challenge work?", "Choose your bet (minimum 20 coins) and a target time, then stop the stopwatch EXACTLY at the target. Hit it precisely and you win 5× your bet."],
  ["How is the 1v1 / room winner decided?", "The player whose stop time is closest to the target (smallest absolute difference) wins. If two players tie exactly, the earliest valid recorded stop wins. 1v1 pays the winner 1.5×; rooms pay from the prize pool."],
  ["What happens if a room doesn't fill up?", "If the minimum number of players isn't reached by the joining deadline, the room is automatically cancelled and every entry fee is fully refunded to your wallet."],
  ["What are POT24 Coins?", "POT24 Coins are the virtual currency of the platform. 1 Coin = ₹1. Deposits convert to coins and may include a promotional bonus."],
  ["Is this gambling?", "POT24 is a skill-based timing game — your reaction and timing precision determine the outcome, not chance. Play responsibly, 18+."],
  ["How do withdrawals work?", "Withdrawals require completed KYC verification and are reviewed by our team before processing. Minimum and maximum limits apply."],
];

const RULES = [
  "Fixed Challenge: stop EXACTLY at the target time to win 5× your bet.",
  "1v1 & Rooms: closest absolute difference from the target wins.",
  "On an exact tie, the earliest valid recorded stop timestamp wins.",
  "All results are validated server-side. Manipulated timers are rejected.",
  "One active session per player at a time.",
];

export default function Support() {
  return (
    <div className="mx-auto max-w-3xl px-4 md:px-8 py-12">
      <div className="flex items-center gap-3 mb-2">
        <LifeBuoy className="h-6 w-6 text-pazer-red" />
        <h1 className="font-display font-bold text-3xl tracking-tight">Support & Rules</h1>
      </div>
      <p className="text-white/50 mb-8">Everything you need to master POT24.</p>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl pz-glass p-6 mb-6">
        <h2 className="font-display font-bold text-xl mb-4">Game Rules</h2>
        <ul className="space-y-3">
          {RULES.map((r, i) => (
            <li key={i} className="flex gap-3 text-white/70 text-sm">
              <span className="font-mono-pz text-pazer-red font-bold">{i + 1}</span>{r}
            </li>
          ))}
        </ul>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-2xl pz-glass p-6 mb-6">
        <h2 className="font-display font-bold text-xl mb-2">FAQ</h2>
        <Accordion type="single" collapsible className="w-full">
          {FAQS.map(([q, a], i) => (
            <AccordionItem key={i} value={`item-${i}`} className="border-white/10">
              <AccordionTrigger className="text-left hover:no-underline hover:text-pazer-red">{q}</AccordionTrigger>
              <AccordionContent className="text-white/60">{a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-2xl pz-glass p-6">
        <h2 className="font-display font-bold text-xl mb-3">Responsible Gaming</h2>
        <p className="text-white/60 text-sm leading-relaxed">
          POT24 involves paid entries and virtual rewards. Play within your limits and take breaks. Real-money features
          are enabled only after compliance approval and completed KYC. This platform is intended for players aged 18+.
          If gaming stops being fun, please step away. Contact support@pot24.com for help or self-exclusion requests.
        </p>
      </motion.div>
    </div>
  );
}
