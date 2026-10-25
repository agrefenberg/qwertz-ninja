// Mehrschulbetrieb: Der Betreiber legt Schulen an, verwaltet deren Admin-Konten und den AVV.
// Leistungsdaten der Schulen sieht er hier nicht.
import { getSetting, isMulti, setSetting } from './db.js';
import { generatePassword, hashPassword } from './auth.js';
import { writeAvvPdf } from './avv-pdf.js';
import { vidisConfigured } from './vidis.js';

const OPERATOR_FIELDS = {
  name: 'operator_name',
  address: 'operator_address',
  contact: 'operator_contact',
  dpo: 'operator_dpo',
  location: 'operator_location',
  subprocessors: 'operator_subprocessors',
  // Pflichtangaben für den Betrieb im Internet, auf der Anmeldeseite verlinkt
  imprint: 'operator_imprint',
  privacy: 'operator_privacy',
};
const FIELD_MAX = { imprint: 3000, privacy: 10000 };

export function operatorInfo(db) {
  return Object.fromEntries(Object.entries(OPERATOR_FIELDS).map(([k, key]) => [k, getSetting(db, key, '')]));
}

// Schulkennung so speichern, wie VIDIS sie liefert; Groß-/Kleinschreibung und Leerzeichen spielen keine Rolle.
export const normalizeSchoolCode = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, '');

