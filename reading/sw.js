/* 오프라인 지원 — 앱 자체 파일만 캐시하고, 표지·검색 요청은 항상 네트워크로.
 *
 * 네트워크 우선(network-first) 전략을 쓴다. 온라인 상태에서는 매번 네트워크로
 * 최신 파일을 받아와 화면에 쓰고 캐시도 그걸로 갱신하며, 오프라인일 때만
 * 마지막으로 받아 둔 캐시로 대체한다.
 *
 * 예전에는 캐시 우선(cache-first) 전략이었는데, 그러면 sw.js 자신의 내용이
 * 바뀌지 않는 한 브라우저가 새 서비스워커를 설치하지 않고, 그러면 코드를
 * 아무리 새로 배포해도 이미 앱을 열어 둔 사용자에게는 반영되지 않는 문제가
 * 있었다(설정 화면에 새로 추가한 항목이 안 보이는 식으로 나타났다).
 * 네트워크 우선으로 바꾸면 이 문제 자체가 사라지므로, CACHE 이름을 앞으로
 * 계속 올려야 할 필요도 없다.
 */
const CACHE = 'bookshelf-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/app.css',
  './assets/js/util.js',
  './assets/js/store.js',
  './assets/js/api.js',
  './assets/js/xlsx.js',
  './assets/js/stats.js',
  './assets/js/ui.js',
  './assets/js/views.js',
  './assets/js/app.js',
  './assets/icons/icon.svg',
  './assets/icons/icon-180.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 외부(표지 이미지·메타데이터 API·카카오 프록시)는 캐시를 거치지 않는다
  if (url.origin !== self.location.origin) return;

  // cache: 'no-store' 로 브라우저의 일반 HTTP 캐시(Cache-Control 등)를 우회한다.
  // 이걸 빼면 GitHub Pages 등이 정적 파일에 붙이는 max-age 때문에, 서버에
  // 새 파일을 올려도 브라우저가 로컬 HTTP 캐시에 있는 예전 응답을 그대로
  // 돌려줘서 fetch() 자체가 네트워크까지 가지 않는 경우가 있다(실제로 겪은
  // 문제 — 재배포해도 화면이 안 바뀌는 원인이었다).
  e.respondWith(
    fetch(req, { cache: 'no-store' }).then(function (res) {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    })
  );
});
