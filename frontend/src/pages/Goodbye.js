import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { BrandIntro } from "@/components/BrandIntro";

export default function Goodbye() {
  const { logout } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  useEffect(() => {
    const to = sp.get("to") === "admin" ? "/admin/login" : "/welcome";
    const t = setTimeout(async () => { await logout(); nav(to, { replace: true }); }, 2100);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <BrandIntro outro caption="See you soon" />;
}
