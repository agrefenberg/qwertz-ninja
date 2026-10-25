// Setzt das Passwort eines Kontos neu, z. B. wenn ein Admin es vergessen hat.
//   PW=<neues Passwort> node server/passwort.js <Benutzername>
// Ohne PW wird ein Passwort erzeugt und ausgegeben. Alle Anmeldungen des Kontos werden beendet.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { hashPassword, generatePassword } from './auth.js';

const dbFile = process.env.DB_FILE || './data/qwertz-ninja.sqlite';
const username = process.argv[2];

if (!fs.existsSync(dbFile)) {
  console.error(`Keine Datenbank gefunden: ${dbFile}`);
  process.exit(1);
}
const db = new DatabaseSync(dbFile);
const accounts = () =>
  db
    .prepare("SELECT username, role FROM users WHERE role <> 'student' ORDER BY role, username")
    .all()
    .map((u) => `  ${u.username} (${u.role})`)
    .join('\n');

if (!username) {
  console.error(`Benutzername angeben. Vorhandene Konten:\n${accounts()}`);
  process.exit(1);
}
const user = db.prepare('SELECT id, username FROM users WHERE username = ? COLLATE NOCASE').get(username);
if (!user) {
  console.error(`Kein Konto „${username}“ gefunden. Vorhandene Konten:\n${accounts()}`);
  process.exit(1);
}
const generated = !process.env.PW;
const password = process.env.PW || generatePassword();
db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), user.id);
db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
db.close();

console.log(`Passwort für „${user.username}“ geändert.`);
if (generated) console.log(`Neues Passwort: ${password}`);
