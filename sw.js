/* ============================================================
   sw.js — the service worker that makes the site installable as
   an app and keeps it readable when the signal at a green drops.

   The rule is "network first": when there is a connection, people
   always get the newest pages and data, exactly as if this file
   did not exist. A saved copy is used only when the network fails.
   So publishing a result never has to wait for anyone's cache.

   Photos, icons and PDFs are the exception: they never change once
   published, so they come from the saved copy when there is one.

   To force every phone to drop its saved copies, bump VERSION.
   ============================================================ */
const VERSION = 'swd-v1';
const PAGES = VERSION + '-pages';
const MEDIA = VERSION + '-media';
const MAX_MEDIA = 150;            // photos are big; keep the newest 150

const PRECACHE = [
  '/offline.html',
  '/assets/icons/icon-192.png',
  '/assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => c.addAll(PRECACHE)));
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
  return /^\/(photos|assets|pdfs)\//.test(url.pathname);
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function networkFirst(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const saved = await cache.match(request, { ignoreVary: true });
    if (saved) return saved;
    if (request.mode === 'navigate') return cache.match('/offline.html');
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(MEDIA);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) {
    cache.put(request, response.clone());
    trim(MEDIA, MAX_MEDIA);
  }
  return response;
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
