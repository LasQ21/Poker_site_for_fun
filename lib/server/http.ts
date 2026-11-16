import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./errors";

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function errorResponse(e: unknown) {
  if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof ZodError) {
    return NextResponse.json({ error: e.issues[0]?.message ?? "Некоректні дані" }, { status: 400 });
  }
  console.error(e);
  return NextResponse.json({ error: "Внутрішня помилка сервера" }, { status: 500 });
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
