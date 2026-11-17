import { cookies } from "next/headers";
import { json, route } from "@/lib/server/http";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/server/viewer";

/**
 * Expires the session cookie. It is cleared with the attributes of the embedded (Mini App) cookie:
 * SameSite=None; Secure in production, so the deletion is also accepted inside Telegram Web's iframe.
 */
export const POST = route(async () => {
  (await cookies()).set(SESSION_COOKIE, "", { ...sessionCookieOptions(true), maxAge: 0 });
  return json({ ok: true });
});
