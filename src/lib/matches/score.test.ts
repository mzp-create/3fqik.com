import { it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, schema, type Db } from "@/lib/db";
import { hashPin } from "@/lib/auth/pin";
import { sseHub } from "@/lib/sse";
import { updateLiveScore, setMatchLive } from "./score";

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

// --- plan's required test (verbatim from Task 15) ---
it("marks live and updates the running score", () => {
  setMatchLive(db, 1);
  updateLiveScore(db, 1, 1, 0);
  const m = db.select().from(schema.matches).all()[0];
  expect(m.status).toBe("live");
  expect(m.homeScore).toBe(1);
  expect(() => updateLiveScore(db, 1, -1, 0)).toThrow();
});

// --- setMatchLive ---

it("setMatchLive initialises scores to 0-0 and broadcasts", () => {
  setMatchLive(db, 1);
  const m = db.select().from(schema.matches).all()[0];
  expect(m.status).toBe("live");
  expect(m.homeScore).toBe(0);
  expect(m.awayScore).toBe(0);
});

it("setMatchLive throws not_found for unknown match", () => {
  const call = () => setMatchLive(db, 999);
  expect(call).toThrow();
  try {
    call();
  } catch (e) {
    expect((e as { code?: string }).code).toBe("not_found");
  }
});

it("setMatchLive throws match_finished if match is already finished", () => {
  db.update(schema.matches)
    .set({
      status: "finished",
      homeScore: 2,
      awayScore: 1,
      scoreConfirmedAt: NOW,
    })
    .where(eq(schema.matches.id, 1))
    .run();
  const call = () => setMatchLive(db, 1);
  expect(call).toThrow();
  try {
    call();
  } catch (e) {
    expect((e as { code?: string }).code).toBe("match_finished");
  }
});

// --- updateLiveScore input validation (bad_score) ---

it("updateLiveScore throws bad_score for negative scores", () => {
  setMatchLive(db, 1);
  const call = () => updateLiveScore(db, 1, -1, 0);
  expect(call).toThrow();
  try {
    call();
  } catch (e) {
    expect((e as { code?: string }).code).toBe("bad_score");
  }
});

it("updateLiveScore throws bad_score for non-integer scores", () => {
  setMatchLive(db, 1);
  const call = () => updateLiveScore(db, 1, 1.5, 0);
  expect(call).toThrow();
  try {
    call();
  } catch (e) {
    expect((e as { code?: string }).code).toBe("bad_score");
  }
});

it("updateLiveScore throws bad_score for scores above 99", () => {
  setMatchLive(db, 1);
  const call = () => updateLiveScore(db, 1, 100, 0);
  expect(call).toThrow();
  try {
    call();
  } catch (e) {
    expect((e as { code?: string }).code).toBe("bad_score");
  }
});

// --- updateLiveScore match-state guards ---

it("updateLiveScore throws not_found for unknown match", () => {
  const call = () => updateLiveScore(db, 999, 1, 0);
  expect(call).toThrow();
  try {
    call();
  } catch (e) {
    expect((e as { code?: string }).code).toBe("not_found");
  }
});

it("updateLiveScore throws match_finished for a finished match", () => {
  db.update(schema.matches)
    .set({
      status: "finished",
      homeScore: 2,
      awayScore: 1,
      scoreConfirmedAt: NOW,
    })
    .where(eq(schema.matches.id, 1))
    .run();
  const call = () => updateLiveScore(db, 1, 2, 1);
  expect(call).toThrow();
  try {
    call();
  } catch (e) {
    expect((e as { code?: string }).code).toBe("match_finished");
  }
});

// --- SSE broadcast ---

it("updateLiveScore broadcasts a score_update SSE event", () => {
  const received: string[] = [];
  const unsub = sseHub.subscribe((chunk) => received.push(chunk));
  setMatchLive(db, 1);
  updateLiveScore(db, 1, 2, 1);
  unsub();
  expect(received.some((c) => c.includes("score_update"))).toBe(true);
});

it("setMatchLive broadcasts a score_update SSE event", () => {
  const received: string[] = [];
  const unsub = sseHub.subscribe((chunk) => received.push(chunk));
  setMatchLive(db, 1);
  unsub();
  expect(received.some((c) => c.includes("score_update"))).toBe(true);
});
