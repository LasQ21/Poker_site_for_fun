import { z } from "zod";
import { requireViewer } from "@/lib/server/viewer";
import { json, route } from "@/lib/server/http";
import { joinByCode } from "@/lib/server/games";

export const dynamic = "force-dynamic";

/** Join a game by its 4-digit code. */
export const POST = route(async (req: Request) => {
  const viewer = await requireViewer();
  const { code } = z.object({ code: z.string().regex(/^\d{4}$/, "errors.codeFormat") }).parse(await req.json());
  return json(await joinByCode(viewer, code));
});
