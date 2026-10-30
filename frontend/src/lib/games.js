import { Timer, Plane, Gem, Egg, Layers, Tornado, Swords, Users, UserPlus, Palette, Landmark, Spade, Club, Diamond, Dices, Heart } from "lucide-react";

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

Object.assign(GAME_META, {
  color: { name: "Color Prediction", icon: Palette, color: "#22c55e", to: "/games/color",
    steps: ["A new round starts every 30 seconds.", "Bet on a colour (Red, Green, Violet), a number 0-9, or Big/Small.", "Right colour pays 2×, Violet 4.5×, exact number 9×. Betting closes 5s before the draw."] },
  matka: { name: "Matka", icon: Landmark, color: "#a855f7", to: "/games/matka",
    steps: ["A draw happens every 2 minutes.", "Pick a Single digit (0-9) or a Jodi pair (00-99).", "Single pays 9×, Jodi pays 90×."] },
  andar: { name: "Andar Bahar", icon: Diamond, color: "#ef4444", to: "/games/andar",
    steps: ["A Joker card is shown in the middle.", "Bet Andar or Bahar, then cards are dealt to both sides.", "If the matching card lands on your side you win (Andar 1.9×, Bahar 2×)."] },
  teen: { name: "Teen Patti", icon: Heart, color: "#f43f5e", to: "/games/teen",
    steps: ["Place your bet. You and the dealer get 3 cards each.", "Trail > Pure Sequence > Sequence > Color > Pair > High card.", "Beat the dealer to win 1.95×. A tie refunds your bet."] },
  break10: { name: "Break the 10", icon: Spade, color: "#38bdf8", to: "/games/break10",
    steps: ["Get one card. A-9 count their value, 10/J/Q/K count 0.", "Hit for more cards or Stand. Go over 10 and you break.", "Beat the dealer for 1.95×. Hit exactly 10 for 3×."] },
  ludo: { name: "Ludo", icon: Dices, color: "#facc15", to: "/games/ludo",
    steps: ["Race your 2 tokens 30 squares to home against a bot.", "Roll the dice and pick which token to move. Land on a bot token to send it back.", "Bring both tokens home first to win 1.9×. Stars are safe squares."] },
  callbreak: { name: "Call Break", icon: Club, color: "#10b981", to: "/games/callbreak",
    steps: ["You and 3 bots get 5 cards each. Spades are trumps.", "Bid how many tricks you'll win, then follow the lead suit.", "Meet your bid with the best score at the table to win 3.5×."] },
});

export const POPULAR = ["color", "aviator", "matka", "tower", "chicken", "vortex", "stack", "stopwatch"];
export const BET_ON_PLAYER = ["callbreak", "ludo", "andar", "teen", "break10"];
export const art = (k) => `/games/${k}.jpg`;

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
