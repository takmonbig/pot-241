# PAZER — Product Requirements & Build Log

## Original Problem Statement
PAZER: a skill-based stopwatch timing game platform. Players stop a stopwatch as close as possible to a target time. Fixed-Time challenges + Multiplayer rooms, PAZER Coins wallet, deposits/bonuses, withdrawals+KYC, config-driven admin control, auto room creation, real-time updates, anti-cheat. Dark premium gaming UI (neon red / black). "Master Your Timing".

## User Choices
- Scope: Phase 1 + 2 + 3 (everything feasible)
- Auth: JWT email/password (custom)
- Payments: simulated/demo gateway (no real money)
- Theme: dark premium gaming, neon red + black, heavy animation

## Architecture
- Backend: FastAPI (`/app/backend/server.py`), MongoDB (motor), JWT auth (httpOnly cookies + Bearer), bcrypt, WebSockets, asyncio room-manager background loop. All routes under `/api`.
- Frontend: React 19 + react-router 7 + framer-motion + Tailwind + shadcn/ui + sonner. Fonts: Unbounded / IBM Plex Sans / JetBrains Mono.
- Config-driven: single `config` doc (`id:global`) controls wallet, fixed challenges, room settings, toggles. Nothing hardcoded.
- Wallet ledger authoritative: every txn stores txn_id, type, amount, balance_before/after, status.

## Implemented (2026-06)
- Auth: register/login/logout/me/refresh/forgot/reset, admin RBAC, brute-force lockout, admin seeding.
- Wallet: main+bonus balances, deposit (configurable % bonus + cap), withdrawal (KYC-gated, admin review), full transaction history.
- Fixed-Time Challenge: configurable slots (5–31s), start/stop with server-side validation, accuracy tolerance, prize payout, anti-cheat (nonce replay block, concurrent-session block, latency-bound flagging), game history + stats.
- Multiplayer Rooms: auto-creation (~6 targets), join/double-join protection, prize pool + platform fee, min/max players, auto-refund under minimum, LIVE gameplay + rankings + tie-breaking, WebSocket live updates.
- Admin Panel: overview stats, full game/wallet config editor, fixed-challenge CRUD, room config, user management (search/suspend/reactivate/verify KYC), withdrawal approve/reject, audit logs.
- Pages: Home (marketing), Login, Register, Dashboard, PlayFixed, Rooms, RoomGame, Wallet, Profile, Support (rules/FAQ/responsible gaming), Admin.

## Testing
- iteration_1: 21/21 backend pytest pass; frontend E2E 100% of tested flows. No critical/minor bugs. Fixed benign 401 console noise on public pages.

## Backlog / Remaining (P1/P2)
- P1: Real payment gateway integration (currently DEMO/simulated), email/SMS verification (currently logged to console), full multiplayer LIVE test with 5+ concurrent players.
- P2: Referrals, promotions/campaigns scheduling, notifications, analytics dashboards, advanced fraud/device fingerprinting, self-exclusion limits, legal T&C/Privacy content by counsel.

## Credentials
- Admin (mobile login): `9999999999` / `Admin@123`
- Users: register via UI/API with Full name + Mobile + Password.

## Iteration 2 — TIMEUP Rebrand & Game Overhaul (2026-06)
- Rebranded PAZER → **TIMEUP** (logo in header, splash, auth, landing, footer).
- **Mobile-number auth**: Signup = Full name + Mobile + Password; Login = Mobile + Password; password eye toggle. Random username auto-generated (TU-prefixed).
- **Animated stopwatch splash** after login/signup → lands on game Home.
- Wallet balance moved to **header pill** (live-refreshes on game/deposit/join); no dashboard.
- **Bottom navigation**: Home · 1v1 · Multiplayer · Profile (mobile-first).
- **Home = Fixed Challenge** with user-chosen bet (min 20) + target; WIN = stop EXACTLY at target (2-decimal match) → 5× payout.
- **NEW 1v1 mode**: 2-player rooms, 50 coins, ~10 rooms (5–30s), closest wins 1.5× (75).
- **Multiplayer**: existing many-player pool rooms.
- **Profile**: username, win/loss ratio bars, wallet balance, games played/won/lost, prizes, bonus, motivational banner.
- **Auto-generated promotional win ticker** near footer (rotates every 5s).
- Admin config updated: `fixed_config` (min_bet/max_bet/win_multiplier/targets), `room_1v1_config`, `room_config`.
- Verified: iteration_2 24/24 backend pass, 100% frontend flows. DB reset to new schema; admin re-seeded via mobile.

