"use client";

import { isKey } from "@/lib/i18n";
import { tr } from "@/lib/i18n/client";
import { getWebApp } from "./telegram";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function authHeaders(): Record<string, string> {
  const initData = getWebApp()?.initData;
  return initData ? { Authorization: `tma ${initData}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const { error, code, params } = data as { error?: string; code?: string; params?: Record<string, string | number> };
    throw new ApiError(res.status, isKey(code) ? tr(code, params) : (error ?? tr("common.error", { status: res.status })));
  }
  return data as T;
}

export async function fetcher<T = unknown>(url: string): Promise<T> {
  return handle<T>(await fetch(url, { headers: authHeaders(), cache: "no-store" }));
}

const etagCache = new Map<string, { etag: string; data: unknown }>();

/**
 * Conditional GET: sends the last ETag and reuses the previous data on 304. Returning the same
 * object lets SWR skip re-rendering when nothing changed.
 */
export async function etagFetcher<T = unknown>(url: string): Promise<T> {
  const prev = etagCache.get(url);
  const res = await fetch(url, {
    headers: { ...authHeaders(), ...(prev ? { "If-None-Match": prev.etag } : {}) },
    cache: "no-store",
  });
  if (res.status === 304 && prev) return prev.data as T;
  const data = await handle<T>(res);
  const etag = res.headers.get("etag");
  if (etag) etagCache.set(url, { etag, data });
  else etagCache.delete(url);
  return data;
}

export async function api<T = unknown>(url: string, method: string, body?: unknown): Promise<T> {
  return handle<T>(
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}