export function operatorRoutes(app, db, { auth, bad, notFound, str, int, tx, schoolById, secureCookies, vidis }) {
  const multiOnly = (req, res, next) => (isMulti(db) ? next() : next(notFound()));
  const op = [multiOnly, auth('operator')];

  const schoolFields = (b) => {
    const code = normalizeSchoolCode(b.schoolCode);
    if (code && !/^[A-Z0-9._-]{2,40}$/.test(code)) throw bad('Die Schulkennung darf nur Buchstaben, Ziffern, Punkt, Binde- und Unterstrich enthalten.');
    const opt = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    return {
      name: str(b.name, { max: 120, name: 'Schulname' }),
      school_code: code || null,
      address: opt(b.address, 300),
      head: opt(b.head, 120),
      contact: opt(b.contact, 200),
    };
  };
  const codeTaken = (code, exceptId = 0) => code && db.prepare('SELECT 1 FROM schools WHERE school_code = ? AND id != ?').get(code, exceptId);
  const newAdmin = (schoolId, b) => {
    const username = str(b.adminUsername, { max: 40, min: 3, name: 'Benutzername des Schul-Admins' });
    if (!/^[\w.-]+$/.test(username)) throw bad('Benutzername darf nur Buchstaben, Ziffern, Punkt, Bindestrich und Unterstrich enthalten.');
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw bad('Dieser Benutzername ist schon vergeben.');
    const password = generatePassword() + generatePassword();
    db.prepare("INSERT INTO users (role, username, display_name, password_hash, school_id, created_at) VALUES ('admin', ?, ?, ?, ?, ?)").run(
      username,
      typeof b.adminName === 'string' && b.adminName.trim() ? b.adminName.trim().slice(0, 80) : username,
      hashPassword(password),
      schoolId,
      Date.now()
    );
    return { username, password };
  };
  const ownSchool = (req) => {
    const s = schoolById(int(req.params.id));
    if (!s) throw notFound();
    return s;
  };
  const avvData = (school) => ({ school, operator: operatorInfo(db), vidis: vidisConfigured(vidis), https: secureCookies });

  app.get('/api/operator/overview', ...op, (req, res) => {
    const schools = db
      .prepare(
        `SELECT s.id, s.name, s.school_code, s.avv_signed_at, s.created_at,
           (SELECT COUNT(*) FROM users u WHERE u.school_id = s.id AND u.role = 'teacher') AS teachers,
           (SELECT COUNT(*) FROM users u WHERE u.school_id = s.id AND u.role = 'student') AS students
         FROM schools s ORDER BY s.name`
      )
      .all();
    res.json({
      operator: operatorInfo(db),
      schools,
      vidis: { configured: vidisConfigured(vidis), redirectUri: vidis?.redirectUri || null, issuer: vidis?.issuer || null },
    });
  });

  app.put('/api/operator/settings', ...op, (req, res) => {
    const b = req.body;
    setSetting(db, 'operator_name', str(b.name, { max: 120, name: 'Name des Angebots' }));
    for (const [k, key] of Object.entries(OPERATOR_FIELDS)) {
      if (k !== 'name') setSetting(db, key, typeof b[k] === 'string' ? b[k].trim().slice(0, FIELD_MAX[k] || 1000) : '');
    }
    res.json(operatorInfo(db));
  });

  app.post('/api/operator/schools', ...op, (req, res) => {
    const f = schoolFields(req.body);
    if (codeTaken(f.school_code)) throw bad('Diese Schulkennung ist schon vergeben.');
    const out = tx(db, () => {
      const id = Number(
        db
          .prepare('INSERT INTO schools (name, school_code, address, head, contact, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(f.name, f.school_code, f.address, f.head, f.contact, Date.now()).lastInsertRowid
      );
      return { id, admin: newAdmin(id, req.body) };
    });
    res.json(out);
  });

  app.get('/api/operator/schools/:id', ...op, (req, res) => {
    const s = ownSchool(req);
    const admins = db.prepare("SELECT id, username, display_name FROM users WHERE school_id = ? AND role = 'admin' ORDER BY username").all(s.id);
    res.json({ ...s, admins });
  });

  app.put('/api/operator/schools/:id', ...op, (req, res) => {
    const s = ownSchool(req);
    const f = schoolFields(req.body);
    if (codeTaken(f.school_code, s.id)) throw bad('Diese Schulkennung ist schon vergeben.');
    db.prepare('UPDATE schools SET name = ?, school_code = ?, address = ?, head = ?, contact = ? WHERE id = ?').run(f.name, f.school_code, f.address, f.head, f.contact, s.id);
    res.json({ ok: true });
  });

  // AVV als unterschrieben markieren (Datum) oder die Markierung zurücknehmen.
  app.post('/api/operator/schools/:id/avv', ...op, (req, res) => {
    const s = ownSchool(req);
    let at = null;
    if (req.body.signedAt) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(req.body.signedAt));
      if (!m) throw bad('Datum bitte als JJJJ-MM-TT angeben.');
      at = new Date(+m[1], +m[2] - 1, +m[3], 12).getTime();
      if (Number.isNaN(at) || at > Date.now() + 864e5) throw bad('Das Datum ist ungültig.');
    }
    db.prepare('UPDATE schools SET avv_signed_at = ? WHERE id = ?').run(at, s.id);
    if (!at) db.prepare("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE school_id = ? AND role != 'admin')").run(s.id);
    res.json({ avvSignedAt: at });
  });

  app.post('/api/operator/schools/:id/admins', ...op, (req, res) => {
    const s = ownSchool(req);
    res.json(newAdmin(s.id, req.body));
  });

  app.post('/api/operator/schools/:id/admins/:userId/reset-password', ...op, (req, res) => {
    const s = ownSchool(req);
    const u = db.prepare("SELECT id, username FROM users WHERE id = ? AND school_id = ? AND role = 'admin'").get(int(req.params.userId), s.id);
    if (!u) throw notFound();
    const password = generatePassword() + generatePassword();
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), u.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    res.json({ username: u.username, password });
  });

  app.delete('/api/operator/schools/:id/admins/:userId', ...op, (req, res) => {
    const s = ownSchool(req);
    const n = db.prepare("SELECT COUNT(*) AS n FROM users WHERE school_id = ? AND role = 'admin'").get(s.id).n;
    if (n <= 1) throw bad('Jede Schule braucht mindestens ein Admin-Konto.');
    const r = db.prepare("DELETE FROM users WHERE id = ? AND school_id = ? AND role = 'admin'").run(int(req.params.userId), s.id);
    if (!r.changes) throw notFound();
    res.json({ ok: true });
  });

  // Schule mit allen Konten, Klassen und Ergebnissen löschen (z. B. am Vertragsende).
  app.delete('/api/operator/schools/:id', ...op, (req, res) => {
    const s = ownSchool(req);
    if (normalizeSchoolCode(req.query.confirm) !== normalizeSchoolCode(s.name)) throw bad('Zur Bestätigung bitte den Schulnamen angeben.');
    tx(db, () => {
      // Schülerkonten hängen an Klassen, Klassen an Lehrkräften: erst Schüler, dann alle übrigen Konten.
      db.prepare(
        "DELETE FROM users WHERE role = 'student' AND class_id IN (SELECT c.id FROM classes c JOIN users t ON t.id = c.teacher_id WHERE t.school_id = ?)"
      ).run(s.id);
      db.prepare('DELETE FROM users WHERE school_id = ?').run(s.id);
      db.prepare('DELETE FROM schools WHERE id = ?').run(s.id);
    });
    res.json({ ok: true });
  });

  app.get('/api/operator/schools/:id/avv.pdf', ...op, (req, res) => {
    const s = ownSchool(req);
    sendAvv(res, avvData(s));
  });

  // Die Schule selbst kann ihren AVV ebenfalls herunterladen.
  app.get('/api/admin/avv.pdf', multiOnly, auth('admin'), (req, res) => {
    sendAvv(res, avvData(schoolById(req.user.school_id)));
  });
}

function sendAvv(res, data) {
  const slug = data.school.name.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `attachment; filename="avv-${slug || 'schule'}.pdf"`);
  writeAvvPdf(res, data);
}
