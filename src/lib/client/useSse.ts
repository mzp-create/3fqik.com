"use client";
import { useEffect, useRef } from "react";

/**
 * Subscribe to named SSE events; auto-reconnects (EventSource default).
 * IMPORTANT: handlers must capture only stable references (setState dispatchers,
 * module imports) — they are bound once at mount.
 * onReconnect fires after the stream re-opens following a drop (not on first open)
 * so callers can refetch state they may have missed.
 */
export function useSse(
  handlers: Record<string, (data: unknown) => void>,
  onReconnect?: () => void,
) {
  const openedOnce = useRef(false);
  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.addEventListener("open", () => {
      if (openedOnce.current) onReconnect?.();
      openedOnce.current = true;
    });
    for (const [event, fn] of Object.entries(handlers))
      es.addEventListener(event, (e) =>
        fn(JSON.parse((e as MessageEvent).data)),
      );
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
