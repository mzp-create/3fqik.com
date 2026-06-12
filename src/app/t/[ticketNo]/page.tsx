export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { verifyTicketSig } from "@/lib/ticket/sign";
import { formatMmt } from "@/lib/time";

function ballLabel(ballQ: number) {
  return (ballQ / 4).toString();
}
function priceLabel(priceC: number) {
  return (priceC / 100).toFixed(2);
}

export default async function VerifyTicket({
  params,
  searchParams,
}: {
  params: Promise<{ ticketNo: string }>;
  searchParams: Promise<{ v?: string; sig?: string }>;
}) {
  const { ticketNo } = await params;
  const { v, sig } = await searchParams;
  const valid = !!v && !!sig && verifyTicketSig(ticketNo, Number(v), sig);
  const db = getDb();
  const bet = valid
    ? db
        .select()
        .from(schema.bets)
        .where(eq(schema.bets.ticketNo, ticketNo))
        .get()
    : undefined;

  if (!valid || !bet) {
    return (
      <main className="mx-auto w-full max-w-sm p-6 text-center">
        <div className="mb-4 rounded-lg bg-ca px-4 py-3">
          <h1 className="font-display text-3xl text-white">
            ✕ NOT A VALID TICKET
          </h1>
        </div>
        <p className="mt-2 text-base text-ink/50">
          This QR code does not verify. The ticket may be forged.
        </p>
      </main>
    );
  }

  const match = db
    .select()
    .from(schema.matches)
    .where(eq(schema.matches.id, bet.matchId))
    .get()!;
  const line = db
    .select()
    .from(schema.lines)
    .where(eq(schema.lines.id, bet.lineId))
    .get()!;
  const player = db
    .select({ displayName: schema.players.displayName })
    .from(schema.players)
    .where(eq(schema.players.id, bet.playerId))
    .get()!;
  const settlement =
    bet.settlementId != null
      ? db
          .select({ ref: schema.settlements.ref })
          .from(schema.settlements)
          .where(eq(schema.settlements.id, bet.settlementId))
          .get()
      : undefined;
  const fav = line.favSide === "home" ? match.homeTeam : match.awayTeam;
  const dog = line.favSide === "home" ? match.awayTeam : match.homeTeam;
  let pick: string;
  if (line.market === "ou") {
    const word = bet.side === "over" ? "Over" : "Under";
    pick = `${word} ${ballLabel(line.ballQ)}`;
  } else {
    pick =
      bet.side === "fav"
        ? `${fav} −${ballLabel(line.ballQ)}`
        : `${dog} +${ballLabel(line.ballQ)}`;
  }

  return (
    <main className="mx-auto w-full max-w-sm p-6">
      <div className="mb-4 rounded-lg bg-mx px-4 py-3 text-center">
        <h1 className="font-display text-3xl text-white">✓ VERIFIED TICKET</h1>
      </div>
      <dl className="space-y-2 rounded-xl border border-dashed border-ink/30 bg-white p-4 text-base leading-loose">
        <Row k="Ticket" v={bet.ticketNo} />
        <Row k="Player" v={player.displayName} />
        <Row
          k="Match"
          v={`${match.homeTeam} vs ${match.awayTeam} (${match.stage})`}
        />
        <Row k="Pick" v={`${pick} @ ${priceLabel(line.priceC)}`} />
        <Row k="Stake" v={`${bet.stakeMmk.toLocaleString()} MMK`} />
        <Row
          k="Score at bet"
          v={`${bet.scoreHomeAtBet}–${bet.scoreAwayAtBet}`}
        />
        <Row k="Placed" v={formatMmt(bet.placedAt)} />
        <Row k="Status" v={bet.status.toUpperCase()} />
        {bet.netMmk != null && (
          <Row k="Net" v={`${bet.netMmk.toLocaleString()} MMK`} />
        )}
        {settlement != null && <Row k="Settled" v={settlement.ref} />}
      </dl>
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink/50">{k}</dt>
      <dd className="text-right font-medium text-ink">{v}</dd>
    </div>
  );
}
