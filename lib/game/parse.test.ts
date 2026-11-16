import { describe, expect, it } from "vitest";
import { parseChips } from "./parse";

describe("parseChips", () => {
  it.each([
    ["12500", 12500],
    ["12 500", 12500],
    ["12,5k", 12500],
    ["1.2к", 1200],
    ["3m", 3_000_000],
    ["0", 0],
  ])("%s → %d", (s, v) => expect(parseChips(s)).toBe(v));
  it.each(["", "abc", "-5", "12k5", undefined])("rejects %s", (s) => expect(parseChips(s)).toBeNull());
});
