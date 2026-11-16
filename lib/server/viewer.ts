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
 * Resolves the current user: Mini App initData (`Authorization: tma <initData>`) first,
 * then the website session cookie. Returns null for anonymous (read-only) visitors.
 */
export async function getViewer(): Promise<User | null> {
  const h = await headers();
  const auth = h.get("authorization");
  if (auth?.startsWith("tma ")) {
    const data = validateInitData(auth.slice(4), config.botToken);
    if (data) return upsertUser(data.user);
  }
  const jar = await cookies();
  const uid = verifySession(jar.get(SESSION_COOKIE)?.value, config.sessionSecret);
  if (uid != null) {
    const [u] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
    return u ?? null;
  }
  return null;
}

export async function requireViewer(): Promise<User> {
  const v = await getViewer();
  if (!v) throw unauthorized();
  return v;
}
