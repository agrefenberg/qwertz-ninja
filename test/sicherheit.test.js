import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';

let server;
let base;

function client() {
  let cookie = '';
  const call = async (method, url, body, headers = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: { ...(body !== undefined && typeof body !== 'string' ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return { status: res.status, headers: res.headers, data: type.includes('json') ? await res.json() : await res.text() };
  };
  return { call, get: (u) => call('GET', u), post: (u, b = {}) => call('POST', u, b), put: (u, b = {}) => call('PUT', u, b) };
}

before(async () => {
  // Wie im Internetbetrieb: sichere Cookies, Einrichtungs-Code, keine Demodaten.
  server = createApp(openDb(':memory:'), { secureCookies: true, setupToken: 'geheim-code' }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('Internetbetrieb: Einrichtungs-Code, nur JSON, Demodaten aus, Export, Anmeldesperre', async () => {
  const admin = client();
  assert.equal((await admin.get('/api/setup')).data.setupToken, true);
  const setup = { username: 'admin', password: 'sehrgeheim123', schoolName: 'Testschule' };
  assert.equal((await admin.post('/api/setup', setup)).status, 403);
  assert.equal((await admin.post('/api/setup', { ...setup, setupToken: 'geheim-code' })).status, 200);

  // Schreibende Anfragen ohne JSON werden abgelehnt (Schutz vor Formular-Angriffen von fremden Seiten).
  const form = await admin.call('POST', '/api/login', 'username=admin&password=sehrgeheim123', { 'Content-Type': 'application/x-www-form-urlencoded' });
  assert.equal(form.status, 415);

  const login = await admin.post('/api/login', { username: 'admin', password: 'sehrgeheim123' });
  assert.equal(login.status, 200);
  const adminCookie = login.headers.get('set-cookie');
  assert.match(adminCookie, /Secure/);
  assert.match(adminCookie, /Max-Age=43200/);

  // Demodaten haben ein öffentlich bekanntes Passwort und sind deshalb aus.
  assert.equal((await admin.get('/api/admin/demo')).data.allowed, false);
  assert.equal((await admin.post('/api/admin/demo', { action: 'create' })).status, 400);

  const t = await admin.post('/api/admin/teachers', { username: 'huber', displayName: 'Frau Huber' });
  const teacher = client();
  await teacher.post('/api/login', { username: 'huber', password: t.data.password });
  const classId = (await teacher.post('/api/classes', { name: '7a' })).data.id;
  const [c1] = (await teacher.post(`/api/classes/${classId}/students`, { count: 1 })).data.credentials;
  const student = client();
  const sl = await student.post('/api/login', { username: c1.username, password: c1.password });
  // Schüler: Sitzungscookie, endet mit dem Schließen des Browsers.
  assert.doesNotMatch(sl.headers.get('set-cookie'), /Max-Age|Expires/);
  await student.post('/api/results', { kind: 'basics', durationMs: 30000, gross: 70, correct: 66, errors: 4, keyStats: { a: [10, 1] } });

  const all = await teacher.get(`/api/classes/${classId}/export.json`);
  assert.equal(all.status, 200);
  assert.equal(all.data.klasse, '7a');
  const [s] = all.data.schueler;
  assert.equal(s.benutzername, c1.username);
  assert.equal(s.ergebnisse.length, 1);
  assert.ok(s.tasten.some((k) => k.ch === 'a'));
  assert.ok(!JSON.stringify(all.data).includes('password_hash'));
  const studentId = (await teacher.get(`/api/classes/${classId}`)).data.students[0].id;
  const one = await teacher.get(`/api/students/${studentId}/export.json`);
  assert.equal(one.data.benutzername, c1.username);
  assert.equal((await client().get(`/api/students/${studentId}/export.json`)).status, 401);

  // Passwortänderung meldet die anderen Geräte ab.
  const other = client();
  await other.post('/api/login', { username: 'huber', password: t.data.password });
  assert.equal((await teacher.post('/api/me/password', { current: t.data.password, next: 'neuespasswort1' })).status, 200);
  assert.equal((await other.get('/api/me')).status, 401);
  assert.equal((await teacher.get('/api/me')).status, 200);

  // Fünf Fehlversuche sperren diesen Namen für eine Minute, auch mit richtigem Passwort.
  for (let i = 0; i < 5; i++) assert.equal((await client().post('/api/login', { username: 'admin', password: 'falsch' })).status, 401);
  assert.equal((await client().post('/api/login', { username: 'ADMIN', password: 'sehrgeheim123' })).status, 429);
  // Unbekannte Namen antworten wie falsche Passwörter, andere Namen sind nicht gesperrt.
  assert.equal((await client().post('/api/login', { username: 'gibtsnicht', password: 'x' })).status, 401);
  assert.equal((await client().post('/api/login', { username: 'huber', password: 'neuespasswort1' })).status, 200);
});
