import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { isKey, translate } from "@/lib/i18n";
import { AppError } from "./errors";

/** Error body: `error` is Ukrainian text (fallback), `code` + `params` let the client translate. */
function body(code: Parameters<typeof translate>[1], params?: Record<string, string | number | null | undefined>) {
  return { error: translate("uk", code, params), code, params };
}

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function errorResponse(e: unknown) {
  if (e instanceof AppError) return NextResponse.json(body(e.key, e.params), { status: e.status });
  if (e instanceof ZodError) {
    const m = e.issues[0]?.message;
    return NextResponse.json(body(isKey(m) ? m : "errors.invalid"), { status: 400 });
  }
  console.error(e);
  return NextResponse.json(body("errors.internal"), { status: 500 });
}

/** Wraps a route handler with uniform JSON error handling. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      return errorResponse(e);
    }
  };
}
