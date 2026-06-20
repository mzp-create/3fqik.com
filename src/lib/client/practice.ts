"use client";

import { useState, useCallback } from "react";
import { gradeBet, type GradeInput } from "@/lib/engine/grade";

/** Starting demo bankroll, in demo MMK. */
export const START_BALANCE = 1_000_000;

const STORAGE_KEY = "practiceState";

export type DemoBet = {
  id: string;
  ts: number;
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  market: "ah" | "ou";
  side: "fav" | "dog" | "over" | "under";
  favSide: "home" | "away";
  ballQ: number;
  priceC: number;
  stakeMmk: number;
  status: "pending" | "won" | "lost" | "push";
  netMmk: number | null;
  simHome: number | null;
  simAway: number | null;
};

/** Fields of a DemoBet that resolveDemo actually reads. */
type ResolvableBet = Pick<
  DemoBet,
  "market" | "side" | "favSide" | "ballQ" | "priceC" | "stakeMmk"
>;

/**
 * Grade a demo bet against a final score via the real (pure) engine.
 * Demo bets are pre-match (at-bet 0-0), so effective goals = final goals.
 */
export function resolveDemo(
  bet: ResolvableBet,
  home: number,
  away: number,
): { status: "won" | "push" | "lost"; netMmk: number } {
  const effFav = Math.max(bet.favSide === "home" ? home : away, 0);
  const effDog = Math.max(bet.favSide === "home" ? away : home, 0);
  return gradeBet({
    market: bet.market,
    side: bet.side,
    ballQ: bet.ballQ,
    priceC: bet.priceC,
    stake: bet.stakeMmk,
    effFav,
    effDog,
  } as GradeInput);
}

/**
 * Apply a resolved result to a demo balance. `netMmk` is the player's NET
 * result, so the balance moves by exactly net (stake is NOT pre-deducted).
 */
export function applyResult(
  balance: number,
  result: { netMmk: number },
): number {
  return balance + result.netMmk;
}

type PracticeState = {
  balanceMmk: number;
  bets: DemoBet[];
};

type PlaceInput = Omit<
  DemoBet,
  "id" | "ts" | "status" | "netMmk" | "simHome" | "simAway"
>;

function newId(): string {
  return crypto.randomUUID?.() ?? String(Date.now() + Math.random());
}

function loadState(): PracticeState {
  const empty: PracticeState = { balanceMmk: START_BALANCE, bets: [] };
  if (typeof window === "undefined") return empty;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return empty;
  try {
    return JSON.parse(raw) as PracticeState;
  } catch {
    return empty; // ignore malformed persisted state
  }
}

export function usePractice() {
  // Lazy initializer hydrates from localStorage on first render without a
  // setState-in-effect (SSR returns the empty default; client reads storage).
  const [state, setState] = useState<PracticeState>(loadState);

  // Persist SYNCHRONOUSLY to localStorage, then update React state. The bet
  // page writes a demo bet then immediately navigates to /practice; a
  // useEffect-based persist would not flush before the board remounts and
  // re-reads localStorage (which is why test bets appeared to vanish). Actions
  // read the freshest state back from localStorage (`loadState`) rather than a
  // render-time ref, so the persisted store is always the source of truth.
  const persist = useCallback((next: PracticeState) => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // storage may be unavailable (private mode / quota) — ignore
      }
    }
    setState(next);
  }, []);

  const placeDemo = useCallback(
    (input: PlaceInput) => {
      const prev = loadState();
      persist({
        ...prev,
        bets: [
          ...prev.bets,
          {
            ...input,
            id: newId(),
            ts: Date.now(),
            status: "pending",
            netMmk: null,
            simHome: null,
            simAway: null,
          },
        ],
      });
    },
    [persist],
  );

  const simulate = useCallback(
    (id: string) => {
      const prev = loadState();
      const bet = prev.bets.find((b) => b.id === id);
      if (!bet || bet.status !== "pending") return;
      const home = Math.floor(Math.random() * 5); // 0..4
      const away = Math.floor(Math.random() * 5); // 0..4
      const result = resolveDemo(bet, home, away);
      persist({
        balanceMmk: applyResult(prev.balanceMmk, result),
        bets: prev.bets.map((b) =>
          b.id === id
            ? {
                ...b,
                status: result.status,
                netMmk: result.netMmk,
                simHome: home,
                simAway: away,
              }
            : b,
        ),
      });
    },
    [persist],
  );

  const reset = useCallback(() => {
    persist({ balanceMmk: START_BALANCE, bets: [] });
  }, [persist]);

  const inPlayMmk = state.bets.reduce(
    (sum, b) => (b.status === "pending" ? sum + b.stakeMmk : sum),
    0,
  );

  return {
    balanceMmk: state.balanceMmk,
    bets: state.bets,
    inPlayMmk,
    placeDemo,
    simulate,
    reset,
  };
}
