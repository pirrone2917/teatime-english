// Code de transfert court (ex. K7P-4QX) pour passer sa progression sur un autre téléphone. Gardé 7 jours puis effacé.
const AL = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const TTL = 7 * 864e5;
let ready = false;
async function init(db) {
  if (ready) return;
  await db.prepare('CREATE TABLE IF NOT EXISTS sv(code TEXT PRIMARY KEY, data TEXT, ts INTEGER)').run();
  ready = true;
}
const json = (o, h, st) => new Response(JSON.stringify(o), { status: st || 200, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, h) });
export async function transferRoute(req, url, env, cors) {
  await init(env.DB);
  const h = cors(req);
  await env.DB.prepare('DELETE FROM sv WHERE ts<?').bind(Date.now() - TTL).run();
  if (req.method === 'POST') {
    const data = await req.text();
    if (!data || data.length > 900000) return json({ err: 'size' }, h, 400);
    try { const p = JSON.parse(data); if (!p || typeof p.name !== 'string' || typeof p.q !== 'object') throw 0; } catch { return json({ err: 'data' }, h, 400); }
    const rnd = crypto.getRandomValues(new Uint8Array(6));
    const code = [...rnd].map((b) => AL[b % AL.length]).join('');
    await env.DB.prepare('INSERT OR REPLACE INTO sv(code, data, ts) VALUES(?,?,?)').bind(code, data, Date.now()).run();
    return json({ code }, h);
  }
  const c = (url.searchParams.get('c') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const row = c.length === 6 ? await env.DB.prepare('SELECT data FROM sv WHERE code=?').bind(c).first() : null;
  if (!row) return json({ err: 'notfound' }, h, 404);
  return new Response(row.data, { headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, h) });
}
