import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { evalRules, evaluatePln, note1Position, templateLines } from '../server/pln.js';
import { bonusErrors, gradeWithSettings, linesFor, normalizeSettings, presetSettings, strokes } from '../public/js/pln-rules.js';

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
  return { get: (u) => call('GET', u), post: (u, b = {}) => call('POST', u, b), patch: (u, b = {}) => call('PATCH', u, b), put: (u, b = {}) => call('PUT', u, b), del: (u) => call('DELETE', u) };
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

test('PLN-Richtlinien 7.–9. Klasse: Fehlerprozente, Abstufung und Bonus', () => {
  const s = presetSettings('8-2');
  assert.equal(s.requiredChars, 1200);
  assert.equal(s.durationMin, 10);
  // Bonus: +400 → 1 Fehler frei, +600 → 2, +800 → 3
  assert.equal(bonusErrors(s, 1599), 0);
  assert.equal(bonusErrors(s, 1600), 1);
  assert.equal(bonusErrors(s, 1800), 2);
  assert.equal(bonusErrors(s, 2400), 5);
  const g = (strokes, errors) => gradeWithSettings(s, { strokes, errors }).grade;
  // Fehlerprozente: bis 0,100 % Note 1, 0,101–0,200 % Note 2 … ab 0,501 % Note 6
  assert.equal(g(1300, 1), 1); // 0,077 %
  assert.equal(g(1300, 2), 2); // 0,154 %
  assert.equal(g(1300, 3), 3); // 0,231 %
  assert.equal(g(1300, 4), 4); // 0,308 %
  assert.equal(g(1300, 7), 6); // 0,538 %
  // Bonus: 1650 Anschläge, 3 Fehler → 1 frei, 2 × 100 : 1650 = 0,121 % → Note 2
  const b = gradeWithSettings(s, { strokes: 1650, errors: 3 });
  assert.equal(b.grade, 2);
  assert.equal(b.bonus, 1);
  // Soll unterschritten: bis 50 → 1 Stufe, bis 100 → 2 Stufen, über 200 → Note 6
  assert.equal(g(1150, 1), 2);
  assert.equal(g(1130, 1), 3);
  assert.equal(g(999, 0), 6);
  assert.equal(gradeWithSettings(s, { strokes: 1500, errors: 0 }, { noTouch: true }).grade, 6);
  // Werte sind einstellbar.
  const own = normalizeSettings({ ...s, percentBands: '0,2 0,4 0,6 0,8 1,0', bonus: false });
  assert.deepEqual(own.percentBands, [0.2, 0.4, 0.6, 0.8, 1]);
  assert.equal(gradeWithSettings(own, { strokes: 1650, errors: 3 }).grade, 1);
  // Ungültige Eingaben fallen auf die Vorgabe zurück.
  assert.deepEqual(normalizeSettings({ percentBands: [0.5, 0.1, 0.2, 0.3, 0.4] }).percentBands, [0.1, 0.2, 0.3, 0.4, 0.5]);
});

