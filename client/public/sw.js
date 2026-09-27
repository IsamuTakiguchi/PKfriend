// Minimal app-shell service worker: network-first for navigation, cache-first for assets & sprites.
const SHELL = 'pkfriend-shell-v1';
const IMAGES = 'pkfriend-img-v2'; // v2: sprites are fetched with CORS (for canvas smoothing)
const ROOT = self.registration.scope; // works at '/' and at a sub path such as '/PKfriend/'
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== IMAGES).map(k => caches.delete(k)))).then(() => clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/ws') || url.pathname.startsWith('/api')) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(SHELL).then(cache => cache.put(ROOT, c)); return r; }).catch(() => caches.match(ROOT)));
    return;
  }
  if (url.hostname === 'raw.githubusercontent.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(IMAGES).then(async cache => { const hit = await cache.match(req); if (hit && !(hit.type === 'opaque' && req.mode === 'cors')) return hit; const r = await fetch(req); if (r.ok) cache.put(req, r.clone()); return r; }));
    return;
  }
  if (url.origin === location.origin) {
    e.respondWith(caches.open(SHELL).then(async cache => { const hit = await cache.match(req); const net = fetch(req).then(r => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => hit); return hit || net; }));
  }
});
