import { z } from "zod";
import { verifyQstash } from "@/lib/qstash";
import { handleBlindJob } from "@/lib/server/games";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text();
  if (!(await verifyQstash(req, raw))) return new Response("invalid signature", { status: 401 });
  const body = z.object({ gameId: z.string(), version: z.number(), level: z.number() }).parse(JSON.parse(raw));
  return Response.json({ status: await handleBlindJob(body) });
}
