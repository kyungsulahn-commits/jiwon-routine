// Cache version update to invalidate old cache
const CACHE_NAME = 'jiwon-routine-v4';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => caches.delete(key)));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Always network first
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
