import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, etagFetcher } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("etagFetcher", () => {
  it("sends the last ETag and reuses the cached object on 304", async () => {
    const calls: Record<string, string>[] = [];
    const responses = [
      new Response(JSON.stringify({ v: 1 }), { status: 200, headers: { ETag: 'W/"g1-u0"' } }),
      new Response(null, { status: 304 }),
      new Response(JSON.stringify({ v: 2 }), { status: 200, headers: { ETag: 'W/"g2-u0"' } }),
    ];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      calls.push({ ...(init.headers as Record<string, string>) });
      return responses.shift()!;
    }));
    const a = await etagFetcher<{ v: number }>("/api/games/x");
    const b = await etagFetcher<{ v: number }>("/api/games/x");
    const c = await etagFetcher<{ v: number }>("/api/games/x");
    expect(a).toEqual({ v: 1 });
    expect(b).toBe(a);
    expect(c).toEqual({ v: 2 });
    expect(calls[0]["If-None-Match"]).toBeUndefined();
    expect(calls[1]["If-None-Match"]).toBe('W/"g1-u0"');
    expect(calls[2]["If-None-Match"]).toBe('W/"g1-u0"');
  });

  it("translates API errors by code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ error: "x", code: "errors.hostOnly" }), { status: 403 }),
    ));
    await expect(etagFetcher("/api/games/y")).rejects.toEqual(new ApiError(403, "Це може зробити лише хост гри"));
  });
});
