import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, schema, type Db } from "@/lib/db";
import { postLine, setLineStatus, activeLine, latestLine } from "./manage";
import { hashPin } from "@/lib/auth/pin";
import { sseHub } from "@/lib/sse";

let db: Db;
const NOW = "2026-06-12T10:00:00Z";

beforeEach(async () => {
  db = await createTestDb();
  await db.insert(schema.players).values({
    phone: "09700000001",
    pinHash: hashPin("111111"),
    displayName: "A",
    role: "admin",
    createdAt: NOW,
  });
  await db.insert(schema.matches).values({
    stage: "Group C",
    homeTeam: "BRA",
    awayTeam: "MEX",
    kickoffUtc: "2026-06-12T02:00:00Z",
    venue: "X",
    matchDay: "2026-06-12",
  });
});

it("posting closes the previous line and increments version", async () => {
  const l1 = await postLine(
    db,
    1,
    {
      matchId: 1,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
    },
    NOW,
  );
  expect(l1.version).toBe(1);
  const l2 = await postLine(
    db,
    1,
    {
      matchId: 1,
      market: "ah",
      favSide: "home",
      ballQ: 4,
      priceC: 95,
    },
    NOW,
  );
  expect(l2.version).toBe(2);
  const rows = await db.select().from(schema.lines);
  expect(rows.find((r) => r.id === l1.id)!.status).toBe("closed");
  expect((await activeLine(db, 1, "ah"))!.id).toBe(l2.id);
});

it("suspend/resume toggles; closed lines cannot resume; bad prices rejected", async () => {
  const l = await postLine(
    db,
    1,
    {
      matchId: 1,
      market: "ah",
      favSide: "home",
      ballQ: 2,
      priceC: 85,
    },
    NOW,
  );
  await setLineStatus(db, 1, "ah", "suspended");
  expect(await activeLine(db, 1, "ah")).toBeNull();
  await setLineStatus(db, 1, "ah", "active");
  expect((await activeLine(db, 1, "ah"))!.id).toBe(l.id);
  await setLineStatus(db, 1, "ah", "closed");
  await expect(setLineStatus(db, 1, "ah", "active")).rejects.toThrow(/closed/);
  await expect(
    postLine(
      db,
      1,
      {
        matchId: 1,
        market: "ah",
        favSide: "home",
        ballQ: 2,
        priceC: 0,
      },
      NOW,
    ),
  ).rejects.toThrow();
  await expect(
    postLine(
      db,
      1,
      {
        matchId: 1,
        market: "ah",
        favSide: "home",
        ballQ: -1,
        priceC: 90,
      },
      NOW,
    ),
  ).rejects.toThrow();
});

