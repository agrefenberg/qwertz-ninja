// Sicherung der Datenbank im laufenden Betrieb.
//   node server/backup.js [Zielordner] [Anzahl aufbewahren]
// Legt eine konsistente Kopie an (VACUUM INTO) und löscht ältere Sicherungen.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const dbFile = process.env.DB_FILE || './data/qwertz-ninja.sqlite';
const dir = process.argv[2] || path.join(path.dirname(dbFile), 'sicherung');
const keep = Number(process.argv[3] || 14);

if (!fs.existsSync(dbFile)) {
  console.error(`Keine Datenbank gefunden: ${dbFile}`);
  process.exit(1);
}
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
const target = path.join(dir, `qwertz-ninja-${stamp}.sqlite`);
fs.rmSync(target, { force: true });

const db = new DatabaseSync(dbFile, { readOnly: true });
db.prepare('VACUUM INTO ?').run(target);
db.close();

const old = fs
  .readdirSync(dir)
  .filter((f) => /^qwertz-ninja-\d{8}-\d{4}\.sqlite$/.test(f))
  .sort()
  .slice(0, -keep);
for (const f of old) fs.rmSync(path.join(dir, f));

console.log(`Sicherung erstellt: ${target} (${old.length} alte gelöscht)`);
