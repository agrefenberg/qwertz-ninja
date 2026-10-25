// Anmeldung über VIDIS (Vermittlungsdienst für das digitale Identitätsmanagement in Schulen) per OpenID Connect.
// VIDIS liefert ein Pseudonym (sub), die Rolle (z. B. LERN, LEHR, LEIT), die Schulkennung(en) und das Bundesland.
// Angemeldet wird nur, wer zu einer beim Betreiber registrierten Schule mit unterschriebenem AVV gehört.
//
// Einstellungen (Umgebungsvariablen):
//   QN_VIDIS_ISSUER         z. B. https://aai-test.vidis.schule/auth/realms/vidis (Testsystem)
//   QN_VIDIS_CLIENT_ID      von der FWU vergeben
//   QN_VIDIS_CLIENT_SECRET  von der FWU vergeben
//   QN_PUBLIC_URL           öffentliche Adresse, z. B. https://qwertz.example.de
import crypto from 'node:crypto';
import { COOKIE, cookieOptions, createSession, generateUsername } from './auth.js';
import { isMulti } from './db.js';
import { normalizeSchoolCode } from './operator.js';

const STATE_MS = 10 * 60 * 1000;
const BROWSER_COOKIE = 'qn_oidc';

export function vidisConfigFromEnv(env = process.env) {
  const issuer = (env.QN_VIDIS_ISSUER || '').replace(/\/+$/, '');
  const publicUrl = (env.QN_PUBLIC_URL || (env.QN_DOMAIN ? `https://${env.QN_DOMAIN}` : '')).replace(/\/+$/, '');
  if (!issuer || !env.QN_VIDIS_CLIENT_ID || !env.QN_VIDIS_CLIENT_SECRET || !publicUrl) return null;
  return {
    issuer,
    clientId: env.QN_VIDIS_CLIENT_ID,
    clientSecret: env.QN_VIDIS_CLIENT_SECRET,
    publicUrl,
    redirectUri: `${publicUrl}/api/vidis/callback`,
  };
}

export const vidisConfigured = (config) => !!config?.issuer;

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const randomToken = () => b64url(crypto.randomBytes(32));

// Rollen aus VIDIS. Eltern und sonstige Rollen haben keinen Zugang.
function roleFrom(claim) {
  const roles = (Array.isArray(claim) ? claim : [claim]).map((r) => String(r || '').toUpperCase());
  if (roles.some((r) => r === 'LEHR' || r === 'LEIT')) return 'teacher';
  if (roles.includes('LERN')) return 'student';
  return null;
}

