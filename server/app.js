import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSetting, setSetting, tx } from './db.js';
import {
  COOKIE,
  cookieOptions,
  createSession,
  generatePassword,
  generateUsername,
  hashPassword,
  sessionUser,
  slugify,
  verifyPassword,
} from './auth.js';
import { BADGES, levelFor, newBadges } from './gamify.js';
import { compareTyped, metrics, normalizeChar, normalizeText, suggestGrade } from '../public/js/scoring.js';
import { nextPurgeDate } from './retention.js';
import { createDemo, hasDemo, removeDemo, DEMO_PASSWORD } from './demo.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const COUNTDOWN_MS = 3000;
const GRACE_MS = 5000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (msg) => new HttpError(400, msg);
const notFound = () => new HttpError(404, 'Nicht gefunden.');
const forbidden = () => new HttpError(403, 'Keine Berechtigung.');

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function str(v, { max = 200, min = 1, name = 'Feld' } = {}) {
  if (typeof v !== 'string') throw bad(`${name} fehlt.`);
  const s = v.trim();
  if (s.length < min) throw bad(`${name} ist zu kurz.`);
  if (s.length > max) throw bad(`${name} ist zu lang.`);
  return s;
}

function int(v, { min = 0, max = 1e9, name = 'Wert' } = {}) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${name} ist ungültig.`);
  return n;
}

export function createApp(db, { secureCookies = false } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy':
        "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    next();
  });

  app.use(express.static(PUBLIC_DIR, { index: 'index.html', maxAge: 0 }));
  app.use('/api', express.json({ limit: '200kb' }));

  // Nur JSON-Anfragen für schreibende Zugriffe: zusammen mit SameSite=Strict schützt das vor CSRF.
  app.use('/api', (req, res, next) => {
    const hasBody = Number(req.headers['content-length'] || 0) > 0 || req.headers['transfer-encoding'];
    if (!['GET', 'HEAD', 'DELETE'].includes(req.method) && !req.is('application/json') && hasBody) {
      return next(new HttpError(415, 'Nur JSON wird akzeptiert.'));
    }
    req.user = sessionUser(db, parseCookies(req.headers.cookie)[COOKIE]);
    next();
  });

  const auth = (...roles) => (req, res, next) => {
    if (!req.user) return next(new HttpError(401, 'Bitte anmelden.'));
    if (roles.length && !roles.includes(req.user.role)) return next(forbidden());
    next();
  };

  // ---------- Einrichtung und Anmeldung ----------

  app.get('/api/setup', (req, res) => {
    const admins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n;
    res.json({
      needsSetup: admins === 0,
      schoolName: getSetting(db, 'school_name', 'QWERTZ Ninja'),
      privacyNote: getSetting(db, 'privacy_note', ''),
    });
  });

  app.post('/api/setup', (req, res) => {
    if (db.prepare("SELECT 1 FROM users WHERE role = 'admin'").get()) throw forbidden();
    const username = str(req.body.username, { max: 40, min: 3, name: 'Benutzername' });
    const password = str(req.body.password, { max: 200, min: 10, name: 'Passwort' });
    const schoolName = str(req.body.schoolName, { max: 120, name: 'Schulname' });
    tx(db, () => {
      if (db.prepare("SELECT 1 FROM users WHERE role = 'admin'").get()) throw forbidden();
      db.prepare("INSERT INTO users (role, username, display_name, password_hash, created_at) VALUES ('admin', ?, ?, ?, ?)").run(
        username,
        username,
        hashPassword(password),
        Date.now()
      );
      setSetting(db, 'school_name', schoolName);
    });
    res.json({ ok: true });
  });

  const loginAttempts = new Map();
  app.post('/api/login', (req, res) => {
    const key = `${req.ip}|${String(req.body.username).toLowerCase()}`;
    const a = loginAttempts.get(key) || { n: 0, until: 0 };
    if (a.until > Date.now()) throw new HttpError(429, 'Zu viele Versuche. Bitte eine Minute warten.');
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(req.body.username || '').trim());
    if (!user || !verifyPassword(String(req.body.password || ''), user.password_hash)) {
      a.n++;
      if (a.n >= 5) Object.assign(a, { n: 0, until: Date.now() + 60000 });
      loginAttempts.set(key, a);
      throw new HttpError(401, 'Benutzername oder Passwort ist falsch.');
    }
    loginAttempts.delete(key);
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    res.cookie(COOKIE, createSession(db, user.id), cookieOptions(secureCookies));
    res.json({ ok: true });
  });

  app.post('/api/logout', (req, res) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  app.post('/api/me/password', auth('teacher', 'admin'), (req, res) => {
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!verifyPassword(String(req.body.current || ''), row.password_hash)) throw bad('Das aktuelle Passwort ist falsch.');
    const next = str(req.body.next, { min: 10, name: 'Neues Passwort' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), req.user.id);
    res.json({ ok: true });
  });

  // ---------- Eigenes Profil ----------

  app.get('/api/me', auth(), (req, res) => {
    const u = req.user;
    const badges = db.prepare('SELECT badge, earned_at FROM badges WHERE user_id = ? ORDER BY earned_at').all(u.id);
    const cls = u.class_id ? db.prepare('SELECT id, name, leaderboard_enabled FROM classes WHERE id = ?').get(u.class_id) : null;
    res.json({
      id: u.id,
      role: u.role,
      username: u.username,
      displayName: u.display_name,
      onboardingDone: !!u.onboarding_done,
      prefs: { errorMode: 'continue', keyboard: true, metric: 'apm', ...JSON.parse(u.prefs) },
      level: levelFor(u.xp),
      badges: badges.map((b) => ({ id: b.badge, ...BADGES[b.badge], earnedAt: b.earned_at })),
      allBadges: Object.entries(BADGES).map(([id, b]) => ({ id, ...b })),
      class: cls && { id: cls.id, name: cls.name, leaderboard: !!cls.leaderboard_enabled },
      schoolName: getSetting(db, 'school_name', 'QWERTZ Ninja'),
      purgeDate: nextPurgeDate(db).toISOString().slice(0, 10),
    });
  });

  app.patch('/api/me/prefs', auth(), (req, res) => {
    const prefs = JSON.parse(req.user.prefs);
    const b = req.body;
    if (b.errorMode !== undefined) {
      if (!['continue', 'correct'].includes(b.errorMode)) throw bad('Ungültiger Fehlermodus.');
      prefs.errorMode = b.errorMode;
    }
    if (b.keyboard !== undefined) prefs.keyboard = !!b.keyboard;
    if (b.metric !== undefined) {
      if (!['apm', 'wpm'].includes(b.metric)) throw bad('Ungültige Kennzahl.');
      prefs.metric = b.metric;
    }
    db.prepare('UPDATE users SET prefs = ? WHERE id = ?').run(JSON.stringify(prefs), req.user.id);
    res.json(prefs);
  });

  app.get('/api/me/results', auth(), (req, res) => {
    const rows = db
      .prepare(
        `SELECT r.id, r.kind, r.duration_ms, r.gross_chars, r.correct_chars, r.errors, r.apm, r.wpm, r.error_rate, r.created_at,
                a.title AS assignment_title
         FROM results r LEFT JOIN assignments a ON a.id = r.assignment_id
         WHERE r.user_id = ? AND r.completed = 1 ORDER BY r.created_at DESC LIMIT 100`
      )
      .all(req.user.id);
    res.json(rows);
  });

  app.get('/api/me/weak-keys', auth(), (req, res) => {
    res.json(weakKeys(db, req.user.id));
  });

  // ---------- Texte ----------

  function visibleTextsFor(user) {
    if (user.role === 'student') {
      const cls = user.class_id && db.prepare('SELECT teacher_id FROM classes WHERE id = ?').get(user.class_id);
      return db
        .prepare('SELECT id, title, owner_id, length(content) AS length FROM texts WHERE owner_id IS NULL OR owner_id = ? ORDER BY owner_id IS NOT NULL DESC, title')
        .all(cls ? cls.teacher_id : -1);
    }
    return db
      .prepare('SELECT id, title, owner_id, length(content) AS length FROM texts WHERE owner_id IS NULL OR owner_id = ? ORDER BY owner_id IS NOT NULL DESC, title')
      .all(user.id);
  }

  app.get('/api/texts', auth(), (req, res) => {
    res.json(visibleTextsFor(req.user).map((t) => ({ ...t, own: t.owner_id !== null })));
  });

  app.get('/api/texts/:id', auth(), (req, res) => {
    const id = int(req.params.id);
    if (!visibleTextsFor(req.user).some((t) => t.id === id)) throw notFound();
    res.json(db.prepare('SELECT id, title, content, owner_id FROM texts WHERE id = ?').get(id));
  });

  app.post('/api/texts', auth('teacher'), (req, res) => {
    const title = str(req.body.title, { max: 120, name: 'Titel' });
    const content = normalizeText(str(req.body.content, { max: 20000, min: 20, name: 'Text' }));
    const r = db.prepare('INSERT INTO texts (title, content, owner_id, created_at) VALUES (?, ?, ?, ?)').run(title, content, req.user.id, Date.now());
    res.json({ id: Number(r.lastInsertRowid) });
  });

  app.put('/api/texts/:id', auth('teacher'), (req, res) => {
    const id = int(req.params.id);
    const title = str(req.body.title, { max: 120, name: 'Titel' });
    const content = normalizeText(str(req.body.content, { max: 20000, min: 20, name: 'Text' }));
    const r = db.prepare('UPDATE texts SET title = ?, content = ? WHERE id = ? AND owner_id = ?').run(title, content, id, req.user.id);
    if (!r.changes) throw notFound();
    res.json({ ok: true });
  });

  app.delete('/api/texts/:id', auth('teacher'), (req, res) => {
    const r = db.prepare('DELETE FROM texts WHERE id = ? AND owner_id = ?').run(int(req.params.id), req.user.id);
    if (!r.changes) throw notFound();
    res.json({ ok: true });
  });

  // ---------- Ergebnisse von Übungen ----------

  const KINDS = ['text', 'words', 'weak', 'basics', 'exercise'];

  app.post('/api/results', auth('student'), (req, res) => {
    const b = req.body;
    const kind = String(b.kind);
    if (!KINDS.includes(kind)) throw bad('Ungültige Übungsart.');
    let assignmentId = null;
    if (kind === 'exercise') {
      const a = db.prepare("SELECT id FROM assignments WHERE id = ? AND class_id = ? AND type = 'exercise'").get(int(b.assignmentId), req.user.class_id);
      if (!a) throw notFound();
      assignmentId = a.id;
    }
    const durationMs = int(b.durationMs, { min: 1, max: 3 * 3600e3, name: 'Dauer' });
    const gross = int(b.gross, { max: 100000, name: 'Anschläge' });
    const correct = int(b.correct, { max: gross, name: 'Richtige Anschläge' });
    const errors = int(b.errors, { max: 100000, name: 'Fehler' });
    const correctedErrors = int(b.correctedErrors ?? 0, { max: 100000, name: 'Korrekturen' });
    const completed = b.completed !== false;
    const m = metrics({ gross, correct, errors, durationMs });
    // Mehr als 1.500 Anschläge pro Minute schafft niemand: dann stimmt etwas mit den Daten nicht.
    if (m.apm > 1500) throw bad('Ergebnis ist nicht plausibel.');

    const out = tx(db, () => {
      db.prepare(
        `INSERT INTO results (user_id, assignment_id, kind, duration_ms, gross_chars, correct_chars, errors, corrected_errors, apm, wpm, error_rate, completed, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(req.user.id, assignmentId, kind, durationMs, gross, correct, errors, correctedErrors, m.apm, m.wpm, m.errorRate, completed ? 1 : 0, Date.now());
      recordKeyStats(db, req.user.id, b.keyStats);
      if (kind === 'basics') db.prepare('UPDATE users SET onboarding_done = 1 WHERE id = ?').run(req.user.id);
      return award(req.user, { kind, gross, correct, errors, durationMs, completed, ...m });
    });
    res.json({ ...m, ...out });
  });

  function award(user, r) {
    const xpGain = r.completed ? Math.round((r.correct / 10) * (r.errorRate > 10 ? 0.5 : 1)) : 0;
    const before = levelFor(user.xp);
    db.prepare('UPDATE users SET xp = xp + ? WHERE id = ?').run(xpGain, user.id);
    const after = levelFor(user.xp + xpGain);
    const badges = newBadges(db, user.id, r).map((id) => ({ id, ...BADGES[id] }));
    return { xpGain, level: after, levelUp: after.level > before.level, newBadges: badges };
  }

  // ---------- Aufgaben aus Sicht der Lernenden ----------

  app.get('/api/me/assignments', auth('student'), (req, res) => {
    const rows = db
      .prepare(
        `SELECT a.id, a.type, a.title, a.duration_sec, a.error_mode, a.due_at, a.created_at, t.title AS text_title,
           (SELECT COUNT(*) FROM results r WHERE r.assignment_id = a.id AND r.user_id = ? AND r.completed = 1) AS done,
           (SELECT started_at FROM test_attempts ta WHERE ta.assignment_id = a.id AND ta.user_id = ?) AS started_at
         FROM assignments a JOIN texts t ON t.id = a.text_id
         WHERE a.class_id = ? ORDER BY a.created_at DESC`
      )
      .all(req.user.id, req.user.id, req.user.class_id ?? -1);
    res.json(rows.map((r) => ({ ...r, done: r.done > 0 || (r.type === 'test' && r.started_at !== null) })));
  });

  app.get('/api/me/assignments/:id', auth('student'), (req, res) => {
    const a = db
      .prepare('SELECT a.id, a.type, a.title, a.duration_sec, a.error_mode, a.due_at, a.text_id FROM assignments a WHERE a.id = ? AND a.class_id = ?')
      .get(int(req.params.id), req.user.class_id ?? -1);
    if (!a) throw notFound();
    // Den Testtext gibt es erst beim Start, damit niemand vorher üben kann.
    if (a.type === 'exercise') a.text = db.prepare('SELECT content FROM texts WHERE id = ?').get(a.text_id).content;
    delete a.text_id;
    res.json(a);
  });

  // ---------- Tests ----------

  app.post('/api/tests/:id/start', auth('student'), (req, res) => {
    const a = db
      .prepare("SELECT a.*, t.content FROM assignments a JOIN texts t ON t.id = a.text_id WHERE a.id = ? AND a.class_id = ? AND a.type = 'test'")
      .get(int(req.params.id), req.user.class_id ?? -1);
    if (!a) throw notFound();
    if (a.due_at && a.due_at < Date.now()) throw bad('Der Test ist bereits abgelaufen.');
    const startedAt = Date.now() + COUNTDOWN_MS;
    try {
      db.prepare('INSERT INTO test_attempts (user_id, assignment_id, started_at) VALUES (?, ?, ?)').run(req.user.id, a.id, startedAt);
    } catch {
      throw bad('Diesen Test hast du schon begonnen. Deine Lehrkraft kann ihn bei Bedarf zurücksetzen.');
    }
    res.json({ text: a.content, durationSec: a.duration_sec, countdownMs: COUNTDOWN_MS });
  });

  app.post('/api/tests/:id/submit', auth('student'), (req, res) => {
    const id = int(req.params.id);
    const a = db
      .prepare("SELECT a.*, t.content FROM assignments a JOIN texts t ON t.id = a.text_id WHERE a.id = ? AND a.class_id = ? AND a.type = 'test'")
      .get(id, req.user.class_id ?? -1);
    if (!a) throw notFound();
    const attempt = db.prepare('SELECT * FROM test_attempts WHERE user_id = ? AND assignment_id = ?').get(req.user.id, id);
    if (!attempt) throw bad('Der Test wurde nicht gestartet.');
    if (attempt.submitted_at) throw bad('Der Test wurde bereits abgegeben.');
    const limitMs = a.duration_sec * 1000;
    const elapsed = Date.now() - attempt.started_at;
    if (elapsed > limitMs + GRACE_MS * 6) throw bad('Die Abgabe kam zu spät und wurde nicht gewertet.');
    const target = normalizeText(a.content);
    const typed = Array.from(String(req.body.typed ?? '')).map(normalizeChar).join('').slice(0, target.length);
    const durationMs = Math.max(1000, Math.min(elapsed, limitMs));
    const cmp = compareTyped(target, typed);
    const m = metrics({ ...cmp, durationMs });

    const out = tx(db, () => {
      db.prepare('UPDATE test_attempts SET submitted_at = ? WHERE user_id = ? AND assignment_id = ?').run(Date.now(), req.user.id, id);
      db.prepare(
        `INSERT INTO results (user_id, assignment_id, kind, duration_ms, gross_chars, correct_chars, errors, corrected_errors, apm, wpm, error_rate, completed, created_at)
         VALUES (?, ?, 'test', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
      ).run(req.user.id, id, durationMs, cmp.gross, cmp.correct, cmp.errors, int(req.body.correctedErrors ?? 0, { max: 100000 }), m.apm, m.wpm, m.errorRate, Date.now());
      recordKeyStats(db, req.user.id, req.body.keyStats);
      return award(req.user, { kind: 'test', ...cmp, durationMs, completed: true, ...m });
    });
    res.json({ ...cmp, durationMs, ...m, ...out });
  });

  // ---------- Rangliste ----------

  app.get('/api/leaderboard', auth('student'), (req, res) => {
    const cls = req.user.class_id && db.prepare('SELECT leaderboard_enabled FROM classes WHERE id = ?').get(req.user.class_id);
    if (!cls || !cls.leaderboard_enabled) return res.json({ enabled: false, rows: [] });
    const rows = db
      .prepare(
        `SELECT u.id, u.display_name, u.xp, MAX(r.apm) AS best_apm, MAX(r.wpm) AS best_wpm
         FROM users u LEFT JOIN results r ON r.user_id = u.id AND r.completed = 1 AND r.created_at > ?
           AND (r.duration_ms >= 60000 OR r.gross_chars >= 200) AND r.error_rate <= 5
         WHERE u.class_id = ? GROUP BY u.id ORDER BY best_apm DESC NULLS LAST, u.xp DESC`
      )
      .all(Date.now() - 7 * 864e5, req.user.class_id);
    res.json({
      enabled: true,
      rows: rows.map((r) => ({ name: r.display_name, me: r.id === req.user.id, bestApm: r.best_apm, bestWpm: r.best_wpm, level: levelFor(r.xp) })),
    });
  });

  // ---------- Lehrkräfte: Klassen und Schüler ----------

  function ownClass(req, id = req.params.id) {
    const cls = db.prepare('SELECT * FROM classes WHERE id = ? AND teacher_id = ?').get(int(id), req.user.id);
    if (!cls) throw notFound();
    return cls;
  }

  function ownStudent(req) {
    const s = db
      .prepare("SELECT u.* FROM users u JOIN classes c ON c.id = u.class_id WHERE u.id = ? AND u.role = 'student' AND c.teacher_id = ?")
      .get(int(req.params.id), req.user.id);
    if (!s) throw notFound();
    return s;
  }

  app.get('/api/classes', auth('teacher'), (req, res) => {
    res.json(
      db
        .prepare(
          `SELECT c.id, c.name, c.leaderboard_enabled, (SELECT COUNT(*) FROM users u WHERE u.class_id = c.id) AS students
           FROM classes c WHERE c.teacher_id = ? ORDER BY c.name`
        )
        .all(req.user.id)
    );
  });

  app.post('/api/classes', auth('teacher'), (req, res) => {
    const name = str(req.body.name, { max: 40, name: 'Klassenname' });
    const r = db.prepare('INSERT INTO classes (name, teacher_id, created_at) VALUES (?, ?, ?)').run(name, req.user.id, Date.now());
    res.json({ id: Number(r.lastInsertRowid) });
  });

  app.patch('/api/classes/:id', auth('teacher'), (req, res) => {
    const cls = ownClass(req);
    const name = req.body.name !== undefined ? str(req.body.name, { max: 40, name: 'Klassenname' }) : cls.name;
    const lb = req.body.leaderboard !== undefined ? (req.body.leaderboard ? 1 : 0) : cls.leaderboard_enabled;
    db.prepare('UPDATE classes SET name = ?, leaderboard_enabled = ? WHERE id = ?').run(name, lb, cls.id);
    res.json({ ok: true });
  });

  app.delete('/api/classes/:id', auth('teacher'), (req, res) => {
    const cls = ownClass(req);
    tx(db, () => {
      db.prepare('DELETE FROM users WHERE class_id = ?').run(cls.id);
      db.prepare('DELETE FROM classes WHERE id = ?').run(cls.id);
    });
    res.json({ ok: true });
  });

  app.get('/api/classes/:id', auth('teacher'), (req, res) => {
    const cls = ownClass(req);
    const students = db
      .prepare(
        `SELECT u.id, u.username, u.display_name, u.xp, u.onboarding_done,
           COUNT(r.id) AS runs, ROUND(AVG(r.apm), 1) AS avg_apm, ROUND(AVG(r.error_rate), 2) AS avg_error_rate, MAX(r.created_at) AS last_active
         FROM users u LEFT JOIN results r ON r.user_id = u.id AND r.completed = 1
         WHERE u.class_id = ? GROUP BY u.id ORDER BY u.display_name`
      )
      .all(cls.id);
    res.json({
      id: cls.id,
      name: cls.name,
      leaderboard: !!cls.leaderboard_enabled,
      students: students.map((s) => ({ ...s, level: levelFor(s.xp) })),
    });
  });

  app.post('/api/classes/:id/students', auth('teacher'), (req, res) => {
    const cls = ownClass(req);
    const count = int(req.body.count, { min: 1, max: 40, name: 'Anzahl' });
    const slug = slugify(cls.name);
    const created = tx(db, () => {
      const out = [];
      for (let i = 0; i < count; i++) {
        const username = generateUsername(db, slug);
        const password = generatePassword();
        const animal = username.split('-')[1];
        const displayName = `${animal[0].toUpperCase()}${animal.slice(1)} ${username.split('-')[2]}`;
        db.prepare("INSERT INTO users (role, username, display_name, password_hash, class_id, created_at) VALUES ('student', ?, ?, ?, ?, ?)").run(
          username,
          displayName,
          hashPassword(password),
          cls.id,
          Date.now()
        );
        out.push({ username, password, displayName });
      }
      return out;
    });
    res.json({ className: cls.name, credentials: created });
  });

  app.post('/api/students/:id/reset-password', auth('teacher'), (req, res) => {
    const s = ownStudent(req);
    const password = generatePassword();
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), s.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(s.id);
    const cls = db.prepare('SELECT name FROM classes WHERE id = ?').get(s.class_id);
    res.json({ className: cls.name, credentials: [{ username: s.username, password, displayName: s.display_name }] });
  });

  app.delete('/api/students/:id', auth('teacher'), (req, res) => {
    const s = ownStudent(req);
    db.prepare('DELETE FROM users WHERE id = ?').run(s.id);
    res.json({ ok: true });
  });

  app.get('/api/students/:id/results', auth('teacher'), (req, res) => {
    const s = ownStudent(req);
    const rows = db
      .prepare(
        `SELECT r.kind, r.duration_ms, r.gross_chars, r.correct_chars, r.errors, r.apm, r.wpm, r.error_rate, r.created_at, a.title AS assignment_title
         FROM results r LEFT JOIN assignments a ON a.id = r.assignment_id WHERE r.user_id = ? AND r.completed = 1 ORDER BY r.created_at DESC LIMIT 200`
      )
      .all(s.id);
    res.json({ displayName: s.display_name, username: s.username, results: rows, weakKeys: weakKeys(db, s.id) });
  });

  // ---------- Lehrkräfte: Notenschlüssel ----------

  app.get('/api/grading-schemes', auth('teacher'), (req, res) => {
    const rows = db.prepare('SELECT * FROM grading_schemes WHERE teacher_id = ? ORDER BY name').all(req.user.id);
    res.json(rows.map((r) => ({ ...r, thresholds: JSON.parse(r.thresholds) })));
  });

  app.post('/api/grading-schemes', auth('teacher'), (req, res) => {
    const name = str(req.body.name, { max: 80, name: 'Name' });
    const penalty = int(req.body.errorPenalty ?? 0, { max: 1000, name: 'Fehlerabzug' });
    const th = req.body.thresholds;
    if (!Array.isArray(th) || th.length !== 5) throw bad('Bitte für die Noten 1 bis 5 je eine Mindestzahl angeben.');
    const nums = th.map((v, i) => int(v, { max: 2000, name: `Schwelle für Note ${i + 1}` }));
    for (let i = 1; i < 5; i++) if (nums[i] > nums[i - 1]) throw bad('Die Schwellen müssen von Note 1 bis 5 absteigen.');
    const r = db
      .prepare('INSERT INTO grading_schemes (teacher_id, name, error_penalty, thresholds, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.id, name, penalty, JSON.stringify(nums), Date.now());
    res.json({ id: Number(r.lastInsertRowid) });
  });

  app.delete('/api/grading-schemes/:id', auth('teacher'), (req, res) => {
    const r = db.prepare('DELETE FROM grading_schemes WHERE id = ? AND teacher_id = ?').run(int(req.params.id), req.user.id);
    if (!r.changes) throw notFound();
    res.json({ ok: true });
  });

  // ---------- Lehrkräfte: Aufgaben und Tests ----------

  app.get('/api/classes/:id/assignments', auth('teacher'), (req, res) => {
    const cls = ownClass(req);
    res.json(
      db
        .prepare(
          `SELECT a.*, t.title AS text_title, g.name AS scheme_name,
             (SELECT COUNT(DISTINCT r.user_id) FROM results r WHERE r.assignment_id = a.id AND r.completed = 1) AS done
           FROM assignments a JOIN texts t ON t.id = a.text_id LEFT JOIN grading_schemes g ON g.id = a.grading_scheme_id
           WHERE a.class_id = ? ORDER BY a.created_at DESC`
        )
        .all(cls.id)
    );
  });

  app.post('/api/classes/:id/assignments', auth('teacher'), (req, res) => {
    const cls = ownClass(req);
    const b = req.body;
    const type = b.type === 'test' ? 'test' : 'exercise';
    const title = str(b.title, { max: 120, name: 'Titel' });
    const textId = int(b.textId, { min: 1, name: 'Text' });
    if (!visibleTextsFor(req.user).some((t) => t.id === textId)) throw bad('Text nicht gefunden.');
    const due = b.dueAt ? Date.parse(b.dueAt) : null;
    if (b.dueAt && Number.isNaN(due)) throw bad('Ungültige Frist.');
    let duration = null;
    let scheme = null;
    if (type === 'test') {
      duration = int(b.durationSec, { min: 30, max: 3600, name: 'Dauer' });
      if (b.gradingSchemeId) {
        scheme = int(b.gradingSchemeId);
        if (!db.prepare('SELECT 1 FROM grading_schemes WHERE id = ? AND teacher_id = ?').get(scheme, req.user.id)) throw bad('Notenschlüssel nicht gefunden.');
      }
    }
    const errorMode = type === 'test' ? 'free' : ['continue', 'correct', 'choice'].includes(b.errorMode) ? b.errorMode : 'choice';
    const r = db
      .prepare(
        'INSERT INTO assignments (class_id, type, title, text_id, duration_sec, error_mode, due_at, grading_scheme_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(cls.id, type, title, textId, duration, errorMode, due, scheme, Date.now());
    res.json({ id: Number(r.lastInsertRowid) });
  });

  function ownAssignment(req) {
    const a = db
      .prepare('SELECT a.* FROM assignments a JOIN classes c ON c.id = a.class_id WHERE a.id = ? AND c.teacher_id = ?')
      .get(int(req.params.id), req.user.id);
    if (!a) throw notFound();
    return a;
  }

  app.delete('/api/assignments/:id', auth('teacher'), (req, res) => {
    const a = ownAssignment(req);
    db.prepare('DELETE FROM assignments WHERE id = ?').run(a.id);
    res.json({ ok: true });
  });

  app.get('/api/assignments/:id/results', auth('teacher'), (req, res) => {
    const a = ownAssignment(req);
    const scheme = a.grading_scheme_id && db.prepare('SELECT * FROM grading_schemes WHERE id = ?').get(a.grading_scheme_id);
    const rows = db
      .prepare(
        `SELECT u.id AS user_id, u.display_name, u.username, ta.started_at, ta.submitted_at,
           r.duration_ms, r.gross_chars, r.correct_chars, r.errors, r.apm, r.wpm, r.error_rate, r.created_at
         FROM users u
         LEFT JOIN test_attempts ta ON ta.user_id = u.id AND ta.assignment_id = ?
         LEFT JOIN results r ON r.id = (SELECT id FROM results WHERE user_id = u.id AND assignment_id = ? AND completed = 1 ORDER BY apm DESC LIMIT 1)
         WHERE u.class_id = ? ORDER BY u.display_name`
      )
      .all(a.id, a.id, a.class_id);
    res.json({
      assignment: { ...a, scheme: scheme ? { ...scheme, thresholds: JSON.parse(scheme.thresholds) } : null },
      rows: rows.map((r) => ({
        ...r,
        grade:
          scheme && r.duration_ms != null
            ? suggestGrade(scheme, { correct: r.correct_chars, errors: r.errors, durationMs: r.duration_ms })
            : null,
      })),
    });
  });

  app.delete('/api/assignments/:id/attempts/:userId', auth('teacher'), (req, res) => {
    const a = ownAssignment(req);
    const userId = int(req.params.userId);
    tx(db, () => {
      db.prepare('DELETE FROM test_attempts WHERE assignment_id = ? AND user_id = ?').run(a.id, userId);
      db.prepare('DELETE FROM results WHERE assignment_id = ? AND user_id = ?').run(a.id, userId);
    });
    res.json({ ok: true });
  });

  app.get('/api/classes/:id/export.csv', auth('teacher'), (req, res) => {
    const cls = ownClass(req);
    const rows = db
      .prepare(
        `SELECT u.display_name, u.username, r.created_at, r.kind, a.title, r.duration_ms, r.gross_chars, r.correct_chars, r.errors, r.apm, r.wpm, r.error_rate,
           a.grading_scheme_id
         FROM results r JOIN users u ON u.id = r.user_id LEFT JOIN assignments a ON a.id = r.assignment_id
         WHERE u.class_id = ? AND r.completed = 1 ORDER BY u.display_name, r.created_at`
      )
      .all(cls.id);
    const schemes = new Map(db.prepare('SELECT * FROM grading_schemes WHERE teacher_id = ?').all(req.user.id).map((s) => [s.id, s]));
    const KIND = { text: 'Text', words: 'Wörter', weak: 'Schwachstellen', basics: 'Grundstellung', exercise: 'Aufgabe', test: 'Test' };
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const num = (n) => (n == null ? '' : String(n).replace('.', ','));
    const lines = [
      ['Pseudonym', 'Benutzername', 'Datum', 'Art', 'Aufgabe', 'Dauer (s)', 'Anschläge brutto', 'Anschläge richtig', 'Fehler', 'Anschläge/min netto', 'WPM', 'Fehlerquote (%)', 'Notenvorschlag'].join(';'),
    ];
    for (const r of rows) {
      const scheme = r.kind === 'test' && r.grading_scheme_id ? schemes.get(r.grading_scheme_id) : null;
      const g = scheme ? suggestGrade(scheme, { correct: r.correct_chars, errors: r.errors, durationMs: r.duration_ms }) : null;
      lines.push(
        [
          r.display_name,
          r.username,
          new Date(r.created_at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }),
          KIND[r.kind] ?? r.kind,
          r.title ?? '',
          num(Math.round(r.duration_ms / 1000)),
          r.gross_chars,
          r.correct_chars,
          r.errors,
          num(r.apm),
          num(r.wpm),
          num(r.error_rate),
          g ? g.grade : '',
        ]
          .map(esc)
          .join(';')
      );
    }
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="ergebnisse-${slugify(cls.name)}.csv"`);
    res.send('﻿' + lines.join('\r\n'));
  });

  // ---------- Admin ----------

  app.get('/api/admin/teachers', auth('admin'), (req, res) => {
    res.json(
      db
        .prepare(
          `SELECT u.id, u.username, u.display_name, (SELECT COUNT(*) FROM classes c WHERE c.teacher_id = u.id) AS classes
           FROM users u WHERE u.role = 'teacher' ORDER BY u.display_name`
        )
        .all()
    );
  });

  app.post('/api/admin/teachers', auth('admin'), (req, res) => {
    const username = str(req.body.username, { max: 40, min: 3, name: 'Benutzername' });
    if (!/^[\w.-]+$/.test(username)) throw bad('Benutzername darf nur Buchstaben, Ziffern, Punkt, Bindestrich und Unterstrich enthalten.');
    const displayName = str(req.body.displayName, { max: 80, name: 'Anzeigename' });
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw bad('Dieser Benutzername ist schon vergeben.');
    const password = generatePassword() + generatePassword();
    db.prepare("INSERT INTO users (role, username, display_name, password_hash, created_at) VALUES ('teacher', ?, ?, ?, ?)").run(
      username,
      displayName,
      hashPassword(password),
      Date.now()
    );
    res.json({ username, password });
  });

  app.post('/api/admin/teachers/:id/reset-password', auth('admin'), (req, res) => {
    const t = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'teacher'").get(int(req.params.id));
    if (!t) throw notFound();
    const password = generatePassword() + generatePassword();
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), t.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(t.id);
    res.json({ username: t.username, password });
  });

  app.delete('/api/admin/teachers/:id', auth('admin'), (req, res) => {
    const t = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'teacher'").get(int(req.params.id));
    if (!t) throw notFound();
    tx(db, () => {
      // Klassen und Schülerkonten der Lehrkraft gehen mit.
      for (const c of db.prepare('SELECT id FROM classes WHERE teacher_id = ?').all(t.id)) db.prepare('DELETE FROM users WHERE class_id = ?').run(c.id);
      db.prepare('DELETE FROM users WHERE id = ?').run(t.id);
    });
    res.json({ ok: true });
  });

  app.get('/api/admin/settings', auth('admin'), (req, res) => {
    res.json({
      schoolName: getSetting(db, 'school_name', ''),
      yearEnd: getSetting(db, 'year_end', '07-31'),
      privacyNote: getSetting(db, 'privacy_note', ''),
      nextPurge: nextPurgeDate(db).toISOString().slice(0, 10),
    });
  });

  app.put('/api/admin/settings', auth('admin'), (req, res) => {
    const schoolName = str(req.body.schoolName, { max: 120, name: 'Schulname' });
    const yearEnd = String(req.body.yearEnd || '');
    const m = /^(\d{2})-(\d{2})$/.exec(yearEnd);
    if (!m || +m[1] < 1 || +m[1] > 12 || +m[2] < 1 || +m[2] > 28) throw bad('Schuljahresende bitte als MM-TT angeben (Tag höchstens 28).');
    const privacyNote = typeof req.body.privacyNote === 'string' ? req.body.privacyNote.slice(0, 5000) : '';
    setSetting(db, 'school_name', schoolName);
    setSetting(db, 'year_end', yearEnd);
    setSetting(db, 'privacy_note', privacyNote);
    res.json({ ok: true, nextPurge: nextPurgeDate(db).toISOString().slice(0, 10) });
  });

  app.get('/api/admin/demo', auth('admin'), (req, res) => {
    res.json({ present: hasDemo(db), password: DEMO_PASSWORD });
  });

  app.post('/api/admin/demo', auth('admin'), (req, res) => {
    if (req.body.action === 'remove') {
      removeDemo(db);
      return res.json({ present: false });
    }
    if (req.body.action !== 'create') throw bad('Unbekannte Aktion.');
    res.json({ present: true, ...createDemo(db) });
  });

  // ---------- Fehlerbehandlung ----------

  app.use('/api', (req, res, next) => next(notFound()));
  app.use((err, req, res, next) => {
    const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Interner Fehler.' : err.message });
  });

  return app;
}

