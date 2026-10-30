import { Timer, Plane, Gem, Egg, Layers, Tornado, Swords, Users, UserPlus } from "lucide-react";

export const vid = (k, hd) => `/videos/${hd ? "hd" : "sm"}/${k}.mp4`;

export const GAME_META = {
  stopwatch: { name: "Stopwatch", icon: Timer, color: "#facc15", to: "/games/stopwatch",
    steps: ["Pick a target time and your bet.", "Tap START, then tap STOP exactly on the target.", "Hit it to the hundredth of a second to win 5×."],
    race: "Closest stop to the target wins." },
  aviator: { name: "Aviator", icon: Plane, color: "#ff8a00", to: "/games/aviator",
    steps: ["Place your bet and the plane takes off.", "The multiplier climbs while the plane flies.", "Cash out before it flies away. Wait too long and you lose."],
    race: "Everyone flies the same plane. Highest cash-out multiplier wins." },
  tower: { name: "T Mines", icon: Gem, color: "#ffd24d", to: "/games/tower",
    steps: ["Choose a difficulty and your bet.", "Pick one tile per floor. Gems are safe, mines end the run.", "Cash out any time to bank the floor multiplier."],
    race: "Same mine layout for every player. Highest multiplier banked wins." },
  chicken: { name: "Chicken Quest", icon: Egg, color: "#f59e0b", to: "/games/chicken",
    steps: ["Pick Sprint, Pro or Master and your bet.", "Tap GO to cross lane by lane. Each lane raises the multiplier.", "Collect before a trap fries your chicken, or reach the golden nest."],
    race: "Same traps for everyone. Highest multiplier collected wins." },
  stack: { name: "Tower", icon: Layers, color: "#f97316", to: "/games/stack",
    steps: ["Choose a timed challenge and your bet.", "Tap to drop each sliding block onto the tower.", "Reach the target height before the clock runs out."],
    race: "Same block speeds for all. Highest tower wins; faster finish breaks ties." },
  vortex: { name: "Vortex Spin", icon: Tornado, color: "#e8a317", to: "/games/vortex",
    steps: ["Choose Earth, Water or Fire and your bet.", "Spin the wheel. Land on safe slots to multiply your prize.", "Bank it any time, or ride to the final stage for up to 100×."],
    race: "Same spins for everyone. Highest multiplier banked wins." },
};

export const MODE_META = {
  "1v1": { name: "1v1 Duels", icon: Swords, video: "1v1",
    steps: ["Pick a game and an entry fee.", "Join a duel. An opponent joins in seconds.", "You both play the same round. Better score takes 1.8× (stopwatch 1.5×)."] },
  rooms: { name: "Multiplayer Rooms", icon: Users, video: "rooms",
    steps: ["Pick a game and a room.", "Players fill the room and the race goes live.", "Everyone plays the same round. Top score takes the prize pool."] },
  friends: { name: "Play with Friends", icon: UserPlus, video: "friends",
    steps: ["Create a private room for any game and share the code.", "Friends join with the code. The host taps Start.", "Everyone plays the same round. Winner takes it all, with no platform fee."] },
};

export const RACE_GAMES = ["aviator", "tower", "chicken", "stack", "vortex"];
export const ALL_GAMES = ["stopwatch", ...RACE_GAMES];
