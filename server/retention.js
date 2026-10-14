import { getSetting, setSetting, tx } from './db.js';

// Ergebnisse werden am Tag nach dem eingestellten Schuljahresende (Standard: 31. Juli) gelöscht.
function purgeMoment(db, year) {
  const [mm, dd] = getSetting(db, 'year_end', '07-31').split('-').map(Number);
  return new Date(year, mm - 1, dd + 1, 0, 0, 0);
}

export function nextPurgeDate(db, now = new Date()) {
  const thisYear = purgeMoment(db, now.getFullYear());
  return thisYear > now ? thisYear : purgeMoment(db, now.getFullYear() + 1);
}

function lastPurgeMoment(db, now) {
  const thisYear = purgeMoment(db, now.getFullYear());
  return thisYear <= now ? thisYear : purgeMoment(db, now.getFullYear() - 1);
}

export function purgeIfDue(db, now = new Date()) {
  const last = Number(getSetting(db, 'last_purge', '0'));
  if (!last) {
    // Frische Installation: nichts löschen, ab jetzt zählen.
    setSetting(db, 'last_purge', now.getTime());
    return false;
  }
  if (last >= lastPurgeMoment(db, now).getTime()) return false;
  purgeAll(db);
  setSetting(db, 'last_purge', now.getTime());
  return true;
}

// Löscht alle Leistungsdaten (auch Kursfortschritt und Fehleranalyse). Konten und Klassen bleiben bestehen.
export function purgeAll(db) {
  tx(db, () => {
    db.exec(`
      DELETE FROM results;
      DELETE FROM test_attempts;
      DELETE FROM assignments;
      DELETE FROM key_stats;
      DELETE FROM course_progress;
      DELETE FROM error_pairs;
      DELETE FROM error_words;
      DELETE FROM badges;
      UPDATE users SET xp = 0;
    `);
  });
  console.log(`[${new Date().toISOString()}] Ergebnisse zum Schuljahresende gelöscht.`);
}
