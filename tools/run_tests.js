// Banque de tests de Tea Time English : vérifie que l'appli corrige JUSTE.
// Usage : node tools/run_tests.js [dossier du site]   (code de sortie 1 si un test échoue)
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const OUT = process.argv[2] || path.join(__dirname, '..');
const html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8').replace(/<link[^>]*>/g, '');
const errs = [];
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://tests.local/', pretendToBeVisual: true, beforeParse(w) {
  w.scrollTo = () => {}; w.matchMedia = () => ({ matches: false });
  w.HTMLMediaElement.prototype.play = () => Promise.reject(new Error('test')); w.HTMLMediaElement.prototype.pause = () => {};
  w.addEventListener('error', (e) => errs.push(e.message));
} });
const A = dom.window.__app;
const fails = [], strip = (x) => String(x || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const fail = (m) => fails.push(m);
if (!A) { console.log('ERREUR : l\'appli ne démarre pas.', errs); process.exit(1); }
if (errs.length) fail('Erreurs JavaScript au démarrage : ' + errs.join(' | '));

const ALL = [...A.Q]; for (const k in A.TEACH) A.TEACH[k].forEach((c) => { if (c.q) ALL.push(c.q); });
const label = (q) => `[${q.skill}/${q.type}] ${strip(q.prompt || q.word || q.title).slice(0, 80)}`;
let n = 0;

/* 1. Tests automatiques sur TOUTES les questions */
for (const q of ALL) {
  if (q.type === 'gap' || q.type === 'dict') {
    for (const a of q.acc) { n++; if (!A.judge(q, a).ok) fail(`Réponse officielle refusée : ${label(q)} → « ${a} »`); }
    const fancy = q.acc[0].charAt(0).toUpperCase() + q.acc[0].slice(1) + (/[.!?]$/.test(q.acc[0]) ? '' : '.');
    n++; if (!A.judge(q, fancy).ok) fail(`Majuscule/point refusés : ${label(q)} → « ${fancy} »`);
    n++; if (A.judge(q, 'zzz qqq').ok) fail(`Réponse absurde acceptée : ${label(q)}`);
  }
  if (q.type === 'free') { n++; if (!A.judge(q, q.acc[0]).ok) fail(`Exemple refusé : ${label(q)} → « ${q.acc[0]} »`); }
  if (q.type === 'ord') { n++; if (!A.judge(q, q.sentence).ok) fail(`Phrase à remettre en ordre refusée : ${label(q)}`); }
  if (q.type === 'mcq') {
    n++; const o = q.opts.map((x) => A.norm(x));
    if (q.opts.length < 2) fail(`QCM avec moins de 2 choix : ${label(q)}`);
    if (new Set(q.opts).size !== q.opts.length) fail(`QCM avec deux choix identiques : ${label(q)}`);
  }
  if (q.type === 'match') { n++; const L = q.pairs.map((p) => A.norm(p[0])), R = q.pairs.map((p) => A.norm(p[1])); if (new Set(L).size !== L.length || new Set(R).size !== R.length) fail(`Paires en double : ${label(q)}`); }
  /* relecture automatique du texte */
  const txt = [q.prompt, q.why, q.word, q.sentence, ...(q.opts || [])].map(strip).join(' ¦ ');
  n++;
  [[/\bundefined\b|\bNaN\b/, 'texte cassé (undefined/NaN)'], [/\b1 years\b/, '« 1 years »'], [/[a-z>]\.\.(?!\.)/, 'double point'],
   [/\bton (tante|nièce|grand-mère|petite-fille|sœur|mère|cousine)\b/, 'genre français (ton/ta)'], [/\ba (seven|eight|nine|ten|eleven|twelve|one|two|three|four|five|six) o'clock/, '« a … o\'clock »']]
    .forEach(([re, m]) => { if (re.test(txt)) fail(`${m} : ${label(q)}`); });
}

/* 2. La banque de réponses réalistes */
const bank = JSON.parse(fs.readFileSync(path.join(__dirname, 'tests', 'bank.json'), 'utf8')).cases;
for (const c of bank) {
  n++;
  const q = ALL.find((x) => x.skill === c.q.skill && x.type === c.q.type && strip(x.prompt || x.word || '').includes(c.q.has));
  if (!q) { fail(`Question introuvable pour le test : ${JSON.stringify(c.q)}`); continue; }
  const j = A.judge(q, c.a);
  const msg = strip((j.fe || '') + ' ' + (j.ok ? '' : A.diagnose({ q, given: c.a, ok: false })));
  if (j.ok !== c.ok) fail(`${c.ok ? 'Réponse JUSTE refusée' : 'Réponse FAUSSE acceptée'} : ${label(q)} → « ${c.a} »`);
  if (c.msg && !msg.toLowerCase().includes(c.msg.toLowerCase())) fail(`Explication sans « ${c.msg} » : ${label(q)} → « ${c.a} » (reçu : ${msg.slice(0, 120)})`);
  if (c.notmsg && msg.toLowerCase().includes(c.notmsg.toLowerCase())) fail(`Explication hors sujet (« ${c.notmsg} ») : ${label(q)} → « ${c.a} »`);
}

/* 3. Les voix : toute phrase lue par l'appli doit être dans la liste du serveur */
try {
  const L = new Set(JSON.parse(fs.readFileSync(path.join(OUT, 'tts.json'), 'utf8')));
  for (const k in A.TEACH) A.TEACH[k].forEach((c) => { if (c.learn && c.learn.en) { n++; if (!L.has(c.learn.en)) fail(`Phrase sans voix : « ${c.learn.en} »`); } });
} catch (e) { fail('tts.json illisible : ' + e.message); }

console.log(`${n} vérifications, ${fails.length} échec${fails.length > 1 ? 's' : ''}.`);
if (fails.length) { console.log(fails.slice(0, 80).map((f) => ' ✗ ' + f).join('\n')); process.exit(1); }
