import crypto from 'node:crypto';

const SESSION_DAYS = 30;
export const COOKIE = 'qn_session';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(salt, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

export function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    Date.now() + SESSION_DAYS * 864e5
  );
  return token;
}

export function sessionUser(db, token) {
  if (!token) return null;
  return (
    db
      .prepare(
        `SELECT u.id, u.role, u.username, u.display_name, u.class_id, u.onboarding_done, u.prefs, u.xp
         FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?`
      )
      .get(token, Date.now()) || null
  );
}

export function cookieOptions(secure) {
  return { httpOnly: true, sameSite: 'strict', secure, maxAge: SESSION_DAYS * 864e5, path: '/' };
}

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
