import { describe, it, expect } from "vitest";
import {
  parseKnockoutBoxes,
  matchKnockout,
  normStadium,
  parseWikiDate,
  isPlaceholder,
  type KoMatch,
} from "./knockout";

// A resolved R32 box, an unresolved one (slot text, not flag codes), and a
// second resolved box at a different stadium.
const WIKITEXT = `
{{#invoke:football box|main
|date={{Start date|2026|6|28}}
|team1={{#invoke:flag|fb-rt|MEX}}
|score=2–1
|team2={{#invoke:flag|fb|CAN}}
|stadium=[[SoFi Stadium]], [[Inglewood, California|Inglewood]]
}}
{{#invoke:football box|main
|date={{Start date|2026|6|29}}
|team1=<!--{{#invoke:flag|fb-rt|}}-->Winners Group C
|team2=<!--{{#invoke:flag|fb|}}-->Runners-up Group F
|stadium=[[NRG Stadium]]
}}
{{#invoke:football box|main
|date={{Start date|2026|6|29}}
|team1={{#invoke:flag|fb-rt|ESP}}
|score=0–0
|team2={{#invoke:flag|fb|BRA}}
|stadium=[[Gillette Stadium]], Foxborough
}}
`;

describe("normStadium", () => {
  it("normalizes wiki markup and our DB venue to the same key", () => {
    expect(normStadium("[[SoFi Stadium]]")).toBe("sofistadium");
    expect(normStadium("SoFi Stadium, Los Angeles")).toBe("sofistadium");
    expect(normStadium("[[Estadio Azteca|Azteca Stadium]]")).toBe(
      "aztecastadium",
    );
  });
});

describe("parseWikiDate", () => {
  it("parses both day-first and month-first forms", () => {
    expect(parseWikiDate("28 June 2026")).toBe("2026-06-28");
    expect(parseWikiDate("June 28, 2026")).toBe("2026-06-28");
    expect(parseWikiDate("{{Start date|2026|6|28}}")).toBe("2026-06-28");
    expect(parseWikiDate("{{Start date and age|2026|7|1|df=y}}")).toBe(
      "2026-07-01",
    );
    expect(parseWikiDate("tbd")).toBe("");
  });
});

describe("isPlaceholder", () => {
  it("treats slot codes as placeholders and real teams as resolved", () => {
    expect(isPlaceholder("2A")).toBe(true);
    expect(isPlaceholder("W73")).toBe(true);
    expect(isPlaceholder("3rd-best")).toBe(true);
    expect(isPlaceholder("MEX")).toBe(false);
  });
});

describe("parseKnockoutBoxes", () => {
  it("returns only boxes where both teams are real codes", () => {
    const boxes = parseKnockoutBoxes(WIKITEXT);
    expect(boxes).toHaveLength(2); // the slot-text box is skipped
    expect(boxes[0]).toEqual({
      home: "MEX",
      away: "CAN",
      stadium: "sofistadium",
      date: "2026-06-28",
    });
    expect(boxes[1].home).toBe("ESP");
    expect(boxes[1].stadium).toBe("gillettestadium");
  });
});

describe("matchKnockout", () => {
  const matches: KoMatch[] = [
    {
      id: 73,
      homeTeam: "2A",
      awayTeam: "2B",
      kickoffUtc: "2026-06-28T19:00:00Z",
      venue: "SoFi Stadium, Los Angeles",
    },
    {
      id: 75,
      homeTeam: "1E",
      awayTeam: "3rd-best",
      kickoffUtc: "2026-06-29T20:30:00Z",
      venue: "Gillette Stadium, Foxborough MA",
    },
    {
      id: 99,
      homeTeam: "W91",
      awayTeam: "W92",
      kickoffUtc: "2026-07-12T00:00:00Z",
      venue: "SoFi Stadium, Los Angeles", // same stadium, far-off date
    },
  ];

  it("matches each resolved box to the right placeholder by stadium + date", () => {
    const boxes = parseKnockoutBoxes(WIKITEXT);
    const { resolutions, skipped } = matchKnockout(boxes, matches);
    expect(skipped).toEqual([]);
    expect(resolutions).toContainEqual({
      matchId: 73,
      home: "MEX",
      away: "CAN",
      from: "2A v 2B",
    });
    expect(resolutions).toContainEqual({
      matchId: 75,
      home: "ESP",
      away: "BRA",
      from: "1E v 3rd-best",
    });
    // #99 (same stadium, July) is NOT wrongly matched to the June SoFi box.
    expect(resolutions.find((r) => r.matchId === 99)).toBeUndefined();
  });

  it("does not overwrite an already-resolved match", () => {
    const resolved: KoMatch[] = [
      {
        id: 73,
        homeTeam: "MEX",
        awayTeam: "CAN",
        kickoffUtc: "2026-06-28T19:00:00Z",
        venue: "SoFi Stadium, Los Angeles",
      },
    ];
    const boxes = parseKnockoutBoxes(WIKITEXT).filter(
      (b) => b.stadium === "sofistadium",
    );
    const { resolutions } = matchKnockout(boxes, resolved);
    expect(resolutions).toEqual([]);
  });
});
