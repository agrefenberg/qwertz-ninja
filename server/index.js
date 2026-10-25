import { openDb } from './db.js';
import { createApp } from './app.js';
import { purgeIfDue } from './retention.js';
import { vidisConfigFromEnv } from './vidis.js';

const PORT = Number(process.env.PORT || 3000);
const DB_FILE = process.env.DB_FILE || './data/qwertz-ninja.sqlite';
// Hinter einem HTTPS-Proxy sollten Cookies nur über HTTPS gesendet werden.
const SECURE_COOKIES = process.env.SECURE_COOKIES === '1';

const db = openDb(DB_FILE);
purgeIfDue(db);
setInterval(() => purgeIfDue(db), 3600e3).unref();

createApp(db, {
  secureCookies: SECURE_COOKIES,
  vidis: vidisConfigFromEnv(),
  // Hinter Caddy (docker-compose.https.yml) steht der Proxy einen Hop entfernt.
  trustProxy: process.env.TRUST_PROXY ? (/^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY) : 'loopback',
  setupToken: process.env.QN_SETUP_TOKEN || '',
  allowDemo: !SECURE_COOKIES || process.env.QN_ALLOW_DEMO === '1',
}).listen(PORT, () => {
  console.log(`QWERTZ Ninja läuft auf http://localhost:${PORT}`);
});
