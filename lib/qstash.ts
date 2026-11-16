import { Client, Receiver } from "@upstash/qstash";
import { appUrl } from "@/lib/config";

export function qstashEnabled() {
  return Boolean(process.env.QSTASH_TOKEN);
}

/** Schedules a POST of `body` to `path` on this app at `at` (no-op when QStash is not configured). */
export async function scheduleJob(path: string, body: unknown, at: Date): Promise<string | null> {
  if (!qstashEnabled()) return null;
  const url = `${appUrl()}${path}`;
  if (url.startsWith("http://localhost")) return null; // QStash cannot reach localhost
  try {
    const client = new Client({ token: process.env.QSTASH_TOKEN!, baseUrl: process.env.QSTASH_URL || undefined });
    const notBefore = Math.max(Math.ceil(at.getTime() / 1000), Math.floor(Date.now() / 1000));
    const res = await client.publishJSON({ url, body, notBefore, retries: 2 });
    return "messageId" in res ? res.messageId : null;
  } catch (e) {
    console.error("[qstash] publish failed", e);
    return null;
  }
}

export async function verifyQstash(req: Request, rawBody: string): Promise<boolean> {
  const current = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const next = process.env.QSTASH_NEXT_SIGNING_KEY;
  const signature = req.headers.get("upstash-signature");
  if (!current || !next || !signature) return false;
  try {
    return await new Receiver({ currentSigningKey: current, nextSigningKey: next }).verify({
      signature,
      body: rawBody,
    });
  } catch {
    return false;
  }
}
