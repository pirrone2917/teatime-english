// Essai de voix générées par le serveur (Workers AI), mises en cache dans D1 :
// chaque phrase n'est fabriquée qu'une seule fois, ensuite elle est resservie gratuitement.
// Page d'écoute : /voix — seules les phrases d'essai ci-dessous peuvent être générées ici.

export const SAMPLES = [
  "Hello! My name is Emma and I'm from London. Nice to meet you.",
  "Have you got any brothers or sisters? Yes, I've got two sisters.",
  "What time is it? It's quarter to three. Let's have a cup of tea!",
];

export const VOICES = {
  draco:   { label: 'Draco — homme (Aura 2)',    model: '@cf/deepgram/aura-2-en', speaker: 'draco' },
  pandora: { label: 'Pandora — femme (Aura 2)',  model: '@cf/deepgram/aura-2-en', speaker: 'pandora' },
  helios:  { label: 'Helios — homme (Aura 1)',   model: '@cf/deepgram/aura-1',    speaker: 'helios' },
  athena:  { label: 'Athena — femme (Aura 1)',   model: '@cf/deepgram/aura-1',    speaker: 'athena' },
  melo:    { label: 'Melo — voix libre (MeloTTS)', model: '@cf/myshell-ai/melotts' },
};

let ready = false;
async function initTts(db) {
  if (ready) return;
  await db.prepare('CREATE TABLE IF NOT EXISTS tts(k TEXT PRIMARY KEY, mime TEXT, data BLOB, chars INTEGER, ts INTEGER)').run();
  ready = true;
}

