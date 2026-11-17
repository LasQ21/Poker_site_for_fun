import { beforeEach, describe, expect, it } from "vitest";
import { canGoBack, markReplace, recordNavigation, resetNavigation } from "./nav";

beforeEach(() => resetNavigation());

describe("navigation stack", () => {
  it("pushes new paths and pops when returning to the previous one", () => {
    recordNavigation("/");
    expect(canGoBack()).toBe(false);
    recordNavigation("/g/abc");
    expect(canGoBack()).toBe(true);
    recordNavigation("/");
    expect(canGoBack()).toBe(false);
  });

  it("a deep-link redirect replaces the entry: nothing to go back to", () => {
    recordNavigation("/");
    markReplace("/g/abc");
    recordNavigation("/g/abc");
    expect(canGoBack()).toBe(false);
    recordNavigation("/g/abc/tv");
    recordNavigation("/g/abc");
    expect(canGoBack()).toBe(false);
  });

  it("join → game replace keeps the entry before the join page", () => {
    recordNavigation("/");
    recordNavigation("/join/1234");
    markReplace("/g/abc");
    recordNavigation("/g/abc");
    expect(canGoBack()).toBe(true);
    recordNavigation("/");
    expect(canGoBack()).toBe(false);
  });

  it("supports replace via option and survives re-recording the current path", () => {
    recordNavigation("/");
    markReplace("/leaderboard/x");
    recordNavigation("/"); // e.g. a StrictMode effect re-run before the replace lands
    recordNavigation("/leaderboard/x");
    expect(canGoBack()).toBe(false);
    recordNavigation("/history", { replace: true });
    expect(canGoBack()).toBe(false);
  });

  it("a stale mark does not affect other navigations", () => {
    recordNavigation("/");
    markReplace("/g/never");
    recordNavigation("/new");
    recordNavigation("/g/never");
    expect(canGoBack()).toBe(true);
  });
});
