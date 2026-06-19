# User Tiers & Per-User Bet Limits — Implementation Plan (Feature A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `standard`/`pro` player tiers with configurable standard-tier caps (per-bet, outstanding, bets-per-match) enforced in the bet core, plus admin tier assignment, editable caps, and exposure widgets on the admin dashboard.

**Architecture:** A new `players.tier` column + 3 `settings` cap columns. `placeBet` gains a standard-only tier block (after the existing house-limit block); Pro and `recordBet` bypass it. House daily-pool/carve-out/global MIN-MAX still apply to everyone. Admin UI: tier toggle (Players), cap inputs (Settings), 4 exposure widgets (Overview via the `dashboard()` query).

**Tech Stack:** Next.js 16 App Router, Drizzle/Postgres (pg-core), better stack already in repo, vitest, Tailwind v4 dark tokens, i18n EN/MM (parity test).

**Branch:** `feature/user-tiers` (created; spec committed `3236cf0`). All commits land here.

---

## File Structure

**Modify:**

- `src/lib/db/schema.ts` — add `players.tier`; add 3 `settings` cap columns.
- `drizzle/0005_user_tiers.sql` (+ meta) — migration (generated).
- `src/lib/bets/place.ts` — standard-tier enforcement block in `placeBet`.
- `src/lib/client/errMsg.ts` — map 3 new codes.
- `src/lib/i18n/en.ts` + `mm.ts` — 3 new keys.
- `src/lib/auth/adminActions.ts` — `setTier()` admin action (audit-logged).
- `src/app/api/admin/players/route.ts` — `set_tier` action; include `tier` in the list.
- `src/app/admin/players/page.tsx` — tier badge + Standard/Pro toggle.
- `src/app/api/admin/settings/route.ts` — accept/validate the 3 caps.
- `src/app/admin/settings/page.tsx` — 3 cap inputs.
- `src/lib/accounting/dashboard.ts` — add `exposure` (4 widgets' data).
- `src/app/admin/page.tsx` — render the 4 widgets.

**Test:**

- `src/lib/bets/place.test.ts` — tier rejections + Pro/recordBet bypass + house-pool-still-applies-to-pro.
- `src/lib/accounting/dashboard.test.ts` — exposure numbers.
- `src/lib/i18n/i18n.test.ts` — parity (auto).

---

## Task 1: Schema + migration

**Files:** Modify `src/lib/db/schema.ts`; generate `drizzle/0005_user_tiers.sql`.

- [ ] **Step 1: Add `tier` to `players`.** In the `players` pgTable, after the `role` column add:

```ts
  tier: text("tier", { enum: ["standard", "pro"] })
    .notNull()
    .default("standard"),
```

- [ ] **Step 2: Add the 3 cap columns to `settings`.** In the `settings` pgTable, after `cancelWindowSeconds` add:

```ts
  stdMaxStakeMmk: bigint("std_max_stake_mmk", { mode: "number" })
    .notNull()
    .default(500_000),
  stdOutstandingMmk: bigint("std_outstanding_mmk", { mode: "number" })
    .notNull()
    .default(1_000_000),
  stdMaxBetsPerMatch: integer("std_max_bets_per_match").notNull().default(2),
```

(`bigint`/`integer`/`text` are already imported in schema.ts.)

- [ ] **Step 3: Generate the migration.**

Run: `npx drizzle-kit generate --name user_tiers`
Expected: creates `drizzle/0005_user_tiers.sql` adding the 4 columns with defaults, plus journal/snapshot entries. (Defaults backfill existing rows — no data migration needed.)

- [ ] **Step 4: Verify it applies (PGlite/migrate) via build/test bootstrap.**

Run: `npx vitest run src/lib/i18n/i18n.test.ts`
Expected: PASS (createTestDb applies migrations incl. 0005 with no error).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/db/schema.ts drizzle/0005_user_tiers.sql drizzle/meta
git commit -m "feat(tiers): players.tier + settings standard caps + migration 0005"
```

---

## Task 2: `placeBet` standard-tier enforcement + tests

**Files:** Modify `src/lib/bets/place.ts`; Test `src/lib/bets/place.test.ts`.

- [ ] **Step 1: Write failing tests.** Add to `place.test.ts` (helpers `seedMatch`, `postLine`, `placeBet`, `recordBet` already exist; seedMatch default kickoff is future). Player id 2 is `standard` by default; create a pro via direct update. Use a fresh settings row (beforeEach inserts settings id=1 — ensure caps default via migration; if the test seeds settings explicitly, include the new cap columns or rely on defaults by not overriding them):

```ts
it("standard tier: rejects a bet over the per-bet cap", async () => {
  const m = await seedMatch(db);
  const line = await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
      priceOppC: -98,
    },
    NOW,
  );
  await expect(
    placeBet(
      db,
      2,
      {
        matchId: m.id,
        market: "ah",
        lineVersion: line.version,
        side: "fav",
        stakeMmk: 600_000,
      },
      NOW,
    ),
  ).rejects.toThrow(/per bet/i);
});

