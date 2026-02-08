const CACHE_NAME = "meronq-v101";
const CORE = [
  "/meronq/",
  "/meronq/index.html",
  "/meronq/site.js",
  "/meronq/manifest.json",
  "/meronq/icons/icon-192.png",
  "/meronq/icons/icon-512.png",
  "/meronq/stores/index.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Только наш scope
  if (!url.pathname.startsWith("/meronq/")) return;

  // Network-first для JSON (магазины/меню), чтобы всегда было свежее
  if (url.pathname.endsWith(".json") || url.pathname.endsWith(".csv")) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Cache-first для остального
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
