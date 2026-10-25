import crypto from 'node:crypto';

// Eine Anmeldung gilt höchstens 12 Stunden (auch an geteilten Schulrechnern). Schülerinnen und Schüler
// bekommen ein Sitzungs-Cookie, das beim Schließen des Browsers verfällt.
const SESSION_MS = 12 * 3600 * 1000;
export const COOKIE = 'qn_session';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

// Asynchron rechnet scrypt im Thread-Pool von Node. Viele gleichzeitige Anmeldungen zu Stundenbeginn
// blockieren dann nicht den ganzen Server.
const scryptAsync = (password, salt, len) =>
  new Promise((resolve, reject) => crypto.scrypt(password, salt, len, (err, key) => (err ? reject(err) : resolve(key))));

export async function hashPasswordAsync(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scryptAsync(password, salt, 32);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPasswordAsync(password, stored) {
  const [scheme, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

export function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(salt, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

export function createSession(db, userId, idToken = null) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token, user_id, expires_at, id_token) VALUES (?, ?, ?, ?)').run(
    token,
    userId,
    Date.now() + SESSION_MS,
    idToken
  );
  return token;
}

// Beitrittscode für eine Klasse, z. B. "KF7-M2P" (ohne verwechselbare Zeichen).
export function generateJoinCode(db) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    let c = '';
    for (let i = 0; i < 6; i++) c += pick(chars);
    c = `${c.slice(0, 3)}-${c.slice(3)}`;
    if (!db.prepare('SELECT 1 FROM classes WHERE join_code = ?').get(c)) return c;
  }
}

export function sessionUser(db, token) {
  if (!token) return null;
  return (
    db
      .prepare(
        `SELECT u.id, u.role, u.username, u.display_name, u.class_id, u.onboarding_done, u.prefs, u.xp, u.school_id, u.external_id, s.preview_class_id
         FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?`
      )
      .get(token, Date.now()) || null
  );
}

export function cookieOptions(secure, role = null) {
  const base = { httpOnly: true, sameSite: 'strict', secure, path: '/' };
  return role === 'student' ? base : { ...base, maxAge: SESSION_MS };
}

// Für unbekannte Benutzernamen wird gegen diesen Hash geprüft, damit die Antwortzeit nicht verrät,
// ob es einen Namen gibt.
export const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString('base64'));

// Leicht vorlesbare Zugangsdaten ohne verwechselbare Zeichen (kein l/1/I, 0/O).
const CONS = 'bdfgkmnprstvwz';
const VOW = 'aeiou';
const ANIMALS = [
  'fuchs', 'dachs', 'luchs', 'otter', 'falke', 'eule', 'biber', 'hirsch', 'wolf', 'igel',
  'adler', 'reh', 'marder', 'elch', 'gams', 'kranich', 'storch', 'hase', 'wiesel', 'specht',
  'bussard', 'murmel', 'tiger', 'panda', 'koala', 'pinguin', 'robbe', 'delfin', 'lama', 'zebra',
];

function pick(s) {
  return s[crypto.randomInt(s.length)];
}

export function generatePassword() {
  let p = '';
  for (let i = 0; i < 3; i++) p += pick(CONS) + pick(VOW);
  return `${p}${crypto.randomInt(10, 100)}`;
}

// Benutzername aus Klassenkürzel, Tier und Zahl, z. B. "10b-fuchs-37".
export function generateUsername(db, classSlug) {
  for (;;) {
    const name = `${classSlug}-${pick(ANIMALS)}-${crypto.randomInt(10, 100)}`;
    if (!db.prepare('SELECT 1 FROM users WHERE username = ?').get(name)) return name;
  }
}

export function slugify(s) {
  return (
    String(s)
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 8) || 'klasse'
  );
}
