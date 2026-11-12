/* 설치형 웹앱용 서비스 워커. 한 번 연 뒤에는 인터넷 없이도 계산된다. */
const CACHE = 'run-c9ede30399';
const PRECACHE = ["./", "race-pace/", "training-week/", "log/", "long-run-check/", "shoe-mileage/", "heart-rate-zones/", "pace-converter/", "fitness-age/", "gear/", "about/", "privacy/", "assets/site.css?v=c9ede30399", "assets/core.js?v=c9ede30399", "assets/app.js?v=c9ede30399", "manifest.webmanifest", "icons/icon-192.png"];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('run-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {                 // 페이지: 새 것을 먼저, 안 되면 저장해 둔 것
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {   // 그 밖: 저장해 둔 것을 먼저
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
