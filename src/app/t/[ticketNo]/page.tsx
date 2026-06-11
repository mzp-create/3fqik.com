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
      <main className="mx-auto max-w-sm p-6 text-center">
        <h1 className="text-2xl font-bold text-red-600">
          ✕ NOT A VALID TICKET
        </h1>
        <p className="mt-2 text-gray-500">
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
    .select()
    .from(schema.players)
    .where(eq(schema.players.id, bet.playerId))
    .get()!;
  const fav = line.favSide === "home" ? match.homeTeam : match.awayTeam;
  const dog = line.favSide === "home" ? match.awayTeam : match.homeTeam;
  const pick =
    bet.side === "fav"
      ? `${fav} −${ballLabel(line.ballQ)}`
      : `${dog} +${ballLabel(line.ballQ)}`;

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-center text-2xl font-bold text-green-600">
        ✓ VERIFIED TICKET
      </h1>
      <dl className="mt-4 space-y-2 rounded-xl border-2 border-dashed p-4">
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
        {bet.settlementId != null && (
          <Row k="Settled" v={`ref #${bet.settlementId}`} />
        )}
      </dl>
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  );
}
