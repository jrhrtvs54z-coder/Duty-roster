/* Alert Duty Roster offline support.
   The page is fetched fresh whenever the phone is online (falling back to the saved copy offline),
   so updates show up on the next launch. Icons and fonts come from the cache. */
const VERSION = 'dr-1.2.0';
const FONTS = 'dr-fonts';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png', './icons/favicon-32.png'];
const OFFLINE = () => new Response('You’re offline and the app isn’t saved on this phone yet. Connect once, then it works offline.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== FONTS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/* Safari refuses a redirected response for a page load, so copy it into a plain one. */
async function clean(res) {
  if (!res.redirected) return res;
  const body = await res.blob();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    const isPage = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
    if (isPage) {
      event.respondWith((async () => {
        const cache = await caches.open(VERSION);
        try {
          const res = await clean(await fetch(url.href.split('#')[0], { cache: 'no-cache', credentials: 'same-origin' }));
          if (res && res.ok) await cache.put('./index.html', res.clone());
          return res;
        } catch (e) {
          return (await cache.match('./index.html')) || (await cache.match('./')) || OFFLINE();
        }
      })());
      return;
    }
    const fetching = fetch(req).then(async (res) => {
      if (res && res.ok) { const cache = await caches.open(VERSION); await cache.put(req, res.clone()); }
      return res;
    });
    event.waitUntil(fetching.then(() => {}, () => {}));
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      try { return await fetching; } catch (e) { return OFFLINE(); }
    })());
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith((async () => {
      const cache = await caches.open(FONTS);
      const cached = await cache.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    })());
  }
});
