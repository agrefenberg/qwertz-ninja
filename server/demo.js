import { tx } from './db.js';
import { generateUsername, hashPassword, slugify } from './auth.js';
import { newBadges } from './gamify.js';
import { metrics } from '../public/js/scoring.js';
import { LESSONS } from '../public/js/course.js';
import { WORDS } from '../public/js/words.js';

// Demodaten zum Ausprobieren, je Schule. Alle Demo-Lehrkräfte beginnen mit "demo-" (bei weiteren
// Schulen "demo<Nr>-"); beim Entfernen werden sie mit ihren Klassen, Schülerkonten und Ergebnissen gelöscht.
export const DEMO_PASSWORD = 'ninja-demo';
export const prefixFor = (schoolId) => (schoolId === 1 ? 'demo-' : `demo${schoolId}-`);

const TEACHERS = [
  { username: 'huber', name: 'Frau Huber', classes: ['7a', '8b'] },
  { username: 'maier', name: 'Herr Maier', classes: ['9a', '9c'] },
  { username: 'yilmaz', name: 'Frau Yılmaz', classes: ['10a'] },
  { username: 'schmid', name: 'Herr Schmid', classes: ['10b', '10c'] },
];
const WEAK_POOL = ['ö', 'ä', 'ü', 'ß', 'y', 'x', 'q', 'p', 'z', 'c', 'v', 'b', ',', '.', '-', 'Ä', 'Ü', 'Z'];
const COMMON = 'enristadhulgmocbfkwzpvüäößjyxq ,.ENRISTADHULGMOCBFKWZ'.split('');
const KINDS = ['text', 'text', 'text', 'words', 'words', 'weak'];
const DAY = 864e5;

export function hasDemo(db, schoolId) {
  return !!db.prepare("SELECT 1 FROM users WHERE role = 'teacher' AND school_id = ? AND username LIKE ?").get(schoolId, `${prefixFor(schoolId)}%`);
}

export function removeDemo(db, schoolId) {
  tx(db, () => {
    const teachers = db.prepare("SELECT id FROM users WHERE role = 'teacher' AND school_id = ? AND username LIKE ?").all(schoolId, `${prefixFor(schoolId)}%`);
    for (const t of teachers) {
      for (const c of db.prepare('SELECT id FROM classes WHERE teacher_id = ?').all(t.id)) db.prepare('DELETE FROM users WHERE class_id = ?').run(c.id);
      db.prepare('DELETE FROM users WHERE id = ?').run(t.id);
    }
  });
}

