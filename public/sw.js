/* Revenant service worker: offline app shell, and the ACK button on lock-screen pages. */
const CACHE = 'revenant-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Network first for the page, so a new build is picked up; cached shell when offline.
    event.respondWith(fetch(req).catch(() => caches.match('/')));
    return;
  }
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && new URL(req.url).pathname.startsWith('/assets/')) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

/**
 * Tapping a lock-screen page: the ACK action acknowledges it in every open
 * Revenant window; any tap brings the pager to the front.
 */
function handleNotificationClick(notification, action) {
  const pageId = notification.data && notification.data.pageId;
  notification.close();
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    if (action === 'ack' && pageId) {
      for (const c of clients) c.postMessage({ type: 'ack', pageId });
    }
    const open = clients[0];
    if (open) return open.focus().catch(() => open);
    return self.clients.openWindow('/');
  });
}
self.handleNotificationClick = handleNotificationClick;

self.addEventListener('notificationclick', (event) => {
  event.waitUntil(handleNotificationClick(event.notification, event.action));
});
