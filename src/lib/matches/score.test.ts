import { it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, schema, type Db } from "@/lib/db";
import { hashPin } from "@/lib/auth/pin";
import { sseHub } from "@/lib/sse";
import { updateLiveScore, setMatchLive } from "./score";

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

// --- plan's required test (verbatim from Task 15) ---
it("marks live and updates the running score", async () => {
  await setMatchLive(db, 1);
  await updateLiveScore(db, 1, 1, 0);
  const m = (await db.select().from(schema.matches))[0];
  expect(m.status).toBe("live");
  expect(m.homeScore).toBe(1);
  await expect(updateLiveScore(db, 1, -1, 0)).rejects.toThrow();
});

// --- setMatchLive ---

it("setMatchLive initialises scores to 0-0 and broadcasts", async () => {
  await setMatchLive(db, 1);
  const m = (await db.select().from(schema.matches))[0];
  expect(m.status).toBe("live");
  expect(m.homeScore).toBe(0);
  expect(m.awayScore).toBe(0);
});

it("setMatchLive throws not_found for unknown match", async () => {
  const call = () => setMatchLive(db, 999);
  await expect(call()).rejects.toThrow();
  try {
    await call();
  } catch (e) {
    expect((e as { code?: string }).code).toBe("not_found");
  }
});

it("setMatchLive throws match_finished if match is already finished", async () => {
  await db
    .update(schema.matches)
    .set({
      status: "finished",
      homeScore: 2,
      awayScore: 1,
      scoreConfirmedAt: NOW,
    })
    .where(eq(schema.matches.id, 1));
  const call = () => setMatchLive(db, 1);
  await expect(call()).rejects.toThrow();
  try {
    await call();
  } catch (e) {
    expect((e as { code?: string }).code).toBe("match_finished");
  }
});

it("setMatchLive is idempotent on live matches (preserves running score, no extra broadcast)", async () => {
  const received: string[] = [];
  const unsub = sseHub.subscribe((chunk) => received.push(chunk));

  await setMatchLive(db, 1);
  await updateLiveScore(db, 1, 2, 1);

  const broadcastCountBefore = received.length;
  await setMatchLive(db, 1); // re-tap on already-live match
  const broadcastCountAfter = received.length;

  unsub();

  const m = (await db.select().from(schema.matches))[0];
  expect(m.status).toBe("live");
  expect(m.homeScore).toBe(2);
  expect(m.awayScore).toBe(1);
  expect(broadcastCountAfter).toBe(broadcastCountBefore); // no extra broadcast
});

// --- updateLiveScore input validation (bad_score) ---

it("updateLiveScore throws bad_score for negative scores", async () => {
  await setMatchLive(db, 1);
  const call = () => updateLiveScore(db, 1, -1, 0);
  await expect(call()).rejects.toThrow();
  try {
    await call();
  } catch (e) {
    expect((e as { code?: string }).code).toBe("bad_score");
  }
});

it("updateLiveScore throws bad_score for non-integer scores", async () => {
  await setMatchLive(db, 1);
  const call = () => updateLiveScore(db, 1, 1.5, 0);
  await expect(call()).rejects.toThrow();
  try {
    await call();
  } catch (e) {
    expect((e as { code?: string }).code).toBe("bad_score");
  }
});

it("updateLiveScore throws bad_score for scores above 99", async () => {
  await setMatchLive(db, 1);
  const call = () => updateLiveScore(db, 1, 100, 0);
  await expect(call()).rejects.toThrow();
  try {
    await call();
  } catch (e) {
    expect((e as { code?: string }).code).toBe("bad_score");
  }
});

// --- updateLiveScore match-state guards ---

it("updateLiveScore throws not_found for unknown match", async () => {
  const call = () => updateLiveScore(db, 999, 1, 0);
  await expect(call()).rejects.toThrow();
  try {
    await call();
  } catch (e) {
    expect((e as { code?: string }).code).toBe("not_found");
  }
});

it("updateLiveScore throws match_finished for a finished match", async () => {
  await db
    .update(schema.matches)
    .set({
      status: "finished",
      homeScore: 2,
      awayScore: 1,
      scoreConfirmedAt: NOW,
    })
    .where(eq(schema.matches.id, 1));
  const call = () => updateLiveScore(db, 1, 2, 1);
  await expect(call()).rejects.toThrow();
  try {
    await call();
  } catch (e) {
    expect((e as { code?: string }).code).toBe("match_finished");
  }
});

// --- SSE broadcast ---

it("updateLiveScore broadcasts a score_update SSE event", async () => {
  const received: string[] = [];
  const unsub = sseHub.subscribe((chunk) => received.push(chunk));
  await setMatchLive(db, 1);
  await updateLiveScore(db, 1, 2, 1);
  unsub();
  expect(received.some((c) => c.includes("score_update"))).toBe(true);
});

it("setMatchLive broadcasts a score_update SSE event", async () => {
  const received: string[] = [];
  const unsub = sseHub.subscribe((chunk) => received.push(chunk));
  await setMatchLive(db, 1);
  unsub();
  expect(received.some((c) => c.includes("score_update"))).toBe(true);
});
