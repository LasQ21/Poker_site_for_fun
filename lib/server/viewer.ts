import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, type User } from "@/lib/db/schema";
import { validateInitData, verifySession } from "@/lib/auth/telegram";
import { config } from "@/lib/config";
import { upsertUser } from "./users";
import { unauthorized } from "./errors";

export const SESSION_COOKIE = "pt_session";

/**
 * Per-instance cache of resolved users. Polling clients send the same initData every few seconds;
 * without it every request would write the users row. Keyed by initData hash (a new Mini App
 * launch has a new hash and refreshes the profile) or by session uid.
 */
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 2000;
const cache = new Map<string, { user: User; expires: number }>();

function cached(key: string): User | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.user;
}

function remember(key: string, user: User) {
  if (cache.size >= CACHE_MAX) {
    // Maps iterate in insertion order: drop the oldest entries.
    for (const k of [...cache.keys()].slice(0, CACHE_MAX / 4)) cache.delete(k);
  }
  cache.set(key, { user, expires: Date.now() + CACHE_TTL_MS });
}

/** Drops cached copies of a user (e.g. after their profile changed). */
export function forgetViewer(userId: number) {
  for (const [k, v] of cache) if (v.user.id === userId) cache.delete(k);
}

/**
 * Resolves the current user: Mini App initData (`Authorization: tma <initData>`) first,
 * then the website session cookie. Returns null for anonymous (read-only) visitors.
 */
export async function getViewer(): Promise<User | null> {
  const h = await headers();
  const auth = h.get("authorization");
  if (auth?.startsWith("tma ")) {
    const raw = auth.slice(4);
    const data = validateInitData(raw, config.botToken);
    if (data) {
      const key = `tma:${data.user.id}:${new URLSearchParams(raw).get("hash")}`;
      const hit = cached(key);
      if (hit) return hit;
      const user = await upsertUser(data.user);
      remember(key, user);
      return user;
    }
  }
  const jar = await cookies();
  const uid = verifySession(jar.get(SESSION_COOKIE)?.value, config.sessionSecret);
  if (uid != null) {
    const key = `uid:${uid}`;
    const hit = cached(key);
    if (hit) return hit;
    const [u] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
    if (u) remember(key, u);
    return u ?? null;
  }
  return null;
}

export async function requireViewer(): Promise<User> {
  const v = await getViewer();
  if (!v) throw unauthorized();
  return v;
}
