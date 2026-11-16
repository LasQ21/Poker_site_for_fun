import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signSession, validateInitData, validateLoginWidget, verifySession } from "./telegram";

const TOKEN = "123456:TEST-token";
const NOW = new Date("2026-11-16T12:00:00Z");
const authDate = Math.floor(NOW.getTime() / 1000) - 60;

function makeInitData(fields: Record<string, string>, token = TOKEN) {
  const dcs = Object.entries(fields)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(dcs).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

const user = JSON.stringify({ id: 42, first_name: "Олег", username: "oleg" });

describe("validateInitData", () => {
  it("accepts correctly signed data", () => {
    const raw = makeInitData({ user, auth_date: String(authDate), query_id: "AAA", start_param: "game123" });
    const res = validateInitData(raw, TOKEN, { now: NOW });
    expect(res?.user.id).toBe(42);
    expect(res?.user.first_name).toBe("Олег");
    expect(res?.startParam).toBe("game123");
  });

  it("rejects tampered data", () => {
    const raw = makeInitData({ user, auth_date: String(authDate) });
    const tampered = raw.replace("42", "43");
    expect(validateInitData(tampered, TOKEN, { now: NOW })).toBeNull();
  });

  it("rejects data signed with another token", () => {
    const raw = makeInitData({ user, auth_date: String(authDate) }, "999:other");
    expect(validateInitData(raw, TOKEN, { now: NOW })).toBeNull();
  });

  it("rejects stale data", () => {
    const raw = makeInitData({ user, auth_date: String(authDate - 2 * 86400) });
    expect(validateInitData(raw, TOKEN, { now: NOW })).toBeNull();
  });

  it("rejects missing hash or user", () => {
    expect(validateInitData("auth_date=1", TOKEN)).toBeNull();
    const noUser = makeInitData({ auth_date: String(authDate) });
    expect(validateInitData(noUser, TOKEN, { now: NOW })).toBeNull();
    expect(validateInitData("", TOKEN)).toBeNull();
  });
});

describe("validateLoginWidget", () => {
  function sign(data: Record<string, string | number>) {
    const dcs = Object.entries(data)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    const secret = createHash("sha256").update(TOKEN).digest();
    return { ...data, hash: createHmac("sha256", secret).update(dcs).digest("hex") };
  }

  it("accepts a valid widget payload", () => {
    const data = sign({ id: 42, first_name: "Олег", username: "oleg", auth_date: authDate });
    expect(validateLoginWidget(data, TOKEN, { now: NOW })).toMatchObject({ id: 42, username: "oleg" });
  });

  it("rejects modified payload and stale auth", () => {
    const data = sign({ id: 42, first_name: "Олег", auth_date: authDate });
    expect(validateLoginWidget({ ...data, id: 7 }, TOKEN, { now: NOW })).toBeNull();
    const old = sign({ id: 42, first_name: "Олег", auth_date: authDate - 30 * 86400 });
    expect(validateLoginWidget(old, TOKEN, { now: NOW })).toBeNull();
  });
});

describe("session cookie", () => {
  it("round-trips and expires", () => {
    const token = signSession(42, "s3cret", 60, NOW);
    expect(verifySession(token, "s3cret", NOW)).toBe(42);
    expect(verifySession(token, "other", NOW)).toBeNull();
    expect(verifySession(token, "s3cret", new Date(NOW.getTime() + 120_000))).toBeNull();
    expect(verifySession(token.replace(/.$/, "x"), "s3cret", NOW)).toBeNull();
  });
});