function recordKeyStats(db, userId, keyStats) {
  if (!keyStats || typeof keyStats !== 'object') return;
  const up = db.prepare(
    'INSERT INTO key_stats (user_id, ch, hits, misses) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, ch) DO UPDATE SET hits = hits + excluded.hits, misses = misses + excluded.misses'
  );
  let n = 0;
  for (const [ch, v] of Object.entries(keyStats)) {
    if (++n > 200) break;
    if (Array.from(ch).length !== 1 || !Array.isArray(v)) continue;
    const hits = Math.min(Math.max(0, Number(v[0]) | 0), 100000);
    const misses = Math.min(Math.max(0, Number(v[1]) | 0), 100000);
    if (hits || misses) up.run(userId, ch, hits, misses);
  }
}

// Zeichen mit der höchsten Fehlerquote (mindestens 10 Versuche, Leerzeichen ausgenommen).
export function weakKeys(db, userId, limit = 6) {
  return db
    .prepare(
      `SELECT ch, hits, misses, CAST(misses AS REAL) / (hits + misses) AS rate FROM key_stats
       WHERE user_id = ? AND hits + misses >= 10 AND misses > 0 AND ch != ' ' ORDER BY rate DESC LIMIT ?`
    )
    .all(userId, limit)
    .map((r) => ({ ch: r.ch, rate: Math.round(r.rate * 1000) / 10, total: r.hits + r.misses }));
}
