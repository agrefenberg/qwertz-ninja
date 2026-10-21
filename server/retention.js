import { tx } from './db.js';

// Ergebnisse werden je Schule am Tag nach dem eingestellten Schuljahresende (Standard: 31. Juli) gelöscht.
function purgeMoment(yearEnd, year) {
  const [mm, dd] = (yearEnd || '07-31').split('-').map(Number);
  return new Date(year, mm - 1, dd + 1, 0, 0, 0);
}

export function nextPurgeDate(school, now = new Date()) {
  const thisYear = purgeMoment(school?.year_end, now.getFullYear());
  return thisYear > now ? thisYear : purgeMoment(school?.year_end, now.getFullYear() + 1);
}

function lastPurgeMoment(school, now) {
  const thisYear = purgeMoment(school.year_end, now.getFullYear());
  return thisYear <= now ? thisYear : purgeMoment(school.year_end, now.getFullYear() - 1);
}

export function purgeIfDue(db, now = new Date()) {
  let purged = false;
  for (const school of db.prepare('SELECT * FROM schools').all()) {
    if (!school.last_purge) {
      // Neue Schule: nichts löschen, ab jetzt zählen.
      db.prepare('UPDATE schools SET last_purge = ? WHERE id = ?').run(now.getTime(), school.id);
      continue;
    }
    if (school.last_purge >= lastPurgeMoment(school, now).getTime()) continue;
    purgeSchool(db, school.id);
    db.prepare('UPDATE schools SET last_purge = ? WHERE id = ?').run(now.getTime(), school.id);
    console.log(`[${now.toISOString()}] Ergebnisse von „${school.name}“ zum Schuljahresende gelöscht.`);
    purged = true;
  }
  return purged;
}

// Löscht alle Leistungsdaten einer Schule (auch Kursfortschritt, Fehleranalyse und PLN-Abschriften).
// Konten und Klassen bleiben bestehen.
export function purgeSchool(db, schoolId) {
  const users = 'SELECT id FROM users WHERE school_id = ?';
  const classes = `SELECT c.id FROM classes c JOIN users t ON t.id = c.teacher_id WHERE t.school_id = ?`;
  tx(db, () => {
    for (const table of ['results', 'test_attempts', 'pln_attempts', 'key_stats', 'course_progress', 'course_unlocks', 'error_pairs', 'error_words', 'badges']) {
      db.prepare(`DELETE FROM ${table} WHERE user_id IN (${users})`).run(schoolId);
    }
    db.prepare(`DELETE FROM assignments WHERE class_id IN (${classes})`).run(schoolId);
    db.prepare(`DELETE FROM plns WHERE class_id IN (${classes})`).run(schoolId);
    db.prepare('UPDATE users SET xp = 0 WHERE school_id = ?').run(schoolId);
  });
}
