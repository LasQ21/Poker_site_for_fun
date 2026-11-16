import { cookies } from "next/headers";
import { json, route } from "@/lib/server/http";
import { SESSION_COOKIE } from "@/lib/server/viewer";

export const POST = route(async () => {
  (await cookies()).delete(SESSION_COOKIE);
  return json({ ok: true });
});
