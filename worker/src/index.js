// Tea Time English — petit serveur de statistiques ANONYMES.
// Reçoit des événements d'usage (aucun prénom, juste un numéro de téléphone tiré au hasard)
// et affiche un tableau de bord global, protégé par le mot de passe DASH_KEY.
const ORIGINS = ['https://pirrone2917.github.io', 'http://localhost:8781'];
const TZ = 'Europe/Brussels';
let ready = false;

async function init(db) {
  if (ready) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS ev(
      id INTEGER PRIMARY KEY, ts INTEGER, day TEXT, hr INTEGER,
      dev TEXT, pm TEXT, type TEXT, k TEXT, q TEXT, qt TEXT, ok INTEGER, a INTEGER, b INTEGER, txt TEXT)`),
    db.prepare('CREATE INDEX IF NOT EXISTS ev_ts ON ev(ts)'),
    db.prepare('CREATE INDEX IF NOT EXISTS ev_type ON ev(type, ts)'),
  ]);
  ready = true;
}

const cors = (req) => {
  const o = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
};
const fmtDay = new Intl.DateTimeFormat('fr-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHr = new Intl.DateTimeFormat('fr-BE', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' });
const clip = (v, n) => (v == null ? null : String(v).slice(0, n));
const int = (v) => (Number.isFinite(+v) ? Math.round(+v) : null);

async function collect(req, env) {
  let body;
  try { body = JSON.parse(await req.text()); } catch { return new Response('bad json', { status: 400, headers: cors(req) }); }
  const dev = clip(body && body.d, 24);
  const evs = Array.isArray(body && body.ev) ? body.ev.slice(0, 300) : [];
  if (!dev || !/^[a-z0-9]+$/i.test(dev) || !evs.length) return new Response('ok', { headers: cors(req) });
  const now = Date.now();
  const stmt = env.DB.prepare('INSERT INTO ev(ts,day,hr,dev,pm,type,k,q,qt,ok,a,b,txt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const rows = evs.map((e) => {
    let ts = int(e.ts) || now;
    if (ts > now + 6e4 || ts < now - 30 * 864e5) ts = now; // horloge du téléphone farfelue
    const d = new Date(ts);
    return stmt.bind(ts, fmtDay.format(d), +fmtHr.format(d), dev, clip(body.m, 8), clip(e.t, 12), clip(e.k, 24),
      clip(e.q, 32), clip(e.qt, 8), e.ok == null ? null : (e.ok ? 1 : 0), int(e.a), int(e.b), clip(e.p, 120));
  });
  await env.DB.batch(rows);
  return new Response('ok', { headers: cors(req) });
}

/* ---------------- tableau de bord ---------------- */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const SKILL = {
  num: 'Nombres & objets', spell: 'Épeler & dictée', dlg: 'Se présenter', wh: 'Questions en Wh-', ctry: 'Pays & nationalités',
  tobe: 'To be & possessifs', this: 'This / that…', hg: 'Have got', fam: 'La famille', pos: "Cas possessif 's", time: "L'heure",
  ps: 'Présent simple', age: 'Âge & accord', there: 'There is / are', its: "It's / They're", like: 'Goûts & préférences',
  ing: 'Orthographe -ing', voc: 'Vocabulaire du cours', some: 'Some / Any', much: 'Much / Many', ime: 'I ou me ?',
  count: 'Dénombrables', house: 'La maison',
};
const MODE = {
  day: 'Séance du jour', train: '10 questions au hasard', exam: 'Examen blanc', errors: 'Mes erreurs', last: 'Dernière leçon',
  'unit:rec': 'Station · Je reconnais', 'unit:prod': 'Station · Je produis', unit: 'Station · révision',
  'game:quiz': 'Jeu · Quiz éclair', 'game:gap': 'Jeu · Mind the gap', 'game:ord': 'Jeu · Construis la phrase',
  'game:match': 'Jeu · Associe', 'game:dict': 'Jeu · Dictée',
};
const QT = { mcq: 'QCM', gap: 'Compléter', ord: 'Construire la phrase', dict: 'Dictée', match: 'Associer' };
const bars = (rows, label, val, max, suffix = '', color = '#1C2E5E') => {
  const m = max || Math.max(1, ...rows.map(val));
  return rows.map((r) => `<div class="br"><span class="bl">${label(r)}</span><span class="bt"><i style="width:${Math.max(2, (val(r) / m) * 100)}%;background:${color}"></i></span><span class="bv">${val(r)}${suffix}</span></div>`).join('');
};

async function dashboard(env) {
  const db = env.DB, now = Date.now(), D = 864e5;
  const t30 = now - 30 * D, t7 = now - 7 * D, t1 = now - D, t14 = now - 14 * D;
  const one = async (sql, ...p) => (await db.prepare(sql).bind(...p).first()) || {};
  const all = async (sql, ...p) => (await db.prepare(sql).bind(...p).all()).results || [];
  const [a1, a7, a30, ret, modes, daily, sess, skills, worst, qtypes, hours, misc] = await Promise.all([
    one('SELECT COUNT(DISTINCT dev) n FROM ev WHERE ts>?', t1),
    one('SELECT COUNT(DISTINCT dev) n FROM ev WHERE ts>?', t7),
    one('SELECT COUNT(DISTINCT dev) n FROM ev WHERE ts>?', t30),
    one('SELECT COUNT(*) devs, SUM(d>=2) back, AVG(d) avgd FROM (SELECT dev, COUNT(DISTINCT day) d FROM ev WHERE ts>? GROUP BY dev)', t30),
    all("SELECT COALESCE(pm,'class') pm, COUNT(DISTINCT dev) n FROM ev WHERE ts>? GROUP BY 1", t30),
    all("SELECT day, COUNT(DISTINCT dev) users, SUM(type='end') sessions FROM ev WHERE ts>? GROUP BY day ORDER BY day", t14),
    all("SELECT k, COUNT(*) n, SUM(a) ok, SUM(b) tot, AVG(txt+0) dur FROM ev WHERE type='end' AND ts>? GROUP BY k ORDER BY n DESC", t30),
    all("SELECT k, COUNT(*) n, SUM(ok) ok FROM ev WHERE type='ans' AND ts>? GROUP BY k HAVING n>=5 ORDER BY ok*1.0/n ASC", t30),
    all("SELECT q, k, MAX(txt) p, COUNT(*) n, SUM(ok) ok FROM ev WHERE type='ans' AND ts>? GROUP BY q HAVING n>=3 ORDER BY ok*1.0/n ASC, n DESC LIMIT 15", t30),
    all("SELECT qt, COUNT(*) n, SUM(ok) ok FROM ev WHERE type='ans' AND ts>? GROUP BY qt ORDER BY n DESC", t30),
    all("SELECT hr, COUNT(*) n FROM ev WHERE type='start' AND ts>? GROUP BY hr ORDER BY hr", t30),
    all("SELECT type, COUNT(*) n, COUNT(DISTINCT dev) u FROM ev WHERE ts>? AND type IN ('quit','read','lesson','stamp','open') GROUP BY type", t30),
  ]);
  const M = Object.fromEntries(misc.map((r) => [r.type, r]));
  const started = (await one("SELECT COUNT(*) n FROM ev WHERE type='start' AND ts>?", t30)).n || 0;
  const ended = sess.reduce((s, r) => s + r.n, 0);
  const days = []; for (let i = 13; i >= 0; i--) days.push(fmtDay.format(new Date(now - i * D)));
  const dmap = Object.fromEntries(daily.map((r) => [r.day, r]));
  const hrs = Array.from({ length: 24 }, (_, h) => ({ h, n: (hours.find((x) => x.hr === h) || {}).n || 0 }));
  const empty = !a30.n;
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tea Time · Tableau de bord</title>
<style>
:root{--paper:#F6EFE2;--card:#FFFDF8;--ink:#1F2430;--mute:#6B6F7A;--navy:#1C2E5E;--red:#D02B27;--green:#2E6E4F;--line:#E2D8C6}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
.w{max-width:980px;margin:0 auto;padding:20px 16px 60px}
h1{margin:0;font-size:24px}h2{font-size:16px;margin:0 0 10px}.sub{color:var(--mute);margin:2px 0 18px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px}
.k{background:var(--card);border-radius:14px;padding:12px 14px}.k b{display:block;font-size:28px;line-height:1.1}.k span{color:var(--mute);font-size:13px}
.c{background:var(--card);border-radius:14px;padding:14px 16px;margin-bottom:12px}
.two{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}
.br{display:grid;grid-template-columns:minmax(110px,40%) 1fr 54px;gap:8px;align-items:center;margin:5px 0;font-size:14px}
.bl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bt{height:12px;background:#EEE6D6;border-radius:6px;overflow:hidden}.bt i{display:block;height:100%;border-radius:6px}
.bv{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
.cols{display:flex;align-items:flex-end;gap:4px;height:130px;margin-top:6px}.cols div{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;font-size:10px;color:var(--mute)}
.cols i{display:block;width:100%;background:var(--navy);border-radius:4px 4px 0 0;min-height:2px}.cols em{font-style:normal;font-weight:700;color:var(--ink);font-size:11px}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{padding:6px 4px;border-bottom:1px dashed var(--line);text-align:left;vertical-align:top}th{color:var(--mute);font-weight:600;font-size:12px}
.r{text-align:right;white-space:nowrap}.bad{color:var(--red);font-weight:700}.note{color:var(--mute);font-size:13px}
</style><div class="w">
<h1>Tea Time English · Tableau de bord</h1><p class="sub">Statistiques anonymes des 30 derniers jours · aucun prénom n'est collecté · mis à jour en direct</p>
${empty ? '<div class="c"><b>Pas encore de données.</b><p class="note">Dès que quelqu\'un ouvre l\'appli et fait une séance, les chiffres apparaissent ici.</p></div>' : ''}
<div class="grid">
<div class="k"><b>${a1.n || 0}</b><span>joueurs aujourd'hui (24 h)</span></div>
<div class="k"><b>${a7.n || 0}</b><span>joueurs sur 7 jours</span></div>
<div class="k"><b>${a30.n || 0}</b><span>joueurs sur 30 jours</span></div>
<div class="k"><b>${pct(ret.back || 0, ret.devs || 0)} %</b><span>reviennent au moins 2 jours</span></div>
<div class="k"><b>${(ret.avgd || 0).toFixed(1)}</b><span>jours joués en moyenne</span></div>
<div class="k"><b>${pct(ended, started)} %</b><span>séances terminées (vs abandonnées)</span></div>
</div>
<div class="c"><h2>Activité des 14 derniers jours</h2><div class="cols">${days.map((d) => { const r = dmap[d] || { users: 0, sessions: 0 }; const mx = Math.max(1, ...daily.map((x) => x.sessions)); return `<div><em>${r.sessions || ''}</em><i style="height:${(r.sessions / mx) * 100}%"></i>${d.slice(8)}</div>`; }).join('')}</div><p class="note">Séances terminées par jour.</p></div>
<div class="two">
<div class="c"><h2>Ce qu'on utilise le plus</h2>${sess.length ? bars(sess, (r) => esc(MODE[r.k] || r.k), (r) => r.n) : '<p class="note">—</p>'}<p class="note">Nombre de séances terminées par type.</p></div>
<div class="c"><h2>Réussite par type de séance</h2>${sess.length ? bars(sess, (r) => esc(MODE[r.k] || r.k), (r) => pct(r.ok, r.tot), 100, ' %', '#2E6E4F') : '<p class="note">—</p>'}<p class="note">Durée moyenne d'une séance : ${sess.length ? Math.round(sess.reduce((s, r) => s + (r.dur || 0) * r.n, 0) / Math.max(1, ended) / 60 * 10) / 10 : 0} min.</p></div>
</div>
<div class="two">
<div class="c"><h2>Leçons les plus difficiles</h2>${skills.length ? bars(skills.slice(0, 12), (r) => esc(SKILL[r.k] || r.k), (r) => pct(r.ok, r.n), 100, ' %', '#D02B27') : '<p class="note">—</p>'}<p class="note">Taux de bonnes réponses, du plus bas au plus haut.</p></div>
<div class="c"><h2>Réussite par type d'exercice</h2>${qtypes.length ? bars(qtypes, (r) => esc(QT[r.qt] || r.qt), (r) => pct(r.ok, r.n), 100, ' %', '#1F57B5') : '<p class="note">—</p>'}<p class="note">Reconnaître (QCM, associer) vs produire (compléter, construire, dictée).</p></div>
</div>
<div class="c"><h2>Les 15 questions les plus ratées</h2>${worst.length ? `<table><tr><th>Question</th><th>Leçon</th><th class="r">Réussite</th><th class="r">Réponses</th></tr>${worst.map((r) => `<tr><td>${esc(r.p || r.q)}</td><td>${esc(SKILL[r.k] || r.k)}</td><td class="r ${pct(r.ok, r.n) < 50 ? 'bad' : ''}">${pct(r.ok, r.n)} %</td><td class="r">${r.n}</td></tr>`).join('')}</table><p class="note">À réexpliquer en classe ou à reformuler dans l'appli.</p>` : '<p class="note">Il faut au moins 3 réponses par question pour apparaître ici.</p>'}</div>
<div class="two">
<div class="c"><h2>À quelle heure on joue</h2><div class="cols" style="height:100px">${hrs.map((x) => { const mx = Math.max(1, ...hrs.map((y) => y.n)); return `<div><i style="height:${(x.n / mx) * 100}%;background:#C27A12"></i>${x.h % 3 === 0 ? x.h + 'h' : ''}</div>`; }).join('')}</div></div>
<div class="c"><h2>Parcours et cours</h2>
${modes.map((r) => `<div class="br"><span class="bl">${r.pm === 'solo' ? 'Parcours débutant' : 'Cours de Miss Kokkinis'}</span><span class="bt"><i style="width:${pct(r.n, a30.n)}%;background:#8E2A44"></i></span><span class="bv">${r.n}</span></div>`).join('')}
<p class="note">Cours lus : ${(M.read || {}).n || 0} · stations ouvertes : ${(M.lesson || {}).n || 0} · tampons gagnés : ${(M.stamp || {}).n || 0} · séances abandonnées : ${(M.quit || {}).n || 0}</p></div>
</div>
</div></html>`;
}

const loginPage = (msg) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tea Time · Accès</title>
<body style="margin:0;background:#F6EFE2;font:16px system-ui;display:grid;place-items:center;min-height:100vh"><form method="post" style="background:#FFFDF8;padding:24px;border-radius:16px;width:min(340px,90vw)">
<h2 style="margin:0 0 6px">Tableau de bord</h2><p style="color:#6B6F7A;margin:0 0 14px">${msg}</p>
<input name="key" type="password" placeholder="Mot de passe" style="width:100%;padding:12px;font-size:16px;border:1.5px solid #E2D8C6;border-radius:10px" autofocus>
<button style="margin-top:12px;width:100%;padding:12px;font-size:16px;font-weight:700;border:0;border-radius:10px;background:#1C2E5E;color:#fff">Entrer</button></form>`;
const html = (b, h = {}) => new Response(b, { headers: Object.assign({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }, h) });
async function sha(s) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join(''); }

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(req) });
    await init(env.DB);
    if (url.pathname === '/e' && req.method === 'POST') return collect(req, env);
    if (url.pathname === '/dash' || url.pathname === '/') {
      if (!env.DASH_KEY) return html(loginPage("Le mot de passe n'est pas encore configuré : ajoute la variable secrète <b>DASH_KEY</b> dans Cloudflare."));
      const good = await sha('tt:' + env.DASH_KEY);
      if (req.method === 'POST') {
        const f = await req.formData();
        if ((f.get('key') || '') === env.DASH_KEY) return new Response(null, { status: 303, headers: { Location: '/dash', 'Set-Cookie': `tt=${good}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax` } });
        return html(loginPage('Mot de passe incorrect.'));
      }
      const ck = (req.headers.get('Cookie') || '').match(/(?:^|;\s*)tt=([a-f0-9]+)/);
      if (!ck || ck[1] !== good) return html(loginPage('Entre le mot de passe pour voir les statistiques.'));
      return html(await dashboard(env));
    }
    return new Response('Tea Time API', { status: 404 });
  },
};
