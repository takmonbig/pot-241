import { vid } from "@/lib/games";

export function LoopVideo({ k, hd, className = "", ...rest }) {
  const base = vid(k, hd).replace(/\.mp4$/, "");
  return (
    <video autoPlay muted loop playsInline poster={`/videos/poster/${k}.jpg`} className={className} {...rest}>
      <source src={`${base}.webm`} type="video/webm" />
      <source src={`${base}.mp4`} type="video/mp4" />
    </video>
  );
}
