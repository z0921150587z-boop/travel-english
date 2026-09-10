const VER='v6';
const CACHE='travel-english-'+VER;
const ASSETS=['./','./index.html?'+VER,'./styles.css?'+VER,'./config.js?'+VER,'./data.js?'+VER,'./dest.js?'+VER,'./engine.js?'+VER,'./app.js?'+VER,'./manifest.json','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);
  if(u.origin!==location.origin||e.request.method!=='GET')return;
  e.respondWith(fetch(e.request,{cache:'no-cache'}).then(r=>{
    if(r&&r.ok&&r.type==='basic'){const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp)).catch(()=>{});}
    return r;
  }).catch(()=>caches.match(e.request).then(m=>{
    if(m)return m;
    if(e.request.mode==='navigate')return caches.match('./index.html?'+VER)||caches.match('./');
    return Response.error();
  })));});
