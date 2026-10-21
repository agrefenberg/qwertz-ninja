import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { BUILTIN_TEXTS } from './content.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Eine Installation kann eine Schule (mode = single) oder mehrere Schulen (mode = multi) bedienen.
-- Im Mehrschulbetrieb ist der Betreiber ein Admin ohne Schule (school_id NULL).
CREATE TABLE IF NOT EXISTS schools (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  school_code TEXT UNIQUE,
  address TEXT NOT NULL DEFAULT '',
  head TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',
  year_end TEXT NOT NULL DEFAULT '07-31',
  privacy_note TEXT NOT NULL DEFAULT '',
  last_purge INTEGER NOT NULL DEFAULT 0,
  avv_signed_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leaderboard_enabled INTEGER NOT NULL DEFAULT 0,
  join_code TEXT UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('student', 'teacher', 'admin')),
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
  onboarding_done INTEGER NOT NULL DEFAULT 0,
  prefs TEXT NOT NULL DEFAULT '{}',
  xp INTEGER NOT NULL DEFAULT 0,
  school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
  external_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  id_token TEXT
);

-- Laufende Anmeldungen über VIDIS (OpenID Connect), nur wenige Minuten gültig
CREATE TABLE IF NOT EXISTS oidc_states (
  state TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  verifier TEXT NOT NULL,
  browser TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS texts (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  builtin_key TEXT UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS grading_schemes (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  error_penalty INTEGER NOT NULL DEFAULT 0,
  thresholds TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('exercise', 'test')),
  title TEXT NOT NULL,
  text_id INTEGER NOT NULL REFERENCES texts(id) ON DELETE CASCADE,
  duration_sec INTEGER,
  error_mode TEXT NOT NULL DEFAULT 'continue',
  due_at INTEGER,
  grading_scheme_id INTEGER REFERENCES grading_schemes(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignment_id INTEGER REFERENCES assignments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  gross_chars INTEGER NOT NULL,
  correct_chars INTEGER NOT NULL,
  errors INTEGER NOT NULL,
  corrected_errors INTEGER NOT NULL DEFAULT 0,
  apm REAL NOT NULL,
  wpm REAL NOT NULL,
  error_rate REAL NOT NULL,
  completed INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS results_user ON results(user_id, created_at);
CREATE INDEX IF NOT EXISTS results_assignment ON results(assignment_id);

CREATE TABLE IF NOT EXISTS test_attempts (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  started_at INTEGER NOT NULL,
  submitted_at INTEGER,
  PRIMARY KEY (user_id, assignment_id)
);

CREATE TABLE IF NOT EXISTS plns (
  id INTEGER PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  sources TEXT NOT NULL DEFAULT '[]',
  format TEXT NOT NULL DEFAULT 'lines',
  return_rule TEXT NOT NULL DEFAULT 'first',
  grading_scheme_id INTEGER REFERENCES grading_schemes(id) ON DELETE SET NULL,
  note1_chars INTEGER NOT NULL,
  settings TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pln_attempts (
  pln_id INTEGER NOT NULL REFERENCES plns(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at INTEGER NOT NULL,
  typed TEXT NOT NULL DEFAULT '',
  saved_at INTEGER,
  submitted_at INTEGER,
  left_count INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  PRIMARY KEY (pln_id, user_id)
);

-- Je PLN und Person: Nachteilsausgleich (LRS/Legasthenie) und Zehn-Finger-System nicht angewendet (Note 6)
CREATE TABLE IF NOT EXISTS pln_flags (
  pln_id INTEGER NOT NULL REFERENCES plns(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lrs INTEGER NOT NULL DEFAULT 0,
  no_touch INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (pln_id, user_id)
);

CREATE TABLE IF NOT EXISTS key_stats (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ch TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  misses INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, ch)
);

CREATE TABLE IF NOT EXISTS course_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  best_apm REAL NOT NULL DEFAULT 0,
  best_error_rate REAL,
  stars INTEGER NOT NULL DEFAULT 0,
  passed_at INTEGER,
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS error_pairs (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expected TEXT NOT NULL,
  typed TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, expected, typed)
);

CREATE TABLE IF NOT EXISTS error_words (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, word)
);

CREATE TABLE IF NOT EXISTS badges (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge TEXT NOT NULL,
  earned_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, badge)
);
`;

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  migrate(db);
  seedTexts(db);
  return db;
}

// Spalten, die nach der ersten Version dazugekommen sind
function migrate(db) {
  const has = (table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
  if (!has('pln_attempts', 'left_count')) db.exec('ALTER TABLE pln_attempts ADD COLUMN left_count INTEGER NOT NULL DEFAULT 0');
  if (!has('pln_attempts', 'duration_ms')) db.exec('ALTER TABLE pln_attempts ADD COLUMN duration_ms INTEGER');
  if (!has('plns', 'settings')) db.exec('ALTER TABLE plns ADD COLUMN settings TEXT');
  if (!has('users', 'school_id')) db.exec('ALTER TABLE users ADD COLUMN school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE');
  if (!has('users', 'external_id')) db.exec('ALTER TABLE users ADD COLUMN external_id TEXT');
  if (!has('classes', 'join_code')) db.exec('ALTER TABLE classes ADD COLUMN join_code TEXT');
  if (!has('sessions', 'id_token')) db.exec('ALTER TABLE sessions ADD COLUMN id_token TEXT');
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_external ON users(external_id) WHERE external_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS classes_join_code ON classes(join_code) WHERE join_code IS NOT NULL;
    CREATE INDEX IF NOT EXISTS users_school ON users(school_id);
  `);
  // Bestehende Installation mit einer Schule: Schuldaten aus den Einstellungen in die Tabelle schools übernehmen.
  const hasUsers = db.prepare('SELECT 1 FROM users LIMIT 1').get();
  if (hasUsers && !getSetting(db, 'mode')) {
    tx(db, () => {
      const r = db
        .prepare('INSERT INTO schools (name, year_end, privacy_note, last_purge, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(getSetting(db, 'school_name', 'Meine Schule'), getSetting(db, 'year_end', '07-31'), getSetting(db, 'privacy_note', ''), Number(getSetting(db, 'last_purge', '0')), Date.now());
      db.prepare('UPDATE users SET school_id = ? WHERE school_id IS NULL').run(Number(r.lastInsertRowid));
      setSetting(db, 'mode', 'single');
    });
  }
}

export const isMulti = (db) => getSetting(db, 'mode') === 'multi';

function seedTexts(db) {
  const insert = db.prepare(
    'INSERT INTO texts (title, content, builtin_key, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(builtin_key) DO UPDATE SET title = excluded.title, content = excluded.content'
  );
  for (const t of BUILTIN_TEXTS) insert.run(t.title, t.content, t.key, Date.now());
}

export function getSetting(db, key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(db, key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
}

export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
