// WorldBet 2026 — minimal service worker for PWA installability.
// Does NOT cache HTML or API responses — stale odds/balances would be dangerous.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

// Pass-through fetch handler: required for Chrome installability heuristic,
// but we never serve from cache so live data is always fresh.
self.addEventListener("fetch", (event) => {
  // Only handle same-origin requests; let third-party go through normally.
  if (!event.request.url.startsWith(self.location.origin)) return;
  // Never intercept navigation or API requests — just let the network handle them.
  event.respondWith(fetch(event.request));
});
