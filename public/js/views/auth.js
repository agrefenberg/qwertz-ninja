import { append, errorBox, formData, h, post } from '../ui.js';
import { route, state } from '../app.js';

export function loginView(app) {
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
    h('label', 'Passwort', h('input', { name: 'password', type: 'password', autocomplete: 'current-password', required: true })),
    h('button.primary', { type: 'submit' }, 'Anmelden'),
    h('p.muted.small', 'Deine Zugangsdaten bekommst du von deiner Lehrkraft. ', h('a', { href: '#/datenschutz' }, 'Datenschutz'))
  );
  app.replaceChildren(form);
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
    h('p', 'Willkommen bei QWERTZ Ninja. Lege zuerst das Admin-Konto für diese Schule an.'),
    h('label', 'Name der Schule', h('input', { name: 'schoolName', required: true, maxlength: 120 })),
    h('label', 'Benutzername (Admin)', h('input', { name: 'username', required: true, minlength: 3, maxlength: 40, autocapitalize: 'off' })),
    h('label', 'Passwort (mindestens 10 Zeichen)', h('input', { name: 'password', type: 'password', required: true, minlength: 10, autocomplete: 'new-password' })),
    h('label', 'Passwort wiederholen', h('input', { name: 'password2', type: 'password', required: true, minlength: 10, autocomplete: 'new-password' })),
    h('button.primary', { type: 'submit' }, 'Einrichten')
  );
  app.replaceChildren(form);
}

export function privacyView(app) {
  const note = state.setup?.privacyNote;
  app.replaceChildren(
    h(
      'article.card',
      h('h1', 'Datenschutz'),
      note ? h('div.prewrap', note) : h('p.muted', 'Die Schule hat noch keinen Datenschutzhinweis hinterlegt.'),
      h('h2', 'Was QWERTZ Ninja speichert'),
      h(
        'ul',
        h('li', 'Für Schülerinnen und Schüler nur ein Pseudonym, einen Benutzernamen und das verschlüsselte Passwort. Keine Namen, keine E-Mail-Adressen.'),
        h('li', 'Übungs- und Testergebnisse (Anschläge, Fehler, Dauer) sowie Trefferquoten pro Taste.'),
        h('li', 'Ein technisch notwendiges Anmelde-Cookie. Keine Tracking-Cookies, keine externen Dienste, keine Schriftarten oder Skripte von Dritten.'),
        h('li', 'Alle Ergebnisse werden automatisch zum Schuljahresende gelöscht.')
      ),
      h('p', h('a', { href: '#/' }, 'Zurück'))
    )
  );
}
