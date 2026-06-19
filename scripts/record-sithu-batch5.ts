/**
 * One-off: record Si Thu's 5th batch of pre-match bets on the round-2
 * (Jun 18-19) Group A/B matches. All five are on the non-offered side
 * (under / dog), so each gets a closed historical line at the flipped price
 * (negation of the offered price, zero juice), then the offered line is
 * re-posted so live betting on those matches is undisturbed.
 *
 *   DRY_RUN=1 npx tsx scripts/record-sithu-batch5.ts   # preview
 *   npx tsx scripts/record-sithu-batch5.ts             # apply
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db/index";
import { postLine } from "../src/lib/lines/manage";
import { newTicketNo } from "../src/lib/ticket/ticketNo";
import { nowIso } from "../src/lib/time";

const SI_THU = 3;
const dry = process.env.DRY_RUN === "1";

type Bet = {
  label: string;
  matchId: number;
  market: "ah" | "ou";
  side: "fav" | "dog" | "over" | "under";
  stake: number;
};

const BETS: Bet[] = [
  {
    label: "Czech (CZE v RSA): Under 2",
    matchId: 25,
    market: "ou",
    side: "under",
    stake: 2_000_000,
  },
  {
    label: "Switzerland (SUI v BIH): Under 2",
    matchId: 26,
    market: "ou",
    side: "under",
    stake: 2_000_000,
  },
  {
    label: "Canada (CAN v QAT): Under 3",
    matchId: 27,
    market: "ou",
    side: "under",
    stake: 2_000_000,
  },
  {
    label: "Canada (CAN v QAT): Qatar +2 (dog)",
    matchId: 27,
    market: "ah",
    side: "dog",
    stake: 2_000_000,
  },
  {
    label: "Mexico (MEX v KOR): Under 2",
    matchId: 28,
    market: "ou",
    side: "under",
    stake: 2_000_000,
  },
];

async function main() {
  const db = getDb();
  const [admin] = await db
    .select()
    .from(schema.players)
    .where(eq(schema.players.role, "admin"))
    .limit(1);
  const adminId = admin.id;
  const at = nowIso();

  async function activeLine(matchId: number, market: "ah" | "ou") {
    const [row] = await db
      .select()
      .from(schema.lines)
      .where(
        and(
          eq(schema.lines.matchId, matchId),
          eq(schema.lines.market, market),
          eq(schema.lines.status, "active"),
        ),
      )
      .orderBy(desc(schema.lines.version))
      .limit(1);
    return row;
  }

  for (const b of BETS) {
    const line = await activeLine(b.matchId, b.market);
    if (!line)
      throw new Error(`no active line for match ${b.matchId} ${b.market}`);

    let lineId = line.id;
    let priceC = line.priceC;

    if (b.side !== line.offeredSide) {
      // Flipped side — closed historical line at the flipped (negated) price,
      // then re-post the offered line so the live market keeps an active line.
      priceC = -line.priceC;
      const version = line.version + 1;
      console.log(
        `${dry ? "[dry] " : ""}flip line: match ${b.matchId} ${b.market} v${version} ${b.side} ballQ ${line.ballQ} price ${priceC} (closed)`,
      );
      if (!dry) {
        await db
          .update(schema.lines)
          .set({ status: "closed" })
          .where(eq(schema.lines.id, line.id));
        const [row] = await db
          .insert(schema.lines)
          .values({
            matchId: b.matchId,
            market: b.market,
            version,
            favSide: line.favSide,
            offeredSide: b.side,
            ballQ: line.ballQ,
            priceC,
            status: "closed",
            postedBy: adminId,
            postedAt: at,
          })
          .returning();
        lineId = row.id;
      }
    }

    console.log(
      `${dry ? "[dry] " : ""}BET: ${b.label} · ${b.stake.toLocaleString()} MMK · match ${b.matchId} ${b.market} side ${b.side} @ ${(priceC / 100).toFixed(2)} (line ${lineId})`,
    );
    if (!dry)
      await db.insert(schema.bets).values({
        ticketNo: newTicketNo(),
        playerId: SI_THU,
        matchId: b.matchId,
        lineId,
        side: b.side,
        stakeMmk: b.stake,
        scoreHomeAtBet: 0,
        scoreAwayAtBet: 0,
        placedAt: at,
        status: "pending",
      });

    if (b.side !== line.offeredSide && !dry) {
      // restore the offered line as the active latest version
      await postLine(
        db,
        adminId,
        {
          matchId: b.matchId,
          market: b.market,
          favSide: line.favSide,
          offeredSide: line.offeredSide,
          ballQ: line.ballQ,
          priceC: line.priceC,
        },
        at,
      );
    }
  }
  console.log(`\n${dry ? "[DRY RUN] " : ""}Done. ${BETS.length} bets.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