## Iteration 3 — Bots, Daily Streak & Leaderboard (2026-06)
- **Practice Bots (admin-controlled)**: auto-fill rooms that already have a real player so 1v1 duels & multiplayer start within seconds. Bots auto-submit a stop near the target (difficulty = `error_range`). Admin config `bot_config`: enabled / fill_1v1 / fill_multiplayer / join_delay_seconds / error_range. Bots have no wallet/stats; skipped in payouts.
- **Daily Login Streak**: `/api/streak` + `/api/streak/claim` award a daily bonus (default 5 coins to bonus wallet) and track a streak counter (resets if a day is missed). DailyReward card on Home with claim button + flame counter. Admin config `streak_config`.
- **Weekly Leaderboard**: `/api/leaderboard/weekly` blends real 7-day winners with auto-generated promotional entries that reshuffle daily (seeded by date). New /leaderboard page (podium + list) added as 5th bottom-nav tab "Ranks". Admin config `leaderboard_config` (enabled/auto_generate/fake_count/min_win/max_win/name_pool/manual_entries).
- get_config now MERGES new config keys without wiping admin customisations.
- Verified: iteration_3 32/32 backend tests pass, 100% frontend flows, zero issues.

## Iteration 4-5 — Deployment fixes + UX Overhaul (2026-06)
Deployment blockers fixed (deployment_agent now PASS, zero findings):
- Leaderboard N+1 query -> single `$lookup` aggregation.
- **mobile unique index crash**: legacy null/empty mobile caused DuplicateKey on startup -> now a PARTIAL unique index (non-empty strings only) and ALL index creation wrapped in try/except so data issues never crash startup.
- CORS_ORIGINS="*"; removed TTL (expireAfterSeconds) auto-delete index on password_reset_tokens (plain index).

UX/feature overhaul (verified iter5 14/14 + full regression, all critical frontend flows pass):
- Sci-fi animated background site-wide; onboarding Guide on first Home visit.
- Routing: `/` -> login when logged out; login/register -> splash -> /home; logout -> `/welcome` marketing landing.
- Stopwatch STOP fix: timer SVG set pointer-events-none + non-overlapping layout -> reliable single-tap stop.
- Errors (insufficient balance / bet too low) now show as a stylish CENTER popup (not header) with "Add Coins" action.
- Loss -> encouraging popup to replay the SAME bet+target instantly (win 5x message).
- KYC replaced Aadhaar with payout method: UPI (id+name) or Bank (acc no, name, IFSC, bank).
- Completed rooms show only COMPLETED (no refunded/cancelled); TEST users hidden from leaderboard.

## Iteration 6 — Referrals, Custom Rooms, Real Deposit Flow, Win FX, Admin Superpowers (2026-06)
- **Notifications**: removed sonner Toaster site-wide; ALL feedback now via center popup (`CenterPopup`) incl. new `success` type. Deleted dead pages PlayFixed.js, Rooms.js.
- **Win celebration**: `WinCelebration` coin-burst overlay + WebAudio chord on every win (Fixed, 1v1, Rooms). `showWin(prize)`.
- **Insufficient-balance popup**: quick recharge ₹100/₹500/₹1000 + Add Coins (navigates to /wallet?deposit=amt).
- **Room/1v1 fix**: replaced broken auto-start with per-player MANUAL START→STOP. Added `/rooms/{id}/begin` storing per-player `started_at` so latency anti-cheat is fair. Room LIVE window = target+5s (`ROOM_EXTRA_SECONDS`). On completion RoomGame refreshes wallet + shows win celebration (fixed "win popup missing / wallet not increasing").
- **Custom rooms (Play with Friends)**: `/rooms/custom` (1v1 min 50 / multiplayer min 30, 10-min window, host auto-joins), `/rooms/join-code`, host `/rooms/{id}/start`. Excluded from bot-fill/auto-start/public lists; auto-refund if never started. 1v1 winner takes 2x, multiplayer winner takes full pool (0 platform fee).
- **Referral**: signup `referral_code` → both get 10 coins; `pay_referral_commission` credits referrer 7.5% of referee lost entry / 2.5% of referee win. Own code on user (`referral_code`). Footer bubbles: QuickActions (custom + Refer&Earn modals).
- **Deposit overhaul (no more demo)**: `/wallet/deposit` now creates a pending request (UPI 1₹=1coin / USDT-TRC20 1USDT=100coin min 10) with Cloudinary screenshot upload (`/api/upload`). Admin `/admin/deposits` + `/action` approve (credits) or reject (problem message shown to user + `/wallet/deposit-requests/{id}/resubmit`). Payment page reads `/api/payment-info` (admin-configured QR/UPI id/name/threshold, USDT QR/address/rate).
- **Admin superpowers**: add/remove coins (`/admin/users/{id}/wallet`), reset password, delete user, user detail (games/wins/spent/referral + lost_last_3 hint), live activity (`/admin/live`), Payments config tab (QR upload), Referral config, "Let Win" (`force_win` → next Fixed Challenge auto-wins at exact target).
- **Ticker/leaderboard**: added foreign names to pools; ticker mode label Room→Multiplayer.
- **Cloudinary** configured in backend/.env (server-side upload, folders timeup/payment_qr|payment_proof).
- Verified: backend full flow via curl/python (referral bonus+commission, custom create/join/start/stop/winner/prize, deposit approve/reject, force-win, admin wallet) ALL PASS. Frontend via testing_agent iter6 (auth, no-toasts, custom/referral modals, admin tabs, wallet deposit) + screenshots (insufficient-balance quick-recharge popup, header balance fix).
- Admin: `9999999999` / `Admin@123`. New users start at 0 coins (admin credits or deposit).

