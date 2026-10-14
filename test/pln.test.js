import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { evaluatePln, note1Position, templateLines } from '../server/pln.js';

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
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, type };
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

const SRC = 'Der Hund läuft schnell über die große Wiese und bellt laut.';

test('PLN-Wertung: ein Fehler je Wort, letzte Sinneinheit frei, Returntaste', () => {
  assert.equal(evaluatePln(SRC, 'Der Hund läuft schnell über').errors, 0);
  // Zwei Tippfehler in einem Wort: ein Fehler, beide markiert.
  const two = evaluatePln(SRC, 'Der Hnud läuft schnell über');
  assert.equal(two.errors, 1);
  assert.equal(two.marks.filter((m) => m.kind === 'wrong').length, 2);
  assert.equal(two.marks.filter((m) => m.counted).length, 1);
  // Fehler in zwei Wörtern: zwei Fehler.
  assert.equal(evaluatePln(SRC, 'Der Hudn lauft schnell über').errors, 2);
  // Ausgelassenes Wort: ein Fehler.
  assert.equal(evaluatePln(SRC, 'Der Hund schnell über die').errors, 1);
  // Letzte Sinneinheit wird nicht gewertet, aber markiert.
  const last = evaluatePln(SRC, 'Der Hund läuft schn3ll');
  assert.equal(last.errors, 0);
  assert.equal(last.errorList[0].reason, 'letzte Sinneinheit');
  // Returntaste: erster Return ein Fehler, weitere Wiederholungsfehler; oder jeder Return ein Fehler.
  const typed = 'Der Hund\nläuft schnell\nüber die\n\ngroße';
  assert.equal(evaluatePln(SRC, typed, 'first').errors, 1);
  assert.equal(evaluatePln(SRC, typed, 'each').errors, 4);
  assert.equal(evaluatePln(SRC, typed, 'first').gross, 'Der Hund läuft schnell über die große'.length);
});

test('PLN-Vorlage: Zeilen mit Anschlägen und Note-1-Markierung', () => {
  const lines = templateLines(SRC, 20);
  assert.ok(lines.every((l) => l.text.length <= 20));
  assert.equal(lines.at(-1).end, SRC.length);
  assert.equal(lines.map((l) => l.text).join(' '), SRC);
  // Markierung steht hinter dem Wort, in dem die Grenze liegt.
  assert.equal(SRC.slice(0, note1Position(SRC, 10)), 'Der Hund läuft');
});

