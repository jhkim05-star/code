/**
 * 오프라인용 서비스 워커.
 *
 * 앱 파일은 캐시에 넣어 두고 네트워크가 없어도 열리게 합니다.
 * 헬스장 지하에서 신호가 안 잡혀도 운동은 진행돼야 하니까요.
 * (AI 계획 생성만 인터넷이 필요합니다.)
 */

const CACHE = 'workout-log-v17';

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
  './js/weights.js',
  './js/planner.js',
  './js/runner.js',
  './js/ai.js',
  './js/views/planTab.js',
  './js/views/execTab.js',
  './js/views/exercisePicker.js',
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
      .then(async (c) => {
        await Promise.allSettled(ASSETS.map(u => c.add(u)));
        // 목소리 클립도 미리 받아 둡니다. 운동 중에 한 개씩 받아오면 신호가
        // 약한 곳(헬스장 지하)에서 카운트가 늦거나 아예 안 들립니다.
        try {
          const res = await fetch('./audio/manifest.json', { cache: 'no-cache' });
          const json = await res.json();
          await Promise.allSettled(Object.values(json?.clips || {}).map(u => c.add(u)));
        } catch { /* 목소리 파일이 없어도 앱은 그대로 동작합니다 */ }
      })
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

const save = (req, res) => {
  if (res && res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
  return res;
};

/** 캐시부터 주고 뒤에서 갱신 — 소리처럼 "늦으면 안 되는" 파일에 씁니다 */
function cacheFirst(req) {
  return caches.match(req).then((hit) => {
    const net = fetch(req).then(res => save(req, res)).catch(() => hit);
    return hit || net;
  });
}

/**
 * 네트워크를 먼저 보되 너무 오래 걸리면 캐시로 넘어갑니다.
 * 배포한 새 버전이 바로 뜨게 하면서도, 신호가 약한 곳에서 앱이 멈춰 보이지
 * 않게 하려는 것입니다.
 */
function networkFirst(req, timeoutMs = 2500) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (res) => { if (!settled && res) { settled = true; resolve(res); } };
    const fallback = () => caches.match(req)
      .then(hit => done(hit || caches.match('./index.html')));

    const timer = setTimeout(fallback, timeoutMs);
    fetch(req)
      .then((res) => { clearTimeout(timer); done(save(req, res)); })
      .catch(() => { clearTimeout(timer); fallback(); });
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;      // API 호출은 그대로 통과

  // 목소리 클립은 캐시부터 — 운동 중에 네트워크를 기다리면 카운트가 늦거나
  // 아예 안 들립니다. 파일 이름이 곧 내용이라 캐시가 낡을 일도 없습니다.
  if (/\/audio\/.+\.(mp3|m4a|wav|ogg|aac)$/i.test(url.pathname)) {
    e.respondWith(cacheFirst(req));
    return;
  }

  // manifest 는 목소리를 바꿔 넣었을 때 바로 반영되도록 네트워크 먼저,
  // 나머지 앱 코드도 네트워크 먼저(새로 배포한 버전이 바로 뜨도록).
  e.respondWith(networkFirst(req));
});