## Iteration 7 — Country codes, real recharge polish, admin bulk & Let-Win auto-stop (2026-06)
- Signup + Login: country-code dropdown (lib/countries.js); mobile stored with dial code. Backend login matches by last-10-digits so admin 9999999999 works with +91.
- get_current_user backfills referral_code for legacy users (fixed empty referral code). Footer: big full-width "Play with Friends" + round animated "Refer & Earn" badge. WinTicker moved to bottom-[130px].
- Room list inflated display_players (multiplayer ~6-14 fake seed, capped max-1; 1v1 shows real 0/2). 1v1 waits 30s for a real opponent before a bot fills; bots removed when 2 real players join (join_room).
- Bet/amount inputs no longer show stuck "0" (empty when 0, select-on-focus) on GameHome bet, withdraw amount.
- KYC: UPI/Bank/USDT tabs incl. USDT wallet address + optional QR upload (Cloudinary). Withdraw method select UPI/Bank/USDT with min-10-USDT enforcement. Always-visible warning banner above deposit ("verify QR/UPI/address").
- Auto-refresh: Wallet polls every 5s (approved recharge shows + balance updates automatically); admin Deposits tab polls every 4s; Live tab polls 3s.
- Admin: bulk select users (+ select-all) with bulk recharge/delete/suspend + Enter-to-search; /admin/custom-rooms table in Live tab; "Let Win" button on live active players (also updates the in-progress session).
- "Let Win": fixed_start returns auto_win; client auto-stops the stopwatch exactly at target so flagged users win automatically (verified: 500→580, celebration, stop at 5.00). force_win also applies to a session already in progress. fixed_start auto-expires stale (>90s) active sessions so a stuck game never blocks new starts.
- Startup deletes demo/test accounts (name/username contains 'test') before client hand-off.
- Verified: testing_agent iter7 (12/13) + screenshot for the auto-win fix (13/13). Known cosmetic: <option> emoji console warning (LOW, non-breaking).

