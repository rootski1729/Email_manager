"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** window.location.origin on the client, "" during server render. */
export function useOrigin(): string {
  return useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => "",
  );
}
