import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSetting, isMulti, setSetting, tx } from './db.js';
import {
  COOKIE,
  cookieOptions,
  createSession,
  generateJoinCode,
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
import { operatorRoutes } from './operator.js';
import { vidisRoutes, vidisConfigured } from './vidis.js';
import { createDemo, hasDemo, removeDemo, prefixFor, DEMO_PASSWORD } from './demo.js';
import { buildPlnText, evalRules, evaluatePln, gradePln, note1Chars, note1Position, plnHeading, plnSettings, templateLines, PLN_DURATION_MS, PLN_GRACE_MS, PLN_MAX_CHARS } from './pln.js';
import { durationMsFor, linesFor, normalizeSettings, strokes } from '../public/js/pln-rules.js';
import { writePlnPdf } from './pln-pdf.js';
import { LESSONS, lessonById, starsFor, PASS_ERROR_RATE, PASS_ERROR_RATE_MAX } from '../public/js/course.js';

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

export function createApp(db, { secureCookies = false, vidis = null } = {}) {
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
    // Im Mehrschulbetrieb ist der Admin ohne Schule der Betreiber.
    if (req.user && req.user.role === 'admin' && req.user.school_id == null) req.user.role = 'operator';
    // Lehrkraft in der Schüleransicht: Sie ist für den Server eine Schülerin der gewählten eigenen Klasse.
    // Ihr Konto selbst gehört keiner Klasse an, daher taucht sie in Listen und Auswertungen nicht auf.
    if (req.user?.role === 'teacher' && req.user.preview_class_id) {
      const cls = db.prepare('SELECT id, name FROM classes WHERE id = ? AND teacher_id = ?').get(req.user.preview_class_id, req.user.id);
      if (cls) Object.assign(req.user, { role: 'student', class_id: cls.id, preview: { classId: cls.id, className: cls.name } });
    }
    next();
  });

  const auth = (...roles) => (req, res, next) => {
    if (!req.user) return next(new HttpError(401, 'Bitte anmelden.'));
    if (roles.length && !roles.includes(req.user.role)) return next(forbidden());
    next();
  };

  // ---------- Schulen ----------

  const schoolById = (id) => (id == null ? null : db.prepare('SELECT * FROM schools WHERE id = ?').get(id));
  // Im Mehrschulbetrieb darf eine Schule erst loslegen, wenn der AVV unterschrieben vorliegt.
  const schoolActive = (school) => !!school && (!isMulti(db) || !!school.avv_signed_at);
  const brandName = () =>
    isMulti(db) ? getSetting(db, 'operator_name', 'QWERTZ Ninja') : db.prepare('SELECT name FROM schools ORDER BY id LIMIT 1').get()?.name || 'QWERTZ Ninja';

  // ---------- Einrichtung und Anmeldung ----------

  app.get('/api/setup', (req, res) => {
    const admins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n;
    const single = !isMulti(db) ? db.prepare('SELECT * FROM schools ORDER BY id LIMIT 1').get() : null;
    res.json({
      needsSetup: admins === 0,
      mode: isMulti(db) ? 'multi' : 'single',
      schoolName: isMulti(db) ? brandName() : single?.name || 'QWERTZ Ninja',
      privacyNote: single?.privacy_note || '',
      vidis: vidisConfigured(vidis) && isMulti(db),
    });
  });

  app.post('/api/setup', (req, res) => {
    if (db.prepare("SELECT 1 FROM users WHERE role = 'admin'").get()) throw forbidden();
    const username = str(req.body.username, { max: 40, min: 3, name: 'Benutzername' });
    const password = str(req.body.password, { max: 200, min: 10, name: 'Passwort' });
    const multi = req.body.mode === 'multi';
    const name = str(req.body.schoolName, { max: 120, name: multi ? 'Name des Angebots' : 'Schulname' });
    tx(db, () => {
      if (db.prepare("SELECT 1 FROM users WHERE role = 'admin'").get()) throw forbidden();
      let schoolId = null;
      if (multi) {
        setSetting(db, 'operator_name', name);
      } else {
        schoolId = Number(db.prepare('INSERT INTO schools (name, created_at) VALUES (?, ?)').run(name, Date.now()).lastInsertRowid);
      }
      setSetting(db, 'mode', multi ? 'multi' : 'single');
      db.prepare("INSERT INTO users (role, username, display_name, password_hash, school_id, created_at) VALUES ('admin', ?, ?, ?, ?, ?)").run(
        username,
        username,
        hashPassword(password),
        schoolId,
        Date.now()
      );
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
    if (user.school_id != null && user.role !== 'admin' && !schoolActive(schoolById(user.school_id))) {
      throw new HttpError(403, 'Deine Schule ist noch nicht freigeschaltet. Bitte wende dich an die Schulleitung.');
    }
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    res.cookie(COOKIE, createSession(db, user.id), cookieOptions(secureCookies));
    res.json({ ok: true });
  });

  const vidisApi = vidisRoutes(app, db, { config: vidis, secureCookies, HttpError, schoolById, schoolActive, fetchImpl: vidis?.fetch || fetch });

  app.post('/api/logout', async (req, res) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    const session = token && db.prepare('SELECT id_token FROM sessions WHERE token = ?').get(token);
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.clearCookie(COOKIE, { path: '/' });
    // Nach einer Anmeldung über VIDIS muss auch dort abgemeldet werden.
    res.json({ ok: true, redirect: session?.id_token ? await vidisApi.logoutUrl(session.id_token) : null });
  });

  app.post('/api/me/password', auth('teacher', 'admin', 'operator'), (req, res) => {
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!verifyPassword(String(req.body.current || ''), row.password_hash)) throw bad('Das aktuelle Passwort ist falsch.');
    const next = str(req.body.next, { min: 10, name: 'Neues Passwort' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), req.user.id);
    res.json({ ok: true });
  });

  // ---------- Schüleransicht für Lehrkräfte ----------

  // Tests und PLN aus der Schüleransicht gelten nicht: beim Wechsel verwerfen, damit sie wiederholbar sind.
  const discardPreviewAttempts = (userId) =>
    tx(db, () => {
      db.prepare('DELETE FROM test_attempts WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM pln_attempts WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM results WHERE user_id = ? AND assignment_id IS NOT NULL').run(userId);
    });

  // Auch in der Schüleransicht erlaubt, um die Klasse zu wechseln.
  app.post('/api/me/student-view', auth(), (req, res) => {
    if (req.user.role !== 'teacher' && !req.user.preview) throw forbidden();
    const cls = db.prepare('SELECT id FROM classes WHERE id = ? AND teacher_id = ?').get(int(req.body.classId, { min: 1, name: 'Klasse' }), req.user.id);
    if (!cls) throw bad('Lege zuerst eine Klasse an.');
    discardPreviewAttempts(req.user.id);
    db.prepare('UPDATE sessions SET preview_class_id = ? WHERE token = ?').run(cls.id, parseCookies(req.headers.cookie)[COOKIE]);
    res.json({ ok: true });
  });

  // Auch aus der Schüleransicht heraus erreichbar (dort ist die Rolle "student").
  app.delete('/api/me/student-view', auth(), (req, res) => {
    if (!req.user.preview) throw bad('Du bist nicht in der Schüleransicht.');
    discardPreviewAttempts(req.user.id);
    db.prepare('UPDATE sessions SET preview_class_id = NULL WHERE token = ?').run(parseCookies(req.headers.cookie)[COOKIE]);
    res.json({ ok: true });
  });

  // ---------- Eigenes Profil ----------

  app.get('/api/me', auth(), (req, res) => {
    const u = req.user;
    const badges = db.prepare('SELECT badge, earned_at FROM badges WHERE user_id = ? ORDER BY earned_at').all(u.id);
    const cls = u.class_id ? db.prepare('SELECT id, name, leaderboard_enabled FROM classes WHERE id = ?').get(u.class_id) : null;
    const school = schoolById(u.school_id);
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
      schoolName: school ? school.name : brandName(),
      purgeDate: school ? nextPurgeDate(school).toISOString().slice(0, 10) : null,
      mode: isMulti(db) ? 'multi' : 'single',
      schoolActive: school ? schoolActive(school) : true,
      vidis: !!u.external_id,
      preview: u.preview
        ? { ...u.preview, classes: db.prepare('SELECT id, name FROM classes WHERE teacher_id = ? ORDER BY name').all(u.id) }
        : null,
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

  const KINDS = ['text', 'words', 'weak', 'basics', 'exercise', 'course', 'focus'];

  app.post('/api/results', auth('student'), (req, res) => {
    const b = req.body;
    const kind = String(b.kind);
    if (!KINDS.includes(kind)) throw bad('Ungültige Übungsart.');
    let assignmentId = null;
    let lesson = null;
    if (kind === 'course') {
      lesson = lessonById(String(b.lessonId));
      if (!lesson) throw bad('Unbekannte Lektion.');
      if (!lessonUnlocked(req.user.id, lesson.id)) throw bad('Diese Lektion ist noch gesperrt.');
    }
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
      recordErrors(db, req.user.id, b.confusions, b.errorWords);
      const course = lesson && completed ? updateCourse(req.user.id, lesson, m) : null;
      if (kind === 'basics') db.prepare('UPDATE users SET onboarding_done = 1 WHERE id = ?').run(req.user.id);
      return { ...award(req.user, { kind, gross, correct, errors, durationMs, completed, ...m }), course };
    });
    res.json({ ...m, ...out });
  });

  // ---------- Kurs ----------

  function courseProgress(userId) {
    const rows = db.prepare('SELECT * FROM course_progress WHERE user_id = ?').all(userId);
    return new Map(rows.map((r) => [r.lesson_id, r]));
  }

  function manualUnlocks(userId) {
    return new Set(db.prepare('SELECT lesson_id FROM course_unlocks WHERE user_id = ?').all(userId).map((r) => r.lesson_id));
  }

  // Fehlergrenze der Klasse; ohne Klasse (z. B. frisch über VIDIS angemeldet) gilt der Standard.
  function passRateFor(userId) {
    const row = db.prepare('SELECT c.course_pass_rate FROM users u JOIN classes c ON c.id = u.class_id WHERE u.id = ?').get(userId);
    return row ? row.course_pass_rate : PASS_ERROR_RATE;
  }

  // Eine Lektion ist frei, wenn die vorherige bestanden ist oder die Lehrkraft sie freigeschaltet hat.
  function lessonStates(progress, manual) {
    return LESSONS.map((l, i) => {
      const p = progress.get(l.id);
      const passed = !!p?.passed_at;
      const prevPassed = i === 0 || !!progress.get(LESSONS[i - 1].id)?.passed_at;
      const byTeacher = manual.has(l.id);
      return { lesson: l, p, passed, byTeacher, unlocked: prevPassed || byTeacher };
    });
  }

  function lessonUnlocked(userId, lessonId) {
    return !!lessonStates(courseProgress(userId), manualUnlocks(userId)).find((x) => x.lesson.id === lessonId)?.unlocked;
  }

  function courseList(userId) {
    return lessonStates(courseProgress(userId), manualUnlocks(userId)).map(({ lesson: l, p, passed, byTeacher, unlocked }) => ({
      id: l.id,
      title: l.title,
      goal: l.goal,
      unlocked,
      unlockedByTeacher: byTeacher && !passed,
      attempts: p?.attempts ?? 0,
      bestApm: p?.best_apm ?? null,
      bestErrorRate: p?.best_error_rate ?? null,
      stars: p?.stars ?? 0,
      passed,
    }));
  }

  // Kompakter Kursstand je Lektion für die Klassenübersicht: Status und Sterne.
  function courseStrip(userId, progress, manual) {
    return lessonStates(progress.get(userId) || new Map(), manual.get(userId) || new Set()).map(({ p, passed, byTeacher, unlocked }) => ({
      s: passed ? 'passed' : byTeacher ? 'teacher' : unlocked ? 'open' : 'locked',
      stars: p?.stars ?? 0,
      attempts: p?.attempts ?? 0,
    }));
  }

  function updateCourse(userId, lesson, m) {
    const before = courseProgress(userId).get(lesson.id);
    const passErrorRate = passRateFor(userId);
    const stars = starsFor(m, lesson, passErrorRate);
    const passedNow = stars > 0;
    db.prepare(
      `INSERT INTO course_progress (user_id, lesson_id, attempts, best_apm, best_error_rate, stars, passed_at) VALUES (?, ?, 1, ?, ?, ?, ?)
       ON CONFLICT(user_id, lesson_id) DO UPDATE SET attempts = attempts + 1,
         best_apm = MAX(best_apm, excluded.best_apm),
         best_error_rate = MIN(COALESCE(best_error_rate, 100), excluded.best_error_rate),
         stars = MAX(stars, excluded.stars),
         passed_at = COALESCE(passed_at, excluded.passed_at)`
    ).run(userId, lesson.id, m.apm, m.errorRate, stars, passedNow ? Date.now() : null);
    const idx = LESSONS.indexOf(lesson);
    const next = LESSONS[idx + 1];
    return {
      stars,
      passed: passedNow,
      newlyPassed: passedNow && !before?.passed_at,
      passErrorRate,
      next: next ? { id: next.id, title: next.title } : null,
    };
  }

  app.get('/api/me/course', auth('student'), (req, res) => {
    res.json({ passErrorRate: passRateFor(req.user.id), lessons: courseList(req.user.id) });
  });

  app.get('/api/me/errors', auth(), (req, res) => {
    res.json(errorProfile(db, req.user.id));
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
      recordErrors(db, req.user.id, req.body.confusions, req.body.errorWords);
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
    let rate = cls.course_pass_rate;
    if (req.body.passErrorRate !== undefined) {
      rate = Number(String(req.body.passErrorRate).replace(',', '.'));
      if (!Number.isFinite(rate) || rate < 0 || rate > PASS_ERROR_RATE_MAX) throw bad(`Die Fehlergrenze muss zwischen 0 und ${PASS_ERROR_RATE_MAX} % liegen.`);
      rate = Math.round(rate * 10) / 10;
    }
    let newlyPassed = 0;
    tx(db, () => {
      db.prepare('UPDATE classes SET name = ?, leaderboard_enabled = ?, course_pass_rate = ? WHERE id = ?').run(name, lb, rate, cls.id);
      // Großzügigere Grenze: Wer mit seinem besten Versuch schon darunter liegt, hat die Lektion jetzt bestanden.
      // Eine strengere Grenze nimmt bereits bestandene Lektionen nicht wieder weg.
      if (rate > cls.course_pass_rate) {
        newlyPassed = Number(
          db
            .prepare(
              `UPDATE course_progress SET passed_at = ?, stars = MAX(stars, 1)
               WHERE passed_at IS NULL AND best_error_rate IS NOT NULL AND best_error_rate <= ? AND user_id IN (SELECT id FROM users WHERE class_id = ?)`
            )
            .run(Date.now(), rate, cls.id).changes
        );
      }
    });
    res.json({ ok: true, passErrorRate: rate, newlyPassed });
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
           COUNT(r.id) AS runs, ROUND(AVG(r.apm), 1) AS avg_apm, ROUND(AVG(r.error_rate), 2) AS avg_error_rate, MAX(r.created_at) AS last_active,
           (SELECT COUNT(*) FROM course_progress cp WHERE cp.user_id = u.id AND cp.passed_at IS NOT NULL) AS lessons_passed
         FROM users u LEFT JOIN results r ON r.user_id = u.id AND r.completed = 1
         WHERE u.class_id = ? GROUP BY u.id ORDER BY u.display_name`
      )
      .all(cls.id);
    const progress = new Map();
    for (const r of db.prepare('SELECT cp.* FROM course_progress cp JOIN users u ON u.id = cp.user_id WHERE u.class_id = ?').all(cls.id)) {
      if (!progress.has(r.user_id)) progress.set(r.user_id, new Map());
      progress.get(r.user_id).set(r.lesson_id, r);
    }
    const manual = new Map();
    for (const r of db.prepare('SELECT cu.user_id, cu.lesson_id FROM course_unlocks cu JOIN users u ON u.id = cu.user_id WHERE u.class_id = ?').all(cls.id)) {
      if (!manual.has(r.user_id)) manual.set(r.user_id, new Set());
      manual.get(r.user_id).add(r.lesson_id);
    }
    res.json({
      id: cls.id,
      name: cls.name,
      leaderboard: !!cls.leaderboard_enabled,
      joinCode: cls.join_code,
      passErrorRate: cls.course_pass_rate,
      lessonCount: LESSONS.length,
      lessons: LESSONS.map((l) => ({ id: l.id, title: l.title })),
      students: students.map((s) => ({ ...s, level: levelFor(s.xp), course: courseStrip(s.id, progress, manual) })),
    });
  });

  // Lektionen von Hand freischalten oder die Freischaltung zurücknehmen. Ohne studentIds gilt es für die ganze Klasse,
  // mit upTo zusätzlich für alle Lektionen davor. Bereits bestandene Lektionen bleiben in jedem Fall bestanden.
  app.post('/api/classes/:id/unlocks', auth('teacher'), (req, res) => {
    const cls = ownClass(req);
    const idx = LESSONS.findIndex((l) => l.id === String(req.body.lessonId));
    if (idx < 0) throw bad('Unbekannte Lektion.');
    const lessonIds = (req.body.upTo ? LESSONS.slice(0, idx + 1) : [LESSONS[idx]]).map((l) => l.id);
    let students = db.prepare("SELECT id FROM users WHERE class_id = ? AND role = 'student'").all(cls.id).map((r) => r.id);
    if (Array.isArray(req.body.studentIds) && req.body.studentIds.length) {
      const wanted = new Set(req.body.studentIds.map(Number));
      students = students.filter((id) => wanted.has(id));
    }
    if (!students.length) throw bad('Keine Schüler ausgewählt.');
    const lock = !!req.body.lock;
    const stmt = lock
      ? db.prepare('DELETE FROM course_unlocks WHERE user_id = ? AND lesson_id = ?')
      : db.prepare('INSERT OR IGNORE INTO course_unlocks (user_id, lesson_id, unlocked_at) VALUES (?, ?, ?)');
    let changed = 0;
    tx(db, () => {
      for (const userId of students) for (const lessonId of lessonIds) changed += Number((lock ? stmt.run(userId, lessonId) : stmt.run(userId, lessonId, Date.now())).changes);
    });
    res.json({ ok: true, changed });
  });

  // Beitrittscode: Wer sich über VIDIS anmeldet, kommt ohne Klasse an und tritt mit diesem Code bei.
  app.post('/api/classes/:id/join-code', auth('teacher'), (req, res) => {
    const cls = ownClass(req);
    const code = req.body.remove ? null : generateJoinCode(db);
    db.prepare('UPDATE classes SET join_code = ? WHERE id = ?').run(code, cls.id);
    res.json({ joinCode: code });
  });

  const joinAttempts = new Map();
  app.post('/api/me/join', auth('student'), (req, res) => {
    if (req.user.class_id || req.user.preview) throw bad('Du bist schon in einer Klasse.');
    const a = joinAttempts.get(req.user.id) || { n: 0, until: 0 };
    if (a.until > Date.now()) throw new HttpError(429, 'Zu viele Versuche. Bitte eine Minute warten.');
    const code = String(req.body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const cls = code.length === 6
      ? db
          .prepare('SELECT c.id, c.name FROM classes c JOIN users t ON t.id = c.teacher_id WHERE c.join_code = ? AND t.school_id = ?')
          .get(`${code.slice(0, 3)}-${code.slice(3)}`, req.user.school_id)
      : null;
    if (!cls) {
      a.n++;
      if (a.n >= 5) Object.assign(a, { n: 0, until: Date.now() + 60000 });
      joinAttempts.set(req.user.id, a);
      throw bad('Diesen Code gibt es nicht. Bitte bei der Lehrkraft nachfragen.');
    }
    joinAttempts.delete(req.user.id);
    db.prepare('UPDATE users SET class_id = ? WHERE id = ?').run(cls.id, req.user.id);
    res.json({ id: cls.id, name: cls.name });
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
        db.prepare("INSERT INTO users (role, username, display_name, password_hash, class_id, school_id, created_at) VALUES ('student', ?, ?, ?, ?, ?, ?)").run(
          username,
          displayName,
          hashPassword(password),
          cls.id,
          req.user.school_id,
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

  // Passwörter sind nur als Hash gespeichert. Ein neuer Druckbogen bedeutet deshalb neue Passwörter;
  // Konten, Pseudonyme und Ergebnisse bleiben erhalten.
  app.post('/api/classes/:id/reset-passwords', auth('teacher'), (req, res) => {
    const cls = ownClass(req);
    let students = db.prepare("SELECT id, username, display_name FROM users WHERE class_id = ? AND role = 'student' ORDER BY display_name").all(cls.id);
    if (Array.isArray(req.body.studentIds) && req.body.studentIds.length) {
      const wanted = new Set(req.body.studentIds.map(Number));
      students = students.filter((s) => wanted.has(s.id));
    }
    if (!students.length) throw bad('Keine Schüler ausgewählt.');
    const credentials = tx(db, () =>
      students.map((s) => {
        const password = generatePassword();
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), s.id);
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(s.id);
        return { username: s.username, password, displayName: s.display_name };
      })
    );
    res.json({ className: cls.name, credentials });
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
    res.json({
      displayName: s.display_name,
      username: s.username,
      results: rows,
      weakKeys: weakKeys(db, s.id),
      errors: errorProfile(db, s.id),
      course: courseList(s.id),
      classId: s.class_id,
      passErrorRate: passRateFor(s.id),
    });
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
             (SELECT COUNT(DISTINCT r.user_id) FROM results r JOIN users u ON u.id = r.user_id
              WHERE r.assignment_id = a.id AND r.completed = 1 AND u.class_id = a.class_id) AS done
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
           FROM users u WHERE u.role = 'teacher' AND u.school_id = ? ORDER BY u.display_name`
        )
        .all(req.user.school_id)
    );
  });

  app.post('/api/admin/teachers', auth('admin'), (req, res) => {
    const username = str(req.body.username, { max: 40, min: 3, name: 'Benutzername' });
    if (!/^[\w.-]+$/.test(username)) throw bad('Benutzername darf nur Buchstaben, Ziffern, Punkt, Bindestrich und Unterstrich enthalten.');
    const displayName = str(req.body.displayName, { max: 80, name: 'Anzeigename' });
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw bad('Dieser Benutzername ist schon vergeben.');
    const password = generatePassword() + generatePassword();
    db.prepare("INSERT INTO users (role, username, display_name, password_hash, school_id, created_at) VALUES ('teacher', ?, ?, ?, ?, ?)").run(
      username,
      displayName,
      hashPassword(password),
      req.user.school_id,
      Date.now()
    );
    res.json({ username, password });
  });

  app.post('/api/admin/teachers/:id/reset-password', auth('admin'), (req, res) => {
    const t = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'teacher' AND school_id = ?").get(int(req.params.id), req.user.school_id);
    if (!t) throw notFound();
    const password = generatePassword() + generatePassword();
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), t.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(t.id);
    res.json({ username: t.username, password });
  });

  app.delete('/api/admin/teachers/:id', auth('admin'), (req, res) => {
    const t = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'teacher' AND school_id = ?").get(int(req.params.id), req.user.school_id);
    if (!t) throw notFound();
    tx(db, () => {
      // Klassen und Schülerkonten der Lehrkraft gehen mit.
      for (const c of db.prepare('SELECT id FROM classes WHERE teacher_id = ?').all(t.id)) db.prepare('DELETE FROM users WHERE class_id = ?').run(c.id);
      db.prepare('DELETE FROM users WHERE id = ?').run(t.id);
    });
    res.json({ ok: true });
  });

  app.get('/api/admin/settings', auth('admin'), (req, res) => {
    const school = schoolById(req.user.school_id);
    res.json({
      schoolName: school.name,
      yearEnd: school.year_end,
      privacyNote: school.privacy_note,
      nextPurge: nextPurgeDate(school).toISOString().slice(0, 10),
      mode: isMulti(db) ? 'multi' : 'single',
      avvSignedAt: school.avv_signed_at,
      schoolCode: school.school_code,
    });
  });

  app.put('/api/admin/settings', auth('admin'), (req, res) => {
    const schoolName = str(req.body.schoolName, { max: 120, name: 'Schulname' });
    const yearEnd = String(req.body.yearEnd || '');
    const m = /^(\d{2})-(\d{2})$/.exec(yearEnd);
    if (!m || +m[1] < 1 || +m[1] > 12 || +m[2] < 1 || +m[2] > 28) throw bad('Schuljahresende bitte als MM-TT angeben (Tag höchstens 28).');
    const privacyNote = typeof req.body.privacyNote === 'string' ? req.body.privacyNote.slice(0, 5000) : '';
    db.prepare('UPDATE schools SET name = ?, year_end = ?, privacy_note = ? WHERE id = ?').run(schoolName, yearEnd, privacyNote, req.user.school_id);
    res.json({ ok: true, nextPurge: nextPurgeDate(schoolById(req.user.school_id)).toISOString().slice(0, 10) });
  });

  app.get('/api/admin/demo', auth('admin'), (req, res) => {
    res.json({ present: hasDemo(db, req.user.school_id), password: DEMO_PASSWORD, prefix: prefixFor(req.user.school_id) });
  });

  app.post('/api/admin/demo', auth('admin'), (req, res) => {
    if (req.body.action === 'remove') {
      removeDemo(db, req.user.school_id);
      return res.json({ present: false });
    }
    if (req.body.action !== 'create') throw bad('Unbekannte Aktion.');
    res.json({ present: true, ...createDemo(db, req.user.school_id) });
  });

  // ---------- Betreiber (Mehrschulbetrieb) und VIDIS ----------

  operatorRoutes(app, db, { auth, bad, notFound, str, int, tx, schoolById, secureCookies, vidis });

  // ---------- PLN: 10-Minuten-Abschrift ----------

  const attemptMs = (a) => a.duration_ms || PLN_DURATION_MS;
  const plnEnded = (a, now = Date.now()) => !!a && (!!a.submitted_at || now > a.started_at + attemptMs(a) + PLN_GRACE_MS);
  const schemeOf = (id) => {
    const s = id && db.prepare('SELECT * FROM grading_schemes WHERE id = ?').get(id);
    return s ? { ...s, thresholds: JSON.parse(s.thresholds) } : null;
  };
  const flagsOf = (plnId, userId) => db.prepare('SELECT lrs, no_touch FROM pln_flags WHERE pln_id = ? AND user_id = ?').get(plnId, userId) || { lrs: 0, no_touch: 0 };

  // Auswertung und Notenvorschlag einer abgeschlossenen Abschrift.
  function assess(p, s, scheme, a, flags) {
    const lrs = !!flags?.lrs;
    const ev = evaluatePln(p.text, a.typed, evalRules(s, p.text, lrs));
    return { ev, grade: gradePln(s, ev, { scheme, lrs, noTouch: !!flags?.no_touch, durationMs: attemptMs(a) }) };
  }

  function ownPln(req) {
    const p = db.prepare('SELECT p.* FROM plns p JOIN classes c ON c.id = p.class_id WHERE p.id = ? AND c.teacher_id = ?').get(int(req.params.id), req.user.id);
    if (!p) throw notFound();
    return p;
  }

  // Einstellungen aus der Anfrage prüfen, Notenschlüssel nur bei der Bewertungsart „Notenschlüssel“.
  function readSettings(req, body) {
    const s = normalizeSettings(body.settings || {});
    let scheme = null;
    if (s.mode === 'speed') {
      scheme = s.gradingSchemeId && db.prepare('SELECT * FROM grading_schemes WHERE id = ? AND teacher_id = ?').get(s.gradingSchemeId, req.user.id);
      if (!scheme) throw bad('Bitte einen Notenschlüssel wählen. Er bestimmt, wie weit für die Note 1 getippt werden muss.');
    } else s.gradingSchemeId = null;
    return { s, scheme };
  }

  function composeFor(req, s, scheme) {
    const textId = int(s.textId, { min: 1, name: 'Text' });
    if (!visibleTextsFor(req.user).some((t) => t.id === textId)) throw bad('Text nicht gefunden.');
    const all = db.prepare('SELECT id, title, content, builtin_key FROM texts WHERE owner_id IS NULL OR owner_id = ?').all(req.user.id);
    const start = all.find((t) => t.id === textId);
    // Lange Texte zuerst, dann der Rest in fester Reihenfolge.
    const others = all.filter((t) => t.id !== textId).sort((x, y) => y.content.length - x.content.length || x.id - y.id);
    return buildPlnText(s, start, others, scheme);
  }

  app.get('/api/classes/:id/plns', auth('teacher'), (req, res) => {
    const cls = ownClass(req);
    const rows = db
      .prepare(
        `SELECT p.*, g.name AS scheme_name,
           (SELECT COUNT(*) FROM pln_attempts a JOIN users u ON u.id = a.user_id WHERE a.pln_id = p.id AND u.class_id = p.class_id) AS started
         FROM plns p LEFT JOIN grading_schemes g ON g.id = p.grading_scheme_id WHERE p.class_id = ? ORDER BY p.created_at DESC`
      )
      .all(cls.id);
    res.json(rows.map((r) => ({ id: r.id, title: r.title, status: r.status, created_at: r.created_at, note1_chars: r.note1_chars, started: r.started, scheme_name: r.scheme_name, settings: plnSettings(r) })));
  });

  app.post('/api/classes/:id/plns', auth('teacher'), (req, res) => {
    const cls = ownClass(req);
    const b = req.body;
    const title = str(b.title, { max: 120, name: 'Titel' });
    // Ältere Oberfläche: Notenschlüssel, Text, Vorlage und Returntaste direkt im Body.
    const body = b.settings ? b : { settings: { mode: 'speed', durationMin: 10, capitalDouble: false, gradingSchemeId: b.gradingSchemeId, textId: b.textId, format: b.format, returnRule: b.returnRule } };
    const { s, scheme } = readSettings(req, body);
    const { text, sources, note1 } = composeFor(req, s, scheme);
    const r = db
      .prepare('INSERT INTO plns (class_id, title, text, sources, format, return_rule, grading_scheme_id, note1_chars, settings, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(cls.id, title, text, JSON.stringify(sources), s.format, s.returnRule, scheme?.id ?? null, note1, JSON.stringify(s), 'draft', Date.now());
    res.json({ id: Number(r.lastInsertRowid) });
  });

  // Einstellungen ändern. Die Wertung wird bei jedem Abruf neu berechnet, gilt also sofort für alle Abschriften.
  // Den Text stellt die App nur neu zusammen, solange noch niemand begonnen hat.
  app.put('/api/plns/:id/settings', auth('teacher'), (req, res) => {
    const p = ownPln(req);
    const old = plnSettings(p);
    const { s, scheme } = readSettings(req, { settings: { textId: old.textId, ...req.body } });
    const started = db.prepare('SELECT COUNT(*) AS n FROM pln_attempts a JOIN users u ON u.id = a.user_id WHERE a.pln_id = ? AND u.class_id = ?').get(p.id, p.class_id).n;
    const textKeys = ['mode', 'targetLines', 'lineChars', 'requiredChars', 'capitalDouble', 'durationMin', 'gradingSchemeId', 'textId'];
    const textChanged = textKeys.some((k) => JSON.stringify(old[k]) !== JSON.stringify(s[k]));
    let { text, sources } = p;
    if (textChanged && started && (old.mode !== s.mode || old.targetLines !== s.targetLines || old.lineChars !== s.lineChars || old.textId !== s.textId))
      throw bad('Bewertungsart, Text, Zeilenzahl und Zeilenlänge lassen sich nicht mehr ändern, weil schon jemand begonnen hat.');
    if (textChanged && !started) {
      if (s.textId) {
        const built = composeFor(req, s, scheme);
        text = built.text;
        sources = JSON.stringify(built.sources);
      } else if (s.mode === 'count' && old.mode !== 'count') throw bad('Dieser ältere PLN lässt sich nicht auf feste Zeilen umstellen. Bitte einen neuen PLN anlegen.');
    }
    const note1 = s.mode === 'count' ? strokes(text, s.capitalDouble) : s.mode === 'speed' ? note1Chars(scheme, s.durationMin) : s.requiredChars;
    db.prepare('UPDATE plns SET settings = ?, text = ?, sources = ?, note1_chars = ?, format = ?, return_rule = ?, grading_scheme_id = ? WHERE id = ?').run(
      JSON.stringify(s), text, sources, note1, s.format, s.returnRule, scheme?.id ?? null, p.id
    );
    res.json({ ok: true, textChanged: textChanged && !started });
  });

  app.get('/api/plns/:id', auth('teacher'), (req, res) => {
    const p = ownPln(req);
    const s = plnSettings(p);
    const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(p.class_id);
    const scheme = schemeOf(p.grading_scheme_id);
    const now = Date.now();
    const rows = db
      .prepare(
        `SELECT u.id AS user_id, u.display_name, u.username, a.started_at, a.saved_at, a.submitted_at, a.left_count, a.duration_ms, a.typed,
           COALESCE(f.lrs, 0) AS lrs, COALESCE(f.no_touch, 0) AS no_touch
         FROM users u LEFT JOIN pln_attempts a ON a.user_id = u.id AND a.pln_id = ?
         LEFT JOIN pln_flags f ON f.user_id = u.id AND f.pln_id = ?
         WHERE u.class_id = ? AND u.role = 'student' ORDER BY u.display_name`
      )
      .all(p.id, p.id, p.class_id);
    const lrsLines = s.mode === 'count' ? templateLines(p.text, s.lineChars, s.capitalDouble).slice(0, linesFor(s, true)) : null;
    res.json({
      pln: {
        ...p,
        settings: s,
        sources: JSON.parse(p.sources),
        heading: plnHeading(s),
        note1_pos: note1Position(p.text, p.note1_chars, s.capitalDouble),
        lrs_pos: lrsLines?.length ? lrsLines.at(-1).start + lrsLines.at(-1).text.length : null,
        lrs_chars: lrsLines?.length ? lrsLines.at(-1).strokes : null,
        className: cls.name,
        scheme,
      },
      schoolName: schoolById(req.user.school_id)?.name || '',
      rows: rows.map(({ typed, ...r }) => {
        const attempt = r.started_at ? { ...r } : null;
        const ended = plnEnded(attempt, now);
        const out = ended ? assess(p, s, scheme, { ...r, typed }, r) : null;
        return {
          ...r,
          lrs: !!r.lrs,
          no_touch: !!r.no_touch,
          end_at: attempt ? attempt.started_at + attemptMs(attempt) : null,
          state: !attempt ? 'none' : ended ? 'done' : 'running',
          gross: out?.ev.strokes ?? null,
          errors: out?.ev.errors ?? null,
          missingLines: out?.ev.missingLines ?? null,
          grade: out?.grade ?? null,
        };
      }),
    });
  });

  // Nachteilsausgleich und „Zehn-Finger-System nicht angewendet“ je Person.
  app.put('/api/plns/:id/students/:userId', auth('teacher'), (req, res) => {
    const p = ownPln(req);
    const userId = int(req.params.userId);
    const u = db.prepare("SELECT id FROM users WHERE id = ? AND class_id = ? AND role = 'student'").get(userId, p.class_id);
    if (!u) throw notFound();
    const cur = flagsOf(p.id, userId);
    const lrs = req.body.lrs === undefined ? cur.lrs : req.body.lrs ? 1 : 0;
    const noTouch = req.body.noTouch === undefined ? cur.no_touch : req.body.noTouch ? 1 : 0;
    db.prepare('INSERT INTO pln_flags (pln_id, user_id, lrs, no_touch) VALUES (?, ?, ?, ?) ON CONFLICT(pln_id, user_id) DO UPDATE SET lrs = excluded.lrs, no_touch = excluded.no_touch').run(p.id, userId, lrs, noTouch);
    res.json({ ok: true });
  });

  app.patch('/api/plns/:id', auth('teacher'), (req, res) => {
    const p = ownPln(req);
    const status = ['draft', 'open', 'closed'].includes(req.body.status) ? req.body.status : null;
    if (!status) throw bad('Unbekannter Status.');
    db.prepare('UPDATE plns SET status = ? WHERE id = ?').run(status, p.id);
    res.json({ ok: true });
  });

  app.delete('/api/plns/:id', auth('teacher'), (req, res) => {
    const p = ownPln(req);
    db.prepare('DELETE FROM plns WHERE id = ?').run(p.id);
    res.json({ ok: true });
  });

  app.delete('/api/plns/:id/attempts/:userId', auth('teacher'), (req, res) => {
    const p = ownPln(req);
    db.prepare('DELETE FROM pln_attempts WHERE pln_id = ? AND user_id = ?').run(p.id, int(req.params.userId));
    res.json({ ok: true });
  });

  app.get('/api/plns/:id/abschriften.pdf', auth('teacher'), (req, res) => {
    const p = ownPln(req);
    const s = plnSettings(p);
    const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(p.class_id);
    const scheme = schemeOf(p.grading_scheme_id);
    const now = Date.now();
    const entries = db
      .prepare(
        `SELECT u.display_name, u.username, a.started_at, a.submitted_at, a.left_count, a.duration_ms, a.typed,
           COALESCE(f.lrs, 0) AS lrs, COALESCE(f.no_touch, 0) AS no_touch
         FROM pln_attempts a JOIN users u ON u.id = a.user_id
         LEFT JOIN pln_flags f ON f.pln_id = a.pln_id AND f.user_id = a.user_id
         WHERE a.pln_id = ? AND u.class_id = ? ORDER BY u.display_name`
      )
      .all(p.id, p.class_id)
      .filter((a) => plnEnded(a, now))
      .map((a) => {
        const { ev, grade } = assess(p, s, scheme, a, a);
        return { student: { display_name: a.display_name, username: a.username }, attempt: { ...a, duration_ms: attemptMs(a) }, ev, grade };
      });
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="pln-${slugify(cls.name)}-${slugify(p.title)}.pdf"`);
    writePlnPdf(res, { school: schoolById(req.user.school_id)?.name || '', className: cls.name, pln: p, settings: s, scheme, entries });
  });

  // Sicht der Lernenden: Der Text liegt auf Papier vor, am Bildschirm wird nur geschrieben.
  function studentPln(req) {
    const p = db.prepare('SELECT * FROM plns WHERE id = ? AND class_id = ?').get(int(req.params.id), req.user.class_id ?? -1);
    if (!p) throw notFound();
    return p;
  }

  function plnState(p, userId) {
    const s = plnSettings(p);
    const a = db.prepare('SELECT * FROM pln_attempts WHERE pln_id = ? AND user_id = ?').get(p.id, userId);
    const now = Date.now();
    return {
      id: p.id,
      title: p.title,
      heading: plnHeading(s),
      status: p.status,
      returnRule: s.returnRule,
      durationMs: a ? attemptMs(a) : durationMsFor(s, !!flagsOf(p.id, userId).lrs),
      serverNow: now,
      startedAt: a?.started_at ?? null,
      leftCount: a?.left_count ?? 0,
      ended: plnEnded(a, now),
      typed: a && !plnEnded(a, now) ? a.typed : null,
    };
  }

  app.get('/api/me/plns', auth('student'), (req, res) => {
    const rows = db
      .prepare(
        `SELECT p.id, p.title, p.status, a.started_at, a.submitted_at, a.duration_ms FROM plns p
         LEFT JOIN pln_attempts a ON a.pln_id = p.id AND a.user_id = ?
         WHERE p.class_id = ? AND (p.status = 'open' OR a.started_at IS NOT NULL) ORDER BY p.created_at DESC`
      )
      .all(req.user.id, req.user.class_id ?? -1);
    res.json(rows.map((r) => ({ id: r.id, title: r.title, status: r.status, done: plnEnded(r.started_at ? r : null) })));
  });

  app.get('/api/me/plns/:id', auth('student'), (req, res) => {
    res.json(plnState(studentPln(req), req.user.id));
  });

  app.post('/api/me/plns/:id/start', auth('student'), (req, res) => {
    const p = studentPln(req);
    if (p.status !== 'open') throw bad('Der PLN ist nicht freigegeben. Warte auf deine Lehrkraft.');
    // Die Arbeitszeit (mit Nachteilsausgleich) wird beim Start festgehalten.
    const ms = durationMsFor(plnSettings(p), !!flagsOf(p.id, req.user.id).lrs);
    try {
      db.prepare('INSERT INTO pln_attempts (pln_id, user_id, started_at, duration_ms) VALUES (?, ?, ?, ?)').run(p.id, req.user.id, Date.now() + COUNTDOWN_MS, ms);
    } catch {
      throw bad('Diesen PLN hast du schon begonnen.');
    }
    res.json({ ...plnState(p, req.user.id), countdownMs: COUNTDOWN_MS });
  });

  app.post('/api/me/plns/:id/save', auth('student'), (req, res) => {
    const p = studentPln(req);
    const a = db.prepare('SELECT * FROM pln_attempts WHERE pln_id = ? AND user_id = ?').get(p.id, req.user.id);
    if (!a) throw bad('Der PLN wurde nicht gestartet.');
    const now = Date.now();
    if (a.submitted_at) throw bad('Der PLN wurde bereits abgegeben.');
    if (now > a.started_at + attemptMs(a) + PLN_GRACE_MS) throw bad('Die Zeit ist abgelaufen. Gewertet wird der zuletzt gespeicherte Stand.');
    if (typeof req.body.typed !== 'string') throw bad('Text fehlt.');
    const typed = Array.from(req.body.typed).slice(0, PLN_MAX_CHARS).join('');
    const final = req.body.final === true || now > a.started_at + attemptMs(a);
    const left = Math.max(a.left_count, Math.min(Number(req.body.leftCount) | 0, 10000));
    db.prepare('UPDATE pln_attempts SET typed = ?, saved_at = ?, submitted_at = ?, left_count = ? WHERE pln_id = ? AND user_id = ?').run(typed, now, final ? now : null, left, p.id, req.user.id);
    res.json({ ok: true, final });
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

function recordErrors(db, userId, confusions, errorWords) {
  if (Array.isArray(confusions)) {
    const up = db.prepare(
      'INSERT INTO error_pairs (user_id, expected, typed, count) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, expected, typed) DO UPDATE SET count = count + excluded.count'
    );
    for (const c of confusions.slice(0, 200)) {
      if (!Array.isArray(c) || c.length !== 3) continue;
      const [e, t, n] = c;
      if (typeof e !== 'string' || typeof t !== 'string' || Array.from(e).length !== 1 || Array.from(t).length !== 1 || e === t) continue;
      const count = Math.min(Math.max(1, Number(n) | 0), 1000);
      up.run(userId, e, t, count);
    }
  }
  if (errorWords && typeof errorWords === 'object') {
    const up = db.prepare(
      'INSERT INTO error_words (user_id, word, count) VALUES (?, ?, ?) ON CONFLICT(user_id, word) DO UPDATE SET count = count + excluded.count'
    );
    for (const [w, n] of Object.entries(errorWords).slice(0, 200)) {
      if (typeof w !== 'string' || w.length < 2 || w.length > 40) continue;
      up.run(userId, w, Math.min(Math.max(1, Number(n) | 0), 1000));
    }
  }
}

// Persönliche Fehleranalyse: schwache Tasten, typische Verwechslungen, oft verschriebene Wörter.
export function errorProfile(db, userId) {
  return {
    weakKeys: weakKeys(db, userId, 10),
    confusions: db
      .prepare('SELECT expected, typed, count FROM error_pairs WHERE user_id = ? AND count >= 2 ORDER BY count DESC, expected, typed LIMIT 10')
      .all(userId),
    words: db.prepare('SELECT word, count FROM error_words WHERE user_id = ? AND count >= 2 ORDER BY count DESC, word LIMIT 15').all(userId),
  };
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
