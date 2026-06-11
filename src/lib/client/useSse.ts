"use client";
import { useEffect } from "react";

/** Subscribe to named SSE events; auto-reconnects (EventSource default). */
export function useSse(handlers: Record<string, (data: unknown) => void>) {
  useEffect(() => {
    const es = new EventSource("/api/stream");
    for (const [event, fn] of Object.entries(handlers))
      es.addEventListener(event, (e) =>
        fn(JSON.parse((e as MessageEvent).data)),
      );
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
