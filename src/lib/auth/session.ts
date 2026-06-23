import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export type Session = {
  playerId: number;
  role: "player" | "admin";
  epoch: number;
};
const COOKIE = "wb_session";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32)
    throw new Error("SESSION_SECRET must be set (>= 32 chars)");
  return new TextEncoder().encode(s);
}

export async function createSessionToken(s: Session): Promise<string> {
  return new SignJWT(s as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${THIRTY_DAYS}s`)
    .sign(secret());
}

export async function verifySessionToken(tok: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(tok, secret(), {
      algorithms: ["HS256"],
    });
    if (
      typeof payload.playerId !== "number" ||
      typeof payload.epoch !== "number" ||
      (payload.role !== "player" && payload.role !== "admin")
    )
      return null;
    return {
      playerId: payload.playerId,
      role: payload.role,
      epoch: payload.epoch,
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(s: Session) {
  (await cookies()).set(COOKIE, await createSessionToken(s), {
    httpOnly: true,
    // Secure iff actually served over HTTPS. Gating on the origin protocol (not
    // NODE_ENV) keeps prod (https://3fqik.com) secure while letting an http
    // staging instance set a usable cookie.
    secure: (process.env.APP_ORIGIN ?? "").startsWith("https"),
    sameSite: "lax",
    maxAge: THIRTY_DAYS,
    path: "/",
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(COOKIE);
}

/**
 * Constant-time check of an `Authorization: Bearer <token>` header against the
 * service secret. Pure (no I/O) so it can be unit-tested. Returns false unless
 * the secret is set, ≥32 chars, and matches exactly.
 */
export function bearerMatches(
  authHeader: string | null | undefined,
  secret: string | undefined,
): boolean {
  if (!secret || secret.length < 32) return false;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
  const presented = Buffer.from(authHeader.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  // Length must match for timingSafeEqual; differing length = no match.
  if (presented.length !== expected.length) return false;
  return timingSafeEqual(presented, expected);
}

/**
 * Service-account path for the admin MCP server: a request bearing
 * MCP_ADMIN_TOKEN resolves to the dedicated bot-admin player (by
 * BOT_ADMIN_PHONE). Returns the player row only if it is role:admin, else null.
 */
async function serviceActor() {
  if (!process.env.MCP_ADMIN_TOKEN || !process.env.BOT_ADMIN_PHONE) return null;
  const auth = (await headers()).get("authorization");
  if (!bearerMatches(auth, process.env.MCP_ADMIN_TOKEN)) return null;
  const db = getDb();
  const [p] = await db
    .select()
    .from(schema.players)
    .where(eq(schema.players.phone, process.env.BOT_ADMIN_PHONE));
  return p && p.role === "admin" ? p : null;
}

/** Returns the player row or null. Epoch mismatch (PIN reset) = invalid. */
export async function currentPlayer() {
  // Service bearer (MCP) takes precedence over the session cookie.
  const svc = await serviceActor();
  if (svc) return svc;
  const tok = (await cookies()).get(COOKIE)?.value;
  if (!tok) return null;
  const s = await verifySessionToken(tok);
  if (!s) return null;
  const db = getDb();
  const [p] = await db
    .select()
    .from(schema.players)
    .where(eq(schema.players.id, s.playerId));
  if (!p || p.sessionEpoch !== s.epoch) return null;
  return p;
}

export async function requirePlayer(opts?: { allowMustChangePin?: boolean }) {
  const p = await currentPlayer();
  if (!p)
    throw Object.assign(new Error("unauthorized"), {
      httpStatus: 401,
      code: "unauthorized",
    });
  if (p.mustChangePin && !opts?.allowMustChangePin)
    throw Object.assign(new Error("PIN change required"), {
      httpStatus: 403,
      code: "must_change_pin",
    });
  if (p.lockedUntil && Date.parse(p.lockedUntil) > Date.now())
    throw Object.assign(new Error("account locked — try later or ask admin"), {
      httpStatus: 423,
      code: "locked",
    });
  return p;
}

export async function requireAdmin() {
  const p = await requirePlayer();
  if (p.role !== "admin")
    throw Object.assign(new Error("forbidden"), { httpStatus: 403 });
  return p;
}
