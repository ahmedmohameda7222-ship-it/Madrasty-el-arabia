"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useAccountScope } from "./AccountScope";

export function MoreGroup({ group, children }: { group: string; children: ReactNode }) {
  const { accountId, sessionId, persona } = useAccountScope();
  const key = `madrasty:more:${accountId}:${sessionId}:${persona}:${group}`;
  const details = useRef<HTMLDetailsElement>(null);

  useLayoutEffect(() => {
    const element = details.current;
    if (!element) return;
    try { element.open = sessionStorage.getItem(key) === "open"; } catch { /* Storage is optional. */ }
  }, [key]);

  return <details ref={details} className="more-group" onToggle={event => {
    try {
      if (event.currentTarget.open) sessionStorage.setItem(key,"open");
      else sessionStorage.removeItem(key);
    } catch { /* Keep native disclosure available. */ }
  }}>{children}</details>;
}