export function vidisRoutes(app, db, { config, secureCookies, HttpError, schoolById, schoolActive, fetchImpl = fetch }) {
  if (!vidisConfigured(config)) {
    app.get('/api/vidis/login', (req, res) => res.redirect('/?vidis=nicht-eingerichtet'));
    return { logoutUrl: async () => null };
  }

  let discovery = null;
  let discoveredAt = 0;
  let jwks = null;
  async function meta() {
    if (!discovery || Date.now() - discoveredAt > 3600e3) {
      const r = await fetchImpl(`${config.issuer}/.well-known/openid-configuration`);
      if (!r.ok) throw new Error(`VIDIS-Konfiguration nicht abrufbar (${r.status})`);
      discovery = await r.json();
      discoveredAt = Date.now();
      jwks = null;
    }
    return discovery;
  }
  async function keyFor(kid) {
    for (let round = 0; round < 2; round++) {
      if (!jwks || round === 1) {
        const r = await fetchImpl((await meta()).jwks_uri);
        if (!r.ok) throw new Error(`VIDIS-Schlüssel nicht abrufbar (${r.status})`);
        jwks = (await r.json()).keys || [];
      }
      const jwk = jwks.find((k) => (kid ? k.kid === kid : true) && (k.use || 'sig') === 'sig');
      if (jwk) return crypto.createPublicKey({ key: jwk, format: 'jwk' });
    }
    throw new Error('Unbekannter Signaturschlüssel im ID-Token');
  }

  async function verifyIdToken(idToken, nonce) {
    const parts = String(idToken).split('.');
    if (parts.length !== 3) throw new Error('ID-Token ist ungültig');
    const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
    const algs = { RS256: ['sha256', {}], RS384: ['sha384', {}], RS512: ['sha512', {}], PS256: ['sha256', { padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }], ES256: ['sha256', { dsaEncoding: 'ieee-p1363' }] };
    const alg = algs[header.alg];
    if (!alg) throw new Error(`Signaturverfahren ${header.alg} wird nicht unterstützt`);
    const key = await keyFor(header.kid);
    const ok = crypto.verify(alg[0], Buffer.from(`${parts[0]}.${parts[1]}`), { key, ...alg[1] }, Buffer.from(parts[2], 'base64url'));
    if (!ok) throw new Error('Signatur des ID-Tokens ist ungültig');
    const m = await meta();
    const now = Date.now() / 1000;
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== m.issuer) throw new Error('ID-Token stammt nicht von VIDIS');
    if (!aud.includes(config.clientId)) throw new Error('ID-Token ist nicht für QWERTZ Ninja ausgestellt');
    if (typeof claims.exp !== 'number' || claims.exp < now - 60) throw new Error('ID-Token ist abgelaufen');
    if (claims.nonce !== nonce) throw new Error('ID-Token passt nicht zur Anmeldung');
    return claims;
  }

  app.get('/api/vidis/login', async (req, res) => {
    const m = await meta();
    const state = randomToken();
    const nonce = randomToken();
    const verifier = randomToken();
    const browser = randomToken();
    db.prepare('DELETE FROM oidc_states WHERE created_at < ?').run(Date.now() - STATE_MS);
    db.prepare('INSERT INTO oidc_states (state, nonce, verifier, browser, created_at) VALUES (?, ?, ?, ?, ?)').run(state, nonce, verifier, browser, Date.now());
    // SameSite=Lax, damit das Cookie bei der Rückleitung von VIDIS mitgeschickt wird.
    res.cookie(BROWSER_COOKIE, browser, { httpOnly: true, sameSite: 'lax', secure: secureCookies, maxAge: STATE_MS, path: '/api/vidis' });
    const url = new URL(m.authorization_endpoint);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: 'openid',
      state,
      nonce,
      code_challenge: b64url(crypto.createHash('sha256').update(verifier).digest()),
      code_challenge_method: 'S256',
    }).toString();
    // Vorauswahl des Identitätsanbieters (Deeplink) unverändert weiterreichen.
    for (const p of ['vidis_idp_hint', 'kc_idp_hint']) if (typeof req.query[p] === 'string') url.searchParams.set(p, req.query[p]);
    res.redirect(url.toString());
  });

  app.get('/api/vidis/callback', async (req, res) => {
    const fail = (code, err) => {
      if (err) console.error('VIDIS-Anmeldung fehlgeschlagen:', err.message);
      res.redirect(`/?vidis=${code}`);
    };
    const cookies = Object.fromEntries(String(req.headers.cookie || '').split(';').map((c) => c.trim().split('=').map(decodeURIComponent)));
    res.clearCookie(BROWSER_COOKIE, { path: '/api/vidis' });
    if (req.query.error) return fail('abgebrochen');
    const row = typeof req.query.state === 'string' && db.prepare('SELECT * FROM oidc_states WHERE state = ?').get(req.query.state);
    if (row) db.prepare('DELETE FROM oidc_states WHERE state = ?').run(row.state);
    if (!row || row.created_at < Date.now() - STATE_MS || cookies[BROWSER_COOKIE] !== row.browser || typeof req.query.code !== 'string') {
      return fail('abgelaufen');
    }

    let claims;
    let idToken;
    try {
      const m = await meta();
      const tokenRes = await fetchImpl(m.token_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.clientSecret)}`).toString('base64')}`,
        },
        body: new URLSearchParams({ grant_type: 'authorization_code', code: req.query.code, redirect_uri: config.redirectUri, code_verifier: row.verifier }).toString(),
      });
      if (!tokenRes.ok) throw new Error(`Token-Abruf: ${tokenRes.status}`);
      const tokens = await tokenRes.json();
      idToken = tokens.id_token;
      claims = await verifyIdToken(idToken, row.nonce);
      if (m.userinfo_endpoint && tokens.access_token) {
        const ui = await fetchImpl(m.userinfo_endpoint, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
        if (ui.ok) {
          const info = await ui.json();
          if (info.sub === claims.sub) claims = { ...claims, ...info };
        }
      }
    } catch (err) {
      return fail('fehler', err);
    }

    const role = roleFrom(claims.rolle);
    if (!role) return fail('rolle');
    const codes = (Array.isArray(claims.schulkennung) ? claims.schulkennung : [claims.schulkennung]).map(normalizeSchoolCode).filter(Boolean);
    const school = codes.length
      ? db.prepare(`SELECT * FROM schools WHERE school_code IN (${codes.map(() => '?').join(',')}) ORDER BY id LIMIT 1`).get(...codes)
      : null;
    if (!isMulti(db) || !school) return fail('schule');
    if (!schoolActive(school)) return fail('avv');

    const externalId = `vidis:${claims.sub}`;
    let user = db.prepare('SELECT * FROM users WHERE external_id = ?').get(externalId);
    if (user && user.role !== role && user.role !== 'admin') {
      // Rolle hat sich geändert (z. B. Referendarin war vorher Schülerin): altes Konto nicht weiterverwenden.
      return fail('rolle');
    }
    if (user) {
      if (user.school_id !== school.id) {
        db.prepare('UPDATE users SET school_id = ?, class_id = NULL WHERE id = ?').run(school.id, user.id);
      }
    } else {
      let username;
      let displayName;
      if (role === 'student') {
        username = generateUsername(db, 'vidis');
        const [, animal, num] = username.split('-');
        displayName = `${animal[0].toUpperCase()}${animal.slice(1)} ${num}`;
      } else {
        do username = `vidis-${crypto.randomBytes(3).toString('hex')}`;
        while (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username));
        // Vor- und Nachname aus VIDIS werden bewusst nicht gespeichert. Die Lehrkraft wählt unter „Konto“
        // einen Anzeigenamen.
        displayName = 'Lehrkraft';
      }
      const r = db
        .prepare('INSERT INTO users (role, username, display_name, password_hash, school_id, external_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(role, username, displayName, '!', school.id, externalId, Date.now());
      user = { id: Number(r.lastInsertRowid) };
    }
    res.cookie(COOKIE, createSession(db, user.id, idToken), cookieOptions(secureCookies, role));
    res.redirect('/');
  });

  // Abmelden auch bei VIDIS (Pflicht laut Anbindungsvorgaben).
  async function logoutUrl(idToken) {
    try {
      const m = await meta();
      if (!m.end_session_endpoint) return null;
      const url = new URL(m.end_session_endpoint);
      url.searchParams.set('id_token_hint', idToken);
      url.searchParams.set('post_logout_redirect_uri', `${config.publicUrl}/`);
      url.searchParams.set('client_id', config.clientId);
      return url.toString();
    } catch {
      return null;
    }
  }
  return { logoutUrl };
}