it("standard tier: rejects when outstanding cap would be exceeded", async () => {
  const m = await seedMatch(db);
  const line = await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
      priceOppC: -98,
    },
    NOW,
  );
  // two 500k bets = 1,000,000 pending (at cap)
  await placeBet(
    db,
    2,
    {
      matchId: m.id,
      market: "ah",
      lineVersion: line.version,
      side: "fav",
      stakeMmk: 500_000,
    },
    NOW,
  );
  const m2 = await seedMatch(db, { homeTeam: "ARG", awayTeam: "GER" });
  const l2 = await postLine(
    db,
    1,
    {
      matchId: m2.id,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
      priceOppC: -98,
    },
    NOW,
  );
  await placeBet(
    db,
    2,
    {
      matchId: m2.id,
      market: "ah",
      lineVersion: l2.version,
      side: "fav",
      stakeMmk: 500_000,
    },
    NOW,
  );
  // third bet (any size) → over the 1,000,000 outstanding cap
  const m3 = await seedMatch(db, { homeTeam: "FRA", awayTeam: "ESP" });
  const l3 = await postLine(
    db,
    1,
    {
      matchId: m3.id,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
      priceOppC: -98,
    },
    NOW,
  );
  await expect(
    placeBet(
      db,
      2,
      {
        matchId: m3.id,
        market: "ah",
        lineVersion: l3.version,
        side: "fav",
        stakeMmk: 10_000,
      },
      NOW,
    ),
  ).rejects.toThrow(/open bets/i);
});

it("standard tier: rejects more than max bets per match", async () => {
  const m = await seedMatch(db);
  const line = await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
      priceOppC: -98,
    },
    NOW,
  );
  await placeBet(
    db,
    2,
    {
      matchId: m.id,
      market: "ah",
      lineVersion: line.version,
      side: "fav",
      stakeMmk: 50_000,
    },
    NOW,
  );
  await placeBet(
    db,
    2,
    {
      matchId: m.id,
      market: "ah",
      lineVersion: line.version,
      side: "dog",
      stakeMmk: 50_000,
    },
    NOW,
  );
  await expect(
    placeBet(
      db,
      2,
      {
        matchId: m.id,
        market: "ah",
        lineVersion: line.version,
        side: "fav",
        stakeMmk: 50_000,
      },
      NOW,
    ),
  ).rejects.toThrow(/per match/i);
});

