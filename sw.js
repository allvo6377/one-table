// Service worker: precache the whole (static) app for offline use. App code
// is served network-first so online visits always get the latest deploy;
// fonts/icons are cache-first. Bump VERSION on any deploy to invalidate.
const VERSION = 'tfo-architect-v12';
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
  'js/timer.js',
  'js/tags.js',
  'js/config.js',
  'js/content.js',
  'js/admin.js',
  'js/recipe-details.js',
  'img/sukuma-ugali.jpg',
  'img/nduma-eggs.webp',
  'img/kenyan-uji.webp',
  'img/chapati-ndengu.webp',
  'img/ingokho-stew.jpg',
  'img/omena-ugali.jpg',
  'img/beef-posho.jpg',
  'img/chapati-beef-stew.jpg',
  'img/eggs-avocado-tea.webp',
  'img/rice-ndengu.webp',
  'img/bread-eggs-chai.webp',
  'img/homemade-bread.jpg',
  'img/sausage-eggs.webp',
  'img/egg-curry.jpg',
  'img/fish-stew-rice.webp',
  'img/tilapia-ugali.jpg',
  'fonts/source-serif-var.woff2',
  'fonts/source-serif-italic-var.woff2',
  'fonts/hanken-var.woff2',
  'fonts/playfair-var.woff2',
  'fonts/playfair-italic-var.woff2',
  'fonts/inter-var.woff2',
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

// Fonts and icons are immutable — serve them cache-first (instant, offline).
// Everything else (HTML, JS, CSS, manifest) is network-first so an online
// visit always gets the freshest deploy; the cache is the offline fallback.
// This stops returning visitors getting stuck on a stale cached build.
const IMMUTABLE = /\.(woff2|png|svg)$/;

function cachePut(request, res) {
  if (res && res.ok) {
    const copy = res.clone();
    caches.open(VERSION).then(c => c.put(request, copy));
  }
  return res;
}

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return;
  const url = new URL(request.url);

  if (IMMUTABLE.test(url.pathname)) {
    e.respondWith(
      caches.match(request, { ignoreSearch: true })
        .then(hit => hit || fetch(request).then(res => cachePut(request, res)))
    );
    return;
  }

  // network-first with cache fallback
  e.respondWith(
    fetch(request)
      .then(res => cachePut(request, res))
      .catch(() => caches.match(request, { ignoreSearch: true })
        .then(hit => hit || (request.mode === 'navigate' ? caches.match('index.html') : undefined)))
  );
});
