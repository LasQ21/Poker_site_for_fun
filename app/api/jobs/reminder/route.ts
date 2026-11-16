import { z } from "zod";
import { verifyQstash } from "@/lib/qstash";
import { ensureBotUsername } from "@/lib/config";
import { handleReminderJob } from "@/lib/server/games";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text();
  if (!(await verifyQstash(req, raw))) return new Response("invalid signature", { status: 401 });
  const body = z.object({ gameId: z.string(), version: z.number() }).parse(JSON.parse(raw));
  await ensureBotUsername();
  return Response.json({ status: await handleReminderJob(body) });
}
