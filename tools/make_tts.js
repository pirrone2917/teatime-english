// Fabrique site/tts.json : toutes les phrases que l'appli peut prononcer (liste blanche du serveur de voix)
const http=require('http'),fs=require('fs'),path=require('path');const {chromium}=require('playwright');
const OUT=process.argv[2]||path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let f=path.join(OUT,decodeURIComponent(q.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'Content-Type':f.endsWith('.html')?'text/html':'application/octet-stream'});r.end(d)})}).listen(0,async()=>{
  const b=await chromium.launch();const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());
  await p.goto('http://127.0.0.1:'+srv.address().port+'/');await p.waitForTimeout(500);
  const L=await p.evaluate(()=>{const a=window.__app,T=[],seen=new Set(),add=t=>{if(t&&!seen.has(t)){seen.add(t);T.push(t)}};
    const vp=(q,t)=>t&&q.sayw&&a.voiceOf(q.sayw)==='pandora'?'pandora|'+t:t;const qs=q=>{add(vp(q,q.say));add(vp(q,q.word))};
    for(const s of a.SK){for(const it of (a.TEACH[s.id]||[])){if(it.learn)add(it.learn.en);if(it.dialog){it.dialog.forEach(l=>add(a.voiceOf(l[0])==='pandora'?'pandora|'+l[1]:l[1]))}if(it.q)qs(it.q)}
      for(const q of a.Q)if(q.sk===s.id||q.skill===s.id)qs(q)}
    for(const q of a.Q)qs(q);add("Hello! Let's have a cup of tea.");add("Hello! I'm Miss Kokkinis. Let's have a cup of tea.");
    /* voix des leçons au choix : version Pandora de tout ce qui est lu par Draco, ajoutée APRÈS (préparée ensuite) */
    T.filter(t=>!t.startsWith('pandora|')).forEach(t=>add('pandora|'+t));return T});
  fs.writeFileSync(OUT+'/tts.json',JSON.stringify(L));
  console.log('tts.json',L.length,'phrases',L.reduce((s,x)=>s+x.length,0),'caractères',errs.length?errs:'');await b.close();srv.close()});
