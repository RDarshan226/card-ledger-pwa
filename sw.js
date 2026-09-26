const CACHE='card-ledger-pwa-v41';
const APP=['./','./index.html','./manifest.json','./sw.js','./chat-updates.json','./icon-192.svg','./icon-512.svg'];

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

self.addEventListener('message',event=>{
  const data=event.data||{};
  if(data.type==='SKIP_WAITING') self.skipWaiting();
  if(data.type==='SHOW_STATEMENT_NOTIFICATION'){
    const title=String(data.title||'Credit Card Statement');
    const options=Object.assign({silent:false},data.options||{});
    event.waitUntil(self.registration.showNotification(title,options));
  }
});

self.addEventListener('periodicsync',event=>{
  if(event.tag==='card-ledger-statement-check'){
    event.waitUntil(
      self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{
        clients.forEach(client=>client.postMessage({type:'CHECK_STATEMENT_NOTIFICATIONS'}));
      })
    );
  }
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=(event.notification.data&&event.notification.data.url)||'./';
  event.waitUntil(
    clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
      for(const client of list){
        if('focus' in client){
          try{client.postMessage({type:'OPEN_STATEMENT_CARD',cardId:event.notification.data&&event.notification.data.cardId});}catch(e){}
          return client.focus();
        }
      }
      if(clients.openWindow) return clients.openWindow(target);
    })
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);

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

  const isNavigation = event.request.mode === 'navigate' || (event.request.headers.get('accept')||'').includes('text/html');
  if(isNavigation){
    event.respondWith(
      fetch(event.request,{cache:'no-store'})
        .then(response=>{
          const copy=response.clone();
          caches.open(CACHE).then(c=>c.put('./index.html',copy));
          return response;
        })
        .catch(()=>caches.match('./index.html'))
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