// Service worker Metando: tylko strona „Brak internetu” dla zainstalowanej aplikacji.
// Niczego innego nie zapamiętujemy — strony zależą od logowania i zmieniają się na żywo.
const CACHE = "metando-offline-v2";
// Bez „.html”: Cloudflare przekierowuje /offline.html na /offline, a przekierowanej odpowiedzi nie można podać.
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});
