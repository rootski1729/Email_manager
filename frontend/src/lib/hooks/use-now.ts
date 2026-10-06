"use client";

import { useSyncExternalStore } from "react";

/**
 * A shared, coarse clock. Components that render relative times subscribe to
 * it instead of calling Date.now() during render (which would be impure).
 */
const TICK_MS = 30_000;
let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => 0,
  );
}

/** A per-second clock for short countdowns. Only active while mounted. */
export function useSecondTicker(active: boolean): number {
  return useSyncExternalStore(
    (cb) => {
      if (!active) return () => {};
      const id = setInterval(cb, 1000);
      return () => clearInterval(id);
    },
    () => Math.floor(Date.now() / 1000),
    () => 0,
  );
}
