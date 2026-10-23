/* ============================================================
   sw.js — the service worker that makes the site installable as
   an app and keeps it readable when the signal at a green drops.

   The rule is "network first": when there is a connection, people
   always get the newest pages and data, exactly as if this file
   did not exist. A saved copy is used only when the network fails.
   So publishing a result never has to wait for anyone's cache.

   Photos, icons and PDFs are the exception: they never change once
   published, so they come from the saved copy when there is one.

   Never cached: other sites (Google Forms and Sheets, so entry forms,
   entry lists, draws and scores are always live), PayPal, and /api/.

   To force every phone to drop its saved copies, bump VERSION.
   ============================================================ */
const VERSION = 'swd-v150';
const NETWORK_TIMEOUT_MS = 4000;
const PAGES = VERSION + '-pages';
const MEDIA = VERSION + '-media';
const MAX_MEDIA = 150;            // photos are big; keep the newest 150

const PRECACHE = [
  '/offline.html',
  '/app',
  '/assets/app/app.css',
  '/legal-data.json',
  '/assets/app/app-logic.js',
  '/assets/app/app.js',
  '/assets/app/lqip.json',
  '/assets/app/fonts/PlusJakartaSans-var.woff2',
  '/assets/app/art/saved-empty.png',
  '/assets/app/swd-logo.png',
];

// Icons are served cache-first from MEDIA, so they are precached there.
const PRECACHE_MEDIA = [
  '/assets/icons/icon-192.png',
  '/assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(Promise.all([
    caches.open(PAGES).then((c) => c.addAll(PRECACHE)),
    caches.open(MEDIA).then((c) => c.addAll(PRECACHE_MEDIA)),
  ]));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isMedia(url) {
  // Never the app's own code (assets/app/): that must always be fresh.
  return /^\/(photos|pdfs|assets\/icons)\//.test(url.pathname);
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

// Safari refuses to open a page the service worker serves if that response came through a
// redirect ("Response served by service worker has redirections"). Rebuild it as a plain response.
async function clean(response) {
  if (!response || !response.redirected) return response;
  const body = await response.blob();
  const headers = new Headers(response.headers);
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

async function networkFirst(request) {
  const cache = await caches.open(PAGES);
  try {
    // On a weak signal fetch can stall for ages: after 4s, use the saved copy.
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), NETWORK_TIMEOUT_MS) : 0;
    let response;
    try {
      response = await fetch(request, ctrl ? { signal: ctrl.signal } : undefined);
    } finally {
      clearTimeout(timer);
    }
    // A page visit that was redirected: hand the redirect back to the browser instead of serving it ourselves.
    if (request.mode === 'navigate' && response.redirected && response.url) return Response.redirect(response.url, 302);
    if (response.ok) cache.put(request, (await clean(response.clone())));
    return clean(response);
  } catch (err) {
    const url = new URL(request.url);
    let saved = await cache.match(request, { ignoreVary: true });
    // Every /app/... screen is the same app page; any saved copy will do.
    if (!saved && request.mode === 'navigate' && url.pathname.startsWith('/app')) {
      saved = await cache.match('/app', { ignoreSearch: true });
    }
    if (saved) return markOffline(await clean(saved));
    if (request.mode === 'navigate') return cache.match('/offline.html');
    throw err;
  }
}

// Tell the page this is a saved copy, so it can say so ("You're offline,
// showing information saved at ..."). The Date header is when it was saved.
async function markOffline(response) {
  const headers = new Headers(response.headers);
  headers.set('x-swd-offline', '1');
  const body = await response.blob();
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

async function cacheFirst(request) {
  const cache = await caches.open(MEDIA);
  const saved = await cache.match(request);
  if (saved) return clean(saved);
  const response = await fetch(request);
  if (response.ok) {
    cache.put(request, (await clean(response.clone())));
    trim(MEDIA, MAX_MEDIA);
  }
  return clean(response);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Leave other sites (Google Forms, Sheets, fonts, PayPal) and our
  // live functions (calendar feed, live scoring) completely alone.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(isMedia(url) ? cacheFirst(request) : networkFirst(request));
});
