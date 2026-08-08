const CACHE = 'dds-amins-dent-study-v21';
const BASE_PATH = '/DDS/';
const APP_SHELL = [
  BASE_PATH,
  `${BASE_PATH}index.html`,
  `${BASE_PATH}courses.json`,
  `${BASE_PATH}manifest.webmanifest`,
  `${BASE_PATH}assets/css/styles.css?v=21`,
  `${BASE_PATH}assets/js/app.js?v=21`,
  `${BASE_PATH}assets/js/storage.js?v=21`,
  `${BASE_PATH}assets/js/layout-utils.js?v=21`,
  `${BASE_PATH}assets/js/github-sync.js?v=21`,
  `${BASE_PATH}assets/images/tooth-mark.svg`,
  `${BASE_PATH}assets/images/tooth-layers.svg`,
  `${BASE_PATH}questions/dent601-session1.json`,
  `${BASE_PATH}questions/dent601-session2.json`,
  `${BASE_PATH}questions/perio-basics.json`
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const networkFirst = request.mode === 'navigate' || ['script', 'style'].includes(request.destination) || url.pathname.endsWith('.json');

  if (networkFirst) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match(`${BASE_PATH}index.html`)))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});
