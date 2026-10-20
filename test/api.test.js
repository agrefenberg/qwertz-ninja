import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { purgeIfDue } from '../server/retention.js';
import { compareTyped, metrics, suggestGrade } from '../public/js/scoring.js';
import { keysFor, fingerFor } from '../public/js/layout.js';

let server;
let base;
let db;

// Minimaler Client mit eigenem Cookie.
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
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data };
  };
  return {
    get: (u) => call('GET', u),
    post: (u, b = {}) => call('POST', u, b),
    put: (u, b = {}) => call('PUT', u, b),
    patch: (u, b = {}) => call('PATCH', u, b),
    del: (u) => call('DELETE', u),
  };
}

before(async () => {
  db = openDb(':memory:');
  server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('Auswertung: korrigierte Fehler zählen nicht, nur der Endstand', () => {
  assert.deepEqual(compareTyped('Haus Maus', 'Haus Mxus'), { gross: 9, correct: 8, errors: 1 });
  // Ausgelassener Buchstabe zählt einmal und verschiebt nicht den Rest.
  assert.equal(compareTyped('zwölf Minuten Verspätung', 'zwlf Minuten Verspätung').errors, 1);
  assert.equal(compareTyped('zwölf Minuten', 'zwöölf Minuten').errors, 1);
  assert.deepEqual(compareTyped('Haus', 'Haus'), { gross: 4, correct: 4, errors: 0 });
  const m = metrics({ gross: 300, correct: 297, errors: 3, durationMs: 60000 });
  assert.equal(m.apm, 297);
  assert.equal(m.wpm, 59.4);
  assert.equal(m.errorRate, 1);
  const scheme = { error_penalty: 10, thresholds: [240, 200, 160, 120, 80] };
  assert.equal(suggestGrade(scheme, { correct: 250, errors: 0, durationMs: 60000 }).grade, 1);
  assert.equal(suggestGrade(scheme, { correct: 250, errors: 2, durationMs: 60000 }).grade, 2);
  assert.equal(suggestGrade(scheme, { correct: 50, errors: 0, durationMs: 60000 }).grade, 6);
});

test('Tastatur: Umschalttaste der anderen Hand, AltGr für @', () => {
  assert.deepEqual(keysFor('A'), ['KeyA', 'ShiftRight']);
  assert.deepEqual(keysFor('Ö'), ['Semicolon', 'ShiftLeft']);
  assert.deepEqual(keysFor('@'), ['KeyQ', 'AltRight']);
  assert.equal(fingerFor('z'), 'r2');
  assert.equal(fingerFor('ß'), 'r5');
});

test('Gesamtablauf: Einrichtung, Lehrkraft, Klasse, Übung, Test, Note, Export', async () => {
  const anon = client();
  assert.equal((await anon.get('/api/setup')).data.needsSetup, true);
  assert.equal((await anon.get('/api/me')).status, 401);

  const admin = client();
  assert.equal((await admin.post('/api/setup', { username: 'admin', password: 'sehrgeheim123', schoolName: 'Testschule' })).status, 200);
  assert.equal((await admin.post('/api/setup', { username: 'x', password: 'sehrgeheim123', schoolName: 'X' })).status, 403);
  assert.equal((await admin.post('/api/login', { username: 'admin', password: 'falsch' })).status, 401);
  assert.equal((await admin.post('/api/login', { username: 'admin', password: 'sehrgeheim123' })).status, 200);

  const t = await admin.post('/api/admin/teachers', { username: 'huber', displayName: 'Frau Huber' });
  assert.equal(t.status, 200);

  const teacher = client();
  assert.equal((await teacher.post('/api/login', { username: 'huber', password: t.data.password })).status, 200);
  assert.equal((await teacher.get('/api/admin/teachers')).status, 403);

  const cls = await teacher.post('/api/classes', { name: '10b' });
  const classId = cls.data.id;
  const creds = await teacher.post(`/api/classes/${classId}/students`, { count: 2 });
  assert.equal(creds.data.credentials.length, 2);
  const [c1, c2] = creds.data.credentials;
  assert.match(c1.username, /^10b-[a-z]+-\d{2}$/);

  // Keine Klarnamen oder E-Mail-Adressen in der Datenbank.
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  assert.ok(!cols.includes('email'));

  const s1 = client();
  assert.equal((await s1.post('/api/login', { username: c1.username, password: c1.password })).status, 200);
  const me = await s1.get('/api/me');
  assert.equal(me.data.role, 'student');
  assert.equal(me.data.onboardingDone, false);
  assert.equal((await s1.get('/api/classes')).status, 403);

  // Grundstellung abschließen.
  const basics = await s1.post('/api/results', { kind: 'basics', durationMs: 30000, gross: 70, correct: 66, errors: 4, keyStats: { a: [10, 1], ö: [5, 3] } });
  assert.equal(basics.status, 200);
  assert.ok(basics.data.newBadges.some((b) => b.id === 'grundstellung'));
  assert.equal((await s1.get('/api/me')).data.onboardingDone, true);

  // Kurs: erste Lektion offen, zweite gesperrt; mit wenigen Fehlern bestanden.
  let course = (await s1.get('/api/me/course')).data;
  assert.equal(course.lessons[0].unlocked, true);
  assert.equal(course.lessons[1].unlocked, false);
  assert.equal((await s1.post('/api/results', { kind: 'course', lessonId: course.lessons[1].id, durationMs: 60000, gross: 150, correct: 150, errors: 0 })).status, 400);
  const fail = await s1.post('/api/results', { kind: 'course', lessonId: 'grundreihe', durationMs: 60000, gross: 150, correct: 140, errors: 10 });
  assert.equal(fail.data.course.passed, false);
  const pass = await s1.post('/api/results', {
    kind: 'course', lessonId: 'grundreihe', durationMs: 60000, gross: 150, correct: 149, errors: 1,
    confusions: [['ö', 'ä', 3], ['z', 'y', 1]], errorWords: { Ölfass: 2 },
  });
  assert.equal(pass.data.course.passed, true);
  assert.equal(pass.data.course.newlyPassed, true);
  assert.equal(pass.data.course.next.id, 'oben-links');
  course = (await s1.get('/api/me/course')).data;
  assert.equal(course.lessons[1].unlocked, true);

  // Fehleranalyse sammelt Verwechslungen und Wörter.
  await s1.post('/api/results', { kind: 'focus', durationMs: 60000, gross: 100, correct: 98, errors: 2, confusions: [['z', 'y', 2]], errorWords: { Ölfass: 1 } });
  const prof = (await s1.get('/api/me/errors')).data;
  assert.deepEqual(prof.confusions.map((c) => [c.expected, c.typed, c.count]), [['z', 'y', 3], ['ö', 'ä', 3]]);
  assert.deepEqual(prof.words, [{ word: 'Ölfass', count: 3 }]);

  // Unplausible Werte werden abgelehnt.
  assert.equal((await s1.post('/api/results', { kind: 'text', durationMs: 1000, gross: 900, correct: 900, errors: 0 })).status, 400);

  // Eigener Text der Lehrkraft ist für die Klasse sichtbar, für fremde nicht.
  const text = await teacher.post('/api/texts', { title: 'Testtext', content: 'Das ist ein „kurzer“ Testtext für den Test. Er ist lang genug.' });
  const texts = (await s1.get('/api/texts')).data;
  assert.ok(texts.some((x) => x.id === text.data.id && x.own));
  assert.equal((await s1.get(`/api/texts/${text.data.id}`)).data.content.includes('"kurzer"'), true);

  // Notenschlüssel und Test.
  const scheme = await teacher.post('/api/grading-schemes', { name: 'Standard', errorPenalty: 0, thresholds: [240, 200, 160, 120, 80] });
  assert.equal(scheme.status, 200);
  assert.equal((await teacher.post('/api/grading-schemes', { name: 'Falsch', thresholds: [1, 2, 3, 4, 5] })).status, 400);
  const testA = await teacher.post(`/api/classes/${classId}/assignments`, {
    type: 'test',
    title: 'LZK 1',
    textId: text.data.id,
    durationSec: 60,
    gradingSchemeId: scheme.data.id,
  });
  assert.equal(testA.status, 200);

  // Testtext ist vor dem Start nicht abrufbar.
  const preview = await s1.get(`/api/me/assignments/${testA.data.id}`);
  assert.equal(preview.data.text, undefined);

  const start = await s1.post(`/api/tests/${testA.data.id}/start`);
  assert.equal(start.status, 200);
  assert.equal((await s1.post(`/api/tests/${testA.data.id}/start`)).status, 400, 'nur ein Versuch');

  // Startzeit zurückdatieren, als wären 30 Sekunden vergangen.
  db.prepare('UPDATE test_attempts SET started_at = ? WHERE assignment_id = ?').run(Date.now() - 30000, testA.data.id);
  const target = start.data.text;
  const typed = target.slice(0, 20) + 'X' + target.slice(21, 60);
  const sub = await s1.post(`/api/tests/${testA.data.id}/submit`, { typed, correctedErrors: 2, keyStats: {} });
  assert.equal(sub.status, 200);
  assert.equal(sub.data.errors, 1);
  assert.equal(sub.data.gross, 60);
  assert.ok(sub.data.durationMs >= 30000 && sub.data.durationMs < 32000);
  assert.equal((await s1.post(`/api/tests/${testA.data.id}/submit`, { typed })).status, 400, 'keine zweite Abgabe');

  const res = await teacher.get(`/api/assignments/${testA.data.id}/results`);
  const row = res.data.rows.find((r) => r.username === c1.username);
  assert.equal(row.errors, 1);
  assert.equal(row.grade.grade, 5); // 59 Anschläge in 30 s = 118/min → Note 5 (ab 80)
  const other = res.data.rows.find((r) => r.username === c2.username);
  assert.equal(other.started_at, null);

  // Lehrkraft setzt Versuch zurück.
  assert.equal((await teacher.del(`/api/assignments/${testA.data.id}/attempts/${row.user_id}`)).status, 200);
  assert.equal((await s1.post(`/api/tests/${testA.data.id}/start`)).status, 200);

  // Rangliste nur nach Freigabe.
  assert.equal((await s1.get('/api/leaderboard')).data.enabled, false);
  await teacher.patch(`/api/classes/${classId}`, { leaderboard: true });
  assert.equal((await s1.get('/api/leaderboard')).data.enabled, true);

  // Fremde Lehrkraft sieht die Klasse nicht.
  const t2 = await admin.post('/api/admin/teachers', { username: 'maier', displayName: 'Herr Maier' });
  const teacher2 = client();
  await teacher2.post('/api/login', { username: 'maier', password: t2.data.password });
  assert.equal((await teacher2.get(`/api/classes/${classId}`)).status, 404);
  assert.equal((await teacher2.get(`/api/assignments/${testA.data.id}/results`)).status, 404);

  // Export.
  const csv = await teacher.get(`/api/classes/${classId}/export.csv`);
  assert.equal(csv.status, 200);
  assert.match(csv.data, /Pseudonym;Benutzername/);
  assert.match(csv.data, /Grundstellung/);

  // Lehrkraft sieht Kurs und Fehleranalyse.
  const detail = (await teacher.get(`/api/students/${row.user_id}/results`)).data;
  assert.equal(detail.course.filter((l) => l.passed).length, 1);
  assert.equal(detail.errors.confusions.length, 2);

  // Neuer Druckbogen für ausgewählte Schüler: neue Passwörter, alte gelten nicht mehr.
  const re = await teacher.post(`/api/classes/${classId}/reset-passwords`, { studentIds: [row.user_id] });
  assert.equal(re.data.credentials.length, 1);
  assert.equal((await client().post('/api/login', { username: c1.username, password: c1.password })).status, 401);
  assert.equal((await client().post('/api/login', { username: c1.username, password: re.data.credentials[0].password })).status, 200);
  const all = await teacher.post(`/api/classes/${classId}/reset-passwords`, {});
  assert.equal(all.data.credentials.length, 2);
  assert.equal((await teacher2.post(`/api/classes/${classId}/reset-passwords`, {})).status, 404);

  // Passwort-Reset meldet den Schüler ab.
  await teacher.post(`/api/students/${row.user_id}/reset-password`);
  assert.equal((await s1.get('/api/me')).status, 401);
});

test('Löschung zum Schuljahresende', () => {
  const d = openDb(':memory:');
  d.prepare("INSERT INTO schools (name, year_end, created_at) VALUES ('S1', '07-31', 0), ('S2', '06-30', 0)").run();
  // Frische Installation löscht nichts.
  assert.equal(purgeIfDue(d, new Date(2026, 5, 1)), false);
  d.prepare("INSERT INTO users (role, username, display_name, password_hash, xp, school_id, created_at) VALUES ('student', 'a', 'A', 'x', 500, 1, 0)").run();
  d.prepare("INSERT INTO results (user_id, kind, duration_ms, gross_chars, correct_chars, errors, apm, wpm, error_rate, created_at) VALUES (1, 'text', 1, 1, 1, 0, 1, 1, 0, 0)").run();
  // Schule 2 endet am 30.06.: Ihre Löschung lässt die Ergebnisse von Schule 1 stehen.
  assert.equal(purgeIfDue(d, new Date(2026, 6, 31, 12)), true);
  assert.equal(d.prepare('SELECT COUNT(*) AS n FROM results').get().n, 1);
  assert.equal(purgeIfDue(d, new Date(2026, 6, 31, 13)), false);
  assert.equal(purgeIfDue(d, new Date(2026, 7, 1, 1)), true);
  assert.equal(d.prepare('SELECT COUNT(*) AS n FROM results').get().n, 0);
  assert.equal(d.prepare('SELECT xp FROM users').get().xp, 0);
  assert.equal(d.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
  assert.equal(purgeIfDue(d, new Date(2026, 7, 2)), false);
});

test('Demodaten anlegen und entfernen', async () => {
  const { createDemo, removeDemo, hasDemo } = await import('../server/demo.js');
  const d = openDb(':memory:');
  d.prepare("INSERT INTO schools (name, created_at) VALUES ('S1', 0), ('S2', 0)").run();
  d.prepare("INSERT INTO users (role, username, display_name, password_hash, school_id, created_at) VALUES ('teacher', 'echt', 'Echte Lehrkraft', 'x', 1, 0)").run();
  const t0 = Date.now();
  const s = createDemo(d, 1);
  assert.ok(Date.now() - t0 < 20000);
  assert.equal(s.teachers.length, 4);
  assert.equal(s.classes, 7);
  assert.ok(s.students > 130);
  assert.ok(s.results > 1000);
  assert.ok(hasDemo(d, 1));
  assert.equal(hasDemo(d, 2), false);
  assert.ok(d.prepare('SELECT COUNT(*) AS n FROM badges').get().n > 100);
  // Demodaten einer zweiten Schule kommen der ersten nicht in die Quere.
  assert.deepEqual(createDemo(d, 2).teachers, ['demo2-huber', 'demo2-maier', 'demo2-yilmaz', 'demo2-schmid']);
  removeDemo(d, 2);
  assert.ok(hasDemo(d, 1));
  removeDemo(d, 1);
  assert.equal(hasDemo(d, 1), false);
  assert.equal(d.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'student'").get().n, 0);
  assert.equal(d.prepare('SELECT COUNT(*) AS n FROM results').get().n, 0);
  assert.equal(d.prepare("SELECT COUNT(*) AS n FROM users WHERE username = 'echt'").get().n, 1);
});
