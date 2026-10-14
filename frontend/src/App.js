import "@/App.css";
import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { loadSiteConfig } from "@/lib/siteConfig";
import { ProtectedRoute, PublicLayout } from "@/components/ProtectedRoute";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Splash from "@/pages/Splash";
import GameHome from "@/pages/GameHome";
import GamesHub from "@/pages/GamesHub";
import Aviator from "@/pages/Aviator";
import Tower from "@/pages/Tower";
import VortexSpin from "@/pages/VortexSpin";
import ChickenQuest from "@/pages/ChickenQuest";
import TowerStack from "@/pages/TowerStack";
import Fairness from "@/pages/Fairness";
import OneVsOne from "@/pages/OneVsOne";
import Multiplayer from "@/pages/Multiplayer";
import Leaderboard from "@/pages/Leaderboard";
import RoomGame from "@/pages/RoomGame";
import Wallet from "@/pages/Wallet";
import Profile from "@/pages/Profile";
import Support from "@/pages/Support";
import Admin from "@/pages/Admin";
import AdminLogin from "@/pages/AdminLogin";

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={user ? "/home" : "/login"} replace />;
}

function App() {
  useEffect(() => { loadSiteConfig(); }, []);
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route element={<PublicLayout />}>
              <Route path="/welcome" element={<Landing />} />
              <Route path="/support" element={<Support />} />
            </Route>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/splash" element={<Splash />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/home" element={<GamesHub />} />
              <Route path="/games/stopwatch" element={<GameHome />} />
              <Route path="/games/aviator" element={<Aviator />} />
              <Route path="/games/tower" element={<Tower />} />
              <Route path="/games/vortex" element={<VortexSpin />} />
              <Route path="/games/chicken" element={<ChickenQuest />} />
              <Route path="/games/stack" element={<TowerStack />} />
              <Route path="/games/fairness" element={<Fairness />} />
              <Route path="/1v1" element={<OneVsOne />} />
              <Route path="/multiplayer" element={<Multiplayer />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/room/:id" element={<RoomGame />} />
              <Route path="/wallet" element={<Wallet />} />
              <Route path="/profile" element={<Profile />} />
            </Route>
            <Route element={<ProtectedRoute adminOnly />}>
              <Route path="/admin" element={<Admin />} />
            </Route>
            <Route path="*" element={<RootRedirect />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
