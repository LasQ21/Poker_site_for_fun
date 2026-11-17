"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

/** In-app navigation stack (paths), maintained by AppShell; lets "back" know whether history exists. */
const stack: string[] = [];
/** Target of a pending `router.replace` (see `markReplace`). */
let replacing: string | null = null;

export function recordNavigation(path: string, opts: { replace?: boolean } = {}) {
  if (stack.at(-1) === path) return;
  const replace = opts.replace || replacing === path;
  replacing = null;
  if (replace) {
    // The browser replaced the current history entry: no new entry to go back to.
    stack.pop();
    stack.push(path);
    return;
  }
  // Arriving at the previous entry means the user went back.
  if (stack.at(-2) === path) stack.pop();
  else stack.push(path);
}

/**
 * Call right before `router.replace(path)`: the next navigation to `path` replaces the top of the
 * stack instead of pushing, so `canGoBack()` matches the browser history.
 */
export function markReplace(path: string) {
  replacing = path;
}

/** `router.replace` that keeps the navigation stack in sync (see `markReplace`). */
export function useAppReplace() {
  const router = useRouter();
  return useCallback(
    (path: string) => {
      markReplace(path);
      router.replace(path);
    },
    [router],
  );
}

export function canGoBack() {
  return stack.length > 1;
}

/** Back handler: browser history inside the app when there is any, otherwise `fallback`. */
export function useAppBack(fallback = "/") {
  const router = useRouter();
  return useCallback(() => {
    if (canGoBack()) router.back();
    else {
      markReplace(fallback);
      router.replace(fallback);
    }
  }, [router, fallback]);
}

/** Test helper. */
export function resetNavigation() {
  stack.length = 0;
  replacing = null;
}
