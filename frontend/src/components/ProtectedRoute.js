import { Link, Navigate, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Navbar } from "@/components/Navbar";
import { BottomNav } from "@/components/BottomNav";
import { WinTicker } from "@/components/WinTicker";
import { SciFiBackground } from "@/components/SciFiBackground";
import { CenterPopupHost } from "@/components/CenterPopup";
import { WinCelebrationHost } from "@/components/WinCelebration";
import { QuickActions } from "@/components/QuickActions";
import { Timer, ShieldCheck, LogOut } from "lucide-react";

function Loader() {
  return (
    <div className="min-h-screen flex items-center justify-center pz-radial">
      <Timer className="h-10 w-10 text-pazer-red animate-spin" />
    </div>
  );
}

function AdminHeader() {
  const { logout } = useAuth();
  const nav = useNavigate();
  const doLogout = async () => { await logout(); nav("/admin/login", { replace: true }); };
  return (
    <header className="sticky top-0 z-50 bg-[#0a0e17]/90 backdrop-blur border-b border-white/10">
      <div className="mx-auto max-w-7xl px-4 md:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5" data-testid="admin-brand">
          <div className="h-9 w-9 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <p className="font-display font-bold text-white leading-none">Admin Console</p>
            <p className="text-[10px] text-white/40 uppercase tracking-wider mt-0.5">TIMEUP</p>
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
      <div className="min-h-screen bg-[#080b12]">
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