async function key(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function toBytes(out) {
  if (out instanceof ReadableStream) return new Uint8Array(await new Response(out).arrayBuffer());
  if (out instanceof ArrayBuffer) return new Uint8Array(out);
  if (out instanceof Uint8Array) return out;
  if (out && typeof out.audio === 'string') { // MeloTTS renvoie du base64
    const bin = atob(out.audio); const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  if (out && out.audio instanceof ReadableStream) return toBytes(out.audio);
  throw new Error('format audio inattendu : ' + (out && Object.keys(out).join(',')));
}

async function generate(env, v, text) {
  const V = VOICES[v];
  const input = V.model.includes('melotts') ? { prompt: text, lang: 'en' } : { text, speaker: V.speaker, encoding: 'mp3' };
  return toBytes(await env.AI.run(V.model, input));
}

export async function speak(env, v, text) {
  await initTts(env.DB);
  const k = await key(v + '|' + text);
  const row = await env.DB.prepare('SELECT mime, data FROM tts WHERE k=?').bind(k).first();
  let bytes, mime = 'audio/mpeg', hit = 'hit';
  if (row) { bytes = new Uint8Array(row.data); mime = row.mime; }
  else {
    bytes = await generate(env, v, text); hit = 'miss';
    if (bytes[0] === 0x52 && bytes[1] === 0x49) mime = 'audio/wav'; // "RIFF"
    await env.DB.prepare('INSERT OR REPLACE INTO tts(k, mime, data, chars, ts) VALUES(?,?,?,?,?)')
      .bind(k, mime, bytes, text.length, Date.now()).run();
  }
  return new Response(bytes, { headers: { 'Content-Type': mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Cache': hit, 'Access-Control-Allow-Origin': '*' } });
}

// ---------- Voix de l'appli : Draco (par défaut) et Pandora (personnages féminins) ----------
// Liste blanche : seules les phrases publiées dans tts.json (fabriqué avec le site) peuvent être générées.
// Format : "texte" = Draco, "pandora|texte" = Pandora.
const LIST_URL = 'https://pirrone2917.github.io/teatime-english/tts.json';
const APP_VOICES = ['draco', 'pandora'];
let LIST = null, LIST_AT = 0;
async function getList() {
  if (LIST && Date.now() - LIST_AT < 10 * 60 * 1000) return LIST;
  try {
    const r = await fetch(LIST_URL, { cf: { cacheTtl: 300 } });
    if (r.ok) { LIST = await r.json(); LIST_AT = Date.now(); }
  } catch (e) {}
  return LIST || [];
}
const parse = (item) => { const m = item.match(/^(pandora)\|(.*)$/s); return m ? [m[1], m[2]] : ['draco', item]; };

async function cached(env, v, text) {
  const k = await key(v + '|' + text);
  return env.DB.prepare('SELECT k FROM tts WHERE k=?').bind(k).first();
}
// Toutes les clés déjà fabriquées, en une seule requête (D1 gratuit = 50 requêtes max par appel)
async function cachedKeys(env) {
  const r = await env.DB.prepare('SELECT k FROM tts').all();
  return new Set((r.results || []).map((x) => x.k));
}

export async function ttsRoute(url, env) {
  await initTts(env.DB);
  if (url.pathname === '/tts/etat') {
    const list = await getList(), have = await cachedKeys(env); let n = 0, rest = 0;
    for (const it of list) { const [v, t] = parse(it); if (have.has(await key(v + '|' + t))) n++; else rest += t.length; }
    return new Response(JSON.stringify({ phrases: list.length, pretes: n, caracteres_restants: rest }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  const t = (url.searchParams.get('t') || '').slice(0, 1500);
  const v = APP_VOICES.includes(url.searchParams.get('v')) ? url.searchParams.get('v') : 'draco';
  if (!t) return new Response('?', { status: 400 });
  if (!(await cached(env, v, t))) {
    const list = await getList();
    if (!list.includes(v === 'draco' ? t : v + '|' + t)) return new Response('Phrase inconnue', { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
  try { return await speak(env, v, t); }
  catch (e) { return new Response('Voix indisponible', { status: 503, headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } }); }
}

// Chaque nuit (après la remise à zéro du quota gratuit), on prépare d'avance les phrases pas encore fabriquées.
export async function warm(env, maxChars = 3200, maxItems = 30) {
  await initTts(env.DB);
  const list = await getList(), have = await cachedKeys(env); let chars = 0, items = 0;
  for (const it of list) {
    const [v, t] = parse(it);
    if (items >= maxItems || chars + t.length > maxChars) break;
    const k = await key(v + '|' + t);
    if (have.has(k)) continue;
    try {
      const bytes = await generate(env, v, t);
      await env.DB.prepare('INSERT OR REPLACE INTO tts(k, mime, data, chars, ts) VALUES(?,?,?,?,?)').bind(k, 'audio/mpeg', bytes, t.length, Date.now()).run();
      chars += t.length; items++;
    } catch (e) { break; }
  }
  return { items, chars };
}

export async function voixRoute(url, env) {
  if (url.pathname === '/voix/a') {
    const i = +url.searchParams.get('i'), v = url.searchParams.get('v');
    if (!VOICES[v] || !SAMPLES[i]) return new Response('?', { status: 404 });
    try { return await speak(env, v, SAMPLES[i]); }
    catch (e) { return new Response('Erreur : ' + e.message, { status: 500 }); }
  }
  const rows = Object.entries(VOICES).map(([v, V]) => `<section><h2>${V.label}</h2>${SAMPLES.map((s, i) =>
    `<p>${s}</p><audio controls preload="none" src="/voix/a?i=${i}&v=${v}"></audio>`).join('')}</section>`).join('');
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Essai des voix</title><style>body{font-family:system-ui;background:#F6EFE2;color:#1C2E5E;max-width:640px;margin:0 auto;padding:16px}
h1{font-size:22px}section{background:#fff;border-radius:14px;padding:12px 14px;margin:14px 0;box-shadow:0 1px 3px #0001}
h2{font-size:17px;margin:4px 0 8px;color:#D02B27}p{margin:10px 0 4px;font-size:15px}audio{width:100%}</style>
<h1>☕ Essai des voix</h1><p>Écoute les mêmes phrases avec chaque voix. La première écoute peut prendre 2–3 secondes (la voix est fabriquée), ensuite c'est instantané.</p>${rows}`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
