// Offline support: keeps a copy of the app so it opens without a connection.
// Our own files are fetched fresh when online (so updates arrive straight away);
// the pinned library files from CDNs never change, so the saved copy is used.

const CACHE = "tolerate-v6";
const SHELL = [
  "/", "/index.html", "/css/styles.css", "/manifest.webmanifest",
  "/js/app.js", "/js/lib.js", "/js/db.js", "/js/firebase-config.js", "/js/sync.js", "/js/model.js",
  "/js/util.js", "/js/icons.js", "/js/ui.js", "/js/log.js", "/js/history.js", "/js/bulk.js",
  "/js/foods.js", "/js/allergens.js", "/js/settings.js", "/js/reminders.js", "/js/reference.js",
  "/icons/icon.svg", "/icons/icon-192.png", "/icons/badge-96.png",
];
const CDN_HOSTS = ["cdn.jsdelivr.net", "www.gstatic.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin && !url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(req));
  } else if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(req));
  }
  // Everything else (the database, the sheet sync) is left alone.
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req)) || (req.mode === "navigate" ? cache.match("/index.html") : Response.error());
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") cache.put(req, res.clone());
  return res;
}

// --- The daily reminder ----------------------------------------------------------

self.addEventListener("push", (event) => {
  let message = {};
  try { message = event.data?.json() ?? {}; } catch { message = { body: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(message.title || "TolerATE", {
    body: message.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    tag: message.tag || "tolerate",
    renotify: true,
  }));
});

// Tapping the notification opens the app (or brings it to the front).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
    if (open) return open.focus();
    return self.clients.openWindow("/");
  })());
});
