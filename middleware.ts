import { NextResponse, type NextRequest } from "next/server";
import { translate } from "@/lib/i18n";

/**
 * CSRF protection for the API. The session cookie is SameSite=None in production (it must work inside
 * Telegram Web's iframe), so a cross-site page could otherwise POST to the API with the user's cookie.
 * State-changing requests must come from our own origin. Exceptions:
 *  - endpoints authenticated by their own secrets (Telegram webhook, QStash jobs, setup);
 *  - Mini App requests carrying `Authorization: tma …` (a custom header can't be sent cross-site
 *    without a CORS preflight, which this API never allows).
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const EXEMPT = [/^\/api\/bot\/?$/, /^\/api\/jobs\//, /^\/api\/setup\/?$/];

function sameOrigin(req: NextRequest): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site === "same-origin" || site === "none") return true;
  if (site) return false;
  // Browsers without Fetch Metadata: compare the Origin header with the host we were reached at.
  const origin = req.headers.get("origin");
  if (!origin || origin === "null") return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const hosts = [req.headers.get("host"), req.headers.get("x-forwarded-host"), req.nextUrl.host];
  return hosts.some((h) => h != null && h.split(",")[0].trim().toLowerCase() === originHost.toLowerCase());
}

export function middleware(req: NextRequest) {
  if (SAFE_METHODS.has(req.method)) return NextResponse.next();
  const path = req.nextUrl.pathname;
  if (EXEMPT.some((re) => re.test(path))) return NextResponse.next();
  if (req.headers.get("authorization")?.startsWith("tma ")) return NextResponse.next();
  if (sameOrigin(req)) return NextResponse.next();
  return NextResponse.json(
    { error: translate("uk", "errors.forbidden"), code: "errors.forbidden" },
    { status: 403 },
  );
}

export const config = {
  matcher: "/api/:path*",
};
