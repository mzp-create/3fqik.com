/**
 * One-off: record Si Thu's 2nd batch of historical (pre-match) bets on the
 * Groups I & J round-1 matches. Offered-side bets reuse the active line; flipped
 * (dog/under) bets get a closed historical line at the flipped price, after
 * which the offered line is re-posted so it stays active.
 *
 *   DRY_RUN=1 npx tsx scripts/record-sithu-batch4.ts   # preview
 *   npx tsx scripts/record-sithu-batch4.ts             # apply
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db/index";
import { postLine } from "../src/lib/lines/manage";
import { newTicketNo } from "../src/lib/ticket/ticketNo";

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
  { label: "Ghana: level 0 (fav)", matchId: 23, market: "ah", side: "fav", stake: 400_000 },
  { label: "England: Under 2", matchId: 22, market: "ou", side: "under", stake: 400_000 },
  { label: "Portugal: -2 (fav)", matchId: 21, market: "ah", side: "fav", stake: 400_000 },
  { label: "Portugal: Congo +2 (dog)", matchId: 21, market: "ah", side: "dog", stake: 1_000_000 },
  { label: "Portugal: Under 3", matchId: 21, market: "ou", side: "under", stake: 1_000_000 },
  { label: "England: Croatia +1 (dog)", matchId: 22, market: "ah", side: "dog", stake: 1_000_000 },
  { label: "England: Under 2", matchId: 22, market: "ou", side: "under", stake: 1_000_000 },
  { label: "Ghana: Panama level 0 (dog)", matchId: 23, market: "ah", side: "dog", stake: 1_000_000 },
  { label: "Ghana: Under 2", matchId: 23, market: "ou", side: "under", stake: 1_000_000 },
  { label: "Colombia: Uzbekistan +1 (dog)", matchId: 24, market: "ah", side: "dog", stake: 3_000_000 },
  { label: "Colombia: Under 2", matchId: 24, market: "ou", side: "under", stake: 1_000_000 },
];

async function main() {
  const db = getDb();
  const [admin] = await db
    .select()
    .from(schema.players)
    .where(eq(schema.players.role, "admin"))
    .limit(1);
  const adminId = admin.id;

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
  async function kickoff(matchId: number) {
    const [m] = await db
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.id, matchId));
    return m.kickoffUtc;
  }

  for (const b of BETS) {
    const at = await kickoff(b.matchId);
    const line = await activeLine(b.matchId, b.market);
    if (!line)
      throw new Error(`no active line for match ${b.matchId} ${b.market}`);

    let lineId = line.id;
    let priceC = line.priceC;

    if (b.side !== line.offeredSide) {
      // Flipped side — historical line at the flipped price, then re-post offered.
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