test('PLN-Richtlinien 6. Klasse: Fehlerzahl, fehlende Zeilen, Großbuchstaben', () => {
  const s = normalizeSettings({ ...presetSettings('6-1'), targetLines: 3, lineChars: 30 });
  assert.equal(s.mode, 'count');
  assert.equal(s.durationMin, 12);
  const g = (errors) => gradeWithSettings(s, { errors, missingLines: 0 }).grade;
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(g), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6]);
  // Nachteilsausgleich 20 % weniger Zeilen, Beispiele der Richtlinie: 10 → 8, 13 → 10, 16 → 13
  assert.deepEqual([10, 13, 16].map((n) => linesFor({ ...s, targetLines: n }, true)), [8, 10, 13]);
  assert.equal(strokes('Der Hund', true), 10);
  assert.equal(strokes('Der Hund', false), 8);

  const src = 'Der Hund läuft schnell über die Wiese. Die Katze schläft lange im warmen Haus und der';
  const run = (typed) => {
    const ev = evaluatePln(src, typed, evalRules(s, src));
    return { ev, grade: gradeWithSettings(s, ev).grade };
  };
  assert.equal(run(src).grade, 1);
  // Angefangene Zeile fehlt: eine Note schlechter, Fehler darin zählen nicht.
  const started = run('Der Hund läuft schnell über die Wiese. Die Katze schläft lange im wrmen Haus');
  assert.equal(started.ev.missingLines, 1);
  assert.equal(started.ev.errors, 0);
  assert.equal(started.grade, 2);
  // Zwei Zeilen fehlen: zwei Stufen schlechter.
  assert.equal(run('Der Hund läuft schnell über').ev.missingLines, 2);
  // Fehlt nur ein einsilbiges Wort, gibt es keine Abstufung.
  const mono = run('Der Hund läuft schnell über die Wiese. Die Katze schläft lange im warmen Haus und');
  assert.equal(mono.ev.missingLines, 0);
  assert.equal(mono.ev.missingExempt, true);
  // Kein Wiederholungsfehler: dasselbe Wort zweimal falsch = zwei Fehler; abschaltbar.
  const rep = 'Haus Maus Haus Maus Ende';
  assert.equal(evaluatePln(rep, 'Hasu Maus Hasu Maus Ende').errors, 2);
  assert.equal(evaluatePln(rep, 'Hasu Maus Hasu Maus Ende', { repeatFree: true }).errors, 1);
  // Jeder Tippfehler einzeln, wenn „ein Fehler je Wort“ aus ist.
  assert.equal(evaluatePln(SRC, 'Der Hnud läuft', { oneErrorPerWord: false, lastWordFree: false }).errors, 2);
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

