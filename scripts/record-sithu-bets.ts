/**
 * One-off: record Si Thu's historical bets (placed offline, pre-match) on the
 * round-1 matches. Two are on the underdog side (no offered line exists), so we
 * insert a closed "historical" line carrying the flipped price, reference it,
 * then re-post the favourite line so live/active betting is undisturbed.
 *
 *   DRY_RUN=1 npx tsx scripts/record-sithu-bets.ts   # preview
 *   npx tsx scripts/record-sithu-bets.ts             # apply
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db/index";
import { postLine } from "../src/lib/lines/manage";
import { newTicketNo } from "../src/lib/ticket/ticketNo";

const SI_THU = 3;
const STAKE = 2_000_000;
const dry = process.env.DRY_RUN === "1";

// Each bet: match, market, side, ballQ, priceC (the price Si Thu actually got).
// Existing lines are reused for sides we already offer; dog bets create one.
type Bet = {
  label: string;
  matchId: number;
  market: "ah" | "ou";
  side: "fav" | "dog" | "over" | "under";
  favSide: "home" | "away";
  ballQ: number;
  priceC: number;
  existingLineId?: number; // reuse if the offered side matches
  repostFav?: { ballQ: number; priceC: number }; // re-post fav after a dog line
};

const BETS: Bet[] = [
  {
    label: "Cape Verde +3 @ -0.35 (Spain dog)",
    matchId: 13,
    market: "ah",
    side: "dog",
    favSide: "home",
    ballQ: 12,
    priceC: -35,
    repostFav: { ballQ: 12, priceC: 35 },
  },
  {
    label: "Egypt +1 @ -0.15 (Belgium dog)",
    matchId: 14,
    market: "ah",
    side: "dog",
    favSide: "home",
    ballQ: 4,
    priceC: -15,
    repostFav: { ballQ: 4, priceC: 15 },
  },
  {
    label: "Iran -1 @ +0.80 (fav)",
    matchId: 16,
    market: "ah",
    side: "fav",
    favSide: "home",
    ballQ: 4,
    priceC: 80,
    existingLineId: 34,
  },
  {
    label: "Iran Over 2 @ -0.15 (over)",
    matchId: 16,
    market: "ou",
    side: "over",
    favSide: "home",
    ballQ: 8,
    priceC: -15,
    existingLineId: 35,
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

  const kickoff = new Map<number, string>();
  for (const id of [13, 14, 16]) {
    const [m] = await db
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.id, id));
    kickoff.set(id, m.kickoffUtc);
  }

  for (const b of BETS) {
    const at = kickoff.get(b.matchId)!;
    let lineId = b.existingLineId;

    if (!lineId) {
      // Insert a closed historical line carrying the exact price Si Thu got.
      const [latest] = await db
        .select()
        .from(schema.lines)
        .where(
          and(
            eq(schema.lines.matchId, b.matchId),
            eq(schema.lines.market, b.market),
          ),
        )
        .orderBy(desc(schema.lines.version))
        .limit(1);
      const version = (latest?.version ?? 0) + 1;
      console.log(
        `${dry ? "[dry] " : ""}hist line: match ${b.matchId} ${b.market} v${version} ${b.side} ballQ ${b.ballQ} price ${b.priceC} (closed)`,
      );
      if (!dry) {
        // supersede the current fav line so we don't leave two 'active' rows
        if (latest && latest.status === "active")
          await db
            .update(schema.lines)
            .set({ status: "closed" })
            .where(eq(schema.lines.id, latest.id));
        const [row] = await db
          .insert(schema.lines)
          .values({
            matchId: b.matchId,
            market: b.market,
            version,
            favSide: b.favSide,
            offeredSide: b.side,
            ballQ: b.ballQ,
            priceC: b.priceC,
            status: "closed",
            postedBy: adminId,
            postedAt: at,
          })
          .returning();
        lineId = row.id;
      }
    }

    console.log(
      `${dry ? "[dry] " : ""}BET Si Thu: ${b.label} · ${STAKE.toLocaleString()} MMK · match ${b.matchId} line ${lineId} side ${b.side}`,
    );
    if (!dry)
      await db.insert(schema.bets).values({
        ticketNo: newTicketNo(),
        playerId: SI_THU,
        matchId: b.matchId,
        lineId: lineId!,
        side: b.side,
        stakeMmk: STAKE,
        scoreHomeAtBet: 0,
        scoreAwayAtBet: 0,
        placedAt: at,
        status: "pending",
      });

    // Re-post the favourite line so the (live) market keeps an active line.
    if (b.repostFav) {
      console.log(
        `${dry ? "[dry] " : ""}re-post fav: match ${b.matchId} ${b.market} ballQ ${b.repostFav.ballQ} price ${b.repostFav.priceC}`,
      );
      if (!dry)
        await postLine(
          db,
          adminId,
          {
            matchId: b.matchId,
            market: b.market,
            favSide: b.favSide,
            offeredSide: "fav",
            ballQ: b.repostFav.ballQ,
            priceC: b.repostFav.priceC,
          },
          at,
        );
    }
  }
  console.log(`\n${dry ? "[DRY RUN] " : ""}Done.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