test('PLN-Ablauf: anlegen, freigeben, schreiben, abgeben, PDF', async () => {
  const admin = client();
  await admin.post('/api/setup', { username: 'admin', password: 'sehrgeheim123', schoolName: 'Testschule' });
  await admin.post('/api/login', { username: 'admin', password: 'sehrgeheim123' });
  const t = await admin.post('/api/admin/teachers', { username: 'huber', displayName: 'Frau Huber' });
  const teacher = client();
  await teacher.post('/api/login', { username: 'huber', password: t.data.password });
  const classId = (await teacher.post('/api/classes', { name: '7a' })).data.id;
  const [c1, c2] = (await teacher.post(`/api/classes/${classId}/students`, { count: 2 })).data.credentials;
  const scheme = (await teacher.post('/api/grading-schemes', { name: 'PLN 7', errorPenalty: 20, thresholds: [200, 170, 140, 110, 80] })).data.id;
  const textId = (await teacher.get('/api/texts')).data.find((x) => x.title.startsWith('Langtext')).id;

  assert.equal((await teacher.post(`/api/classes/${classId}/plns`, { title: 'Ohne Schlüssel', textId })).status, 400);
  const created = await teacher.post(`/api/classes/${classId}/plns`, { title: '1. Tipp-PLN', gradingSchemeId: scheme, textId, format: 'lines', returnRule: 'first' });
  assert.equal(created.status, 200);
  const plnId = created.data.id;
  const detail = (await teacher.get(`/api/plns/${plnId}`)).data;
  assert.equal(detail.pln.note1_chars, 2000);
  assert.ok(detail.pln.text.length >= 2500, 'Text reicht für 10 Minuten');
  assert.equal(detail.pln.status, 'draft');

  const s1 = client();
  await s1.post('/api/login', { username: c1.username, password: c1.password });
  // Vor der Freigabe: nicht sichtbar und nicht startbar.
  assert.equal((await s1.get('/api/me/plns')).data.length, 0);
  assert.equal((await s1.post(`/api/me/plns/${plnId}/start`)).status, 400);

  await teacher.patch(`/api/plns/${plnId}`, { status: 'open' });
  assert.equal((await s1.get('/api/me/plns')).data.length, 1);
  const info = (await s1.get(`/api/me/plns/${plnId}`)).data;
  assert.equal(info.heading, 'PLN Praktischer Leistungsnachweis 10-Minuten-Abschrift');
  assert.equal(info.text, undefined, 'Der Text kommt nur auf Papier');

  const started = await s1.post(`/api/me/plns/${plnId}/start`);
  assert.equal(started.status, 200);
  assert.equal((await s1.post(`/api/me/plns/${plnId}/start`)).status, 400, 'nur ein Versuch');

  const src = detail.pln.text;
  const typed = src.slice(0, 120).replace('Schreibmaschine', 'Schriebmaschine') + '\n' + src.slice(121, 300);
  assert.equal((await s1.post(`/api/me/plns/${plnId}/save`, { typed: typed.slice(0, 50), leftCount: 2 })).status, 200);
  // Verlassen des Prüfungsfensters wird gezählt und kann nicht verringert werden.
  await s1.post(`/api/me/plns/${plnId}/save`, { typed: typed.slice(0, 50), leftCount: 0 });
  assert.equal((await s1.get(`/api/me/plns/${plnId}`)).data.leftCount, 2);
  // Nach einem Neuladen ist der Zwischenstand wieder da.
  assert.equal((await s1.get(`/api/me/plns/${plnId}`)).data.typed, typed.slice(0, 50));
  assert.equal((await s1.post(`/api/me/plns/${plnId}/save`, { typed, final: true })).status, 200);
  assert.equal((await s1.post(`/api/me/plns/${plnId}/save`, { typed: 'nachträglich' })).status, 400);
  assert.equal((await s1.get(`/api/me/plns/${plnId}`)).data.ended, true);

  // Zweite Person: Zeit abgelaufen, gewertet wird der letzte gespeicherte Stand.
  const s2 = client();
  await s2.post('/api/login', { username: c2.username, password: c2.password });
  await s2.post(`/api/me/plns/${plnId}/start`);
  await s2.post(`/api/me/plns/${plnId}/save`, { typed: src.slice(0, 80) });
  db.prepare('UPDATE pln_attempts SET started_at = started_at - 700000 WHERE user_id = (SELECT id FROM users WHERE username = ?)').run(c2.username);
  assert.equal((await s2.post(`/api/me/plns/${plnId}/save`, { typed: src.slice(0, 500) })).status, 400);

  const rows = (await teacher.get(`/api/plns/${plnId}`)).data.rows;
  const r1 = rows.find((r) => r.username === c1.username);
  assert.equal(r1.state, 'done');
  assert.equal(r1.errors, 2); // Tippfehler im Wort + erster Return
  assert.equal(r1.left_count, 2);
  assert.ok(r1.grade.grade >= 1);
  const r2 = rows.find((r) => r.username === c2.username);
  assert.equal(r2.state, 'done');
  assert.equal(r2.gross, 80);

  const pdf = await teacher.get(`/api/plns/${plnId}/abschriften.pdf`);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.type, 'application/pdf');
  assert.equal(pdf.data.subarray(0, 5).toString(), '%PDF-');
  assert.equal((await s1.get(`/api/plns/${plnId}/abschriften.pdf`)).status, 403);

  // Zurücksetzen erlaubt einen neuen Versuch.
  await teacher.del(`/api/plns/${plnId}/attempts/${r1.user_id}`);
  assert.equal((await s1.post(`/api/me/plns/${plnId}/start`)).status, 200);
});
