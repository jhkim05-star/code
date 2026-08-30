/**
 * 오프라인용 서비스 워커.
 *
 * 앱 파일은 캐시에 넣어 두고 네트워크가 없어도 열리게 합니다.
 * 헬스장 지하에서 신호가 안 잡혀도 운동은 진행돼야 하니까요.
 * (AI 계획 생성만 인터넷이 필요합니다.)
 */

const CACHE = 'workout-log-v4';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/ui.js',
  './js/util.js',
  './js/store.js',
  './js/voice.js',
  './js/exercises.js',
  './js/planner.js',
  './js/runner.js',
  './js/ai.js',
  './js/views/plan.js',
  './js/views/run.js',
  './js/views/history.js',
  './js/views/stats.js',
  './js/views/settings.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // 하나가 없어도 설치는 계속되도록 개별로 담습니다
      .then(c => Promise.allSettled(ASSETS.map(u => c.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;      // API 호출은 그대로 통과

  // 캐시를 먼저 주고 뒤에서 갱신 — 오프라인에서도 즉시 열립니다
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
          return res;
        })
        .catch(() => hit || caches.match('./index.html'));
      return hit || net;
    }),
  );
});
