/* LoadWise service worker.
 * Privacy rule: it never caches API responses or authenticated pages. It only
 * caches versioned static assets (cache-first) and shows an offline page when
 * a navigation fails. All academic data always comes live from the backend. */
const CACHE = "loadwise-static-v2";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE_URL, "/icons/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return; // never touch API/cross-origin calls

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
  }
});

/* ---- Web Push ---------------------------------------------------------
 * The server sends { title, body, url, tag }. The payload is only ever used as
 * notification text (never as HTML) and `url` is restricted to same-origin paths. */
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "LoadWise", body: event.data ? event.data.text() : "" }; }
  const title = String(data.title || "LoadWise").slice(0, 120);
  event.waitUntil(self.registration.showNotification(title, {
    body: String(data.body || "").slice(0, 300),
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag ? String(data.tag).slice(0, 100) : undefined,
    data: { url: typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//") ? data.url : "/dashboard" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/dashboard", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) if (w.url.startsWith(self.location.origin) && "focus" in w) { w.navigate(target); return w.focus(); }
      return self.clients.openWindow(target);
    }),
  );
});
