import { describe, it, expect } from "vitest";
import { en } from "./en";
import { mm } from "./mm";

it("mm covers every en key", () => {
  expect(Object.keys(mm).sort()).toEqual(Object.keys(en).sort());
});
