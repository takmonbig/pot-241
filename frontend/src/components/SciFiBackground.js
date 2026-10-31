import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";

const COUNT = 48;

export function SciFiBackground() {
  const { pathname } = useLocation();
  useEffect(() => {
    const gaming = ["/games/", "/room/", "/pvp/", "/race/"].some((p) => pathname.startsWith(p));
    document.body.classList.toggle("pz-gaming", gaming);
    return () => document.body.classList.remove("pz-gaming");
  }, [pathname]);
  const dots = useMemo(() => Array.from({ length: COUNT }, (_, i) => {
    const size = 3 + ((i * 7) % 6);
    return { left: `${(i * 37) % 100}%`, top: `${(i * 53) % 100}%`, width: size, height: size,
      animationDuration: `${14 + ((i * 11) % 16)}s, ${2.5 + ((i * 3) % 4)}s`, animationDelay: `${-((i * 13) % 20)}s, ${-(i % 4)}s` };
  }), []);
  return (
    <div className="pz-scifi" aria-hidden data-testid="gold-particles-bg">
      <div className="pz-scifi__orb o1" />
      <div className="pz-scifi__orb o2" />
      {dots.map((s, i) => <span key={i} className="pz-particle" style={s} />)}
    </div>
  );
}
