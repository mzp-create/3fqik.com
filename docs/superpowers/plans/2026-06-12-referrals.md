# Player Referral Links Implementation Plan

> REQUIRED SUB-SKILL: subagent-driven-development. Spec: Amendment A2. Conventions: stable error codes, synchronous transactions, additive migration, TDD, SSE not involved.

**Goal:** Personal capped invite links per player + `referred_by` tracking, bonus-ready (Amendment A2).

### Task R1 — schema + flows + queries

- Schema (additive 0002 migration; do NOT touch 0000/0001):
  - `players.referred_by` integer nullable → `.references(() => players.id)`.
  - `invite_codes.kind` text enum ('admin'|'personal') NOT NULL DEFAULT 'admin'.
  - `settings`: `default_personal_invite_uses` integer NOT NULL DEFAULT 10; `referral_bonus_mmk` integer NOT NULL DEFAULT 0.
  - Verify migration applies on a COPY of the live dev db.
- `src/lib/auth/flows.ts registerPlayer`: inside the existing txn, after resolving the code, capture `referredBy = code.createdBy` and store on the new player; works for both admin and personal codes. (Code validity/maxUses/expiry checks unchanged.)
- New `src/lib/referrals.ts`:
  - `ensurePersonalCode(db, playerId): inviteCodes row` — returns the player's personal code, creating one if absent (randomCode reused from adminActions; kind 'personal'; maxUses from settings.default_personal_invite_uses; expiresAt far future e.g. '2027-01-01'). Idempotent (one personal code per player — guard by select first; if a race ever dups, that's benign, pick the first).
  - `referralInfo(db, playerId)`: `{ code, link?, maxUses, usedCount, referredCount }` (referredCount = players where referred_by = playerId). link built by caller (needs APP_ORIGIN).
  - `referrerName(db, playerId): string | null` (display name of the player's referrer).
- Tests (referrals.test.ts + extend flows test): registerPlayer sets referred_by to code.createdBy (admin code → admin id; personal code → that player's id); ensurePersonalCode creates once and is idempotent (second call returns same code, no dup); referralInfo counts referees and reflects usedCount after a registration; cap comes from settings.

### Task R2 — API + UI

- `src/app/api/me/invite/route.ts` GET: requirePlayer (allowMustChangePin true so even temp-PIN users can see their link? — no, keep gate; use default requirePlayer); ensurePersonalCode + referralInfo; return `{ code, link: <APP_ORIGIN>/register?code=<code>, maxUses, usedCount, referredCount }`. APP_ORIGIN from env (throw if unset, like ticketUrl).
- Profile page (player): "Invite friends" section — the link in a readonly field + Copy button (navigator.clipboard with a "Copied" flash), "X of N invites used", "You invited K friends". i18n keys for all labels (en + mm; parity test).
- Register page: read `?code=` search param (useSearchParams) and prefill the invite-code field (still editable). Wrap in Suspense if Next requires it for useSearchParams.
- Admin: `/api/admin/players` GET already returns rows — add `referredByName` (join players self). Admin Players page shows "invited by <name>" under each player (English-only admin).
- Tests: i18n parity; api/me/invite shape (unit-test referralInfo already covers logic); a basic flows assertion that a referred registration increments the referrer's referredCount.

### Task R3 — smoke + docs

- API smoke: admin's personal code via GET /api/me/invite; register a player with it → that player's profile shows referrer; admin Players shows "invited by Admin"; player gets own link, shares to a second registrant, referredCount becomes 1; cap enforced (set default to 1, second use of a personal code rejected as invite_invalid).
- CLAUDE.md: one line noting referral edge (`players.referred_by`) + personal invite codes.
