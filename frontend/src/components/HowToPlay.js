import { useEffect, useState } from "react";
import { LoopVideo } from "@/components/LoopVideo";
import { CircleHelp, Play } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GAME_META, MODE_META } from "@/lib/games";

const seenKey = (k) => `tu_demo_seen_${k}`;
const VIDEOS = new Set(["stopwatch", "aviator", "tower", "chicken", "stack", "vortex", "1v1", "rooms", "friends"]);

export function HowToPlay({ k, auto = true }) {
  const meta = GAME_META[k] || MODE_META[k];
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (auto && !localStorage.getItem(seenKey(k))) {
      const t = setTimeout(() => setOpen(true), 500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [k, auto]);
  const close = () => { localStorage.setItem(seenKey(k), "1"); setOpen(false); };
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <>
      <button onClick={() => setOpen(true)} data-testid={`howto-open-${k}`} aria-label="How to play"
        className="ml-auto shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 transition-colors">
        <CircleHelp className="h-4 w-4" /> <span className="hidden sm:inline">How to play</span><span className="sm:hidden">Help</span>
      </button>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent className="bg-pazer-card border-white/10 text-white p-0 overflow-hidden max-w-sm" data-testid={`howto-dialog-${k}`}>
          <div className="relative aspect-square w-full bg-black">
            {VIDEOS.has(meta.video || k)
              ? <LoopVideo k={meta.video || k} hd className="h-full w-full object-cover" data-testid={`howto-video-${k}`} />
              : <img src={`/games/${k}.jpg`} alt="" className="h-full w-full object-cover hub-anim-img" data-testid={`howto-video-${k}`} />}
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-pazer-card to-transparent" />
            <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-pazer-red px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider">
              <Play className="h-3 w-3 fill-white" /> Demo
            </span>
          </div>
          <div className="px-5 pb-5 -mt-6 relative">
            <DialogHeader>
              <DialogTitle className="font-display text-2xl flex items-center gap-2">
                <Icon className="h-5 w-5" style={{ color: meta.color || "#f5b301" }} /> How to play {meta.name}
              </DialogTitle>
            </DialogHeader>
            <ol className="mt-3 space-y-2">
              {meta.steps.map((s, i) => (
                <li key={i} className="flex gap-3 text-sm text-white/80">
                  <span className="h-6 w-6 shrink-0 rounded-full bg-pazer-red/20 border border-pazer-red/50 flex items-center justify-center font-mono-pz text-xs font-bold text-pazer-red">{i + 1}</span>
                  <span className="pt-0.5">{s}</span>
                </li>
              ))}
            </ol>
            {meta.race && <p className="mt-3 text-xs text-white/50"><b className="text-white/70">In 1v1 and Rooms:</b> {meta.race}</p>}
            <button onClick={close} data-testid={`howto-close-${k}`}
              className="mt-4 w-full py-3 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors">Got it, let's play</button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
