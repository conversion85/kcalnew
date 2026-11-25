const CACHE_NAME = 'kcal-v2.3-20261125';
const ASSETS = ['./', './index.html', './style.css', './script.js', './scanner.js?v=2.3', './scanner.js', './icon.svg', './icon-192.png', './icon-512.png', './manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('kcal-') && k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Product requests are never cached or replaced by an HTML offline page.
  if (url.pathname.startsWith('/.netlify/functions/')) return;
  event.respondWith(fetch(req).then(response => {
    if (response.ok && (req.mode === 'navigate' || ASSETS.some(asset => url.pathname.endsWith(asset.replace(/^\.\//,''))))) {
      const copy = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
    }
    return response;
  }).catch(() => caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
