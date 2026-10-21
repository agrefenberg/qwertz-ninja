import { append, errorBox, formData, h, passwordInput, post } from '../ui.js';
import { route, state } from '../app.js';

const VIDIS_ERRORS = {
  'nicht-eingerichtet': 'Die Anmeldung über VIDIS ist hier nicht eingerichtet.',
  abgebrochen: 'Die Anmeldung über VIDIS wurde abgebrochen.',
  abgelaufen: 'Die Anmeldung hat zu lange gedauert. Bitte noch einmal versuchen.',
  fehler: 'Die Anmeldung über VIDIS hat nicht geklappt. Bitte später noch einmal versuchen.',
  rolle: 'Mit dieser Rolle ist keine Anmeldung möglich. QWERTZ Ninja ist für Lehrkräfte und Schüler gedacht.',
  schule: 'Deine Schule ist bei QWERTZ Ninja nicht angemeldet. Bitte wende dich an die Schulleitung.',
  avv: 'Deine Schule ist noch nicht freigeschaltet. Bitte wende dich an die Schulleitung.',
};

export function loginView(app) {
  // Fehlermeldung nach der Rückkehr von VIDIS (?vidis=…) anzeigen und aus der Adresse entfernen.
  const vidisError = new URLSearchParams(location.search).get('vidis');
  if (vidisError) history.replaceState(null, '', location.pathname + location.hash);
  const form = h(
    'form.card.narrow',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        const showError = errorBox(form);
        try {
          await post('/api/login', formData(form));
          state.me = null;
          location.hash = '#/';
          route();
        } catch (err) {
          showError(err.message);
        }
      },
    },
    h('img.login-ninja', { src: '/img/ninja.svg', alt: '' }),
    h('h1', 'Anmelden'),
    h('label', 'Benutzername', h('input', { name: 'username', autocomplete: 'username', required: true, autofocus: true, autocapitalize: 'off' })),
    h('label', 'Passwort', passwordInput({ name: 'password', autocomplete: 'current-password', required: true })),
    h('button.primary', { type: 'submit' }, 'Anmelden'),
    state.setup?.vidis
      ? [h('div.or-line', 'oder'), h('a.button.vidis-login', { href: '/api/vidis/login' }, 'Anmelden mit VIDIS (Schul-Login)')]
      : null,
    h(
      'p.muted.small',
      state.setup?.vidis ? 'Über VIDIS meldest du dich mit dem Konto deiner Schule an. Sonst bekommst du deine Zugangsdaten von deiner Lehrkraft. ' : 'Deine Zugangsdaten bekommst du von deiner Lehrkraft. ',
      h('a', { href: '#/datenschutz' }, 'Datenschutz')
    )
  );
  app.replaceChildren(form);
  if (vidisError) errorBox(form)(VIDIS_ERRORS[vidisError] || VIDIS_ERRORS.fehler);
}

export function setupView(app) {
  const form = h(
    'form.card.narrow',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        const showError = errorBox(form);
        const d = formData(form);
        if (d.password !== d.password2) return showError('Die Passwörter stimmen nicht überein.');
        try {
          await post('/api/setup', d);
          await post('/api/login', { username: d.username, password: d.password });
          state.setup = null;
          state.me = null;
          location.hash = '#/';
          route();
        } catch (err) {
          showError(err.message);
        }
      },
    },
    h('h1', 'Einrichtung'),
    h('p', 'Willkommen bei QWERTZ Ninja. Wie soll diese Installation genutzt werden?'),
    h(
      'div.mode-choice',
      h('label', h('input', { type: 'radio', name: 'mode', value: 'single', checked: true, onchange: () => setMode('single') }), h('span', h('b', 'Für eine Schule'), 'Der Normalfall, z. B. auf dem Raspberry Pi in der Schule. Du bist Admin dieser Schule.')),
      h('label', h('input', { type: 'radio', name: 'mode', value: 'multi', onchange: () => setMode('multi') }), h('span', h('b', 'Für mehrere Schulen'), 'Du betreibst QWERTZ Ninja als Angebot für mehrere Schulen, legst sie an und schließt mit jeder einen AVV ab.'))
    ),
    h('label', nameLabel, h('input', { name: 'schoolName', required: true, maxlength: 120 })),
    h('label', 'Benutzername (Admin)', h('input', { name: 'username', required: true, minlength: 3, maxlength: 40, autocapitalize: 'off' })),
    h('label', 'Passwort (mindestens 10 Zeichen)', passwordInput({ name: 'password', required: true, minlength: 10, autocomplete: 'new-password' })),
    h('label', 'Passwort wiederholen', passwordInput({ name: 'password2', required: true, minlength: 10, autocomplete: 'new-password' })),
    h('button.primary', { type: 'submit' }, 'Einrichten')
  );
  app.replaceChildren(form);
}
const nameLabel = h('span', 'Name der Schule');
function setMode(mode) {
  nameLabel.textContent = mode === 'multi' ? 'Name des Angebots (z. B. „QWERTZ Ninja für Schulen“)' : 'Name der Schule';
}

export function privacyView(app) {
  const note = state.setup?.privacyNote;
  app.replaceChildren(
    h(
      'article.card',
      h('h1', 'Datenschutz'),
      state.setup?.mode === 'multi'
        ? h('p', 'Verantwortlich für deine Daten ist deine Schule. QWERTZ Ninja verarbeitet sie in ihrem Auftrag auf Grundlage eines Vertrags zur Auftragsverarbeitung. Fragen zum Datenschutz beantwortet deine Schule.')
        : note
          ? h('div.prewrap', note)
          : h('p.muted', 'Die Schule hat noch keinen Datenschutzhinweis hinterlegt.'),
      h('h2', 'Was QWERTZ Ninja speichert'),
      h(
        'ul',
        h('li', 'Für Schülerinnen und Schüler nur ein Pseudonym, einen Benutzernamen und das verschlüsselte Passwort. Keine Namen, keine E-Mail-Adressen.'),
        state.setup?.vidis ? h('li', 'Bei Anmeldung über VIDIS: eine pseudonyme Kennung, die Rolle und die Schulkennung, bei Lehrkräften gegebenenfalls der Name.') : null,
        h('li', 'Übungs- und Testergebnisse (Anschläge, Fehler, Dauer) sowie Trefferquoten pro Taste.'),
        h('li', 'Ein technisch notwendiges Anmelde-Cookie. Keine Tracking-Cookies, keine externen Dienste, keine Schriftarten oder Skripte von Dritten.'),
        h('li', 'Alle Ergebnisse werden automatisch zum Schuljahresende gelöscht.')
      ),
      h('p', h('a', { href: '#/' }, 'Zurück'))
    )
  );
}
