import { describe, it, expect } from "vitest";
import { wikiTitle, parseInfobox, parseRecentResults } from "./teams";

describe("wikiTitle", () => {
  it("uses the default '<name> national football team' for normal codes", () => {
    expect(wikiTitle("ESP")).toBe("Spain national football team");
    expect(wikiTitle("BRA")).toBe("Brazil national football team");
  });
  it("uses curated overrides for the exceptions", () => {
    expect(wikiTitle("USA")).toBe("United States men's national soccer team");
    expect(wikiTitle("CZE")).toBe("Czech Republic national football team");
    expect(wikiTitle("TUR")).toBe("Turkey national football team");
    expect(wikiTitle("CIV")).toBe("Ivory Coast national football team");
    expect(wikiTitle("BIH")).toBe(
      "Bosnia and Herzegovina national football team",
    );
  });
  it("returns null for unknown/placeholder codes", () => {
    expect(wikiTitle("W73")).toBeNull();
    expect(wikiTitle("XYZ")).toBeNull();
  });
});

describe("parseInfobox", () => {
  const infobox = `{{Infobox national football team
| Name = Spain
| FIFA Rank = 8
| Confederation = [[UEFA]] (Europe)
| Coach = {{flagicon|ESP}} [[Luis de la Fuente]]
| Nickname = ''La Roja'' (The Red One)
}}`;
  it("extracts rank, confederation, coach, nickname with markup stripped", () => {
    expect(parseInfobox(infobox)).toEqual({
      fifaRank: 8,
      confederation: "UEFA",
      coach: "Luis de la Fuente",
      nickname: "La Roja",
    });
  });
  it("returns nulls for fields not present", () => {
    expect(parseInfobox("no infobox here")).toEqual({
      fifaRank: null,
      confederation: null,
      coach: null,
      nickname: null,
    });
  });
});

describe("parseRecentResults", () => {
  const wikitext = `
{{Football box collapsible
|date=2026-03-23
|team1=Spain
|score=2–1
|team2=Portugal
}}
{{Football box collapsible
|date=2026-03-26
|team1=Germany
|score=0–0
|team2=Spain
}}`;
  it("parses up to 5 recent result rows", () => {
    const rows = parseRecentResults(wikitext);
    expect(rows.length).toBe(2);
    expect(rows[0]).toEqual({
      date: "2026-03-23",
      team1: "Spain",
      team2: "Portugal",
      score: "2–1",
    });
  });
  it("returns [] when nothing parses", () => {
    expect(parseRecentResults("garbage")).toEqual([]);
  });
});
