import { verifyQstash } from "@/lib/qstash";

export const dynamic = "force-dynamic";

/**
 * "Update your stacks" reminders were removed: stacks are only recorded at the end of a game.
 * The endpoint stays so jobs queued before the change are acknowledged instead of retried.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!(await verifyQstash(req, raw))) return new Response("invalid signature", { status: 401 });
  return Response.json({ status: "disabled" });
}
