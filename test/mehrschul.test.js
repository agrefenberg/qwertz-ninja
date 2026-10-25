import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';

// Ein nachgebauter VIDIS-Anbieter (OpenID Connect) für die Tests.
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const idp = { claims: null, nonce: null, codes: new Map() };
const idpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, idp.base);
  const json = (o) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(o));
  if (url.pathname === '/realm/.well-known/openid-configuration') {
    return json({
      issuer: `${idp.base}/realm`,
      authorization_endpoint: `${idp.base}/realm/auth`,
      token_endpoint: `${idp.base}/realm/token`,
      userinfo_endpoint: `${idp.base}/realm/userinfo`,
      jwks_uri: `${idp.base}/realm/certs`,
      end_session_endpoint: `${idp.base}/realm/logout`,
    });
  }
  if (url.pathname === '/realm/certs') return json({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' }] });
  if (url.pathname === '/realm/token') {
    let body = '';
    for await (const c of req) body += c;
    const p = new URLSearchParams(body);
    const entry = idp.codes.get(p.get('code'));
    const challenge = entry && crypto.createHash('sha256').update(p.get('code_verifier') || '').digest('base64url');
    const authOk = req.headers.authorization === `Basic ${Buffer.from('qwertz:geheim').toString('base64')}`;
    if (!entry || !authOk || challenge !== entry.challenge) return res.writeHead(400).end('{}');
    const now = Math.floor(Date.now() / 1000);
    const head = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ iss: `${idp.base}/realm`, aud: 'qwertz', sub: entry.claims.sub, iat: now, exp: now + 300, nonce: entry.nonce })).toString('base64url');
    const sig = crypto.sign('sha256', Buffer.from(`${head}.${payload}`), privateKey).toString('base64url');
    idp.lastAccess = `at-${entry.claims.sub}`;
    idp.userinfo = entry.claims;
    return json({ id_token: `${head}.${payload}.${sig}`, access_token: idp.lastAccess, token_type: 'Bearer' });
  }
  if (url.pathname === '/realm/userinfo') {
    if (req.headers.authorization !== `Bearer ${idp.lastAccess}`) return res.writeHead(401).end('{}');
    return json(idp.userinfo);
  }
  res.writeHead(404).end();
});

let server;
let base;
let db;

function client() {
  const jar = new Map();
  const call = async (method, url, body) => {
    const res = await fetch(url.startsWith('http') ? url : base + url, {
      method,
      redirect: 'manual',
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const [k, v] = kv.split('=');
      if (v) jar.set(k, v);
      else jar.delete(k);
    }
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, type, location: res.headers.get('location') };
  };
  return { get: (u) => call('GET', u), post: (u, b = {}) => call('POST', u, b), put: (u, b = {}) => call('PUT', u, b), del: (u) => call('DELETE', u) };
}

// Anmeldung über VIDIS mit den angegebenen Merkmalen durchspielen.
async function vidisLogin(c, claims) {
  const start = await c.get('/api/vidis/login?vidis_idp_hint=bayern');
  assert.equal(start.status, 302);
  const auth = new URL(start.location);
  assert.equal(auth.searchParams.get('vidis_idp_hint'), 'bayern');
  assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
  const code = crypto.randomBytes(8).toString('hex');
  idp.codes.set(code, { claims, nonce: auth.searchParams.get('nonce'), challenge: auth.searchParams.get('code_challenge') });
  return c.get(`/api/vidis/callback?code=${code}&state=${auth.searchParams.get('state')}`);
}

