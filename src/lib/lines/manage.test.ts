import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, schema, type Db } from "@/lib/db";
import { postLine, setLineStatus, activeLine, latestLine } from "./manage";
import { hashPin } from "@/lib/auth/pin";
import { sseHub } from "@/lib/sse";

let db: Db;
const NOW = "2026-06-12T10:00:00Z";

beforeEach(() => {
  db = createTestDb();
  db.insert(schema.players)
    .values({
      phone: "09700000001",
      pinHash: hashPin("111111"),
      displayName: "A",
      role: "admin",
      createdAt: NOW,
    })
    .run();
  db.insert(schema.matches)
    .values({
      stage: "Group C",
      homeTeam: "BRA",
      awayTeam: "MEX",
      kickoffUtc: "2026-06-12T02:00:00Z",
      venue: "X",
      matchDay: "2026-06-12",
    })
    .run();
});

it("posting closes the previous line and increments version", () => {
  const l1 = postLine(
    db,
    1,
    { matchId: 1, market: "ah", favSide: "home", ballQ: 3, priceC: 92 },
    NOW,
  );
  expect(l1.version).toBe(1);
  const l2 = postLine(
    db,
    1,
    { matchId: 1, market: "ah", favSide: "home", ballQ: 4, priceC: 95 },
    NOW,
  );
  expect(l2.version).toBe(2);
  const rows = db.select().from(schema.lines).all();
  expect(rows.find((r) => r.id === l1.id)!.status).toBe("closed");
  expect(activeLine(db, 1, "ah")!.id).toBe(l2.id);
});

it("suspend/resume toggles; closed lines cannot resume; bad prices rejected", () => {
  const l = postLine(
    db,
    1,
    { matchId: 1, market: "ah", favSide: "home", ballQ: 2, priceC: 85 },
    NOW,
  );
  setLineStatus(db, 1, "ah", "suspended");
  expect(activeLine(db, 1, "ah")).toBeNull();
  setLineStatus(db, 1, "ah", "active");
  expect(activeLine(db, 1, "ah")!.id).toBe(l.id);
  setLineStatus(db, 1, "ah", "closed");
  expect(() => setLineStatus(db, 1, "ah", "active")).toThrow(/closed/);
  expect(() =>
    postLine(
      db,
      1,
      { matchId: 1, market: "ah", favSide: "home", ballQ: 2, priceC: 0 },
      NOW,
    ),
  ).toThrow();
  expect(() =>
    postLine(
      db,
      1,
      { matchId: 1, market: "ah", favSide: "home", ballQ: -1, priceC: 90 },
      NOW,
    ),
  ).toThrow();
});

it("err codes: not_found for missing match, match_finished for done match, bad_line for invalid params", () => {
  // missing match → not_found
  const e1 = (() => {
    try {
      postLine(
        db,
        1,
        { matchId: 999, market: "ah", favSide: "home", ballQ: 2, priceC: 85 },
        NOW,
      );
      return null;
    } catch (e) {
      return e as { code?: string; httpStatus?: number };
    }
  })();
  expect(e1?.code).toBe("not_found");
  expect(e1?.httpStatus).toBe(404);

  // match finished → match_finished
  db.insert(schema.matches)
    .values({
      stage: "Group C",
      homeTeam: "ARG",
      awayTeam: "ENG",
      kickoffUtc: "2026-06-12T02:00:00Z",
      venue: "Y",
      matchDay: "2026-06-12",
      status: "finished",
    })
    .run();
  const allMatches = db.select().from(schema.matches).all();
  const finishedId = allMatches.find((m) => m.status === "finished")!.id;
  const e2 = (() => {
    try {
      postLine(
        db,
        1,
        {
          matchId: finishedId,
          market: "ah",
          favSide: "home",
          ballQ: 2,
          priceC: 85,
        },
        NOW,
      );
      return null;
    } catch (e) {
      return e as { code?: string };
    }
  })();
  expect(e2?.code).toBe("match_finished");

  // invalid ball → bad_line
  const e3 = (() => {
    try {
      postLine(
        db,
        1,
        { matchId: 1, market: "ah", favSide: "home", ballQ: -1, priceC: 85 },
        NOW,
      );
      return null;
    } catch (e) {
      return e as { code?: string };
    }
  })();
  expect(e3?.code).toBe("bad_line");

  // invalid price → bad_line
  const e4 = (() => {
    try {
      postLine(
        db,
        1,
        { matchId: 1, market: "ah", favSide: "home", ballQ: 2, priceC: 0 },
        NOW,
      );
      return null;
    } catch (e) {
      return e as { code?: string };
    }
  })();
  expect(e4?.code).toBe("bad_line");
});

