import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BrandIntro } from "@/components/BrandIntro";

export default function Splash() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const admin = sp.get("to") === "admin";
  useEffect(() => {
    const t = setTimeout(() => nav(admin ? "/admin" : "/home", { replace: true }), 2700);
    return () => clearTimeout(t);
  }, [nav, admin]);
  return <div data-testid="splash-screen"><BrandIntro caption={admin ? "Command Center" : "Welcome, Royalty"} /></div>;
}
