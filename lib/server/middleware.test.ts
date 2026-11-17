import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

function req(path: string, method: string, headers: Record<string, string> = {}) {
  return new NextRequest(`https://poker.example${path}`, { method, headers: { host: "poker.example", ...headers } });
}

const passes = (r: Response) => r.status !== 403;

describe("CSRF middleware", () => {
  it("lets safe methods through", () => {
    expect(passes(middleware(req("/api/games/x", "GET", { "sec-fetch-site": "cross-site" })))).toBe(true);
  });

  it("blocks cross-site mutations", async () => {
    const r = middleware(req("/api/join", "POST", { "sec-fetch-site": "cross-site", origin: "https://evil.example" }));
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ code: "errors.forbidden" });
    expect(middleware(req("/api/join", "POST", { "sec-fetch-site": "same-site", origin: "https://sub.poker.example" })).status).toBe(403);
    expect(middleware(req("/api/join", "POST")).status).toBe(403);
    expect(middleware(req("/api/join", "POST", { origin: "https://evil.example" })).status).toBe(403);
  });

  it("allows same-origin mutations", () => {
    expect(passes(middleware(req("/api/join", "POST", { "sec-fetch-site": "same-origin" })))).toBe(true);
    expect(passes(middleware(req("/api/join", "POST", { origin: "https://poker.example" })))).toBe(true);
  });

  it("exempts secret-authenticated endpoints and Mini App requests", () => {
    for (const p of ["/api/bot", "/api/jobs/reminder", "/api/setup"]) {
      expect(passes(middleware(req(p, "POST", { "sec-fetch-site": "cross-site" })))).toBe(true);
    }
    expect(passes(middleware(req("/api/join", "POST", { "sec-fetch-site": "cross-site", authorization: "tma x" })))).toBe(true);
    expect(middleware(req("/api/botnet", "POST", { "sec-fetch-site": "cross-site" })).status).toBe(403);
  });
});
