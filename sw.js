const CACHE='card-ledger-pwa-v11';
const APP=['./','./index.html','./manifest.json','./sw.js','./chat-updates.json','./icon-192.png','./icon-512.png'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(c=>c.addAll(APP)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);

  // The encrypted feed must prefer the network so newly uploaded ciphertext is
  // picked up promptly; cached ciphertext is only the offline fallback.
  if(url.pathname.endsWith('/chat-updates.json')){
    event.respondWith(
      fetch(event.request,{cache:'no-store'})
        .then(response=>{
          const copy=response.clone();
          caches.open(CACHE).then(c=>c.put('./chat-updates.json',copy));
          return response;
        })
        .catch(()=>caches.match('./chat-updates.json'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cached=>cached || fetch(event.request)
        .then(response=>{
          const copy=response.clone();
          caches.open(CACHE).then(c=>c.put(event.request,copy));
          return response;
        })
        .catch(()=>caches.match('./index.html')))
  );
});