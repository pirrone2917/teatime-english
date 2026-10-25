#!/usr/bin/env python3
# Fabrique le site (index.html, sw.js, manifest, icônes, tts.json) à partir de src/tea-time-english.html,
# puis lance la banque de tests. Si un test échoue, on ne publie pas.
import os, re, shutil, hashlib, sys
from PIL import Image, ImageDraw
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC=os.path.join(ROOT,'src','tea-time-english.html')
OUT=ROOT
os.makedirs(OUT+'/icons',exist_ok=True)
html=open(SRC,encoding='utf-8').read()
ver=hashlib.md5(html.encode()).hexdigest()[:8]
import datetime
html=html.replace('__VER__',datetime.datetime.now().strftime('%d/%m/%Y %H:%M')+' · '+ver)
head_add='''<meta name="theme-color" content="#F6EFE2">
<meta name="description" content="Exercices d'anglais du cours de Miss Kokkinis">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Tea Time">
'''
html=html.replace('<title>Tea Time English</title>','<title>Tea Time English</title>\n'+head_add,1)
sw_reg='''<script>
if('serviceWorker' in navigator){addEventListener('load',()=>{navigator.serviceWorker.register('sw.js').catch(()=>{})})}
try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}
</script>
</body>'''
html=html.replace('</body>',sw_reg,1) if '</body>' in html else html+sw_reg
open(OUT+'/index.html','w',encoding='utf-8').write(html)
open(OUT+'/manifest.webmanifest','w').write('''{
  "name": "Tea Time English",
  "short_name": "Tea Time",
  "description": "Exercices d'anglais du cours de Miss Kokkinis",
  "lang": "fr",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#F6EFE2",
  "theme_color": "#D02B27",
  "icons": [
    {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
    {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
    {"src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}
  ]
}
''')
open(OUT+'/sw.js','w').write('''// Tea Time English - version %s
// Réseau d'abord (les nouveaux cours arrivent tout de suite), copie locale si hors-ligne.
// La progression (localStorage) n'est jamais touchée par ce fichier.
const C='tte-%s';
const CORE=['./','index.html','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(CORE)).catch(()=>{}))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request; if(r.method!=='GET')return;
  // serveur Tea Time : seules les voix sont gardées hors-ligne (pas le classement, ni les codes de transfert)
  if(new URL(r.url).origin!==location.origin&&!/\\/tts\\?|fonts\\.(googleapis|gstatic)\\.com/.test(r.url))return;
  // la page elle-même : toujours redemandée au serveur (jamais l'ancienne version du cache du navigateur)
  const nav=r.mode==='navigate'||/\\/$|\\.html$|tts\\.json$/.test(new URL(r.url).pathname);
  e.respondWith((nav?fetch(r.url,{cache:'no-cache',credentials:'same-origin'}):fetch(r)).then(res=>{
    if(res&&(res.ok||res.type==='opaque')){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp)).catch(()=>{})}
    return res;
  }).catch(()=>caches.match(r,{ignoreSearch:true}).then(m=>m||caches.match('index.html'))));
});
'''%(ver,ver))
open(OUT+'/.nojekyll','w').write('')
SRCI=Image.open(os.path.join(ROOT,'tools','icon_red.png')).convert('RGB')
for n,sz in [('icon-192',192),('icon-512',512),('icon-maskable-512',512),('apple-touch-icon',180)]:
    SRCI.resize((sz,sz),Image.LANCZOS).save(OUT+'/icons/'+n+'.png')
print('ok',ver)

import subprocess
T=os.path.dirname(os.path.abspath(__file__))
subprocess.run(['node',os.path.join(T,'make_tts.js'),OUT],check=True)
r=subprocess.run(['node',os.path.join(T,'run_tests.js'),OUT])
if r.returncode!=0:
    print('\n*** TESTS EN ÉCHEC : ne pas publier ***');sys.exit(1)
print('Tous les tests passent : prêt à publier.')
