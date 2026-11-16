import { createHash } from "node:crypto";

export const config = {
  get botToken() {
    return process.env.BOT_TOKEN ?? "";
  },
  get botUsername() {
    return (process.env.BOT_USERNAME ?? "").replace(/^@/, "");
  },
  get miniAppShortName() {
    return process.env.MINIAPP_SHORT_NAME ?? "";
  },
  get webhookSecret() {
    return process.env.WEBHOOK_SECRET ?? "";
  },
  get setupSecret() {
    return process.env.SETUP_SECRET ?? "";
  },
  get sessionSecret() {
    if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
    if (process.env.BOT_TOKEN) return createHash("sha256").update(`session-secret:${process.env.BOT_TOKEN}`).digest("hex");
    if (process.env.DEV_LOGIN === "1" && process.env.NODE_ENV !== "production") return "dev-only-session-secret";
    return "";
  },
  get devLogin() {
    return process.env.DEV_LOGIN === "1" && process.env.NODE_ENV !== "production";
  },
};

export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/** Direct link that opens the Mini App (works in groups, unlike web_app buttons). */
export function miniAppLink(startParam?: string): string {
  if (config.botUsername && config.miniAppShortName) {
    const base = `https://t.me/${config.botUsername}/${config.miniAppShortName}`;
    return startParam ? `${base}?startapp=${encodeURIComponent(startParam)}` : base;
  }
  return startParam ? `${appUrl()}/g/${startParam}` : appUrl();
}

export function gameWebUrl(gameId: string) {
  return `${appUrl()}/g/${gameId}`;
}
