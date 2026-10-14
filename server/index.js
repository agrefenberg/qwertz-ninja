import { openDb } from './db.js';
import { createApp } from './app.js';
import { purgeIfDue } from './retention.js';

const PORT = Number(process.env.PORT || 3000);
const DB_FILE = process.env.DB_FILE || './data/qwertz-ninja.sqlite';
// Hinter einem HTTPS-Proxy sollten Cookies nur über HTTPS gesendet werden.
const SECURE_COOKIES = process.env.SECURE_COOKIES === '1';

const db = openDb(DB_FILE);
purgeIfDue(db);
setInterval(() => purgeIfDue(db), 3600e3).unref();

createApp(db, { secureCookies: SECURE_COOKIES }).listen(PORT, () => {
  console.log(`QWERTZ Ninja läuft auf http://localhost:${PORT}`);
});
