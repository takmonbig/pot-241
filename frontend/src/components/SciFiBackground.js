import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function SciFiBackground() {
  const { pathname } = useLocation();
  useEffect(() => {
    const gaming = pathname.startsWith("/games/") || pathname.startsWith("/room/");
    document.body.classList.toggle("pz-gaming", gaming);
    return () => document.body.classList.remove("pz-gaming");
  }, [pathname]);
  return (
    <div className="pz-scifi" aria-hidden>
      <div className="pz-scifi__grid" />
      <div className="pz-scifi__orb o1" />
      <div className="pz-scifi__orb o2" />
      <div className="pz-scifi__orb o3" />
      <div className="pz-scifi__scan" />
    </div>
  );
}