const CONFUSIONS = [
  ['z', 'y'], ['y', 'z'], ['ö', 'ä'], ['ä', 'ö'], ['ü', 'ö'], ['ß', 's'], ['e', 'r'], ['i', 'o'], ['n', 'm'],
  [',', '.'], ['B', 'b'], ['S', 's'], ['g', 'h'], ['t', 'z'], ['c', 'x'], ['ü', '+'],
];
const rand = (a, b) => a + Math.random() * (b - a);
const shuffleArr = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function gauss() {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

export function createDemo(db, schoolId, now = Date.now()) {
  if (hasDemo(db, schoolId)) removeDemo(db, schoolId);
  const hash = hashPassword(DEMO_PASSWORD);
  const summary = { teachers: [], classes: 0, students: 0, results: 0, sampleStudents: [] };

  tx(db, () => {
    const insUser = db.prepare(
      `INSERT INTO users (role, username, display_name, password_hash, class_id, onboarding_done, xp, school_id, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ${Number(schoolId)}, ?)`
    );
    const insResult = db.prepare(
      `INSERT INTO results (user_id, assignment_id, kind, duration_ms, gross_chars, correct_chars, errors, corrected_errors, apm, wpm, error_rate, completed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    );
    const insKey = db.prepare('INSERT INTO key_stats (user_id, ch, hits, misses) VALUES (?, ?, ?, ?)');
    const texts = db.prepare('SELECT id, length(content) AS len FROM texts WHERE owner_id IS NULL').all();

    for (const t of TEACHERS) {
      const teacherId = Number(insUser.run('teacher', prefixFor(schoolId) + t.username, `${t.name} (Demo)`, hash, null, 1, now - 60 * DAY).lastInsertRowid);
      summary.teachers.push(prefixFor(schoolId) + t.username);
      const schemeId = Number(
        db
          .prepare('INSERT INTO grading_schemes (teacher_id, name, error_penalty, thresholds, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(teacherId, 'Standard', pick([0, 0, 5, 10]), JSON.stringify([240, 200, 160, 120, 80]), now - 50 * DAY).lastInsertRowid
      );

      for (const className of t.classes) {
        const grade = parseInt(className, 10);
        const classId = Number(
          db
            .prepare('INSERT INTO classes (name, teacher_id, leaderboard_enabled, created_at) VALUES (?, ?, ?, ?)')
            .run(className, teacherId, Math.random() < 0.5 ? 1 : 0, now - 45 * DAY).lastInsertRowid
        );
        summary.classes++;

        const exerciseText = pick(texts);
        const testText = pick(texts.filter((x) => x.len > 330));
        const insA = db.prepare(
          'INSERT INTO assignments (class_id, type, title, text_id, duration_sec, error_mode, due_at, grading_scheme_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        const exerciseId = Number(insA.run(classId, 'exercise', 'Hausaufgabe Umlaute', exerciseText.id, null, 'choice', now + 5 * DAY, null, now - 3 * DAY).lastInsertRowid);
        const testDate = now - 7 * DAY;
        const testId = Number(insA.run(classId, 'test', 'Lernzielkontrolle 1', testText.id, 120, 'free', testDate + DAY, schemeId, testDate - DAY).lastInsertRowid);

        const count = Math.round(rand(20, 28));
        const baseApm = { 7: 110, 8: 135, 9: 160, 10: 185 }[grade] ?? 150;
        for (let i = 0; i < count; i++) {
          const username = generateUsername(db, slugify(className));
          const [, animal, num] = username.split('-');
          const display = `${animal[0].toUpperCase()}${animal.slice(1)} ${num}`;
          const onboarded = i === 0 || Math.random() < 0.92 ? 1 : 0;
          const userId = Number(insUser.run('student', username, display, hash, classId, onboarded, now - 42 * DAY).lastInsertRowid);
          summary.students++;
          if (summary.sampleStudents.length < 3 && i === 0) summary.sampleStudents.push(username);
          if (!onboarded) continue;

          // Leistungsprofil: Starttempo, Lernfortschritt, Sorgfalt.
          const start = Math.max(50, baseApm + gauss() * 35);
          const gain = rand(0.1, 0.55);
          const errBase = Math.max(0.4, rand(1, 7) + gauss());
          const runs = Math.round(rand(4, 38));
          const speedAt = (ts) => start * (1 + gain * Math.min(1, Math.max(0, (ts - (now - 42 * DAY)) / (42 * DAY))));
          let xp = 0;

          // Kursfortschritt: bessere Schüler sind weiter.
          const lessonsDone = Math.max(0, Math.min(LESSONS.length, Math.round((start / 220) * LESSONS.length * rand(0.4, 1.1))));
          const insCourse = db.prepare(
            'INSERT INTO course_progress (user_id, lesson_id, attempts, best_apm, best_error_rate, stars, passed_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
          );
          for (let l = 0; l < lessonsDone; l++) {
            const apm = Math.round(start * rand(0.8, 1.2));
            const er = Math.round(rand(0.3, 3) * 10) / 10;
            const st = apm >= LESSONS[l].fast && er <= 1 ? 3 : apm >= LESSONS[l].fast * 0.8 ? 2 : 1;
            insCourse.run(userId, LESSONS[l].id, Math.round(rand(1, 4)), apm, er, st, now - (lessonsDone - l) * rand(1, 2.5) * DAY);
          }
          if (lessonsDone < LESSONS.length && Math.random() < 0.6) {
            insCourse.run(userId, LESSONS[lessonsDone].id, Math.round(rand(1, 3)), Math.round(start * 0.9), Math.round(rand(3.5, 8) * 10) / 10, 0, null);
          }

          // Typische Verwechslungen und oft verschriebene Wörter.
          const insPair = db.prepare('INSERT OR IGNORE INTO error_pairs (user_id, expected, typed, count) VALUES (?, ?, ?, ?)');
          for (const [e, t] of shuffleArr(CONFUSIONS).slice(0, Math.round(rand(2, 5)))) insPair.run(userId, e, t, Math.round(rand(2, 25) * (errBase / 3)));
          const insWord = db.prepare('INSERT OR IGNORE INTO error_words (user_id, word, count) VALUES (?, ?, ?)');
          for (const w of shuffleArr(WORDS.filter((x) => x.length > 4)).slice(0, Math.round(rand(3, 9)))) insWord.run(userId, w, Math.round(rand(2, 8)));

          const record = (kind, ts, durationMs, assignmentId = null) => {
            const apmTarget = Math.max(40, speedAt(ts) * (1 + gauss() * 0.08));
            const errRate = Math.max(0, errBase * (kind === 'test' ? 0.8 : 1) + gauss() * 0.8) / 100;
            const correct = Math.max(10, Math.round((apmTarget * durationMs) / 60000));
            const errors = Math.round(correct * errRate);
            const gross = correct + errors;
            const m = metrics({ gross, correct, errors, durationMs });
            insResult.run(userId, assignmentId, kind, durationMs, gross, correct, errors, kind === 'test' ? Math.round(rand(0, 6)) : 0, m.apm, m.wpm, m.errorRate, ts);
            xp += Math.round((correct / 10) * (m.errorRate > 10 ? 0.5 : 1));
            summary.results++;
            newBadges(db, userId, { kind, gross, correct, errors, durationMs, completed: true, ...m });
          };

          record('basics', now - 42 * DAY + rand(0, 3) * DAY, Math.round(rand(40, 90) * 1000));
          for (let r = 0; r < runs; r++) {
            const ts = now - rand(0, 40) * DAY;
            record(pick(KINDS), ts, Math.round(rand(45, 240) * 1000));
          }
          if (Math.random() < 0.6) record('exercise', now - rand(0, 3) * DAY, Math.round(rand(60, 180) * 1000), exerciseId);
          if (Math.random() < 0.88) {
            const startedAt = testDate + rand(0, 0.3) * DAY;
            db.prepare('INSERT INTO test_attempts (user_id, assignment_id, started_at, submitted_at) VALUES (?, ?, ?, ?)').run(userId, testId, startedAt, startedAt + 120000);
            record('test', startedAt + 120000, 120000, testId);
          }

          const weak = new Set(Array.from({ length: Math.round(rand(2, 5)) }, () => pick(WEAK_POOL)));
          for (const ch of COMMON.concat([...weak])) {
            const total = Math.round(rand(40, 400));
            const rate = weak.has(ch) ? rand(0.08, 0.25) : rand(0, errBase / 150);
            const misses = Math.round(total * rate);
            try {
              insKey.run(userId, ch, total - misses, misses);
            } catch {
              // Zeichen doppelt in der Liste: ignorieren
            }
          }
          db.prepare('UPDATE users SET xp = ? WHERE id = ?').run(xp, userId);
        }
      }
    }
  });
  return { ...summary, password: DEMO_PASSWORD };
}
