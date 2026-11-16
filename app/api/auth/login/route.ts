import { cookies } from "next/headers";
import { validateLoginWidget, signSession } from "@/lib/auth/telegram";
import { config } from "@/lib/config";
import { json, route } from "@/lib/server/http";
import { AppError } from "@/lib/server/errors";
import { upsertUser } from "@/lib/server/users";
import { SESSION_COOKIE } from "@/lib/server/viewer";

/** Telegram Login Widget callback (website). */
export const POST = route(async (req: Request) => {
  const data = await req.json();
  const tgUser = validateLoginWidget(data, config.botToken);
  if (!tgUser) throw new AppError(401, "Не вдалося перевірити вхід через Telegram");
  const user = await upsertUser(tgUser);
  (await cookies()).set(SESSION_COOKIE, signSession(user.id, config.sessionSecret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 3600,
  });
  return json({ user });
});
