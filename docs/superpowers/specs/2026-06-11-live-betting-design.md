# WorldBet2026 — Live Betting Web App: Design Spec

**Date:** 2026-06-11
**Status:** Approved design, pending implementation plan

## 1. Purpose

A mobile web app for a small, private group of friends to bet on FIFA World Cup 2026 matches against one admin who acts as the bookie. Real money (MMK) settles in cash/transfer outside the app, same match day. The app is the referee: it records bets tamper-proofly, grades them, and produces per-day accounting both sides trust.

Not in scope: public users, deposits/withdrawals, payment integration, forgot-PIN flows, any bet type other than Asian handicap.

## 2. Users and roles

- **Player** — registers with an invite code; bets against the house; settles in person.
- **Admin (bookie, one or more)** — posts and moves lines, suspends betting, enters scores, runs settlement, manages players (PIN resets, voids), configures limits. Admins use the same login; an `admin` flag unlocks the admin screens.

Scale assumption: tens of users, one server. All design choices favor simplicity over scale.

## 3. Architecture

- **Next.js 16 (App Router) monolith** — player UI, admin UI, and API route handlers in the one existing app. TypeScript, Tailwind v4.
- **SQLite via Drizzle ORM** — single database file, WAL mode. Nightly backup by file copy (cron).
- **Server-Sent Events** — one `/api/stream` endpoint pushes line changes, suspensions, score updates, and day-close events to connected clients. Clients auto-reconnect (native EventSource behavior).
- **Sessions** — phone + PIN login sets a signed, httpOnly, secure cookie, 30-day validity.
- **Money** — integer MMK everywhere. No floats touch money.
- **Time** — stored UTC, displayed in Asia/Yangon (MMT, UTC+6:30). A match's `match_day` = its kickoff date in MMT.
- **Languages** — full UI in English and Burmese, per-player toggle, preference stored on the player row. Team names, numbers, and prices are not translated.

## 4. Auth and accounts

- **Registration:** invite code → phone → display name → 6-digit PIN (entered twice). Phone normalized so `09…` and `+959…` are one identity. No SMS verification — the invite code is the gate; an unexpired code admits any phone number.
- **Login:** phone + PIN on a numeric-keypad UI. Success → 30-day session cookie.
- **PIN storage:** bcrypt. Never logged, never displayed.
- **Lockout:** 5 consecutive failures lock the account 15 minutes; admin can unlock early.
- **Admin PIN reset:** admin sets a temporary PIN; player must choose a new PIN at next login; all existing sessions for that player are invalidated.
- **Change PIN:** in profile, requires current PIN.
- **First admin** seeded at deploy (script/env). Admins can grant the admin flag to others.
- **Invite codes:** admin-generated, with max-use count and expiry.

## 5. Data model

Tables (Drizzle/SQLite):

| Table | Key fields |
|---|---|
| `players` | phone (unique), pin_hash, display_name, role (`player`/`admin`), language (`en`/`mm`), failed_pin_attempts, locked_until, must_change_pin |
| `invite_codes` | code, max_uses, used_count, expires_at, created_by |
| `matches` | stage, home_team, away_team, kickoff_utc, venue, match_day (MMT date), status (`scheduled`/`live`/`finished`), home_score, away_score, score_confirmed_at, bet_limit_mmk (nullable per-match cap), external_api_id (nullable, post-MVP feed) |
| `lines` | match_id, version (per match, incrementing), fav_side (`home`/`away`), ball (0, 0.25, 0.5, … stored ×4 as integer), price_malay (signed, stored ×100 as integer), status (`active`/`suspended`/`closed`), posted_by, posted_at |
| `bets` | ticket_no (unique, `WB-` + 5 chars, ambiguous chars excluded), player_id, match_id, line_id, side (`fav`/`dog`), stake_mmk, score_home_at_bet, score_away_at_bet, placed_at, status (`pending`/`won`/`half_won`/`push`/`half_lost`/`lost`/`void`), net_mmk (signed, set at grading), settled_at, settlement_id (nullable), voided_by, void_reason |
| `match_days` | date (MMT), status (`open`/`closed`/`settled`), closed_at |
| `settlements` | ref (`S-MMDD-NN`), match_day_id, player_id, net_mmk, marked_by, marked_at |
| `settings` | single row: daily_total_limit_mmk (0 = unlimited), ticket_secret_version |
| `audit_log` | actor_id, action (pin_reset, void, score_correction, limit_change, unlock), subject, detail, at |

