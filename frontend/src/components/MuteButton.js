import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { isMuted, setMuted, sfx } from "@/lib/sfx";

export function MuteButton({ className = "" }) {
  const [m, setM] = useState(isMuted());
  useEffect(() => {
    const h = (e) => setM(!!e.detail);
    window.addEventListener("sfx:mute", h);
    return () => window.removeEventListener("sfx:mute", h);
  }, []);
  return (
    <button onClick={() => { setMuted(!m); if (m) setTimeout(() => sfx.click(), 30); }} data-testid="sfx-mute-btn" aria-label={m ? "Unmute" : "Mute"}
      className={`ml-auto h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors ${className}`}>
      {m ? <VolumeX className="h-4 w-4 text-white/60" /> : <Volume2 className="h-4 w-4 text-white" />}
    </button>
  );
}
