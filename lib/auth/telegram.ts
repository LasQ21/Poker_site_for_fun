import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

export interface InitData {
  user: TelegramUser;
  authDate: Date;
  startParam?: string;
  chatInstance?: string;
}

const DAY = 24 * 60 * 60;

function safeEqualHex(a: string, b: string) {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
}

/**
 * Validates Mini App `initData` (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
 * secret = HMAC_SHA256(key="WebAppData", bot_token); hash = HMAC_SHA256(key=secret, data_check_string).
 */
export function validateInitData(
  initData: string,
  botToken: string,
  opts: { maxAgeSec?: number; now?: Date } = {},
): InitData | null {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (!safeEqualHex(hash, expected)) return null;

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || authDate <= 0) return null;
  const now = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  if (now - authDate > (opts.maxAgeSec ?? DAY)) return null;

  const userRaw = params.get("user");
  if (!userRaw) return null;
  let user: TelegramUser;
  try {
    user = JSON.parse(userRaw);
  } catch {
    return null;
  }
  if (typeof user?.id !== "number" || typeof user.first_name !== "string") return null;

  return {
    user,
    authDate: new Date(authDate * 1000),
    startParam: params.get("start_param") ?? undefined,
    chatInstance: params.get("chat_instance") ?? undefined,
  };
}

/**
 * Validates data from the Telegram Login Widget (https://core.telegram.org/widgets/login#checking-authorization).
 * secret = SHA256(bot_token); hash = HMAC_SHA256(key=secret, data_check_string).
 */
export function validateLoginWidget(
  data: Record<string, string | number | undefined | null>,
  botToken: string,
  opts: { maxAgeSec?: number; now?: Date } = {},
): TelegramUser | null {
  if (!botToken || !data || typeof data.hash !== "string") return null;
  const fields = Object.entries(data)
    .filter(([k, v]) => k !== "hash" && v !== undefined && v !== null && v !== "")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHash("sha256").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(fields).digest("hex");
  if (!safeEqualHex(data.hash, expected)) return null;

  const authDate = Number(data.auth_date);
  const now = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  if (!Number.isFinite(authDate) || now - authDate > (opts.maxAgeSec ?? 7 * DAY)) return null;

  const id = Number(data.id);
  if (!Number.isSafeInteger(id) || typeof data.first_name !== "string") return null;
  return {
    id,
    first_name: data.first_name,
    last_name: typeof data.last_name === "string" ? data.last_name : undefined,
    username: typeof data.username === "string" ? data.username : undefined,
    photo_url: typeof data.photo_url === "string" ? data.photo_url : undefined,
  };
}

// ---- Signed session cookie for the website -------------------------------------------------

function sessionKey(secret: string) {
  return createHash("sha256").update(`session:${secret}`).digest();
}

export function signSession(userId: number, secret: string, ttlSec = 30 * DAY, now = new Date()): string {
  const exp = Math.floor(now.getTime() / 1000) + ttlSec;
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp })).toString("base64url");
  const sig = createHmac("sha256", sessionKey(secret)).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifySession(token: string | undefined, secret: string, now = new Date()): number | null {
  if (!token || !secret) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", sessionKey(secret)).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof uid !== "number" || typeof exp !== "number") return null;
    if (exp < Math.floor(now.getTime() / 1000)) return null;
    return uid;
  } catch {
    return null;
  }
}