`lines` is append-only — posting a new line closes the previous one and increments the version; the table is the audit trail of every price move. Score corrections and voids append to `audit_log`.

## 6. Lines and live betting

- One **active line per match** at most: favorite side, ball (full/half/quarter), Malay price (positive or negative).
- Admin actions per match: **post/move line** (new row, new version), **suspend** (one tap; e.g., goal just scored), **resume**, **close** (no more bets).
- Admin moves lines **manually**, including during the match. No odds feed in MVP.
- Clients receive line changes over SSE within ~1s; match cards re-render; suspended matches show "line updating" and reject taps.
- **Stale-price protection:** the bet request carries the line version the player saw. Inside the bet transaction, the server verifies that line is still the active version and not suspended/closed; otherwise the bet is rejected with the current line in the response and the slip re-renders for re-confirmation.

## 7. Betting flow

1. Player taps a side (fav/dog) on a match card → bottom-sheet bet slip.
2. Slip shows: pick, ball, price, current score + "only goals after this bet count" for live matches, stake input with 10k/50k/100k/500k/1M chips (typing allowed), and a five-outcome payout preview: win / half-win / push / half-lose / lose in signed MMK.
3. Confirm → server transaction:
   - session valid, player not locked;
   - line version is current, line active, match not finished;
   - stake ≥ 10,000 MMK (floor; no per-player cap);
   - **bet-accept limits** (section 8) not breached;
   - snapshot current score onto the bet (0–0 for pre-match);
   - insert bet, generate ticket_no.
4. Response renders the **ticket screen** (section 9). Failures return a specific reason: line moved (new price shown), suspended, limit headroom, match finished.
5. **My Bets** tab lists the player's tickets with live status; tapping reopens the full ticket.

Bets are final once accepted. Only an admin can void a ticket (dispute resolution), which is audit-logged and excludes it from grading and accounting.

## 8. Bet-accept limits