## Iteration 8 — Meta Pixel + Telegram support + admin account (2026-06)
- Admin-managed Meta Pixel: config.meta_pixel {enabled, pixel_id, custom_head_code (full-snippet override for a fresh ad account after a ban), events{register,deposit,game_play,win}}. Injected client-side via lib/siteConfig.js (fetches /api/config/public on app load); fbTrack() fires mapped fbq events on register/deposit/game_play/win. Verified fbevents.js loads + window.fbq present.
- Admin Config → new "Pixel & Support" tab to edit pixel + event names + Telegram URLs. New "Account" tab: change admin mobile + password (POST /api/admin/account) + one-click "Remove Test Accounts".
- Telegram support + forgot-password links (admin-editable support_config.telegram_url / forgot_password_url, default https://t.me/amoratime0109) shown on Login ("Forgot password?" + support) and Profile (Help & Support card).
- Default admin still 9999999999 / Admin@123 (changeable in Admin → Account).

## Iteration 9 — Room durations/fee-variants, 10-player rooms, 30s wait, withdrawal KYC (2026-06)
- Rooms now fixed to 3 durations (5s/10s/15s) with admin-controlled entry-fee VARIANTS per duration (both 1v1 & multiplayer). config.room_config.entry_fees (default 30/50/75/100) + room_1v1_config.entry_fees (50/75/100/150). Auto-loop creates one room per duration×fee. ROOM_DURATIONS constant = [5,10,15].
- Multiplayer max_players reduced to 10 (was 25); min_players 2. get_config migrates legacy config (entry_fees, max_players<=10, min_usdt fields). Startup clears stale empty auto-rooms so the grid rebuilds.
- Both 1v1 AND multiplayer wait 30s for real players before bots fill; if real players meet the target count bots are skipped/removed and the real match starts.
- Admin Withdrawals tab redesigned: each request shows the user's name+mobile, KYC status, payout method and full KYC payout details (UPI id / bank acct+IFSC / USDT wallet+network+QR) for easy processing. /admin/withdrawals enriches each txn with live user + kyc_data. USDT withdrawal min-10-USDT enforced (verified).
- Admin Game Config UI now edits "Entry Fee Variants (CSV)" for 1v1 & multiplayer; durations shown as fixed.
- Verified: room grid (12 per mode), admin config UI, withdrawal+KYC end-to-end, min-USDT enforcement.

## Iteration 10 — Admin panel separation + daily coins 20 (2026-06)
- Dedicated admin login at /admin/login (pages/AdminLogin.js), completely independent from user /login (distinct blue "Admin Console" theme, no country selector, no Register link). Redirects to /admin on success; non-admin roles are logged out with an error.
- Full admin/user isolation in components/ProtectedRoute.js: admins are blocked from user pages (/home,/wallet,/1v1,/multiplayer,...) and redirected to /admin; unauth/non-admin hitting /admin redirects to /admin/login; admin dashboard renders a dedicated AdminHeader shell (logo + Sign out) with NO user Navbar/BottomNav/WinTicker/QuickActions.
- User /login now rejects admin-role accounts with generic "Invalid credentials." (hides admin from user portal).
- Daily free coin (login streak) reward raised from 5 → 20 (backend DEFAULT_CONFIG.streak_config.daily_bonus=20 + live DB config updated + GET /api/streak & POST /api/streak/claim credit 20).
- Verified: testing_agent iter8 — backend 3/3, frontend 6/6 flows PASS.

## Iteration 9 — Games Hub, Aviator & Tower frontend (2026-06)
- `/home` is now the **Games Hub** (3 cards: Stopwatch, Aviator, Tower + daily reward + onboarding guide). Bottom-nav "Home" renamed "Games".
- Stopwatch moved to `/games/stopwatch` (back button to hub). Fixed eslint hook warnings (GameHome, Navbar).
- **Aviator** `/games/aviator`: canvas crash game (parallax stars/ridges/grid, glowing curve, shaded animated plane with exhaust trail, crash explosion), big live multiplier, bet + quick chips, Auto Cash-out at X, CASH OUT button with live win, recent crash history pills (localStorage).
- **Tower** `/games/tower`: Easy/Medium/Hard (4/3/2 tiles, 1 bomb, 8 rows), rows bottom→top with per-row multiplier, gems/bombs, reveal all bombs on loss/cashout, Cash Out anytime.
- Verified iteration_9: backend 9/9, all frontend flows pass.

## Backlog
- P1: Clean template for duplicating project per client.
- P2: Admin UI controls for aviator_config/tower_config; WebSockets for rooms; Streak ladder; admin dashboard summary; refactor server.py into routers.

## Iteration 13-14 — Race Multiplayer for all games, AI demo videos, Nest Egg (2026-06)
- **Race mode** (`backend/race.py`, `/api/race/*`): Aviator, T Mines, Chicken, Tower (stack), Vortex playable in **1v1** (2 players, winner 1.8x), **Rooms** (2-8, 10% fee, top score takes pool) and **Play with Friends** (RF code, host start, 1v1 2x / group winner takes all, 0 fee). Same provably-fair seed for all players; score = multiplier banked (stack = height + speed bonus). Ties go to the earlier finisher; all-zero means refund. Bots fill public rooms after 30s (bot_config). Moves reuse the normal game endpoints; settle hooks skip wallet credits for race sessions. Aviator race hides crash_point (new `/games/aviator/status` poll); a late cashout after the crash is rejected (0.6s grace, solo too). Tower bombs and chicken hazard are hidden in race responses.
- Stopwatch keeps the old rooms. The /1v1 and /multiplayer pages are now ModeLobby with game tabs; race lobby page `/race/:id`; game pages accept `?race=<id>` (RaceBar, bet hidden, one run).
- **AI demo videos** (Kling v3 via fal.ai, Universal Key) in `frontend/public/videos/{sm,hd}/*.webm|mp4` (generator: `backend/scripts/gen_demo_videos.py`). Hub cards loop the videos. First-time "How to play" popup per game + per category (1v1/rooms/friends), plus a Help button.
- Chicken: animated golden nest egg cracks open to reveal the winnings; lane multipliers shown in a grid; road scrolls into view.
- Removed the Provably Fair panel from the Chicken/Vortex pages. Admin header aligned (max-w-7xl). Profile earned shows 2 decimals. stack mp_enabled default False; chicken default mode medium.
- Tests: iteration_13/14 (backend race tests 23/24 pass; 1 flaky balance assertion due to concurrent rooms).

## Backlog
- P1: Live real-time spectating of race opponents (WebSocket), race history in Profile.
- P2: Admin config for race fees/multipliers; cleanup of abandoned race sessions; split games_extra.py (>1000 lines).

## Iteration 15 — POT24 rebrand (2026-06)
- Brand renamed TIMEUP/PAZER → **POT24** everywhere (site, admin, tab title, favicon, manifest, share texts, support email support@pot24.com, backend strings; new referral codes/usernames use a P24 prefix).
- Logo assets in `frontend/public/brand/` (transparent logo_512/240, crown.png + base.png for the animation, icon_192/512, favicon). Source cleanup script: `backend/scripts/logo_clean.py`.
- Black & gold luxury theme: tailwind `pazer.red` is now gold #f5b301 (class names unchanged); primary buttons use a gold gradient with dark text (index.css "POT24 brand system"); shadcn vars are gold; admin moved from navy/blue to black/gold; game accents are warm golds; 3D scenes retinted (Aviator, Tower stack).
- Animations: `components/BrandIntro.js`. Login → /splash (crown drops onto the logo, gold shine sweep, "Welcome, Royalty"); admin login → /splash?to=admin ("Command Center"); logout → /bye (crown lifts off, "See you soon") for players and admin (?to=admin).
- New Landing (/welcome) with the logo hero and a 6-game video grid.
- 9 demo videos regenerated in black & gold (Kling v3); posters in /videos/poster.
- Test: iteration_15 (frontend 92%, contrast issues fixed afterwards).

## Iteration 16 — Reference redesign + 7 new games (2026-06)
- Reference screens saved in /app/reference (mlgame.co style). Brand kept as POT24; login stays mobile+password.
- **New games** (`backend/house_games.py`, router /api/house/*):
  - Color Prediction (30s global rounds: colour/number/big-small) and Matka (120s draws: single 9x / jodi 90x). A settle loop runs inside the backend; the seed is revealed after settle.
  - Andar Bahar, Teen Patti (instant vs house), Break the 10 (hit/stand vs dealer).
  - Ludo Lite (2 tokens, 30 squares, vs bot) and Call Break Lite (5 cards, 3 bots, spades trump). Both are server-authoritative.
  - Admin config in the Mongo `house_config` doc (payouts/limits via PUT /api/admin/house/config).
- **Admin can set results**: POST /api/admin/house/control (aviator force crash for N rounds, color/matka result for the current round). Overridden rounds hide their seed (marked admin_set); every change is audit-logged.
- GET /api/admin/dashboard (KPIs, deposits vs withdrawals series, game-wise wagered, live users, pending withdrawals, fraud alerts, agents/top referrers). GET /api/profile/summary. GET /api/feed/live (real deposits/withdrawals masked, today's jackpot = biggest win).
- **Frontend**:
  - New header (hamburger drawer + centred logo + ₹ balance pill) and bottom nav (Home / VIP Club / Daily Bonus / Offers / Rewards → /club/:tab).
  - Home redesigned like the reference (balance card, jackpot, Popular Games, Bet on Player, 1v1/Rooms, live deposits/withdrawals, Refer & Earn).
  - New pages: /games/color, /matka, /andar, /teen, /break10, /ludo, /callbreak, /games/all, /bet-on-player (Daily Slots UI is local-only), /club/*.
  - Profile summary block, admin dashboard on the Overview tab, Aviator FUN MODE (virtual coins), fiery login restyle.
- Game art in /frontend/public/games (AI generated).
- Tests: iteration_16 (backend 100%, frontend ~92%; all reported issues fixed afterwards).

## Backlog
- P1: Real scheduled Daily Slot tournaments (Bet on Player) with entry fees and leaderboards; real-time PvP Ludo/Call Break between humans.
- P1: Matka "rooms" creator from the admin reference; agent sub-accounts with their own commission.
- P2: Split Admin.js (820 lines) and games_extra.py; aviator start still returns crash_point to the client (pre-existing).
