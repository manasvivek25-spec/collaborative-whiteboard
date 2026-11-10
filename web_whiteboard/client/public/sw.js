// Service Worker for Collaborative Whiteboard PWA
const CACHE_NAME = 'whiteboard-cache-v2';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Let WebSockets and API requests pass directly to server
  if (e.request.url.includes('/api/') || e.request.url.includes('/ws') || e.request.method !== 'GET') {
    return;
  }

  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