it("setLineStatus errors: no_line for missing matchId, line_closed for closed line", () => {
  // no line for matchId → no_line
  const e1 = (() => {
    try {
      setLineStatus(db, 999, "ah", "active");
      return null;
    } catch (e) {
      return e as { code?: string; httpStatus?: number };
    }
  })();
  expect(e1?.code).toBe("no_line");
  expect(e1?.httpStatus).toBe(404);

  // already closed → line_closed
  postLine(
    db,
    1,
    { matchId: 1, market: "ah", favSide: "home", ballQ: 2, priceC: 85 },
    NOW,
  );
  setLineStatus(db, 1, "ah", "closed");
  const e2 = (() => {
    try {
      setLineStatus(db, 1, "ah", "active");
      return null;
    } catch (e) {
      return e as { code?: string };
    }
  })();
  expect(e2?.code).toBe("line_closed");
});

it("latestLine returns null when no lines exist", () => {
  expect(latestLine(db, 1, "ah")).toBeNull();
  expect(latestLine(db, 1, "ou")).toBeNull();
});

it("sequential posts increment versions", () => {
  // Post two lines sequentially — versions must be distinct; UNIQUE(matchId, market, version) enforces correctness
  const l1 = postLine(
    db,
    1,
    { matchId: 1, market: "ah", favSide: "home", ballQ: 2, priceC: 85 },
    NOW,
  );
  const l2 = postLine(
    db,
    1,
    { matchId: 1, market: "ah", favSide: "away", ballQ: 4, priceC: 95 },
    NOW,
  );
  expect(l1.version).not.toBe(l2.version);
  expect(l2.version).toBe(l1.version + 1);
});

it("raw duplicate insert throws UNIQUE constraint error", () => {
  postLine(
    db,
    1,
    { matchId: 1, market: "ah", favSide: "home", ballQ: 2, priceC: 85 },
    NOW,
  );
  // version 1 for (matchId=1, market='ah') now exists — raw insert must fail
  expect(() =>
    db
      .insert(schema.lines)
      .values({
        matchId: 1,
        market: "ah",
        version: 1,
        favSide: "away",
        ballQ: 3,
        priceC: 90,
        status: "active",
        postedBy: 1,
        postedAt: NOW,
      })
      .run(),
  ).toThrow(/UNIQUE/);
});

it("postLine against a finished match throws /finished/ and leaves row count unchanged", () => {
  // seed a line so the table is non-empty
  postLine(
    db,
    1,
    { matchId: 1, market: "ah", favSide: "home", ballQ: 2, priceC: 85 },
    NOW,
  );
  const countBefore = db.select().from(schema.lines).all().length;

  // mark the match as finished
  db.update(schema.matches)
    .set({ status: "finished" })
    .where(eq(schema.matches.id, 1))
    .run();

  expect(() =>
    postLine(
      db,
      1,
      { matchId: 1, market: "ah", favSide: "home", ballQ: 2, priceC: 85 },
      NOW,
    ),
  ).toThrow(/finished/);

  const countAfter = db.select().from(schema.lines).all().length;
  expect(countAfter).toBe(countBefore);
});