- **Daily total limit** (Settings): max sum of accepted stakes across a match day, over matches that do **not** have their own cap. 0 = unlimited.
- **Per-match limit** (optional, on the match's admin card): a match with its own cap is **carved out** — its bets are checked only against its own cap and do not consume the daily pool.
- Breaching bets are rejected with remaining headroom shown ("House can accept only 150,000 MMK more on this match day").
- Limits are changeable anytime; they affect new bets only — accepted tickets always stand.
- Limit checks happen inside the bet transaction (no race past the cap).

## 9. Tickets and QR verification

- **Ticket screen** (and any reopened ticket): ticket_no, player name, match + stage, pick (side, ball, price), stake, score at bet (with minute for live), placed time (MMT), status, QR code. Styled to be screenshot-friendly; a "Save ticket image" button also renders the card to PNG client-side.
- **QR content:** `https://<host>/t/<ticket_no>?v=<key_version>&sig=<base64url(HMAC-SHA256(ticket_secret_v, ticket_no))[:16 bytes]>`.
- **Verification page `/t/…`** — public, no login: valid signature → renders the authoritative ticket from the database (all fields above, current status, void/settlement state). Invalid signature or unknown ticket → "not a valid ticket". A doctored screenshot therefore either fails to verify or reveals the true values.
- Ticket secrets live in server env as a versioned list. Rotation adds a new version for newly issued tickets; the verifier accepts all non-revoked versions, so QR codes on already-saved screenshots keep verifying for the life of the tournament.

## 10. Grading (settlement math)

Definitions for a bet on line {fav_side, ball, price} with stake S:

- **Effective score:** final score minus score-at-bet, per team. (Pre-match bets: full final score. Live bets: only goals after the bet — score-at-bet was snapshotted at acceptance.)
- **Margin (from favorite's perspective):** `m = eff_fav_goals − eff_dog_goals − ball` for fav bets; for dog bets the sign flips: `m = ball − (eff_fav_goals − eff_dog_goals)`.
- **Full/half-ball lines:** m > 0 → win; m = 0 → push (only possible on full-ball); m < 0 → loss.
- **Quarter-ball lines:** stake splits S/2 + S/2 onto the two adjacent lines (ball ± 0.25), each half graded as above; combined result is one of win / half-win / push / half-loss / loss.
- **Malay price payouts** (p as decimal, −1 < p ≤ 1, p ≠ 0):
  - p > 0: win → `+S×p`, lose → `−S`
  - p < 0: win → `+S`, lose → `−S×|p|`
  - Halves pay half the corresponding amount; the other half-stake pushes.
- `net_mmk` stores the signed result, rounded to integer MMK (round half away from zero, applied once at grading).

Grading runs automatically when the admin confirms a match's final score: all pending tickets on that match grade in one transaction and players see statuses flip via SSE.

**Score correction:** admin can correct a confirmed score while the match day is not yet `settled`; affected tickets re-grade and day nets recompute. After settlement, corrections are blocked (the money already moved).

## 11. Accounting and settlement

- **Match day lifecycle:** `open` (bets accepted) → last match of the day graded ⇒ `closed` (nets frozen) → admin marks every player paid ⇒ `settled`. Same-day cash/transfer settlement happens outside the app.
- **Player Balance tab:** current day's running net, itemized **ticket by ticket** (ID, pick, stake, signed net) — tap a ticket ID to reopen it; previous days with settlement status and reference.
- **Admin settlement board:** per player: net for the day, ticket count, expandable identical ticket-ID list, **mark paid** button. Marking paid creates a settlement row with ref `S-MMDD-NN` and stamps `settlement_id` onto every covered ticket. Both parties verify against the same ticket list.
- **House position:** day net for the house = −Σ(player nets); shown on the board and the dashboard.

## 12. Admin module

Mobile-friendly screens:

- **Dashboard (Overview):** house P&L today and tournament-to-date; per-match stake volume, bet count, and live worst-case exposure; active player count; recent-bets feed; limit headroom for the day.
- **Lines desk:** today's matches, post/move/suspend/resume/close lines, set per-match bet limit.
- **Scores:** enter/confirm final score per match (triggers grading); correction while day unsettled.
- **Settlement board:** section 11.
- **Players:** list, lock/unlock, reset PIN (temp PIN flow), grant admin.
- **Invite codes:** generate with max uses + expiry, see usage.
- **Settings:** daily total bet limit, language defaults.

All sensitive actions (PIN reset, void, score correction, limit change) are audit-logged.

## 13. Fixtures

All 104 World Cup 2026 fixtures seeded at deploy from a static dataset: stage, teams, kickoff UTC, venue. Knockout pairings are placeholders (e.g., "Winner Group A vs Runner-up Group B") that the admin fills in as they're decided. Admin can adjust kickoff times if FIFA reschedules.

**Post-MVP:** a football data API feed maps onto `external_api_id` to auto-update schedules and live scores; admin confirmation remains the grading trigger.

## 14. Error handling

- Bet placement is one DB transaction: line-version check, limit check, score snapshot, insert — all atomic; SQLite WAL serializes writers.
- SSE disconnects reconnect automatically; on reconnect the client refetches current lines (no missed-event gap).
- Server restart loses nothing: bets/lines/grades are durable rows; clients reconnect.
- All money inputs validated server-side (integer, ≥ floor, ≤ headroom).
- Clear bilingual user-facing errors for: stale line, suspended, limit reached, match finished, account locked, bad PIN.

## 15. Testing

- **Grading engine (highest value):** pure functions covered by an exhaustive table — every ball step (0 to ±3 in 0.25 increments) × fav/dog × positive/negative Malay price × pre-match/live score offsets, asserting result class and exact net MMK.
- **Bet placement integration:** stale-version rejection, suspension rejection, limit headroom (daily and carve-out), concurrent bets racing one cap.
- **QR round-trip:** sign → verify; tampered ticket_no or sig fails.
- **Settlement flow:** grade day → close → mark paid → refs stamped; score correction re-grades only while unsettled.
- **Auth:** lockout after 5 failures, temp-PIN forced change, session invalidation on reset.

## 16. Open/post-MVP items

- Live score/schedule API feed (section 13).
- Burmese translation pass by a native speaker before launch (machine-draft acceptable for MVP review).
- Nightly SQLite backup cron + restore drill.

---

## Amendment A1 (2026-06-12): Over/Under total-goals market

Approved addition. Both markets run simultaneously and independently per match; Malay pricing identical to handicap.

- **Markets**: `lines.market` = `ah` (Asian handicap, existing) | `ou` (total goals). One active line per (match, market); versions increment per (match, market). All line lifecycle rules (§6) apply per market: post/move/suspend/resume/close, append-only audit, SSE broadcast.
- **Encoding**: the O/U goals line reuses `ballQ` ×4 (2.5 goals → 10; quarter lines 2.25/2.75 valid and split stakes exactly like handicap quarters). `priceC` unchanged (Malay ×100; price quoted for the side being bet).
- **Bet sides**: `bets.side` gains `over` | `under` (only valid with `ou` lines; `fav`/`dog` only with `ah`).
- **Grading**: margin in quarter units — over: `m = 4·(effective total goals) − ballQ`; under: mirrored. Effective total = final total − total at bet time (live O/U counts only goals scored after the bet — consistent with §10's live handicap rule). Half-split, Malay payouts, single end-rounding, and statuses are identical to handicap. Same MMK integer rules.
- **Limits/accounting**: O/U bets count toward the same per-match carve-out and daily-pool limits (a match's cap covers both its markets). Settlement, ticket, and QR mechanics unchanged.
- **UI**: match card shows two button pairs — handicap (green fav / blue dog) and totals (Over green / Under blue, labeled `O 2.5` / `U 2.5`); admin Lines desk manages the two markets per match independently; bet slip, tickets, and verification render O/U picks (e.g. `Over 2.5 @ 0.90`).

---

## Amendment A2 (2026-06-12): Player referral links

Approved. Every player gets a personal invite link (capped, works immediately); the system records who referred whom. Data is designed so a referral bonus can be added later without migration.

- **Personal invite code**: each player owns one `invite_codes` row with `kind='personal'`, `created_by`=that player, `max_uses`=`settings.default_personal_invite_uses` (default 10), far-future expiry. Generated at registration; created lazily for pre-existing players (e.g. seeded admin) on first access. Admin-generated codes get `kind='admin'`. Link form: `<APP_ORIGIN>/register?code=<code>`.
- **Invite power**: free with a cap. Any player may share their link; it works until its `max_uses` is reached. Admin retains lock/unlock and visibility. (Admin can also still mint `admin` codes with custom caps/expiry.)
- **Referrer tracking**: `players.referred_by` (nullable FK → players.id) is set at registration to the inviting code's `created_by` (a player for personal codes, the admin for admin codes). Append-only fact; never changed after registration.
- **Tracking use (now)**: admin Players list shows "invited by <name>"; player profile shows their link, remaining uses, and "you invited N friends". No money effect yet.
- **Bonus-ready**: `settings.referral_bonus_mmk` (default 0) reserved as the config home for a future per-referral bonus. With `referred_by` stored, bonus logic can be added with no schema migration — it reads the existing edge and the setting.

---

## Amendment A3 (2026-06-12): Even-money settlement model (REPLACES Malay odds)

The group does NOT settle as Malay/decimal odds. The price `p` (0 < p ≤ 1, stored ×100) is the **on-the-line payout fraction only**. Per line-part (quarter balls split into two half-stakes exactly as today):

- Result **beats** the part's line → **win full part-stake** (+S_part). Price ignored.
- Result lands **exactly on** the part's line → **win part-stake × p** (+S_part·p).
- Result **misses** the part's line → **lose full part-stake** (−S_part).

Net = sum of parts, rounded half-away-from-zero once. Identical for body (handicap) and goals (over/under), both sides, including Under/underdog landing on the line (that is a win × p, not a loss). No negative prices. Half/whole-integer lines where no exact landing is possible simply never use `p`.

**Status mapping:** net>0 all full-win → `won`; net>0 with an on-line part → `half_won`; net<0 all-lose → `lost`; net<0 with an on-line part → `half_lost`; net==0 → `push`.

**Ground-truth checksum (the 7 reference bets):** #1 MEX −1@0.30 200k, total 2–0 → +200,000; #4 KOR −0@1.00 4M, 2–1 → +4,000,000; #5 CZE +0@1.00 200k, lost → −200,000; #6 Over 2.0@0.35 200k, total 3 → +200,000; #7 Under 2.0@0.35 2M, total 3 → −2,000,000; #2 Over 2.0@0.50 200k, total **2 (on line)** → +100,000; #3 Over 2.0@0.50 4M, total **2 (on line)** → +2,000,000. **Player total +4,300,000 (banker −4,300,000).**

**Impact:** grade engine payout mapping (ball/total/quarter-split logic unchanged), bet-slip payout preview, per-bet breakdown, Lines price input (now 0.01–1.00, positive only), and the (pending) fees layer. Existing bets are re-graded; production is NOT redeployed until the re-graded numbers are confirmed against this checksum.
