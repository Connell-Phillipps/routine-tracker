// Service worker: cache-first app shell so the app works with no signal.
// tools/release.py rewrites CACHE_VERSION and SHELL; run it after changing any file.
const CACHE_VERSION = '1.0.0';
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const ART_CACHE = 'art-v1'; // user art in assets/, kept across app versions

const SHELL = [
  './',
  'index.html',
  'manifest.json',
  'css/app.css',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'js/app.js',
  'js/config/game.js',
  'js/config/program.js',
  'js/data/backup.js',
  'js/data/db.js',
  'js/data/store.js',
  'js/engine/calendar.js',
  'js/engine/coach.js',
  'js/engine/environment.js',
  'js/engine/game.js',
  'js/engine/metrics.js',
  'js/engine/pace.js',
  'js/engine/progression.js',
  'js/ui/art.js',
  'js/ui/charts.js',
  'js/ui/dom.js',
  'js/ui/views/coach.js',
  'js/ui/views/habits.js',
  'js/ui/views/home.js',
  'js/ui/views/settings.js',
  'js/ui/views/stats.js',
  'js/ui/views/train.js',
  'js/util/dates.js',
  'js/version.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL.map((p) => new Request(p, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Only the app page itself comes from the cache; other pages (e.g. tests/) go to the network.
    const root = new URL(self.registration.scope).pathname;
    if (url.pathname === root || url.pathname === `${root}index.html`) {
      event.respondWith(caches.match('index.html', { cacheName: SHELL_CACHE }).then((hit) => hit || fetch(req)));
    }
    return;
  }

  if (url.pathname.includes('/assets/')) {
    // Art slots: network first so new drop-in art shows up, cached for offline.
    event.respondWith((async () => {
      const cache = await caches.open(ART_CACHE);
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        else await cache.delete(req);
        return res;
      } catch {
        return (await cache.match(req)) || Response.error();
      }
    })());
    return;
  }

  event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
