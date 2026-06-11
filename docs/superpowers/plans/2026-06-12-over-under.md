# Over/Under Goals Market Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Spec: Amendment A1 in docs/superpowers/specs/2026-06-11-live-betting-design.md. Follow existing codebase conventions (stable error codes, synchronous transactions, ×4/×100 encodings, SSE-after-commit, TDD).

**Goal:** Add the `ou` (total goals) market alongside `ah`, per Amendment A1. Both markets run independently per match; identical Malay pricing, quarter-line splitting, live-offset semantics, limits, and settlement.

### Task O1 — Schema + engine

- `lines.market` text enum ('ah'|'ou') NOT NULL DEFAULT 'ah'; unique index becomes (matchId, market, version). Regenerate migration as an additive 0001 migration (dev dbs exist — do NOT rewrite 0000).
- `bets.side` enum widened to 'fav'|'dog'|'over'|'under' (TS-level).
- `gradeBet`: add `market: 'ah'|'ou'` to GradeInput. For `ou`: margin over = `4*(effFav+effDog) − ballQ`; under mirrored; everything else (quarter split, Malay payouts, single rounding, statuses, validation incl. side-market pairing: fav/dog⇔ah, over/under⇔ou else throw) identical.
- Exhaustive hand-computed O/U test table mirroring the AH table: full/half/quarter lines × over/under × ±price × live offsets × tie-rounding pins × invalid side-market combos.

### Task O2 — Lines, bets, settlement plumbing

- `lines/manage.ts`: activeLine/latestLine/postLine/setLineStatus take `market`; versioning and one-active-line are per (match, market); SSE payloads include market. Admin lines route accepts market (validated); matches GET returns `{ line, ouLine }` (latest per market).
- `placeBet`: request gains `market`; version check against that market's line; side validated against market; score snapshot/limits/day logic unchanged (limits span both markets — already true since they sum bets by match).
- `settleMatch.gradeMatchTickets`: pass each bet's line.market into gradeBet (eff scores unchanged).
- Tests: per-market versioning independence; ou bet placement happy/stale/suspended; ou grading on confirmFinalScore incl. live offset.

### Task O3 — UI + i18n

- Admin Lines desk: two stacked market editors per match (AH as today; O/U: goals-line stepper default 2.5, price, post/suspend/resume/close); show both current lines with versions.
- MatchCard: second button pair `O {goals}` (green) / `U {goals}` (blue) when ouLine active; suspended/closed states per market.
- BetSlip: handles ou picks (label `Over 2.5 @ 0.90`), preview math identical; submits market.
- pickLabel/format: ou variant. i18n keys `over`/`under` (+ Burmese: ဂိုးပေါ်/ဂိုးအောက်) both dicts.
- Tickets (DOM+PNG), bets list, balance items, /t verification page render ou picks.

### Task O4 — Smoke + docs

- API smoke: post both markets on one match; bet all four sides; live ou bet at 1-0; confirm final; hand-verify all nets; settle.
- CLAUDE.md money-encoding note mentions market; spec/plan cross-references updated.