before(async () => {
  idpServer.listen(0);
  await new Promise((r) => idpServer.once('listening', r));
  idp.base = `http://127.0.0.1:${idpServer.address().port}`;
  db = openDb(':memory:');
  server = createApp(db, {
    vidis: { issuer: `${idp.base}/realm`, clientId: 'qwertz', clientSecret: 'geheim', publicUrl: 'https://ninja.example.de', redirectUri: 'https://ninja.example.de/api/vidis/callback' },
  }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  idpServer.close();
});

test('Mehrere Schulen: Betreiber, AVV, Trennung der Schulen, VIDIS', async () => {
  const anon = client();
  assert.equal((await anon.get('/api/setup')).data.needsSetup, true);
  const operator = client();
  assert.equal((await operator.post('/api/setup', { mode: 'multi', username: 'betreiber', password: 'sehrgeheim123', schoolName: 'Ninja für Schulen' })).status, 200);
  const setup = (await anon.get('/api/setup')).data;
  assert.equal(setup.mode, 'multi');
  assert.equal(setup.vidis, true);
  await operator.post('/api/login', { username: 'betreiber', password: 'sehrgeheim123' });
  assert.equal((await operator.get('/api/me')).data.role, 'operator');
  // Der Betreiber hat keinen Zugriff auf Schul-Funktionen.
  assert.equal((await operator.get('/api/admin/teachers')).status, 403);
  assert.equal((await operator.get('/api/classes')).status, 403);

  await operator.put('/api/operator/settings', { name: 'Ninja für Schulen', address: 'Musterweg 1, 63000 Musterstadt', contact: 'ninja@example.de', location: 'in einem Rechenzentrum in Nürnberg (Deutschland)' });
  const a = await operator.post('/api/operator/schools', { name: 'Realschule A', schoolCode: 'de-by-1111', head: 'Frau Dr. Berg', adminUsername: 'admin-a' });
  assert.equal(a.status, 200);
  const b = await operator.post('/api/operator/schools', { name: 'Realschule B', schoolCode: 'DE-BY-2222', adminUsername: 'admin-b' });
  assert.equal((await operator.post('/api/operator/schools', { name: 'Doppelt', schoolCode: 'DE-BY-1111', adminUsername: 'admin-c' })).status, 400);
  const overview = (await operator.get('/api/operator/overview')).data;
  assert.equal(overview.schools.length, 2);
  assert.equal(overview.schools.find((s) => s.name === 'Realschule A').school_code, 'DE-BY-1111');

  const adminA = client();
  assert.equal((await adminA.post('/api/login', { username: 'admin-a', password: a.data.admin.password })).status, 200);
  const meA = (await adminA.get('/api/me')).data;
  assert.equal(meA.role, 'admin');
  assert.equal(meA.schoolName, 'Realschule A');
  assert.equal(meA.schoolActive, false);
  assert.equal((await adminA.get('/api/operator/overview')).status, 403);
  const t = (await adminA.post('/api/admin/teachers', { username: 'mueller', displayName: 'Herr Müller' })).data;

  // Ohne unterschriebenen AVV kommt die Lehrkraft nicht hinein.
  const teacher = client();
  assert.equal((await teacher.post('/api/login', { username: 'mueller', password: t.password })).status, 403);
  assert.equal((await operator.post(`/api/operator/schools/${a.data.id}/avv`, { signedAt: '2026-10-01' })).status, 200);
  assert.equal((await teacher.post('/api/login', { username: 'mueller', password: t.password })).status, 200);

  // AVV als PDF für Betreiber und Schule
  const pdf = await operator.get(`/api/operator/schools/${a.data.id}/avv.pdf`);
  assert.equal(pdf.type, 'application/pdf');
  assert.equal(pdf.data.subarray(0, 5).toString(), '%PDF-');
  assert.equal((await adminA.get('/api/admin/avv.pdf')).type, 'application/pdf');

  // Schule B sieht nichts von Schule A.
  const adminB = client();
  await adminB.post('/api/login', { username: 'admin-b', password: b.data.admin.password });
  assert.equal((await adminB.get('/api/admin/teachers')).data.length, 0);
  assert.equal((await adminA.get('/api/admin/teachers')).data.length, 1);
  assert.equal((await adminB.post(`/api/admin/teachers/${(await adminA.get('/api/admin/teachers')).data[0].id}/reset-password`)).status, 404);

  // Demodaten je Schule
  assert.equal((await adminA.post('/api/admin/demo', { action: 'create' })).status, 200);
  assert.equal((await adminB.post('/api/admin/demo', { action: 'create' })).status, 200);
  assert.equal((await adminB.get('/api/admin/demo')).data.present, true);
  await adminB.post('/api/admin/demo', { action: 'remove' });
  assert.equal((await adminA.get('/api/admin/demo')).data.present, true);

  // ---------- VIDIS ----------
  const classId = (await teacher.post('/api/classes', { name: '8c' })).data.id;
  const joinCode = (await teacher.post(`/api/classes/${classId}/join-code`)).data.joinCode;
  assert.match(joinCode, /^[A-Z0-9]{3}-[A-Z0-9]{3}$/);

  const student = client();
  const login = await vidisLogin(student, { sub: 'abc-123', rolle: 'LERN', schulkennung: ['DE-BY-1111'], bundesland: 'DE-BY' });
  assert.equal(login.status, 302);
  assert.equal(login.location, '/');
  const me = (await student.get('/api/me')).data;
  assert.equal(me.role, 'student');
  assert.equal(me.class, null);
  assert.equal(me.vidis, true);
  assert.equal(me.schoolName, 'Realschule A');
  assert.equal((await student.post('/api/me/join', { code: 'XXX-XXX' })).status, 400);
  assert.equal((await student.post('/api/me/join', { code: joinCode.toLowerCase().replace('-', ' ') })).status, 200);
  assert.equal((await student.get('/api/me')).data.class.name, '8c');
  assert.equal((await teacher.get(`/api/classes/${classId}`)).data.students.length, 1);
  // Kein Passwort-Login für VIDIS-Konten
  assert.equal((await client().post('/api/login', { username: me.username, password: '!' })).status, 401);

  // Zweite Anmeldung: dasselbe Konto
  const again = client();
  await vidisLogin(again, { sub: 'abc-123', rolle: 'LERN', schulkennung: ['DE-BY-1111'] });
  assert.equal((await again.get('/api/me')).data.id, me.id);

  // Abmelden führt zu VIDIS.
  const out = (await student.post('/api/logout')).data;
  assert.ok(out.redirect.startsWith(`${idp.base}/realm/logout?id_token_hint=`));
  assert.ok(out.redirect.includes('post_logout_redirect_uri=https%3A%2F%2Fninja.example.de%2F'));

  const lehr = client();
  await vidisLogin(lehr, { sub: 'lehr-1', rolle: 'LEHR', schulkennung: ['DE-BY-1111'], vorname: 'Anna', nachname: 'Schmidt' });
  const meL = (await lehr.get('/api/me')).data;
  assert.equal(meL.role, 'teacher');
  assert.equal(meL.displayName, 'Lehrkraft', 'Klarnamen aus VIDIS werden nicht gespeichert');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE display_name LIKE '%Schmidt%'").get().n, 0);
  assert.equal((await lehr.put('/api/me/display-name', { displayName: 'Frau S.' })).status, 200);
  assert.equal((await lehr.get('/api/me')).data.displayName, 'Frau S.');

  // Abgelehnt: unbekannte Schule, Schule ohne AVV, Eltern
  assert.equal((await vidisLogin(client(), { sub: 'x1', rolle: 'LERN', schulkennung: ['DE-BY-9999'] })).location, '/?vidis=schule');
  assert.equal((await vidisLogin(client(), { sub: 'x2', rolle: 'LERN', schulkennung: ['DE-BY-2222'] })).location, '/?vidis=avv');
  assert.equal((await vidisLogin(client(), { sub: 'x3', rolle: 'ELTERN', schulkennung: ['DE-BY-1111'] })).location, '/?vidis=rolle');
  // Gefälschter Rückruf ohne passende Anmeldung
  assert.equal((await client().get('/api/vidis/callback?code=x&state=y')).location, '/?vidis=abgelaufen');

  // AVV zurücknehmen sperrt Lehrkräfte und Schüler wieder aus.
  await operator.post(`/api/operator/schools/${a.data.id}/avv`, { signedAt: null });
  assert.equal((await teacher.get('/api/me')).status, 401);
  assert.equal((await adminA.get('/api/me')).status, 200);

  // Schule löschen nur mit Bestätigung des Namens
  assert.equal((await operator.del(`/api/operator/schools/${b.data.id}`)).status, 400);
  assert.equal((await operator.del(`/api/operator/schools/${b.data.id}?confirm=${encodeURIComponent('Realschule B')}`)).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users WHERE username = ?').get('admin-b').n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE username LIKE 'demo2-%'").get().n, 0);
});

test('Bestehende Installation mit einer Schule wird übernommen', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qn-')), 'alt.sqlite');
  let d = openDb(file);
  // Stand vor dem Umbau: Schuldaten nur in settings, Konten ohne Schule
  d.exec("INSERT INTO settings (key, value) VALUES ('school_name', 'Altschule'), ('year_end', '06-30'), ('last_purge', '123')");
  d.prepare("INSERT INTO users (role, username, display_name, password_hash, created_at) VALUES ('admin', 'alt', 'alt', 'x', 0)").run();
  d.close();
  d = openDb(file);
  const school = d.prepare('SELECT * FROM schools').get();
  assert.equal(school.name, 'Altschule');
  assert.equal(school.year_end, '06-30');
  assert.equal(school.last_purge, 123);
  assert.equal(d.prepare('SELECT school_id FROM users').get().school_id, school.id);
  assert.equal(d.prepare("SELECT value FROM settings WHERE key = 'mode'").get().value, 'single');
  d.close();
  fs.rmSync(path.dirname(file), { recursive: true });
});
