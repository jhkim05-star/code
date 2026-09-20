/* Versioned cache-first shell. Only this app's exact scope/prefix is owned. */
const VERSION='1.1.0';
const SCOPE=self.registration.scope;
let h=2166136261;for(const c of SCOPE)h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;
const PREFIX=`haru-page-${h.toString(16)}-`,CACHE=PREFIX+VERSION;
const PATHS=['./','./index.html','./style.css','./js/domain.js','./js/storage.js','./js/import.js','./js/app.js','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/apple.png','./manifest.webmanifest'];
const URLS=new Set(PATHS.map(p=>new URL(p,SCOPE).href));
self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(CACHE);await Promise.all([...URLS].map(async url=>{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error('App installation incomplete');await c.put(url,r);}));if(!self.registration.active)await self.skipWaiting();})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{await Promise.all((await caches.keys()).filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim();})()));
self.addEventListener('message',e=>{if(e.data?.type==='ACTIVATE_UPDATE')e.waitUntil(self.skipWaiting());});
self.addEventListener('fetch',e=>{const req=e.request;if(req.method!=='GET')return;const u=new URL(req.url);if(u.origin!==self.location.origin||!u.href.startsWith(SCOPE))return;
 const isNav=req.mode==='navigate';u.search='';u.hash='';if(!URLS.has(u.href))return;
 e.respondWith((async()=>{const c=await caches.open(CACHE);const key=isNav?new URL('./index.html',SCOPE).href:u.href;const hit=await c.match(key);if(hit)return hit;try{const r=await fetch(req);if(r.ok)await c.put(key,r.clone());return r;}catch{return new Response('오프라인 파일이 아직 준비되지 않았어요. 처음 한 번 인터넷에 연결해 주세요.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});}})());});