it("pro tier: bypasses per-bet and outstanding caps", async () => {
  await db
    .update(schema.players)
    .set({ tier: "pro" })
    .where(eq(schema.players.id, 2));
  const m = await seedMatch(db);
  const line = await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
      priceOppC: -98,
    },
    NOW,
  );
  const bet = await placeBet(
    db,
    2,
    {
      matchId: m.id,
      market: "ah",
      lineVersion: line.version,
      side: "fav",
      stakeMmk: 5_000_000,
    },
    NOW,
  );
  expect(bet.stakeMmk).toBe(5_000_000);
});
```

(Import `eq` and `schema` already present in the test.)

- [ ] **Step 2: Run; verify they fail.**

Run: `npx vitest run src/lib/bets/place.test.ts`
Expected: the 3 reject tests FAIL (bets currently succeed); pro test passes.

- [ ] **Step 3: Implement the tier block in `placeBet`.** In `src/lib/bets/place.ts`, INSIDE the `db.transaction`, AFTER the house-limit block (the `if (match.betLimitMmk != null) { … } else { … }`) and BEFORE `const rest = {`:

```ts
// Per-user tier caps — standard only. Pro bypasses; house limits above
// already applied to everyone. recordBet() does not run this block.
const [bettor] = await tx
  .select({ tier: schema.players.tier })
  .from(schema.players)
  .where(eq(schema.players.id, playerId));
if (bettor?.tier !== "pro") {
  const [cfg2] = await tx.select().from(schema.settings);
  const maxStake = cfg2?.stdMaxStakeMmk ?? 500_000;
  const maxOutstanding = cfg2?.stdOutstandingMmk ?? 1_000_000;
  const maxPerMatch = cfg2?.stdMaxBetsPerMatch ?? 2;
  if (input.stakeMmk > maxStake)
    throw err(
      `max ${fmt(maxStake)} MMK per bet for your account`,
      400,
      "tier_bet_limit",
      { maxMmk: maxStake },
    );
  const [pend] = await tx
    .select({
      s: sql<number>`coalesce(sum(${schema.bets.stakeMmk}), 0)`.mapWith(Number),
    })
    .from(schema.bets)
    .where(
      and(
        eq(schema.bets.playerId, playerId),
        eq(schema.bets.status, "pending"),
      ),
    );
  const remaining = maxOutstanding - pend.s;
  if (input.stakeMmk > remaining)
    throw err(
      `you can place only ${fmt(Math.max(remaining, 0))} MMK more in open bets`,
      409,
      "tier_outstanding_limit",
      { remainingMmk: Math.max(remaining, 0) },
    );
  const [cnt] = await tx
    .select({ c: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.bets)
    .where(
      and(
        eq(schema.bets.playerId, playerId),
        eq(schema.bets.matchId, match.id),
        ne(schema.bets.status, "void"),
      ),
    );
  if (cnt.c >= maxPerMatch)
    throw err(
      `max ${maxPerMatch} bets per match for your account`,
      409,
      "tier_match_bets",
      { maxBets: maxPerMatch },
    );
}
```

(`and`, `eq`, `ne`, `sql` are already imported in place.ts; `fmt`/`err` already defined.)

- [ ] **Step 4: Run; verify all pass.**

Run: `npx vitest run src/lib/bets/place.test.ts`
Expected: PASS (all, including the 3 new rejects + pro bypass).

- [ ] **Step 5: Add a recordBet-bypass + pro-still-hits-house-pool test, then run.**

```ts
it("recordBet bypasses tier caps", async () => {
  const m = await seedMatch(db);
  await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
      priceOppC: -98,
    },
    NOW,
  );
  const bet = await recordBet(
    db,
    1,
    {
      playerId: 2,
      matchId: m.id,
      market: "ah",
      side: "fav",
      stakeMmk: 9_000_000,
    },
    NOW,
  );
  expect(bet.stakeMmk).toBe(9_000_000);
});

it("pro still bound by the house daily pool", async () => {
  await db
    .update(schema.players)
    .set({ tier: "pro" })
    .where(eq(schema.players.id, 2));
  await db.update(schema.settings).set({ dailyTotalLimitMmk: 300_000 });
  const m = await seedMatch(db);
  const line = await postLine(
    db,
    1,
    {
      matchId: m.id,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
      priceOppC: -98,
    },
    NOW,
  );
  await expect(
    placeBet(
      db,
      2,
      {
        matchId: m.id,
        market: "ah",
        lineVersion: line.version,
        side: "fav",
        stakeMmk: 400_000,
      },
      NOW,
    ),
  ).rejects.toThrow(/house can accept/i);
});
```

Run: `npx vitest run src/lib/bets/place.test.ts` → PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/bets/place.ts src/lib/bets/place.test.ts
git commit -m "feat(tiers): enforce standard per-bet/outstanding/per-match caps in placeBet"
```

---

## Task 3: Error messages + i18n

**Files:** Modify `src/lib/client/errMsg.ts`, `src/lib/i18n/en.ts`, `src/lib/i18n/mm.ts`.

