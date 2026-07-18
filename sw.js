// Cache-first service worker: after the first visit the whole app (it is
// entirely static) loads from disk — instant repeat visits, fully offline.
// Bump VERSION on any deploy to invalidate.
const VERSION = 'tfo-v5';
const ASSETS = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js',
  'js/store.js',
  'js/data.js',
  'js/dates.js',
  'js/planner.js',
  'js/derive.js',
  'js/ui.js',
  'js/views.js',
  'js/overlays.js',
  'js/actions.js',
  'js/sync.js',
  'js/config.js',
  'fonts/newsreader-var.woff2',
  'fonts/newsreader-italic-var.woff2',
  'fonts/dm-sans-var.woff2',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'manifest.webmanifest',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    caches.match(request, { ignoreSearch: true }).then(hit =>
      hit ||
      fetch(request).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(request, copy));
        }
        return res;
      }).catch(() => (request.mode === 'navigate' ? caches.match('index.html') : undefined))
    )
  );
});
