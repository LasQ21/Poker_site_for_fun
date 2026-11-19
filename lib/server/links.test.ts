import { describe, expect, it } from "vitest";
import { nameKeyOf, normalizeUsername } from "./links";

describe("player links", () => {
  it("normalizes usernames from @, plain and t.me forms", () => {
    expect(normalizeUsername("@Spchless")).toBe("spchless");
    expect(normalizeUsername("o_panchuk")).toBe("o_panchuk");
    expect(normalizeUsername("https://t.me/q4r8t7")).toBe("q4r8t7");
    expect(normalizeUsername("t.me/obrkos?start=1")).toBe("obrkos");
    expect(normalizeUsername("@ab")).toBeNull();
    expect(normalizeUsername("1abc")).toBeNull();
  });

  it("normalizes names like leaderboard keys", () => {
    expect(nameKeyOf("  Бодя ")).toBe("бодя");
    expect(nameKeyOf("Сашко  П")).toBe("сашко п");
  });
});
