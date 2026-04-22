/* ============================================
   NoteVault PWA – Service Worker
   Strategy: Cache First (assets) + Network First (fonts)
   ============================================ */

const CACHE_NAME = 'notevault-v1.2';
const STATIC_CACHE = 'notevault-static-v1.2';
const FONT_CACHE   = 'notevault-fonts-v1.0';

// Assets to pre-cache on install
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png',
  './offline.html'
];

// ─── Install Event ─────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing NoteVault Service Worker…');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Pre-caching assets');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch(err => console.error('[SW] Pre-cache failed:', err))
  );
});

// ─── Activate Event ────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating NoteVault Service Worker…');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== STATIC_CACHE && name !== FONT_CACHE)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ─── Fetch Event ───────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and non-http(s) requests
  if (!url.protocol.startsWith('http')) return;

  // Google Fonts – Network First, fallback to cache
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(networkFirstWithCache(request, FONT_CACHE));
    return;
  }

  // Static app assets – Cache First, fallback to network
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirstWithNetwork(request));
    return;
  }

  // External resources – Network First
  event.respondWith(networkFirstWithCache(request, CACHE_NAME));
});

// ─── Caching Strategies ────────────────────────────────────────

/** Cache First: serve from cache, fall back to network, cache new responses */
async function cacheFirstWithNetwork(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkRes = await fetch(request);
    if (networkRes && networkRes.status === 200) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkRes.clone());
    }
    return networkRes;
  } catch {
    // Return offline fallback for navigation requests
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('./offline.html');
      return offlinePage || new Response('<h1>Offline</h1>', {
        headers: { 'Content-Type': 'text/html' }
      });
    }
    return new Response('Offline', { status: 503 });
  }
}

/** Network First: try network, fall back to cache */
async function networkFirstWithCache(request, cacheName) {
  try {
    const networkRes = await fetch(request);
    if (networkRes && networkRes.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkRes.clone());
    }
    return networkRes;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

// ─── Background Sync (for future API integration) ──────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-notes') {
    console.log('[SW] Background sync: notes');
    // Future: sync to remote server
  }
});

// ─── Push Notifications (ready for integration) ───────────────
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  const title = data.title || 'NoteVault';
  const options = {
    body: data.body || 'You have a new notification',
    icon: './icons/icon-192.png',
    badge: './icons/icon-72.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || './' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || './')
  );
});

console.log('[SW] NoteVault Service Worker loaded ✓');