- [ ] **Step 1: Map the 3 codes in `errMsg.ts`.** Add a block mirroring the existing `limit_reached` handling (which substitutes `{n}`). After the `limit_reached` block:

```ts
if (code === "tier_bet_limit") {
  const n = (e as { extra?: Record<string, unknown> }).extra?.maxMmk;
  if (typeof n === "number")
    return t.errTierBetLimit.replace("{n}", n.toLocaleString("en-US"));
}
if (code === "tier_outstanding_limit") {
  const n = (e as { extra?: Record<string, unknown> }).extra?.remainingMmk;
  if (typeof n === "number")
    return t.errTierOutstanding.replace("{n}", n.toLocaleString("en-US"));
}
if (code === "tier_match_bets") {
  const n = (e as { extra?: Record<string, unknown> }).extra?.maxBets;
  if (typeof n === "number")
    return t.errTierMatchBets.replace("{n}", String(n));
}
```

- [ ] **Step 2: Add keys to `en.ts`** (anywhere in the object; near the other `err*` keys):

```ts
  errTierBetLimit: "Max {n} MMK per bet for your account",
  errTierOutstanding: "You can place only {n} MMK more in open bets",
  errTierMatchBets: "Max {n} bets per match for your account",
```

- [ ] **Step 3: Add the same keys to `mm.ts`:**

```ts
  errTierBetLimit: "သင့်အကောင့်အတွက် တစ်ကြိမ်လျှင် အများဆုံး {n} MMK",
  errTierOutstanding: "ဖွင့်ထားသော လောင်းကြေးများတွင် နောက်ထပ် {n} MMK သာ ထည့်နိုင်သည်",
  errTierMatchBets: "သင့်အကောင့်အတွက် ပွဲတစ်ပွဲလျှင် အများဆုံး {n} ကြိမ်",
```

- [ ] **Step 4: Run parity + lint.**