test('PLN mit Einstellungen: Vorlage nach Richtlinie, Nachteilsausgleich, Note 6 ohne 10 Finger', async () => {
  const admin = client();
  await admin.post('/api/login', { username: 'admin', password: 'sehrgeheim123' });
  const t = await admin.post('/api/admin/teachers', { username: 'maier', displayName: 'Herr Maier' });
  const teacher = client();
  await teacher.post('/api/login', { username: 'maier', password: t.data.password });
  const classId = (await teacher.post('/api/classes', { name: '6b' })).data.id;
  const [c1, c2] = (await teacher.post(`/api/classes/${classId}/students`, { count: 2 })).data.credentials;
  const textId = (await teacher.get('/api/texts')).data.find((x) => x.title.startsWith('Langtext')).id;

  // 6. Klasse, 1. PLN: 10 Zeilen in 12 Minuten, kein Notenschlüssel nötig.
  const created = await teacher.post(`/api/classes/${classId}/plns`, { title: '1. PLN', settings: { ...presetSettings('6-1'), preset: '6-1', textId } });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const plnId = created.data.id;
  let detail = (await teacher.get(`/api/plns/${plnId}`)).data;
  assert.equal(detail.pln.settings.mode, 'count');
  assert.equal(templateLines(detail.pln.text, detail.pln.settings.lineChars).length, 10, 'genau 10 Zeilen');
  assert.equal(detail.pln.heading, 'PLN Praktischer Leistungsnachweis 12-Minuten-Abschrift');
  assert.equal(detail.pln.note1_chars, strokes(detail.pln.text, true));
  assert.ok(detail.pln.lrs_pos < detail.pln.text.length);

  const list = (await teacher.get(`/api/classes/${classId}/plns`)).data;
  assert.equal(list[0].settings.targetLines, 10);

  // Nachteilsausgleich vor dem Start: 8 statt 10 Zeilen.
  const u1 = detail.rows.find((r) => r.username === c1.username);
  const u2 = detail.rows.find((r) => r.username === c2.username);
  assert.equal((await teacher.put(`/api/plns/${plnId}/students/${u1.user_id}`, { lrs: true })).status, 200);

  // Einstellungen ändern, solange niemand begonnen hat: Zeilenzahl 12 baut den Text neu.
  const upd = await teacher.put(`/api/plns/${plnId}/settings`, { ...detail.pln.settings, targetLines: 12 });
  assert.equal(upd.data.textChanged, true);
  detail = (await teacher.get(`/api/plns/${plnId}`)).data;
  assert.equal(templateLines(detail.pln.text, detail.pln.settings.lineChars).length, 12);
  await teacher.patch(`/api/plns/${plnId}`, { status: 'open' });

  const s1 = client();
  await s1.post('/api/login', { username: c1.username, password: c1.password });
  const st = (await s1.post(`/api/me/plns/${plnId}/start`)).data;
  assert.equal(st.durationMs, 12 * 60000, 'feste Zeilen: Nachteilsausgleich über weniger Zeilen, nicht über Zeit');
  const lines = templateLines(detail.pln.text, detail.pln.settings.lineChars);
  const ten = lines.slice(0, 10).map((l) => l.text).join(' ');
  await s1.post(`/api/me/plns/${plnId}/save`, { typed: ten, final: true });

  const s2 = client();
  await s2.post('/api/login', { username: c2.username, password: c2.password });
  await s2.post(`/api/me/plns/${plnId}/start`);
  await s2.post(`/api/me/plns/${plnId}/save`, { typed: ten, final: true });

  // Bewertungsart lässt sich nach dem Start nicht mehr ändern, Bewertungsregeln schon.
  assert.equal((await teacher.put(`/api/plns/${plnId}/settings`, { ...detail.pln.settings, mode: 'percent' })).status, 400);
  assert.equal((await teacher.put(`/api/plns/${plnId}/settings`, { ...detail.pln.settings, missingLinePenalty: 2 })).status, 200);

  await teacher.put(`/api/plns/${plnId}/students/${u2.user_id}`, { noTouch: false });
  let rows = (await teacher.get(`/api/plns/${plnId}`)).data.rows;
  const r1 = rows.find((r) => r.username === c1.username);
  const r2 = rows.find((r) => r.username === c2.username);
  assert.equal(r1.lrs, true);
  assert.equal(r1.missingLines, 0, 'mit Nachteilsausgleich reichen 10 von 12 Zeilen (Soll 10)');
  assert.equal(r1.grade.grade, 1);
  assert.equal(r2.missingLines, 2);
  assert.equal(r2.grade.grade, 5, 'zwei fehlende Zeilen × 2 Stufen');

  await teacher.put(`/api/plns/${plnId}/students/${u1.user_id}`, { noTouch: true });
  rows = (await teacher.get(`/api/plns/${plnId}`)).data.rows;
  assert.equal(rows.find((r) => r.username === c1.username).grade.grade, 6);

  const pdf = await teacher.get(`/api/plns/${plnId}/abschriften.pdf`);
  assert.equal(pdf.status, 200);

  // 7.–9. Klasse: Fehlerprozente, Zeitverlängerung 25 % mit Nachteilsausgleich.
  const p2 = (await teacher.post(`/api/classes/${classId}/plns`, { title: '2. PLN', settings: { ...presetSettings('7-2'), textId } })).data.id;
  const d2 = (await teacher.get(`/api/plns/${p2}`)).data;
  assert.equal(d2.pln.note1_chars, 1000);
  assert.ok(d2.pln.text.length >= 2400);
  await teacher.put(`/api/plns/${p2}/students/${u2.user_id}`, { lrs: true });
  await teacher.patch(`/api/plns/${p2}`, { status: 'open' });
  assert.equal((await s2.get(`/api/me/plns/${p2}`)).data.durationMs, 12.5 * 60000);
  assert.equal((await s2.post(`/api/me/plns/${p2}/start`)).data.durationMs, 12.5 * 60000);
});
