import { it, expect } from "vitest";
import { teamLabel } from "./flags";

it("formats a known team as 'Full Name (ISO)'", () => {
  expect(teamLabel("USA")).toBe("United States (USA)");
  expect(teamLabel("BRA")).toBe("Brazil (BRA)");
});

it("falls back to the code/label when no full name exists", () => {
  expect(teamLabel("Winner A")).toBe("Winner A");
  expect(teamLabel("ZZZ")).toBe("ZZZ");
});