it("err codes: not_found for missing match, match_finished for done match, bad_line for invalid params", async () => {
  // missing match → not_found
  const e1 = await (async () => {
    try {
      await postLine(
        db,
        1,
        {
          matchId: 999,
          market: "ah",
          favSide: "home",
          ballQ: 2,
          priceC: 85,
        },
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
  await db.insert(schema.matches).values({
    stage: "Group C",
    homeTeam: "ARG",
    awayTeam: "ENG",
    kickoffUtc: "2026-06-12T02:00:00Z",
    venue: "Y",
    matchDay: "2026-06-12",
    status: "finished",
  });
  const allMatches = await db.select().from(schema.matches);
  const finishedId = allMatches.find((m) => m.status === "finished")!.id;
  const e2 = await (async () => {
    try {
      await postLine(
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
  const e3 = await (async () => {
    try {
      await postLine(
        db,
        1,
        {
          matchId: 1,
          market: "ah",
          favSide: "home",
          ballQ: -1,
          priceC: 85,
        },
        NOW,
      );
      return null;
    } catch (e) {
      return e as { code?: string };
    }
  })();
  expect(e3?.code).toBe("bad_line");

  // invalid price → bad_line
  const e4 = await (async () => {
    try {
      await postLine(
        db,
        1,
        {
          matchId: 1,
          market: "ah",
          favSide: "home",
          ballQ: 2,
          priceC: 0,
        },
        NOW,
      );
      return null;
    } catch (e) {
      return e as { code?: string };
    }
  })();
  expect(e4?.code).toBe("bad_line");
});

it("setLineStatus errors: no_line for missing matchId, line_closed for closed line", async () => {
  // no line for matchId → no_line
  const e1 = await (async () => {
    try {
      await setLineStatus(db, 999, "ah", "active");
      return null;
    } catch (e) {
      return e as { code?: string; httpStatus?: number };
    }
  })();
  expect(e1?.code).toBe("no_line");
  expect(e1?.httpStatus).toBe(404);

  // already closed → line_closed
  await postLine(
    db,
    1,
    {
      matchId: 1,
      market: "ah",
      favSide: "home",
      ballQ: 2,
      priceC: 85,
    },
    NOW,
  );
  await setLineStatus(db, 1, "ah", "closed");
  const e2 = await (async () => {
    try {
      await setLineStatus(db, 1, "ah", "active");
      return null;
    } catch (e) {
      return e as { code?: string };
    }
  })();
  expect(e2?.code).toBe("line_closed");
});

it("latestLine returns null when no lines exist", async () => {
  expect(await latestLine(db, 1, "ah")).toBeNull();
  expect(await latestLine(db, 1, "ou")).toBeNull();
});

it("sequential posts increment versions", async () => {
  // Post two lines sequentially — versions must be distinct; UNIQUE(matchId, market, version) enforces correctness
  const l1 = await postLine(
    db,
    1,
    {
      matchId: 1,
      market: "ah",
      favSide: "home",
      ballQ: 2,
      priceC: 85,
    },
    NOW,
  );
  const l2 = await postLine(
    db,
    1,
    {
      matchId: 1,
      market: "ah",
      favSide: "away",
      ballQ: 4,
      priceC: 95,
    },
    NOW,
  );
  expect(l1.version).not.toBe(l2.version);
  expect(l2.version).toBe(l1.version + 1);
});

it("raw duplicate insert throws UNIQUE constraint error", async () => {
  await postLine(
    db,
    1,
    {
      matchId: 1,
      market: "ah",
      favSide: "home",
      ballQ: 2,
      priceC: 85,
    },
    NOW,
  );
  // version 1 for (matchId=1, market='ah') now exists — raw insert must fail
  await expect(
    db.insert(schema.lines).values({
      matchId: 1,
      market: "ah",
      version: 1,
      favSide: "away",
      ballQ: 3,
      priceC: 90,
      status: "active",
      postedBy: 1,
      postedAt: NOW,
    }),
  ).rejects.toMatchObject({ cause: { code: "23505" } }); // unique_violation
});

it("postLine against a finished match throws /finished/ and leaves row count unchanged", async () => {
  // seed a line so the table is non-empty
  await postLine(
    db,
    1,
    {
      matchId: 1,
      market: "ah",
      favSide: "home",
      ballQ: 2,
      priceC: 85,
    },
    NOW,
  );
  const countBefore = (await db.select().from(schema.lines)).length;

  // mark the match as finished
  await db
    .update(schema.matches)
    .set({ status: "finished" })
    .where(eq(schema.matches.id, 1));

  await expect(
    postLine(
      db,
      1,
      {
        matchId: 1,
        market: "ah",
        favSide: "home",
        ballQ: 2,
        priceC: 85,
      },
      NOW,
    ),
  ).rejects.toThrow(/finished/);

  const countAfter = (await db.select().from(schema.lines)).length;
  expect(countAfter).toBe(countBefore);
});

it("broadcast: successful postLine pushes exactly one line_update chunk; failed postLine pushes none", async () => {
  const events: unknown[] = [];
  const unsub = sseHub.subscribe((c) => events.push(c));

  try {
    await postLine(
      db,
      1,
      {
        matchId: 1,
        market: "ah",
        favSide: "home",
        ballQ: 2,
        priceC: 85,
      },
      NOW,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toContain("line_update");

    // finished match → no broadcast
    await db
      .update(schema.matches)
      .set({ status: "finished" })
      .where(eq(schema.matches.id, 1));
    const countBefore = events.length;
    await expect(
      postLine(
        db,
        1,
        {
          matchId: 1,
          market: "ah",
          favSide: "home",
          ballQ: 2,
          priceC: 85,
        },
        NOW,
      ),
    ).rejects.toThrow();
    expect(events).toHaveLength(countBefore);
  } finally {
    unsub();
  }
});

// ── O2 NEW TESTS ────────────────────────────────────────────────────────────

it("per-market version independence: ah v1, ou v1, ah v2 → ou still v1 active", async () => {
  const ahV1 = await postLine(
    db,
    1,
    {
      matchId: 1,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
    },
    NOW,
  );
  expect(ahV1.version).toBe(1);

  const ouV1 = await postLine(
    db,
    1,
    {
      matchId: 1,
      market: "ou",
      favSide: "home",
      ballQ: 10,
      priceC: 90,
    },
    NOW,
  );
  expect(ouV1.version).toBe(1);

  // post a second ah line — should not affect ou version
  const ahV2 = await postLine(
    db,
    1,
    {
      matchId: 1,
      market: "ah",
      favSide: "home",
      ballQ: 4,
      priceC: 95,
    },
    NOW,
  );
  expect(ahV2.version).toBe(2);

  // ou market's latest should still be v1, active
  const ouLatest = await latestLine(db, 1, "ou");
  expect(ouLatest?.version).toBe(1);
  expect(ouLatest?.status).toBe("active");

  // ah market's latest should be v2
  const ahLatest = await latestLine(db, 1, "ah");
  expect(ahLatest?.version).toBe(2);

  // activeLine per market
  expect((await activeLine(db, 1, "ah"))?.version).toBe(2);
  expect((await activeLine(db, 1, "ou"))?.version).toBe(1);
});

it("suspending ou does not affect ah line", async () => {
  await postLine(
    db,
    1,
    {
      matchId: 1,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
    },
    NOW,
  );
  await postLine(
    db,
    1,
    {
      matchId: 1,
      market: "ou",
      favSide: "home",
      ballQ: 10,
      priceC: 90,
    },
    NOW,
  );

  await setLineStatus(db, 1, "ou", "suspended");

  // ah should still be active
  expect(await activeLine(db, 1, "ah")).not.toBeNull();
  // ou should be suspended (not in activeLine)
  expect(await activeLine(db, 1, "ou")).toBeNull();
  expect((await latestLine(db, 1, "ou"))?.status).toBe("suspended");
});

it("ou ballQ 0 is rejected with bad_line (no O 0.0 lines)", async () => {
  const e = await (async () => {
    try {
      await postLine(
        db,
        1,
        {
          matchId: 1,
          market: "ou",
          favSide: "home",
          ballQ: 0,
          priceC: 90,
        },
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

it("SSE line_update payload includes market field", async () => {
  const events: string[] = [];
  const unsub = sseHub.subscribe((c) => events.push(c as string));
  try {
    await postLine(
      db,
      1,
      {
        matchId: 1,
        market: "ou",
        favSide: "home",
        ballQ: 10,
        priceC: 90,
      },
      NOW,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toContain('"market"');
    expect(events[0]).toContain('"ou"');
  } finally {
    unsub();
  }
});

it("setLineStatus SSE payload includes market field", async () => {
  await postLine(
    db,
    1,
    {
      matchId: 1,
      market: "ou",
      favSide: "home",
      ballQ: 10,
      priceC: 90,
    },
    NOW,
  );
  const events: string[] = [];
  const unsub = sseHub.subscribe((c) => events.push(c as string));
  try {
    await setLineStatus(db, 1, "ou", "suspended");
    expect(events).toHaveLength(1);
    expect(events[0]).toContain('"market"');
    expect(events[0]).toContain('"ou"');
    expect(events[0]).toContain('"suspended"');
  } finally {
    unsub();
  }
});

it("stores both prices; priceOppC defaults to priceC when omitted", async () => {
  // Explicit two-sided prices persist.
  const l1 = await postLine(
    db,
    1,
    {
      matchId: 1,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 92,
      priceOppC: -98,
    },
    NOW,
  );
  expect(l1.priceC).toBe(92);
  expect(l1.priceOppC).toBe(-98);

  // Omitted priceOppC defaults to priceC (symmetric).
  const l2 = await postLine(
    db,
    1,
    {
      matchId: 1,
      market: "ah",
      favSide: "home",
      ballQ: 3,
      priceC: 90,
    },
    NOW,
  );
  expect(l2.priceOppC).toBe(90);

  // Invalid priceOppC is rejected.
  await expect(
    postLine(
      db,
      1,
      {
        matchId: 1,
        market: "ah",
        favSide: "home",
        ballQ: 3,
        priceC: 90,
        priceOppC: 0,
      },
      NOW,
    ),
  ).rejects.toThrow(/invalid price/);
});
