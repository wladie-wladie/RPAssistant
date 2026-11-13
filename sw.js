// RPAssistant service worker: network-first, so new versions from GitHub arrive automatically;
// cached copy is used only when offline.
const CACHE='rpa-v38';
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./','index.html','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png','vtm.js','chars.js','rules.js','chars.css','sessions.js','sessions.css','chat.js','chat.css']).catch(()=>{})))});
self.addEventListener('activate',e=>{e.waitUntil(self.clients.claim())});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
  e.respondWith(fetch(r,{cache:'no-cache'}).then(res=>{const cp=res.clone();caches.open(CACHE).then(c=>c.put(r,cp));return res}).catch(()=>caches.match(r).then(m=>m||caches.match('./'))));
});
