/* Book-only app cache. CacheStorage is origin-wide: never clear another app. */
const BUILD='reading334-20260911-ui-cleanup';
const SCOPE=self.registration.scope;
let scopeHash=2166136261;for(const ch of new URL(SCOPE).pathname)scopeHash=Math.imul(scopeHash^ch.charCodeAt(0),16777619)>>>0;
const PREFIX='bookshelf-reading-'+scopeHash.toString(16)+'-';
const CACHE=PREFIX+BUILD;
const ASSETS=['./index.html','./manifest.webmanifest','./assets/css/app.css',
  './assets/js/domain.js','./assets/js/storage.js','./assets/js/repository.js','./assets/js/platform.js','./assets/js/api.js','./assets/js/bookmory.js','./assets/js/exports.js','./assets/js/ui.js','./assets/js/views-books.js','./assets/js/views-notes.js','./assets/js/views-settings.js','./assets/js/app.js',
  './assets/icons/icon.svg'];
const URLS=new Set(ASSETS.map(p=>new URL(p,SCOPE).href));
self.addEventListener('install',event=>{event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  // Fail the whole install when any core dependency is missing.
  await Promise.all(ASSETS.map(async path=>{const req=new Request(new URL(path,SCOPE),{cache:'no-store'});const res=await fetch(req);if(!res.ok)throw new Error('Precache failed');await cache.put(req,res);}));
  if(!self.registration.active)await self.skipWaiting();
})());});
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')event.waitUntil(self.skipWaiting());});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{
  await Promise.all((await caches.keys()).filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)));
  // Legacy cache belongs only to the known reading scope; no global deletion.
  if(new URL(SCOPE).pathname.endsWith('/reading/'))await caches.delete('bookshelf-v2');
  await self.clients.claim();
})());});
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(SCOPE))return;
  const isNav=req.mode==='navigate';
  if(isNav && ![new URL(SCOPE).pathname,new URL('./index.html',SCOPE).pathname].includes(url.pathname))return;
  const canonical=new URL(url.href);canonical.search='';canonical.hash='';
  if(!isNav&&!URLS.has(canonical.href))return;
  const cacheKey=isNav?new URL('./index.html',SCOPE).href:canonical.href;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE),hit=await cache.match(cacheKey);
    let timer;
    const network=(async()=>{const res=await fetch(req,{cache:'no-store'});if(!res.ok)throw new Error('HTTP '+res.status);const copy=res.clone();await cache.put(cacheKey,copy);return res;})();
    // Keep a late network/cache write alive, even if a cached page won the race.
    event.waitUntil(network.then(()=>{},()=>{}));
    try{
      if(!hit)return await network;
      return await Promise.race([network,new Promise(resolve=>{timer=setTimeout(()=>resolve(hit),2500);})]);
    }catch{
      if(hit)return hit;
      return new Response(isNav?'오프라인 파일이 아직 준비되지 않았어요. 인터넷에 연결한 뒤 다시 열어 주세요.':'Offline resource unavailable',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    }finally{clearTimeout(timer);}
  })());
});
