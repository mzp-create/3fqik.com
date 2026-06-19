/**
 * Fill knockout-bracket placeholders ("2A v 2B", "1E v 3rd-best", "W73 …") with
 * the real teams, read from Wikipedia's resolved knockout fixtures. Safe to run
 * repeatedly (idempotent): only fills matches that are still placeholders and
 * that match a resolved Wikipedia box uniquely by stadium + date.
 *
 * Intended to run on a schedule (systemd timer) through the knockout phase.
 *
 *   DRY_RUN=1 npx tsx scripts/resolve-bracket.ts   # preview, change nothing
 *   npx tsx scripts/resolve-bracket.ts             # apply + audit-log changes
 *
 * Requires DATABASE_URL in the environment (systemd EnvironmentFile=.env.local).
 */
import { and, eq, ne } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db/index";
import {
  fetchKnockoutWikitext,
  parseKnockoutBoxes,
  matchKnockout,
  isPlaceholder,
  type KoMatch,
} from "../src/lib/bracket/knockout";
import { nowIso } from "../src/lib/time";

const dry = process.env.DRY_RUN === "1";

async function main() {
  const db = getDb();

  // Our knockout matches that still have at least one placeholder side and
  // aren't finished. (Group matches and fully-resolved fixtures are excluded.)
  const all = await db
    .select()
    .from(schema.matches)
    .where(ne(schema.matches.status, "finished"));
  const ko: KoMatch[] = all
    .filter(
      (m) =>
        !m.stage.startsWith("Group ") &&
        (isPlaceholder(m.homeTeam) || isPlaceholder(m.awayTeam)),
    )
    .map((m) => ({
      id: m.id,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      kickoffUtc: m.kickoffUtc,
      venue: m.venue,
    }));

  if (ko.length === 0) {
    console.log("No placeholder knockout matches remain. Nothing to do.");
    return;
  }

  let wikitext: string;
  try {
    wikitext = await fetchKnockoutWikitext();
  } catch (e) {
    console.error(
      `Wikipedia fetch failed: ${e instanceof Error ? e.message : e}`,
    );
    process.exit(1);
  }

  const boxes = parseKnockoutBoxes(wikitext);
  const { resolutions, skipped } = matchKnockout(boxes, ko);

  console.log(
    `${dry ? "[DRY RUN] " : ""}Wikipedia resolved boxes: ${boxes.length} · ` +
      `our placeholders: ${ko.length} · matched: ${resolutions.length}`,
  );

  if (resolutions.length === 0) {
    console.log(
      "No fixtures resolvable yet (teams not decided, or stadium/date not matched).",
    );
    if (skipped.length) console.log("Skipped:\n  " + skipped.join("\n  "));
    return;
  }

  // Resolve admin actor for the audit trail (system action).
  const [admin] = await db
    .select()
    .from(schema.players)
    .where(eq(schema.players.role, "admin"))
    .limit(1);
  const actorId = admin?.id ?? 0;
  const at = nowIso();

  for (const r of resolutions) {
    console.log(
      `${dry ? "[dry] " : ""}#${r.matchId}: ${r.from}  →  ${r.home} v ${r.away}`,
    );
    if (dry) continue;

    // Guard against a race: only update while still a placeholder.
    const res = await db
      .update(schema.matches)
      .set({ homeTeam: r.home, awayTeam: r.away })
      .where(
        and(
          eq(schema.matches.id, r.matchId),
          ne(schema.matches.status, "finished"),
        ),
      )
      .returning({ id: schema.matches.id });
    if (res.length === 0) continue;

    await db.insert(schema.auditLog).values({
      actorId,
      action: "bracket_resolve",
      subject: `match:${r.matchId}`,
      detail: `${r.from} → ${r.home} v ${r.away} (Wikipedia)`,
      at,
    });
  }

  if (skipped.length)
    console.log(`\nSkipped (ambiguous/unmatched):\n  ${skipped.join("\n  ")}`);
  console.log(
    `\n${dry ? "[DRY RUN] " : ""}Done. ${dry ? 0 : resolutions.length} match(es) updated.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
