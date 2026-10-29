const CACHE_NAME = "seif-messages-shell-v13";
const SHELL = ["./", "./index.html", "./style.css", "./app.js", "./manifest.json", "./icon.svg"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(request).then(response => {
    if (response && response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match(request).then(cached => cached || caches.match("./index.html"))));
});
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = { body: event.data ? event.data.text() : "" }; }
  const options = { body: data.body || "لديك إشعار جديد", icon: "./icon.svg", badge: "./icon.svg", tag: data.tag || "seif-messages-notification", renotify: true, requireInteraction: Boolean(data.call), data: { url: data.url || "./" } };
  event.waitUntil(self.registration.showNotification(data.title || "Seif Messages", options));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data && event.notification.data.url || "./", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
    for (const client of clients) if (client.url.startsWith(self.location.origin) && "focus" in client) return client.focus();
    return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
  }));
});
