import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
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
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: THIRTY_DAYS,
    path: "/",
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(COOKIE);
}

/** Returns the player row or null. Epoch mismatch (PIN reset) = invalid. */
export async function currentPlayer() {
  const tok = (await cookies()).get(COOKIE)?.value;
  if (!tok) return null;
  const s = await verifySessionToken(tok);
  if (!s) return null;
  const db = getDb();
  const p = db
    .select()
    .from(schema.players)
    .where(eq(schema.players.id, s.playerId))
    .get();
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
