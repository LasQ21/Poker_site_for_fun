"use client";

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
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Помилка ${res.status}`);
  return data as T;
}

export async function fetcher<T = unknown>(url: string): Promise<T> {
  return handle<T>(await fetch(url, { headers: authHeaders(), cache: "no-store" }));
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
