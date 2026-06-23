// All 3fqik admin MCP tools. Each maps 1:1 to an existing admin HTTP endpoint;
// reads are readOnly, mutations are flagged destructive so hermes-agent can
// warn. Money-critical actions execute directly (per spec) — the app's audit
// log is the safety net.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiGet, apiPost, qs } from "./http";
import { lineWire } from "./encode";
import { codeFromName, teamName } from "../src/lib/client/flags";

type Shape = Record<string, z.ZodTypeAny>;
type Args = Record<string, never> & Record<string, unknown>;

/** Register one tool, wrapping the handler into MCP text content + error flag. */
function reg(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: Shape,
  annotations: { readOnlyHint?: boolean; destructiveHint?: boolean },
  handler: (args: Args) => Promise<unknown>,
) {
  server.registerTool(
    name,
    { description, inputSchema, annotations },
    // The SDK's per-tool generic typing doesn't survive this thin wrapper;
    // the handler validates via its own zod shape at call time.
    (async (args: Args) => {
      try {
        const data = await handler(args ?? ({} as Args));
        const text =
          typeof data === "string" ? data : JSON.stringify(data, null, 2);
        return { content: [{ type: "text" as const, text }] };
      } catch (e) {
        return {
          content: [
            {
              type: "text" as const,
              text: e instanceof Error ? e.message : String(e),
            },
          ],
          isError: true,
        };
      }
    }) as never,
  );
}

const RO = { readOnlyHint: true };
const RW = { destructiveHint: true };
const market = z.enum(["ah", "ou"]);
const side = z.enum(["fav", "dog", "over", "under"]);

/* eslint-disable @typescript-eslint/no-explicit-any */
function shapeMatch(m: any) {
  return {
    id: m.id,
    home: m.homeTeam,
    away: m.awayTeam,
    homeName: teamName(m.homeTeam),
    awayName: teamName(m.awayTeam),
    stage: m.stage,
    kickoffUtc: m.kickoffUtc,
    status: m.status,
    score: m.homeScore != null ? `${m.homeScore}-${m.awayScore}` : null,
    ah: m.line,
    ou: m.ouLine,
  };
}

