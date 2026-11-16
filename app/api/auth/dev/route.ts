import { cookies } from "next/headers";
import { signSession } from "@/lib/auth/telegram";
import { config } from "@/lib/config";
import { json, route } from "@/lib/server/http";
import { notFound } from "@/lib/server/errors";
import { upsertUser } from "@/lib/server/users";
import { SESSION_COOKIE } from "@/lib/server/viewer";
import { touchMember, upsertChat } from "@/lib/server/users";

/** Local development login without Telegram. Disabled unless DEV_LOGIN=1 outside production. */
export const GET = route(async (req: Request) => {
  if (!config.devLogin) throw notFound();
  const url = new URL(req.url);
  const id = Number(url.searchParams.get("id") ?? 1);
  const name = url.searchParams.get("name") ?? `Dev ${id}`;
  const user = await upsertUser({ id, first_name: name });
  const chat = url.searchParams.get("chat");
  if (chat) {
    await upsertChat(Number(chat), url.searchParams.get("chatTitle") ?? "Dev group");
    await touchMember(Number(chat), id);
  }
  (await cookies()).set(SESSION_COOKIE, signSession(user.id, config.sessionSecret), { path: "/", httpOnly: true });
  return json({ user });
});
