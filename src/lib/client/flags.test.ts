import { describe, it, expect } from "vitest";
import { flag, teamName, teamLabel } from "./flags";

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