Run: `npx vitest run src/lib/i18n/i18n.test.ts && npm run lint`
Expected: parity PASS, lint clean.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/client/errMsg.ts src/lib/i18n/en.ts src/lib/i18n/mm.ts
git commit -m "feat(tiers): tier-limit error messages (en/mm)"
```

---

## Task 4: Admin tier assignment (Players)

**Files:** Modify `src/lib/auth/adminActions.ts`, `src/app/api/admin/players/route.ts`, `src/app/admin/players/page.tsx`.

- [ ] **Step 1: Add `setTier` admin action** in `src/lib/auth/adminActions.ts` (follow the pattern of `grantAdmin`/`unlockPlayer` there — read the file). Add:

```ts
export async function setTier(
  db: Db,
  adminId: number,
  playerId: number,
  tier: "standard" | "pro",
  at: string,
) {
  await db
    .update(schema.players)
    .set({ tier })
    .where(eq(schema.players.id, playerId));
  await db.insert(schema.auditLog).values({
    actorId: adminId,
    action: "set_tier",
    subject: `player:${playerId}`,
    detail: tier,
    at,
  });
}
```

(Match the existing imports/signature style in that file.)

- [ ] **Step 2: Wire the route action** in `src/app/api/admin/players/route.ts`. Import `setTier`. In the action dispatch, add before the `bad_action` fallback:

```ts
    } else if (action === "set_tier") {
      const tier = body.tier;
      if (tier !== "standard" && tier !== "pro")
        return fail("bad_request", "tier must be 'standard' or 'pro'");
      await setTier(db, admin.id, playerId, tier, nowIso());
```

Also ensure the GET players list selects `tier` (add `tier: schema.players.tier` to the select, and to the `Player` type the page uses).

- [ ] **Step 3: Players page tier badge + toggle.** In `src/app/admin/players/page.tsx`, add `tier` to the local `Player` type; render a badge (`pro` → `bg-gold/15 text-gold`, `standard` → `bg-raised text-muted`) and a button that calls `api("/api/admin/players", { action: "set_tier", playerId: p.id, tier: p.tier === "pro" ? "standard" : "pro" })` then reloads. Label: `p.tier === "pro" ? "Make standard" : "Make pro"`. Dark tokens, focus ring.

- [ ] **Step 4: Build + lint.**

Run: `npm run build && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/auth/adminActions.ts src/app/api/admin/players/route.ts src/app/admin/players/page.tsx
git commit -m "feat(tiers): admin set player tier (Players page)"
```

---

## Task 5: Configurable caps (Settings)

**Files:** Modify `src/app/api/admin/settings/route.ts`, `src/app/admin/settings/page.tsx`.

- [ ] **Step 1: Accept + validate the caps in the settings POST.** Read `src/app/api/admin/settings/route.ts`; it destructures known fields off `body` and validates non-negative integers, then updates `settings`. Add `stdMaxStakeMmk`, `stdOutstandingMmk`, `stdMaxBetsPerMatch` to the destructure, validate each `if (x != null) { if (!Number.isInteger(x) || x < 0) return fail("bad_request", "<field> must be an integer >= 0"); }`, and include them in the `update(schema.settings).set({...})` payload (only when provided — mirror how `dailyTotalLimitMmk` is conditionally set).

- [ ] **Step 2: Settings page inputs.** In `src/app/admin/settings/page.tsx`, add a "Standard-tier limits" panel (dark: `bg-surface border-border`) with three numeric inputs bound to the loaded settings (`stdMaxStakeMmk`, `stdOutstandingMmk`, `stdMaxBetsPerMatch`) and a Save that POSTs them (reuse the page's existing save pattern). Inputs `bg-raised border-border text-ink`, focus ring `ring-us`, button `bg-us text-white`.

- [ ] **Step 3: Build + lint.**

Run: `npm run build && npm run lint`
Expected: clean.

- [ ] **Step 4: Commit.**

```bash
git add src/app/api/admin/settings/route.ts src/app/admin/settings/page.tsx
git commit -m "feat(tiers): editable standard-tier caps in admin Settings"
```

---

## Task 6: Dashboard exposure widgets

**Files:** Modify `src/lib/accounting/dashboard.ts`, `src/app/admin/page.tsx`; Test `src/lib/accounting/dashboard.test.ts`.

- [ ] **Step 1: Write a failing test** in `dashboard.test.ts` (it already seeds players, matches, bets — read it). After seeding some pending bets, assert the new `exposure` shape:

```ts
it("exposure: house outstanding, daily pool, tier breakdown, top players", async () => {
  // (reuse the file's existing seed of pending bets for `today`)
  const d = await dashboard(db, TODAY);
  expect(d.exposure.houseOutstandingMmk).toBeGreaterThan(0);
  expect(d.exposure.tier.standard + d.exposure.tier.pro).toBeGreaterThan(0);
  expect(Array.isArray(d.exposure.topPlayers)).toBe(true);
  expect(d.exposure).toHaveProperty("dailyPoolLimitMmk");
  expect(d.exposure).toHaveProperty("dailyPoolUsedMmk");
});
```

(Use the test file's existing `TODAY`/seed constants; if names differ, adapt.)

- [ ] **Step 2: Run; verify it fails.**

Run: `npx vitest run src/lib/accounting/dashboard.test.ts`
Expected: FAIL (`exposure` undefined).

- [ ] **Step 3: Add `exposure` to `dashboard()`** in `src/lib/accounting/dashboard.ts`. Before the `return`, compute:

```ts
const pendingStake =
  sql<number>`coalesce(sum(${schema.bets.stakeMmk}), 0)`.mapWith(Number);

const [houseOut] = await db
  .select({ s: pendingStake })
  .from(schema.bets)
  .where(eq(schema.bets.status, "pending"));

// daily pool: non-carve-out matches today, non-void stake (mirrors place.ts pool)
const [pool] = await db
  .select({
    s: sql<number>`coalesce(sum(${schema.bets.stakeMmk}), 0)`.mapWith(Number),
  })
  .from(schema.bets)
  .innerJoin(schema.matches, eq(schema.bets.matchId, schema.matches.id))
  .where(
    and(
      ne(schema.bets.status, "void"),
      eq(schema.matches.matchDay, today),
      sql`${schema.matches.betLimitMmk} is null`,
    ),
  );
const [cfg] = await db.select().from(schema.settings);
const dailyPoolLimitMmk = cfg?.dailyTotalLimitMmk ?? 0;

const tierRows = await db
  .select({
    tier: schema.players.tier,
    c: sql<number>`count(*)`.mapWith(Number),
  })
  .from(schema.players)
  .groupBy(schema.players.tier);
const tier = {
  standard: tierRows.find((r) => r.tier === "standard")?.c ?? 0,
  pro: tierRows.find((r) => r.tier === "pro")?.c ?? 0,
};

const topRows = await db
  .select({
    playerId: schema.bets.playerId,
    name: schema.players.displayName,
    s: pendingStake,
  })
  .from(schema.bets)
  .innerJoin(schema.players, eq(schema.bets.playerId, schema.players.id))
  .where(eq(schema.bets.status, "pending"))
  .groupBy(schema.bets.playerId, schema.players.displayName)
  .orderBy(sql`sum(${schema.bets.stakeMmk}) desc`)
  .limit(5);
```

Then add to the returned object:

```ts
    exposure: {
      houseOutstandingMmk: houseOut.s,
      dailyPoolLimitMmk,
      dailyPoolUsedMmk: pool.s,
      tier,
      topPlayers: topRows.map((r) => ({ name: r.name, outstandingMmk: r.s })),
    },
```

(`and`, `eq`, `ne`, `sql` already imported in dashboard.ts.)

- [ ] **Step 4: Run; verify pass.**

Run: `npx vitest run src/lib/accounting/dashboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Render the widgets** in `src/app/admin/page.tsx`. The page consumes the dashboard payload (read it for the type/shape). Add an "Exposure" section (dark cards `bg-surface border-border`) showing:
  - House outstanding: `mmk(exposure.houseOutstandingMmk)` MMK.
  - Daily pool: `mmk(dailyPoolUsedMmk)` / `dailyPoolLimitMmk === 0 ? "∞" : mmk(dailyPoolLimitMmk)` used, with remaining = `max(limit - used, 0)` when limit > 0.
  - Tier breakdown: `Standard {tier.standard} · Pro {tier.pro}`.
  - Top exposures: list `topPlayers` (name + `mmk(outstandingMmk)`), or "—" if empty.
    Add `tier`/`exposure` to the page's local payload type. Use `mmk` from `@/lib/client/format`.

- [ ] **Step 6: Build + lint.**

Run: `npm run build && npm run lint`
Expected: clean.

- [ ] **Step 7: Commit.**

```bash
git add src/lib/accounting/dashboard.ts src/lib/accounting/dashboard.test.ts src/app/admin/page.tsx
git commit -m "feat(tiers): admin dashboard exposure widgets"
```

---

## Task 7: Full verify + deploy

**Files:** none.

- [ ] **Step 1: Full gate.**

Run: `npm run lint && npm test && npm run build`
Expected: lint clean; all tests pass (incl. the new tier + dashboard tests + i18n parity); build green.

- [ ] **Step 2: Merge + deploy** (after review).

```bash
git checkout main && git merge --ff-only feature/user-tiers && git push origin main
cd /mnt/hermes-data/mmzphyo/Worldbet && git pull && npm run db:migrate && npm run build && \
  sudo systemctl restart worldbet worldbet-staging
```

> NOTE: this feature has a migration (0005) — run `npm run db:migrate` on the prod folder (with `DATABASE_URL` from `.env.local`) BEFORE/at deploy, unlike the pure-UI deploys. Verify both services healthy and `/admin` dashboard shows the exposure widgets.

- [ ] **Step 3: Manual smoke (staging first):** promote a player to pro (caps lift), set a low `stdMaxStakeMmk` in Settings and confirm a standard bet over it is rejected with the message; place 2 bets on one match as standard and confirm the 3rd is blocked; dashboard widgets show sensible numbers.

---

## Notes for the implementer

- Money core: the `placeBet` tier block must sit INSIDE the existing transaction (after the house-limit block) so the pending-sum + match-count reads are consistent under the row locks already taken. Do not add tier checks to `recordBet`.
- `grade.ts` is untouched.
- Migration 0005 needs `npm run db:migrate` at deploy (not just build) — call it out in the deploy.
- Use the `frontend-design` skill for the admin Settings/Players/dashboard UI bits (dark tokens).
