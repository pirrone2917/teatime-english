// Ligue de la semaine — uniquement pour ceux qui l'activent, avec un pseudo choisi (jamais le prénom imposé).
// On ne garde que : pseudo, parcours (classe / débutants), XP de la semaine.
const TZ = 'Europe/Brussels';
const fmt = new Intl.DateTimeFormat('fr-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });

// Lundi de la semaine en cours (heure belge), au format AAAA-MM-JJ
export function weekKey(ts = Date.now()) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day));
  const dow = (d.getUTCDay() + 6) % 7; // 0 = lundi
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

let ready = false;
async function init(db) {
  if (ready) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS lg(id TEXT, week TEXT, nick TEXT, mode TEXT, xp INTEGER, ts INTEGER, PRIMARY KEY(id, week))`).run();
  ready = true;
}

// Pseudos refusés (insultes courantes FR / EN, y compris écrites avec des chiffres)
const BAD = ['merde','putain','pute','salope','connard','connasse','encule','enculé','batard','bâtard','nique','niquer','ntm','fdp','tg','pd','bite','couille','chatte','cul','nazi','hitler','fuck','shit','bitch','dick','cock','pussy','cunt','whore','slut','nigger','nigga','fag','retard','sex','porn','porno','kill','caca','zizi'];
const leet = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/@/g, 'a').replace(/\$/g, 's');
export const badNick = (s) => { const t = leet(s), flat = t.replace(/[^a-z]/g, ''); return BAD.some((w) => { const W = leet(w); return W.length <= 3 ? new RegExp('(^|[^a-z])' + W + '([^a-z]|$)').test(t) : flat.includes(W); }); };
const cleanNick = (s) => String(s || '').replace(/[<>&"\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
// Ligue : 'class' (cours), 'solo' (débutants) ou un groupe privé 'g:CODE' (code donné par la prof)
const groupOf = (m) => { m = String(m || ''); if (m === 'solo') return 'solo'; const g = m.match(/^g:([A-Za-z0-9]{3,10})$/); return g ? 'g:' + g[1].toUpperCase() : 'class'; };
const json = (o, h) => new Response(JSON.stringify(o), { headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, h) });

export async function leagueRoute(req, url, env, cors) {
  await init(env.DB);
  const h = cors(req);
  const wk = weekKey();
  if (req.method === 'POST') {
    let b; try { b = JSON.parse(await req.text()); } catch { return json({ err: 'json' }, h); }
    const id = String(b.id || '').slice(0, 40);
    if (!/^[a-z0-9_-]{6,40}$/i.test(id)) return json({ err: 'id' }, h);
    if (b.leave) { await env.DB.prepare('DELETE FROM lg WHERE id=?').bind(id).run(); return json({ ok: 1 }, h); }
    const nick = cleanNick(b.nick), mode = groupOf(b.mode);
    if (badNick(nick)) return json({ err: 'badnick' }, h);
    let xp = Math.max(0, Math.min(20000, Math.round(+b.xp || 0)));
    if (!nick) return json({ err: 'nick' }, h);
    if (b.week !== wk) xp = 0; // semaine du téléphone différente : on repart de zéro
    await env.DB.batch([
      env.DB.prepare('INSERT INTO lg(id, week, nick, mode, xp, ts) VALUES(?,?,?,?,?,?) ON CONFLICT(id, week) DO UPDATE SET nick=excluded.nick, mode=excluded.mode, xp=MAX(lg.xp, excluded.xp), ts=excluded.ts')
        .bind(id, wk, nick, mode, xp, Date.now()),
      env.DB.prepare('UPDATE lg SET nick=? WHERE id=?').bind(nick, id),
    ]);
  }
  const mode = groupOf(url.searchParams.get('mode'));
  const r = await env.DB.prepare('SELECT id, nick, xp FROM lg WHERE week=? AND mode=? ORDER BY xp DESC, ts ASC LIMIT 50').bind(wk, mode).all();
  const me = url.searchParams.get('id') || '';
  return json({ week: wk, rows: (r.results || []).map((x) => ({ nick: x.nick, xp: x.xp, me: x.id === me ? 1 : 0 })) }, h);
}

// Pour le tableau de bord : la ligue de la semaine, tous groupes, avec suppression possible
export async function leagueAdmin(env) {
  await init(env.DB);
  const r = await env.DB.prepare('SELECT id, nick, mode, xp FROM lg WHERE week=? ORDER BY mode, xp DESC LIMIT 200').bind(weekKey()).all();
  return r.results || [];
}
export async function leagueDelete(env, id) { await init(env.DB); await env.DB.prepare('DELETE FROM lg WHERE id=?').bind(String(id).slice(0, 40)).run(); }
