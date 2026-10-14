import { Coins } from "lucide-react";

const QUICK = [20, 50, 100, 200, 500];

export function BetBox({ bet, setBet, min = 20, prefix, disabled }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-white/50 mb-2">Bet (min {min})</div>
      <div className="flex items-center bg-black/40 border border-white/10 rounded-xl focus-within:border-pazer-red transition-colors mb-2">
        <Coins className="h-5 w-5 text-pazer-red ml-4" />
        <input data-testid={`${prefix}-bet-input`} type="number" value={bet || ""} placeholder="Enter amount" disabled={disabled}
          onChange={(e) => setBet(Math.max(0, parseInt(e.target.value) || 0))} onFocus={(e) => e.target.select()}
          className="w-full bg-transparent px-3 py-3 outline-none font-mono-pz text-xl font-bold" />
      </div>
      <div className="flex gap-2">
        {QUICK.map((v) => (
          <button key={v} disabled={disabled} onClick={() => setBet(v)} data-testid={`${prefix}-quickbet-${v}`}
            className={`flex-1 py-2 rounded-lg text-sm font-mono-pz transition-colors ${bet === v ? "bg-pazer-red/30" : "bg-white/5 hover:bg-white/10"}`}>{v}</button>
        ))}
      </div>
    </div>
  );
}

export function apiErrorPopup(showPopup, m, title = "Can't start") {
  if (/insufficient/i.test(m)) showPopup({ type: "wallet", title: "Insufficient balance", message: "Add coins to your wallet to keep playing." });
  else showPopup({ type: "warning", title, message: m });
}
