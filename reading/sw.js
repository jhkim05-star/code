/* Reading cache only: this worker must never delete workout's offline files. */
const CACHE = 'bookshelf-v3-scopefix';
const ROOT = new URL('./', self.location.href);
const ASSETS = ['./', './index.html', './manifest.webmanifest', './assets/css/app.css', './assets/js/util.js', './assets/js/store.js', './assets/js/api.js', './assets/js/xlsx.js', './assets/js/stats.js', './assets/js/ui.js', './assets/js/views.js', './assets/js/app.js', './assets/icons/icon.svg', './assets/icons/icon-180.png', './assets/icons/icon-192.png', './assets/icons/icon-512.png'];
self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(async (cache) => {
        await Promise.all(ASSETS.map(async (path) => {
            const request = new Request(new URL(path, ROOT), { cache: 'no-store' }), response = await fetch(request);
            if (!response.ok)
                throw new Error('앱 파일 캐시 실패');
            await cache.put(request, response);
        }));
        await self.skipWaiting();
    }));
});
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('bookshelf-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
    const request = event.request, url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname))
        return;
    let write = Promise.resolve();
    const response = (async () => {
        const cache = await caches.open(CACHE), abort = new AbortController(), timer = setTimeout(() => abort.abort(), 2500);
        try {
            const res = await fetch(request, { cache: 'no-store', signal: abort.signal });
            if (res.status === 200) {
                const copy = res.clone();
                write = cache.put(request, copy).catch(() => { });
                return res;
            }
            return await cache.match(request) || res;
        }
        catch {
            const hit = await cache.match(request);
            if (hit)
                return hit;
            if (request.mode === 'navigate')
                return await cache.match(new URL('./index.html', ROOT)) || new Response('오프라인 사본이 없습니다.', { status: 503 });
            return new Response('오프라인 파일이 없습니다.', { status: 503 });
        }
        finally {
            clearTimeout(timer);
        }
    })();
    event.respondWith(response);
    event.waitUntil(response.then(() => write).catch(() => { }));
});
