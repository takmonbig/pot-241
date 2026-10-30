import { Link, Navigate, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Navbar } from "@/components/Navbar";
import { BottomNav } from "@/components/BottomNav";
import { WinTicker } from "@/components/WinTicker";
import { SciFiBackground } from "@/components/SciFiBackground";
import { CenterPopupHost } from "@/components/CenterPopup";
import { WinCelebrationHost } from "@/components/WinCelebration";
import { QuickActions } from "@/components/QuickActions";
import { LogOut } from "lucide-react";
import { LOGO_SM } from "@/lib/brand";

function Loader() {
  return (
    <div className="min-h-screen flex items-center justify-center pz-radial">
      <img src={LOGO_SM} alt="POT24" className="h-20 w-auto animate-pulse" />
    </div>
  );
}

function AdminHeader() {
  const nav = useNavigate();
  const doLogout = () => nav("/bye?to=admin");
  return (
    <header className="sticky top-0 z-50 bg-[#080603]/95 backdrop-blur border-b border-amber-400/20">
      <div className="mx-auto max-w-7xl px-4 md:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5" data-testid="admin-brand">
          <img src={LOGO_SM} alt="POT24" className="h-12 w-auto" />
          <div>
            <p className="font-display font-bold leading-none pz-gold-text">Admin Console</p>
            <p className="text-[10px] text-white/40 uppercase tracking-wider mt-0.5">POT24</p>
          </div>
        </div>
        <button onClick={doLogout} data-testid="admin-logout"
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-colors text-sm">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </header>
  );
}

export function ProtectedRoute({ adminOnly }) {
  const { user, loading } = useAuth();
  if (loading || user === null) return <Loader />;
  if (!user) return <Navigate to={adminOnly ? "/admin/login" : "/login"} replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/admin/login" replace />;
  if (!adminOnly && user.role === "admin") return <Navigate to="/admin" replace />;
  if (adminOnly) {
    return (
      <div className="min-h-screen bg-[#060503]" style={{ backgroundImage: "radial-gradient(circle at 85% 0%, rgba(245,179,1,0.08), transparent 45%)" }}>
        <AdminHeader />
        <Outlet />
      </div>
    );
  }
  return (
    <div className="min-h-screen pb-44">
      <SciFiBackground />
      <CenterPopupHost />
      <WinCelebrationHost />
      <div className="pz-content">
        <Navbar />
        <Outlet />
        <WinTicker /><QuickActions /><BottomNav />
      </div>
    </div>
  );
}

export function PublicLayout() {
  const { loading } = useAuth();
  if (loading) return <Loader />;
  return (
    <div className="min-h-screen">
      <SciFiBackground />
      <CenterPopupHost />
      <div className="pz-content">
        <Navbar />
        <Outlet />
      </div>
    </div>
  );
}