export function registerTools(server: McpServer) {
  // ---- Reads ---------------------------------------------------------------
  reg(
    server,
    "get_dashboard",
    "House exposure, net, outstanding settlements, tier breakdown for today.",
    {},
    RO,
    () => apiGet("/api/admin/dashboard"),
  );

  reg(
    server,
    "get_matches",
    "List all matches with their current AH and O/U lines (and live scores).",
    {},
    RO,
    async () => ((await apiGet("/api/matches")) as any[]).map(shapeMatch),
  );

  reg(
    server,
    "find_matches",
    "Find matches by team name/code (e.g. 'Netherlands' or 'NED'), date (YYYY-MM-DD), and/or status. Returns matchId + current lines so you can act on them.",
    {
      team: z.string().optional(),
      date: z.string().optional(),
      status: z.enum(["scheduled", "live", "finished"]).optional(),
    },
    RO,
    async (a) => {
      let rows = (await apiGet("/api/matches")) as any[];
      if (a.team) {
        const q = String(a.team);
        const code = codeFromName(q) ?? q.toUpperCase();
        const needle = q.toUpperCase();
        rows = rows.filter(
          (m) =>
            m.homeTeam === code ||
            m.awayTeam === code ||
            String(m.homeTeam).toUpperCase().includes(needle) ||
            String(m.awayTeam).toUpperCase().includes(needle) ||
            teamName(m.homeTeam).toUpperCase().includes(needle) ||
            teamName(m.awayTeam).toUpperCase().includes(needle),
        );
      }
      if (a.date)
        rows = rows.filter((m) => String(m.kickoffUtc).slice(0, 10) === a.date);
      if (a.status) rows = rows.filter((m) => m.status === a.status);
      return rows.map(shapeMatch);
    },
  );

  reg(
    server,
    "list_bets",
    "List bets, optionally filtered by status and a free-text query (ticket no / player / team).",
    { status: z.string().optional(), q: z.string().optional() },
    RO,
    (a) =>
      apiGet(
        "/api/admin/bets" +
          qs({ status: a.status as string, q: a.q as string }),
      ),
  );
  reg(
    server,
    "get_audit_log",
    "Recent admin audit-log entries (most recent first).",
    {},
    RO,
    () => apiGet("/api/admin/audit"),
  );
  reg(
    server,
    "list_players",
    "List all players with tier, role and referral info.",
    {},
    RO,
    () => apiGet("/api/admin/players"),
  );
  reg(
    server,
    "get_settings",
    "Current house/tier settings (limits, commission, discount, cancel window).",
    {},
    RO,
    () => apiGet("/api/admin/settings"),
  );
  reg(server, "list_invites", "List admin-created invite codes.", {}, RO, () =>
    apiGet("/api/admin/invites"),
  );
  reg(
    server,
    "get_settlement_board",
    "Settlement board for a match day (per-player nets + payment status).",
    { date: z.string() },
    RO,
    (a) => apiGet("/api/admin/settle" + qs({ date: a.date as string })),
  );
  reg(
    server,
    "report_balances",
    "Per-player unsettled + settled balance summary.",
    {},
    RO,
    () => apiGet("/api/admin/reports/balances"),
  );
  reg(
    server,
    "report_player",
    "One player's bet + settlement history with a summary.",
    {
      playerId: z.number().int(),
      from: z.string().optional(),
      to: z.string().optional(),
    },
    RO,
    (a) =>
      apiGet(
        "/api/admin/reports/player" +
          qs({
            playerId: a.playerId as number,
            from: a.from as string,
            to: a.to as string,
          }),
      ),
  );
  reg(
    server,
    "report_daily",
    "Per-(day, player) net summary with settlement status.",
    { from: z.string().optional(), to: z.string().optional() },
    RO,
    (a) =>
      apiGet(
        "/api/admin/reports/daily" +
          qs({ from: a.from as string, to: a.to as string }),
      ),
  );
  reg(
    server,
    "report_pnl",
    "House P&L over a date range (turnover, commission, house net).",
    { from: z.string().optional(), to: z.string().optional() },
    RO,
    (a) =>
      apiGet(
        "/api/admin/reports/pnl" +
          qs({ from: a.from as string, to: a.to as string }),
      ),
  );
  reg(
    server,
    "get_odds_reference",
    "Market-reference odds (AH/OU/1X2) from The Odds API for the Lines Desk.",
    {},
    RO,
    () => apiGet("/api/admin/odds/reference"),
  );
  reg(
    server,
    "fetch_score_candidates",
    "Candidate final scores from Wikipedia for kicked-off, unfinished matches (review only).",
    {},
    RO,
    () => apiGet("/api/admin/scores/fetch"),
  );

  // ---- Lines ---------------------------------------------------------------
  reg(
    server,
    "post_line",
    "Post/replace a line in human units. handicapGoals e.g. 1.0 or 0.75; priceMalay e.g. 0.45 or -0.98 (the named/over side). favSide required for AH. The opposite side mirrors as -price unless priceOppMalay is given.",
    {
      matchId: z.number().int(),
      market,
      favSide: z.enum(["home", "away"]).optional(),
      handicapGoals: z.number(),
      priceMalay: z.number(),
      priceOppMalay: z.number().optional(),
    },
    RW,
    (a) =>
      apiPost("/api/admin/lines", {
        action: "post",
        ...lineWire({
          matchId: a.matchId as number,
          market: a.market as "ah" | "ou",
          favSide: a.favSide as "home" | "away" | undefined,
          handicapGoals: a.handicapGoals as number,
          priceMalay: a.priceMalay as number,
          priceOppMalay: a.priceOppMalay as number | undefined,
        }),
      }),
  );

  reg(
    server,
    "post_lines_bulk",
    "Post multiple lines at once (partial-failure-safe). Each item is like post_line; returns per-line results.",
    {
      lines: z
        .array(
          z.object({
            matchId: z.number().int(),
            market,
            favSide: z.enum(["home", "away"]).optional(),
            handicapGoals: z.number(),
            priceMalay: z.number(),
            priceOppMalay: z.number().optional(),
          }),
        )
        .min(1),
    },
    RW,
    (a) =>
      apiPost("/api/admin/lines", {
        action: "post_bulk",
        lines: (a.lines as any[]).map((l) => lineWire(l)),
      }),
  );

  for (const [tool, action] of [
    ["suspend_line", "suspend"],
    ["resume_line", "resume"],
    ["close_line", "close"],
  ] as const) {
    reg(
      server,
      tool,
      `${action[0].toUpperCase() + action.slice(1)} a line for a match/market.`,
      { matchId: z.number().int(), market },
      RW,
      (a) =>
        apiPost("/api/admin/lines", {
          action,
          matchId: a.matchId,
          market: a.market,
        }),
    );
  }

  // ---- Scores --------------------------------------------------------------
  reg(
    server,
    "set_match_live",
    "Mark a scheduled match live (initialises 0-0).",
    { matchId: z.number().int() },
    RW,
    (a) => apiPost("/api/admin/scores", { action: "live", matchId: a.matchId }),
  );
  reg(
    server,
    "update_live_score",
    "Update a live match's running score.",
    {
      matchId: z.number().int(),
      home: z.number().int().min(0).max(99),
      away: z.number().int().min(0).max(99),
    },
    RW,
    (a) =>
      apiPost("/api/admin/scores", {
        action: "score",
        matchId: a.matchId,
        home: a.home,
        away: a.away,
      }),
  );
  reg(
    server,
    "confirm_final_score",
    "Confirm the FINAL score — grades all pending tickets and closes the day. Irreversible payout impact.",
    {
      matchId: z.number().int(),
      home: z.number().int().min(0).max(99),
      away: z.number().int().min(0).max(99),
    },
    RW,
    (a) =>
      apiPost("/api/admin/scores", {
        action: "final",
        matchId: a.matchId,
        home: a.home,
        away: a.away,
      }),
  );
  reg(
    server,
    "correct_score",
    "Correct a finished match's score and re-grade (blocked once any ticket is paid out).",
    {
      matchId: z.number().int(),
      home: z.number().int().min(0).max(99),
      away: z.number().int().min(0).max(99),
    },
    RW,
    (a) =>
      apiPost("/api/admin/scores", {
        action: "correct",
        matchId: a.matchId,
        home: a.home,
        away: a.away,
      }),
  );

  // ---- Bets ----------------------------------------------------------------
  reg(
    server,
    "record_bet",
    "Admin-record a bet for a player, bypassing started/closed/limit gates (snapshots the latest line's price for the side). Defaults at-bet score to 0-0.",
    {
      playerId: z.number().int(),
      matchId: z.number().int(),
      market,
      side,
      stakeMmk: z.number().int().positive(),
      scoreHomeAtBet: z.number().int().min(0).optional(),
      scoreAwayAtBet: z.number().int().min(0).optional(),
    },
    RW,
    (a) =>
      apiPost("/api/admin/bets", {
        action: "record",
        playerId: a.playerId,
        matchId: a.matchId,
        market: a.market,
        side: a.side,
        stakeMmk: a.stakeMmk,
        scoreHomeAtBet: a.scoreHomeAtBet,
        scoreAwayAtBet: a.scoreAwayAtBet,
      }),
  );

  // ---- Settlement ----------------------------------------------------------
  reg(
    server,
    "mark_player_paid",
    "Mark a player paid for a closed match day (creates a settlement record).",
    {
      date: z.string(),
      playerId: z.number().int(),
      paymentMethod: z.string().optional(),
      paymentReference: z.string().optional(),
      remark: z.string().optional(),
    },
    RW,
    (a) =>
      apiPost("/api/admin/settle", {
        action: "mark_paid",
        date: a.date,
        playerId: a.playerId,
        paymentMethod: a.paymentMethod,
        paymentReference: a.paymentReference,
        remark: a.remark,
      }),
  );
  reg(
    server,
    "void_ticket",
    "Void a ticket (reverse a bet without grading). Blocked once settled.",
    { ticketNo: z.string(), reason: z.string() },
    RW,
    (a) =>
      apiPost("/api/admin/settle", {
        action: "void",
        ticketNo: a.ticketNo,
        reason: a.reason,
      }),
  );

  // ---- Players -------------------------------------------------------------
  reg(
    server,
    "reset_pin",
    "Reset a player's PIN (6 digits); forces a change on next login and logs them out.",
    { playerId: z.number().int(), tempPin: z.string().regex(/^\d{6}$/) },
    RW,
    (a) =>
      apiPost("/api/admin/players", {
        action: "reset_pin",
        playerId: a.playerId,
        tempPin: a.tempPin,
      }),
  );
  reg(
    server,
    "unlock_player",
    "Unlock a locked player account.",
    { playerId: z.number().int() },
    RW,
    (a) =>
      apiPost("/api/admin/players", { action: "unlock", playerId: a.playerId }),
  );
  reg(
    server,
    "grant_admin",
    "Promote a player to admin.",
    { playerId: z.number().int() },
    RW,
    (a) =>
      apiPost("/api/admin/players", {
        action: "grant_admin",
        playerId: a.playerId,
      }),
  );
  reg(
    server,
    "set_tier",
    "Set a player's betting tier (standard caps vs pro unlimited per-bet).",
    { playerId: z.number().int(), tier: z.enum(["standard", "pro"]) },
    RW,
    (a) =>
      apiPost("/api/admin/players", {
        action: "set_tier",
        playerId: a.playerId,
        tier: a.tier,
      }),
  );

  // ---- Invites & settings --------------------------------------------------
  reg(
    server,
    "create_invite",
    "Create an admin invite code.",
    { maxUses: z.number().int().positive(), expiresAt: z.string() },
    RW,
    (a) =>
      apiPost("/api/admin/invites", {
        maxUses: a.maxUses,
        expiresAt: a.expiresAt,
      }),
  );

  reg(
    server,
    "update_settings",
    "Update house/tier settings (any subset). Money fields are integer MMK; pct fields 0-100; cancelWindowSeconds 0-3600. matchId+betLimitMmk sets a per-match carve-out (betLimitMmk null clears it).",
    {
      dailyTotalLimitMmk: z.number().int().min(0).optional(),
      commissionPct: z.number().int().min(0).max(100).optional(),
      discountPct: z.number().int().min(0).max(100).optional(),
      cancelWindowSeconds: z.number().int().min(0).max(3600).optional(),
      stdMaxStakeMmk: z.number().int().min(0).optional(),
      stdOutstandingMmk: z.number().int().min(0).optional(),
      stdMaxBetsPerMatch: z.number().int().min(0).optional(),
      matchId: z.number().int().optional(),
      betLimitMmk: z.number().int().min(0).nullable().optional(),
    },
    RW,
    (a) => {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(a)) if (v !== undefined) body[k] = v;
      return apiPost("/api/admin/settings", body);
    },
  );
}
