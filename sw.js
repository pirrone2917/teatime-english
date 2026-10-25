// Tea Time English - version 6943e2c7
// Réseau d'abord (les nouveaux cours arrivent tout de suite), copie locale si hors-ligne.
// La progression (localStorage) n'est jamais touchée par ce fichier.
const C='tte-6943e2c7';
const CORE=['./','index.html','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(CORE)).catch(()=>{}))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request; if(r.method!=='GET')return;
  // serveur Tea Time : seules les voix sont gardées hors-ligne (pas le classement, ni les codes de transfert)
  if(new URL(r.url).origin!==location.origin&&!/\/tts\?|fonts\.(googleapis|gstatic)\.com/.test(r.url))return;
  // la page elle-même : toujours redemandée au serveur (jamais l'ancienne version du cache du navigateur)
  const nav=r.mode==='navigate'||/\/$|\.html$|tts\.json$/.test(new URL(r.url).pathname);
  e.respondWith((nav?fetch(r.url,{cache:'no-cache',credentials:'same-origin'}):fetch(r)).then(res=>{
    if(res&&(res.ok||res.type==='opaque')){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp)).catch(()=>{})}
    return res;
  }).catch(()=>caches.match(r,{ignoreSearch:true}).then(m=>m||caches.match('index.html'))));
});