it("broadcast: successful postLine pushes exactly one line_update chunk; failed postLine pushes none", () => {
  const events: unknown[] = [];
  const unsub = sseHub.subscribe((c) => events.push(c));

  try {
    postLine(
      db,
      1,
      { matchId: 1, market: "ah", favSide: "home", ballQ: 2, priceC: 85 },
      NOW,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toContain("line_update");

    // finished match → no broadcast
    db.update(schema.matches)
      .set({ status: "finished" })
      .where(eq(schema.matches.id, 1))
      .run();
    const countBefore = events.length;
    expect(() =>
      postLine(
        db,
        1,
        { matchId: 1, market: "ah", favSide: "home", ballQ: 2, priceC: 85 },
        NOW,
      ),
    ).toThrow();
    expect(events).toHaveLength(countBefore);
  } finally {
    unsub();
  }
});

// ── O2 NEW TESTS ────────────────────────────────────────────────────────────

it("per-market version independence: ah v1, ou v1, ah v2 → ou still v1 active", () => {
  const ahV1 = postLine(
    db,
    1,
    { matchId: 1, market: "ah", favSide: "home", ballQ: 3, priceC: 92 },
    NOW,
  );
  expect(ahV1.version).toBe(1);

  const ouV1 = postLine(
    db,
    1,
    { matchId: 1, market: "ou", favSide: "home", ballQ: 10, priceC: 90 },
    NOW,
  );
  expect(ouV1.version).toBe(1);

  // post a second ah line — should not affect ou version
  const ahV2 = postLine(
    db,
    1,
    { matchId: 1, market: "ah", favSide: "home", ballQ: 4, priceC: 95 },
    NOW,
  );
  expect(ahV2.version).toBe(2);

  // ou market's latest should still be v1, active
  const ouLatest = latestLine(db, 1, "ou");
  expect(ouLatest?.version).toBe(1);
  expect(ouLatest?.status).toBe("active");

  // ah market's latest should be v2
  const ahLatest = latestLine(db, 1, "ah");
  expect(ahLatest?.version).toBe(2);

  // activeLine per market
  expect(activeLine(db, 1, "ah")?.version).toBe(2);
  expect(activeLine(db, 1, "ou")?.version).toBe(1);
});

it("suspending ou does not affect ah line", () => {
  postLine(
    db,
    1,
    { matchId: 1, market: "ah", favSide: "home", ballQ: 3, priceC: 92 },
    NOW,
  );
  postLine(
    db,
    1,
    { matchId: 1, market: "ou", favSide: "home", ballQ: 10, priceC: 90 },
    NOW,
  );

  setLineStatus(db, 1, "ou", "suspended");

  // ah should still be active
  expect(activeLine(db, 1, "ah")).not.toBeNull();
  // ou should be suspended (not in activeLine)
  expect(activeLine(db, 1, "ou")).toBeNull();
  expect(latestLine(db, 1, "ou")?.status).toBe("suspended");
});

it("ou ballQ 0 is rejected with bad_line (no O 0.0 lines)", () => {
  const e = (() => {
    try {
      postLine(
        db,
        1,
        { matchId: 1, market: "ou", favSide: "home", ballQ: 0, priceC: 90 },
        NOW,
      );
      return null;
    } catch (e) {
      return e as { code?: string; httpStatus?: number };
    }
  })();
  expect(e?.code).toBe("bad_line");
  expect(e?.httpStatus).toBe(400);
});

it("SSE line_update payload includes market field", () => {
  const events: string[] = [];
  const unsub = sseHub.subscribe((c) => events.push(c as string));
  try {
    postLine(
      db,
      1,
      { matchId: 1, market: "ou", favSide: "home", ballQ: 10, priceC: 90 },
      NOW,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toContain('"market"');
    expect(events[0]).toContain('"ou"');
  } finally {
    unsub();
  }
});

it("setLineStatus SSE payload includes market field", () => {
  postLine(
    db,
    1,
    { matchId: 1, market: "ou", favSide: "home", ballQ: 10, priceC: 90 },
    NOW,
  );
  const events: string[] = [];
  const unsub = sseHub.subscribe((c) => events.push(c as string));
  try {
    setLineStatus(db, 1, "ou", "suspended");
    expect(events).toHaveLength(1);
    expect(events[0]).toContain('"market"');
    expect(events[0]).toContain('"ou"');
    expect(events[0]).toContain('"suspended"');
  } finally {
    unsub();
  }
});
