import { ModeLobby } from "@/components/ModeLobby";

export default function Multiplayer() {
  return <ModeLobby kind="rooms" roomMode="multiplayer" payoutLabel="Prize pool"
    subtitle="Many players, one round, any game. Top score takes the prize pool." />;
}
