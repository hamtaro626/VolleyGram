/* VolleyGram's service worker (v0.55): the app keeps working with no signal,
   which in a gym is often.

   Network first, cache as the fallback -- the same choice as iScribe and
   laditdah, and for the same reason. A cache-first worker serves yesterday's
   code until the cache name changes, and this app ships often. Online phones
   get current files; offline ones still get a working app.

   With one difference: a slow network gets NETWORK_WAIT_MS before the cache
   answers instead. Gym wifi is less often "off" than "barely on", and a fetch
   that hangs for a minute is worse than a copy from last time. */

// Must match the ?v= in index.html. test/migration.js §70 checks that, and that
// every versioned file index.html loads is listed below at that version.
const VERSION = '0.55';
const CACHE = `volleygram-v${VERSION}`;
const NETWORK_WAIT_MS = 3000;

// addAll is all-or-nothing: one 404 rejects the install and offline support is
// lost entirely. Every path below must exist -- §70 checks that too.
const SHELL = [
  './',
  'index.html',
  `style.css?v=${VERSION}`,
  `script.js?v=${VERSION}`,
  `manifest.webmanifest?v=${VERSION}`,
  `assets/logo.webp?v=${VERSION}`,
  `assets/favicon-32.png?v=${VERSION}`,
  `assets/icon-180.png?v=${VERSION}`,
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

// Old versions' caches go, so a phone never holds more than one copy.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

function fromCache(request) {
  // A share link is the page with #g=... on the end. The hash never reaches
  // here, so any page load that misses the cache gets the app itself. Only page
  // loads: a missing image answered with HTML would just be a broken image.
  return caches.match(request).then((hit) => {
    if (hit || request.mode !== 'navigate') return hit;
    return caches.match('index.html');
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  // Only this site's own files. Anything else goes straight to the network.
  if (new URL(request.url).origin !== self.location.origin) return;

  const network = fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  });

  const slow = new Promise((resolve) => setTimeout(resolve, NETWORK_WAIT_MS))
    .then(() => fromCache(request))
    .then((hit) => hit || network);

  event.respondWith(
    Promise.race([network, slow]).catch(() => fromCache(request)),
  );
});
