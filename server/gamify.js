import { LESSONS } from '../public/js/course.js';

const LESSON_COUNT = LESSONS.length;
// Level ("Gürtel") und Abzeichen.

export const BELTS = ['Weiß', 'Gelb', 'Orange', 'Grün', 'Blau', 'Violett', 'Braun', 'Schwarz', 'Schwarz II', 'Schwarz III'];

// XP-Schwelle für Level L (1-basiert): 400 * L * (L - 1) / 2
export function levelFor(xp) {
  let level = 1;
  while (level < BELTS.length && xp >= xpForLevel(level + 1)) level++;
  const next = level < BELTS.length ? xpForLevel(level + 1) : null;
  return { level, belt: BELTS[level - 1], xp, levelStart: xpForLevel(level), next };
}

export function xpForLevel(level) {
  return (400 * level * (level - 1)) / 2;
}

export const BADGES = {
  'erster-schritt': { name: 'Erster Schritt', desc: 'Erste Übung abgeschlossen' },
  grundstellung: { name: 'Gut aufgestellt', desc: 'Grundstellung wiederholt' },
  'tempo-150': { name: 'Flinke Finger', desc: '150 Anschläge pro Minute' },
  'tempo-200': { name: 'Wirbelwind', desc: '200 Anschläge pro Minute' },
  'tempo-250': { name: 'Blitzschnell', desc: '250 Anschläge pro Minute' },
  'tempo-300': { name: 'Schattenklinge', desc: '300 Anschläge pro Minute' },
  fehlerfrei: { name: 'Makellos', desc: 'Mindestens 200 Anschläge ohne Fehler' },
  praezision: { name: 'Präzision', desc: 'Unter 1 % Fehler bei mindestens 300 Anschlägen' },
  ausdauer: { name: 'Ausdauer', desc: '10 Übungen abgeschlossen' },
  marathon: { name: 'Marathon', desc: '50 Übungen abgeschlossen' },
  schwachstellen: { name: 'Selbstkritisch', desc: '5 Schwachstellen-Übungen abgeschlossen' },
  'kurs-halbzeit': { name: 'Halbzeit', desc: 'Die Hälfte des Kurses bestanden' },
  'kurs-meister': { name: 'Meister', desc: 'Alle Kurslektionen bestanden' },
};

// Liefert die Abzeichen, die nach diesem Ergebnis neu verdient sind.
export function newBadges(db, userId, result) {
  const have = new Set(db.prepare('SELECT badge FROM badges WHERE user_id = ?').all(userId).map((r) => r.badge));
  const counts = db
    .prepare("SELECT COUNT(*) AS n, SUM(kind = 'weak') AS weak, SUM(kind = 'focus') AS focus FROM results WHERE user_id = ? AND completed = 1")
    .get(userId);
  const earned = [];
  const add = (b, cond) => cond && !have.has(b) && earned.push(b);

  const serious = result.durationMs >= 60000 || result.gross >= 200;
  add('erster-schritt', result.completed);
  add('grundstellung', result.kind === 'basics' && result.completed);
  for (const t of [150, 200, 250, 300]) add(`tempo-${t}`, serious && result.apm >= t);
  add('fehlerfrei', result.gross >= 200 && result.errors === 0);
  add('praezision', result.gross >= 300 && result.errorRate < 1);
  add('ausdauer', counts.n >= 10);
  add('marathon', counts.n >= 50);
  add('schwachstellen', (counts.weak || 0) + (counts.focus || 0) >= 5);
  const passed = db.prepare('SELECT COUNT(*) AS n FROM course_progress WHERE user_id = ? AND passed_at IS NOT NULL').get(userId).n;
  add('kurs-halbzeit', passed >= Math.ceil(LESSON_COUNT / 2));
  add('kurs-meister', passed >= LESSON_COUNT);

  const ins = db.prepare('INSERT OR IGNORE INTO badges (user_id, badge, earned_at) VALUES (?, ?, ?)');
  for (const b of earned) ins.run(userId, b, Date.now());
  return earned;
}
