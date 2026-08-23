const STATIC_CACHE='kp-shell-v2-20260821';
const STATIC=['/manifest.webmanifest','/pwa-icon.svg'];

async function cacheResponse(request,response){
  if(!response?.ok)return response;
  const copy=response.clone();
  await caches.open(STATIC_CACHE).then(c=>c.put(request,copy));
  return response;
}

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(STATIC_CACHE).then(c=>c.addAll(STATIC)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==STATIC_CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
  const u=new URL(event.request.url);
  if(event.request.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/')||u.pathname.startsWith('/public/')||event.request.mode==='navigate')return;
  const destination=event.request.destination;

  // Scripts and styles are deployment-critical. Prefer the network so an older
  // service-worker cache can never pin a previous customer-admin release.
  if(destination==='script'||destination==='style'){
    event.respondWith(fetch(new Request(event.request,{cache:'no-cache'}))
      .then(r=>cacheResponse(event.request,r))
      .catch(async()=>await caches.match(event.request)||Response.error()));
    return;
  }

  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(r=>{
    if(r.ok&&['image','font','manifest'].includes(destination))void cacheResponse(event.request,r);
    return r;
  })));
});

self.addEventListener('push',event=>{
  event.waitUntil(self.registration.showNotification('Klassenportal',{body:'Es gibt eine neue Aktualisierung. Öffne das Klassenportal, um die Details sicher anzusehen.',icon:'/pwa-icon.svg',badge:'/pwa-icon.svg',tag:'klassenportal-update',renotify:true,data:{url:'/'}}));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{
    for(const c of clients){if(new URL(c.url).origin===self.location.origin){c.focus();return c.navigate(event.notification.data?.url||'/');}}
    return self.clients.openWindow(event.notification.data?.url||'/');
  }));
});
