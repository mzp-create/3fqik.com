import { describe, it, expect } from "vitest";
import { flag, teamName, teamLabel, flagSrc } from "./flags";

describe("flag", () => {
  it("maps FIFA codes to emoji flags", () => {
    expect(flag("MEX")).toBe("🇲🇽");
    expect(flag("RSA")).toBe("🇿🇦"); // South Africa, not RS
    expect(flag("SUI")).toBe("🇨🇭"); // Switzerland → CH
    expect(flag("GER")).toBe("🇩🇪");
    expect(flag("NED")).toBe("🇳🇱");
    expect(flag("ALG")).toBe("🇩🇿");
  });
  it("uses tag sequences for England and Scotland", () => {
    expect(flag("ENG")).toBe("🏴󠁧󠁢󠁥󠁮󠁧󠁿");
    expect(flag("SCO")).toBe("🏴󠁧󠁢󠁳󠁣󠁴󠁿");
  });
  it("returns empty string for knockout placeholders and unknowns", () => {
    for (const code of ["1H", "2J", "W73", "3C/D/F", "XYZ", ""]) {
      expect(flag(code)).toBe("");
    }
  });
});

describe("teamName / teamLabel", () => {
  it("returns full country names for finalists", () => {
    expect(teamName("GER")).toBe("Germany");
    expect(teamName("CUW")).toBe("Curaçao");
    expect(teamName("USA")).toBe("United States");
  });
  it("formats label as 'Name (CODE)' for finalists", () => {
    expect(teamLabel("GER")).toBe("Germany (GER)");
    expect(teamLabel("BIH")).toBe("Bosnia & Herzegovina (BIH)");
  });
  it("falls back to the bare code for placeholders and unknowns", () => {
    for (const code of ["1H", "W73", "XYZ"]) {
      expect(teamName(code)).toBe(code);
      expect(teamLabel(code)).toBe(code);
    }
  });
});

describe("flagSrc", () => {
  it("maps finalist codes to lowercase iso2 svg paths", () => {
    expect(flagSrc("MEX")).toBe("/flags/mx.svg");
    expect(flagSrc("RSA")).toBe("/flags/za.svg"); // South Africa → za
    expect(flagSrc("SUI")).toBe("/flags/ch.svg"); // Switzerland → ch
    expect(flagSrc("USA")).toBe("/flags/us.svg");
  });
  it("maps England and Scotland to GB regional svgs", () => {
    expect(flagSrc("ENG")).toBe("/flags/gb-eng.svg");
    expect(flagSrc("SCO")).toBe("/flags/gb-sct.svg");
  });
  it("returns null for knockout placeholders and unknowns", () => {
    for (const code of ["1H", "W73", "3C/D/F", "XYZ", ""]) {
      expect(flagSrc(code)).toBeNull();
    }
  });
});
