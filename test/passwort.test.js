import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.js';
import { hashPassword, verifyPassword } from '../server/auth.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qn-pw-'));
const file = path.join(dir, 'db.sqlite');
const db = openDb(file);
const { lastInsertRowid: id } = db
  .prepare("INSERT INTO users (role, username, display_name, password_hash, created_at) VALUES ('admin', 'gre', 'G', ?, '2026-10-01')")
  .run(hashPassword('alt'));
db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run('t1', id, Date.now() + 1e6);

const run = (args, env = {}) =>
  execFileSync(process.execPath, ['--no-warnings', 'server/passwort.js', ...args], {
    env: { ...process.env, DB_FILE: file, PW: '', ...env },
    encoding: 'utf8',
    stdio: 'pipe',
  });
const hash = () => db.prepare('SELECT password_hash FROM users WHERE id = ?').get(id).password_hash;

test('setzt das Passwort neu und beendet Anmeldungen', () => {
  assert.match(run(['GRE'], { PW: 'Neu-2026!' }), /geändert/);
  assert.ok(verifyPassword('Neu-2026!', hash()));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
});

test('erzeugt ein Passwort, wenn keines angegeben ist', () => {
  const pw = run(['gre']).match(/Neues Passwort: (\S+)/)[1];
  assert.ok(verifyPassword(pw, hash()));
});

test('unbekannter Name listet die Konten', () => {
  assert.throws(() => run(['xyz']), (e) => /gre \(admin\)/.test(e.stderr));
});
