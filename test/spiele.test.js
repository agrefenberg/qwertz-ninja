import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { purgeSchool } from '../server/retention.js';
import { LESSONS } from '../public/js/course.js';

let server;
let base;
let db;

function client() {
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  return { get: (u) => call('GET', u), post: (u, b = {}) => call('POST', u, b), patch: (u, b = {}) => call('PATCH', u, b), del: (u) => call('DELETE', u) };
}

before(async () => {
  db = openDb(':memory:');
  server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('Spiele: erst nach der Grundkompetenz frei, nur Rekord gespeichert, Lehrkraft stellt ein', async () => {
  const admin = client();
  await admin.post('/api/setup', { username: 'admin', password: 'sehrgeheim123', schoolName: 'Testschule' });
  await admin.post('/api/login', { username: 'admin', password: 'sehrgeheim123' });
  const t = await admin.post('/api/admin/teachers', { username: 'huber', displayName: 'Frau Huber' });
  const teacher = client();
  await teacher.post('/api/login', { username: 'huber', password: t.data.password });
  const classId = (await teacher.post('/api/classes', { name: '7a' })).data.id;
  const [c1] = (await teacher.post(`/api/classes/${classId}/students`, { count: 1 })).data.credentials;
  const s = client();
  await s.post('/api/login', { username: c1.username, password: c1.password });

  // Standard: frei nach Lektion 7 „Umlaute und ß“ und allen davor.
  assert.equal((await s.get('/api/me')).data.class.games, true);
  let g = (await s.get('/api/me/games')).data;
  assert.equal(g.enabled, true);
  assert.equal(g.unlocked, false);
  assert.equal(g.until.id, 'umlaute');
  assert.equal(g.until.number, 7);
  assert.equal(g.missing.length, 7);
  assert.deepEqual(g.games.map((x) => x.id), ['regen', 'snake', 'lauf']);
  assert.equal((await s.post('/api/me/games/regen', { score: 100 })).status, 400);

  const pass = (lessonId) => s.post('/api/results', { kind: 'course', lessonId, durationMs: 60000, gross: 150, correct: 150, errors: 0 });
  const upTo = LESSONS.findIndex((l) => l.id === 'umlaute');
  for (const l of LESSONS.slice(0, upTo)) assert.equal((await pass(l.id)).data.course.gamesUnlocked, false);
  assert.equal((await pass('umlaute')).data.course.gamesUnlocked, true);
  g = (await s.get('/api/me/games')).data;
  assert.equal(g.unlocked, true);

  // Spiele zählen nicht als Übung: kein Ergebnis, nur der Rekord.
  const resultsBefore = (await s.get('/api/me/results')).data.length;
  assert.deepEqual((await s.post('/api/me/games/regen', { score: 420, level: 3 })).data, { best: 420, record: true });
  assert.deepEqual((await s.post('/api/me/games/regen', { score: 300, level: 2 })).data, { best: 420, record: false });
  assert.equal((await s.get('/api/me/results')).data.length, resultsBefore);
  g = (await s.get('/api/me/games')).data;
  const regen = g.games.find((x) => x.id === 'regen');
  assert.equal(regen.best, 420);
  assert.equal(regen.bestLevel, 3);
  assert.equal(regen.plays, 2);
  assert.equal((await s.post('/api/me/games/gibtsnicht', { score: 1 })).status, 404);
  assert.equal((await s.post('/api/me/games/snake', { score: -5 })).status, 400);

  // Lehrkraft: Einstellung, Zahl der Freigeschalteten, ausschalten.
  let cls = (await teacher.get(`/api/classes/${classId}`)).data;
  assert.equal(cls.gamesAfter, 'umlaute');
  assert.equal((await teacher.patch(`/api/classes/${classId}`, { gamesAfter: 'quatsch' })).status, 400);
  await teacher.patch(`/api/classes/${classId}`, { gamesAfter: 'abschluss' });
  assert.equal((await s.get('/api/me/games')).data.unlocked, false);
  await teacher.patch(`/api/classes/${classId}`, { gamesAfter: 'off' });
  assert.equal((await s.get('/api/me')).data.class.games, false);
  g = (await s.get('/api/me/games')).data;
  assert.equal(g.enabled, false);
  assert.equal((await s.post('/api/me/games/lauf', { score: 10 })).status, 400);
  await teacher.patch(`/api/classes/${classId}`, { gamesAfter: 'always' });
  assert.equal((await s.get('/api/me/games')).data.unlocked, true);
  cls = (await teacher.get(`/api/classes/${classId}`)).data;
  assert.equal(cls.gamesAfter, 'always');

  // Lehrkraft in der Schüleransicht kann die Spiele ausprobieren, auch ohne Kursfortschritt.
  await teacher.patch(`/api/classes/${classId}`, { gamesAfter: 'umlaute' });
  await teacher.post('/api/me/student-view', { classId });
  assert.equal((await teacher.get('/api/me/games')).data.unlocked, true);
  await teacher.del('/api/me/student-view');

  // Export und Löschung zum Schuljahresende enthalten die Spielstände.
  const sid = cls.students[0].id;
  const exp = (await teacher.get(`/api/students/${sid}/export.json`)).data;
  assert.equal(exp.spiele.length, 1);
  purgeSchool(db, db.prepare('SELECT school_id FROM users WHERE id = ?').get(sid).school_id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM game_scores').get().n, 0);
});
