"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

/** In-app navigation stack (paths), maintained by AppShell; lets "back" know whether history exists. */
const stack: string[] = [];

export function recordNavigation(path: string) {
  if (stack.at(-1) === path) return;
  // Arriving at the previous entry means the user went back.
  if (stack.at(-2) === path) stack.pop();
  else stack.push(path);
}

export function canGoBack() {
  return stack.length > 1;
}

/** Back handler: browser history inside the app when there is any, otherwise `fallback`. */
export function useAppBack(fallback = "/") {
  const router = useRouter();
  return useCallback(() => {
    if (canGoBack()) router.back();
    else router.replace(fallback);
  }, [router, fallback]);
}
