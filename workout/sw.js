/** Versioned app-shell installation, network-first reads, and app-scoped cleanup only. */
const CACHE = 'workout-log-v23-m-performance-icon';
const PREFIX = 'workout-log-';
const ROOT = new URL('./', self.location.href);
const CORE = [
    './', './index.html', './reset.html', './manifest.webmanifest', './css/app.css',
    './js/app.js', './js/config.js', './js/util.js', './js/ui.js', './js/store.js', './js/validation.js', './js/persistence.js', './js/reset.js', './js/reset-page.js',
    './js/exercises.js', './js/weights.js', './js/timing.js', './js/planner.js', './js/runner.js', './js/voice.js', './js/ai.js', './js/ai-contract.js', './js/stats-model.js',
    './js/views/planTab.js', './js/views/planPreview.js', './js/views/dayEditor.js', './js/views/machinePicker.js', './js/views/execTab.js', './js/views/exercisePicker.js', './js/views/run.js', './js/views/history.js', './js/views/stats.js', './js/views/settings.js',
    './audio/manifest.json',
];
const OPTIONAL = [
    './icons/icon-m-performance-180.png',
    './icons/icon-m-performance-192.png',
    './icons/icon-m-performance-512.png',
    './icons/icon-m-performance-maskable-512.png'
];
const absolute = path => new URL(path, ROOT).href;
async function fetchTimed(req, ms = 2500) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), ms);
    try {
        return await fetch(req, { cache: 'no-store', signal: controller.signal });
    }
    finally {
        clearTimeout(timer);
    }
}
self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        // A missing essential module must not activate a half-installed release.
        await Promise.all(CORE.map(async (path) => {
            const response = await fetchTimed(absolute(path), 10000);
            if (!response.ok)
                throw new Error('Missing essential asset: ' + path);
            await cache.put(absolute(path), response);
        }));
        await Promise.allSettled(OPTIONAL.map(async (path) => {
            const response = await fetchTimed(absolute(path), 3000);
            if (response.ok)
                await cache.put(absolute(path), response);
        }));
        // Audio is optional. Missing recordings fall back to device speech without preventing app installation.
        try {
            const manifest = await (await cache.match(absolute('./audio/manifest.json'))).json();
            const paths = Object.values(manifest.clips || {}).slice(0, 60).filter(p => typeof p === 'string' && new URL(p, ROOT).origin === ROOT.origin && new URL(p, ROOT).pathname.startsWith(ROOT.pathname + 'audio/'));
            await Promise.allSettled(paths.map(async (path) => {
                const response = await fetchTimed(absolute(path), 2000);
                if (response.status === 200)
                    await cache.put(absolute(path), response);
            }));
        }
        catch { }
        await self.skipWaiting();
    })());
});
self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
        await self.clients.claim();
    })());
});
self.addEventListener('fetch', event => {
    const request = event.request, url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname))
        return;
    let storePromise = Promise.resolve();
    const responsePromise = (async () => {
        const cache = await caches.open(CACHE);
        const isAudioClip = url.pathname.startsWith(ROOT.pathname + 'audio/') && !url.pathname.endsWith('/manifest.json');
        if (isAudioClip) {
            const hit = await cache.match(request);
            if (hit)
                return hit;
            try {
                const response = await fetchTimed(request, 1200);
                if (response.status === 200 && !request.headers.has('range'))
                    storePromise = cache.put(request, response.clone()).catch(() => { });
                return response;
            }
            catch {
                return new Response('녹음 음성을 불러오지 못했습니다.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
            }
        }
        try {
            const response = await fetchTimed(request);
            if (response.status === 200 && !request.headers.has('range')) {
                const copy = response.clone();
                storePromise = cache.put(request, copy).catch(() => { });
                return response;
            }
            const hit = await cache.match(request);
            return hit || response;
        }
        catch {
            const hit = await cache.match(request);
            if (hit)
                return hit;
            if (request.mode === 'navigate') {
                const shell = await cache.match(absolute('./index.html'));
                if (shell)
                    return shell;
            }
            return new Response('이 파일의 오프라인 사본이 없습니다.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        }
    })();
    event.respondWith(responsePromise);
    event.waitUntil(responsePromise.then(() => storePromise).catch(() => { }));
});
self.addEventListener('message', event => {
    if (event.data?.type !== 'CACHE_STATUS')
        return;
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE), missing = [];
        for (const path of CORE)
            if (!await cache.match(absolute(path)))
                missing.push(path);
        event.ports[0]?.postMessage({ version: CACHE, ready: missing.length === 0, missing });
    })());
});
